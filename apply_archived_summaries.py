"""Restore missing text from the user's official XLSX, without changing statuses."""
import base64
import gzip
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def usable(value):
    return len(str(value or "").strip()) >= 12 and not re.search(r"확인\s*중|내용.*없습니다|조회.*실패", str(value or ""))


def main(root=ROOT):
    archive = root / "official-summary-data"
    manifest = json.loads((archive / "manifest.json").read_text())
    excerpts = {}
    for term in ("21", "22"):
        record = manifest["terms"][term]
        count = record["parts"]
        if not isinstance(count, int) or not 1 <= count <= 256:
            raise ValueError("원문 복원 조각 수 확인 필요")
        encoded = "".join((archive / f"{term}-{i:03d}.txt").read_text(encoding="ascii") for i in range(count))
        data = json.loads(gzip.decompress(base64.b64decode(encoded, validate=True)))
        if len(data) != record["count"]:
            raise ValueError("원문 복원 건수 불일치")
        excerpts.update(data)
    # Validate every archive before modifying any published file.
    pending = []
    for name in ("sample-bills.json", "assembly-21.json", "assembly-22.json"):
        path = root / name
        if not path.exists():
            continue
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        restored = 0
        for item in payload.get("items", []):
            if usable(item.get("summary")):
                continue
            found = re.search(r"\d{7}", str(item.get("billNo", "")))
            entry = excerpts.get(found[0]) if found else None
            if not isinstance(entry, list) or len(entry) != 3:
                continue
            if re.sub(r"\s+", "", item.get("title", "")) != entry[0]:
                continue
            if item.get("proposeDate") and entry[1] and item["proposeDate"] != entry[1]:
                continue
            if not usable(entry[2]):
                continue
            item.update(summary=entry[2], summarySource="official-xlsx-excerpt", summarySourceDate=manifest["sourceDate"])
            restored += 1
        if restored:
            pending.append((path, payload))
        print(f"{name}: 공식 첨부 원문에서 주요내용 {restored}건 복원")
    for path, payload in pending:
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        temporary.replace(path)


if __name__ == "__main__":
    main()
