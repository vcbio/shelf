/**
 * SM BIO — layout.js  (보강 2026-06)
 * 공통 헤더·푸터·퀵레일·카카오채널버튼 주입 모듈
 * - fetch 없음: file:// 프로토콜에서도 동작
 * - DOMContentLoaded 후 [data-include] 자리표시자를 채움
 * - skip-link 주입, nav ul/li 구조, 푸터 privacy/terms 링크 연결
 * - 모바일 메뉴: 첫 링크 focus + Esc 닫기 + 포커스 트랩
 * - FAQ aria-controls/id 연결
 * - 저작권 연도 동적(2020–현재년)
 */
'use strict';

/* ─── 1. 공통 마크업 상수 ─────────────────────────────── */

var SKIP_LINK_HTML = '<a class="skip-link" href="#main-content">본문 바로가기</a>\n';

var HEADER_HTML = `
<header id="header" role="banner">
  <div class="container">
    <div class="header-inner">

      <!-- 로고 -->
      <a href="index.html" class="logo" aria-label="SM BIO 에스엠바이오 홈으로">
        <svg class="logo-hex" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <polygon points="19,2 36,11 36,29 19,38 2,29 2,11"
            fill="none" stroke="#1F7A4D" stroke-width="2.5"/>
          <polygon points="19,7 31,14 31,28 19,35 7,28 7,14"
            fill="rgba(31,122,77,0.15)"/>
          <text x="19" y="24" text-anchor="middle"
            font-family="Poppins,sans-serif" font-size="9" font-weight="700"
            fill="#1F7A4D">SM</text>
        </svg>
        <span class="logo-text">
          <span class="logo-en">SM BIO</span>
          <span class="logo-kr">에스엠바이오</span>
        </span>
      </a>

      <!-- 데스크톱 네비 -->
      <nav class="nav-menu" aria-label="주요 메뉴">
        <ul>
          <li class="nav-item"><a href="company.html" data-menu="company">회사소개</a></li>
          <li class="nav-item"><a href="manufacturing.html" data-menu="manufacturing">생산제조</a></li>
          <li class="nav-item"><a href="sourcing.html" data-menu="sourcing">원료소싱</a></li>
          <li class="nav-item"><a href="certification.html" data-menu="certification">인증·글로벌파트너</a></li>
          <li class="nav-item"><a href="products.html" data-menu="products">생산제품</a></li>
          <li class="nav-item"><a href="support.html" data-menu="support">고객지원</a></li>
          <li class="nav-item"><a href="support.html#quote" class="nav-cta">빠른 견적 받기</a></li>
        </ul>
      </nav>

      <!-- 햄버거 -->
      <button class="hamburger" id="hamburger-btn"
        aria-label="모바일 메뉴 열기/닫기" aria-expanded="false" aria-controls="mobile-menu">
        <span></span><span></span><span></span>
      </button>

    </div>
  </div>
</header>

<!-- 모바일 메뉴 -->
<nav id="mobile-menu" class="mobile-menu" aria-label="모바일 메뉴">
  <ul>
    <li><a href="company.html" data-menu="company">회사소개</a></li>
    <li><a href="manufacturing.html" data-menu="manufacturing">생산제조</a></li>
    <li><a href="sourcing.html" data-menu="sourcing">원료소싱</a></li>
    <li><a href="certification.html" data-menu="certification">인증·글로벌파트너</a></li>
    <li><a href="products.html" data-menu="products">생산제품</a></li>
    <li><a href="support.html" data-menu="support">고객지원</a></li>
    <li><a href="support.html#quote" class="btn btn--primary">빠른 견적 받기</a></li>
  </ul>
</nav>
`;

