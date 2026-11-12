"""Offline regression tests using the attached 340-row official reference."""
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from shutil import copytree
from unittest.mock import patch

from assembly_api import CollectionError, bill_number, term_of, fetch_all
from assembly_collect import collect
from assembly_records import normalize
from official_receipts import load_reference
from repair_receipts import repair

ROOT = Path(__file__).resolve().parent
NOW = datetime(2026, 11, 12, 9, tzinfo=timezone(timedelta(hours=9)))
MISSING = {str(n) for n in range(2222657, 2222698)} | {"ZZ22145", "ZZ22147"}


class ReceiptTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        copytree(ROOT / "official-receipts", self.root / "official-receipts")
        _, self.rows = load_reference(self.root)
        self.master = {bill_number(r): r for r in self.rows if bill_number(r) not in MISSING}
        self.pending = {bill_number(r): r for r in self.rows if bill_number(r).isdigit() and bill_number(r) in MISSING}
        self.write("sample-bills.json", {"items": []})
        self.write("assembly-21.json", {"schemaVersion": 1, "assemblyTerm": "21", "updatedAt": "2026-10-26 14:30",
                                      "items": [{"billNo": "의안번호 2100001", "proposeDate": "2020-06-01"}]})
        self.write("assembly-22.json", {"schemaVersion": 1, "assemblyTerm": "22", "updatedAt": "2026-11-11 22:59",
                                      "items": [normalize(r, {}, "22", NOW) for r in self.master.values()]})
        self.write("assembly-index.json", {"schemaVersion": 1, "updatedAt": "2026-11-11 22:59", "terms": {
            "21": {"verified": True, "count": 1, "checkedAt": "2026-10-26 14:30"},
            "22": {"verified": True, "count": 297, "checkedAt": "2026-11-11 22:59"}}})

    def write(self, name, data):
        (self.root / name).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def read(self, name):
        return json.loads((self.root / name).read_text())

    def assert_340(self):
        items = self.read("assembly-22.json")["items"]
        self.assertEqual({bill_number({"BILL_NO": i["billNo"]}) for i in items}, {bill_number(r) for r in self.rows})
        self.assertEqual(len(items), 340)
        self.assertEqual(sum(i["isLaw"] for i in items), 334)

    def test_zz_identity_and_term(self):
        self.assertEqual(bill_number({"BILL_NO": "의안번호 ZZ22147"}), "ZZ22147")
        self.assertEqual(term_of({"BILL_NO": "ZZ22147", "AGE": "22"}), "22")
        with self.assertRaises(CollectionError):
            term_of({"BILL_NO": "ZZ22147", "AGE": "21"})

    def test_repair_matches_all_340_and_preserves_api_check_time(self):
        repair(self.root)
        self.assert_340()
        self.assertEqual(self.read("assembly-22.json")["updatedAt"], "2026-11-11 22:59")
        info = self.read("assembly-index.json")["terms"]["22"]
        self.assertEqual(info["websiteReference"]["addedCount"], 43)
        self.assertEqual(info["apiLatestProposalDate"], "2026-11-10")
        repair(self.root)
        self.assert_340()

    def test_api_lag_then_catchup_never_loses_or_duplicates_reference(self):
        def api(service, term, report):
            report.update(complete=True)
            return self.pending if service == "nwbqublzajtcqpdae" else self.master
        with patch("assembly_collect.fetch_all", side_effect=api):
            collect(root=self.root)
            self.assert_340()
        audit = self.read("assembly-audit.json")["terms"]["22"]
        self.assertEqual(audit["sources"]["pending"]["addedCount"], 41)
        self.assertEqual(audit["websiteReference"]["addedCount"], 2)
        self.master = {bill_number(r): r for r in self.rows}
        with patch("assembly_collect.fetch_all", side_effect=api):
            collect(root=self.root)
            self.assert_340()

    def test_failed_supplementary_api_is_visible_and_reference_survives(self):
        def api(service, term, report):
            if service == "nwbqublzajtcqpdae":
                raise CollectionError("테스트 연결 오류")
            return self.master
        with patch("assembly_collect.fetch_all", side_effect=api):
            collect(root=self.root)
        self.assert_340()
        info = self.read("assembly-index.json")["terms"]["22"]
        self.assertEqual(info["supplementarySource"]["status"], "failed")

    def test_date_conflict_does_not_publish(self):
        self.master[next(iter(self.master))]["PROPOSE_DT"] = "2026-11-09"
        before = (self.root / "assembly-22.json").read_bytes()
        with patch("assembly_collect.fetch_all", return_value=self.master):
            with self.assertRaises(CollectionError):
                collect(root=self.root)
        self.assertEqual((self.root / "assembly-22.json").read_bytes(), before)
        self.assertEqual(self.read("assembly-audit-failed.json")["status"], "failed")

    def test_previous_identity_is_retained_when_both_apis_drop_it(self):
        record = self.read("assembly-22.json")
        old = dict(record["items"][0], billNo="의안번호 2220000", proposeDate="2026-10-01")
        record["items"].append(old)
        self.write("assembly-22.json", record)
        with patch("assembly_collect.fetch_all", return_value=self.master):
            collect(root=self.root)
        result = self.read("assembly-22.json")["items"]
        self.assertIn("의안번호 2220000", [i["billNo"] for i in result])
        self.assertEqual(self.read("assembly-index.json")["terms"]["22"]["retainedPreviousCount"], 1)

    def test_repeated_api_page_still_rejected(self):
        row = next(iter(self.master.values()))
        payload = {"TEST": [{"head": [{"list_total_count": 2}]}, {"row": [row]}]}
        with patch("assembly_api.request", return_value=payload), patch("assembly_api.time.sleep"):
            with self.assertRaisesRegex(CollectionError, "같은 페이지 반복"):
                fetch_all("TEST", "22", {}, page_size=1)


if __name__ == "__main__":
    unittest.main()
