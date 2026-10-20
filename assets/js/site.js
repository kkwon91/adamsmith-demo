/* ── 00-core.js ── */
/* 공용 동작: 휴대폰 메뉴 · 검색(못 찾은 말 기록) · 장바구니 저장소(window.AS) · 장바구니 숫자 */
(function () {
  'use strict';
  var BASE = document.body.getAttribute('data-base') || '/';
  var KEY = { cart: 'adamsmith.cart.v1', my: 'adamsmith.my.v1', miss: 'adamsmith.searchMiss.v1', orders: 'adamsmith.orders.v1' };
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가(사생활 보호 창 등) — 화면만 */ } }

  // ── 장바구니·내 강의실(데모: 이 브라우저에만) ──
  var AS = window.AS = window.AS || {};
  AS.base = BASE;
  AS.url = function (p) { return BASE + String(p || '').replace(/^\/+/, ''); };
  AS.load = load; AS.save = save; AS.KEY = KEY;
  AS.cart = {
    list: function () { return load(KEY.cart, []); },
    add: function (item) {
      var list = AS.cart.list();
      if (!list.some(function (x) { return x.type === item.type && x.slug === item.slug; })) list.push(item);
      save(KEY.cart, list); AS.cart.paint(); return list;
    },
    remove: function (type, slug) {
      var list = AS.cart.list().filter(function (x) { return !(x.type === type && x.slug === slug); });
      save(KEY.cart, list); AS.cart.paint(); return list;
    },
    clear: function () { save(KEY.cart, []); AS.cart.paint(); },
    paint: function () {
      var n = AS.cart.list().length;
      document.querySelectorAll('[data-cart-count]').forEach(function (b) { b.textContent = n; b.hidden = n === 0; });
    }
  };
  AS.my = {
    list: function () { return load(KEY.my, []); },
    has: function (slug) { return AS.my.list().some(function (x) { return x.slug === slug; }); },
    enroll: function (items) {
      var list = AS.my.list(), now = new Date().toISOString();
      items.forEach(function (it) { if (!list.some(function (x) { return x.slug === it.slug && x.type === it.type; })) list.push(Object.assign({ at: now, progress: 0 }, it)); });
      save(KEY.my, list); return list;
    }
  };
  AS.cart.paint();

  // ── 관리자 시연 상태(관리자 화면이 같은 브라우저에 저장) → 사이트에 반영 ──
  // { published: { 'video:<id>': true, 'answer:<slug>': true }, held: {…}, exp: { '<실험 id>': 'A'|'B' }, … }
  KEY.admin = 'adamsmith.admin.v1';
  var ADMIN = AS.admin = load(KEY.admin, {});
  // 승인 대기 항목: 생성기는 data-pending-id 를 단 요소를 hidden 으로 내보낸다 → 관리자에서 [게시]하면 보인다
  document.querySelectorAll('[data-pending-id]').forEach(function (el) {
    var id = el.getAttribute('data-pending-id');
    if (ADMIN.published && ADMIN.published[id]) { el.hidden = false; el.classList.add('just-published'); }
  });
  // 문구 실험: <p data-exp="exp-id" data-exp-b="B안 글">A안 글</p> — 관리자에서 B안을 확정하면 B안 글로 바뀐다
  document.querySelectorAll('[data-exp]').forEach(function (el) {
    var id = el.getAttribute('data-exp'), b = el.getAttribute('data-exp-b');
    if (b && ADMIN.exp && ADMIN.exp[id] === 'B') { el.textContent = b; el.setAttribute('data-exp-shown', 'B'); }
    else el.setAttribute('data-exp-shown', 'A');
  });

  // 담기 단추: <button data-cart-add='{"type":"course","slug":"…","title":"…","price":150000}'>
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cart-add]');
    if (!b) return;
    e.preventDefault();
    var item; try { item = JSON.parse(b.getAttribute('data-cart-add')); } catch (err) { return; }
    AS.cart.add(item);
    var go = b.getAttribute('data-go');
    if (go) { location.href = AS.url(go); return; }
    var msg = b.parentElement && b.parentElement.querySelector('[data-cart-msg]');
    if (msg) { msg.hidden = false; }
    b.textContent = '장바구니에 담겼습니다';
    b.setAttribute('aria-disabled', 'true');
  });

  // ── 휴대폰 메뉴 ──
  var drawer = document.getElementById('drawer');
  function setDrawer(open) {
    if (!drawer) return;
    drawer.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) { var f = drawer.querySelector('a,button'); if (f) f.focus(); }
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-open-drawer]')) setDrawer(true);
    else if (e.target.closest('[data-close-drawer]')) setDrawer(false);
  });

  // ── 검색 ──
  var box = document.getElementById('search'), q = document.getElementById('q'), out = document.getElementById('q-results');
  var index = null, lastMiss = '';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function setSearch(open) {
    if (!box) return;
    box.classList.toggle('open', open);
    box.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      setTimeout(function () { q.focus(); }, 30);
      if (!index) fetch(AS.url('assets/data/search.json')).then(function (r) { return r.json(); }).then(function (j) { index = j; run(); }).catch(function () { index = []; });
    } else { recordMiss(); }
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }
  function run() {
    if (!index || !q) return;
    var v = q.value.trim();
    if (!v) { out.innerHTML = ''; return; }
    var n = norm(v);
    var hits = index.filter(function (x) { return norm(x.t + ' ' + x.d + ' ' + x.k).indexOf(n) >= 0; }).slice(0, 12);
    if (!hits.length) {
      out.innerHTML = '<li class="empty">‘' + esc(v) + '’에 맞는 페이지가 아직 없습니다. 이 검색어는 기록되어 새 답변 초안으로 올라갑니다.</li>';
      lastMiss = v;
      return;
    }
    lastMiss = '';
    out.innerHTML = hits.map(function (x) { return '<li><a href="' + AS.url(x.u) + '">' + esc(x.t) + '<small>' + esc(x.k ? x.k + ' · ' : '') + esc(x.d) + '</small></a></li>'; }).join('');
  }
  function recordMiss() {
    if (!lastMiss) return;
    var list = load(KEY.miss, []);
    list.push({ q: lastMiss, at: new Date().toISOString(), path: document.body.getAttribute('data-path') });
    save(KEY.miss, list.slice(-50));
    lastMiss = '';
  }
  if (q) { var t; q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(run, 120); }); }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-open-search]')) setSearch(true);
    else if (box && e.target === box) setSearch(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { setDrawer(false); setSearch(false); }
    if (e.key === '/' && !/input|textarea|select/i.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); setSearch(true); }
  });
})();

