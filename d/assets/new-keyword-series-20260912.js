(function (global) {
  'use strict';
  const DATA_URL = 'd/new-keyword-series-20260912.json';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = value => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '미확보';
  const day = value => Date.parse(`${value}T00:00:00Z`);
  function find(data, id) { return data.series.find(x => x.id === id) || null; }
  function selectedPeriod(row, days) { return row.periods.find(p => p.days === Number(days)) || row.periods.find(p => p.days === 30) || row.periods[0]; }
  function chart(points) {
    if (!points.length) return '<p class="caption">이 기간의 실제 일별 관측이 없습니다.</p>';
    const values = points.map(p => p.index), min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const xy = (p, i) => points.length === 1 ? [160, 52] : [i * 320 / (points.length - 1), 104 - (p.index - min) * 88 / span];
    let path = '', previous = null;
    points.forEach((p, i) => { const [x, y] = xy(p, i); path += !previous || day(p.date) - day(previous.date) > 86400000 ? `M${x.toFixed(2)},${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`; previous = p; });
    const mark = points.length === 1 ? '<circle cx="160" cy="52" r="4" class="nk-point"/>' : '';
    return `<figure class="nk-chart"><figcaption>일별 오메가3 대비 상대지수 · ${num(min)}~${num(max)}</figcaption><svg viewBox="0 0 320 120" role="img" aria-label="실제 일별 오메가3 대비 상대지수 추이"><line x1="0" x2="320" y1="104" y2="104" class="nk-grid"/><path d="${path}" class="nk-line"/>${mark}</svg><small>${esc(points[0].date)} ~ ${esc(points.at(-1).date)} · 결측일은 선으로 잇지 않았습니다.</small></figure>`;
  }
  function renderHTML(data, id, options = {}) {
    const row = find(data, id);
    if (!row) return '<p class="caption">선택 키워드의 새 관측 자료가 없습니다.</p>';
    const period = selectedPeriod(row, options.periodDays ?? 30), points = row.daily.filter(p => p.date >= period.start && p.date <= period.end);
    const choices = data.periodDays.map(days => `<option value="${days}" ${days === period.days ? 'selected' : ''}>최근 ${days}일</option>`).join('');
    const unavailable = period.observedDays === 0 ? `<p class="nk-missing">${esc(row.term)}은 현재 ${period.days}일에는 실제 관측이 없습니다. 마지막 실관측 ${esc(row.observedEnd)} · 전체 ${row.observedDays}일이며, 0이나 예측값으로 채우지 않았습니다.</p>` : '';
    const rawRows = points.map(p => `<tr><td>${esc(p.date)}</td><td>${num(p.index)}</td></tr>`).join('');
    const source = Object.keys(data.source?.rawFiles || {}).join(' · ') || '원문 파일';
    return `<section class="new-keyword-series" data-keyword-id="${esc(row.id)}" data-period-days="${period.days}"><style>.new-keyword-series{margin-top:20px;padding-top:16px;border-top:1px solid var(--line);font-size:15px;line-height:1.55}.new-keyword-series h3{margin:0 0 8px;font-size:15px}.new-keyword-series p{margin:6px 0}.new-keyword-series select{min-height:40px;margin:8px 0;border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:var(--paper);color:var(--ink)}.nk-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;margin:12px 0}.nk-summary strong{display:block;font-variant-numeric:tabular-nums}.nk-chart{margin:14px 0}.nk-chart figcaption,.nk-chart small{font-size:13px;color:var(--muted)}.nk-chart svg{display:block;width:100%;height:auto;margin:6px 0}.nk-grid{stroke:var(--line)}.nk-line{fill:none;stroke:var(--blue);stroke-width:2;vector-effect:non-scaling-stroke}.nk-point{fill:var(--blue)}.nk-missing{padding:12px;border-radius:8px;background:var(--warm);color:var(--warn);font-size:13px}.new-keyword-series details{margin-top:12px}.new-keyword-series summary{min-height:36px;cursor:pointer;color:var(--blue)}.new-keyword-series table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.new-keyword-series th,.new-keyword-series td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left}.new-keyword-series td:last-child,.new-keyword-series th:last-child{text-align:right}@media(max-width:760px){.nk-summary{grid-template-columns:1fr}}</style><h3>${esc(row.term)} · 새 일별 관측</h3><label>기간 <select data-new-keyword-period>${choices}</select></label><div class="nk-summary"><div><small>평균 오메가3 대비 상대지수</small><strong>${num(period.mean)}</strong></div><div><small>실제 관측</small><strong>${period.observedDays}/${period.days}일</strong></div><div><small>실제 시작·끝</small><strong>${esc(period.observedStart)} ~ ${esc(period.observedEnd)}</strong></div><div><small>직전 같은 기간</small><strong>${num(period.previous)}</strong></div></div><p class="caption">${esc(data.normalization.note)}</p><p class="caption">출처: ${esc(source)} · 오메가3 기준</p>${unavailable}${chart(points)}<details><summary>원자료 ${points.length}일 보기</summary><table><thead><tr><th>날짜</th><th>오메가3 대비 상대지수</th></tr></thead><tbody>${rawRows}</tbody></table></details></section>`;
  }
  async function load(url = DATA_URL) { const response = await fetch(url); if (!response.ok) throw new Error(`new keyword series load failed: ${response.status}`); return response.json(); }
  function render(target, data, id, options = {}) { const node = typeof target === 'string' ? document.querySelector(target) : target; if (!node) throw new Error('new keyword series target missing'); node.innerHTML = renderHTML(data, id, options); const select = node.querySelector('[data-new-keyword-period]'); if (select) select.addEventListener('change', () => render(node, data, id, { ...options, periodDays: Number(select.value) })); return node; }
  global.VCBioNewKeywordSeries20260912 = { DATA_URL, load, find, renderHTML, render };
})(window);
