"""국회·법제처 공식 API 결과를 대시보드용 sample-bills.json으로 저장한다."""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
import yaml
from bs4 import BeautifulSoup

KST = timezone(timedelta(hours=9))
ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "sample-bills.json"
KEYWORDS_FILE = ROOT / "bill_keywords.yaml"

ASSEMBLY_BASE = "https://open.assembly.go.kr/portal/openapi"
PENDING_API = "nwbqublzajtcqpdae"
SUMMARY_API = "BPMBILLSUMMARY"
SUMMARY_URL = "https://likms.assembly.go.kr/bill/bi/popup/billSummary.do"
LAW_SEARCH_URL = "https://www.law.go.kr/DRF/lawSearch.do"

ASSEMBLY_KEY = os.environ.get("ASSEMBLY_API_KEY", "").strip()
MOLEG_OC = os.environ.get("MOLEG_OC", "").strip()

STAGE_ORDER = ["접수", "소관위", "법사위", "본회의", "공포·시행"]

CATEGORY_AGENCY = {
    "공정거래법": "공정거래위원회",
    "하도급법": "공정거래위원회",
    "가맹사업법": "공정거래위원회",
    "대규모유통업법": "공정거래위원회",
    "대리점법": "공정거래위원회",
    "약관법": "공정거래위원회",
    "전자상거래법": "공정거래위원회",
    "표시광고법": "공정거래위원회",
    "소비자기본법": "공정거래위원회",
    "상생협력법": "중소벤처기업부",
    "자본시장법": "금융위원회",
    "건설산업기본법": "국토교통부",
    "행정조사기본법": "국무조정실",
    "상법": "법무부",
    "중대재해처벌법": "고용노동부",
    "민사소송법": "법무부",
    "조세특례제한법": "기획재정부",
    "집단소송": "법무부",
    "산업안전보건법": "고용노동부",
    "지속가능성·책임경영": "기후에너지환경부",
    "고용": "고용노동부",
    "탄소중립": "기후에너지환경부",
    "상속세·증여세": "기획재정부",
}


def request_json(url, params, retries=3):
    last_error = None
    for attempt in range(retries):
        try:
            response = requests.get(url, params=params, timeout=35)
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if attempt + 1 < retries:
                time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"API 호출 실패: {url} ({last_error})")


def assembly_rows(payload, service_id):
    blocks = payload.get(service_id)
    if blocks is None and len(payload) == 1:
        blocks = next(iter(payload.values()))
    if not isinstance(blocks, list):
        return []
    for block in blocks:
        if isinstance(block, dict) and isinstance(block.get("row"), list):
            return block["row"]
    return []


def load_tracking_rules():
    if not KEYWORDS_FILE.exists():
        raise RuntimeError("bill_keywords.yaml 파일이 없습니다.")
    loaded = yaml.safe_load(KEYWORDS_FILE.read_text(encoding="utf-8")) or {}
    mapping = loaded.get("keywords", loaded)
    if not isinstance(mapping, dict) or not mapping:
        raise RuntimeError("bill_keywords.yaml의 keywords 항목이 비어 있습니다.")
    numbers = loaded.get("bill_numbers", [])
    if not isinstance(numbers, list):
        raise RuntimeError("bill_keywords.yaml의 bill_numbers 항목은 목록이어야 합니다.")
    keywords = {str(key): str(value) for key, value in mapping.items()}
    bill_numbers = {re.sub(r"\D", "", str(value)) for value in numbers}
    return keywords, {value for value in bill_numbers if value}


def matched_category(title, keywords):
    for keyword, category in keywords.items():
        if keyword in title:
            return category
    return ""


def fetch_pending_bills(keywords, tracked_bill_numbers):
    if not ASSEMBLY_KEY:
        raise RuntimeError("GitHub Secret ASSEMBLY_API_KEY가 설정되지 않았습니다.")
    matched = {}
    for page in range(1, 301):
        payload = request_json(
            f"{ASSEMBLY_BASE}/{PENDING_API}",
            {"KEY": ASSEMBLY_KEY, "Type": "json", "pIndex": page, "pSize": 100},
        )
        rows = assembly_rows(payload, PENDING_API)
        if not rows:
            break
        for row in rows:
            title = str(row.get("BILL_NAME") or "").strip()
            category = matched_category(title, keywords)
            bill_id = str(row.get("BILL_ID") or "").strip()
            bill_no = re.sub(r"\D", "", str(row.get("BILL_NO") or ""))
            is_directly_tracked = bill_no in tracked_bill_numbers
            if bill_id and (category or is_directly_tracked):
                row["_CATEGORY"] = category or "직접선택"
                matched[bill_id] = row
        if len(rows) < 100:
            break
        time.sleep(0.08)
    return list(matched.values())