/* ── 20-home.js ── */
/* 홈 목적별 공부 길 탭(키보드 좌우 이동) */
(function () {
  'use strict';
  var list = document.querySelector('.path-tabs[role="tablist"]');
  if (!list) return;
  var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
  function select(t, focus) {
    tabs.forEach(function (x) {
      var on = x === t;
      x.setAttribute('aria-selected', on ? 'true' : 'false');
      x.tabIndex = on ? 0 : -1;
      var p = document.getElementById(x.getAttribute('aria-controls'));
      if (p) p.hidden = !on;
    });
    if (focus) t.focus();
  }
  list.addEventListener('click', function (e) { var t = e.target.closest('[role="tab"]'); if (t) select(t); });
  list.addEventListener('keydown', function (e) {
    var i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); select(tabs[(i + 1) % tabs.length], true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); select(tabs[(i - 1 + tabs.length) % tabs.length], true); }
  });
})();

/* ── 30-courses.js ── */
/* 강의 영역: 목록 걸러 보기(분류·목적) · 커리큘럼 접기 · 이미 수강 중이면 '내 강의실에서 보기' */
(function () {
  'use strict';

  // ── /classes/ 걸러 보기: 스크립트가 없으면 전부 보이고, 있으면 칩으로 거른다 ──
  var bar = document.querySelector('[data-cr-filter]');
  if (bar) {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-cr-item]'));
    var count = bar.querySelector('[data-cr-count]');
    var empty = document.querySelector('[data-cr-empty]');
    var notes = Array.prototype.slice.call(document.querySelectorAll('[data-cr-note]'));
    var state = { kind: 'all', track: 'all' };
    var KIND = { sub: '구독', paid: '정규', free: '무료' };
    var TRACK = {};
    bar.querySelectorAll('[data-f="track"]').forEach(function (b) { TRACK[b.getAttribute('data-v')] = b.textContent.trim(); });

    var apply = function () {
      var n = 0;
      items.forEach(function (el) {
        var okK = state.kind === 'all' || el.getAttribute('data-kind') === state.kind;
        var okT = state.track === 'all' || (' ' + el.getAttribute('data-tracks') + ' ').indexOf(' ' + state.track + ' ') >= 0;
        el.hidden = !(okK && okT);
        if (okK && okT) n++;
      });
      bar.querySelectorAll('[data-f]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(state[b.getAttribute('data-f')] === b.getAttribute('data-v')));
      });
      var label = [state.kind !== 'all' ? KIND[state.kind] : '', state.track !== 'all' ? TRACK[state.track] : ''].filter(Boolean).join(' · ');
      if (count) count.textContent = label ? label + ' — 강의 ' + n + '개' : '강의 ' + items.length + '개';
      if (empty) empty.hidden = n > 0;
      notes.forEach(function (el) { el.hidden = el.getAttribute('data-cr-note') !== state.track; });
    };
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]');
      if (!b) return;
      state[b.getAttribute('data-f')] = b.getAttribute('data-v');
      apply();
      try { history.replaceState(null, '', location.pathname + (state.kind === 'all' && state.track === 'all' ? '' : '#' + state.kind + ',' + state.track)); } catch (err) { /* 주소 바꾸기 불가 — 무시 */ }
    });
    // 주소 끝 #free,start 처럼 들어오면 그 조건으로 시작(다른 쪽에서 걸러 보기 링크용)
    var fromHash = function () {
      var m = /^#(all|sub|paid|free),([a-z-]+)$/.exec(location.hash || '');
      if (!m) return false;
      state.kind = m[1]; state.track = TRACK[m[2]] ? m[2] : 'all';
      return true;
    };
    fromHash();
    apply();
    window.addEventListener('hashchange', function () { if (fromHash()) apply(); });
  }

  // ── 커리큘럼 접기: 12강이 넘는 표는 처음 8강만 보이고 [전체 보기]로 펼친다 ──
  document.querySelectorAll('[data-cr-collapse]').forEach(function (wrap) {
    var keep = Number(wrap.getAttribute('data-cr-collapse')) || 8;
    var btn = wrap.nextElementSibling && wrap.nextElementSibling.matches('[data-cr-more]') ? wrap.nextElementSibling : null;
    if (!btn) return;
    var rows = Array.prototype.slice.call(wrap.querySelectorAll('tbody tr'));
    var lessons = 0, fold = [];
    rows.forEach(function (tr) {
      if (!tr.classList.contains('cr-ch')) lessons++;
      if (lessons > keep || (tr.classList.contains('cr-ch') && lessons >= keep)) fold.push(tr);
    });
    if (!fold.length) return;
    var label = btn.textContent;
    var set = function (open) {
      fold.forEach(function (tr) { tr.classList.toggle('is-folded', !open); });
      wrap.classList.toggle('is-collapsed', !open);
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? '접기' : label;
    };
    btn.hidden = false;
    set(false);
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      set(open);
      if (!open) wrap.scrollIntoView({ block: 'nearest' });
    });
  });

  // ── 이미 내 강의실에 있는 강의면 구매 단추 대신 '내 강의실에서 보기' ──
  if (window.AS && AS.my) {
    document.querySelectorAll('[data-cr-buy]').forEach(function (box) {
      if (!AS.my.has(box.getAttribute('data-cr-buy'))) return;
      var btns = box.querySelector('.cr-buy-btns'), mine = box.querySelector('[data-cr-mine]');
      if (btns && mine) { btns.hidden = true; mine.hidden = false; }
    });
    document.querySelectorAll('[data-cr-buybar]').forEach(function (b) {
      if (!AS.my.has(b.getAttribute('data-cr-buybar'))) return;
      var slot = b.querySelector('.cr-bb-btn');
      if (slot) slot.innerHTML = '<a class="btn dark small" href="' + AS.url('/my/') + '">내 강의실에서 보기</a>';
    });
  }
})();

