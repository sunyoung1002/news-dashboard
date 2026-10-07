"""국회·법제처 공식 API 결과를 대시보드용 sample-bills.json으로 저장한다."""
from __future__ import annotations

import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
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
ALL_BILLS_API = "ALLBILLV2"
SUMMARY_API = "BPMBILLSUMMARY"
ALTERNATIVE_API = "TVBPMBILL11"
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


def request_json(url, params, retries=3, timeout=35):
    last_error = None
    for attempt in range(retries):
        try:
            response = requests.get(url, params=params, timeout=timeout)
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


def assembly_result(payload, service_id):
    result = payload.get("RESULT")
    if not isinstance(result, dict):
        blocks = payload.get(service_id, [])
        result = {}
        for block in blocks if isinstance(blocks, list) else []:
            if not isinstance(block, dict):
                continue
            if isinstance(block.get("RESULT"), dict):
                result = block["RESULT"]
                break
            head = block.get("head", [])
            result = next((part["RESULT"] for part in head
                           if isinstance(part, dict) and isinstance(part.get("RESULT"), dict)), {})
            if result:
                break
    return result


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


def fetch_processed_bills(keywords, tracked_bill_numbers, pending_ids):
    """제22대 의안정보 통합 API에서 계류 목록에 없는 처리의안을 수집한다."""
    matched = {}
    searches = [{"BILL_NM": word} for word in keywords]
    searches.extend({"BILL_NO": number} for number in sorted(tracked_bill_numbers))
    for search in searches:
        for page in range(1, 101):
            payload = request_json(
                f"{ASSEMBLY_BASE}/{ALL_BILLS_API}",
                {"KEY": ASSEMBLY_KEY, "Type": "json", "pIndex": page,
                 "pSize": 1000, "ERACO": "제22대", **search},
            )
            result = assembly_result(payload, ALL_BILLS_API)
            if result.get("CODE") == "INFO-200":
                break
            if result.get("CODE", "INFO-000") != "INFO-000":
                raise RuntimeError(f"국회 처리의안 API 오류: {result.get('CODE')} {result.get('MESSAGE', '')}")
            rows = assembly_rows(payload, ALL_BILLS_API)
            if not rows and page == 1 and not result and ALL_BILLS_API not in payload:
                raise RuntimeError(f"국회 처리의안 API 응답을 읽을 수 없습니다: {search}")
            for row in rows:
                bill_id = clean_text(row.get("BILL_ID"))
                title = clean_text(row.get("BILL_NM") or row.get("BILL_NAME"))
                bill_no = re.sub(r"\D", "", str(row.get("BILL_NO") or ""))
                category = matched_category(title, keywords)
                if bill_id and bill_id not in pending_ids and (category or bill_no in tracked_bill_numbers):
                    row["_CATEGORY"] = category or "직접선택"
                    matched[bill_id] = row
            if len(rows) < 1000:
                break
            time.sleep(0.08)
        else:
            raise RuntimeError(f"처리의안 검색 페이지 한도를 초과했습니다: {search}")
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


def fetch_summary(bill_id, timeout=20):
    try:
        response = requests.get(SUMMARY_URL, params={"billId": bill_id}, timeout=timeout)
        response.raise_for_status()
        text = BeautifulSoup(response.text, "html.parser").get_text("\n", strip=True)
        for marker in ("제안이유 및 주요내용", "제안이유"):
            if marker in text:
                text = text.split(marker, 1)[1]
                break
        text = clean_text(text)
        return text[:420] if text else "공식 제안이유 및 주요내용을 확인 중입니다."
    except requests.RequestException:
        return "공식 제안이유 및 주요내용을 확인 중입니다."


