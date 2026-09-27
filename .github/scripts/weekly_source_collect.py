#!/usr/bin/env python3
"""Collect a dated weekly report candidate from published Data Lab sources.

This writes only local immutable candidates. It never publishes or fills gaps with zero.
"""

import argparse
import concurrent.futures
import csv
import gzip
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import statistics
import tempfile
import urllib.request

BASE = "https://vcbio.github.io/shelf/d/"
REFS = ("MAIN_SERIES_REF", "PRODUCTS_REF", "BROADCAST_REF", "YOUTUBE_REF",
        "KEYWORD_REF", "NEW_FORECAST_REF", "PERIOD_SUMMARY_REF", "MARKET_REFRESH_REF")


def fetch(ref, limit=55_000_000):
    if ref.startswith("/") or ".." in ref.split("/") or "://" in ref:
        raise ValueError("invalid source path")
    with urllib.request.urlopen(BASE + ref, timeout=45) as response:
        body = response.read(limit + 1)
        if response.status != 200 or len(body) > limit:
            raise ValueError("source status or size invalid: " + ref)
    return body


def dated_week(end):
    sunday = dt.date.fromisoformat(end)
    if sunday.weekday() != 6:
        raise ValueError("week end must be Sunday")
    return sunday - dt.timedelta(days=6), sunday


def extract_constant(html, name):
    marker = name + "="
    start = html.find(marker)
    if start < 0:
        raise ValueError("missing embedded source: " + name)
    return json.JSONDecoder().raw_decode(html[start + len(marker) :])[0]


