#!/usr/bin/env python3
"""Render a dated, factual weekly Data Lab issue from a verified source snapshot.

This script does not invent sales totals or turn missing dates into zero. It writes
only the requested HTML path; publishing and board registration are separate.
"""

import argparse
import collections
import datetime as dt
import hashlib
import html
import json
from pathlib import Path


def embedded(source, name):
    marker = name + "="
    start = source.find(marker)
    if start < 0:
        raise ValueError(f"embedded {name} missing")
    return json.JSONDecoder().raw_decode(source[start + len(marker):])[0]


class PendingSources(ValueError):
    """A closed week has not yet reached all required published source dates."""


def h(value):
    return html.escape(str(value if value is not None else ""), quote=True)


def number(value):
    return f"{value:,}" if isinstance(value, int) else "미확인"


def source_doc(root, summary, key):
    ref = summary["sources"][key]["ref"]
    if ref.startswith("/") or ".." in ref.split("/") or "://" in ref:
        raise ValueError(f"unsafe source reference: {ref}")
    payload = (root / "d" / ref).read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    if digest != summary["sources"][key]["sha256"]:
        raise ValueError(f"source changed since collection: {key}")
    return json.loads(payload), ref


def weekly_data(root, summary):
    start = dt.date.fromisoformat(summary["week"]["start"])
    end = dt.date.fromisoformat(summary["week"]["end"])
    if end.weekday() != 6 or (end - start).days != 6:
        raise ValueError("weekly window must be Monday through Sunday")
    index, _ = source_doc(root, summary, "MAIN_SERIES_REF")
    products, _ = source_doc(root, summary, "PRODUCTS_REF")
    broadcast, broadcast_ref = source_doc(root, summary, "BROADCAST_REF")
    youtube, youtube_ref = source_doc(root, summary, "YOUTUBE_REF")
    forecast, _ = source_doc(root, summary, "NEW_FORECAST_REF")
    source_doc(root, summary, "KEYWORD_REF")
    source_doc(root, summary, "PERIOD_SUMMARY_REF")
    source_doc(root, summary, "MARKET_REFRESH_REF")
    dates = {
        "series": index["asOf"], "products": products["snapshot"],
        "broadcast": broadcast["meta"]["asOfDate"],
        "youtube": youtube["meta"]["asOf"], "forecast": forecast["asOf"],
    }
    if any(date < end.isoformat() for date in dates.values()):
        raise PendingSources(f"source has not reached closed week {end}: {dates}")
    source = (root / "d" / "vcbio-market-fable.html").read_text(encoding="utf-8")
    data = {v["id"]: v for v in embedded(source, "DATA")}
    overrides = {v["id"]: v for v in embedded(source, "CLASSIFICATION")["items"]}
    ranking = embedded(source, "RANKING")
    if len(data) != 631 or len(ranking["items"]) != 631:
        raise ValueError("ingredient denominator changed; review ranking logic")
    if str(ranking.get("volumeRefresh", {}).get("asOf") or "") < end.isoformat():
        raise PendingSources("monthly keyword lookup has not reached the closed week")
    lanes = {"health": [], "general": []}
    # Official membership/term ambiguity was left unresolved in the approved first issue.
    excluded_ids = {"ing_304fbb1a972d232d", "ing_ba7da3f885a3d688"}  # 프로폴리스, 크롬
    for row in ranking["items"]:
        if row["id"] in excluded_ids:
            continue
        definition = data.get(row["id"], {})
        volume = row.get("volume") or {}
        if definition.get("role") != "원료" or not volume.get("eligible") or not isinstance(volume.get("lower"), int):
            continue
        override = overrides.get(row["id"], {})
        for lane, field, fallback in (("health", "healthScope", "s2"), ("general", "generalScope", "s4")):
            if override.get(field, definition.get(fallback)):
                lanes[lane].append({"name": definition["name"], "volume": volume["lower"],
                                    "upper": volume.get("upperExclusive"), "date": volume.get("date"),
                                    "exact": volume.get("exact") is True, "id": row["id"]})
    for lane in lanes:
        lanes[lane] = sorted(lanes[lane], key=lambda x: (-x["volume"], x["name"]))[:10]
        if len(lanes[lane]) != 10:
            raise ValueError(f"not enough sourced keyword candidates: {lane}")
    all_schedule = [r for r in broadcast["rows"] if start.isoformat() <= r.get("date", "") <= end.isoformat()
                    and r.get("countEligible") and r.get("slotKey")]
    schedule = [r for r in all_schedule if r.get("scheduleFreshness") == "live_observed_at_capture"]
    preserved_slots = {r["slotKey"] for r in all_schedule if r.get("scheduleFreshness") != "live_observed_at_capture"}
    slots = {r["slotKey"] for r in schedule}
    groups = collections.defaultdict(lambda: {"slots": set(), "channels": set(), "prices": set(), "names": set()})
    for row in schedule:
        key = row.get("groupId") or row.get("groupName") or row["slotKey"]
        group = groups[key]
        group["slots"].add(row["slotKey"])
        group["channels"].add(row.get("channel") or "채널 미제공")
        group["names"].add(row.get("groupName") or row.get("productName") or "상품명 미제공")
        if row.get("priceRaw"):
            group["prices"].add(str(row["priceRaw"]))
    top_broadcast = sorted(groups.values(), key=lambda x: (-len(x["slots"]), sorted(x["names"])[0]))[:3]
    videos = [r for r in youtube["rows"] if start.isoformat() <= str(r.get("publishedDate", "")) <= end.isoformat()]
    mentioned = [r for r in videos if r.get("ingredients")]
    terms = collections.Counter(term for video in mentioned for term in set(video["ingredients"]))
    news_scope = embedded(source, "NEWS_SCOPE")
    if str(news_scope.get("asOf") or "") < end.isoformat():
        raise PendingSources("MFDS news source has not reached the closed week")
    news_marker = "news:"
    news_start = source.find(news_marker, source.find("const AUX="))
    if news_start < 0:
        raise ValueError("news source missing")
    news = json.JSONDecoder().raw_decode(source[news_start + len(news_marker):])[0]
    weekly_news = [news[v["sourceIndex"]] for v in news_scope["items"]
                   if start.isoformat() <= news[v["sourceIndex"]].get("날짜", "") <= end.isoformat()]
    weekly_news.sort(key=lambda v: v["날짜"], reverse=True)
    return {"start": start, "end": end, "lanes": lanes, "slots": slots,
            "channels": {r.get("channel") for r in schedule if r.get("channel")},
            "broadcast": top_broadcast, "broadcast_ref": broadcast_ref, "preserved_slots": preserved_slots,
            "videos": videos, "mentioned": mentioned, "terms": terms,
            "youtube_ref": youtube_ref, "news": weekly_news[:2],
            "products": summary["products"], "coverage": summary["coverage"],
            "source_dates": dates, "forecast": summary["otherPublishedSources"]["forecast"]}


