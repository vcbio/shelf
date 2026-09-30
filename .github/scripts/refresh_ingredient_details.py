#!/usr/bin/env python3
"""Refresh the 631 legacy detail JSON files from current published source sidecars.

Unknown axes stay null. No request is sent to a third-party site; this job only
reads the already published, locally tracked input generations.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def literal(source, key):
    match = re.search(r"\b" + re.escape(key) + r"\s*=\s*", source)
    if not match:
        raise ValueError("missing declaration: " + key)
    return json.JSONDecoder().raw_decode(source[match.end():])[0]


def period_value(row, days, field):
    if not row or row.get("status") != "observed":
        return None
    period = next((item for item in row.get("periods", []) if item.get("days") == days), None)
    if not period or period.get("missingDays") or period.get("observedDays") != days:
        return None
    value = period.get(field)
    return value if isinstance(value, (int, float)) else None


def refresh(root):
    directory = root / "d"
    html = (directory / "vcbio-market-fable.html").read_text()
    source_rows = literal(html, "const DATA")
    if len(source_rows) != 631 or len({row["id"] for row in source_rows}) != 631:
        raise ValueError("631 unique ingredient IDs required")
    refs = {key: literal(html, key) for key in
            ("PERIOD_SUMMARY_REF", "REPORT_LINKS_REF", "NEW_FORECAST_REF", "CLASSIFICATION_REF")}
    inputs = {key: directory / value for key, value in refs.items()}
    for key, path in inputs.items():
        if not path.is_file() or not path.resolve().is_relative_to(directory.resolve()):
            raise ValueError("missing or escaping input: " + key)
    period = json.loads(inputs["PERIOD_SUMMARY_REF"].read_text())
    reports = json.loads(inputs["REPORT_LINKS_REF"].read_text())
    forecast = json.loads(inputs["NEW_FORECAST_REF"].read_text())
    classification = json.loads(inputs["CLASSIFICATION_REF"].read_text())
    if period.get("status") != "complete" or period.get("source", {}).get("zeroFill") is not False:
        raise ValueError("period source is incomplete or zero-filled")
    if reports.get("schemaVersion") != "healthfood-report-links.a348.v1" or len(reports.get("rows", [])) != 631:
        raise ValueError("report links are incomplete")
    if (classification.get("schemaVersion") != "healthfood-classification.a348.v1"
            or classification.get("denominator") != 631
            or len(classification.get("rows", [])) != 631):
        raise ValueError("classification is incomplete")
    if reports.get("sourceSha256", {}).get("classification") != sha(inputs["CLASSIFICATION_REF"]):
        raise ValueError("report links and classification do not share a generation")
    by_name = {row["name"]: row for row in classification["rows"]}
    required_products = {"흑염소진액": "진액", "양배추즙": "즙", "마늘즙": "즙",
                         "양파즙": "즙", "사과즙": "즙", "생강차": "차"}
    if any(by_name.get(name, {}).get("branch") != "건강보조식품" or
           by_name[name].get("productForm") != form for name, form in required_products.items()):
        raise ValueError("stale classification pointer would undo the six health-support products")
    if by_name.get("비오틴", {}).get("recognitionStatus") != "고시형":
        raise ValueError("stale classification pointer would undo the official biotin correction")
    day = period["source"]["asOf"]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        raise ValueError("invalid observed date")
    period_by_id = {row["id"]: row for row in period["ingredients"]}
    report_by_id = {row["id"]: row for row in reports["rows"]}
    class_by_id = {row["id"]: row for row in classification["rows"]}
    if len(class_by_id) != 631 or {row["id"] for row in source_rows} != set(class_by_id):
        raise ValueError("classification IDs do not match the detail files")
    forecast_by_id = {row["id"]: row for row in forecast.get("items", [])}
    ranking_by_id = {row["id"]: row for row in literal(html, "RANKING")["items"]}
    source_hashes = {key: sha(path) for key, path in inputs.items()}
    statuses = {"updated": 0, "unchanged": 0, "observed": 0, "currentThrough": 0,
                "staleObserved": 0, "noSource": 0,
                "monthlyPositiveZero30": 0}
    changes = []
    for row in source_rows:
        rel = row.get("detailRef", "")
        path = directory / rel
        if (not re.fullmatch(r"data-[0-9a-f]+/ing_[0-9a-f]+\.json", rel)
                or not path.is_file() or not path.resolve().is_relative_to(directory.resolve())):
            raise ValueError("invalid detail path: " + rel)
        old = json.loads(path.read_text())
        if old.get("id") != row["id"] or old.get("name") != row["name"]:
            raise ValueError("detail ID/name mismatch: " + row["id"])
        current = period_by_id.get(row["id"])
        link = report_by_id.get(row["id"])
        if not link or link["name"] != row["name"]:
            raise ValueError("report link ID/name mismatch: " + row["id"])
        shared = class_by_id[row["id"]]
        if shared["name"] != row["name"] or any(not shared.get(key) for key in
                ("branch", "recognitionStatus", "domesticDistribution", "productForm", "functionCategory")):
            raise ValueError("classification ID/name/field mismatch: " + row["id"])
        volume = ranking_by_id.get(row["id"], {}).get("volume") or {}
        forecast_item = forecast_by_id.get(row["id"], {})
        eligible_horizons = sorted(item["horizon_weeks"] for item in forecast_item.get("forecasts", [])
                                   if item.get("platform_eligible") is True and isinstance(item.get("horizon_weeks"), int))
        next_row = dict(old)
        next_row["branch"] = shared["branch"]
        next_row["grade"] = shared["recognitionStatus"]
        next_row["cat"] = shared["functionCategory"]
        next_row["dist"] = shared["domesticDistribution"]
        next_row["s2"] = shared["branch"] == "건강기능식품 원료"
        next_row["s4"] = shared["branch"] == "건강보조식품 원료"
        next_row["classification"] = {
            "branch": shared["branch"],
            "recognitionStatus": shared["recognitionStatus"],
            "domesticDistribution": shared["domesticDistribution"],
            "productForm": shared["productForm"],
            "functionCategory": shared["functionCategory"],
            "tags": shared.get("tags", []),
            "recognitions": shared.get("recognitions", []),
        }
        observed = current and current.get("status") == "observed"
        observed_end = current.get("observedEnd") if observed else None
        statuses["observed" if observed else "noSource"] += 1
        if observed:
            statuses["currentThrough" if observed_end == day else "staleObserved"] += 1
        next_row["obs1"] = observed_end
        next_row["spEnd"] = observed_end
        next_row["wEnd"] = observed_end
        next_row["dStart"] = current.get("observedStart") if observed else None
        next_row["dEnd"] = observed_end
        next_row["a7"] = period_value(current, 7, "mean")
        next_row["a30"] = period_value(current, 30, "mean")
        next_row["a90"] = period_value(current, 90, "mean")
        next_row["a365"] = period_value(current, 365, "mean")
        next_row["w"] = period_value(current, 7, "changeRatePct")
        next_row["m"] = period_value(current, 30, "changeRatePct")
        next_row["periods"] = {
            str(item["days"]): {
                "start": item.get("start"), "end": item.get("end"),
                "days": item["days"], "observed_days": item.get("observedDays"),
                "missing_days": item.get("missingDays"), "mean": item.get("mean"),
                "previous_mean": item.get("previousMean"), "change_pct": item.get("changeRatePct"),
                "unit": current.get("normalizationUnit") if current else None,
            }
            for item in (current.get("periods", []) if observed else [])
        }
        next_row["search"] = (volume.get("lower") if isinstance(volume.get("lower"), (int, float))
                              and volume.get("lower") > 0 else None)
        next_row["searchExact"] = volume.get("status") == "정확일치" and volume.get("exact") is True
        # These axes do not have a current like-for-like replacement in this
        # legacy shape. Keep their absence explicit instead of presenting 9/7
        # or 8/31 values as current.
        next_row.update({
            "selectedSeries": [], "d400": [], "w156": [], "weekMeta": [],
            "yr": {}, "sp": [], "demographic": None, "shop": None,
            "shopCh": None, "shopEnd": None, "forecastV4": None,
            "r1": None, "r3": None, "r7": None, "r30": None,
            "r90": None, "r365": None, "rFirm": None, "rAsOf": None,
            "p1": None, "p3": None, "hs": None, "hsl": None, "pins": [],
        })
        next_row["reportLinks"] = {
            "healthFunctionalReports": link["healthFunctionalReports"],
            "healthSupportReportsProvisional": link["healthSupportReportsProvisional"],
            "heldGeneralReports": link["heldGeneralReports"],
            "sourceAsOf": reports["asOf"],
        }
        quality = dict(next_row.get("qualityFlags") or {})
        quality["forecast"] = (
            ("제공 조건 통과: " + ", ".join(str(h) + "주" for h in eligible_horizons)
             if eligible_horizons else
             "계산값은 있으나 제공 조건 미통과" if forecast_item.get("status") == "calculated"
             else "예측 원천 관측 부족")
            if forecast.get("asOf") == day else
            "일별 검색 " + day + " / 예측 " + str(forecast.get("asOf")) + " 기준일 불일치"
        )
        quality["legacyAxes"] = "대체 원본이 없는 과거 쇼핑 클릭·제조 창별 값은 공개 상세에서 제외"
        quality["daily"] = ("마지막 실제 관측 " + observed_end if observed_end else "일별 검색지수 자료 없음")
        next_row["qualityFlags"] = quality
        next_row["metricNotes"] = {
            "search": "월 검색량 search는 확인된 최소값이며 searchExact=false면 확정치가 아님; " +
                      "네이버 데이터랩 일별 상대지수 마지막 관측 " +
                      (observed_end or "자료 없음") + "; 원본 묶음 " + day +
                      "; 월 검색량은 별도 검색광고 참고값",
            "registration": "C003/C002 원료명 연결 " + reports["asOf"] + " 원본; 세 갈래 건수는 reportLinks 참고",
            "product": "C003 전체 " + str(reports["sourceCounts"]["C003Total"]) +
                       "건 중 연결 " + str(reports["sourceCounts"]["C003LinkedReports"]) +
                       "건. 미연결을 0 판매로 보지 않음",
            "shop": "과거 쇼핑 클릭 지수는 최신 관측이 없어 제거; 현재 상품 표시는 별도 소매 자료에서 확인",
        }
        next_row["q"] = {
            "asOf": {"일별지수": observed_end,
                     "월검색량": volume.get("date"), "쇼핑": None,
                     "제조보고": reports["asOf"]},
            "status": "관측" if observed else "검색지수 자료 없음",
        }
        next_row["refreshMeta"] = {
            "periodAsOf": day, "observedThrough": observed_end,
            "reportAsOf": reports["asOf"],
            "forecastAsOf": forecast.get("asOf"), "sourceSha256": source_hashes,
            "forecastEligibleHorizonWeeks": eligible_horizons if forecast.get("asOf") == day else [],
            "missingIsNotZero": True,
        }
        if isinstance(next_row.get("search"), (int, float)) and next_row["search"] > 0 and next_row["a30"] == 0:
            statuses["monthlyPositiveZero30"] += 1
        payload = json.dumps(next_row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
        if payload == path.read_bytes():
            statuses["unchanged"] += 1
        else:
            changes.append((path, payload))
    if len(changes) + statuses["unchanged"] != 631:
        raise ValueError("not all details accounted for")
    # Validate the entire generation before the first file is replaced.
    for path, payload in changes:
        decoded = json.loads(payload)
        if not decoded.get("refreshMeta", {}).get("missingIsNotZero"):
            raise ValueError("invalid refreshed detail: " + str(path))
    for path, payload in changes:
        temp = path.with_suffix(".json.tmp")
        temp.write_bytes(payload)
        temp.replace(path)
    statuses["updated"] = len(changes)
    return {"asOf": day, "reportsAsOf": reports["asOf"], **statuses}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    args = parser.parse_args()
    print(json.dumps(refresh(args.root.resolve()), ensure_ascii=False))


if __name__ == "__main__":
    main()