def official_processed_summary(row):
    """의안번호로 공식 제안이유를 조회하고, 반환된 BILL_ID를 대조한다."""
    bill_no = clean_text(row.get("BILL_NO"))
    bill_id = clean_text(row.get("BILL_ID"))
    if bill_no:
        try:
            payload = request_json(
                f"{ASSEMBLY_BASE}/{SUMMARY_API}",
                {"KEY": ASSEMBLY_KEY, "Type": "json", "pIndex": 1,
                 "pSize": 100, "BILL_NO": bill_no}, retries=1, timeout=12,
            )
            result = assembly_result(payload, SUMMARY_API)
            if result.get("CODE", "INFO-000") not in ("INFO-000", "INFO-200"):
                raise RuntimeError(result.get("MESSAGE", "요약 API 오류"))
            for entry in assembly_rows(payload, SUMMARY_API):
                if clean_text(entry.get("BILL_ID")) == bill_id:
                    summary = clean_text(entry.get("SUMMARY"))
                    if summary:
                        return summary[:1200]
        except (RuntimeError, requests.RequestException, ValueError):
            pass
    # 이전 HTML 요약 경로가 가능한 경우에도 내용을 최대한 보완한다.
    return fetch_summary(bill_id, timeout=8)


def enrich_processed_summaries(items, rows):
    by_id = {item["billId"]: item for item in items if item.get("status") == "처리의안"}
    missing = [row for row in rows if "확인 중" in by_id[row["BILL_ID"]]["summary"]]
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(official_processed_summary, row): row["BILL_ID"] for row in missing}
        for future in as_completed(futures):
            summary = future.result()
            if summary and "확인 중" not in summary:
                by_id[futures[future]]["summary"] = summary
    remaining = sum("확인 중" in item["summary"] for item in by_id.values())
    print(f"처리의안 주요내용: 보완 대상 {len(missing)}건, 확인 대기 {remaining}건")


def fetch_absorbed_ids(alternative_id):
    payload = request_json(
        f"{ASSEMBLY_BASE}/{ALTERNATIVE_API}",
        {"KEY": ASSEMBLY_KEY, "Type": "json", "pIndex": 1, "pSize": 1000,
         "AGE": "22", "BILL_ID_REF": alternative_id}, retries=2, timeout=15,
    )
    result = assembly_result(payload, ALTERNATIVE_API)
    if result.get("CODE", "INFO-000") not in ("INFO-000", "INFO-200"):
        raise RuntimeError(f"대안정보 API 오류: {result.get('MESSAGE', result.get('CODE'))}")
    return {clean_text(row.get("BILL_ID")) for row in assembly_rows(payload, ALTERNATIVE_API)}


def enrich_alternative_links(items):
    by_id = {item["billId"]: item for item in items if item.get("status") == "처리의안"}
    alternatives = [item for item in by_id.values() if item["title"].rstrip().endswith("(대안)")]
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_absorbed_ids, alt["billId"]): alt for alt in alternatives}
        for future in as_completed(futures):
            alt = futures[future]
            try:
                absorbed_ids = future.result()
            except (RuntimeError, requests.RequestException, ValueError) as exc:
                print(f"[안내] 대안 {alt['billNo']} 관계 조회 실패: {exc}")
                continue
            for bill_id in absorbed_ids:
                absorbed = by_id.get(bill_id)
                if not absorbed or absorbed.get("processingResult") != "대안반영폐기":
                    continue
                relation = {"billId": alt["billId"], "billNo": alt["billNo"],
                            "title": alt["title"], "sourceUrl": alt["sourceUrl"]}
                links = absorbed.setdefault("alternativeBills", [])
                if all(link["billId"] != alt["billId"] for link in links):
                    links.append(relation)
    linked = 0
    for item in by_id.values():
        if item.get("alternativeBills"):
            item["alternativeBills"].sort(key=lambda alt: alt["billNo"])
            item["change"] += " → " + ", ".join(alt["billNo"] for alt in item["alternativeBills"])
            linked += 1
    print(f"대안반영폐기 연결: {linked}건 / 대안 {len(alternatives)}건 조회")


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

    summary = old.get("summary", "") if old else ""
    if not summary or "확인 중" in summary:
        summary = fetch_summary(bill_id)

    category = row.get("_CATEGORY", "")
    committee = clean_text(row.get("CURR_COMMITTEE")) or "위원회 배정 전"
    return {
        "month": month,
        "billId": bill_id,
        "title": title,
        "billNo": f"의안번호 {clean_text(row.get('BILL_NO'))}",
        "agency": CATEGORY_AGENCY.get(category, committee),
        "committee": committee,
        "proposer": clean_text(row.get("PROPOSER") or row.get("RST_PROPOSER")) or "제안자 확인 중",
        "stage": stage,
        "previousStage": previous_stage,
        "changed": changed,
        "changedDate": changed_date,
        "change": change,
        "summary": summary,
        "sourceUrl": row.get("LINK_URL") or f"{SUMMARY_URL}?billId={bill_id}",
    }