CSS = """
:root{--paper:#f5f3ee;--ink:#17251f;--green:#1e3932;--accent:#1e6a50;--muted:#526259;--rule:#d9dfd7}
*{box-sizing:border-box}html{background:var(--paper)}body{margin:0;color:var(--ink);font:14px/1.5 Pretendard,'Noto Sans KR',sans-serif}a{color:var(--green);text-underline-offset:3px}.sheet{width:min(100%,820px);min-height:1060px;margin:20px auto;padding:40px 46px;background:#fff}.mast{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--green);padding-bottom:11px}.mast img{width:145px}.mast span{font-size:12px;color:var(--muted);text-align:right}.eyebrow{margin:21px 0 4px;color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.08em}h1{font-size:32px;line-height:1.16;letter-spacing:-.03em;margin:0 0 10px}h2{font-size:18px;margin:0 0 8px}h3{font-size:14px;margin:0 0 5px}.lead{font-size:14px;color:var(--muted);margin:0 0 17px}.hero{background:var(--green);color:white;padding:23px;display:grid;grid-template-columns:135px 1fr;gap:20px}.hero strong{font-size:76px;line-height:1}.hero p{margin:3px 0}.hero small{color:#d7e7de}.metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.metrics div{background:white;padding:10px;border:1px solid var(--rule)}.metrics strong{font-size:19px;color:var(--green)}.metrics small{display:block;color:var(--muted)}.section{margin-top:20px}.bars{display:grid;gap:7px}.bar{display:grid;grid-template-columns:1fr 100px;gap:7px;align-items:center}.bar b{min-width:0;overflow-wrap:anywhere}.bar em{text-align:right;font-style:normal;font-weight:700}.track{grid-column:1/-1;height:5px;background:#e7eee9}.track i{display:block;height:100%;background:var(--accent)}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.cards article{border:1px solid var(--rule);padding:12px;overflow-wrap:anywhere}.cards article strong{display:block;color:var(--green);font-size:26px}.cards article small{display:block;color:var(--muted);font-size:11.5px}.rank-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.rank-list{list-style:none;padding:0;margin:0}.rank-list li{display:grid;grid-template-columns:27px minmax(0,1fr) auto;gap:6px;padding:6px 0;border-bottom:1px solid var(--rule);font-size:12.5px}.rank-list li b{min-width:0;overflow-wrap:anywhere}.rank-list li em{font-style:normal;font-weight:700;white-space:nowrap}.rank-list li small{grid-column:2/-1;color:var(--muted)}.news{display:grid;grid-template-columns:1fr 1fr;gap:8px}.news article{padding:12px;background:#f0f5f1}.news p{margin:0 0 5px}.caption,.note{font-size:11.5px;color:var(--muted);line-height:1.5}.note{padding:10px 12px;background:#f3f6f2}.foot{border-top:1px solid var(--rule);display:flex;justify-content:space-between;color:var(--muted);font-size:11px;margin-top:20px;padding-top:9px}
@media screen and (max-width:600px){.sheet{margin:0;min-height:0;padding:23px 18px}.mast img{width:120px}h1{font-size:26px}.hero{grid-template-columns:1fr}.hero strong{font-size:62px}.rank-grid,.news{grid-template-columns:1fr}.cards{grid-template-columns:1fr}.bar{grid-template-columns:1fr 86px}}
@page{size:A4;margin:0}@media print{html,body{background:white;print-color-adjust:exact;-webkit-print-color-adjust:exact}.sheet{width:210mm;min-height:0;height:297mm;overflow:hidden;margin:0;padding:10mm 13mm 4mm;break-after:page}.sheet:last-child{break-after:auto}.hero strong{font-size:48pt}.section{margin-top:4mm}.rank-list li{padding:1.2mm 0}.foot{margin-top:3mm}.sheet:nth-of-type(2){font-size:11.5px;line-height:1.32}.sheet:nth-of-type(2) h1{font-size:22px}.sheet:nth-of-type(2) h2{font-size:14px}.sheet:nth-of-type(2) .lead{font-size:10.5px;margin-bottom:2mm}.sheet:nth-of-type(2) .section{margin-top:2mm}.sheet:nth-of-type(2) .rank-list li{font-size:10.5px;padding:.7mm 0}.sheet:nth-of-type(2) .rank-list li small{font-size:9.8px}.sheet:nth-of-type(2) .rank-grid{gap:3mm}.sheet:nth-of-type(2) .news article{padding:2mm}.sheet:nth-of-type(2) .note,.sheet:nth-of-type(2) .caption{font-size:10px;line-height:1.3}}
"""


