/* 구매 시연: 장바구니(/cart/) · 결제(/checkout/) · 내 강의실(/my/)
   - 장바구니 AS.cart, 내 강의실 AS.my(00-core.js), 주문 기록 AS.KEY.orders — 모두 이 브라우저 localStorage 에만.
   - 결제(시연)하면 강의·구독반을 AS.my.enroll 로 바로 등록하고 장바구니를 비운다(실결제 없음).
   - 이름·전화·카드 번호 같은 개인정보는 받지 않는다. 전역은 window.AS 만 쓴다. */
(function () {
  'use strict';
  var AS = window.AS;
  var dataEl = document.getElementById('hp-shop-data');
  var root = document.querySelector('[data-shop]');
  if (!AS || !dataEl || !root) return;
  var M;
  try { M = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var mode = root.getAttribute('data-shop');
  var DAY = 864e5;

  // ── 도우미 ──
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function won(n) { n = Number(n) || 0; return n === 0 ? '무료' : n.toLocaleString('ko-KR') + '원'; }
  function wonAlways(n) { return (Number(n) || 0).toLocaleString('ko-KR') + '원'; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dot(d) { d = new Date(d); return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()); }
  function pendingTag() { return '<span class="hp-pending">' + esc(M.ship.pending) + '</span>'; }
  function info(it) {
    var c = M.cat[it.type + ':' + it.slug] || {};
    // 담기 단추의 img 는 파일 이름만 온다(예: 'b-fx2026.webp') → AS.url('assets/img/' + img)
    var raw = typeof it.img === 'string' ? it.img : '';
    var imgUrl = !raw ? '' : (/^(https?:)?\//.test(raw) ? raw : AS.url('assets/img/' + raw.replace(/^\/+/, '')));
    return {
      type: it.type, slug: it.slug,
      title: c.title || it.title || it.slug, short: c.short || it.title || it.slug,
      kind: c.kind || (it.type === 'book' ? '책' : it.type === 'goods' ? '상품' : '강의'),
      price: typeof c.price === 'number' ? c.price : (Number(it.price) || 0),
      unit: c.unit || (it.priceUnit === '월' ? '월' : ''),
      img: c.img || imgUrl, href: c.href || '#',
      period: c.period || '', days: c.days || null, lessons: c.lessons || 0, author: c.author || '', listPrice: c.listPrice || 0,
    };
  }
  function isSub(i) { return i.unit === '월'; }
  function isShip(i) { return i.type === 'book' || i.type === 'goods'; }
  function priceText(i) { return i.price ? (isSub(i) ? '월 ' : '') + won(i.price) : '무료'; }
  function tagClass(i) { return isSub(i) ? 'sub' : (!i.price ? 'free' : ''); }
  function totals(list) {
    var t = { once: 0, subs: 0, ship: 0, hasShip: false, hasCourse: false, n: list.length };
    list.forEach(function (i) {
      if (isSub(i)) t.subs += i.price; else t.once += i.price;
      if (isShip(i)) t.hasShip = true; else t.hasCourse = true;
    });
    if (t.hasShip) t.ship = M.ship.fee || 0;
    t.today = t.once + t.subs + t.ship;
    return t;
  }
  function sumRows(t) {
    var rows = '';
    if (t.once || !t.subs) rows += '<div><dt>강의·책 금액</dt><dd>' + wonAlways(t.once) + '</dd></div>';
    if (t.subs) rows += '<div><dt>구독 첫 달</dt><dd>' + wonAlways(t.subs) + '</dd></div>';
    if (t.hasShip) rows += '<div><dt>배송비</dt><dd>' + esc(M.ship.label) + '</dd></div>';
    rows += '<div class="total"><dt>오늘 결제 금액</dt><dd>' + wonAlways(t.today) + '</dd></div>';
    if (t.subs) rows += '<p class="hp-sum-note">다음 달부터 매월 ' + wonAlways(t.subs) + '이 자동 결제됩니다. 내 강의실에서 언제든 해지할 수 있습니다.</p>';
    if (t.hasShip) rows += '<p class="hp-sum-note">배송비는 ' + pendingTag() + '</p>';
    return rows;
  }
  function thumb(i) {
    return i.img ? '<img src="' + esc(i.img) + '" alt="" loading="lazy" decoding="async">' : '<span class="ph" aria-hidden="true">' + esc(i.kind) + '</span>';
  }
  function metaOf(i) {
    if (isShip(i)) return [i.author, '택배 배송'].filter(Boolean).join(' · ');
    if (isSub(i)) return (i.lessons ? i.lessons + '강 · ' : '') + '매월 자동 결제(30일 단위)';
    return [i.lessons ? i.lessons + '강' : '', i.period ? '수강 ' + i.period : ''].filter(Boolean).join(' · ');
  }
  function lineHtml(i, removable) {
    return '<li class="hp-line">' +
      '<a class="th' + (isShip(i) ? ' bk' : '') + '" href="' + esc(i.href) + '" tabindex="-1" aria-hidden="true">' + thumb(i) + '</a>' +
      '<div class="bd"><span class="tag ' + tagClass(i) + '">' + esc(i.kind) + '</span>' +
      '<a class="tt" href="' + esc(i.href) + '">' + esc(i.short) + '</a>' +
      '<span class="mt">' + esc(metaOf(i)) + '</span></div>' +
      '<div class="pr">' + (i.listPrice > i.price ? '<s>' + won(i.listPrice) + '</s>' : '') + esc(priceText(i)) + '</div>' +
      (removable ? '<button type="button" class="hp-x" data-remove="' + esc(i.type) + '|' + esc(i.slug) + '" aria-label="' + esc(i.short) + ' 빼기">×</button>' : '') +
      '</li>';
  }
  var loadingEl = root.querySelector('[data-loading]');
  if (loadingEl) loadingEl.hidden = true;

  // ───────── 장바구니 ─────────
  function renderCart() {
    var list = AS.cart.list().map(info);
    var box = $('hp-cart'), empty = $('hp-empty');
    if (!list.length) { box.hidden = true; empty.hidden = false; return; }
    empty.hidden = true; box.hidden = false;
    var t = totals(list);
    root.querySelector('[data-count]').textContent = list.length + '개';
    $('hp-lines').innerHTML = list.map(function (i) { return lineHtml(i, true); }).join('');
    root.querySelector('[data-ship-note]').hidden = !t.hasShip;
    $('hp-sum-rows').innerHTML = sumRows(t);
    var go = root.querySelector('[data-go-checkout]');
    go.textContent = t.today ? wonAlways(t.today) + ' 결제하기' : '무료 수강 신청하기';
  }
  if (mode === 'cart') {
    root.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-remove]');
      if (rm) {
        var p = rm.getAttribute('data-remove').split('|');
        var all = Array.prototype.slice.call(root.querySelectorAll('[data-remove]'));
        var idx = all.indexOf(rm);
        AS.cart.remove(p[0], p[1]);
        renderCart();
        var left = root.querySelectorAll('[data-remove]');
        var f = left[Math.min(idx, left.length - 1)] || root.querySelector('#hp-empty h2');
        if (f) { if (!f.hasAttribute('tabindex') && f.tagName === 'H2') f.setAttribute('tabindex', '-1'); f.focus(); }
        return;
      }
      if (e.target.closest('[data-clear]')) { AS.cart.clear(); renderCart(); }
    });
    renderCart();
  }

  // ───────── 결제 ─────────
  function orderId() {
    var d = new Date();
    return 'AS-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + String(Math.floor(1000 + Math.random() * 9000));
  }
  function renderCheckout() {
    var list = AS.cart.list().map(info);
    var co = $('hp-co'), empty = $('hp-co-empty');
    if (!list.length) {
      co.hidden = true; empty.hidden = false;
      var orders = AS.load(AS.KEY.orders, []);
      var last = orders[orders.length - 1];
      if (last) root.querySelector('[data-last-order]').innerHTML = '최근 주문 <b>' + esc(last.id) + '</b>(' + dot(last.at) + ')은 <a href="' + esc(M.urls.my) + '">내 강의실</a>에서 볼 수 있습니다.';
      return;
    }
    empty.hidden = true; co.hidden = false;
    var t = totals(list);
    $('hp-co-lines').innerHTML = list.map(function (i) { return lineHtml(i, false); }).join('');
    $('hp-co-sum').innerHTML = sumRows(t);
    var free = t.today === 0;
    $('hp-pay-box').hidden = free;
    root.querySelector('[data-ok-no]').textContent = free ? '2' : '3';
    $('hp-pay').textContent = free ? '무료 수강 신청' : wonAlways(t.today) + ' 결제하기(시연)';
  }
  function complete() {
    var list = AS.cart.list().map(info);
    if (!list.length) return;
    var t = totals(list);
    var m = t.today === 0 ? 'free' : ((root.querySelector('input[name="method"]:checked') || {}).value || 'card');
    var id = orderId(), at = new Date().toISOString();
    var order = {
      id: id, at: at, method: m, methodLabel: M.methods[m] || m, total: t.today, ship: t.ship, status: '결제 완료(시연)',
      items: list.map(function (i) { var o = { type: i.type, slug: i.slug, title: i.title, price: i.price }; if (isSub(i)) o.priceUnit = '월'; return o; }),
    };
    var orders = AS.load(AS.KEY.orders, []);
    orders.push(order);
    AS.save(AS.KEY.orders, orders.slice(-50));
    var courses = list.filter(function (i) { return i.type === 'course'; });
    if (courses.length) {
      AS.my.enroll(courses.map(function (i) {
        var o = { type: 'course', slug: i.slug, title: i.title, kind: i.kind, price: i.price, period: i.period, orderId: id };
        if (isSub(i)) o.priceUnit = '월';
        return o;
      }));
    }
    AS.cart.clear();
    renderDone(order, list);
  }
  function renderDone(order, list) {
    var courses = list.filter(function (i) { return !isShip(i); });
    var goods = list.filter(isShip);
    var head = courses.length ? '내 강의실에 바로 열렸습니다' : '주문이 접수되었습니다';
    var lead = courses.length
      ? (order.method === 'free' ? '무료 수강 신청이 끝났습니다. ' : '결제(시연)가 끝났습니다. ') + '강의 ' + courses.length + '개가 지금 바로 내 강의실에 열렸습니다.'
      : '책·상품은 배송 준비 중으로 표시됩니다(시연).';
    var items = courses.map(function (i) {
      return '<li><span class="th">' + thumb(i) + '</span><span class="tt">' + esc(i.short) + '</span><span class="tag free">' + (isSub(i) ? '구독 시작' : '바로 열림') + '</span></li>';
    }).concat(goods.map(function (i) {
      return '<li><span class="th bk">' + thumb(i) + '</span><span class="tt">' + esc(i.short) + '</span><span class="tag">배송 준비 중(시연)</span></li>';
    })).join('');
    var done = $('hp-done');
    done.innerHTML =
      '<div class="hp-done-head"><span class="ok" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
      '<h2 id="hp-done-title" tabindex="-1">' + esc(head) + '</h2>' +
      '<p>' + esc(lead) + '</p>' +
      '<p class="meta">주문 번호 <b>' + esc(order.id) + '</b> · ' + esc(order.methodLabel) + ' · ' + wonAlways(order.total) + ' · 시연 결제(실제 결제 없음)</p></div>' +
      '<ul class="hp-done-list">' + items + '</ul>' +
      (goods.length ? '<p class="hp-fine">책·상품 배송 기간 ' + esc(M.ship.days) + ' ' + pendingTag() + '</p>' : '') +
      '<div class="btns"><a class="btn primary" href="' + esc(M.urls.my) + '">내 강의실로 가기</a><a class="btn line" href="' + esc(M.urls.classes) + '">강의 더 둘러보기</a></div>' +
      '<p class="hp-done-was">예전에는 스토어에서 결제한 뒤 클래스 사이트에 따로 가입하고, 전화나 1:1 문의로 등록을 요청해 영업시간 안에 직원이 강의실을 열어 줬습니다. 새 사이트에서는 그 단계가 없습니다.</p>';
    $('hp-co').hidden = true;
    done.hidden = false;
    var h2 = $('hp-done-title');
    if (h2) h2.focus({ preventScroll: true });
    window.scrollTo({ top: Math.max(0, done.getBoundingClientRect().top + window.pageYOffset - 90), behavior: 'smooth' });
  }
  if (mode === 'checkout') {
    var agree = $('hp-agree'), err = $('hp-agree-err');
    agree.addEventListener('change', function () { if (agree.checked) err.hidden = true; });
    $('hp-pay').addEventListener('click', function () {
      if (!agree.checked) { err.hidden = false; err.setAttribute('role', 'alert'); agree.focus(); return; }
      complete();
    });
    renderCheckout();
  }

  // ───────── 내 강의실 ─────────
  function nextPay(at, now) {
    var d = new Date(at).getTime() + 30 * DAY;
    while (d <= now) d += 30 * DAY;
    return d;
  }
  function renderMy() {
    var now = Date.now();
    var enrolled = AS.my.list().filter(function (x) { return !x.type || x.type === 'course'; });
    var rows = enrolled.map(function (x) { var i = info({ type: 'course', slug: x.slug, title: x.title, price: x.price, priceUnit: x.priceUnit }); i.e = x; return i; });
    var regular = rows.filter(function (i) { return !isSub(i); });
    var subs = rows.filter(isSub);
    var orders = AS.load(AS.KEY.orders, []);
    var goods = [];
    orders.forEach(function (o) { (o.items || []).forEach(function (it) { if (it.type === 'book' || it.type === 'goods') { var i = info(it); i.order = o; goods.push(i); } }); });
    var any = rows.length || goods.length || orders.length;
    $('hp-my').hidden = !any;
    $('hp-my-empty').hidden = !!any;
    if (!any) return;

    $('hp-my-stats').innerHTML =
      '<li><b>' + regular.length + '</b><span>수강 중인 강의</span></li>' +
      '<li><b>' + subs.filter(function (i) { return !i.e.cancelled; }).length + '</b><span>이용 중인 구독</span></li>' +
      '<li><b>' + goods.length + '</b><span>주문한 책·상품</span></li>' +
      '<li><b>' + orders.length + '</b><span>주문</span></li>';

    // 수강 중인 강의
    $('hp-my-courses-sec').hidden = !regular.length;
    $('hp-my-courses').innerHTML = regular.slice().reverse().map(function (i) {
      var start = new Date(i.e.at).getTime();
      var p = Math.max(0, Math.min(100, Number(i.e.progress) || 0));
      var left = '';
      if (i.days) {
        var end = start + i.days * DAY;
        var rem = Math.ceil((end - now) / DAY);
        left = rem > 0 ? '남은 기간 <b>' + rem + '일</b> · ' + dot(end) + '까지' : '수강 기간이 끝났습니다';
      }
      return '<li class="hp-mc">' +
        '<a class="th" href="' + esc(i.href) + '" tabindex="-1" aria-hidden="true">' + thumb(i) + '</a>' +
        '<div class="bd"><div class="tags"><span class="tag ' + tagClass(i) + '">' + esc(i.kind) + '</span><span class="tag free">바로 열림</span></div>' +
        '<h3><a href="' + esc(i.href) + '">' + esc(i.short) + '</a></h3>' +
        '<div class="hp-progress"><span class="lbl">진도 ' + p + '%</span><span class="bar" role="progressbar" aria-label="' + esc(i.short) + ' 진도" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '"><span style="width:' + p + '%"></span></span></div>' +
        '<p class="mt">' + left + (left ? ' · ' : '') + '수강 시작 ' + dot(start) + (i.lessons ? ' · ' + i.lessons + '강' : '') + '</p></div>' +
        '<div class="act"><a class="btn primary small" href="' + esc(i.href) + '">강의 보기</a></div>' +
        '</li>';
    }).join('');

    // 구독
    $('hp-my-subs-sec').hidden = !subs.length;
    $('hp-my-subs').innerHTML = subs.slice().reverse().map(function (i) {
      var x = i.e, pay = nextPay(x.at, now);
      var status, act;
      if (x.cancelled) {
        status = '<span class="tag closed">해지됨</span> ' + dot(x.endAt || pay) + '까지 볼 수 있고, 자동 결제는 멈췄습니다.';
        act = '<button type="button" class="btn line small" data-sub-resume="' + esc(i.slug) + '">해지 취소</button>';
      } else if (confirmSlug === i.slug) {
        status = '해지하면 ' + dot(pay) + '부터 자동 결제가 멈추고 그날까지 볼 수 있습니다. 결제한 달의 부분 환불은 없습니다.';
        act = '<button type="button" class="btn dark small" data-sub-cancel-ok="' + esc(i.slug) + '">해지 확정(시연)</button><button type="button" class="btn line small" data-sub-cancel-no>그대로 두기</button>';
      } else {
        status = '<span class="tag sub">이용 중</span> 다음 결제일 <b>' + dot(pay) + '</b>';
        act = '<button type="button" class="btn line small" data-sub-cancel="' + esc(i.slug) + '">해지하기(시연)</button>';
      }
      return '<li class="hp-ms' + (x.cancelled ? ' is-off' : '') + '">' +
        '<a class="th" href="' + esc(i.href) + '" tabindex="-1" aria-hidden="true">' + thumb(i) + '</a>' +
        '<div class="bd"><h3><a href="' + esc(i.href) + '">' + esc(i.short) + '</a></h3>' +
        '<p class="mt">월 ' + wonAlways(i.price) + ' · 매월 자동 결제(30일 단위) · 시작 ' + dot(x.at) + '</p>' +
        '<p class="st" aria-live="polite">' + status + '</p></div>' +
        '<div class="act">' + act + (x.cancelled ? '' : '<a class="btn primary small" href="' + esc(i.href) + '">강의 보기</a>') + '</div>' +
        '</li>';
    }).join('');

    // 책·상품
    $('hp-my-books-sec').hidden = !goods.length;
    $('hp-my-books').innerHTML = goods.slice().reverse().map(function (i) {
      return '<li class="hp-mb"><span class="th bk">' + thumb(i) + '</span>' +
        '<div class="bd"><h3><a href="' + esc(i.href) + '">' + esc(i.type === 'book' ? '『' + i.title + '』' : i.title) + '</a></h3>' +
        '<p class="mt">주문 ' + esc(i.order.id) + ' · ' + dot(i.order.at) + ' · ' + won(i.price) + '</p></div>' +
        '<span class="hp-ship">배송 준비 중(시연)</span></li>';
    }).join('');

    // 주문 기록
    $('hp-my-orders-sec').hidden = !orders.length;
    $('hp-my-orders').innerHTML = orders.slice().reverse().map(function (o) {
      var names = (o.items || []).map(function (it) { return info(it).short; });
      var label = names[0] + (names.length > 1 ? ' 외 ' + (names.length - 1) + '개' : '');
      return '<tr><td class="num" data-label="주문 번호">' + esc(o.id) + '</td><td class="num" data-label="주문일">' + dot(o.at) + '</td><td data-label="항목">' + esc(label) + '</td><td class="r num" data-label="결제 금액">' + wonAlways(o.total) + '</td><td data-label="결제 수단">' + esc(o.methodLabel || o.method) + '</td></tr>';
    }).join('');
  }
  var confirmSlug = null;
  function setEnrolled(slug, patch) {
    var list = AS.my.list();
    list.forEach(function (x) { if (x.slug === slug) { Object.keys(patch).forEach(function (k) { if (patch[k] === null) delete x[k]; else x[k] = patch[k]; }); } });
    AS.save(AS.KEY.my, list);
  }
  if (mode === 'my') {
    root.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-sub-cancel]'))) { confirmSlug = b.getAttribute('data-sub-cancel'); renderMy(); focusIn('[data-sub-cancel-ok]'); }
      else if (e.target.closest('[data-sub-cancel-no]')) { var s = confirmSlug; confirmSlug = null; renderMy(); focusIn('[data-sub-cancel="' + s + '"]'); }
      else if ((b = e.target.closest('[data-sub-cancel-ok]'))) {
        var slug = b.getAttribute('data-sub-cancel-ok');
        var x = AS.my.list().filter(function (y) { return y.slug === slug; })[0];
        if (x) setEnrolled(slug, { cancelled: true, cancelAt: new Date().toISOString(), endAt: new Date(nextPay(x.at, Date.now())).toISOString() });
        confirmSlug = null; renderMy(); focusIn('[data-sub-resume="' + slug + '"]');
      } else if ((b = e.target.closest('[data-sub-resume]'))) {
        var sl = b.getAttribute('data-sub-resume');
        setEnrolled(sl, { cancelled: null, cancelAt: null, endAt: null });
        renderMy(); focusIn('[data-sub-cancel="' + sl + '"]');
      } else if ((b = e.target.closest('[data-reset]'))) {
        if (b.getAttribute('data-armed') !== '1') { b.setAttribute('data-armed', '1'); b.textContent = '한 번 더 누르면 모두 지웁니다'; return; }
        AS.save(AS.KEY.cart, []); AS.save(AS.KEY.my, []); AS.save(AS.KEY.orders, []); AS.save(M.finderKey, null);
        AS.cart.paint();
        b.removeAttribute('data-armed'); b.textContent = '데모 기록 모두 지우기';
        renderMy();
      }
    });
    renderMy();
  }
  function focusIn(sel) { var el = root.querySelector(sel); if (el) el.focus(); }

  // 뒤로 가기로 돌아왔을 때(bfcache) 최신 상태로 다시 그린다
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    if (mode === 'cart') renderCart();
    else if (mode === 'checkout' && $('hp-done').hidden) renderCheckout();
    else if (mode === 'my') renderMy();
  });
})();