def derive_stage(row):
    law_result = str(row.get("LAW_PROC_RESULT_CD") or "")
    if law_result:
        return "본회의" if any(word in law_result for word in ("가결", "의결")) else "법사위"
    if row.get("LAW_PRESENT_DT"):
        return "법사위"
    if row.get("CMT_PROC_DT") or row.get("CMT_PROC_RESULT_CD"):
        result = str(row.get("CMT_PROC_RESULT_CD") or "")
        return "법사위" if any(word in result for word in ("가결", "의결")) else "소관위"
    if row.get("COMMITTEE_DT") or row.get("CMT_PRESENT_DT") or row.get("CURR_COMMITTEE"):
        return "소관위"
    return "접수"


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


SUMMARY_LEADING_CONNECTORS = re.compile(
    r"^(이에|그러나|따라서|그런데|이와\s*같이|이러한|또한|하지만|그래서|이와\s*관련(?:해서|하여)?)\s*[,，]?\s*"
)


def concise_summary(value):
    """불필요한 머리말과 잘린 문장을 제거하고 핵심 완결문 2개 이하로 정리한다."""
    text = str(value or "")
    text = re.sub(r"창닫기\s*(?:\[\s*\d+\s*\])?", " ", text, flags=re.I)
    text = re.sub(r"\[\s*\d{5,}\s*\]", " ", text)
    if re.search(r"제안이유\s*및\s*주요내용", text):
        text = re.split(r"제안이유\s*및\s*주요내용", text, maxsplit=1)[-1]
    text = re.sub(r"의안 상세정보|인쇄|창닫기", " ", text)
    text = re.sub(r"(?:\.{3,}|…+)", " ", text)
    text = clean_text(text)
    if not text or "확인 중입니다" in text:
        return "공식 제안이유 및 주요내용을 확인 중입니다."

    sentences = []
    for index, sentence in enumerate(re.split(r"(?<=[.!?])\s+", text)):
        sentence = SUMMARY_LEADING_CONNECTORS.sub("", clean_text(sentence))
        if len(sentence) >= 12 and re.search(r"[.!?]$", sentence):
            score = 0
            if re.search(r"개정|신설|도입|확대|강화|완화|개선|보호|지원|의무|금지|부과|마련", sentence):
                score += 4
            if re.search(r"문제|지적|우려|어려|부담|피해|한계|필요", sentence):
                score += 2
            if len(sentence) <= 100:
                score += 2
            if index == 0:
                score += 1
            sentences.append((score, index, sentence))

    if not sentences:
        return "공식 원문에서 완결된 주요내용을 확인 중입니다."
    selected = sorted(sentences, key=lambda row: (-row[0], len(row[2]), row[1]))[:2]
    return " ".join(row[2] for row in sorted(selected, key=lambda row: row[1]))


DAILY_COMPARE_FIELDS = {
    "title": "법안명",
    "billNo": "의안번호",
    "agency": "소관기관",
    "stage": "진행단계",
    "committee": "소관위원회",
    "proposer": "제안자",
    "change": "처리내용",
    "summary": "주요내용",
}


def daily_change_metadata(old, current, today):
    """직전 수집본과 비교해 오늘 발생한 변동을 표시한다."""
    if not old:
        fields = ["신규 확인"]
    else:
        fields = [
            label for key, label in DAILY_COMPARE_FIELDS.items()
            if clean_text(old.get(key)) != clean_text(current.get(key))
        ]

    if fields:
        return {
            "dailyChanged": True,
            "dailyChangedDate": today,
            "dailyChangeFields": fields,
        }

    # 오전 변동 표시는 같은 날 오후 재수집 후에도 유지한다.
    if old.get("dailyChanged") and old.get("dailyChangedDate") == today:
        return {
            "dailyChanged": True,
            "dailyChangedDate": today,
            "dailyChangeFields": old.get("dailyChangeFields") or ["세부내용"],
        }

    return {
        "dailyChanged": False,
        "dailyChangedDate": "",
        "dailyChangeFields": [],
    }


def summary_from_api_row(row):
    preferred_keys = (
        "BILL_SUMMARY", "PROPOSE_REASON", "MAJOR_CONTENTS", "SUMMARY",
        "BILL_CONTENTS", "CONTENTS", "제안이유및주요내용", "주요내용",
    )
    values = []
    for key in preferred_keys:
        value = clean_text(row.get(key))
        if value and value not in values:
            values.append(value)
    if not values:
        for key, raw_value in row.items():
            upper_key = str(key).upper()
            if any(word in upper_key for word in ("SUMMARY", "REASON", "CONTENT")):
                value = clean_text(raw_value)
                if len(value) >= 30 and value not in values:
                    values.append(value)
    return clean_text(" ".join(values))


