/* Healt Food Data Lab: searchable single-select controls, with native change events. */
(() => {
  'use strict';
  if (window.VCBioSearchableSelects) {
    window.VCBioSearchableSelects.refresh();
    return;
  }
  if (typeof HTMLDialogElement === 'undefined') return;

  const entries = new Map();
  let serial = 0, active = null, options = [], cursor = -1, queued = false;
  let composing = false, compositionEnded = 0, pendingFocus = null, rememberedFocus = null;
  let dialog, heading, current, search, list, status, clearButton;
  const own = 'data-vcbss-owned';
  const chevron = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const check = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';

  function setAttribute(node, name, value) {
    const text = String(value);
    if (node.getAttribute(name) !== text) node.setAttribute(name, text);
  }
  function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }
  function textWithoutControls(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll('select, button, [' + own + ']').forEach(child => child.remove());
    return copy.textContent.replace(/\s+/g, ' ').trim();
  }
  function labelOf(select) {
    const explicit = select.getAttribute('aria-label');
    if (explicit) return explicit;
    const labelled = (select.getAttribute('aria-labelledby') || '').split(/\s+/)
      .map(id => document.getElementById(id)).filter(Boolean).map(textWithoutControls).join(' ').trim();
    return labelled || Array.from(select.labels || []).map(textWithoutControls).join(' ').trim()
      || select.title || '항목';
  }
  function selectedText(select) {
    return select.selectedOptions[0]?.label || '선택해 주세요';
  }
  function disabled(option) {
    return option.disabled || option.parentElement?.tagName === 'OPTGROUP' && option.parentElement.disabled;
  }
  function normalized(text) {
    return String(text).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s\-–]/g, '');
  }
  function focusIdentity(entry) {
    return { entry, id: entry.select.id, label: entry.label, until: performance.now() + 10000 };
  }
  function restoreFocus() {
    if (!pendingFocus) return;
    if (performance.now() > pendingFocus.until) { pendingFocus = null; return; }
    let entry = entries.get(pendingFocus.entry.select);
    if (!entry?.select.isConnected && pendingFocus.id) entry = entries.get(document.getElementById(pendingFocus.id));
    if (!entry?.select.isConnected) {
      entry = Array.from(entries.values()).find(item => item.label === pendingFocus.label && item.trigger.getClientRects().length);
    }
    if (entry?.trigger.isConnected && !entry.trigger.disabled && entry.trigger.getClientRects().length) {
      entry.trigger.focus({ preventScroll: true });
      pendingFocus = null;
    }
  }
  function close(restore = true) {
    if (!active) return;
    const previous = active;
    pendingFocus = restore ? focusIdentity(previous) : null;
    rememberedFocus = pendingFocus;
    active = null;
    composing = false;
    setAttribute(previous.trigger, 'aria-expanded', 'false');
    search.removeAttribute('aria-activedescendant');
    if (dialog.open) dialog.close();
    queueMicrotask(() => { refresh(); restoreFocus(); });
  }
  function activate(index, scroll = true) {
    if (index < 0 || !options[index] || disabled(options[index].option)) return;
    cursor = index;
    for (let i = 0; i < list.children.length; i++) list.children[i].classList.toggle('is-active', i === index);
    const row = list.children[index];
    search.setAttribute('aria-activedescendant', row.id);
    if (scroll) row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function renderList(keepCursor = false) {
    if (!active) return;
    const select = active.select, previousOption = keepCursor ? options[cursor]?.option : null;
    const terms = search.value.trim().split(/\s+/).filter(Boolean).map(normalized);
    const all = Array.from(select.options).map((option, index) => ({ option, index }))
      .filter(({ option }) => !option.hidden && !(option.parentElement?.tagName === 'OPTGROUP' && option.parentElement.hidden));
    options = all.filter(({ option }) => {
      const group = option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement.label : '';
      const haystack = normalized(option.label + ' ' + option.value + ' ' + group);
      return terms.every(term => haystack.includes(term));
    });
    const fragment = document.createDocumentFragment();
    options.forEach(({ option, index }, position) => {
      const row = document.createElement('li');
      row.id = 'vcbss-option-' + active.number + '-' + index;
      row.className = 'vcbss-option';
      row.dataset.position = position;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(option.selected));
      row.setAttribute('aria-disabled', String(Boolean(disabled(option))));
      const label = document.createElement('span');
      label.className = 'vcbss-option-label';
      label.textContent = option.label;
      row.append(label);
      if (option.selected || disabled(option)) {
        const marker = document.createElement('span');
        marker.className = 'vcbss-marker';
        if (option.selected) {
          marker.innerHTML = check;
          marker.append(document.createTextNode('현재 선택'));
        } else marker.textContent = '선택 불가';
        row.append(marker);
      }
      fragment.append(row);
    });
    list.replaceChildren(fragment);
    setText(current, '현재 선택: ' + selectedText(select));
    setText(status, options.length ? options.length + '개 항목' : '일치하는 항목이 없습니다.');
    clearButton.hidden = !search.value;
    cursor = -1;
    search.removeAttribute('aria-activedescendant');
    let next = previousOption ? options.findIndex(item => item.option === previousOption && !disabled(item.option)) : -1;
    if (next < 0) next = options.findIndex(item => item.option.selected && !disabled(item.option));
    if (next < 0) next = options.findIndex(item => !disabled(item.option));
    if (next >= 0) activate(next, false);
  }
  function choose(position) {
    if (!active || !options[position]) return;
    const entry = active, select = entry.select, choice = options[position];
    if (!select.isConnected || select.matches(':disabled') || disabled(choice.option)) return;
    if (select.options[choice.index] !== choice.option) { renderList(); return; }
    const changed = select.selectedIndex !== choice.index;
    close(true);
    if (changed) {
      select.selectedIndex = choice.index;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    refresh();
  }
  function open(target) {
    const select = typeof target === 'string' ? document.getElementById(target) : target;
    refresh();
    const entry = entries.get(select);
    if (!entry || entry.trigger.disabled || !entry.trigger.getClientRects().length) return;
    if (active) close(false);
    pendingFocus = null;
    active = entry;
    search.value = '';
    composing = false;
    compositionEnded = 0;
    setText(heading, entry.label + ' 선택');
    setAttribute(search, 'aria-label', entry.label + ' 검색');
    setAttribute(list, 'aria-label', entry.label + ' 목록');
    setAttribute(entry.trigger, 'aria-expanded', 'true');
    renderList();
    resizeDialog();
    if (!dialog.open) dialog.showModal();
    search.focus({ preventScroll: true });
    if (cursor >= 0) activate(cursor);
  }
  function sync(entry) {
    const { select, trigger } = entry;
    if (!trigger.isConnected) select.after(trigger);
    entry.label = labelOf(select);
    const selected = selectedText(select);
    setText(trigger.firstElementChild, selected);
    setAttribute(trigger, 'aria-label', entry.label + ' 선택, 현재 ' + selected);
    setAttribute(trigger, 'title', selected);
    const description = select.getAttribute('aria-describedby');
    if (description) setAttribute(trigger, 'aria-describedby', description);
    else trigger.removeAttribute('aria-describedby');
    trigger.disabled = select.matches(':disabled') || !select.options.length;
    trigger.hidden = select.hidden || select.style.display === 'none';
    const signature = JSON.stringify([select.selectedIndex, trigger.disabled, entry.label,
      Array.from(select.options, option => [option.label, option.value, option.hidden, Boolean(disabled(option)), option.parentElement?.hidden, option.parentElement?.label])]);
    if (signature !== entry.signature) {
      entry.signature = signature;
      if (active === entry) {
        if (trigger.disabled || trigger.hidden) close(true);
        else renderList(true);
      }
    }
  }
  function refresh() {
    if (!dialog) return;
    // An async view can render twice after one change. Recover the same field
    // only when its focused trigger was removed, never after the user moved focus.
    if (!active && !pendingFocus && rememberedFocus && !rememberedFocus.entry.trigger.isConnected
        && (document.activeElement === document.body || document.activeElement === document.documentElement)) {
      pendingFocus = rememberedFocus;
    }
    for (const [select, entry] of entries) {
      if (!select.isConnected || select.multiple || select.size > 1) {
        if (active === entry) close(false);
        entry.trigger.remove();
        select.removeAttribute('data-vcbss-native');
        entries.delete(select);
      }
    }
    document.querySelectorAll('select').forEach(select => {
      if (select.multiple || select.size > 1 || select.closest('[' + own + ']')) return;
      let entry = entries.get(select);
      if (!entry) {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'vcbss-trigger';
        trigger.setAttribute(own, '');
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-controls', 'vcbss-dialog');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.innerHTML = '<span class="vcbss-trigger-label"></span>' + chevron;
        entry = { select, trigger, number: ++serial, label: '', signature: '' };
        entries.set(select, entry);
        select.after(trigger);
        select.setAttribute('data-vcbss-native', '');
        trigger.addEventListener('click', () => open(select));
        trigger.addEventListener('keydown', event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            open(select);
          }
        });
      }
      sync(entry);
    });
    restoreFocus();
  }
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; refresh(); });
  }
  function resizeDialog() {
    if (dialog) dialog.style.setProperty('--vcbss-height', Math.max(160, (window.visualViewport?.height || innerHeight) - 32) + 'px');
  }
  function boot() {
    const style = document.createElement('style');
    style.setAttribute(own, '');
    style.textContent = `
select[data-vcbss-native]{display:none!important}
.vcbss-trigger{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;max-width:100%;min-height:40px;padding:8px 12px;border:1px solid var(--line,#E2E8F0);border-radius:8px;background:var(--paper,#FFFFFF);color:var(--body,#334155);font:400 15px/1.5 Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;cursor:pointer;text-align:left}
.field>.vcbss-trigger{flex:1}.data-controls .vcbss-trigger{width:100%}.forecast-selector>.vcbss-trigger{min-width:160px;min-height:44px}.vcbss-trigger-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vcbss-trigger svg{flex:none}.vcbss-trigger:disabled{color:var(--muted,#64748B);background:var(--canvas,#F8FAFC);cursor:not-allowed}.vcbss-trigger[hidden]{display:none}.vcbss-trigger:active:not(:disabled){transform:scale(.98)}
.vcbss-dialog{box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-width:calc(100vw - 32px);max-height:min(640px,var(--vcbss-height,calc(100dvh - 32px)));margin:auto;padding:0;border:1px solid var(--line,#E2E8F0);border-radius:16px;background:var(--paper,#FFFFFF);color:var(--ink,#0F172A);box-shadow:0 2px 4px #0f172a0f,0 8px 20px #0f172a14;font:400 15px/1.5 Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-feature-settings:"kern" 1;overflow:hidden}
.vcbss-dialog[open]{display:flex;flex-direction:column}.vcbss-dialog::backdrop{background:rgba(15,23,42,.32)}.vcbss-dialog *{box-sizing:border-box}.vcbss-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 16px 0;flex:none}.vcbss-head h2{margin:0;font-size:17px;line-height:1.4;font-weight:600;overflow-wrap:anywhere}.vcbss-close{display:grid;place-items:center;flex:none;width:44px;height:44px;padding:0;border:0;border-radius:8px;color:var(--muted,#64748B);background:transparent;cursor:pointer}.vcbss-current{margin:0;padding:0 16px 12px;font-size:13px;color:var(--muted,#64748B);overflow-wrap:anywhere;flex:none}
.vcbss-search-wrap{position:relative;margin:0 16px;flex:none}.vcbss-search-wrap>svg{position:absolute;left:12px;top:15px;color:var(--muted,#64748B);pointer-events:none}.vcbss-search{display:block;width:100%;min-width:0;min-height:48px;padding:10px 12px 10px 40px;border:1px solid var(--line,#E2E8F0);border-radius:8px;background:var(--canvas,#F8FAFC);color:var(--ink,#0F172A);font-family:inherit;font-size:17px;font-weight:400;line-height:1.5;outline-offset:2px}
.vcbss-status-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;padding:4px 16px;font-size:13px;flex:none}.vcbss-status{color:var(--muted,#64748B)}.vcbss-clear{min-height:36px;padding:4px 8px;border:0;border-radius:8px;background:transparent;color:var(--blue,#0369A1);font:inherit;cursor:pointer}.vcbss-clear[hidden]{display:none}
.vcbss-list{list-style:none;margin:0;padding:4px 8px 8px;min-height:48px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scroll-behavior:auto;border-top:1px solid var(--line,#E2E8F0);font-variant-numeric:tabular-nums}.vcbss-option{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:10px 12px;border-radius:8px;cursor:pointer;line-height:1.5}.vcbss-option-label{min-width:0;overflow-wrap:anywhere;word-break:keep-all;white-space:normal}.vcbss-option.is-active{background:var(--soft,#E0F2FE);color:var(--blue,#0369A1)}.vcbss-option[aria-disabled=true]{color:var(--muted,#64748B);cursor:not-allowed}.vcbss-marker{display:flex;align-items:center;gap:4px;flex:none;font-size:13px;color:var(--blue,#0369A1);white-space:nowrap}.vcbss-option[aria-disabled=true] .vcbss-marker{color:var(--muted,#64748B)}
.vcbss-trigger:focus-visible,.vcbss-dialog button:focus-visible,.vcbss-search:focus-visible{outline:2px solid var(--action,#0066CC);outline-offset:2px}
@media(hover:hover) and (pointer:fine){.vcbss-trigger:hover:not(:disabled){border-color:var(--blue,#0369A1)}.vcbss-close:hover,.vcbss-clear:hover{background:var(--soft,#E0F2FE)}}
@media(max-width:600px){.vcbss-trigger{min-height:44px;max-width:100%}.vcbss-dialog{width:calc(100vw - 24px);max-width:calc(100vw - 24px)}.vcbss-option{gap:8px}.vcbss-marker{font-size:13px}}
@media(prefers-reduced-motion:reduce){.vcbss-trigger:active:not(:disabled){transform:none}}
@media(prefers-reduced-transparency:reduce){.vcbss-dialog::backdrop{background:#334155}}
@media(prefers-contrast:more){.vcbss-trigger,.vcbss-dialog,.vcbss-search{border-color:var(--ink,#0F172A)}.vcbss-option.is-active{outline:2px solid var(--blue,#0369A1);outline-offset:-2px}}
`;
    document.head.append(style);
    dialog = document.createElement('dialog');
    dialog.id = 'vcbss-dialog';
    dialog.className = 'vcbss-dialog';
    dialog.setAttribute(own, '');
    dialog.setAttribute('aria-labelledby', 'vcbss-heading');
    dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = '<div class="vcbss-head"><h2 id="vcbss-heading"></h2><button type="button" class="vcbss-close" aria-label="선택 창 닫기"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><p class="vcbss-current"></p><div class="vcbss-search-wrap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input class="vcbss-search" type="search" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="vcbss-list" autocomplete="off" spellcheck="false" placeholder="이름이나 코드로 검색"></div><div class="vcbss-status-row"><span class="vcbss-status" role="status" aria-live="polite"></span><button type="button" class="vcbss-clear" hidden>검색어 지우기</button></div><ul id="vcbss-list" class="vcbss-list" role="listbox"></ul>';
    document.body.append(dialog);
    heading = dialog.querySelector('h2');
    current = dialog.querySelector('.vcbss-current');
    search = dialog.querySelector('input');
    list = dialog.querySelector('ul');
    status = dialog.querySelector('[role=status]');
    clearButton = dialog.querySelector('.vcbss-clear');
    dialog.querySelector('.vcbss-close').addEventListener('click', () => close());
    clearButton.addEventListener('click', () => { search.value = ''; renderList(); search.focus(); });
    search.addEventListener('compositionstart', () => { composing = true; });
    search.addEventListener('compositionend', () => { composing = false; compositionEnded = performance.now(); renderList(); });
    search.addEventListener('input', event => { if (!composing && !event.isComposing) renderList(); });
    search.addEventListener('keydown', event => {
      if (composing || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); event.stopPropagation();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        let next = cursor < 0 ? (direction > 0 ? 0 : options.length - 1) : cursor + direction;
        while (next >= 0 && next < options.length && disabled(options[next].option)) next += direction;
        if (next >= 0 && next < options.length) activate(next);
      } else if (event.key === 'Enter') {
        event.preventDefault(); event.stopPropagation();
        if (!compositionEnded || performance.now() - compositionEnded > 80) choose(cursor);
      }
    });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !composing && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault(); event.stopPropagation(); close();
      }
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (!composing) close(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    });
    list.addEventListener('pointermove', event => {
      const row = event.target.closest('[data-position]');
      if (row && Number(row.dataset.position) !== cursor) activate(Number(row.dataset.position), false);
    });
    list.addEventListener('pointerdown', event => { if (event.target.closest('[data-position]')) event.preventDefault(); });
    list.addEventListener('click', event => {
      const row = event.target.closest('[data-position]');
      if (row) choose(Number(row.dataset.position));
    });
    document.addEventListener('change', schedule, true);
    document.addEventListener('input', event => { if (event.target instanceof HTMLSelectElement) schedule(); }, true);
    document.addEventListener('reset', () => setTimeout(refresh, 0), true);
    document.addEventListener('focusin', event => {
      if (dialog.contains(event.target)) return;
      const entry = Array.from(entries.values()).find(item => item.trigger === event.target);
      rememberedFocus = entry ? focusIdentity(entry) : null;
    }, true);
    document.addEventListener('pointerdown', event => {
      if (!dialog.contains(event.target)) pendingFocus = rememberedFocus = null;
    }, true);
    document.addEventListener('keydown', event => {
      if (!dialog.contains(event.target)) pendingFocus = rememberedFocus = null;
    }, true);
    document.addEventListener('click', event => {
      const label = event.target.closest('label');
      if (label && entries.has(label.control) && !event.target.closest('button,input,a,select')) {
        event.preventDefault(); open(label.control);
      }
    });
    new MutationObserver(mutations => {
      const external = mutations.some(mutation => {
        const parent = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
        if (parent?.closest('[' + own + ']')) return false;
        if (mutation.type !== 'childList') return true;
        const changed = [...mutation.addedNodes, ...mutation.removedNodes];
        return changed.some(node => node.nodeType !== Node.ELEMENT_NODE || !node.hasAttribute(own));
      });
      if (external) schedule();
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['disabled', 'selected', 'value', 'label', 'hidden', 'aria-label', 'aria-labelledby', 'aria-describedby', 'title', 'id', 'class', 'style', 'multiple', 'size'] });
    // Native .value/.selectedIndex property changes do not emit DOM mutations.
    // A small visible-page check keeps programmatic updates in sync without patching native setters.
    setInterval(() => { if (!document.hidden) refresh(); }, 250);
    window.visualViewport?.addEventListener('resize', resizeDialog);
    window.addEventListener('resize', resizeDialog);
    refresh();
  }
  window.VCBioSearchableSelects = Object.freeze({ refresh, open, close: () => close() });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
