/* The weekly report uses the same 38 explanations as the data lab. */
(async () => {
  let definitions;
  try {
    definitions = window.parent !== window && window.parent.HealthFoodGlossaryDefinitions;
  } catch { /* Standalone report or cross-origin embedding. */ }
  if (!definitions) {
    const response = await fetch(new URL('a350-glossary-20260930.json', document.currentScript.src));
    if (!response.ok) return;
    definitions = (await response.json()).definitions;
  }
  if (!Array.isArray(definitions) || definitions.length !== 38) return;
  const aliases = definitions.flatMap(item => item.aliases.map(alias => ({ alias, item })))
    .sort((a, b) => b.alias.length - a.alias.length);
  const byLabel = new Map(definitions.map(item => [item.label, item]));
  const style = document.createElement('style');
  style.textContent = `
    .a350-report-info{position:relative;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;min-width:22px;min-height:22px;margin-left:3px;border:0;border-radius:50%;background:transparent;color:#1e3932;font:700 17px/1 Pretendard,"Noto Sans KR",sans-serif;cursor:pointer}
    .a350-report-info::before{content:'';position:absolute;inset:-8px}
    .a350-report-info:hover,.a350-report-info:focus-visible{outline:2px solid #1e3932;outline-offset:1px}
    .a350-report-launch{border:0;background:transparent;color:#1e3932;font:600 12px/1.3 Pretendard,"Noto Sans KR",sans-serif;text-decoration:underline;cursor:pointer}
    .a350-report-tip{position:fixed;z-index:320;width:min(310px,calc(100vw - 20px));padding:12px 14px;border:1px solid #b9b4a8;border-radius:8px;background:#fff;color:#17251f;font:13px/1.45 Pretendard,"Noto Sans KR",sans-serif}
    .a350-report-tip[hidden]{display:none}.a350-report-tip strong{display:block;margin-bottom:4px}.a350-report-tip p{margin:0}.a350-report-tip button{margin-top:9px;padding:0;border:0;background:none;color:#1e3932;text-decoration:underline;cursor:pointer}
    .a350-report-dialog{width:min(500px,calc(100vw - 24px));max-height:min(76dvh,700px);padding:18px;border:1px solid #b9b4a8;border-radius:10px;background:#fff;color:#17251f;font:13px/1.5 Pretendard,"Noto Sans KR",sans-serif}
    .a350-report-dialog::backdrop{background:rgba(0,0,0,.42)}.a350-report-dialog header{display:flex;align-items:center;justify-content:space-between}.a350-report-dialog h2{margin:0;font-size:20px}.a350-report-dialog input{width:100%;min-height:42px;margin:10px 0;padding:0 10px;border:1px solid #b9b4a8;border-radius:5px;font:inherit}.a350-report-dialog-list{max-height:55dvh;overflow:auto}.a350-report-dialog-list article{padding:8px 2px;border-bottom:1px solid #d9dfd7}.a350-report-dialog-list h3{margin:0 0 2px;font-size:14px}.a350-report-dialog-list p{margin:0}.a350-report-close{min-width:40px;min-height:40px;border:0;background:#f5f3ee;cursor:pointer}
    @media print{.a350-report-info,.a350-report-launch,.a350-report-tip,.a350-report-dialog{display:none!important}}
  `;
  document.head.append(style);
  const tip = document.createElement('div');
  tip.className = 'a350-report-tip';
  tip.hidden = true;
  tip.setAttribute('role', 'note');
  tip.innerHTML = '<strong></strong><p></p><button type="button">용어 모음 보기</button>';
  document.body.append(tip);
  const dialog = document.createElement('dialog');
  dialog.className = 'a350-report-dialog';
  dialog.innerHTML = '<header><h2>용어 모음</h2><button class="a350-report-close" type="button" aria-label="용어 모음 닫기">닫기</button></header><label for="a350-report-search">용어 검색</label><input id="a350-report-search" type="search" placeholder="용어 검색"><div class="a350-report-dialog-list"></div>';
  document.body.append(dialog);
  const search = dialog.querySelector('input');
  const list = dialog.querySelector('.a350-report-dialog-list');
  function rows() {
    const query = search.value.trim().toLocaleLowerCase('ko');
    list.replaceChildren();
    for (const item of definitions.filter(x => !query || (x.label + ' ' + x.text).toLocaleLowerCase('ko').includes(query)).sort((a, b) => a.label.localeCompare(b.label, 'ko'))) {
      const article = document.createElement('article');
      const title = document.createElement('h3'); title.textContent = item.label;
      const body = document.createElement('p'); body.textContent = item.text;
      article.append(title, body); list.append(article);
    }
  }
  function hideTip() { tip.hidden = true; }
  function showTip(icon) {
    const item = byLabel.get(icon.dataset.term);
    if (!item) return;
    tip.querySelector('strong').textContent = item.label;
    tip.querySelector('p').textContent = item.text;
    tip.hidden = false;
    const rect = icon.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(rect.left, innerWidth - tip.offsetWidth - 8)) + 'px';
    tip.style.top = (rect.bottom + tip.offsetHeight + 8 < innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - tip.offsetHeight - 6)) + 'px';
  }
  function openGlossary() {
    hideTip();
    try {
      if (window.parent !== window && window.parent.HealthFoodGlossaryOpen) {
        window.parent.HealthFoodGlossaryOpen();
        return;
      }
    } catch { /* Use the report's own glossary. */ }
    rows(); dialog.showModal(); search.focus();
  }
  tip.querySelector('button').addEventListener('click', openGlossary);
  dialog.querySelector('.a350-report-close').addEventListener('click', () => dialog.close());
  search.addEventListener('input', rows);
  const launch = document.createElement('button');
  launch.type = 'button'; launch.className = 'a350-report-launch';
  launch.textContent = '용어 모음';
  launch.addEventListener('click', openGlossary);
  document.querySelector('.intro')?.after(launch);
  const seen = new Set();
  for (const sheet of document.querySelectorAll('.sheet')) {
    const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (let node of nodes) {
      if (!node.parentElement || node.parentElement.closest('script,style,.a350-report-info') || !node.textContent.trim()) continue;
      let safety = 0;
      while (node.textContent && safety++ < 4) {
        let best = null;
        for (const entry of aliases) {
          if (seen.has(entry.item.label)) continue;
          const at = node.textContent.indexOf(entry.alias);
          if (at < 0) continue;
          if (!best || at < best.at || at === best.at && entry.alias.length > best.entry.alias.length) best = { at, entry };
        }
        if (!best) break;
        const { at, entry } = best;
        const rest = node.splitText(at + entry.alias.length);
        const interactive = node.parentElement.closest('button,a,summary');
        const icon = document.createElement(interactive ? 'span' : 'button');
        if (interactive) {
          icon.setAttribute('aria-hidden', 'true');
          interactive.setAttribute('aria-description', entry.item.label + ': ' + entry.item.text);
          interactive.addEventListener('focus', () => showTip(icon));
        } else {
          icon.type = 'button';
          icon.setAttribute('aria-label', entry.item.label + ' 뜻 보기');
        }
        icon.className = 'a350-report-info'; icon.dataset.term = entry.item.label; icon.textContent = 'ⓘ';
        node.after(icon); seen.add(entry.item.label); node = rest;
      }
    }
  }
  let closeTimer;
  document.addEventListener('pointerover', e => {
    const icon = e.target.closest?.('.a350-report-info');
    if (icon && matchMedia('(hover:hover)').matches) showTip(icon);
    if (e.target.closest?.('.a350-report-tip')) clearTimeout(closeTimer);
  });
  document.addEventListener('pointerout', e => {
    if ((e.target.closest?.('.a350-report-info') || e.target.closest?.('.a350-report-tip')) && !e.relatedTarget?.closest?.('.a350-report-info,.a350-report-tip')) closeTimer = setTimeout(hideTip, 160);
  });
  document.addEventListener('focusin', e => { if (e.target.matches?.('.a350-report-info')) showTip(e.target); });
  document.addEventListener('click', e => {
    const icon = e.target.closest?.('.a350-report-info');
    if (icon) { e.preventDefault(); e.stopPropagation(); showTip(icon); }
    else if (!e.target.closest?.('.a350-report-tip')) hideTip();
  }, { capture: true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
})().catch(error => console.error('용어 모음:', error));
