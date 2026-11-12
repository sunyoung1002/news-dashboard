"""Apply the bundled official export without changing the last API check time."""
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from assembly_api import atomic_json, CollectionError
from assembly_collect import read_json
from official_receipts import load_reference, supplement, coverage


def repair(root=Path(__file__).resolve().parent):
    reference = load_reference(root)
    if not reference:
        raise CollectionError("공식 접수목록 보완 파일이 없습니다.")
    term = reference[0]["term"]
    path = root / f"assembly-{term}.json"
    payload = read_json(path, {})
    index = read_json(root / "assembly-index.json", {})
    if not payload.get("items") or term not in index.get("terms", {}):
        raise CollectionError("기존 전체 의안 자료가 필요합니다.")
    record = {"apiLatestProposalDate": index["terms"][term].get("apiLatestProposalDate") or
              max(i.get("proposeDate", "") for i in payload["items"])}
    now = datetime.now(timezone(timedelta(hours=9)))
    payload["items"] = supplement(payload["items"], [], reference, term, now, record)
    payload["receiptReferencePatchedOn"] = now.strftime("%Y-%m-%d")
    info = index["terms"][term]
    info.update(count=len(payload["items"]), **coverage(payload["items"], record))
    info["months"] = dict(sorted(Counter(i["proposeDate"][:7] for i in payload["items"] if i.get("proposeDate")).items()))
    info["lawMonths"] = dict(sorted(Counter(i["proposeDate"][:7] for i in payload["items"] if i.get("proposeDate") and i.get("isLaw")).items()))
    atomic_json(path, payload)
    atomic_json(root / "assembly-index.json", index)
    audit = read_json(root / "assembly-audit.json", {})
    audit["receiptReferenceRepair"] = {**record, "patchedOn": now.strftime("%Y-%m-%d"),
                                        "note": "API 재확인 없이 첨부 공식목록으로 보완. 기존 API 확인 시각 유지."}
    atomic_json(root / "assembly-audit.json", audit)
    print(f"공식 접수목록 보완 완료: {info['count']:,}건 수록")


if __name__ == "__main__":
    repair()