var FOOTER_HTML = `
<footer id="footer" role="contentinfo">
  <div class="container">
    <div class="footer-inner">
      <div>
        <div class="footer-logo-en">SM BIO</div>
        <div class="footer-logo-kr">주식회사 에스엠바이오</div>
        <div class="footer-info">
          <!-- 확인 필요: 대표자명 — 등록증 유성훈 vs 최신 임형구 -->
          <span>대표자: 임형구</span>
          <span>사업자등록번호: 479-87-01768</span><br>
          <span>주소: 충청북도 음성군 생극면 이진말길 10-17</span>
          <!-- 확인 필요: 전화·이메일 -->
          <span>Tel: [확인 필요]</span>
          <span>Email: [확인 필요]</span>
        </div>
        <div class="footer-links">
          <a href="privacy.html">개인정보처리방침</a>
          <a href="terms.html">이용약관</a>
        </div>
      </div>
      <div style="text-align:right;">
        <svg width="48" height="48" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <polygon points="19,2 36,11 36,29 19,38 2,29 2,11" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
          <polygon points="19,7 31,14 31,28 19,35 7,28 7,14" fill="rgba(31,122,77,0.2)"/>
          <text x="19" y="24" text-anchor="middle" font-family="Poppins,sans-serif" font-size="9" font-weight="700" fill="rgba(255,255,255,0.4)">SM</text>
        </svg>
      </div>
    </div>
    <div class="footer-bottom" id="footer-copyright">
      &copy; 2020&ndash;<span id="footer-year"></span> 주식회사 에스엠바이오. All rights reserved.
    </div>
  </div>
</footer>
`;

var QUICKRAIL_HTML = `
<nav id="quick-rail" aria-label="빠른 이동 메뉴">
  <a href="products.html" class="rail-item" title="생산제품">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
    <span>제품</span>
  </a>
  <a href="support.html#quote" class="rail-item" title="문의하기">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    <span>문의</span>
  </a>
  <span class="rail-item" role="img" title="블로그 (준비중)" aria-label="블로그 준비중" aria-disabled="true" tabindex="-1" style="opacity:0.45;cursor:default;">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    <span>BLOG</span>
  </span>
  <span class="rail-item" role="img" title="회사소개서 다운로드 (준비중)" aria-label="회사소개서 준비중" aria-disabled="true" tabindex="-1" style="opacity:0.45;cursor:default;">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
    <span>소개서</span>
  </span>
  <a href="support.html#quote" class="rail-item rail-item--cta" title="견적받기">
    <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    <span>견적</span>
  </a>
  <button class="rail-item rail-top" id="rail-top" title="맨 위로" aria-label="맨 위로 스크롤">
    <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>
    <span>TOP</span>
  </button>
</nav>
`;

/* 카카오채널 플로팅 버튼 */
/* [확인 필요: 카카오채널 URL] — 아래 href를 실제 채널 주소로 교체하세요 */
var KAKAO_FLOAT_HTML = `
<a id="kakao-float"
   href="https://pf.kakao.com/_확인필요"
   target="_blank" rel="noopener noreferrer"
   title="카카오채널 상담"
   aria-label="카카오채널로 상담하기"
   style="
     position:fixed;
     bottom:28px;
     right:28px;
     z-index:9000;
     display:flex;
     align-items:center;
     gap:8px;
     background:#1F7A4D;
     color:#fff;
     border-radius:999px;
     padding:10px 18px 10px 14px;
     font-size:13px;
     font-weight:700;
     text-decoration:none;
     box-shadow:0 4px 16px rgba(31,122,77,0.35);
     transition:background 0.2s,transform 0.15s;
   "
   onmouseover="this.style.background='#155e3a';this.style.transform='scale(1.04)'"
   onmouseout="this.style.background='#1F7A4D';this.style.transform='scale(1)'">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3C7.03 3 3 6.36 3 10.5c0 2.62 1.56 4.93 3.93 6.27L6 21l4.27-2.27C10.82 18.9 11.4 19 12 19c4.97 0 9-3.36 9-7.5S16.97 3 12 3z" fill="currentColor"/>
  </svg>
  카톡 상담
</a>
`;

/* ─── 2. active 클래스 판별 ───────────────────────────── */

function getCurrentPage() {
  var path = window.location.pathname;
  var file = path.split('/').pop();
  if (!file || file === '' || file === 'index.html') return 'index';
  return file.replace(/\.html$/, '');
}

function applyActive() {
  var page = getCurrentPage();
  document.querySelectorAll('[data-menu]').forEach(function(el) {
    if (el.getAttribute('data-menu') === page) {
      el.classList.add('active');
      if (el.getAttribute('aria-current') === null) {
        el.setAttribute('aria-current', 'page');
      }
    }
  });
}