/* ── 31-books.js ── */
/* 책·소개·기업 영역: 책 주제 거르기(/books/) · 기업·단체 문의 폼 시연(/business/) */
(function () {
  'use strict';

  // ── 책 주제 거르기: 단추를 누르면 그 주제의 책만 보인다(스크립트가 없으면 전부 보인다) ──
  var bar = document.querySelector('[data-bk-filter-bar]');
  if (bar) {
    var cards = document.querySelectorAll('[data-bk-tracks]');
    var status = document.querySelector('[data-bk-filter-status]');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-bk-filter]');
      if (!b) return;
      var v = b.getAttribute('data-bk-filter'), n = 0;
      bar.querySelectorAll('[data-bk-filter]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      cards.forEach(function (c) {
        var on = v === 'all' || (' ' + c.getAttribute('data-bk-tracks') + ' ').indexOf(' ' + v + ' ') >= 0;
        c.hidden = !on;
        if (on) n++;
      });
      if (status) status.textContent = n + '권을 보여 드립니다.';
    });
  }

  // ── 기업·단체 문의 폼(데모: 보내지 않고 화면에만 알린다) ──
  var form = document.querySelector('[data-bk-form]');
  if (form) {
    var msg = form.querySelector('[data-bk-form-msg]');
    var fields = form.querySelectorAll('input, select, textarea');
    fields.forEach(function (f) {
      f.addEventListener('input', function () { if (f.checkValidity()) f.removeAttribute('aria-invalid'); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstBad = null;
      fields.forEach(function (f) {
        var ok = f.checkValidity();
        if (ok) f.removeAttribute('aria-invalid'); else { f.setAttribute('aria-invalid', 'true'); if (!firstBad) firstBad = f; }
      });
      msg.hidden = false;
      if (firstBad) {
        msg.className = 'bk-form-msg err';
        msg.textContent = firstBad.type === 'checkbox' ? '개인정보 수집에 동의해 주세요.' : (firstBad.type === 'email' && firstBad.value ? '이메일 주소를 다시 확인해 주세요.' : '필수 칸을 모두 채워 주세요.');
        firstBad.focus();
        return;
      }
      msg.className = 'bk-form-msg';
      msg.textContent = '데모라 실제로 보내지 않았습니다. 입력하신 내용은 어디에도 저장되지 않습니다.';
      msg.focus();
    });
  }
})();

