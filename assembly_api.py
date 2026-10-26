"""Strict, key-safe pagination for official Assembly list APIs (stdlib only)."""
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

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


def decode_response(body, service, status, content_type):
    """Accept official JSON/XML, and keep diagnostic output free of URLs/keys."""
    value = body.decode("utf-8-sig", errors="replace").strip()
    try:
        return json.loads(value)
    except ValueError:
        pass
    if re.search(r"<!doctype\s+html|<html\b", value[:500], re.I):
        raise CollectionError(f"{service}: HTTP {status}, HTML 안내/차단 페이지. 서비스 제공 상태 확인 필요")
    try:
        root = ET.fromstring(value)
    except ET.ParseError:
        kind = "HTML 안내/차단 페이지" if re.search(r"<!doctype\s+html|<html\b", value[:500], re.I) else "JSON/XML이 아닌 응답"
        raise CollectionError(f"{service}: HTTP {status}, {kind}. 서버 주소·서비스 제공 상태 확인 필요") from None
    tag = lambda node: node.tag.rsplit("}", 1)[-1]
    codes = [node.text or "" for node in root.iter() if tag(node).upper() == "CODE"]
    for code in codes:
        safe_code = re.sub(r"[^A-Za-z0-9_-]", "", code)[:40]
        if safe_code and safe_code != "INFO-000":
            return {"RESULT": {"CODE": safe_code}}
    if tag(root).lower() != service.lower():
        raise CollectionError(f"{service}: HTTP {status}, 예상하지 못한 XML 응답. 서비스 명세 확인 필요")
    total = next((node.text for node in root.iter() if tag(node).lower() == "list_total_count"), None)
    if total is None:
        raise CollectionError(f"{service}: XML 응답에 공식 총건수가 없습니다.")
    rows = [{tag(child): child.text or "" for child in node} for node in root if tag(node).lower() == "row"]
    return {service: [{"head": [{"list_total_count": total}, {"RESULT": {"CODE": "INFO-000"}}]}, {"row": rows}]}


def get_response(url):
    """Use the same Requests client as the existing, working collector."""
    try:
        import requests
    except ImportError:
        headers = {"Accept": "application/json, application/xml, text/xml", "User-Agent": "news-dashboard/1.1"}
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=40) as response:
                return response.status, response.headers.get("Content-Type", ""), response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.headers.get("Content-Type", ""), error.read()
        except TimeoutError:
            raise CollectionError("연결 시간 초과") from None
        except urllib.error.URLError as error:
            kind = "TLS 인증서/보안 연결 오류" if "SSL" in type(error.reason).__name__.upper() else "DNS 또는 서버 연결 오류"
            raise CollectionError(kind) from None
    try:
        response = requests.get(url, timeout=40)
        return response.status_code, response.headers.get("Content-Type", ""), response.content
    except requests.exceptions.SSLError:
        raise CollectionError("TLS 인증서/보안 연결 오류") from None
    except requests.exceptions.Timeout:
        raise CollectionError("연결 시간 초과") from None
    except requests.exceptions.RequestException:
        raise CollectionError("DNS 또는 서버 연결 오류") from None


def request(service, params):
    if not re.fullmatch(r"[A-Za-z0-9_]+", service):
        raise CollectionError("API 서비스명이 올바르지 않습니다.")
    key = os.environ.get("ASSEMBLY_API_KEY", "").strip()
    if not key:
        raise CollectionError("GitHub Secrets의 ASSEMBLY_API_KEY가 필요합니다.")
    query = {"KEY": key, "Type": "json", **params}
    url = BASE + service + "?" + urllib.parse.urlencode(query)
    last_error = ""
    for attempt in range(3):
        try:
            status, content_type, body = get_response(url)
        except CollectionError as error:
            last_error = f"{service}: {error}"
        else:
            if 200 <= status < 300:
                return decode_response(body, service, status, content_type)
            # Some errors are returned as official XML even with Type=json.
            try:
                payload = decode_response(body, service, status, content_type)
                code = str(payload.get("RESULT", {}).get("CODE", ""))
                code = code if re.fullmatch(r"(?:INFO|ERROR)-\d+", code) else ""
            except (CollectionError, AttributeError):
                code = ""
            label = {400: "요청 주소·입력조건 확인 필요", 401: "서비스 인증 확인 필요",
                     403: "서버 접근 차단 또는 서비스 접근권한 확인 필요",
                     404: "API 경로 또는 서비스명 확인 필요", 429: "호출량 제한"}.get(status, "국회 서버 응답 오류")
            last_error = f"{service}: HTTP {status}, {label}" + (f" ({code})" if code else "")
            if status not in (408, 429) and status < 500:
                raise CollectionError(last_error) from None
        if attempt < 2:
            time.sleep(2 * (attempt + 1))
    raise CollectionError(last_error + ". 잠시 뒤 재실행하거나 표시된 상태를 확인해 주세요.") from None


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


