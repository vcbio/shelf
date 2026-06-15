/**
 * SM BIO — main.js  (프리미엄 디자인 업그레이드 2025-06)
 * 헤더 스크롤 / 모바일 메뉴 / Why 슬라이더 / Works 캐러셀
 * / 히어로 ticker / 아코디언 FAQ / IntersectionObserver fade-up
 * + 스태거 딜레이 / data-count count-up / reduced-motion 게이트
 */
'use strict';

/* ── 헤더 스크롤 전환 ─────────────────────────────────── */
(function initHeader() {
  var header = document.getElementById('header');
  if (!header) return;
  function onScroll() {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* ── 모바일 메뉴 ───────────────────────────────────────── */
(function initMobileMenu() {
  var btn   = document.getElementById('hamburger-btn');
  var menu  = document.getElementById('mobile-menu');
  var links = menu ? menu.querySelectorAll('a') : [];
  if (!btn || !menu) return;
  if (btn.dataset.menuBound) return;
  btn.dataset.menuBound = '1';

  function toggle() {
    var open = btn.classList.toggle('open');
    menu.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  }
  function close() {
    btn.classList.remove('open');
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
  btn.addEventListener('click', toggle);
  links.forEach(function(a) { a.addEventListener('click', close); });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') close();
  });
})();

/* ── Hero ticker (4개 항목 순환) ──────────────────────── */
(function initTicker() {
  var items = document.querySelectorAll('.ticker-item');
  if (!items.length) return;
  var cur = 0;
  function next() {
    items[cur].classList.remove('active');
    cur = (cur + 1) % items.length;
    items[cur].classList.add('active');
  }
  items[0].classList.add('active');
  setInterval(next, 2200);
})();

/* ── 공통 슬라이더 팩토리 ─────────────────────────────── */
function makeSlider(opts) {
  /**
   * opts.track       : .slider-track or .carousel-track 엘리먼트
   * opts.prevBtn     : 이전 버튼
   * opts.nextBtn     : 다음 버튼
   * opts.dots        : NodeList of dot elements (선택)
   * opts.visibleCount: 한 번에 보이는 아이템 수 (기본 1)
   * opts.gap         : 아이템 간격px (기본 20)
   */
  var track   = opts.track;
  var items   = Array.from(track.children);
  var visible = opts.visibleCount || 1;
  var gap     = opts.gap || 20;
  var current = 0;
  var max     = Math.max(0, items.length - visible);

  function getItemWidth() {
    if (!items[0]) return 0;
    return items[0].offsetWidth + gap;
  }

  function go(idx) {
    current = Math.min(Math.max(idx, 0), max);
    track.style.transform = 'translateX(-' + (current * getItemWidth()) + 'px)';
    if (opts.dots) {
      opts.dots.forEach(function(d, i) {
        d.classList.toggle('active', i === current);
      });
    }
    if (opts.prevBtn) opts.prevBtn.disabled = current === 0;
    if (opts.nextBtn) opts.nextBtn.disabled = current === max;
  }

  if (opts.prevBtn) opts.prevBtn.addEventListener('click', function() { go(current - 1); });
  if (opts.nextBtn) opts.nextBtn.addEventListener('click', function() { go(current + 1); });
  if (opts.dots) {
    opts.dots.forEach(function(d, i) {
      d.addEventListener('click', function() { go(i); });
    });
  }

  // 터치 스와이프
  var touchStartX = 0;
  track.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  track.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) go(current + (dx < 0 ? 1 : -1));
  }, { passive: true });

  go(0);
  return { go: go, getMax: function() { return max; } };
}

/* ── Why 슬라이더 초기화 ──────────────────────────────── */
(function initWhySlider() {
  var track   = document.querySelector('#why .slider-track');
  var prevBtn = document.getElementById('why-prev');
  var nextBtn = document.getElementById('why-next');
  if (!track) return;
  makeSlider({ track: track, prevBtn: prevBtn, nextBtn: nextBtn, visibleCount: 1, gap: 20 });
})();