/* ── 32-videos.js ── */
/* 영상 정리·질문 답변: 관리자에서 [게시]한 승인 대기 항목을 이 브라우저 화면에 반영(데모)
   - 00-core.js 가 [data-pending-id] 를 이미 보이게 바꾼 뒤 실행된다(같은 묶음, 파일 이름순).
   - 여기서는 '확인 중' 줄([data-wait-for])을 숨기고, 남은 개수를 다시 세고, 상세 쪽 '승인 대기' 띠 문구를 바꾼다. */
(function () {
  'use strict';
  var AS = window.AS || {};
  var pub = (AS.admin && AS.admin.published) || {};
  if (!document.querySelector('[data-wait-for],[data-pending-band]')) return;

  document.querySelectorAll('[data-wait-for]').forEach(function (el) {
    if (pub[el.getAttribute('data-wait-for')]) el.hidden = true;
  });

  document.querySelectorAll('[data-wait-count]').forEach(function (n) {
    var box = n.closest('.vd-queue');
    if (!box) return;
    var left = box.querySelectorAll('[data-wait-for]:not([hidden])').length;
    n.textContent = String(left);
    if (!left) { var sec = box.closest('section'); if (sec) sec.hidden = true; }
  });

  document.querySelectorAll('[data-pending-band]').forEach(function (band) {
    if (!pub[band.getAttribute('data-pending-band')]) return;
    band.classList.add('is-published');
    var b = band.querySelector('b');
    var t = band.querySelector('[data-band-text]');
    if (b) b.textContent = '게시됨(데모)';
    if (t) t.textContent = '관리자에서 게시한 초안입니다. 이 브라우저에서만 목록에 나타납니다.';
  });
})();
