from __future__ import annotations

import base64
import csv
import json
import re
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "sample-bills.json"
ARCHIVE_FILE = ROOT / "bill_archive.csv"

FIELDS = [
    "month", "billId", "title", "billNo", "agency", "committee", "proposer",
    "stage", "previousStage", "changed", "changedDate", "change",
    "processingResult", "summary", "sourceUrl", "archivedAt",
]

# 2026-09-30에 보관한 공용 즐겨찾기 70건의 최소 복구정보.
# 회사 PC의 파일 제한을 넘지 않도록 압축했으며, 현재 수집자료가 있으면 최신값이 우선한다.
FAVORITES_B64 = (
    "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"
)

# 예전 공용 즐겨찾기에는 남았지만 현재 계류 목록에서 빠진 법안의 최초 복구자료.
# 다음 실행부터는 bill_archive.csv에 저장되므로 다시 API로 불러올 필요가 없다.
RECOVERED = [
    {
        "month": "2026-08",
        "billId": "PRC_B2A4Z0H7G2E3A1Z3A3Y6X3F3D5E4D5",
        "title": "자본시장과 금융투자업에 관한 법률 일부개정법률안",
        "billNo": "의안번호 2202970",
        "agency": "금융위원회",
        "committee": "정무위원회",
        "proposer": "한정애의원 등 10인",
        "stage": "본회의",
        "previousStage": "소관위",
        "changed": True,
        "changedDate": "2026-08-20",
        "change": "2026-08-20 대안반영폐기 · 위원회 대안 2220250에 통합",
        "processingResult": "대안반영폐기",
        "summary": "상장회사의 합병가액을 주가뿐 아니라 자산가치와 수익가치 등을 종합적으로 고려해 공정하게 정하도록 하는 내용입니다. 불공정한 합병가액으로 투자자가 손해를 입으면 손해배상책임을 지도록 하여 소액주주의 권익을 보호하며, 해당 내용은 위원회 대안 2220250에 반영되었습니다.",
        "sourceUrl": "https://likms.assembly.go.kr/bill/billDetail.do?billId=PRC_B2A4Z0H7G2E3A1Z3A3Y6X3F3D5E4D5",
    },
    {
        "month": "2026-09",
        "billId": "PRC_H2G6U0T5S1H9B0A9Z3H3H3D9M3L7J6",
        "title": "주식회사 등의 외부감사에 관한 법률 일부개정법률안",
        "billNo": "의안번호 2219264",
        "agency": "금융위원회",
        "committee": "정무위원회",
        "proposer": "이훈기의원 등 10인",
        "stage": "소관위",
        "previousStage": "접수",
        "changed": True,
        "changedDate": "2026-09-30",
        "change": "기존 즐겨찾기 누계자료 복구",
        "processingResult": "",
        "summary": "감사보고서가 정기총회 직전에 제공되어 주주가 재무제표와 감사의견을 충분히 검토하기 어렵다는 문제를 개선하는 법안입니다. 감사보고서 제출 시기를 앞당겨 주주의 검토기간을 보장하고 기업 회계정보의 투명성을 높이려는 내용입니다.",
        "sourceUrl": "https://likms.assembly.go.kr/bill/billDetail.do?billId=PRC_H2G6U0T5S1H9B0A9Z3H3H3D9M3L7J6",
    },
    {
        "month": "2026-09",
        "billId": "PRC_U2S6T0R9N0O3N1N7M3K9K3T2T7S1Q7",
        "title": "수도법 일부개정법률안",
        "billNo": "의안번호 2221197",
        "agency": "기후에너지환경부",
        "committee": "기후에너지환경노동위원회",
        "proposer": "박해철의원 등 10인",
        "stage": "소관위",
        "previousStage": "접수",
        "changed": True,
        "changedDate": "2026-09-30",
        "change": "기존 즐겨찾기 누계자료 복구",
        "processingResult": "",
        "summary": "상수원보호구역의 수질오염 행위와 무단 건축행위에 대한 처벌 수준을 강화하는 법안입니다. 확정판결 이후에도 동일한 위반행위가 반복되는 문제를 방지하여 상수원 수질 보전과 규제의 실효성을 높이려는 내용입니다.",
        "sourceUrl": "https://likms.assembly.go.kr/bill/billDetail.do?billId=PRC_U2S6T0R9N0O3N1N7M3K9K3T2T7S1Q7",
    },
]


def recovered_favorites():
    packed = base64.b64decode(FAVORITES_B64)
    rows = json.loads(zlib.decompress(packed).decode("utf-8"))
    return [{
        "month": text(row.get("d"))[:7] or "2026-09",
        "billId": text(row.get("i")),
        "title": text(row.get("t")),
        "billNo": f"의안번호 {text(row.get('n'))}",
        "agency": text(row.get("a")),
        "committee": text(row.get("c")),
        "proposer": text(row.get("p")),
        "stage": text(row.get("s")) or "소관위",
        "previousStage": "-",
        "changed": True,
        "changedDate": text(row.get("d")),
        "change": "기존 즐겨찾기 누계자료 복구",
        "processingResult": "",
        "summary": "",
        "sourceUrl": text(row.get("u")),
    } for row in rows]


def text(value):
    return "" if value is None else str(value).strip()


def bill_number(row):
    return re.sub(r"\D", "", text(row.get("billNo")))


def row_key(row):
    identity = text(row.get("billId")) or bill_number(row) or text(row.get("title"))
    return f"{identity}|{text(row.get('month'))}"


def read_archive():
    if not ARCHIVE_FILE.exists():
        return []
    with ARCHIVE_FILE.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        row["changed"] = text(row.get("changed")).lower() == "true"
        row["dailyChanged"] = False
        row["dailyChangedDate"] = ""
        row["dailyChangeFields"] = []
        row["dailyChangeDetails"] = []
    return rows


def archive_row(item, archived_at):
    row = {field: item.get(field, "") for field in FIELDS}
    row["changed"] = bool(item.get("changed"))
    row["archivedAt"] = text(item.get("archivedAt")) or archived_at
    return row


def main():
    if not DATA_FILE.exists():
        raise RuntimeError("sample-bills.json 파일이 없습니다.")
    payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    current = payload.get("items") or []
    if not current:
        raise RuntimeError("현재 법안 데이터가 0건이므로 누계 병합을 중단합니다.")

    today = datetime.now(KST).strftime("%Y-%m-%d")
    merged = {row_key(row): row for row in read_archive() if row_key(row).split("|")[0]}
    seeds = {row_key(row): row for row in recovered_favorites()}
    for row in RECOVERED:
        seeds[row_key(row)] = {**seeds.get(row_key(row), {}), **row}
    for key, row in seeds.items():
        merged.setdefault(key, dict(row))
    for row in current:
        old = merged.get(row_key(row), {})
        merged[row_key(row)] = {**old, **row, "archivedAt": old.get("archivedAt") or today}

    rows = sorted(merged.values(), key=lambda row: (
        text(row.get("month")), text(row.get("changedDate")),
        bill_number(row), text(row.get("title")),
    ))
    with ARCHIVE_FILE.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(archive_row(row, today) for row in rows)

    for row in rows:
        row.pop("archivedAt", None)
        row.setdefault("dailyChanged", False)
        row.setdefault("dailyChangedDate", "")
        row.setdefault("dailyChangeFields", [])
        row.setdefault("dailyChangeDetails", [])
    payload["items"] = rows
    payload["archiveCount"] = len(rows)
    DATA_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"누계관리 완료: {len(rows):,}건 (현재 수집 {len(current):,}건)")


if __name__ == "__main__":
    main()