/* ── Works 캐러셀 초기화 ──────────────────────────────── */
(function initWorksCarousel() {
  var track   = document.querySelector('#works .carousel-track');
  var prevBtn = document.getElementById('works-prev');
  var nextBtn = document.getElementById('works-next');
  var dots    = document.querySelectorAll('#works .dot');
  if (!track) return;

  function getVisible() {
    if (window.innerWidth <= 768)  return 1;
    if (window.innerWidth <= 1100) return 2;
    return 4;
  }

  var current = 0;
  var gap     = 24;

  function getItemWidth() {
    var items = Array.from(track.children);
    if (!items[0]) return 0;
    return items[0].offsetWidth + gap;
  }

  function go(idx) {
    var items   = Array.from(track.children);
    var visible = getVisible();
    var max     = Math.max(0, items.length - visible);
    current = Math.min(Math.max(idx, 0), max);
    track.style.transform = 'translateX(-' + (current * getItemWidth()) + 'px)';
    dots.forEach(function(d, i) { d.classList.toggle('active', i === current); });
    if (prevBtn) prevBtn.disabled = current === 0;
    if (nextBtn) nextBtn.disabled = current === max;
  }

  if (prevBtn) prevBtn.addEventListener('click', function() { go(current - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function() { go(current + 1); });
  dots.forEach(function(d, i) { d.addEventListener('click', function() { go(i); }); });

  // 터치 스와이프
  var touchStartX = 0;
  track.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  track.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) go(current + (dx < 0 ? 1 : -1));
  }, { passive: true });

  go(0);

  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() { go(current); }, 200);
  });
})();

/* ── FAQ 아코디언 ─────────────────────────────────────── */
(function initFaq() {
  var btns = document.querySelectorAll('.faq-q');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      btns.forEach(function(b) {
        b.setAttribute('aria-expanded', 'false');
        var ans = b.nextElementSibling;
        if (ans) ans.classList.remove('open');
      });
      if (!expanded) {
        btn.setAttribute('aria-expanded', 'true');
        var ans = btn.nextElementSibling;
        if (ans) ans.classList.add('open');
      }
    });
  });
})();

/* ── 견적 폼 데모 submit ──────────────────────────────── */
(function initForm() {
  var form = document.getElementById('quote-form');
  if (!form) return;
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var ok = true;
    form.querySelectorAll('[required]').forEach(function(f) {
      var invalid = (f.type === 'checkbox') ? !f.checked : !String(f.value).trim();
      var err = f.parentElement.querySelector('.form-error');
      if (invalid) {
        ok = false;
        f.setAttribute('aria-invalid', 'true');
        if (!err) {
          err = document.createElement('div');
          err.className = 'form-error';
          err.style.cssText = 'color:#c0392b;font-size:13px;margin-top:4px;';
          f.insertAdjacentElement('afterend', err);
        }
        err.textContent = '필수 입력 항목입니다.';
      } else {
        f.removeAttribute('aria-invalid');
        if (err) err.remove();
      }
    });
    if (!ok) {
      var first = form.querySelector('[aria-invalid="true"]');
      if (first) first.focus();
      return;
    }
    alert('입력 내용이 확인되었습니다.\n\n※ 현재 데모 페이지로 실제 전송은 되지 않습니다. 전화·이메일로 문의해 주세요.');
    form.reset();
  });
})();

/* ── 제품 카테고리 필터 ────────────────────────────────── */
(function initProductFilter() {
  var btns = document.querySelectorAll('.filter-btn');
  if (!btns.length) return;
  var cards = document.querySelectorAll('.product-card-full');
  btns.forEach(function(b) {
    b.addEventListener('click', function() {
      var cat = b.getAttribute('data-category');
      btns.forEach(function(x) {
        x.setAttribute('aria-pressed', 'false');
        x.style.background = 'var(--c-white)';
        x.style.color = 'var(--c-charcoal)';
      });
      b.setAttribute('aria-pressed', 'true');
      b.style.background = 'var(--c-green)';
      b.style.color = '#fff';
      cards.forEach(function(c) {
        var el = c.querySelector('.product-cat');
        var cc = el ? el.textContent.trim() : '';
        c.style.display = (cat === 'all' || cc === cat) ? '' : 'none';
      });
    });
  });
})();