def observed_product_sales(week_end, daily_dir, missing_log, snapshot_root=None):
    """Aggregate observed broadcast sale increments; do not infer whole-market sales."""
    start, end = dated_week(week_end)
    expected_columns = ["채널", "상품ID", "상품명", "브랜드", "주원료", "매칭방식",
                        "방송시작", "방송종료", "시작판매수(실측)", "종료판매수(실측)",
                        "증가분_방송판매량(실측)", "판매가", "추정매출(증가분x판매가, 추정)",
                        "스냅샷횟수", "건기식여부"]
    products, by_date, source_hashes, seen = {}, {}, {}, set()

    def broadcast_date(value):
        value = str(value or "")
        if re.match(r"^\d{4}-\d{2}-\d{2}", value):
            return value[:10]
        if re.match(r"^\d{8}", value):
            return value[:4] + "-" + value[4:6] + "-" + value[6:8]
        return None

    for offset in range(7):
        date = (start + dt.timedelta(days=offset)).isoformat()
        path = Path(daily_dir) / ("방송별판매-" + date + ".csv")
        raw = path.read_bytes()  # A missing day fails; never fill it with zero.
        source_hashes[date] = hashlib.sha256(raw).hexdigest()
        with path.open(encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            if reader.fieldnames != expected_columns:
                raise ValueError("broadcast sale schema mismatch: " + str(path))
            rows = list(reader)
        target = [row for row in rows if broadcast_date(row["방송시작"]) == date]
        measured = 0
        for row in target:
            value = row["증가분_방송판매량(실측)"]
            snapshots = row["스냅샷횟수"]
            if not value.isdigit() or not snapshots.isdigit() or int(snapshots) < 2:
                continue
            first, last = row["시작판매수(실측)"], row["종료판매수(실측)"]
            if not first.isdigit() or not last.isdigit() or int(last) - int(first) != int(value):
                raise ValueError("observed sale delta mismatch: " + date + " " + row["상품ID"])
            key = (row["채널"], row["상품ID"], row["방송시작"])
            if key in seen:
                raise ValueError("duplicate observed broadcast: " + str(key))
            seen.add(key)
            product_key = (row["채널"], row["상품ID"])
            item = products.setdefault(product_key, {"channel": row["채널"],
                "productId": row["상품ID"], "names": set(), "observedUnits": 0,
                "observedBroadcasts": 0, "days": set(), "producerHealthFlags": set()})
            item["names"].add(row["상품명"])
            item["producerHealthFlags"].add(row["건기식여부"])
            item["observedUnits"] += int(value)
            item["observedBroadcasts"] += 1
            item["days"].add(date)
            measured += 1
        positive = sum(row["증가분_방송판매량(실측)"].isdigit()
                       and row["스냅샷횟수"].isdigit()
                       and int(row["스냅샷횟수"]) >= 2
                       and int(row["증가분_방송판매량(실측)"]) > 0 for row in target)
        by_date[date] = {"sourceRows": len(rows), "targetDateRows": len(target),
                         "measuredBroadcasts": measured, "positiveBroadcasts": positive,
                         "zeroBroadcasts": measured - positive,
                         "positiveFraction": positive / measured if measured else None,
                         "measuredUnits": sum(int(row["증가분_방송판매량(실측)"])
                                              for row in target if row["증가분_방송판매량(실측)"].isdigit()
                                              and row["스냅샷횟수"].isdigit()
                                              and int(row["스냅샷횟수"]) >= 2)}

    with Path(missing_log).open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if reader.fieldnames != ["날짜", "예상횟수", "실제횟수", "결손횟수"]:
            raise ValueError("capture coverage schema mismatch")
        coverage_rows = {row["날짜"]: row for row in reader}
    coverage = {}
    for date in by_date:
        row = coverage_rows.get(date)
        if not row:
            raise ValueError("missing capture coverage: " + date)
        expected, actual, missing = (int(row[k]) for k in ("예상횟수", "실제횟수", "결손횟수"))
        if expected != actual + missing:
            raise ValueError("capture coverage arithmetic mismatch: " + date)
        coverage[date] = {"expected": expected, "actual": actual, "missing": missing}

    all_products = []
    for item in products.values():
        all_products.append({**item, "names": sorted(item["names"]), "days": sorted(item["days"]),
                             "producerHealthFlags": sorted(item["producerHealthFlags"])})
    all_products.sort(key=lambda row: (-row["observedUnits"], row["channel"], row["productId"]))
    flagged = [row for row in all_products if "Y" in row["producerHealthFlags"]]
    category_audit = None
    health_food = []
    if snapshot_root is not None:
        categories = {}
        snapshot_sources = {}
        for offset in range(7):
            day = (start + dt.timedelta(days=offset)).isoformat()
            folder = Path(snapshot_root) / day
            files = sorted(path for path in folder.glob("*.json.gz")
                           if re.fullmatch(r"[0-9]{4}\.json\.gz", path.name))
            if not files:
                raise ValueError("missing dated snapshots: " + day)
            digest = hashlib.sha256()
            for path in files:
                compressed = path.read_bytes()
                digest.update(path.name.encode() + hashlib.sha256(compressed).digest())
                raw = json.loads(gzip.decompress(compressed))
                for broadcast in raw.get("hsmoa", {}).get("live", []):
                    for product in broadcast.get("products", []):
                        key = (str(product.get("site") or ""), str(product.get("pid") or ""))
                        if not all(key):
                            continue
                        category = tuple(str(product.get(field) or "")
                                         for field in ("category1", "category2", "category3"))
                        categories.setdefault(key, set()).add(category)
            snapshot_sources[day] = {"files": len(files), "fingerprint": digest.hexdigest()}
        for item in all_products:
            values = categories.get((item["channel"], item["productId"]), set())
            item["sourceCategories"] = [list(value) for value in sorted(values)]
            item["categoryStatus"] = "single" if len(values) == 1 else (
                "conflict" if values else "missing")
            if len(values) == 1:
                category = next(iter(values))
                if category[:2] == ("식품", "건강식품"):
                    health_food.append(item)
        category_audit = {"source": "hsmoa public live product category",
                          "snapshotSources": snapshot_sources,
                          "matchedProducts": sum(row["categoryStatus"] != "missing" for row in all_products),
                          "conflictingProducts": sum(row["categoryStatus"] == "conflict" for row in all_products),
                          "unclassifiedProducts": sum(row["categoryStatus"] == "missing" for row in all_products),
                          "healthFoodCategoryProductCount": len(health_food),
                          "healthFoodCategoryTop30": health_food[:30]}
    total_expected = sum(row["expected"] for row in coverage.values())
    total_actual = sum(row["actual"] for row in coverage.values())
    fractions = [row["positiveFraction"] for row in by_date.values()
                 if row["positiveFraction"] is not None]
    typical_fraction = statistics.median(fractions) if fractions else None
    counter_anomalies = [day for day, row in by_date.items()
                         if typical_fraction is not None and row["measuredBroadcasts"] >= 100
                         and row["positiveFraction"] is not None
                         and row["positiveFraction"] < 0.05
                         and row["positiveFraction"] < typical_fraction / 4]
    return {"metric": "same-broadcast first-to-last captured sale count increase",
            "scope": "observed home-shopping channels and channel-specific product IDs only",
            "sourceSha256ByDay": source_hashes,
            "missingLogSha256": hashlib.sha256(Path(missing_log).read_bytes()).hexdigest(),
            "captureCoverage": {"byDate": coverage, "expected": total_expected,
                                "actual": total_actual, "missing": total_expected - total_actual,
                                "ratio": total_actual / total_expected if total_expected else None},
            "byDate": by_date, "typicalPositiveFraction": typical_fraction,
            "sourceCounterAnomalyDays": counter_anomalies,
            "allProducts": all_products,
            "producerHealthFlagCandidates": flagged[:30],
            "producerHealthFlagCandidateCount": len(flagged),
            "categoryAudit": category_audit,
            "status": "source_counter_anomaly" if counter_anomalies else
                      "candidate_category_and_channel_coverage_review_required",
            "marketWideSalesTop10Verified": False}


def collect(week_end):
    start, end = dated_week(week_end)
    previous_start = start - dt.timedelta(days=7)
    previous_end = start - dt.timedelta(days=1)
    html_bytes = fetch("vcbio-market-fable.html")
    html = html_bytes.decode("utf-8")
    refs = {}
    for name in REFS:
        match = re.search(r"\b" + name + r'=\"([^\"]+)\"', html)
        if not match:
            raise ValueError("missing page reference: " + name)
        refs[name] = match.group(1)
    sources = {}
    for name, ref in refs.items():
        raw = fetch(ref)
        sources[name] = {"ref": ref, "sha256": hashlib.sha256(raw).hexdigest(), "doc": json.loads(raw)}

    index = sources["MAIN_SERIES_REF"]["doc"]
    if len({item["id"] for item in index["items"]}) != len(index["items"]):
        raise ValueError("duplicate series IDs")
    series_folder = refs["MAIN_SERIES_REF"].rsplit("/", 1)[0] + "/"
    observed = [item for item in index["items"] if item["status"] == "observed"]

    def series_one(item):
        raw = fetch(series_folder + item["file"], limit=6_000_000)
        if hashlib.sha256(raw).hexdigest() != item["sha256"]:
            raise ValueError("series SHA mismatch: " + item["id"])
        doc = json.loads(raw)
        matching = [s for s in doc["series"] if s.get("id") == item["id"]]
        if len(matching) != 1:
            raise ValueError("series ID mismatch: " + item["id"])
        daily = {
            row["date"]: row["index"]
            for row in matching[0]["daily"]
            if isinstance(row.get("index"), (int, float))
        }

        def values(a, b):
            dates = [a + dt.timedelta(days=n) for n in range((b - a).days + 1)]
            values_found = [daily[day.isoformat()] for day in dates if day.isoformat() in daily]
            return {"days": len(values_found), "mean": statistics.fmean(values_found) if values_found else None}

        return item["id"], {"name": item["term"], "week": values(start, end), "previous": values(previous_start, previous_end)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        series = dict(pool.map(series_one, observed))

    products = sources["PRODUCTS_REF"]["doc"]

    def product_part(part):
        raw = fetch(part["file"], limit=20_000_000)
        if hashlib.sha256(raw).hexdigest() != part["sha256"]:
            raise ValueError("product part SHA mismatch: " + part["file"])
        rows = json.loads(raw)["rows"]
        if len(rows) != part["rows"]:
            raise ValueError("product part row count mismatch: " + part["file"])
        selected = [row for row in rows if start.strftime("%Y%m%d") <= str(row[4])[:8] <= end.strftime("%Y%m%d")]
        return len(rows), selected

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        parts = list(pool.map(product_part, products["parts"]))
    product_rows = [row for _, selected in parts for row in selected]
    if len({(str(row[1]), row[0]) for row in product_rows}) != len(product_rows):
        raise ValueError("duplicate weekly product row IDs")
    by_scope = {scope: sum(str(row[1]) == scope for row in product_rows) for scope in ("1", "3")}
    by_date = {day.isoformat(): sum(str(row[4])[:8] == day.strftime("%Y%m%d") for row in product_rows)
               for day in (start + dt.timedelta(days=n) for n in range(7))}
    # Missing dates have no source rows; retain null rather than manufacturing a zero.
    by_date = {key: value if value else None for key, value in by_date.items()}

    broadcast = sources["BROADCAST_REF"]["doc"]
    schedule = [row for row in broadcast["rows"] if start.isoformat() <= str(row.get("date", "")) <= end.isoformat()]
    if any(row.get("countEligible") and not row.get("slotKey") for row in schedule):
        raise ValueError("countable broadcast row without slot key")
    youtube = sources["YOUTUBE_REF"]["doc"]
    published_videos = [row for row in youtube["rows"] if start.isoformat() <= str(row.get("publishedDate", "")) <= end.isoformat()]

    catalog = {row["id"]: row for row in extract_constant(html, "DATA")}
    classified = {row["id"]: row for row in extract_constant(html, "CLASSIFICATION")["items"]}
    ranking = {row["id"]: row for row in extract_constant(html, "RANKING")["items"]}
    choices = {}
    for item in index["items"]:
        found = series.get(item["id"])
        if not found or found["week"]["days"] != 7 or found["previous"]["days"] != 7 or not found["previous"]["mean"]:
            continue
        volume = ranking.get(item["id"], {}).get("volume", {})
        if volume.get("exact") is not True or not volume.get("date") or not isinstance(volume.get("lower"), int):
            continue
        if found["week"]["mean"] <= found["previous"]["mean"]:
            continue
        definition = catalog.get(item["id"], {})
        classification = classified.get(item["id"], {})
        lane = "health" if classification.get("healthScope", definition.get("s2")) else (
            "general" if classification.get("generalScope", definition.get("s4")) else None)
        if not lane:
            continue
        choices.setdefault(volume["date"], {}).setdefault(lane, []).append({
            "id": item["id"], "name": item["term"], "volume": volume["lower"],
            "volumeCheckedAt": volume["date"], "weekMean": found["week"]["mean"],
            "previousMean": found["previous"]["mean"],
            "weekChangePct": (found["week"]["mean"] / found["previous"]["mean"] - 1) * 100,
        })
    eligible_dates = [date for date, lanes in choices.items() if all(len(lanes.get(lane, [])) >= 2 for lane in ("health", "general"))]
    selection_date = max(eligible_dates) if eligible_dates else None
    featured = {lane: sorted(choices[selection_date][lane], key=lambda row: -row["volume"])[:2]
                for lane in ("health", "general")} if selection_date else {"health": [], "general": []}

    coverage = []
    for item in index["items"]:
        found = series.get(item["id"])
        coverage.append({"id": item["id"], "name": item["term"], "sourceStatus": item["status"],
                         "weekDays": found["week"]["days"] if found else 0,
                         "previousDays": found["previous"]["days"] if found else 0})
    comparable = sum(row["weekDays"] == row["previousDays"] == 7 for row in coverage)
    registered = [row for row in coverage if row["id"].startswith("ing_")]
    extended = [row for row in coverage if row["id"].startswith("kw_")]
    if len(registered) + len(extended) != len(coverage):
        raise ValueError("unknown series ID type")
    keyword_doc = sources["KEYWORD_REF"]["doc"]
    forecast_doc = sources["NEW_FORECAST_REF"]["doc"]
    period_doc = sources["PERIOD_SUMMARY_REF"]["doc"]
    market_doc = sources["MARKET_REFRESH_REF"]["doc"]
    market_sources = [
        {"section": item.get("section"), "status": item.get("status"),
         "observedDate": item.get("observedDate")}
        for item in market_doc.get("sources", [])
    ]
    danawa = next((item for item in market_doc.get("sources", []) if item.get("section") == "danawa"), {})
    category_states = list(danawa.get("categoryStates", {}).values())
    return {
        "week": {"start": start.isoformat(), "end": end.isoformat()},
        "sourceHtmlSha256": hashlib.sha256(html_bytes).hexdigest(),
        "sources": {name: {"ref": refs[name], "sha256": value["sha256"]} for name, value in sources.items()},
        "coverage": {"seriesIndexItems": len(coverage), "comparableAll": comparable,
                     "registeredIngredients": len(registered),
                     "registeredComparable": sum(row["weekDays"] == row["previousDays"] == 7 for row in registered),
                     "extendedKeywords": len(extended),
                     "extendedComparable": sum(row["weekDays"] == row["previousDays"] == 7 for row in extended),
                     "notComparableAll": len(coverage) - comparable, "byId": coverage},
        "products": {"snapshot": products["snapshot"], "allSourceRows": sum(size for size, _ in parts),
                     "weekRows": len(product_rows), "healthRows": by_scope["1"],
                     "generalFoodCandidateRows": by_scope["3"], "byDate": by_date,
                     "generalFoodFunctionalStatus": "unverified_per_product"},
        "broadcast": {"asOf": broadcast["meta"]["asOfDate"], "rows": len(schedule),
                      "slots": len({row.get("slotKey") for row in schedule if row.get("countEligible")}),
                      "channels": len({row.get("channel") for row in schedule}),
                      "freshness": {status: sum(row.get("scheduleFreshness") == status for row in schedule)
                                    for status in sorted({row.get("scheduleFreshness") for row in schedule})}},
        "youtube": {"publishedWeekRows": len(published_videos), "asOf": youtube["meta"].get("asOf")},
        "otherPublishedSources": {
            "keywords": {"asOf": keyword_doc.get("meta", {}).get("asOf"),
                         "rows": len(keyword_doc.get("rows", []))},
            "forecast": {"asOf": forecast_doc.get("asOf"), "items": len(forecast_doc.get("items", [])),
                         "calculated": sum(item.get("status") == "calculated" for item in forecast_doc.get("items", []))},
            "periodSummary": {"asOf": period_doc.get("source", {}).get("asOf"),
                              "observed": period_doc.get("source", {}).get("observedIngredients"),
                              "missing": period_doc.get("source", {}).get("missingIngredients")},
            "market": {"sources": market_sources, "danawaCategories": len(category_states),
                       "danawaRefreshed": sum(item.get("status") == "refreshed" for item in category_states),
                       "naverRows": len(market_doc.get("fableRetail", {}).get("naver", {}).get("rows", [])),
                       "coupangRows": len(market_doc.get("fableRetail", {}).get("coupang", {}).get("rows", []))},
        },
        "selectionDate": selection_date, "featured": featured,
        "readyForPublication": False,
        "reason": "source completeness and product-level functional classification require review",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--week-end", required=True, help="Sunday YYYY-MM-DD")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--daily-broadcast-dir", type=Path)
    parser.add_argument("--missing-log", type=Path)
    parser.add_argument("--snapshot-root", type=Path)
    args = parser.parse_args()
    if args.snapshot_root and not args.daily_broadcast_dir:
        parser.error("--snapshot-root needs --daily-broadcast-dir")
    if bool(args.daily_broadcast_dir) != bool(args.missing_log):
        parser.error("--daily-broadcast-dir and --missing-log must be supplied together")
    summary = collect(args.week_end)
    if args.daily_broadcast_dir:
        summary["observedProductSales"] = observed_product_sales(
            args.week_end, args.daily_broadcast_dir, args.missing_log, args.snapshot_root)
    body = (json.dumps(summary, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()
    digest = hashlib.sha256(body).hexdigest()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    generation = args.output_dir / ("week-" + args.week_end + "-" + digest[:16] + ".json")
    if generation.exists() and generation.read_bytes() != body:
        raise ValueError("immutable generation differs")
    if not generation.exists():
        generation.write_bytes(body)
    pointer = {"weekEnd": args.week_end, "generation": generation.name, "sha256": digest,
               "readyForPublication": summary["readyForPublication"]}
    fd, temporary = tempfile.mkstemp(prefix=".weekly-pointer-", dir=args.output_dir)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(pointer, file, ensure_ascii=False, sort_keys=True)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, args.output_dir / "latest-candidate.json")
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(json.dumps({"generation": str(generation), "sha256": digest,
                      "registeredComparable": summary["coverage"]["registeredComparable"],
                      "registeredIngredients": summary["coverage"]["registeredIngredients"],
                      "extendedComparable": summary["coverage"]["extendedComparable"],
                      "extendedKeywords": summary["coverage"]["extendedKeywords"],
                      "readyForPublication": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