def render(summary, data):
    start, end = data["start"], data["end"]
    month = end.month
    first_weekday = end.replace(day=1).weekday()
    week_in_month = (end.day + first_weekday - 1) // 7 + 1
    week = f"{month}월 {week_in_month}주차"
    period = f"{start.isoformat()}~{end.isoformat()}"
    declared = data["products"]
    by_date = declared["byDate"]
    missing_days = [day for day, value in by_date.items() if value is None]
    broadcast = data["broadcast"]
    def top_cards():
        if not broadcast:
            return '<p class="note">연결된 편성 상품이 확인되지 않았습니다. 실제 편성 0건으로 단정하지 않습니다.</p>'
        parts = []
        for group in broadcast:
            name = sorted(group["names"])[0]
            price = ", ".join(f"{int(value):,}" if value.isdigit() else value for value in sorted(group["prices"])) or "미제공"
            parts.append(f'<article><strong>{len(group["slots"])}건</strong><h3>{h(name)}</h3><small>{h(", ".join(sorted(group["channels"])))}</small><small>판매가 원문 {h(price)} · 통화·옵션 미확인</small></article>')
        return ''.join(parts)
    def rank_html(rows):
        max_value = rows[0]["volume"]
        out = []
        for index, row in enumerate(rows, 1):
            value = number(row["volume"])
            if not row["exact"] and isinstance(row["upper"], int):
                value += "~" + number(row["upper"] - 1)
            width = max(5, min(100, row["volume"] / max_value * 100))
            url = f'vcbio-market-fable.html#view=ingredients&id={h(row["id"])}&tab=trend&from={start.isoformat()}&to={end.isoformat()}'
            out.append(f'<li><span>{index:02}</span><b><a href="{url}">{h(row["name"])}</a></b><em>{value}</em><small>{h(row["date"] or "조회일 미제공")} 조회 · 월간 참고값</small><span class="track" style="grid-column:1/-1"><i style="width:{width:.1f}%"></i></span></li>')
        return ''.join(out)
    featured = summary.get("featured", {})
    signals = [row for lane in ("health", "general") for row in featured.get(lane, [])]
    signals_html = ''.join(f'<div class="bar"><b>{h(row["name"])}</b><em>+{row["weekChangePct"]:.1f}%</em><span class="track"><i style="width:{min(100, row["weekChangePct"] * 2):.1f}%"></i></span></div>' for row in signals[:4]) or '<p class="note">완전한 두 주 관측과 같은 날 검색량을 갖춘 비교 항목이 부족합니다.</p>'
    terms = data["terms"]
    terms_html = ', '.join(f'{h(term)} {count}개 영상' for term, count in terms.most_common(8)) or '원료명 연결 영상 미확인'
    news_html = ''.join(f'<article><h3>{h(row.get("제목") or row.get("갈래") or "식약처 자료")}</h3><p>{h(str(row.get("내용요약") or "")[:110])}</p><small>{h(row["날짜"])} · <a href="{h(row.get("원문URL") or "#")}">원문 보기 ↗</a></small></article>' for row in data["news"])
    if not news_html:
        news_html = '<p class="note">이 기간에 연결된 식약처 소식은 확인되지 않았습니다. 전체 발표가 0건이라는 뜻은 아닙니다.</p>'
    logo = 'assets/health-food-data-lab-horizontal-20260924.svg'
    source_dates = data["source_dates"]
    return f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{week} · 헬스푸드 데이터랩</title><style>{CSS}</style></head><body>