/* ─── 3. 브레드크럼 현재항목 aria-current ─────────────── */
function applyBreadcrumb() {
  document.querySelectorAll('.page-band-breadcrumb span:last-child').forEach(function(span) {
    if (!span.getAttribute('aria-hidden')) {
      span.setAttribute('aria-current', 'page');
    }
  });
}

/* ─── 4. FAQ aria-controls 연결 ──────────────────────── */
function applyFaqAria() {
  document.querySelectorAll('.faq-item').forEach(function(item, i) {
    var btn = item.querySelector('.faq-q');
    var ans = item.querySelector('.faq-a');
    if (!btn || !ans) return;
    var panelId = 'faq-panel-' + i;
    var btnId   = 'faq-btn-' + i;
    ans.setAttribute('id', panelId);
    ans.setAttribute('role', 'region');
    ans.setAttribute('aria-labelledby', btnId);
    btn.setAttribute('id', btnId);
    btn.setAttribute('aria-controls', panelId);
  });
}

/* ─── 5. products 필터 버튼 aria-disabled + JS 필터 ─── */
function initProductFilter() {
  var filterBtns = document.querySelectorAll('.filter-btn');
  if (!filterBtns.length) return;
  var cards = document.querySelectorAll('.product-card-full');

  filterBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var cat = btn.getAttribute('data-category');
      filterBtns.forEach(function(b) {
        b.setAttribute('aria-pressed', 'false');
      });
      btn.setAttribute('aria-pressed', 'true');
      if (cat === 'all') {
        cards.forEach(function(c) { c.style.display = ''; });
      } else {
        cards.forEach(function(c) {
          var cardCat = c.querySelector('.product-cat');
          var match = cardCat && cardCat.textContent.trim() === cat;
          c.style.display = match ? '' : 'none';
        });
      }
    });
  });
}

/* ─── 6. 저작권 연도 동적 ─────────────────────────────── */
function setFooterYear() {
  var el = document.getElementById('footer-year');
  if (el) el.textContent = new Date().getFullYear();
}

/* ─── 7. 폼 클라이언트 유효성 검사 ─────────────────────── */
function initFormValidation() {
  var forms = document.querySelectorAll('form[id$="quote-form"], form#quote-form');
  forms.forEach(function(form) {
    /* novalidate 속성 유지하되 JS로 직접 검증 */
    form.setAttribute('novalidate', '');

    form.addEventListener('submit', function(e) {
      var valid = true;
      var firstError = null;

      /* 필수 필드 검사 */
      form.querySelectorAll('[required]').forEach(function(field) {
        var group = field.closest('.form-group') || field.closest('.form-check');
        var errorEl = group ? group.querySelector('.form-error') : null;

        var isEmpty = field.type === 'checkbox' ? !field.checked : !field.value.trim();
        if (isEmpty) {
          valid = false;
          if (group) group.classList.add('has-error');
          if (errorEl) errorEl.style.display = 'block';
          if (!firstError) firstError = field;
        } else {
          if (group) group.classList.remove('has-error');
          if (errorEl) errorEl.style.display = 'none';
        }
      });

      /* 이메일 형식 검사 */
      form.querySelectorAll('[type="email"][required]').forEach(function(field) {
        var group = field.closest('.form-group');
        var errorEl = group ? group.querySelector('.form-error') : null;
        if (field.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value)) {
          valid = false;
          if (group) group.classList.add('has-error');
          if (errorEl) { errorEl.textContent = '유효한 이메일 주소를 입력하세요.'; errorEl.style.display = 'block'; }
          if (!firstError) firstError = field;
        }
      });

      if (!valid) {
        e.preventDefault();
        e.stopPropagation();
        if (firstError) firstError.focus();
        return false;
      }
    });

    /* 입력 시 에러 해제 */
    form.querySelectorAll('[required]').forEach(function(field) {
      field.addEventListener('input', function() {
        var group = field.closest('.form-group') || field.closest('.form-check');
        var errorEl = group ? group.querySelector('.form-error') : null;
        if (field.value.trim() || (field.type === 'checkbox' && field.checked)) {
          if (group) group.classList.remove('has-error');
          if (errorEl) errorEl.style.display = 'none';
        }
      });
    });
  });
}