def fetch_summary_api(bill_id, bill_no):
    if not ASSEMBLY_KEY:
        return ""
    queries = []
    if bill_id:
        queries.append({"BILL_ID": bill_id})
    normalized_no = re.sub(r"\D", "", str(bill_no or ""))
    if normalized_no:
        queries.append({"BILL_NO": normalized_no})
    for query in queries:
        try:
            payload = request_json(
                f"{ASSEMBLY_BASE}/{SUMMARY_API}",
                {
                    "KEY": ASSEMBLY_KEY, "Type": "json", "pIndex": 1,
                    "pSize": 5, "AGE": "22", **query,
                },
                retries=2,
            )
            for row in assembly_rows(payload, SUMMARY_API):
                text = summary_from_api_row(row)
                if text:
                    return text[:1200]
        except RuntimeError as exc:
            print(f"[안내] 주요내용 API 보완 조회 실패: {query} ({exc})")
    return ""


def fetch_summary(bill_id, bill_no=""):
    api_summary = fetch_summary_api(bill_id, bill_no)
    if api_summary:
        return concise_summary(api_summary)
    try:
        response = requests.get(SUMMARY_URL, params={"billId": bill_id}, timeout=20)
        response.raise_for_status()
        text = BeautifulSoup(response.text, "html.parser").get_text("\n", strip=True)
        for marker in ("제안이유 및 주요내용", "제안이유"):
            if marker in text:
                text = text.split(marker, 1)[1]
                break
        text = clean_text(text)
        text = re.sub(r"^(창닫기\s*)?(\[?\d{7}\]?\s*)?", "", text)
        text = re.sub(r"\s*(의안 상세정보|인쇄|창닫기)\s*$", "", text)
        return concise_summary(text)
    except requests.RequestException:
        return "공식 제안이유 및 주요내용을 확인 중입니다."


def load_previous():
    if not OUTPUT.exists():
        return {"mode": "official", "items": []}
    try:
        payload = json.loads(OUTPUT.read_text(encoding="utf-8"))
        return payload if payload.get("mode") == "official" else {"mode": "official", "items": []}
    except (OSError, ValueError):
        return {"mode": "official", "items": []}


def latest_by_key(items):
    result = {}
    for item in sorted(items, key=lambda row: (row.get("month", ""), row.get("changedDate", ""))):
        key = item.get("billId") or item.get("billNo") or item.get("title")
        if key:
            result[key] = item
    return result


def format_date(value):
    digits = re.sub(r"\D", "", str(value or ""))
    return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}" if len(digits) >= 8 else ""


def make_pending_item(row, old, month, today):
    bill_id = str(row.get("BILL_ID") or "")
    title = clean_text(row.get("BILL_NAME"))
    stage = derive_stage(row)
    previous_stage = old.get("stage", "-") if old else "-"
    if old and previous_stage != stage:
        change = f"{previous_stage} → {stage}"
        changed = True
        changed_date = today
    elif old and old.get("month") == month:
        change = old.get("change", "이번 달 변동 없음")
        changed = bool(old.get("changed"))
        changed_date = old.get("changedDate", today)
        previous_stage = old.get("previousStage", previous_stage)
    elif old:
        change = "이번 달 변동 없음"
        changed = False
        changed_date = today
    else:
        change = "이번 달 신규 확인"
        changed = True
        changed_date = today

    category = row.get("_CATEGORY", "")
    committee = clean_text(row.get("CURR_COMMITTEE")) or "위원회 배정 전"
    proposer = clean_text(row.get("PROPOSER") or row.get("RST_PROPOSER")) or "제안자 확인 중"
    agency = CATEGORY_AGENCY.get(category, committee)
    summary = concise_summary(old.get("summary", "")) if old else ""
    metadata_changed = bool(old) and any((
        clean_text(old.get("title")) != title,
        clean_text(old.get("stage")) != stage,
        clean_text(old.get("committee")) != committee,
        clean_text(old.get("proposer")) != proposer,
        clean_text(old.get("agency")) != agency,
    ))
    if not summary or "확인 중" in summary or metadata_changed:
        refreshed_summary = fetch_summary(bill_id, row.get("BILL_NO"))
        if refreshed_summary and "확인 중" not in refreshed_summary:
            summary = refreshed_summary

    item = {
        "month": month,
        "billId": bill_id,
        "title": title,
        "billNo": f"의안번호 {clean_text(row.get('BILL_NO'))}",
        "agency": agency,
        "committee": committee,
        "proposer": proposer,
        "stage": stage,
        "previousStage": previous_stage,
        "changed": changed,
        "changedDate": changed_date,
        "change": change,
        "summary": summary,
        "sourceUrl": row.get("LINK_URL") or f"{SUMMARY_URL}?billId={bill_id}",
    }
    item.update(daily_change_metadata(old, item, today))
    return item


