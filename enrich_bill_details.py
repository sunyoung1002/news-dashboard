"""공식 상세 화면의 표 머리글을 기준으로 날짜를 분리한다. 날짜 추정은 하지 않는다."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
import csv
import json
import os
from pathlib import Path
import re
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
DETAIL_URL = "https://likms.assembly.go.kr/bill/billDetail.do"
KST = timezone(timedelta(hours=9))
EXTRA_FIELDS = ["proposeDate", "relatedCommitteeReviews", "officialDetailCheckedAt", "officialDetailCheck"]


def date(value):
    found = re.search(r"(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})", str(value or ""))
    if found:
        try:
            return datetime(*map(int, found.groups())).strftime("%Y-%m-%d")
        except ValueError:
            return ""
    return ""


class DetailTables(HTMLParser):
    """Read only rendered HTML table text; scripts and hidden endpoint guesses are excluded."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.section = ""
        self.tables = []
        self.table = None
        self.depth = 0
        self.row = None
        self.cell = None
        self.ignore = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.ignore += 1
        if self.ignore:
            return
        if tag == "table":
            self.depth += 1
            if self.depth == 1:
                self.table = {"section": self.section, "rows": []}
        elif tag == "tr" and self.depth == 1:
            self.row = []
        elif tag in ("th", "td") and self.depth == 1:
            self.cell = []

    def handle_data(self, text):
        if self.ignore:
            return
        normalized = re.sub(r"\s+", "", text)
        if normalized in ("소관위심사정보", "관련위심사정보", "소위심사정보", "법사위체계자구심사정보", "본회의심의정보", "제안이유및주요내용"):
            self.section = normalized
            if self.table is not None and not self.table["rows"]:
                self.table["section"] = normalized
        if self.cell is not None:
            self.cell.append(text)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.ignore = max(0, self.ignore - 1)
            return
        if self.ignore:
            return
        if tag in ("th", "td") and self.depth == 1 and self.cell is not None:
            if self.row is not None:
                self.row.append(re.sub(r"\s+", " ", " ".join(self.cell)).strip())
            self.cell = None
        elif tag == "tr" and self.depth == 1:
            if self.table is not None and self.row:
                self.table["rows"].append(self.row)
            self.row = None
        elif tag == "table":
            if self.depth == 1 and self.table is not None:
                self.tables.append(self.table)
                self.table = None
            self.depth = max(0, self.depth - 1)


def parse_detail_html(html):
    parser = DetailTables()
    parser.feed(html)
    result = {"relatedCommitteeReviews": []}
    recognized = set()
    for table in parser.tables:
        rows = table["rows"]
        section = table["section"]
        # 제안일은 항목명이 명시된 표에서만 읽는다.
        for row in rows:
            for index, cell in enumerate(row[:-1]):
                if re.sub(r"\s+", "", cell) in ("제안일자", "제안일", "발의일자", "발의일"):
                    proposed = date(row[index + 1])
                    if proposed:
                        result["proposeDate"] = proposed
        for header_index, header in enumerate(rows[:-1]):
            columns = [re.sub(r"\s+", "", cell) for cell in header]
            for label in ("제안일자", "제안일", "발의일자", "발의일"):
                if label in columns and len(rows[header_index + 1]) == len(columns):
                    proposed = date(rows[header_index + 1][columns.index(label)])
                    if proposed:
                        result["proposeDate"] = proposed
        if section not in ("소관위심사정보", "관련위심사정보"):
            continue
        headers = None
        for row in rows:
            compact = [re.sub(r"\s+", "", cell) for cell in row]
            if any(cell in ("회부일", "회부일자", "상정일", "상정일자") for cell in compact):
                headers = compact
                recognized.add(section)
                continue
            if not headers or len(row) != len(headers):
                continue
            record = dict(zip(headers, row))
            def field(*labels):
                return next((record[label] for label in labels if record.get(label)), "")
            if section == "소관위심사정보":
                referral = date(field("회부일", "회부일자"))
                if referral:
                    result["committeeDate"] = referral
            else:
                present = date(field("상정일", "상정일자"))
                process = date(field("처리일", "처리일자", "의결일", "의결일자"))
                name = field("위원회명", "위원회", "관련위원회", "관련위", "소관위원회")
                if present or date(field("회부일", "회부일자")):
                    result["relatedCommitteeReviews"].append({"committee": name, "presentDate": present,
                        "processDate": process, "result": field("처리결과", "심사결과")})
    result["officialDetailCheck"] = "confirmed" if "소관위심사정보" in recognized else "unavailable"
    if "관련위심사정보" not in recognized:
        # 상세 내용이 AJAX 등으로 빠진 응답을 '관련위 심사 없음'으로 해석하지 않는다.
        result.pop("relatedCommitteeReviews", None)
    return result