/* ─── 8. 주입 실행 ───────────────────────────────────── */

function injectLayout() {
  /* skip-link — body 맨 앞에 */
  var skipEl = document.createElement('div');
  skipEl.innerHTML = SKIP_LINK_HTML;
  document.body.insertBefore(skipEl.firstElementChild, document.body.firstChild);

  /* 헤더 (+ 모바일 메뉴 포함) */
  var headerSlot = document.querySelector('[data-include="header"]');
  if (headerSlot) {
    headerSlot.outerHTML = HEADER_HTML;
  }

  /* 푸터 */
  var footerSlot = document.querySelector('[data-include="footer"]');
  if (footerSlot) {
    footerSlot.outerHTML = FOOTER_HTML;
  }

  /* 퀵레일 */
  var railSlot = document.querySelector('[data-include="quickrail"]');
  if (railSlot) {
    railSlot.outerHTML = QUICKRAIL_HTML;
  }

  /* 카카오 플로팅 버튼 — body 끝에 삽입 */
  var floatDiv = document.createElement('div');
  floatDiv.innerHTML = KAKAO_FLOAT_HTML;
  document.body.appendChild(floatDiv.firstElementChild);

  /* 저작권 연도 */
  setFooterYear();

  /* active 클래스 */
  applyActive();

  /* 브레드크럼 */
  applyBreadcrumb();

  /* FAQ aria */
  applyFaqAria();

  /* 제품 필터 */
  initProductFilter();

  /* 폼 유효성 검사 */
  initFormValidation();
}

/* ─── 9. main.js init 함수 재호출 래퍼 ──────────────── */
function reinitMain() {

  /* 헤더 스크롤 전환 */
  (function() {
    var header = document.getElementById('header');
    if (!header) return;
    function onScroll() {
      header.classList.toggle('scrolled', window.scrollY > 40);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  })();

  /* 모바일 메뉴: 첫 링크 focus + Esc + 포커스 트랩 */
  (function() {
    var btn   = document.getElementById('hamburger-btn');
    var menu  = document.getElementById('mobile-menu');
    if (!btn || !menu) return;
    if (btn.dataset.menuBound) return;
    btn.dataset.menuBound = '1';

    var links = menu.querySelectorAll('a, button');

    function getFocusable() {
      return Array.from(menu.querySelectorAll('a[href], button:not([disabled])'));
    }

    function trapFocus(e) {
      if (!menu.classList.contains('open')) return;
      var focusable = getFocusable();
      if (!focusable.length) return;
      var first = focusable[0];
      var last  = focusable[focusable.length - 1];
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    function toggle() {
      var open = btn.classList.toggle('open');
      menu.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) {
        var focusable = getFocusable();
        if (focusable.length) focusable[0].focus();
        menu.addEventListener('keydown', trapFocus);
      } else {
        menu.removeEventListener('keydown', trapFocus);
        btn.focus();
      }
    }

    function close() {
      btn.classList.remove('open');
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      menu.removeEventListener('keydown', trapFocus);
    }

    btn.addEventListener('click', toggle);
    links.forEach(function(a) { a.addEventListener('click', close); });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        close();
        btn.focus();
      }
    });
  })();

  /* TOP 버튼 */
  (function() {
    var btn = document.getElementById('rail-top');
    if (!btn) return;
    btn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  })();

  /* 앵커 스무스 스크롤 재등록 (헤더 높이 보정) */
  (function() {
    document.querySelectorAll('a[href^="#"]').forEach(function(a) {
      a.addEventListener('click', function(e) {
        var id = a.getAttribute('href');
        if (id === '#') { e.preventDefault(); return; }
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        var header = document.getElementById('header');
        var offset = header ? header.offsetHeight + 8 : 80;
        var top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      });
    });
  })();
}

/* ─── 10. DOMContentLoaded 진입점 ────────────────────── */

document.addEventListener('DOMContentLoaded', function() {
  injectLayout();
  reinitMain();
});