def make_processed_item(row, old, month, today):
    bill_id = clean_text(row.get("BILL_ID"))
    result = clean_text(row.get("RGS_CONF_RSLT") or row.get("PROC_RESULT")
                        or row.get("LAW_PROC_RESULT_CD") or row.get("CMT_PROC_RESULT_CD"))
    # 처리 결과가 본회의까지 도달했음을 뜻하는 경우에만 본회의 단계로 표시한다.
    stage = "본회의" if any(word in result for word in ("가결", "부결", "본회의")) else "소관위"
    committee = clean_text(row.get("JRCMIT_NM") or row.get("CURR_COMMITTEE")) or "위원회 확인 중"
    changed = bool(old and old.get("stage") != stage) or bool(old and old.get("status") != "처리의안")
    summary = clean_text(row.get("BILL_SUMMARY")) or (old.get("summary", "") if old else "")
    return {
        "month": month,
        "billId": bill_id,
        "title": clean_text(row.get("BILL_NM") or row.get("BILL_NAME")),
        "billNo": f"의안번호 {clean_text(row.get('BILL_NO'))}",
        "agency": CATEGORY_AGENCY.get(row["_CATEGORY"], committee),
        "committee": committee,
        "proposer": clean_text(row.get("PPSR_NM") or row.get("RST_PROPOSER") or row.get("PROPOSER")) or "제안자 확인 중",
        "stage": stage,
        "status": "처리의안",
        "processingResult": result or "처리결과 확인 중",
        "alternativeBills": old.get("alternativeBills", []) if old else [],
        "previousStage": old.get("stage", "-") if old else "-",
        "changed": changed,
        "changedDate": today if changed else (old.get("changedDate", today) if old else today),
        "change": f"처리의안 · {result}" if result else "처리의안 · 처리결과 확인 중",
        "summary": summary or "공식 제안이유 및 주요내용을 확인 중입니다.",
        "sourceUrl": row.get("LINK_URL") or f"{SUMMARY_URL}?billId={bill_id}",
    }


def law_rows(payload):
    root = payload.get("LawSearch", payload)
    rows = root.get("law", []) if isinstance(root, dict) else []
    if isinstance(rows, dict):
        rows = [rows]
    return rows if isinstance(rows, list) else []


def fetch_promulgated_laws(keywords, month, today):
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
            found[law_id] = {
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
    processed_rows = fetch_processed_bills(
        keywords, tracked_bill_numbers, {str(row.get("BILL_ID")) for row in pending_rows}
    )
    if not processed_rows:
        raise RuntimeError("국회 API가 처리 의안을 0건 반환했습니다. 기존 데이터를 보호하기 위해 저장을 중단합니다.")
    items = []
    for index, row in enumerate(pending_rows, 1):
        key = str(row.get("BILL_ID") or "")
        items.append(make_pending_item(row, old_index.get(key, {}), month, today))
        if index % 20 == 0:
            time.sleep(0.2)

    for row in processed_rows:
        key = str(row.get("BILL_ID") or "")
        items.append(make_processed_item(row, old_index.get(key, {}), month, today))

    enrich_processed_summaries(items, processed_rows)
    enrich_alternative_links(items)

    laws = fetch_promulgated_laws(keywords, month, today)
    items.extend(laws)
    history = [item for item in old_items if item.get("month", "") < month]
    history = [item for item in history if item.get("month", "") >= (now - timedelta(days=370)).strftime("%Y-%m")]
    combined = history + sorted(items, key=lambda item: (item["stage"], item["title"]))
    payload = {
        "mode": "official",
        "updatedAt": now.strftime("%Y-%m-%d %H:%M"),
        "items": combined,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"완료: 계류 법안 {len(pending_rows)}건, 처리 의안 {len(processed_rows)}건, 공포 법령 {len(laws)}건")


if __name__ == "__main__":
    main()
