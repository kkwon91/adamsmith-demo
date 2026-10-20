/* 2분 공부 찾기(/start/) — 질문 다섯 개 → 트랙·시작 단계 점수 → 결과 카드 + 장바구니 담기.
   데이터: 쪽 안 #hp-finder-data(start.mjs 가 finder.json + courses/books/paths 로 만든 것).
   답과 결과는 이 브라우저(localStorage)에만 저장한다. 전역은 window.AS 만 쓴다. */
(function () {
  'use strict';
  var AS = window.AS;
  var dataEl = document.getElementById('hp-finder-data');
  var quiz = document.getElementById('hp-quiz');
  var result = document.getElementById('hp-result');
  if (!AS || !dataEl || !quiz || !result) return;
  var M;
  try { M = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var Q = M.questions;
  var form = document.getElementById('hp-form');
  var sets = Array.prototype.slice.call(form.querySelectorAll('.hp-q'));
  var btnPrev = quiz.querySelector('[data-prev]');
  var btnNext = quiz.querySelector('[data-next]');
  var bar = quiz.querySelector('.hp-prog-bar');
  var stepTxt = quiz.querySelector('[data-step]');
  var cur = 0;
  var answers = {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function won(n) { n = Number(n) || 0; return n === 0 ? '무료' : n.toLocaleString('ko-KR') + '원'; }
  function opt(qid, oid) {
    var q = Q.filter(function (x) { return x.id === qid; })[0];
    return q ? q.options.filter(function (o) { return o.id === oid; })[0] : null;
  }

  // ── 질문 화면 ──
  function show(i, focus) {
    cur = Math.max(0, Math.min(Q.length - 1, i));
    sets.forEach(function (fs, k) { fs.hidden = k !== cur; });
    var pct = Math.round(((cur + 1) / Q.length) * 100);
    bar.firstElementChild.style.width = pct + '%';
    bar.setAttribute('aria-valuenow', String(cur + 1));
    bar.setAttribute('aria-valuetext', '질문 ' + (cur + 1) + ' / ' + Q.length);
    stepTxt.textContent = String(cur + 1);
    btnPrev.hidden = cur === 0;
    btnNext.textContent = cur === Q.length - 1 ? '결과 보기' : '다음';
    syncNext();
    if (focus) {
      var fs = sets[cur];
      var r = fs.querySelector('input:checked') || fs.querySelector('input');
      if (r) r.focus({ preventScroll: true });
      quiz.scrollIntoView({ block: 'nearest' });
    }
  }
  function syncNext() {
    var qid = Q[cur].id;
    btnNext.disabled = !answers[qid];
  }
  function next() {
    if (!answers[Q[cur].id]) return;
    if (cur < Q.length - 1) show(cur + 1, true);
    else finish();
  }
  form.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.type === 'radio') {
      answers[t.name] = t.value;
      syncNext();
    }
  });
  // 마우스·손가락으로 고르면 바로 다음 질문(키보드는 화살표로 고르고 [다음]으로 넘긴다)
  // (라벨을 누르면 라벨·입력칸에 click 이 두 번 오므로 한 번만 넘긴다)
  var advTimer = null;
  form.addEventListener('click', function (e) {
    var lab = e.target.closest('.hp-opt');
    if (!lab || !e.detail || advTimer) return;
    var r = lab.querySelector('input');
    if (!r) return;
    answers[r.name] = r.value;
    advTimer = setTimeout(function () { advTimer = null; next(); }, 220);
  });
  btnNext.addEventListener('click', next);
  btnPrev.addEventListener('click', function () { show(cur - 1, true); });

  // ── 점수 ──
  function compute(ans) {
    var tScore = {}, sScore = { free: 0, book: 0, course: 0, sub: 0 };
    Q.forEach(function (q) {
      var o = opt(q.id, ans[q.id]);
      if (!o) return;
      Object.keys(o.track || {}).forEach(function (k) { tScore[k] = (tScore[k] || 0) + o.track[k]; });
      Object.keys(o.stage || {}).forEach(function (k) { sScore[k] = (sScore[k] || 0) + o.stage[k]; });
    });
    var best = null;
    (M.tiebreak || []).forEach(function (id) {
      var tr = M.tracks.filter(function (t) { return t.id === id; })[0];
      if (!tr) return;
      if (!best || (tScore[id] || 0) > (tScore[best.id] || 0)) best = tr;
    });
    best = best || M.tracks[0];
    // 시작 단계: 단계 점수가 가장 높은 칸(같으면 앞 칸)
    var startIdx = 0, top = -1;
    best.steps.forEach(function (s, i) { var v = sScore[s.key] || 0; if (v > top) { top = v; startIdx = i; } });
    // 장바구니에 미리 골라 둘 칸: 예산 안(무료·한 번 결제 상한·구독 허용 시 첫 구독 하나)
    var budget = (opt('budget', ans.budget) || {}).cart || { maxOnce: 0, sub: false };
    var subPicked = false;
    var picks = best.steps.map(function (s, i) {
      if (!s.cart || s.soldOut) return false;
      var isSub = s.cart.priceUnit === '월';
      if (isSub) {
        if (!budget.sub || subPicked) return false;
        subPicked = true; return true;
      }
      if (!s.cart.price) return true;
      return s.cart.price <= budget.maxOnce;
    });
    // 이유 문장
    var reasons = [];
    var topic = opt('topic', ans.topic), exp = opt('exp', ans.exp);
    if (topic) {
      if (topic.main === best.id || best.id !== 'start') reasons.push(topic.reason);
      else reasons.push(String(M.mixReason || '').replace('{topic}', topic.label).replace('{track}', best.name));
    }
    if (exp && best.id !== 'kids') reasons.push(exp.reason);
    ['style', 'time', 'budget'].forEach(function (k) { var o = opt(k, ans[k]); if (o && o.reason) reasons.push(o.reason); });
    var style = opt('style', ans.style);
    var extra = style && style.extra && M.extras ? M.extras[style.extra] : null;
    return { track: best, startIdx: startIdx, picks: picks, reasons: reasons, extra: extra };
  }

  // ── 결과 화면 ──
  var state = null;
  function render(res, saved) {
    state = res;
    var t = res.track;
    var steps = t.steps.map(function (s, i) {
      var isStart = i === res.startIdx;
      var th = s.img ? '<img src="' + esc(s.img) + '" alt="" loading="lazy" decoding="async">' : '<span class="ph" aria-hidden="true">' + esc(s.kind) + '</span>';
      var ext = s.ext ? ' target="_blank" rel="noopener"' : '';
      var act = s.soldOut
        ? '<span class="hp-soldout">스토어 품절 표시 · 지금은 담을 수 없습니다</span>'
        : s.cart
        ? '<label class="hp-pick"><input type="checkbox" data-pick="' + i + '"' + (res.picks[i] ? ' checked' : '') + '> 장바구니에 담기</label>'
        : '<a class="hp-ext" href="' + esc(s.href) + '"' + ext + '>바로 보기<span class="sr-only">: ' + esc(s.title) + '(새 창)</span> ↗</a>';
      return '<li class="hp-rstep t-' + esc(s.type) + (isStart ? ' is-start' : '') + '">' +
        (isStart ? '<span class="hp-start">여기서 시작</span>' : '') +
        '<div class="th">' + th + '</div>' +
        '<div class="bd">' +
        '<span class="st">' + (i + 1) + '. ' + esc(s.stage) + '</span>' +
        '<a class="tt" href="' + esc(s.href) + '"' + ext + '>' + esc(s.title) + '</a>' +
        (s.why ? '<p class="why">' + esc(s.why) + '</p>' : '') +
        (s.note ? '<p class="nt">' + esc(s.note) + '</p>' : '') +
        '<div class="ft"><span class="tag' + (s.priceText === '무료' ? ' free' : (s.key === 'sub' ? ' sub' : '')) + '">' + esc(s.kind) + '</span><span class="pr">' + esc(s.priceText) + '</span></div>' +
        act +
        '</div></li>';
    }).join('');
    var when = saved && saved.at ? new Date(saved.at) : null;
    result.innerHTML =
      '<div class="hp-res-head">' +
      '<span class="kicker">' + (when ? '지난번 진단 결과 · ' + when.getFullYear() + '.' + String(when.getMonth() + 1).padStart(2, '0') + '.' + String(when.getDate()).padStart(2, '0') : '추천 결과') + '</span>' +
      '<h2 id="hp-res-title" tabindex="-1">‘' + esc(t.name) + '’ 길을 권합니다</h2>' +
      '<p class="who"><b>이런 분께</b> ' + esc(t.who) + '</p>' +
      '</div>' +
      '<h3 class="hp-res-sub">이렇게 골랐습니다</h3>' +
      '<ul class="hp-reasons">' + res.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' +
      '<h3 class="hp-res-sub">추천 순서</h3>' +
      '<ol class="hp-rsteps">' + steps + '</ol>' +
      (t.note ? '<p class="path-note">' + esc(t.note) + '</p>' : '') +
      (res.extra ? '<p class="hp-res-extra"><a href="' + esc(res.extra.href) + '">' + esc(res.extra.label) + ' →</a></p>' : '') +
      '<div class="hp-res-actions">' +
      '<button type="button" class="btn primary" data-finder-add>장바구니에 담기</button>' +
      '<button type="button" class="btn line" data-finder-reset>다시 하기</button>' +
      '</div>' +
      '<p class="hp-res-sum" data-sum aria-live="polite"></p>' +
      '<p class="hp-local">이 결과는 이 브라우저에만 저장됩니다. 로그인하거나 서버로 보내지 않습니다.</p>';
    quiz.hidden = true;
    result.hidden = false;
    syncPicks();
  }
  function picked() {
    if (!state) return [];
    return Array.prototype.slice.call(result.querySelectorAll('[data-pick]:checked')).map(function (c) { return state.track.steps[Number(c.getAttribute('data-pick'))]; });
  }
  function syncPicks() {
    var list = picked();
    var add = result.querySelector('[data-finder-add]');
    var sum = result.querySelector('[data-sum]');
    var once = 0, monthly = 0;
    list.forEach(function (s) { if (s.cart.priceUnit === '월') monthly += s.cart.price; else once += s.cart.price; });
    if (add) {
      add.disabled = list.length === 0;
      add.textContent = list.length ? '고른 ' + list.length + '개 장바구니에 담기' : '담을 항목을 골라 주세요';
    }
    if (sum) {
      sum.textContent = !list.length
        ? '카드 아래 ‘장바구니에 담기’에 표시한 것만 담깁니다.'
        : (once + monthly === 0
          ? '고른 항목은 모두 무료입니다. 무료 수강 신청을 하면 바로 내 강의실에 열립니다.'
          : '오늘 결제 ' + won(once + monthly) + (monthly ? '(구독 첫 달 포함, 다음 달부터 월 ' + won(monthly) + ')' : '') + ' · 결제하면 강의는 바로 내 강의실에 열립니다.');
    }
  }
  result.addEventListener('change', function (e) { if (e.target.matches('[data-pick]')) syncPicks(); });
  result.addEventListener('click', function (e) {
    if (e.target.closest('[data-finder-add]')) {
      var list = picked();
      if (!list.length) return;
      list.forEach(function (s) { AS.cart.add(s.cart); });
      location.href = M.urls.cart;
    } else if (e.target.closest('[data-finder-reset]')) {
      AS.save(M.storageKey, null);
      answers = {};
      form.reset();
      result.hidden = true;
      result.innerHTML = '';
      quiz.hidden = false;
      show(0, true);
    }
  });

  function finish() {
    var res = compute(answers);
    AS.save(M.storageKey, { answers: answers, at: new Date().toISOString(), track: res.track.id });
    render(res, null);
    var h = document.getElementById('hp-res-title');
    if (h) { h.focus({ preventScroll: true }); result.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  }

  // ── 시작: 지난 결과가 있으면 결과부터 ──
  var saved = AS.load(M.storageKey, null);
  var complete = saved && saved.answers && Q.every(function (q) { return opt(q.id, saved.answers[q.id]); });
  if (complete) {
    answers = saved.answers;
    Q.forEach(function (q) { var r = form.querySelector('input[name="' + q.id + '"][value="' + answers[q.id] + '"]'); if (r) r.checked = true; });
    render(compute(answers), saved);
  } else {
    quiz.hidden = false;
    show(0, false);
  }
})();