/* ─────────────────────────────────────────────────────────
   DATA-COUNT COUNT-UP 애니메이션
   - [data-count] 속성이 있는 .stat-count-val 요소 대상
   - 숫자가 아닌 "[확인]" 류 텍스트는 건너뜀
   - @media (prefers-reduced-motion: reduce) 에서 비활성
─────────────────────────────────────────────────────────── */
function initCountUp(el) {
  // reduced-motion 체크
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var raw = el.textContent.trim();
  // 숫자가 포함되지 않으면 skip ([확인], [확인 필요] 등)
  if (!/\d/.test(raw)) return;

  // 앞/뒤 비숫자 제거해 정수 추출
  var target = parseInt(raw.replace(/[^0-9]/g, ''), 10);
  if (isNaN(target) || target === 0) return;

  var duration = 1400; // ms
  var start    = null;

  function step(timestamp) {
    if (!start) start = timestamp;
    var progress = Math.min((timestamp - start) / duration, 1);
    // easeOutCubic
    var ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(ease * target);
    if (progress < 1) requestAnimationFrame(step);
  }

  el.textContent = '0';
  requestAnimationFrame(step);
}

/* ─────────────────────────────────────────────────────────
   IntersectionObserver fade-up
   + 카드 그리드 / 스텝 리스트 스태거 딜레이 자동 적용
   + data-count count-up 트리거
─────────────────────────────────────────────────────────── */
(function initFadeUp() {
  // 브라우저 지원 없으면 즉시 보이기
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.fade-up').forEach(function(el) {
      el.classList.add('visible');
    });
    return;
  }

  // 스태거 딜레이를 자동으로 할당할 부모 선택자
  // (직접 자식 .fade-up 요소들에 순차 딜레이 적용)
  var STAGGER_PARENTS = [
    '.about-grid',
    '.cap-grid',
    '.process-steps',
    '.stats-inner',
    '.why-inner .slider-track'
  ];
  var STAGGER_MS = 80; // 항목당 딜레이 간격(ms)

  // prefers-reduced-motion이면 스태거 건너뜀
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  STAGGER_PARENTS.forEach(function(selector) {
    var parent = document.querySelector(selector);
    if (!parent) return;
    var children = parent.querySelectorAll('.fade-up');
    children.forEach(function(child, i) {
      // inline transition-delay가 없을 때만 자동 할당
      if (!child.style.transitionDelay && !prefersReduced) {
        child.style.transitionDelay = (i * STAGGER_MS) + 'ms';
      }
    });
  });

  // IntersectionObserver 등록
  var io = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      el.classList.add('visible');
      io.unobserve(el);

      // count-up 트리거: 부모에 [data-count] 있거나 자식 .stat-count-val 포함 시
      var countVal = el.querySelector('.stat-count-val');
      if (countVal) {
        initCountUp(countVal);
      }
      // 자신이 stat-count-val인 경우
      if (el.classList.contains('stat-count-val')) {
        initCountUp(el);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.fade-up').forEach(function(el) {
    io.observe(el);
  });

  // 통계 스트립 stat-num 내 count-up도 별도 관찰
  document.querySelectorAll('[data-count] .stat-count-val').forEach(function(el) {
    io.observe(el);
  });
})();

/* ── TOP 버튼 ─────────────────────────────────────────── */
(function initTop() {
  var btn = document.getElementById('rail-top');
  if (!btn) return;
  btn.addEventListener('click', function() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

/* ── 앵커 스무스 스크롤 (헤더 오프셋 보정) ─────────────── */
(function initAnchorScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(function(a) {
    a.addEventListener('click', function(e) {
      var id = a.getAttribute('href');
      if (id === '#') return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      var header = document.getElementById('header');
      var offset = header ? header.offsetHeight + 8 : 80;
      var top    = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  });
})();