<article class="sheet"><header class="mast"><img src="{logo}" alt="HEALTH FOOD DATA LAB"><span>{week}<br>{period}</span></header><p class="eyebrow">주간 공개자료</p><h1>{week} 시장 기록</h1><p class="lead">자료가 확인된 범위만 셌습니다. 판매량이 없는 곳은 순위를 만들지 않았습니다.</p>
<section class="hero"><strong>{len(data["slots"])}<small>건</small></strong><div><h2>건강식품 관련 편성 포착</h2><p>{len(data["channels"])}개 채널 · {period}</p><small>이번 수집에서 확인된 시간대입니다. 이전에 저장된 {len(data["preserved_slots"])}건은 제외했습니다. 실제 방영 완료와 판매량은 미확인입니다.</small></div></section>
<section class="section"><h2>이번 주 품목신고</h2><div class="metrics"><div><strong>{number(declared["healthRows"])}건</strong><small>건강기능식품</small></div><div><strong>{number(declared["generalFoodCandidateRows"])}건</strong><small>확인 범위 일반식품 후보</small></div></div><p class="caption">보고일 {period} · 원문 갱신 {h(declared["snapshot"])}. 일반식품은 확인한 제조사업장 범위입니다. 신고가 판매나 출시를 뜻하지 않습니다. {('미확인 날짜: '+h(', '.join(missing_days))+'.') if missing_days else ''} <a href="vcbio-market-fable.html#view=products&scope=1&from={start}&to={end}">품목신고 보기 →</a></p></section>
<section class="section"><h2>편성에 자주 나온 상품명</h2><div class="cards">{top_cards()}</div><p class="caption">동일 상품명도 판매처·상품번호가 다를 수 있습니다. 편성 횟수는 매출·판매량 순위가 아닙니다. <a href="vcbio-market-fable.html#view=home&from={start}&to={end}">방송 목록 보기 →</a></p></section>
<section class="section"><h2>두 주 모두 관측된 검색지수 변화</h2><div class="bars">{signals_html}</div><p class="caption">완전 관측된 원료 중 예시입니다. 지수는 오메가3 대비 상대값이며 검색 횟수가 아닙니다. 개별 원료의 증감이 시장 전체의 원인이나 매출을 뜻하지 않습니다.</p></section>
<div class="foot"><span>헬스푸드 데이터랩 · 공개자료</span><span>1 / 2</span></div></article>
<article class="sheet"><header class="mast"><img src="{logo}" alt="HEALTH FOOD DATA LAB"><span>{week}<br>{period}</span></header><p class="eyebrow">원료명 검색과 공개 소식</p><h1>많이 찾아본 원료명</h1><p class="lead">월 검색 참고값입니다. 이 주의 검색량·제품 판매량 순위가 아닙니다. 같은 말이 다른 뜻으로 검색됐을 수 있습니다.</p>
<div class="rank-grid"><section><h2>건강기능식품 관련 원료명</h2><ol class="rank-list">{rank_html(data["lanes"]["health"])}</ol></section><section><h2>일반식품 관련 원료명</h2><ol class="rank-list">{rank_html(data["lanes"]["general"])}</ol></section></div>
<section class="section"><h2>지난주 유튜브 영상의 원료명</h2><p>{len(data["videos"])}개 영상 중 {len(data["mentioned"])}개에서 원료명 연결 · {terms_html}.</p><p class="caption">수집 영상 안에서의 문자 언급입니다. 동률을 억지로 순위화하지 않았고 전체 유튜브 해시태그 통계가 아닙니다. <a href="vcbio-market-fable.html#view=youtube">영상·채널 보기 →</a></p></section>
<section class="section"><h2>이번 주 식약처 소식</h2><div class="news">{news_html}</div></section>
<p class="note">시장자료의 판매처 표시 순위·가격·리뷰에는 실제 주간 판매량이 없습니다. 방송별 판매 카운터도 결손 상태를 확인해야 하므로 ‘많이 팔린 제품 10개’를 추정해 싣지 않았습니다. 인스타그램·틱톡 해시태그 빈도는 검증된 수집 자료가 없습니다.</p>
<p class="caption">자료 기준: 검색지수 {h(source_dates["series"])} · 품목신고 {h(source_dates["products"])} · 편성 {h(source_dates["broadcast"])} · 유튜브 {h(source_dates["youtube"])} · 예측 {h(source_dates["forecast"])}. 예측 계산 {number(data["forecast"]["calculated"])}/{number(data["forecast"]["items"])}개는 <a href="vcbio-market-fable.html#view=forecast">예측 탭</a>에서 기간·오차와 함께 확인하세요.</p>
<div class="foot"><span>출처·기간·미관측을 구분했습니다.</span><span>2 / 2</span></div></article></body></html>'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    summary = json.loads(args.summary.read_text(encoding="utf-8"))
    try:
        content = render(summary, weekly_data(root, summary))
    except PendingSources as pending:
        print(json.dumps({"status": "pending", "reason": str(pending)}, ensure_ascii=False))
        raise SystemExit(75)
    target = args.output.resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.read_text(encoding="utf-8") != content:
        raise ValueError("existing weekly report differs; do not overwrite")
    target.write_text(content, encoding="utf-8")
    print(json.dumps({"report": str(target), "bytes": target.stat().st_size,
                      "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
