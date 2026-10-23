"""Strict, key-safe pagination for official Assembly list APIs (stdlib only)."""
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://open.assembly.go.kr/portal/openapi/"


class CollectionError(RuntimeError):
    pass


def text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def first(row, *names):
    return next((text(row.get(name)) for name in names if text(row.get(name))), "")


def bill_number(row):
    value = first(row, "BILL_NO", "BILL_NUMBER", "의안번호")
    match = re.fullmatch(r"(?:의안번호\s*)?(\d{7})", value)
    if not match:
        raise CollectionError("공식 목록에서 7자리 의안번호를 확인하지 못했습니다. 응답 명세 확인 필요")
    return match[1]


def term_of(row):
    number = bill_number(row)
    declared = first(row, "AGE", "ERACO", "DAESU", "대수")
    digits = re.sub(r"\D", "", declared)
    if digits and digits != number[:2]:
        raise CollectionError("응답 대수와 의안번호가 다릅니다.")
    return number[:2]


def request(service, params):
    if not re.fullmatch(r"[A-Za-z0-9_]+", service):
        raise CollectionError("API 서비스명이 올바르지 않습니다.")
    key = os.environ.get("ASSEMBLY_API_KEY", "").strip()
    if not key:
        raise CollectionError("GitHub Secrets의 ASSEMBLY_API_KEY가 필요합니다.")
    query = {"KEY": key, "Type": "json", **params}
    url = BASE + service + "?" + urllib.parse.urlencode(query)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=40) as response:
                return json.loads(response.read().decode("utf-8-sig"))
        except (urllib.error.URLError, ValueError, TimeoutError):
            if attempt == 2:
                # Never print exception URLs, which contain the authentication key.
                raise CollectionError(f"{service}: 연결 또는 JSON 응답 오류. 인증키·서비스 권한 확인 필요") from None
            time.sleep(2 * (attempt + 1))


def parse(payload, service):
    if not isinstance(payload, dict):
        raise CollectionError(f"{service}: 예상하지 못한 응답 형식")
    blocks = payload.get(service)
    if blocks is None:
        # The response root can differ in case; do not accept a different API silently.
        blocks = next((v for k, v in payload.items() if k.lower() == service.lower()), None)
    results = []
    head = []
    rows = []
    if isinstance(blocks, list):
        for block in blocks:
            if isinstance(block, dict):
                head.extend(block.get("head", []))
                rows.extend(block.get("row", []))
    if isinstance(payload.get("RESULT"), dict):
        results.append(payload["RESULT"])
    results.extend(h["RESULT"] for h in head if isinstance(h, dict) and isinstance(h.get("RESULT"), dict))
    for result in results:
        code = str(result.get("CODE", ""))
        if code == "INFO-200":
            if rows:
                raise CollectionError(f"{service}: 빈 목록 코드와 데이터가 함께 반환됨")
            return [], 0
        if code and code != "INFO-000":
            safe_code = re.sub(r"[^A-Za-z0-9_-]", "", code)[:40]
            raise CollectionError(f"{service}: {safe_code}. 인증키·이용권한·대수 입력조건 확인 필요")
    total = next((h.get("list_total_count") for h in head if isinstance(h, dict) and "list_total_count" in h), None)
    if total is None or not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
        raise CollectionError(f"{service}: 공식 총건수 또는 목록 필드를 확인하지 못했습니다.")
    try:
        total = int(total)
    except (TypeError, ValueError):
        raise CollectionError(f"{service}: 총건수 형식 오류") from None
    if total < 0:
        raise CollectionError(f"{service}: 음수 총건수")
    return rows, total


def fetch_all(service, term, report, page_size=100):
    # Send both documented naming conventions. Validate returned terms: ignored
    # filters can never silently mix the 21st and 22nd assemblies.
    params = {"AGE": str(term), "ERACO": str(term), "pSize": page_size}
    found, raw_count, page, total = {}, 0, 1, None
    fingerprints = set()
    first_numbers = None
    while True:
        rows, declared = parse(request(service, {**params, "pIndex": page}), service)
        if total is None:
            total = declared
            report.update(service=service, term=str(term), officialCount=total)
        if declared != total:
            raise CollectionError(f"{service} {term}대: 수집 중 공식 총건수가 변경됐습니다. 재실행 필요")
        if not rows:
            if raw_count != total:
                raise CollectionError(f"{service} {term}대: 마지막 페이지 전에 조회가 중단됐습니다.")
            break
        numbers = [bill_number(row) for row in rows]
        fingerprint = hashlib.sha256("|".join(numbers).encode()).hexdigest()
        if fingerprint in fingerprints:
            raise CollectionError(f"{service} {term}대: 같은 페이지 반복. 페이지 입력조건 확인 필요")
        fingerprints.add(fingerprint)
        if page == 1:
            first_numbers = numbers
        for row, number in zip(rows, numbers):
            if term_of(row) != str(term):
                raise CollectionError(f"{service}: 대수 필터가 적용되지 않았습니다. AGE/ERACO 명세 확인 필요")
            if number in found:
                raise CollectionError(f"{service} {term}대: 목록에 중복 의안번호 {number}. 재실행 필요")
            found[number] = row
        raw_count += len(rows)
        report.update(pages=page, fetchedCount=raw_count, uniqueCount=len(found))
        if raw_count > total:
            raise CollectionError(f"{service} {term}대: 공식 총건수보다 많은 행이 반환됐습니다.")
        if raw_count == total:
            break
        page += 1
        time.sleep(.1)
    if not total:
        raise CollectionError(f"{service} {term}대: 전체 목록이 0건입니다. 기존 자료를 유지합니다.")
    # Check the first page again so new insertions during pagination cause a retry.
    check_rows, check_total = parse(request(service, {**params, "pIndex": 1}), service)
    if check_total != total or [bill_number(r) for r in check_rows] != first_numbers:
        raise CollectionError(f"{service} {term}대: 조회 도중 목록이 변경됐습니다. 재실행 필요")
    report["complete"] = True
    return found


def reconcile(master, reception, report):
    missing = sorted(set(reception) - set(master))
    extra = sorted(set(master) - set(reception))
    report.update(missingBillNumbers=missing, extraBillNumbers=extra,
                  missingCount=len(missing), extraCount=len(extra), matched=not missing and not extra)
    if missing or extra:
        raise CollectionError(f"공식 접수목록과 의안번호 불일치: 누락 {len(missing)}건, 추가 {len(extra)}건")


def atomic_json(path, payload):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(path)