def select_term(service, term, report, page_size):
    # ERACO is a label (e.g. 제21대) on the integrated service; AGE is numeric
    # on older list services. Never intersect two different naming conventions.
    label = {"ERACO": f"제{term}대"}
    numeric = {"AGE": str(term)}
    candidates = [label, numeric, {"ERACO": str(term)}] if service.upper() in ("ALLBILL", "ALLBILLV2") else [numeric, label, {"ERACO": str(term)}]
    attempts = []
    report["termQueries"] = attempts
    for selector in candidates:
        params = {**selector, "pSize": page_size}
        rows, total = parse(request(service, {**params, "pIndex": 1}), service)
        attempt = {"selector": selector, "officialCount": total}
        attempts.append(attempt)
        if not rows and not total:
            attempt["status"] = "empty"
            continue
        if not rows or not total:
            raise CollectionError(f"{service}: 공식 총건수와 첫 페이지 응답이 일치하지 않습니다.")
        if any(term_of(row) != str(term) for row in rows):
            attempt["status"] = "wrong-term"
            continue
        attempt["status"] = "selected"
        report["termSelector"] = selector
        return params, (rows, total)
    raise CollectionError(f"{service} {term}대: 대수 입력 형식별 조회가 모두 0건이거나 다른 대수였습니다. 대수 필터·서비스 제공 범위 확인 필요. 기존 자료를 유지합니다.")


def fetch_all(service, term, report, page_size=100):
    params, preview = select_term(service, term, report, page_size)
    found, raw_count, page, total = {}, 0, 1, None
    fingerprints = set()
    first_numbers = None
    duplicates = {}
    conflicts = {}
    while True:
        rows, declared = preview if page == 1 else parse(request(service, {**params, "pIndex": page}), service)
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
        fingerprint = hashlib.sha256(json.dumps(rows, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        if fingerprint in fingerprints:
            raise CollectionError(f"{service} {term}대: 같은 페이지 반복. 페이지 입력조건 확인 필요")
        fingerprints.add(fingerprint)
        if page == 1:
            first_numbers = numbers
        for row, number in zip(rows, numbers):
            if term_of(row) != str(term):
                raise CollectionError(f"{service}: 대수 필터가 적용되지 않았습니다. AGE/ERACO 명세 확인 필요")
            if number in found:
                duplicates[number] = duplicates.get(number, 0) + 1
                previous = found[number]
                # A repeated bill number is normalizable data, not proof that
                # pagination failed. Keep the identity guard and page checks.
                old_id, new_id = text(previous.get("BILL_ID")), text(row.get("BILL_ID"))
                if old_id and new_id and old_id != new_id:
                    report["identityConflictBillNumber"] = number
                    # Retain public identity fields so the conflicting records can
                    # be compared without exposing request URLs or API credentials.
                    identity_fields = (
                        "BILL_NO", "BILL_NUMBER", "의안번호", "BILL_ID",
                        "AGE", "ERACO", "DAESU", "대수",
                        "BILL_NM", "BILL_NAME", "의안명",
                        "PPSL_DT", "PROPOSE_DT", "제안일자",
                        "LINK_URL", "DETAIL_LINK", "BILL_URL", "URL",
                        "PROPOSER", "PPSR_NM", "RPRS_PPSR_NM",
                    )
                    report["identityConflictRows"] = [
                        {key: candidate[key] for key in identity_fields if key in candidate}
                        for candidate in (previous, row)
                    ]
                    raise CollectionError(f"{service} {term}대: 같은 의안번호 {number}의 BILL_ID가 서로 다릅니다. 원문 대조 필요")
                different = {key: [previous[key], value] for key, value in row.items()
                             if key in previous and previous[key] not in (None, "", [])
                             and value not in (None, "", []) and previous[key] != value}
                if different:
                    details = conflicts.setdefault(number, {})
                    for key, values in different.items():
                        options = details.setdefault(key, [])
                        for value in values:
                            if value not in options:
                                options.append(value)
                # Fill complementary fields. Do not silently overwrite two
                # conflicting nonempty values with whichever row arrived last.
                found[number] = {**row, **{key: value for key, value in previous.items() if value not in (None, "", [])}}
            else:
                found[number] = dict(row)
        raw_count += len(rows)
        report.update(pages=page, fetchedCount=raw_count, uniqueCount=len(found),
                      countUnit="officialCount/fetchedCount는 API 행 수, uniqueCount는 중복 통합 후 의안 수",
                      duplicateRowCount=sum(duplicates.values()), duplicateBillNumbers=sorted(duplicates),
                      duplicateOccurrences=dict(sorted(duplicates.items())), duplicateFieldConflicts=conflicts)
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
