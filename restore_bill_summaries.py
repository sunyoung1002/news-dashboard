"""Fill missing official text; preserve all existing meaningful summaries."""
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlencode
from urllib.request import urlopen
from urllib.error import URLError


ROOT = Path(__file__).resolve().parent
URL = "https://likms.assembly.go.kr/bill/bi/popup/billSummary.do"


class PageText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignored = None

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav"):
            self.ignored = tag

    def handle_endtag(self, tag):
        if tag == self.ignored:
            self.ignored = None

    def handle_data(self, data):
        if not self.ignored and data.strip():
            self.parts.append(data.strip())


def usable(value):
    value = str(value or "").strip()
    return len(value) >= 12 and not re.search(r"확인\s*중|내용.*없습니다|조회.*실패", value)


def number(row):
    found = re.search(r"\d{7}", str(row.get("billNo", "")))
    return found[0] if found else ""


def fetch_text(pair, deadline):
    bill_no, bill_id = pair
    if time.monotonic() >= deadline:
        return bill_no, ""
    try:
        with urlopen(URL + "?" + urlencode({"billId": bill_id}), timeout=10) as response:
            body = response.read(2_000_001)
            charset = response.headers.get_content_charset() or "utf-8"
        if len(body) > 2_000_000:
            return bill_no, ""
        try:
            html = body.decode(charset)
        except UnicodeDecodeError:
            html = body.decode("cp949")
        parser = PageText()
        parser.feed(html)
        content = "\n".join(parser.parts)
        # Only accept an actual official summary section, not a login/error page.
        match = re.search(r"제안이유\s*및\s*주요내용", content)
        if not match:
            return bill_no, ""
        displayed = re.findall(r"\[\s*(\d{7})\s*\]", content[:match.start()])
        if displayed and bill_no not in displayed:
            return bill_no, ""
        content = content[match.end():]
        content = re.split(r"\n(?:창닫기|창 닫기|인쇄|닫기)\s*(?:\n|$)", content)[0]
        content = re.sub(r"\s+", " ", content).strip()
        if not usable(content) or len(content) < 30:
            return bill_no, ""
        return bill_no, content
    except (URLError, OSError, ValueError, UnicodeError):
        return bill_no, ""


def main(root=ROOT):
    paths = [root / name for name in ("sample-bills.json", "assembly-21.json", "assembly-22.json")]
    payloads = {p: json.loads(p.read_text(encoding="utf-8-sig")) for p in paths if p.exists()}
    known, missing = {}, {}
    for data in payloads.values():
        for row in data.get("items", []):
            bill_no = number(row)
            if not bill_no:
                continue
            if usable(row.get("summary")):
                known[bill_no] = row["summary"]
            bill_id = str(row.get("billId", ""))
            if re.fullmatch(r"(?:PRC|GOV)_[A-Za-z0-9]+", bill_id):
                if bill_no not in missing or bill_id.startswith("PRC_"):
                    missing[bill_no] = bill_id
    progress_path = root / "summary-backfill-state.json"
    progress = json.loads(progress_path.read_text(encoding="utf-8")) if progress_path.exists() else {}
    limit = max(0, min(1000, int(os.environ.get("SUMMARY_BACKFILL_LIMIT", "200"))))
    candidates = sorted(((n, i) for n, i in missing.items() if n not in known), key=lambda pair: (progress.get(pair[0], 0), not pair[0].startswith("22"), pair[0]))[:limit]
    deadline = time.monotonic() + 480
    with ThreadPoolExecutor(max_workers=4) as pool:
        for bill_no, content in pool.map(lambda pair: fetch_text(pair, deadline), candidates):
            progress[bill_no] = progress.get(bill_no, 0) + 1
            if content:
                known[bill_no] = content
    filled = 0
    checked = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M")
    for path, data in payloads.items():
        changed = False
        for row in data.get("items", []):
            bill_no = number(row)
            if not usable(row.get("summary")) and bill_no in known:
                row.update(summary=known[bill_no], summarySource="official-summary", summaryCheckedAt=checked)
                changed = True
                filled += 1
        if changed:
            temporary = path.with_suffix(".json.tmp")
            temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            temporary.replace(path)
    remaining = sum(n not in known for n in missing)
    if candidates:
        temporary = progress_path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(progress, sort_keys=True, separators=(",", ":")), encoding="utf-8")
        temporary.replace(progress_path)
    print(f"공식 주요내용 보완: 조회 {len(candidates)}건, 행 복원 {filled}건, 원문 미확보 의안 {remaining}건")
    # Do not change catalog dates: adding text is not a new status verification.


if __name__ == "__main__":
    main()
