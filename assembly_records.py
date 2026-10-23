"""Normalize full-list metadata while retaining existing favorites/detail fields."""
import re
from assembly_api import bill_number, first, text, CollectionError

AGENCIES = [
    ("독점규제|공정거래|하도급거래|가맹사업거래|대규모유통업|대리점거래|약관의 규제|전자상거래|표시.*광고|소비자기본", "공정거래위원회"),
    ("자본시장|금융투자업", "금융위원회"),
    ("대.*중소기업 상생협력", "중소벤처기업부"),
    ("건설산업기본", "국토교통부"), ("행정조사기본", "국무조정실"),
    ("중대재해|산업안전|청년고용|근로기준|노동조합", "고용노동부"),
    ("상속세|증여세|조세특례", "기획재정부"),
    ("상법|민사소송|집단소송", "법무부"),
    ("탄소중립|지속가능성|책임경영", "기후에너지환경부"),
]
FINAL = re.compile(r"가결|부결|폐기|철회|의결|승인|채택|동의|종결|만료")


def date(value):
    digits = re.sub(r"\D", "", text(value))
    if len(digits) != 8:
        return ""
    from datetime import datetime
    try:
        return datetime.strptime(digits, "%Y%m%d").strftime("%Y-%m-%d")
    except ValueError:
        return ""


def is_law(row):
    kind = first(row, "BILL_KIND", "BILL_KND", "BILL_KIND_NM", "BILL_KND_NM", "KIND")
    if kind:
        return "법률" in kind
    return bool(re.search(r"법률안|법안", first(row, "BILL_NM", "BILL_NAME")))


def normalize(row, old, term, now):
    number = bill_number(row)
    title = first(row, "BILL_NM", "BILL_NAME", "의안명")
    if not title:
        raise CollectionError(f"{number}: 의안명이 없어 저장을 중단합니다.")
    today, month = now.strftime("%Y-%m-%d"), now.strftime("%Y-%m")
    committee = first(row, "JRCMIT_NM", "CURR_COMMITTEE", "COMMITTEE", "COMMITTEE_NM", "CURR_COMMITTEE_NM") or old.get("committee", "위원회 배정 전")
    plenary_result = first(row, "RGS_CONF_RSLT", "PROC_RESULT", "PROC_RESULT_CD", "PROC_RESULT_NM", "BILL_PROC_RESULT", "PLENARY_PROC_RESULT")
    result = plenary_result
    result = result or first(row, "CMT_PROC_RESULT_CD", "LAW_PROC_RESULT_CD") or old.get("processingResult", "")
    referral = date(first(row, "COMMITTEE_DT", "CMT_DT")) or old.get("committeeDate", "")
    present = date(first(row, "CMT_PRESENT_DT", "COMMITTEE_PRESENT_DT")) or old.get("committeePresentDate", "")
    process = date(first(row, "PROC_DT", "PROC_DATE", "PLENARY_PROC_DT"))
    law_date = date(first(row, "LAW_PRESENT_DT", "LAW_PROC_DT"))
    promulgated = date(first(row, "PROMULGATION_DT", "PROMULG_DT", "PROM_DT")) or old.get("promulgationDate", "")
    proposal = date(first(row, "PPSL_DT", "PROPOSE_DT", "PROPOSE_DATE", "RCP_DT", "RECEIPT_DT")) or old.get("proposeDate", "")
    if promulgated:
        stage, stage_date = "공포·시행", promulgated
    elif re.search(r"원안가결|수정가결|^가결$|^부결$", plenary_result) or (process and not re.search(r"폐기|철회|만료", result)):
        stage, stage_date = "본회의", process
    elif law_date:
        stage, stage_date = "법사위", law_date
    elif committee != "위원회 배정 전" or referral or present:
        stage, stage_date = "소관위", present or referral
    else:
        stage, stage_date = "접수", proposal
    if old.get("stage") == "공포·시행" and result and FINAL.search(result):
        stage, stage_date = "공포·시행", promulgated or old.get("stageDate", "")
    agency = next((name for pattern, name in AGENCIES if re.search(pattern, title)), committee)
    # Preserve explicitly established ministry assignments on existing records.
    if old.get("agency") and old.get("agency") != old.get("committee"):
        agency = old["agency"]
    summary = first(row, "BILL_SUMMARY", "SUMMARY", "MAJOR_CONTENTS", "PROPOSE_REASON")
    summary = old.get("summary") or summary or "공식 제안이유 및 주요내용을 확인 중입니다."
    item = {**old,
        "assemblyTerm": str(term), "billId": first(row, "BILL_ID") or old.get("billId") or f"assembly-{number}",
        "billNo": f"의안번호 {number}", "title": title, "agency": agency, "committee": committee,
        "proposer": first(row, "PPSR_NM", "PROPOSER", "RST_PROPOSER", "PROPOSER_NM", "REP_PROPOSER") or old.get("proposer", "제안자 확인 중"),
        "proposeDate": proposal, "billKind": first(row, "BILL_KIND", "BILL_KND", "BILL_KIND_NM", "BILL_KND_NM", "KIND") or ("법률안" if is_law(row) else "기타 의안"),
        "isLaw": is_law(row), "stage": stage, "stageDate": stage_date,
        "committeeDate": referral, "committeePresentDate": present,
        "processingResult": result, "processDate": process, "promulgationDate": promulgated,
        "isCompleted": bool(result and FINAL.search(result)) or bool(promulgated),
        "summary": summary, "month": month, "catalogRecord": True,
        "catalogCheckedAt": now.strftime("%Y-%m-%d %H:%M"),
        "sourceUrl": first(row, "LINK_URL", "DETAIL_LINK", "BILL_LINK") or old.get("sourceUrl") or "https://likms.assembly.go.kr/bill/",
    }
    changed_fields = [field for field in ("title", "stage", "committee", "proposer", "processingResult", "committeeDate", "committeePresentDate", "processDate") if text(old.get(field)) != text(item.get(field))]
    changed = bool(changed_fields) if old else str(term) == "22"
    same_day_change = bool(old.get("dailyChanged")) and old.get("dailyChangedDate") == today
    item.update(
        changed=changed or bool(old.get("changed") and old.get("month") == month),
        changedDate=today if changed else old.get("changedDate", stage_date or today),
        previousStage=old.get("previousStage", old.get("stage", "-")),
        dailyChanged=changed or same_day_change,
        dailyChangedDate=today if changed or same_day_change else "",
        change=(result or (f"{old.get('stage', '-')} → {stage}" if old else "이번 달 신규 확인")) if changed else old.get("change", result or "이번 달 변동 없음"),
    )
    if str(term) == "21" and not old:
        item.update(changed=False, dailyChanged=False, dailyChangedDate="", change=result or "과거 의안 최종 확인")
    return item


def index_existing(items):
    result = {}
    for item in sorted(items, key=lambda r: (r.get("month", ""), r.get("catalogCheckedAt", ""))):
        number = re.search(r"\d{7}", str(item.get("billNo", "")))
        if number:
            previous = result.get(number[0], {})
            # Missing values in list responses must not erase previously collected detail.
            result[number[0]] = {**previous, **{k: v for k, v in item.items() if v not in ("", None, [])}}
    return result
