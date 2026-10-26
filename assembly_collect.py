"""Collect both terms, compare independent reception lists, then publish atomically.

Run from GitHub Actions after the existing collector. No voting or plenary-list
endpoints are called. The combined list includes pending AND processed items.
"""
import argparse
import json
import os
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from assembly_api import CollectionError, atomic_json, fetch_all, reconcile, related_procedure_pair
from assembly_records import index_existing, normalize

ROOT = Path(__file__).resolve().parent
KST = timezone(timedelta(hours=9))
VERSION = 1


def read_json(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        raise CollectionError(f"기존 {path.name}을 읽지 못했습니다. 원본을 유지합니다.") from None


def collect(force_history=False, root=ROOT):
    now = datetime.now(KST)
    audit = {"schemaVersion": VERSION, "checkedAt": now.strftime("%Y-%m-%d %H:%M"),
             "status": "running", "scope": "21·22대 전체 의안(의안 종류·키워드 제한 없음)",
             "comparison": "공식 통합 API와 접수목록 API 간 의안번호 대조. 웹사이트 통계와의 실시간 동일성 검증은 아님.",
             "terms": {}}
    staged = {}
    try:
        old_index = read_json(root / "assembly-index.json", {"terms": {}})
        existing = read_json(root / "sample-bills.json", {"items": []}).get("items", [])
        for term in ("21", "22"):
            record = {"status": "running", "sources": {}}
            audit["terms"][term] = record
            path = root / f"assembly-{term}.json"
            previous = read_json(path, {"items": []})
            prior_audit = old_index.get("terms", {}).get(term, {})
            # Closed-term history is reused only after a successful reconciliation.
            cache_rows = previous.get("items", [])
            cached_numbers = [str(item.get("billNo", "")).replace("의안번호 ", "") for item in cache_rows]
            cache_ok = (previous.get("schemaVersion") == VERSION and previous.get("assemblyTerm") == term
                        and prior_audit.get("verified") and prior_audit.get("count") == len(cache_rows)
                        and len(set(cached_numbers)) == len(cache_rows)
                        and all(len(number) == 7 and number.isdigit() and number.startswith(term) for number in cached_numbers)
                        and previous.get("updatedAt") == prior_audit.get("checkedAt"))
            if term == "21" and not force_history and cache_ok and cache_rows:
                staged[term] = previous
                record.update(status="cached", checkedAt=previous.get("updatedAt"),
                              count=len(previous["items"]), note="이전 검증본 재사용. 이번 실행의 공식 목록 재대조는 생략함.")
                continue
            master_service = os.environ.get("ASSEMBLY_ALL_SERVICE", "ALLBILLV2")
            receipt_service = os.environ.get("ASSEMBLY_RECEIPT_SERVICE", "BILLRCP")
            if master_service.lower() == receipt_service.lower():
                raise CollectionError("통합목록과 대조목록은 서로 다른 API여야 합니다.")
            record["sources"]["master"] = {}
            record["sources"]["reception"] = {}
            master = fetch_all(master_service, term, record["sources"]["master"])
            reception = fetch_all(receipt_service, term, record["sources"]["reception"])
            reconcile(master, reception, record)
            # Prefer fuller original metadata, filling missing fields from reception.
            old = index_existing(existing + previous.get("items", []))
            items = []
            for number, row in sorted(master.items()):
                receipt = reception[number]
                # A linked GOV reception row must not overwrite missing original
                # proposal fields or supply a result for a different procedure.
                linked = related_procedure_pair(row, receipt)
                merged = dict(row) if linked else {**receipt, **{k: v for k, v in row.items() if v not in (None, "")}}
                if linked and str(receipt.get("BILL_ID", "")).startswith("PRC_"):
                    merged = dict(receipt)
                item = normalize(merged, old.get(number, {}), term, now)
                history = []
                for source, candidate in ((master_service, row), (receipt_service, receipt)):
                    for raw in candidate.get("_PROCEDURE_RECORDS", [candidate] if linked else []):
                        entry = {"source": source, "record": {k: v for k, v in raw.items() if not k.startswith("_")}}
                        if entry not in history:
                            history.append(entry)
                if history:
                    item["officialProcedureHistory"] = history
                    item["officialProcedureHistoryNote"] = "동일 의안번호의 관련 원본 기록 보존. 절차 종류와 시간순 현재 상태는 별도 원문 확인 필요."
                differences = {}
                for source, source_audit in record["sources"].items():
                    fields = source_audit.get("duplicateFieldConflicts", {}).get(number)
                    if fields:
                        differences[source] = fields
                if differences:
                    item["officialSourceVariants"] = differences
                else:
                    item.pop("officialSourceVariants", None)
                items.append(item)
            processed = sum(item["isCompleted"] for item in items)
            missing_dates = [item["billNo"] for item in items if not item["proposeDate"]]
            # List completeness and availability of final outcomes are distinct.
            # Missing outcomes stay blank and never imply pending/completed.
            record["missingProcessingResultCount"] = sum(not item.get("processingResult") for item in items)
            if term == "21" and processed == 0:
                record["processingResultWarning"] = "처리결과로 완료 여부를 확인할 수 없습니다. 목록 대조는 완료했으며 결과는 추정하지 않습니다."
            record.update(status="verified", count=len(items), processedCount=processed,
                          unknownProposalDateCount=len(missing_dates), unknownProposalDateBills=missing_dates)
            staged[term] = {"schemaVersion": VERSION, "assemblyTerm": term,
                            "updatedAt": audit["checkedAt"], "items": items}
        manifest = {"schemaVersion": VERSION, "updatedAt": audit["checkedAt"], "terms": {}}
        for term, payload in staged.items():
            record = audit["terms"][term]
            by_month = Counter(item["proposeDate"][:7] for item in payload["items"] if item.get("proposeDate"))
            laws_by_month = Counter(item["proposeDate"][:7] for item in payload["items"] if item.get("proposeDate") and item.get("isLaw"))
            manifest["terms"][term] = {
                "file": f"assembly-{term}.json", "count": len(payload["items"]), "verified": True,
                "checkedAt": payload["updatedAt"], "reused": record["status"] == "cached",
                "months": dict(sorted(by_month.items())), "lawMonths": dict(sorted(laws_by_month.items())),
                "unknownProposalDateCount": sum(not item.get("proposeDate") for item in payload["items"]),
            }
        # All network requests, scope checks and both-term reconciliation have
        # finished before touching any published catalog. Workflow commits once.
        for term, payload in staged.items():
            if audit["terms"][term]["status"] != "cached":
                atomic_json(root / f"assembly-{term}.json", payload)
        atomic_json(root / "assembly-index.json", manifest)
        audit["status"] = "verified"
        atomic_json(root / "assembly-audit.json", audit)
        print("전체 의안 수집·대조 완료:", ", ".join(f"{t}대 {v['count']:,}건" for t, v in manifest["terms"].items()))
    except Exception as error:
        audit["status"] = "failed"
        # All expected exceptions are sanitized and never contain the API key.
        audit["error"] = str(error) if isinstance(error, CollectionError) else f"내부 처리 오류({type(error).__name__})"
        atomic_json(root / "assembly-audit-failed.json", audit)
        print(audit["error"])
        raise CollectionError(audit["error"]) from None


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh-history", action="store_true", help="21대 보관본도 공식 목록과 다시 대조")
    args = parser.parse_args()
    try:
        collect(args.refresh_history)
    except CollectionError:
        raise SystemExit(1)