def fetch_detail(item):
    bill_id = str(item.get("billId") or "")
    if not bill_id.startswith("PRC_"):
        bill_id = parse_qs(urlparse(item.get("sourceUrl") or "").query).get("billId", [""])[0]
    if not re.fullmatch(r"PRC_[A-Za-z0-9]+", bill_id):
        return {}
    try:
        request = Request(DETAIL_URL + "?" + urlencode({"billId": bill_id}), headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=10) as response:
            html = response.read(2_000_000).decode("utf-8", errors="replace")
        return parse_detail_html(html)
    except (OSError, ValueError):
        return {"officialDetailCheck": "unavailable"}


def main():
    path = ROOT / "sample-bills.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload["items"]
    latest = {}
    for row in sorted(rows, key=lambda entry: entry.get("month", "")):
        latest[row["billId"]] = row
    today = datetime.now(KST).strftime("%Y-%m-%d")
    cutoff = (datetime.now(KST) - timedelta(days=7)).strftime("%Y-%m-%d")
    candidates = [row for row in latest.values() if not str(row["billId"]).startswith("law-")
                  and (not row.get("officialDetailCheckedAt") or row["officialDetailCheckedAt"] < cutoff)]
    # 날짜 검증이 안 된 법안부터 보완한다. 네트워크 오류여도 다른 법안과 원본 데이터는 보존한다.
    candidates.sort(key=lambda row: (bool(row.get("officialDetailCheckedAt")), row.get("officialDetailCheckedAt", ""), not row.get("committeeDate")))
    limit = int(os.environ.get("OFFICIAL_DETAIL_BATCH_LIMIT", "400"))
    candidates = candidates[:max(0, limit)]
    refreshed = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for row, metadata in zip(candidates, pool.map(fetch_detail, candidates)):
            metadata["officialDetailCheckedAt"] = today
            # 불완전 응답으로 이전에 검증된 심사정보를 지우지 않는다.
            refreshed[row["billId"]] = {**row, **metadata}
    for row in rows:
        metadata = refreshed.get(row["billId"], latest.get(row["billId"], {}))
        if metadata.get("proposeDate"):
            row["proposeDate"] = metadata["proposeDate"]
        if row.get("month") == metadata.get("month"):
            for field in EXTRA_FIELDS + ["committeeDate"]:
                if field in metadata:
                    row[field] = metadata[field]
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    archive = ROOT / "bill_archive.csv"
    if archive.exists():
        with archive.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            fields = list(reader.fieldnames or [])
            archived_dates = {(r.get("billId"), r.get("month")): r.get("archivedAt", "") for r in reader}
        fields += [field for field in EXTRA_FIELDS if field not in fields]
        with archive.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            for row in rows:
                reviews = row.get("relatedCommitteeReviews", [])
                record = {**row, "archivedAt": archived_dates.get((row.get("billId"), row.get("month")), ""),
                          "relatedCommitteeReviews": json.dumps(reviews, ensure_ascii=False) if isinstance(reviews, list) else reviews}
                writer.writerow(record)
    confirmed = sum(row.get("officialDetailCheck") == "confirmed" for row in refreshed.values())
    print(f"공식 상세정보 보완: 조회 {len(candidates)}건, 소관위 표 확인 {confirmed}건, 잔여 {max(0, len(latest) - len(candidates))}건(기확인 포함)")


if __name__ == "__main__":
    main()