def law_rows(payload):
    root = payload.get("LawSearch", payload)
    rows = root.get("law", []) if isinstance(root, dict) else []
    if isinstance(rows, dict):
        rows = [rows]
    return rows if isinstance(rows, list) else []


def fetch_promulgated_laws(keywords, month, today, old_index):
    if not MOLEG_OC:
        print("[안내] MOLEG_OC가 없어 법제처 공포 법령 조회는 건너뜁니다.")
        return []
    year, mon = month.split("-")
    start = f"{year}{mon}01"
    next_month = datetime(int(year), int(mon), 28, tzinfo=KST) + timedelta(days=4)
    end_date = next_month.replace(day=1) - timedelta(days=1)
    end = end_date.strftime("%Y%m%d")
    found = {}
    for keyword, category in keywords.items():
        payload = request_json(LAW_SEARCH_URL, {
            "OC": MOLEG_OC, "target": "law", "type": "JSON", "query": keyword,
            "ancYd": f"{start}~{end}", "display": 100, "sort": "ddes",
        })
        for row in law_rows(payload):
            title = clean_text(row.get("법령명한글"))
            promulgated = format_date(row.get("공포일자"))
            if not title or not promulgated.startswith(month):
                continue
            law_id = str(row.get("법령ID") or row.get("법령일련번호") or title)
            effective = format_date(row.get("시행일자"))
            item = {
                "month": month,
                "billId": f"law-{law_id}",
                "title": title,
                "billNo": f"법률 제{clean_text(row.get('공포번호'))}호",
                "agency": clean_text(row.get("소관부처명")) or CATEGORY_AGENCY.get(category, "법제처"),
                "committee": "공포 법령",
                "proposer": "정부 공포",
                "stage": "공포·시행",
                "previousStage": "본회의",
                "changed": True,
                "changedDate": promulgated or today,
                "change": f"{promulgated} 공포" + (f" · {effective} 시행" if effective else ""),
                "summary": f"{clean_text(row.get('제개정구분명')) or '제·개정'} 법령으로 법제처 국가법령정보에서 공식 확인됨.",
                "sourceUrl": "https://www.law.go.kr" + str(row.get("법령상세링크") or ""),
            }
            item.update(daily_change_metadata(old_index.get(item["billId"], {}), item, today))
            found[law_id] = item
        time.sleep(0.15)
    return list(found.values())


def main():
    now = datetime.now(KST)
    month = now.strftime("%Y-%m")
    today = now.strftime("%Y-%m-%d")
    keywords, tracked_bill_numbers = load_tracking_rules()
    previous = load_previous()
    old_items = previous.get("items", [])
    old_index = latest_by_key(old_items)

    pending_rows = fetch_pending_bills(keywords, tracked_bill_numbers)
    if not pending_rows:
        raise RuntimeError("국회 API가 계류 법안을 0건 반환했습니다. 기존 데이터를 보호하기 위해 저장을 중단합니다.")
    items = []
    for index, row in enumerate(pending_rows, 1):
        key = str(row.get("BILL_ID") or "")
        items.append(make_pending_item(row, old_index.get(key, {}), month, today))
        if index % 20 == 0:
            time.sleep(0.2)

    items.extend(fetch_promulgated_laws(keywords, month, today, old_index))
    current_keys = {
        item.get("billId") or item.get("billNo") or item.get("title")
        for item in items
    }
    # 계류 목록에서 빠진 대안·처리 법안도 즐겨찾기 상세조회에 계속 필요하다.
    # 같은 달의 기존 항목을 삭제하지 않고 보존해 제목·의안번호·제안자·주요내용이
    # '확인 중'으로 되돌아가는 문제를 막는다.
    carried_current = []
    for old_item in old_items:
        old_key = old_item.get("billId") or old_item.get("billNo") or old_item.get("title")
        if old_item.get("month") == month and old_key not in current_keys:
            preserved = dict(old_item)
            preserved.update({
                "dailyChanged": False,
                "dailyChangedDate": "",
                "dailyChangeFields": [],
            })
            carried_current.append(preserved)

    history = [item for item in old_items if item.get("month", "") < month]
    history = [item for item in history if item.get("month", "") >= (now - timedelta(days=370)).strftime("%Y-%m")]
    combined = history + sorted(carried_current + items, key=lambda item: (item["stage"], item["title"]))
    payload = {
        "mode": "official",
        "updatedAt": now.strftime("%Y-%m-%d %H:%M"),
        "items": combined,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"완료: 계류 법안 {len(pending_rows)}건, 공포 법령 {len(items) - len(pending_rows)}건")


if __name__ == "__main__":
    main()
