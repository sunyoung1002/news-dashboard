"""Supplement API catalogs with a checked official website export.

The export is dated evidence, never a claim to have checked the live website.
API status/detail wins over old exports; known identities must not disappear
merely because two APIs lag together. No API key or network call is used here.
"""
import json
from pathlib import Path

from assembly_api import CollectionError, bill_number, term_of
from assembly_records import normalize


def load_reference(root):
    folder = Path(root) / "official-receipts"
    path = folder / "manifest.json"
    if not path.exists():
        return None
    meta = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    for name in meta["files"]:
        candidate = (folder / name).resolve()
        if candidate.parent != folder.resolve() or not candidate.is_file():
            raise CollectionError("공식 접수목록 보완 파일 경로 오류")
        rows.extend(json.loads(candidate.read_text(encoding="utf-8")))
    numbers = [bill_number(row) for row in rows]
    if len(rows) != meta["count"] or len(set(numbers)) != len(rows):
        raise CollectionError("공식 접수목록 보완 파일 건수·중복 오류")
    for row in rows:
        if term_of(row) != meta["term"] or not meta["from"] <= row["PROPOSE_DT"] <= meta["through"]:
            raise CollectionError("공식 접수목록 보완 파일 대수·기간 오류")
    return meta, rows


def supplement(items, previous, reference, term, now, record):
    by_number = {bill_number({"BILL_NO": i["billNo"]}): i for i in items}
    retained = []
    for old in previous:
        number = bill_number({"BILL_NO": old["billNo"]})
        if number not in by_number:
            by_number[number] = dict(old)
            retained.append(number)
    record["retainedPreviousBillNumbers"] = sorted(retained)
    record["retainedPreviousCount"] = len(retained)
    if reference and reference[0]["term"] == term:
        meta, rows = reference
        added = []
        for row in rows:
            number = bill_number(row)
            if number not in by_number:
                item = normalize(row, {}, term, now)
                item.update(
                    stage="소관위" if row.get("WEBSITE_STAGE", "").startswith("소관위") else item["stage"],
                    websiteStage=row.get("WEBSITE_STAGE", ""),
                    receiptSource="의안정보시스템 목록다운로드",
                    receiptReferenceThrough=meta["through"],
                    receiptReferenceObservedOn=meta["observedOn"],
                    officialProposalText=row.get("PROPOSAL_TEXT", ""),
                    # Receipt evidence does not establish a new change today.
                    changed=False, dailyChanged=False, dailyChangedDate="",
                    change="공식 접수목록에서 누락 의안 보완",
                )
                by_number[number] = item
                added.append(number)
            elif by_number[number].get("proposeDate") != row["PROPOSE_DT"]:
                raise CollectionError(f"{number}: 공식 접수목록과 제안일자가 다릅니다. 원문 대조 필요")
        actual = {n for n, i in by_number.items()
                  if meta["from"] <= i.get("proposeDate", "") <= meta["through"]}
        expected = {bill_number(r) for r in rows}
        if actual != expected:
            raise CollectionError("첨부 공식 접수목록과 기간 내 의안번호가 다릅니다. 보완 기준 갱신 필요")
        record["websiteReference"] = {
            **{k: meta[k] for k in ("term", "from", "through", "observedOn", "count")},
            "matchedCount": len(actual), "matched": True,
            "addedBillNumbers": sorted(added), "addedCount": len(added),
            "liveWebsiteChecked": False,
        }
    return [by_number[n] for n in sorted(by_number)]


def coverage(items, record):
    latest = max((i.get("proposeDate", "") for i in items), default="")
    reference = record.get("websiteReference")
    return {
        "latestProposalDate": latest,
        "apiLatestProposalDate": record.get("apiLatestProposalDate", ""),
        "websiteReference": reference,
        "retainedPreviousCount": record.get("retainedPreviousCount", 0),
        "supplementarySource": record.get("sources", {}).get("pending", {}),
        "coverageNote": "API 목록 일치는 국회 웹 전체 접수목록과의 일치를 보장하지 않습니다.",
    }
