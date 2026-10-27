/* 애덤스미스 관리자 데모 — AI 자가진화 센터 중심.
   읽는 것: data.json(빌드 때 생성 — 강의·책·영상·답변·변경 기록·금칙어 규칙) + seed.json(예시 운영 데이터).
   저장: localStorage 'adamsmith.admin.v1' — 사이트(00-core.js)와 같이 쓰는 키.
     사이트가 읽는 값: published{'video:<id>'|'answer:<slug>': true} · held{…} · exp{'<실험 id>': 'A'|'B'}
     관리자만 쓰는 값(같은 객체의 다른 키): log · edits · assigned · synonyms · searchDrafts · autos · courseEdits · bookEdits ·
       orderStatus · coupons · inqSent · reviewStatus · homeOrder · info
   로그인 상태는 sessionStorage(이 탭에만). alert/confirm 대신 화면 안 확인 상자. */
(function () {
  'use strict';

  var KEY = 'adamsmith.admin.v1';
  var MISS_KEY = 'adamsmith.searchMiss.v1';
  var ORDERS_KEY = 'adamsmith.orders.v1';
  var SESSION_KEY = 'adamsmith.admin.session';
  var ACCOUNT = { id: 'moneydo', pw: 'demo1234' };

  var D = null;      // data.json
  var SEED = null;   // seed.json
  var ST = null;     // 관리자 상태
  var UI = { inboxTab: 'pending', editing: null, aiFilter: 'all', logFilter: 'all', orderTab: 'all', lastRoute: '' };
  var AFTER = [];    // 그린 뒤 실행(차트 등)
  var CHARTS = [];

  // ── 도우미 ──
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가(사생활 보호 창 등) — 화면만 */ } }
  function num(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  function won(n) { return n ? num(n) + '원' : '무료'; }
  function priceText(x) { return !x.price ? '무료' : (x.priceUnit === '월' ? '월 ' : '') + won(x.price); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dot(d) { return String(d || '').slice(0, 10).replace(/-/g, '.'); }
  function md(d) { var s = dot(d); return s.slice(5); }
  function hm(iso) { var d = new Date(iso); if (isNaN(d)) return ''; return pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function nowIso() { return new Date().toISOString(); }
  function pct(a, b, k) { return b ? (a / b * 100).toFixed(k == null ? 1 : k) : '0'; }
  function icon(n, cls) { return '<svg class="ad-ico ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  var EX = '<span class="ad-ex" title="예시 데이터 — 실제 값이 아닙니다">예시</span>';
  function site(p) { return '../' + String(p || '').replace(/^\/+/, ''); }
  function mask(name) { var s = String(name || '').trim(); if (/○/.test(s) || s.length < 2) return s; return s[0] + '○' + s.slice(2 > s.length - 1 ? 1 : 2); }

  // ── 상태 ──
  function freshState(raw) {
    var s = raw && typeof raw === 'object' ? raw : {};
    ['published', 'held', 'exp', 'edits', 'assigned', 'autos', 'courseEdits', 'bookEdits', 'orderStatus', 'inqSent', 'reviewStatus', 'info'].forEach(function (k) { if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {}; });
    ['log', 'synonyms', 'searchDrafts', 'coupons'].forEach(function (k) { if (!Array.isArray(s[k])) s[k] = []; });
    if (!Array.isArray(s.homeOrder)) s.homeOrder = null;
    return s;
  }
  function commit() { save(KEY, ST); paintCounts(); }
  function addLog(kind, loop, what, key) { ST.log.unshift({ at: nowIso(), kind: kind, loop: loop, what: what, key: key || null }); }

  // ── 금칙어 점검(src/lib/rules.mjs 와 같은 규칙 — data.json 에 문자열 정규식 그대로 실림) ──
  function scan(text) {
    var s = String(text || ''), hits = [], passes = [];
    if (!D) return { hits: hits, passes: passes };
    D.rules.forEach(function (r) {
      var re = new RegExp(r.re, 'g'), neg = new RegExp(D.negation), m;
      while ((m = re.exec(s))) {
        var end = m.index + m[0].length, after = s.slice(end, end + 12);
        var nm = neg.exec(after);
        if (!nm) { hits.push({ id: r.id, term: m[0].trim(), why: r.why, i: m.index, j: end }); break; }
        passes.push({ id: r.id, term: (m[0] + nm[0]).trim(), i: m.index, j: end });
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    });
    return { hits: hits, passes: passes };
  }
  var PII = /\d{2,3}[-.\s]\d{3,4}[-.\s]\d{4}|[\w.+-]+@[\w-]+\.[\w.]+/;
  function marked(text) {
    var s = String(text || ''), r = scan(s);
    var ranges = r.hits.map(function (h) { return { i: h.i, j: h.j, c: 'ad-hit' }; }).concat(r.passes.map(function (p) { return { i: p.i, j: p.j, c: 'ad-pass' }; })).sort(function (a, b) { return a.i - b.i; });
    var out = '', pos = 0;
    ranges.forEach(function (g) { if (g.i < pos) return; out += esc(s.slice(pos, g.i)) + '<mark class="' + g.c + '">' + esc(s.slice(g.i, g.j)) + '</mark>'; pos = g.j; });
    return out + esc(s.slice(pos));
  }
  function checkBox(text, opt) {
    opt = opt || {};
    if (opt.human) {
      return '<div class="ad-check ad-check--lock"><p class="ad-check__h">' + icon('lock', 'ad-ico--sm') + '사람만 — ' + esc(opt.human) + '</p><p class="ad-small" style="color:var(--ink-2)">AI가 초안을 쓰지 않는 영역입니다. 담당자가 직접 쓰고 확인합니다.</p></div>';
    }
    var r = scan(text), pii = PII.test(String(text || ''));
    var h = '';
    if (r.hits.length) {
      h += '<div class="ad-check ad-check--bad" data-check="bad"><p class="ad-check__h">' + icon('alert', 'ad-ico--sm') + '금칙어 ' + r.hits.length + '건 — 게시 막힘</p><ul>' +
        r.hits.map(function (x) { return '<li><b>‘' + esc(x.term) + '’</b> — ' + esc(x.why) + '</li>'; }).join('') + '</ul></div>';
    } else {
      h += '<div class="ad-check ad-check--ok" data-check="ok"><p class="ad-check__h">' + icon('check', 'ad-ico--sm') + '금칙어 0건 · ' + D.rules.length + '종 점검 통과</p>' +
        (r.passes.length ? '<p class="ad-check__pass">부정문 예외로 통과: ' + r.passes.map(function (p) { return '‘' + esc(p.term) + '’'; }).join(', ') + '</p>' : '') + '</div>';
    }
    h += '<p class="ad-small ad-muted" style="margin-top:6px">' + (pii ? '<b style="color:var(--bad)">개인정보로 보이는 글자가 있습니다 — 지우고 게시하세요</b>' : '개인정보(이름·연락처) 없음') + (opt.source ? ' · 출처 ' + esc(opt.source) : '') + '</p>';
    return h;
  }

  // ── 제안(승인함) 만들기 ──
  var TRACK_OF_TOPIC = { 'kr-market': 'kr-stock', 'us-ai': 'us-stock', rates: 'macro', pension: 'start', china: 'macro', energy: 'macro', realestate: 'macro', world: 'macro', sector: 'kr-stock' };
  function recoFor(v) {
    var out = [];
    var rel = v.related;
    if (rel) {
      var cs = Array.isArray(rel) ? rel.filter(function (x) { return x && (x.type === 'course' || x.course); }).map(function (x) { return x.slug || x.course; }) : (rel.courses || []);
      var bs = Array.isArray(rel) ? rel.filter(function (x) { return x && (x.type === 'book' || x.book); }).map(function (x) { return x.slug || x.book; }) : (rel.books || []);
      cs.forEach(function (s) { var c = D.courses.find(function (x) { return x.slug === s; }); if (c) out.push({ t: '강의', name: c.short || c.title, href: site('/classes/' + c.slug + '/') }); });
      bs.forEach(function (s) { var b = D.books.find(function (x) { return x.slug === s; }); if (b) out.push({ t: '책', name: b.title, href: site('/books/' + b.slug + '/') }); });
      if (out.length) return out.slice(0, 3);
    }
    var tracks = (v.topics || []).map(function (t) { return TRACK_OF_TOPIC[t]; }).filter(Boolean);
    if (!tracks.length) return out;
    var c = D.courses.find(function (x) { return x.kind !== '기업' && x.status === 'open' && (x.tracks || []).some(function (t) { return tracks.indexOf(t) >= 0; }); });
    var b = D.books.find(function (x) { return (x.tracks || []).some(function (t) { return tracks.indexOf(t) >= 0; }); });
    if (c) out.push({ t: '강의', name: c.short || c.title, href: site('/classes/' + c.slug + '/') });
    if (b) out.push({ t: '책', name: b.title, href: site('/books/' + b.slug + '/') });
    return out;
  }
  function guestOf(v) {
    var g = String(v.guest || '');
    if (!/기자|대표|교수|연구원|박사|작가|소장|위원/.test(g)) return '';
    var m = /^(.*?)\s*(\d부)$/.exec(g);
    return m ? m[1] + '(' + m[2] + ')' : g;
  }
  function videoLead(v) {
    var g = guestOf(v);
    return dot(v.date) + '에 올라온 전인구경제연구소 영상입니다.' + (g ? ' 출연: ' + g + '.' : '') +
      (v.chapters.length ? ' 설명란의 장 목차 ' + v.chapters.length + '개를 글자로 옮겨, 질문 단위로 찾고 인용할 수 있게 정리했습니다.' : ' 장 목차가 없어 제목·설명란 범위에서만 정리합니다.');
  }
  function videoProp(v) {
    var key = 'video:' + v.id;
    var lead = ST.edits[key] != null ? ST.edits[key] : (v.summary || videoLead(v));
    var reco = recoFor(v);
    return {
      key: key, type: 'video', typeName: '영상 정리', short: '영상 정리', icon: 'video', loop: '영상 정리', title: v.title, when: v.published,
      src: '유튜브 새 영상 · ' + dot(v.date) + ' 업로드 · 조회 ' + num(v.views) + '회',
      srcDetail: v.hasDraft ? (v.draftKind || '정리 초안') + ' · ' + (v.editor || '애덤스미스 편집팀') + ' · 제목·설명란·장 목차 범위(자막은 받지 않음)' : '제목·설명란·장 목차 범위의 자동 초안(자막은 받지 않음)',
      editText: lead, editLabel: '정리 첫 문단',
      text: [v.title, lead, v.hasDraft ? '' : v.descLead].concat(v.questions || [], v.chapters.map(function (c) { return c.title; })).join('\n'),
      where: '영상 정리 목록·상세 쪽 + 구조화 데이터(VideoObject)·llms.txt',
      siteHref: site('/videos/' + v.id + '/'),
      draft: function () {
        var ch = v.chapters;
        return '<img class="ad-prop__thumb" src="../assets/img/' + esc(v.img) + '" alt="" width="480" height="270" loading="lazy">' +
          '<div class="ad-draft"><p class="ad-draft__k">' + icon('spark', 'ad-ico--xs') + '정리 초안 · 애덤스미스 편집팀</p>' +
          '<p class="ad-draft__lead">' + marked(lead) + '</p>' +
          ((v.questions || []).length ? '<p class="ad-small" style="margin-top:8px"><span class="ad-muted">이 영상이 답하는 질문 ·</span> ' + v.questions.map(function (q) { return marked(q); }).join(' / ') + '</p>' : '') +
          (v.descLead && !v.hasDraft ? '<p class="ad-small" style="margin-top:6px"><span class="ad-muted">설명란 요지 ·</span> ' + marked(v.descLead) + '</p>' : '') +
          (ch.length ? '<ol>' + ch.slice(0, 6).map(function (c) { return '<li><span>' + esc(c.t) + '</span>' + marked(c.title) + '</li>'; }).join('') + '</ol>' + (ch.length > 6 ? '<p class="ad-draft__more">장 목차 외 ' + (ch.length - 6) + '개</p>' : '') : '') +
          (reco.length ? '<p class="ad-draft__reco"><span class="ad-muted">이어서 볼 것(자동 추천) ·</span> ' + reco.map(function (r) { return '<a href="' + esc(r.href) + '" target="_blank" rel="noopener">' + esc(r.t) + ' ' + esc(r.name) + '</a>'; }).join(' · ') + '</p>' : '') +
          '</div>';
      }
    };
  }
  function answerProp(a) {
    var key = 'answer:' + a.slug;
    var short = ST.edits[key] != null ? ST.edits[key] : a.short;
    return {
      key: key, type: 'answer', typeName: '질문 답변', short: '질문 답변', icon: 'qa', loop: '질문 답변', title: a.q, when: a.updated,
      src: (a.from ? '‘' + a.from + '’ 자동화' : '검색어·문의에서 반복된 질문') + (a.fromNote ? ' — ' + a.fromNote : ''),
      srcDetail: ((a.refs || []).length ? '근거: ' + a.refs.join(' · ') : '근거 출처 표기 필요') + (a.by ? ' · 정리 ' + a.by : ''),
      editText: short, editLabel: '답변 첫 문단',
      text: [a.q, short, a.body].join('\n'),
      where: '질문 답변 목록·상세 쪽 + FAQ 구조화 데이터·llms.txt',
      siteHref: site('/answers/' + a.slug + '/'),
      draft: function () {
        return '<div class="ad-draft"><p class="ad-draft__k">' + icon('spark', 'ad-ico--xs') + '답변 초안 · ' + esc(a.by || '애덤스미스 편집팀') + '</p>' +
          '<p class="ad-draft__lead">' + marked(short) + '</p>' +
          (a.body ? '<p class="ad-small" style="margin-top:8px">' + marked(a.body.slice(0, 260)) + (a.body.length > 260 ? '…' : '') + '</p>' : '') + '</div>';
      }
    };
  }
  function faqProp(f) {
    var key = 'faq:' + f.id;
    var a = ST.edits[key] != null ? ST.edits[key] : f.a;
    return {
      key: key, type: 'faq', typeName: '문의 → 자주 묻는 질문', short: '문의에서 나온 질문', icon: 'chat', loop: '문의 → 질문', title: f.q, when: SEED.asOf,
      src: f.from, srcDetail: '고객 문의 원문은 이름·연락처를 지운 뒤 묶었습니다',
      human: f.human || null, fixed: f.fixed && ST.edits[key] == null ? f.fixed : null,
      editText: a, editLabel: '답변',
      text: [f.q, a].join('\n'),
      where: '고객센터 자주 묻는 질문 + FAQPage 구조화 데이터',
      siteHref: site(f.page || '/help/'), siteLabel: '고칠 쪽 열기',
      draft: function () {
        if (f.human) return '<div class="ad-draft"><p class="ad-draft__k">' + icon('lock', 'ad-ico--xs') + '초안 없음</p><p>질문: ' + esc(f.q) + '</p><p class="ad-small ad-muted" style="margin-top:6px">답에 ' + esc(f.human) + ' 문장이 들어가는 질문이라 AI가 초안을 쓰지 않았습니다. 담당자를 지정해 넘기세요.</p></div>';
        return '<div class="ad-draft"><p class="ad-draft__k">' + icon('spark', 'ad-ico--xs') + '질문·답 초안</p><p class="ad-strong" style="color:var(--ink)">Q. ' + marked(f.q) + '</p><p style="margin-top:4px">' + marked(a) + '</p>' +
          (f.fixed && ST.edits[key] == null ? '<div class="ad-draft__reco"><span class="ad-muted">AI 수정안 ·</span> ' + marked(f.fixed) + '</div>' : '') + '</div>';
      }
    };
  }
  function expTexts(e) {
    var c = D.courses.find(function (x) { return x.slug === 'beginner-stock'; });
    if (e.id !== 'exp-beginner-lead') return { A: e.textA, B: e.textB, from: '예시 문구' };
    var x = c && c.exp;
    if (x && x[e.id]) x = x[e.id];
    if (Array.isArray(x)) x = x.find(function (y) { return y.id === e.id; }) || x[0];
    if (x) {
      var A = x.A || x.a || x.textA || (x.variants && x.variants[0] && (x.variants[0].text || x.variants[0].html));
      var B = x.B || x.b || x.textB || (x.variants && x.variants[1] && (x.variants[1].text || x.variants[1].html));
      if (A && B) return { A: String(A).replace(/<[^>]+>/g, ''), B: String(B).replace(/<[^>]+>/g, ''), from: 'courses.json(강의 상세 첫 문단)' };
    }
    return { A: e.placeholder.A, B: e.placeholder.B, from: '자리표시 — 강의 쪽 문구(courses.json exp)가 들어오면 바뀝니다', placeholder: true };
  }
  function expCalc(e) {
    var ra = e.A.entries / e.A.views, rb = e.B.entries / e.B.views;
    var enough = e.A.views >= 1000 && e.B.views >= 1000 && e.A.entries >= 100 && e.B.entries >= 100;
    return { ra: ra, rb: rb, lift: Math.round((rb / ra - 1) * 100), enough: enough, done: e.status === 'done' };
  }
  function expProp(e) {
    var t = expTexts(e), c = expCalc(e), key = 'exp:' + e.id;
    return {
      key: key, type: 'exp', typeName: '문구 실험 결과', short: '실험 결과', icon: 'flask', loop: '문구 실험',
      title: e.name + ' — B안이 ' + e.metric + ' ' + (c.lift >= 0 ? '+' : '') + c.lift + '%', when: e.end + 'T23:00:00+09:00',
      src: '7일 50:50 실험 ' + md(e.start) + '~' + md(e.end) + ' · 노출 ' + num(e.A.views + e.B.views) + '회',
      srcDetail: (c.enough ? '표본 충분' : '표본 부족') + ' · 문구 출처: ' + t.from, example: true,
      text: t.B, noEdit: true, where: '강의 상세 첫 문단(같은 브라우저에서 바로 바뀜)',
      siteHref: site(e.page), siteLabel: '강의 쪽 열기',
      isDone: function () { return ST.exp[e.id] === 'B'; },
      expId: e.id,
      draft: function () {
        return '<div class="ad-ab">' +
          '<div class="ad-ab__arm"><p class="ad-ab__k"><span class="ad-ab__sw" style="background:var(--series-a)"></span>A안 · 진입률 ' + (c.ra * 100).toFixed(1) + '%</p><p class="ad-ab__text ad-small">' + esc(t.A) + '</p></div>' +
          '<div class="ad-ab__arm is-win"><p class="ad-ab__k"><span class="ad-ab__sw" style="background:var(--series-b)"></span>B안 · 진입률 ' + (c.rb * 100).toFixed(1) + '% <span class="ad-badge ad-badge--blue">우세</span></p><p class="ad-ab__text ad-small">' + marked(t.B) + '</p></div></div>' +
          (t.placeholder ? '<p class="ad-small ad-muted" style="margin-top:8px">' + icon('info', 'ad-ico--xs') + ' ' + esc(t.from) + '</p>' : '');
      }
    };
  }
  function searchProp(s) {
    var key = 'search:' + s.q;
    var a = ST.edits[key] != null ? ST.edits[key] : (s.a || '');
    return {
      key: key, type: 'search', typeName: '검색어 학습 → 새 답변', short: '검색어 답변', icon: 'search', loop: '검색어 학습', title: '‘' + s.q + '’ 검색에 답할 쪽', when: s.at || SEED.asOf,
      src: s.local ? '이 브라우저의 사이트 검색 · 결과 0건 · ' + hm(s.at) : '사이트 검색 결과 0건 · 7일 ' + num(s.n) + '회',
      srcDetail: s.local ? '검색어 학습 화면에서 [답변 초안 만들기]로 올림' : '편집팀 이름으로 쓴 초안 · 사실은 강의·책 데이터에서만',
      example: !s.local, needsWrite: !a, editText: a, editLabel: '답변 첫 문단',
      text: [s.q, a].join('\n'), where: '질문 답변 쪽 + 사이트 검색 색인',
      siteHref: site(s.page || '/answers/'), siteLabel: '관련 쪽 열기',
      draft: function () {
        if (!a) return '<div class="ad-draft"><p class="ad-draft__k">' + icon('edit', 'ad-ico--xs') + '초안 자리</p><p>‘' + esc(s.q) + '’에 맞는 쪽이 아직 없습니다. 답변 첫 문단을 쓰면 금칙어 점검을 거쳐 게시할 수 있습니다.</p><p class="ad-small ad-muted" style="margin-top:6px">사실은 강의·책·고객센터 데이터에서만, 전인구 대표의 의견은 출처(영상·책)가 있을 때만 씁니다.</p></div>';
        return '<div class="ad-draft"><p class="ad-draft__k">' + icon('spark', 'ad-ico--xs') + '답변 초안 · ' + esc(s.by || '애덤스미스 편집팀') + '</p><p class="ad-draft__lead">' + marked(a) + '</p></div>';
      }
    };
  }
  function synSuggestions() { return SEED.searchLearn.filter(function (x) { return x.kind === 'synonym'; }); }
  function hasSyn(q) { return ST.synonyms.some(function (s) { return s.from === q; }); }
  function synProp() {
    var list = synSuggestions();
    return {
      key: 'syn:batch', type: 'syn', typeName: '검색어 학습 → 동의어', short: '동의어', icon: 'search', loop: '검색어 학습', title: '검색 동의어 ' + list.length + '개 제안', when: SEED.asOf,
      src: '사이트 검색 결과 0건인 말 · 최근 7일', srcDetail: '등급 ‘자동’ — 넣는 즉시 반영되고 기록이 남아 언제든 뺄 수 있습니다', example: true,
      text: list.map(function (x) { return x.q + ' ' + x.to; }).join('\n'), noEdit: true, noPublish: true, where: '사이트 검색(동의어 사전)',
      isDone: function () { return list.every(function (x) { return hasSyn(x.q); }); },
      draft: function () {
        return '<div class="ad-draft"><p class="ad-draft__k">' + icon('spark', 'ad-ico--xs') + '동의어 후보</p><ul>' + list.map(function (x) {
          var on = hasSyn(x.q);
          return '<li style="display:flex;gap:10px;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--line)"><span>‘<b>' + esc(x.q) + '</b>’ → ' + esc(x.to) + ' <span class="ad-muted">· ' + num(x.n) + '회</span></span>' +
            (on ? '<span class="ad-badge ad-badge--ok">' + icon('check', 'ad-ico--xs') + '추가됨</span>' : '<button class="ad-btn ad-btn--line ad-btn--sm" type="button" data-act="syn-add" data-q="' + esc(x.q) + '" data-to="' + esc(x.to) + '">동의어로 추가</button>') + '</li>';
        }).join('') + '</ul></div>';
      }
    };
  }
  function proposals() {
    var list = [];
    D.videos.filter(function (v) { return v.status === 'pending'; }).forEach(function (v) { list.push(videoProp(v)); });
    D.answers.filter(function (a) { return a.status === 'pending'; }).forEach(function (a) { list.push(answerProp(a)); });
    SEED.faqDrafts.forEach(function (f) { list.push(faqProp(f)); });
    SEED.experiments.filter(function (e) { return e.status === 'done'; }).forEach(function (e) { list.push(expProp(e)); });
    SEED.searchDrafts.forEach(function (s) { list.push(searchProp(s)); });
    ST.searchDrafts.forEach(function (s) { list.push(searchProp({ q: s.q, at: s.at, local: true })); });
    list.push(synProp());
    // 뒤에 실리는 화면(funnel.js 등)이 AdminKit.extraProps 로 더하는 제안
    (window.AdminKit && window.AdminKit.extraProps || []).forEach(function (f) { try { (f() || []).forEach(function (p) { list.push(p); }); } catch (e) { console.warn(e); } });
    return list;
  }
  function propState(p) {
    if (p.isDone ? p.isDone() : ST.published[p.key]) return 'done';
    if (ST.held[p.key] || ST.assigned[p.key]) return 'held';
    return 'pending';
  }
  function pendingCount() { return D && SEED ? proposals().filter(function (p) { return propState(p) === 'pending'; }).length : 0; }

  // ── 메뉴 ──
  var MENU = [
    { g: 'evo', name: 'AI 자가진화 센터', items: [
      { id: 'inbox', name: '오늘의 제안', sub: '승인함', icon: 'inbox', count: true },
      { id: 'exp', name: '문구 실험', icon: 'flask' },
      { id: 'aicheck', name: 'AI 답변 점검', icon: 'bot' },
      { id: 'search', name: '검색어 학습', icon: 'search' },
      { id: 'log', name: '변경 기록', icon: 'history' },
      { id: 'auto', name: '자동화 설정', icon: 'gear' }] },
    { g: 'glance', name: '한눈에', items: [{ id: 'dash', name: '대시보드', icon: 'grid' }] },
    { g: 'sales', name: '판매', items: [{ id: 'orders', name: '주문·환불', icon: 'receipt' }, { id: 'subs', name: '구독', icon: 'repeat' }, { id: 'coupons', name: '쿠폰', icon: 'ticket' }] },
    { g: 'goods', name: '상품', items: [{ id: 'courses', name: '강의', icon: 'play' }, { id: 'books', name: '책·굿즈', icon: 'book' }, { id: 'events', name: '오프라인 특강', icon: 'cal' }] },
    { g: 'content', name: '콘텐츠', items: [{ id: 'videos', name: '영상 정리', icon: 'video' }, { id: 'answers', name: '질문 답변', icon: 'qa' }, { id: 'faq', name: '자주 묻는 질문', icon: 'list' }] },
    { g: 'cust', name: '고객', items: [{ id: 'members', name: '회원·수강생', icon: 'users' }, { id: 'inquiries', name: '문의', sub: 'AI 답변 초안', icon: 'chat' }, { id: 'reviews', name: '후기', icon: 'star' }] },
    { g: 'site', name: '사이트', items: [{ id: 'home', name: '홈 순서', icon: 'layout' }, { id: 'info', name: '기본 정보', icon: 'info' }] },
  ];
  function findMenu(id) { for (var i = 0; i < MENU.length; i++) for (var j = 0; j < MENU[i].items.length; j++) if (MENU[i].items[j].id === id) return { g: MENU[i], it: MENU[i].items[j] }; return null; }
  function buildNav() {
    var nav = $('#ad-nav');
    nav.innerHTML = MENU.map(function (g) {
      var items = '<ul class="ad-nav__list">' + g.items.map(function (it) {
        return '<li><a class="ad-nav__a" href="#' + it.id + '" data-route="' + it.id + '">' + icon(it.icon) + '<span>' + esc(it.name) + '</span>' + (it.count ? '<span class="ad-nav__n" data-count="' + it.id + '"></span>' : '') + '</a></li>';
      }).join('') + '</ul>';
      if (g.g === 'evo') return '<div class="ad-nav__evo"><p class="ad-nav__evo-t">' + icon('spark') + esc(g.name) + '</p><p class="ad-nav__evo-s">사이트가 보고·쓰고·점검한 초안을 승인합니다</p>' + items + '</div>';
      return '<p class="ad-nav__group">' + esc(g.name) + '</p>' + items;
    }).join('');
  }
  function paintCounts() {
    var n = pendingCount();
    $$('[data-count="inbox"]').forEach(function (b) { b.textContent = n ? n : ''; b.setAttribute('aria-label', '승인 대기 ' + n + '건'); });
  }

  // ── 화면 그리기 ──
  var VIEWS = {};
  function route() {
    if (!D || !SEED) return;
    var id = (location.hash.replace(/^#\/?/, '') || 'inbox').split(/[/?]/)[0];
    if (!VIEWS[id]) id = 'inbox';
    var m = findMenu(id);
    var changed = UI.lastRoute !== id;
    UI.lastRoute = id;
    if (changed) UI.editing = null;
    render(id);
    $$('.ad-nav__a').forEach(function (a) { if (a.getAttribute('data-route') === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#ad-where').innerHTML = '<span class="ad-top__g">' + esc(m.g.name) + ' › </span><b>' + esc(m.it.name) + '</b>';
    document.title = m.it.name + ' | 관리자 | 애덤스미스';
    setNav(false);
    if (changed) { window.scrollTo(0, 0); $('#ad-main').focus({ preventScroll: true }); }
  }
  function render(id) {
    id = id || UI.lastRoute || 'inbox';
    AFTER = []; CHARTS = [];
    $('#ad-main').innerHTML = VIEWS[id]();
    AFTER.forEach(function (f) { try { f(); } catch (e) { console.warn(e); } });
    paintCounts();
  }
  function rerender() { var y = window.scrollY; render(); window.scrollTo(0, y); }
  function head(kicker, title, lead, actions, kIcon) {
    return '<header class="ad-head"><div><p class="ad-head__kicker">' + icon(kIcon || 'spark') + esc(kicker) + '</p><h1>' + title + '</h1>' + (lead ? '<p class="ad-head__lead">' + lead + '</p>' : '') + '</div>' + (actions ? '<div class="ad-btns">' + actions + '</div>' : '') + '</header>';
  }

  // ── 오늘의 제안(승인함) ──
  VIEWS.inbox = function () {
    var all = proposals();
    var st = all.map(function (p) { return { p: p, s: propState(p) }; });
    var cnt = { pending: 0, held: 0, done: 0 };
    st.forEach(function (x) { cnt[x.s]++; });
    var tab = UI.inboxTab;
    var shown = st.filter(function (x) { return tab === 'all' || x.s === tab; });
    var autoToday = D.changelog.filter(function (c) { return c.kind === 'auto' && String(c.at).slice(0, 10) === D.buildDate; });
    var byType = {};
    st.filter(function (x) { return x.s === 'pending'; }).forEach(function (x) { var t = x.p.short || x.p.typeName; byType[t] = (byType[t] || 0) + 1; });
    var h = head('AI 자가진화 센터', '오늘의 제안', '사이트가 밤사이 새 영상·검색어·문의·이탈·AI 답변을 보고 만든 초안입니다. 금칙어 점검을 거친 것만 [게시]할 수 있고, 누른 결과는 같은 브라우저의 사이트에 바로 보입니다.', '<a class="ad-btn ad-btn--line ad-btn--sm" href="#log">' + icon('history', 'ad-ico--sm') + '변경 기록</a><a class="ad-btn ad-btn--line ad-btn--sm" href="#auto">' + icon('gear', 'ad-ico--sm') + '자동화 설정</a>');
    h += '<section class="ad-brief" aria-label="오늘 요약">' +
      '<div class="ad-brief__main"><h2>' + esc(dot(D.buildDate)) + ' 아침 · 승인할 제안 ' + cnt.pending + '건</h2>' +
      '<div class="ad-brief__stats"><div class="ad-brief__stat"><b>' + cnt.pending + '</b><span>승인 대기</span></div><div class="ad-brief__stat"><b>' + cnt.held + '</b><span>보류·담당자 지정</span></div><div class="ad-brief__stat"><b>' + cnt.done + '</b><span>처리됨</span></div><div class="ad-brief__stat"><b>' + autoToday.length + '</b><span>자동 처리(기록만)</span></div></div>' +
      '<p>' + Object.keys(byType).map(function (k) { return esc(k) + ' ' + byType[k]; }).join(' · ') + '</p>' +
      '<div class="ad-loop" aria-label="자가진화 고리">' + ['보기', '초안', '점검', '승인', '반영', '재기', '기록'].map(function (s) { return '<span' + (s === '승인' ? ' class="on"' : '') + '>' + s + '</span>'; }).join('<i aria-hidden="true">→</i>') + '</div></div>' +
      '<div class="ad-brief__auto"><h2>' + icon('gear', 'ad-ico--sm') + '밤사이 자동으로 한 일</h2><ul class="ad-autolist">' +
      autoToday.map(function (c) { return '<li><time>' + hm(c.at).slice(6) + '</time><span><b>' + esc(c.loop) + '</b> · ' + esc(c.what) + '</span></li>'; }).join('') +
      '</ul><p class="ad-small ad-muted" style="margin-top:10px">자동 등급은 기록만 남깁니다. 되돌리려면 <a href="#log">변경 기록</a>에서.</p></div></section>';
    h += '<div class="ad-tabs" role="group" aria-label="상태로 걸러 보기">' + [['pending', '승인 대기'], ['held', '보류'], ['done', '처리됨'], ['all', '전체']].map(function (t) {
      return '<button class="ad-tab" type="button" data-act="inbox-tab" data-tab="' + t[0] + '" aria-pressed="' + (tab === t[0]) + '">' + t[1] + ' <b>' + (t[0] === 'all' ? all.length : cnt[t[0]]) + '</b></button>';
    }).join('') + '</div>';
    if (!shown.length) {
      h += '<div class="ad-empty">' + (tab === 'pending' ? '오늘 올라온 제안을 모두 처리했습니다. 처리한 내용은 <a href="#log">변경 기록</a>에 남았습니다.' : '이 상태의 제안이 없습니다.') + '</div>';
    } else {
      h += '<div class="ad-inbox">' + shown.map(function (x) { return propCard(x.p, x.s); }).join('') + '</div>';
    }
    return h;
  };
  function propCard(p, state) {
    var r = scan(p.text);
    var bad = !p.human && r.hits.length > 0;
    var editing = UI.editing === p.key;
    var cls = 'ad-prop' + (bad && state !== 'done' ? ' is-bad' : '') + (state === 'done' ? ' is-done' : '') + (state === 'held' ? ' is-held' : '');
    var h = '<article class="' + cls + '" id="p-' + esc(p.key.replace(/[^\w-]/g, '_')) + '" data-key="' + esc(p.key) + '">';
    h += '<div class="ad-prop__head"><span class="ad-prop__type">' + icon(p.icon) + esc(p.typeName) + '</span>' +
      (state === 'pending' ? '<span class="ad-badge ad-badge--blue">승인 대기</span>' : state === 'held' ? '<span class="ad-badge ad-badge--hold">' + (ST.assigned[p.key] ? '담당자: ' + esc(ST.assigned[p.key].to) : '보류') + '</span>' : '<span class="ad-badge ad-badge--ok">' + icon('check', 'ad-ico--xs') + '처리됨</span>') +
      (p.example ? EX : '') + (p.human ? '<span class="ad-badge ad-badge--ink">' + icon('lock', 'ad-ico--xs') + '사람만</span>' : '') +
      '<span class="ad-prop__when">' + (p.when ? '올라온 때 ' + hm(p.when) : '') + '</span></div>';
    h += '<h2 class="ad-prop__title">' + esc(p.title) + '</h2>';
    h += '<div class="ad-prop__body"><div>' + p.draft() + '</div><div class="ad-meta">' +
      '<div class="ad-meta__row"><span class="ad-meta__k">무엇을 보고 만들었나</span><span class="ad-meta__v">' + esc(p.src) + '<br><span class="ad-muted ad-small">' + esc(p.srcDetail) + '</span></span></div>' +
      '<div class="ad-meta__row"><span class="ad-meta__k">점검</span>' + checkBox(p.text, { human: p.human }) + '</div>' +
      '<div class="ad-meta__row"><span class="ad-meta__k">게시하면 바뀌는 곳</span><span class="ad-meta__v">' + esc(p.where) + '</span></div>' +
      '</div></div>';
    if (editing) {
      h += '<div class="ad-edit"><label class="ad-field"><span class="ad-field__label">' + esc(p.editLabel || '초안') + ' 고치기</span><textarea class="ad-textarea" id="ad-edit-text" data-key="' + esc(p.key) + '">' + esc(p.editText || '') + '</textarea></label>' +
        '<div class="ad-edit__live" id="ad-edit-live">' + checkBox(p.editText || '') + '</div>' +
        '<div class="ad-btns"><button class="ad-btn ad-btn--primary" type="button" data-act="edit-publish" data-key="' + esc(p.key) + '">고친 글로 게시</button><button class="ad-btn ad-btn--line" type="button" data-act="edit-save" data-key="' + esc(p.key) + '">저장만</button><button class="ad-btn ad-btn--ghost" type="button" data-act="edit-cancel">취소</button></div></div>';
    }
    h += '<div class="ad-prop__foot">' + propActions(p, state, bad) + '</div></article>';
    return h;
  }
  function propActions(p, state, bad) {
    if (p.actions) return p.actions(state, bad); // 제안이 자기 단추를 갖고 오면 그것(퍼널 진단 → [실험 시작] 등)
    var k = esc(p.key);
    var link = p.siteHref ? '<a class="ad-btn ad-btn--ghost ad-btn--sm ad-push" href="' + esc(p.siteHref) + '" target="_blank" rel="noopener" data-site-link>' + esc(p.siteLabel || (state === 'done' ? '사이트에서 보기' : '사이트 미리보기')) + icon('ext', 'ad-ico--sm') + '<span class="ad-sr">(새 창)</span></a>' : '';
    if (state === 'done') {
      var undo = p.type === 'syn' ? '<a class="ad-btn ad-btn--line ad-btn--sm" href="#search">동의어 관리</a>' : '<button class="ad-btn ad-btn--line ad-btn--sm" type="button" data-act="undo" data-key="' + k + '">' + icon('undo', 'ad-ico--sm') + '되돌리기</button>';
      return '<span class="ad-prop__state ad-prop__state--ok">' + icon('check', 'ad-ico--sm') + (p.type === 'exp' ? 'B안 확정 — 사이트에 반영됨' : p.type === 'syn' ? '모두 추가됨' : '게시됨 — 같은 브라우저의 사이트에 보입니다') + '</span>' + undo + link;
    }
    if (p.human) {
      return '<button class="ad-btn ad-btn--ink" type="button" data-act="assign" data-key="' + k + '">' + icon('users', 'ad-ico--sm') + '담당자에게 넘기기</button>' +
        (state === 'held' ? '<button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-act="unhold" data-key="' + k + '">다시 대기로</button>' : '<button class="ad-btn ad-btn--line" type="button" data-act="hold" data-key="' + k + '">보류</button>') + link;
    }
    if (p.type === 'syn') return '<span class="ad-small ad-muted">하나씩 넣거나 한 번에 넣습니다.</span><button class="ad-btn ad-btn--primary" type="button" data-act="syn-all">모두 추가</button>' + link;
    var main;
    if (p.type === 'exp') {
      main = bad ? '<button class="ad-btn ad-btn--primary" type="button" disabled>B안으로 확정</button>' : '<button class="ad-btn ad-btn--primary" type="button" data-act="exp-b" data-exp="' + esc(p.expId) + '">B안으로 확정</button>';
      main += '<a class="ad-btn ad-btn--line" href="#exp">실험 자세히</a>';
    } else if (p.needsWrite) {
      main = '<button class="ad-btn ad-btn--primary" type="button" data-act="edit" data-key="' + k + '">' + icon('edit', 'ad-ico--sm') + '초안 쓰기</button><button class="ad-btn ad-btn--line" type="button" disabled title="초안을 먼저 써 주세요">게시</button>';
    } else if (bad) {
      main = '<button class="ad-btn ad-btn--line" type="button" disabled aria-describedby="why-' + k + '">게시</button>' +
        (p.fixed ? '<button class="ad-btn ad-btn--primary" type="button" data-act="apply-fix" data-key="' + k + '">AI 수정안 적용</button><button class="ad-btn ad-btn--line" type="button" data-act="edit" data-key="' + k + '">' + icon('edit', 'ad-ico--sm') + '수정 후 게시</button>'
          : '<button class="ad-btn ad-btn--primary" type="button" data-act="edit" data-key="' + k + '">' + icon('edit', 'ad-ico--sm') + '수정 후 게시</button>') +
        '<span class="ad-sr" id="why-' + k + '">금칙어를 고친 뒤 게시할 수 있습니다</span>';
    } else {
      main = '<button class="ad-btn ad-btn--primary" type="button" data-act="publish" data-key="' + k + '">' + icon('check', 'ad-ico--sm') + '게시</button>' +
        (p.noEdit ? '' : '<button class="ad-btn ad-btn--line" type="button" data-act="edit" data-key="' + k + '">' + icon('edit', 'ad-ico--sm') + '수정</button>');
    }
    var hold = state === 'held' ? '<button class="ad-btn ad-btn--ghost" type="button" data-act="unhold" data-key="' + k + '">다시 대기로</button>' : '<button class="ad-btn ad-btn--ghost" type="button" data-act="hold" data-key="' + k + '">' + icon('pause', 'ad-ico--sm') + '보류</button>';
    return main + hold + link;
  }
  function propByKey(key) { return proposals().find(function (p) { return p.key === key; }); }
  function publish(key, viaEdit) {
    var p = propByKey(key);
    if (!p) return;
    var r = scan(p.text);
    if (r.hits.length || p.human || p.needsWrite) { toast('금칙어를 고친 뒤 게시할 수 있습니다', true); return; }
    ST.published[key] = true;
    delete ST.held[key]; delete ST.assigned[key];
    addLog('approved', p.loop, '「' + p.title + '」 ' + (viaEdit ? '고친 글로 ' : '') + '게시', key);
    commit();
    UI.editing = null;
    rerender();
    toast(p.type === 'video' ? '게시했습니다 — 사이트 영상 정리 목록에 바로 보입니다(이 브라우저)' : '게시했습니다');
  }

  // ── 문구 실험 ──
  VIEWS.exp = function () {
    var h = head('AI 자가진화 센터', '문구 실험', '승인된 문구 두 개를 50:50으로 보여 주고 7일 뒤 결과를 냅니다. 표본이 충분할 때만 확정할 수 있고, 확정하면 같은 브라우저의 사이트 문단이 바로 바뀝니다. 수치는 예시입니다.', '', 'flask');
    h += '<p class="ad-note">' + icon('info') + '<span>' + esc(SEED.expRule) + ' 신뢰 구간 대신 이 기준으로 ‘표본 충분/부족’만 판정합니다.</span></p>';
    SEED.experiments.forEach(function (e) {
      var t = expTexts(e), c = expCalc(e), live = ST.exp[e.id] === 'B' ? 'B' : 'A';
      var bScan = scan(t.B);
      h += '<section class="ad-sec ad-card" id="exp-' + esc(e.id) + '"><div class="ad-tblcap"><div><p class="ad-card__t">' + esc(e.name) + EX +
        (e.status === 'done' ? '<span class="ad-badge ad-badge--blue">7일 종료</span>' : '<span class="ad-badge ad-badge--hold">진행 중 · ' + e.day + '일째</span>') +
        (live === 'B' ? '<span class="ad-badge ad-badge--ok">' + icon('check', 'ad-ico--xs') + 'B안 확정</span>' : '') + '</p>' +
        '<p class="ad-card__d">' + esc(e.id) + ' · ' + esc(dot(e.start)) + '~' + esc(dot(e.end)) + ' · 쪽 ' + esc(e.page) + ' · 기준: ' + esc(e.metric) + ' · 문구 출처: ' + esc(t.from) + '</p></div>' +
        '<a class="ad-btn ad-btn--ghost ad-btn--sm" href="' + esc(site(e.page)) + '" target="_blank" rel="noopener">사이트에서 확인' + icon('ext', 'ad-ico--sm') + '</a></div>';
      h += '<div class="ad-ab" style="margin-top:12px">' +
        '<div class="ad-ab__arm' + (live === 'A' ? ' is-live' : '') + '"><p class="ad-ab__k"><span class="ad-ab__sw" style="background:var(--series-a)"></span>A안(기본)' + (live === 'A' ? ' <span class="ad-ab__live">· 지금 사이트에 보임</span>' : '') + '</p><p class="ad-ab__text">' + esc(t.A) + '</p></div>' +
        '<div class="ad-ab__arm' + (c.lift > 0 ? ' is-win' : '') + (live === 'B' ? ' is-live' : '') + '"><p class="ad-ab__k"><span class="ad-ab__sw" style="background:var(--series-b)"></span>B안' + (live === 'B' ? ' <span class="ad-ab__live">· 지금 사이트에 보임</span>' : '') + '</p><p class="ad-ab__text">' + marked(t.B) + '</p>' + (bScan.hits.length ? checkBox(t.B) : '<p class="ad-small" style="color:var(--ok)">' + icon('check', 'ad-ico--xs') + ' 금칙어 0건</p>') + '</div></div>';
      h += '<div class="ad-tablewrap" style="margin-top:12px"><table class="ad-table" style="min-width:520px"><thead><tr><th>안</th><th class="n">노출</th><th class="n">' + esc(e.metric) + '</th><th class="n">진입률</th><th class="n">결제</th><th class="n">결제 전환</th></tr></thead><tbody>' +
        ['A', 'B'].map(function (k) { var a = e[k]; return '<tr><td><span class="ad-sw" style="background:var(--series-' + k.toLowerCase() + ')"></span> ' + k + '안</td><td class="n">' + num(a.views) + '</td><td class="n">' + num(a.entries) + '</td><td class="n">' + pct(a.entries, a.views) + '%</td><td class="n">' + num(a.paid) + '</td><td class="n">' + pct(a.paid, a.views, 2) + '%</td></tr>'; }).join('') + '</tbody></table></div>';
      if (e.days) {
        h += '<div class="ad-chart" style="margin-top:14px" data-chart="exp-' + esc(e.id) + '"></div>';
        (function (e) {
          AFTER.push(function () {
            lineChart($('[data-chart="exp-' + e.id + '"]'), {
              labels: e.days.map(function (d) { return d.d; }),
              series: [{ name: 'A안', color: '#b4469b', values: e.days.map(function (d) { return d.a; }) }, { name: 'B안', color: '#1f4fd6', values: e.days.map(function (d) { return d.b; }) }],
              unit: '%', title: '날짜별 결제 화면 진입률(예시)', yMin: 6, yMax: 14, fmt: function (v) { return v.toFixed(1) + '%'; }
            });
          });
        })(e);
      }
      var verdict = c.enough ? (c.lift > 0 ? 'B안 우세' : 'A안 유지') : '진행 중';
      h += '<div class="ad-verdict' + (c.enough ? '' : ' is-wait') + '"><span class="ad-verdict__big">' + (c.enough ? (c.lift >= 0 ? '+' : '') + c.lift + '%' : e.day + '/7일') + '</span><div><p class="ad-strong">' + verdict + ' · ' + (c.enough ? '표본 충분' : '표본 부족') + '</p><p class="ad-small ad-muted">' +
        (c.enough ? esc(e.metric) + ' 진입률 A ' + (c.ra * 100).toFixed(1) + '% → B ' + (c.rb * 100).toFixed(1) + '%. 결제 완료는 건수가 적어(30건 미만) 판단에 쓰지 않습니다.' : '7일이 지나고 기준을 넘으면 결과를 승인함에 올립니다. 그 전에는 확정할 수 없습니다.') + '</p></div>' +
        '<div class="ad-btns" style="margin-left:auto">' +
        (live === 'B' ? '<button class="ad-btn ad-btn--line" type="button" data-act="exp-a" data-exp="' + esc(e.id) + '">' + icon('undo', 'ad-ico--sm') + '되돌리기(A안)</button>'
          : '<button class="ad-btn ad-btn--primary" type="button" data-act="exp-b" data-exp="' + esc(e.id) + '"' + (c.enough && e.status === 'done' && !bScan.hits.length ? '' : ' disabled') + '>B안으로 확정</button>') +
        '</div></div></section>';
    });
    return h;
  };
  function expSet(id, v) {
    var e = SEED.experiments.find(function (x) { return x.id === id; });
    if (!e) return;
    if (v === 'B') {
      var t = expTexts(e);
      if (scan(t.B).hits.length) { toast('B안에 금칙어가 있어 확정할 수 없습니다', true); return; }
      ST.exp[id] = 'B';
      addLog('approved', '문구 실험', e.name + ' B안으로 확정(' + e.metric + ' +' + expCalc(e).lift + '%)', 'exp:' + id);
      toast('B안으로 확정했습니다 — 강의 쪽 첫 문단이 B안으로 보입니다(이 브라우저)');
    } else {
      delete ST.exp[id];
      addLog('human', '문구 실험', e.name + ' A안으로 되돌림', null);
      toast('A안으로 되돌렸습니다');
    }
    commit(); rerender();
  }

  // ── AI 답변 점검 ──
  var MARK = { C: '인용', M: '언급만', N: '안 나옴', W: '틀린 사실' };
  VIEWS.aicheck = function () {
    var A = SEED.aiCheck, Q = A.questions;
    var per = A.engines.map(function (e, i) { var c = Q.filter(function (q) { return q.r[i] === 'C'; }).length; return { e: e, c: c, w: Q.filter(function (q) { return q.r[i] === 'W'; }).length }; });
    var f = UI.aiFilter;
    var rows = Q.map(function (q, i) { return { q: q, i: i }; }).filter(function (x) {
      if (f === 'none') return x.q.r.indexOf('C') < 0;
      if (f === 'wrong') return x.q.r.indexOf('W') >= 0;
      return true;
    });
    var h = head('AI 자가진화 센터', 'AI 답변 점검', '질문 ' + Q.length + '개를 AI ' + A.engines.length + '곳에 물어 이 사이트를 인용하는지, 틀린 사실을 말하는지 매주 월요일에 봅니다. <b>이 화면의 결과는 예시 결과입니다.</b>', '', 'bot');
    h += '<div class="ad-grid ad-grid--side"><div class="ad-card"><p class="ad-card__t">곳별 인용 ' + EX + '</p><p class="ad-card__d">' + esc(dot(A.asOf)) + ' 점검 · ' + Q.length + '문항 중 이 사이트를 인용한 수</p><div class="ad-hbars" style="margin-top:14px">' +
      per.map(function (p) { return '<div class="ad-hbar" title="' + esc(p.e) + ' ' + p.c + '/' + Q.length + '"><span class="ad-hbar__k">' + esc(p.e) + '</span><span class="ad-hbar__track"><span class="ad-hbar__fill" style="width:' + (p.c / Q.length * 100) + '%"></span></span><span class="ad-hbar__v">' + p.c + '/' + Q.length + '<small>틀림 ' + p.w + '</small></span></div>'; }).join('') +
      '</div></div><div class="ad-card"><p class="ad-card__t">인용 점수 추이 ' + EX + '</p><p class="ad-card__d">160칸(40문항×4곳) 중 인용 비율 · 지난 8주</p><div class="ad-chart" data-chart="ai-trend" style="margin-top:8px"></div></div></div>';
    AFTER.push(function () { lineChart($('[data-chart="ai-trend"]'), { labels: SEED.aiTrend.map(function (x) { return x.w; }), series: [{ name: '인용 점수', color: '#1f4fd6', values: SEED.aiTrend.map(function (x) { return x.v; }) }], unit: '%', yMin: 0, yMax: 40, fmt: function (v) { return v + '%'; }, title: 'AI 인용 점수 추이(예시)' }); });
    // 틀린 사실
    h += '<section class="ad-sec"><h2 class="ad-sec__t">' + icon('alert') + '틀린 사실 ' + A.wrong.length + '건 ' + EX + '</h2><p class="ad-sec__d">AI가 틀리게 말한 내용과 고칠 쪽입니다. 쪽의 첫 문단을 고치면 다음 점검에서 다시 확인합니다.</p><div class="ad-grid ad-grid--2">' +
      A.wrong.map(function (w, i) {
        var q = Q[w.qi], human = /환불/.test(w.page);
        return '<div class="ad-card"><p class="ad-card__t"><span class="ad-badge ad-badge--bad">' + esc(A.engines[w.e]) + '</span>' + esc(q.q) + '</p>' +
          '<p class="ad-small" style="margin-top:8px"><b style="color:var(--bad)">AI가 말한 것</b> · ' + esc(w.said) + '</p><p class="ad-small" style="margin-top:4px"><b style="color:var(--ok)">사실</b> · ' + esc(w.truth) + '</p>' +
          '<p class="ad-small ad-muted" style="margin-top:4px">고칠 방향 · ' + esc(w.fix) + '</p><div class="ad-btns" style="margin-top:10px">' +
          '<a class="ad-btn ad-btn--primary ad-btn--sm" href="' + esc(site(w.page)) + '" target="_blank" rel="noopener" data-fix-page>고칠 페이지 열기 ' + esc(w.page) + icon('ext', 'ad-ico--sm') + '</a>' +
          (human ? '<span class="ad-badge ad-badge--ink">' + icon('lock', 'ad-ico--xs') + '환불 규정 — 사람만</span>' : '') + '</div></div>';
      }).join('') + '</div></section>';
    // 표
    h += '<section class="ad-sec"><div class="ad-tblcap"><h2 class="ad-sec__t" style="margin:0">' + icon('list') + '질문 ' + Q.length + '개 × AI ' + A.engines.length + '곳 ' + EX + '</h2>' +
      '<div class="ad-tabs" style="margin:0" role="group" aria-label="걸러 보기">' + [['all', '전체'], ['none', '인용 0곳'], ['wrong', '틀린 사실 있음']].map(function (t) { return '<button class="ad-tab" type="button" data-act="ai-filter" data-f="' + t[0] + '" aria-pressed="' + (f === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div></div>' +
      '<p class="ad-legend" style="margin-bottom:8px">' + ['C', 'M', 'N', 'W'].map(function (k) { return '<span><span class="ad-mark ad-mark--' + k + '" style="min-width:0">' + MARK[k] + '</span></span>'; }).join('') + '<span class="ad-muted">· 인용=이 사이트 주소를 근거로 답함 · 언급만=다른 출처로 답함</span></p>' +
      '<div class="ad-tablewrap"><table class="ad-table ad-cite"><thead><tr><th class="n">#</th><th>질문</th><th>분류</th>' + A.engines.map(function (e) { return '<th class="c">' + esc(e) + '</th>'; }).join('') + '<th>고칠 쪽</th></tr></thead><tbody>' +
      rows.map(function (x) {
        return '<tr><td class="n ad-muted">' + (x.i + 1) + '</td><td class="ad-rowt">' + esc(x.q.q) + '</td><td class="ad-rows">' + esc(x.q.cat) + '</td>' +
          x.q.r.split('').map(function (k) { return '<td class="c"><span class="ad-mark ad-mark--' + k + '">' + (k === 'W' ? icon('alert', 'ad-ico--xs') : '') + MARK[k] + '</span></td>'; }).join('') +
          '<td><a href="' + esc(site(x.q.page)) + '" target="_blank" rel="noopener">' + esc(x.q.page) + '</a></td></tr>';
      }).join('') + '</tbody></table></div></section>';
    return h;
  };

  // ── 검색어 학습 ──
  function localMisses() {
    var list = load(MISS_KEY, []);
    if (!Array.isArray(list)) return [];
    var by = {};
    list.forEach(function (m) {
      var q = String((m && m.q) || '').trim(); if (!q) return;
      var k = q.toLowerCase().replace(/\s+/g, '');
      if (!by[k]) by[k] = { q: q, n: 0, at: m.at, path: m.path, local: true };
      by[k].n++; if (m.at > by[k].at) { by[k].at = m.at; by[k].path = m.path; }
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  }
  function hasDraft(q) { return SEED.searchDrafts.some(function (s) { return s.q === q; }) || ST.searchDrafts.some(function (s) { return s.q === q; }); }
  VIEWS.search = function () {
    var local = localMisses();
    var rows = local.concat(SEED.searchLearn.map(function (x) { return Object.assign({ example: true }, x); }));
    var h = head('AI 자가진화 센터', '검색어 학습', '사이트 검색에서 결과가 0건이던 말입니다. 같은 뜻의 말이 있으면 <b>동의어로 추가</b>(자동 등급 — 바로 반영, 기록 남음), 답할 쪽이 없으면 <b>답변 초안 만들기</b>(승인함으로)를 누릅니다.', '', 'search');
    h += '<p class="ad-note ad-note--plain">' + icon('info') + '<span>이 브라우저에서 사이트 검색으로 못 찾은 말 <b>' + local.length + '개</b>' + (local.length ? '가 맨 위에 있습니다.' : '는 아직 없습니다. 사이트에서 돋보기(또는 / 키)로 없는 말을 찾아 보면 여기에 쌓입니다.') + ' 아래 ‘예시’ 줄은 운영 때 서버가 모을 검색 기록의 예입니다.</span></p>';
    h += '<div class="ad-tablewrap" style="margin-top:12px"><table class="ad-table"><thead><tr><th>검색어</th><th class="n">횟수</th><th>어디서</th><th>제안</th><th>할 일</th></tr></thead><tbody>' +
      rows.map(function (x) {
        var syn = hasSyn(x.q), dr = hasDraft(x.q);
        var sugg = x.kind === 'synonym' ? '동의어 → ‘' + esc(x.to) + '’' : x.kind === 'human' ? '<span class="ad-badge ad-badge--ink">' + icon('lock', 'ad-ico--xs') + '사람만</span> ' + esc(x.note) : x.kind === 'answer' ? '새 답변 · ' + esc(x.note || '') : '<span class="ad-muted">판단 전</span>';
        var acts = '';
        if (syn) acts += '<span class="ad-badge ad-badge--ok">' + icon('check', 'ad-ico--xs') + '동의어 추가됨</span> ';
        else if (x.kind !== 'answer') acts += '<button class="ad-btn ad-btn--line ad-btn--sm" type="button" data-act="syn-ask" data-q="' + esc(x.q) + '" data-to="' + esc(x.to || '') + '">동의어로 추가</button> ';
        if (x.kind !== 'human' && x.kind !== 'synonym') acts += dr ? '<a class="ad-badge ad-badge--blue" href="#inbox">승인함에 있음</a>' : '<button class="ad-btn ad-btn--primary ad-btn--sm" type="button" data-act="draft-search" data-q="' + esc(x.q) + '">답변 초안 만들기</button>';
        return '<tr' + (x.local ? ' class="is-mine"' : '') + '><td class="ad-rowt">' + esc(x.q) + '</td><td class="n">' + num(x.n) + '</td><td class="ad-rows">' + (x.local ? '이 브라우저 · ' + esc(hm(x.at)) + (x.path ? ' · ' + esc(x.path) : '') : '최근 7일 ' + EX) + '</td><td class="ad-small">' + sugg + '</td><td><div class="ad-btns">' + acts + '</div></td></tr>';
      }).join('') + '</tbody></table></div>';
    h += '<section class="ad-sec"><h2 class="ad-sec__t">' + icon('list') + '동의어 사전</h2><p class="ad-sec__d">사이트 검색이 왼쪽 말을 오른쪽 말로도 찾습니다. 운영 단계에서 검색 색인에 같이 씁니다.</p>';
    var base = [{ from: '미주', to: '미국 주식', at: '2026-10-12T07:30:00+09:00', example: true }];
    var syns = ST.synonyms.concat(base);
    h += '<div class="ad-tablewrap"><table class="ad-table" style="min-width:480px"><thead><tr><th>찾은 말</th><th>같이 찾을 말</th><th>넣은 때</th><th></th></tr></thead><tbody>' +
      syns.map(function (s) { return '<tr><td class="ad-rowt">' + esc(s.from) + '</td><td>' + esc(s.to) + '</td><td class="ad-rows">' + esc(hm(s.at)) + (s.example ? ' ' + EX : '') + '</td><td>' + (s.example ? '' : '<button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-act="syn-del" data-q="' + esc(s.from) + '">빼기</button>') + '</td></tr>'; }).join('') +
      '</tbody></table></div></section>';
    return h;
  };
  function addSyn(q, to) {
    q = String(q || '').trim(); to = String(to || '').trim();
    if (!q || !to || hasSyn(q)) return;
    ST.synonyms.unshift({ from: q, to: to, at: nowIso() });
    addLog('auto', '검색어 학습', '‘' + q + '’ → ‘' + to + '’ 동의어 추가', 'syn:' + q);
    commit();
  }

  // ── 변경 기록 ──
  var KIND = { auto: ['자동', 'ad-badge--line'], approved: ['승인', 'ad-badge--blue'], human: ['사람', 'ad-badge--ink'], held: ['보류', 'ad-badge--hold'], undo: ['되돌림', 'ad-badge--hold'] };
  function logActive(l) {
    if (!l.key) return false;
    if (/^syn:/.test(l.key)) return hasSyn(l.key.slice(4));
    if (/^exp:/.test(l.key)) return ST.exp[l.key.slice(4)] === 'B';
    return !!ST.published[l.key];
  }
  VIEWS.log = function () {
    var mine = ST.log.map(function (l, i) { return Object.assign({ mine: true, idx: i }, l); });
    var all = mine.concat(D.changelog.map(function (c) { return Object.assign({}, c); })).sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    var f = UI.logFilter;
    var shown = all.filter(function (l) { return f === 'all' || l.kind === f || (f === 'mine' && l.mine); });
    var h = head('AI 자가진화 센터', '변경 기록', '사이트가 스스로 바꾼 것(자동), 운영자가 승인한 것, 사람이 직접 바꾼 것을 한 줄씩 남깁니다. 공개 <a href="' + site('/changes/') + '" target="_blank" rel="noopener">사이트 변경 기록</a>은 빌드 때 같은 원본(evolution.json)으로 만든 정적 쪽이라, 이 화면에서 누른 기록은 여기(이 브라우저)에만 더해집니다.', '', 'history');
    h += '<div class="ad-tabs" role="group" aria-label="종류로 걸러 보기">' + [['all', '전체'], ['mine', '이 브라우저'], ['auto', '자동'], ['approved', '승인'], ['human', '사람'], ['held', '보류']].map(function (t) {
      var n = t[0] === 'all' ? all.length : all.filter(function (l) { return t[0] === 'mine' ? l.mine : l.kind === t[0]; }).length;
      return '<button class="ad-tab" type="button" data-act="log-filter" data-f="' + t[0] + '" aria-pressed="' + (f === t[0]) + '">' + t[1] + ' <b>' + n + '</b></button>';
    }).join('') + '</div>';
    if (!shown.length) return h + '<div class="ad-empty">기록이 없습니다.</div>';
    h += '<ol class="ad-log">' + shown.map(function (l) {
      var k = KIND[l.kind] || [l.kind, ''];
      return '<li' + (l.mine ? ' class="is-new"' : '') + '><time datetime="' + esc(l.at) + '">' + esc(hm(l.at)) + '</time><span class="ad-badge ' + k[1] + '">' + esc(k[0]) + '</span>' +
        '<p class="ad-log__what"><span class="ad-log__loop">' + esc(l.loop) + '</span>' + esc(l.what) + (l.example ? ' ' + EX : '') + (l.mine ? ' <span class="ad-badge ad-badge--blue">이 브라우저</span>' : '') + '</p>' +
        '<div class="ad-btns">' + (l.mine && logActive(l) ? '<button class="ad-btn ad-btn--line ad-btn--sm" type="button" data-act="undo" data-key="' + esc(l.key) + '">' + icon('undo', 'ad-ico--sm') + '되돌리기</button>' : '') + '</div></li>';
    }).join('') + '</ol>';
    return h;
  };
  function undo(key) {
    if (/^syn:/.test(key)) { var q = key.slice(4); ST.synonyms = ST.synonyms.filter(function (s) { return s.from !== q; }); addLog('undo', '검색어 학습', '‘' + q + '’ 동의어 뺌', null); }
    else if (/^exp:/.test(key)) { expSet(key.slice(4), 'A'); return; }
    else {
      var p = propByKey(key);
      delete ST.published[key];
      addLog('undo', p ? p.loop : '되돌리기', '「' + (p ? p.title : key) + '」 게시 되돌림 — 다시 승인 대기', null);
    }
    commit(); rerender(); toast('되돌렸습니다');
  }

  // ── 자동화 설정 ──
  var WHEN = {
    video: ['매시간', '30분마다', '2시간마다'], aicheck: ['매주 월 07:00', '매주 월 09:00', '매주 목 07:00'], search: ['매일 07:30', '매일 06:30', '매일 12:00'],
    inquiry: ['매일 08:00', '매일 07:00', '매일 09:00'], exp: ['매일 23:00', '매일 22:00', '매일 01:00'], fresh: ['매일 06:00', '매일 05:00', '매일 07:00'], reco: ['매주 월 05:00', '매주 일 23:00', '매일 05:00'],
  };
  var GRADE = { auto: '자동', approve: '승인', human: '사람만' };
  function autoConf(a) { var c = ST.autos[a.id] || {}; return { on: c.on != null ? c.on : true, when: c.when || a.when, grade: c.grade || a.grade }; }
  VIEWS.auto = function () {
    var h = head('AI 자가진화 센터', '자동화 설정', '일곱 가지 자동화의 켜기·끄기, 실행 시간, 반영 등급을 정합니다. <b>자동</b>은 바로 반영하고 기록만 남기고, <b>승인</b>은 오늘의 제안에 올립니다. 가격·환불 규정·대표 의견·투자 판단 문장은 <b>사람만</b> — 바꿀 수 없습니다.', '', 'gear');
    h += '<div class="ad-autos">' + SEED.automations.map(function (a) {
      var c = autoConf(a);
      return '<div class="ad-auto' + (c.on ? '' : ' is-off') + '"><div><p class="ad-auto__name">' + esc(a.name) + (c.on ? '' : '<span class="ad-badge">꺼짐</span>') + '</p><p class="ad-auto__d">' + esc(a.sees) + ' → ' + esc(a.makes) + '</p><p class="ad-auto__last">마지막 실행 ' + esc(hm(a.last)) + ' · ' + esc(a.lastNote) + ' ' + EX + (a.split ? ' · ' + esc(a.split) : '') + '</p></div>' +
        '<div class="ad-auto__ctl"><label for="when-' + a.id + '">언제</label><select class="ad-select" id="when-' + a.id + '" data-act="auto-when" data-id="' + a.id + '"' + (c.on ? '' : ' disabled') + '>' + (WHEN[a.id] || [a.when]).map(function (w) { return '<option' + (w === c.when ? ' selected' : '') + '>' + esc(w) + '</option>'; }).join('') + '</select></div>' +
        '<div class="ad-auto__ctl ad-auto__ctl--grade"><label id="g-' + a.id + '">반영 등급</label><div class="ad-seg" role="group" aria-labelledby="g-' + a.id + '">' + ['auto', 'approve', 'human'].map(function (g) {
          var allowed = a.grades.indexOf(g) >= 0;
          return '<button type="button" data-act="auto-grade" data-id="' + a.id + '" data-g="' + g + '" aria-pressed="' + (c.grade === g) + '"' + (allowed && c.on ? '' : ' disabled') + (allowed ? '' : ' title="' + (g === 'human' ? '사람만 영역은 아래 잠금 항목뿐입니다' : '이 자동화는 승인을 거쳐야 합니다') + '"') + '>' + GRADE[g] + '</button>';
        }).join('') + '</div></div>' +
        '<button class="ad-switch" type="button" role="switch" aria-checked="' + c.on + '" data-act="auto-on" data-id="' + a.id + '" aria-label="' + esc(a.name) + ' 켜기"><span class="ad-switch__track"></span><span>' + (c.on ? '켜짐' : '꺼짐') + '</span></button></div>';
    }).join('') + '</div>';
    h += '<section class="ad-sec"><h2 class="ad-sec__t">' + icon('lock') + '사람만 — 바꿀 수 없음</h2><p class="ad-sec__d">AI가 초안이나 제안조차 하지 않는 영역입니다. 대표가 실제로 한 말은 출처(영상·책)를 달아서만 씁니다.</p><div class="ad-human">' +
      SEED.humanOnly.map(function (x) {
        return '<div><b>' + icon('lock', 'ad-ico--sm') + esc(x.name) + '</b><p>' + esc(x.why) + '</p><div class="ad-seg" role="group" aria-label="' + esc(x.name) + ' 등급(잠김)">' + ['auto', 'approve', 'human'].map(function (g) { return '<button type="button" disabled aria-pressed="' + (g === 'human') + '">' + GRADE[g] + '</button>'; }).join('') + '</div></div>';
      }).join('') + '</div></section>';
    h += '<p class="ad-note ad-note--plain" style="margin-top:20px">' + icon('info') + '<span>데모에서는 설정만 저장됩니다. 실제 실행은 운영 단계에서 서버 예약 작업 7개로 붙입니다(AI 초안은 머니두 쪽 구독 계정 또는 키).</span></p>';
    return h;
  };
  function autoSet(id, patch, what) {
    var a = SEED.automations.find(function (x) { return x.id === id; });
    var c = autoConf(a);
    ST.autos[id] = Object.assign(c, patch);
    addLog('human', '자동화 설정', a.name + ' — ' + what, null);
    commit(); rerender(); toast(a.name + ' — ' + what);
  }

  // ── 대시보드 ──
  function myOrders() {
    var raw = load(ORDERS_KEY, []);
    if (!Array.isArray(raw)) raw = raw && Array.isArray(raw.list) ? raw.list : [];
    return raw.map(function (o, i) {
      var items = (o.items || o.lines || o.cart || []).map(function (x) { return { title: x.title || x.name || x.slug || '상품', price: Number(x.price || 0), unit: x.priceUnit || x.unit || '' }; });
      var total = o.total != null ? o.total : o.amount != null ? o.amount : items.reduce(function (s, x) { return s + x.price; }, 0);
      return { id: o.id || o.orderId || o.no || ('시연-' + (i + 1)), at: o.at || o.date || o.createdAt || o.paidAt || '', name: o.name ? mask(o.name) : '이 브라우저 사용자', items: items, total: Number(total) || 0, method: o.methodLabel || o.method || o.pay || o.payMethod || '시연 결제', status: !o.status || /결제 완료|paid/.test(o.status) ? 'paid' : /환불/.test(o.status) ? 'refunded' : o.status, mine: true };
    }).reverse();
  }
  var OST = { paid: ['결제 완료', 'ad-badge--blue'], shipping: ['배송 중', 'ad-badge--line'], delivered: ['배송 완료', ''], 'refund-req': ['환불 요청', 'ad-badge--bad'], refunded: ['환불 완료', 'ad-badge--hold'], rejected: ['환불 거절', 'ad-badge--hold'] };
  function orderStatus(o) { return ST.orderStatus[o.id] || o.status; }
  VIEWS.dash = function () {
    var pend = pendingCount();
    var newInq = SEED.inquiries.filter(function (q) { return q.status === 'new' && !ST.inqSent[q.id]; }).length;
    var mine = myOrders();
    var h = head('한눈에', '대시보드', '오늘 할 일과 매출·결제·수강 시작, 영상에서 결제까지의 흐름, AI 인용 점수를 봅니다. 숫자는 예시입니다(이 브라우저의 시연 주문만 실제로 누른 기록).', '', 'grid');
    h += '<div class="ad-todo">' +
      '<a href="#inbox" class="' + (pend ? 'is-hot' : '') + '"><span>오늘의 제안</span><b>' + pend + '</b><small>승인 대기</small></a>' +
      '<a href="#exp"><span>문구 실험</span><b>' + SEED.experiments.filter(function (e) { return e.status === 'done' && ST.exp[e.id] !== 'B'; }).length + '</b><small>결과 확정 대기</small></a>' +
      '<a href="#aicheck"><span>AI 답변 점검</span><b>' + SEED.aiCheck.wrong.length + '</b><small>틀린 사실 ' + EX + '</small></a>' +
      '<a href="#inquiries"><span>문의</span><b>' + newInq + '</b><small>답변 대기 ' + EX + '</small></a></div>';
    h += '<section class="ad-sec"><h2 class="ad-sec__t">오늘 ' + EX + '</h2><div class="ad-kpis">' + SEED.kpi.map(function (k) {
      var d = k.value - k.prev, up = d >= 0;
      return '<div class="ad-kpi"><span class="ad-kpi__k">' + esc(k.label) + '</span><span class="ad-kpi__v">' + num(k.value) + '<small>' + esc(k.unit) + '</small></span><span class="ad-kpi__d">어제보다 ' + (up ? '+' : '−') + num(Math.abs(d)) + esc(k.unit) + '</span></div>';
    }).join('') + '</div></section>';
    h += '<div class="ad-grid ad-grid--2 ad-sec"><div class="ad-card"><p class="ad-card__t">영상 → 사이트 → 강의 상세 → 결제 ' + EX + '</p><p class="ad-card__d">' + esc(SEED.funnelNote) + '</p><div class="ad-hbars" style="margin-top:14px">' +
      SEED.funnel.map(function (s, i) { var first = SEED.funnel[0].n, prev = i ? SEED.funnel[i - 1].n : first; return '<div class="ad-hbar"><span class="ad-hbar__k">' + esc(s.step) + '</span><span class="ad-hbar__track"><span class="ad-hbar__fill" style="width:' + Math.max(1, s.n / first * 100) + '%"></span></span><span class="ad-hbar__v">' + num(s.n) + '<small>' + (i ? '이어짐 ' + pct(s.n, prev) + '%' : '시작') + '</small></span></div>'; }).join('') +
      '</div></div><div class="ad-card"><p class="ad-card__t">매출 · 최근 7일 ' + EX + '</p><p class="ad-card__d">결제 완료 기준 · 환불 뺀 값</p><div class="ad-chart" data-chart="sales" style="margin-top:8px"></div></div></div>';
    AFTER.push(function () { barChart($('[data-chart="sales"]'), { labels: SEED.salesWeek.map(function (x) { return x.d; }), values: SEED.salesWeek.map(function (x) { return x.v; }), fmt: function (v) { return num(v) + '원'; }, short: function (v) { return Math.round(v / 10000) + '만'; }, title: '최근 7일 매출(예시)' }); });
    h += '<div class="ad-grid ad-grid--side ad-sec"><div class="ad-card"><div class="ad-tblcap"><p class="ad-card__t">최근 주문</p><a class="ad-small" href="#orders">주문 전체 보기</a></div>' + orderTable(mine.concat(SEED.orders.map(function (o) { return Object.assign({ example: true }, o); })).slice(0, 6 + mine.length), true) + '</div>' +
      '<div class="ad-card"><p class="ad-card__t">AI 인용 점수 ' + EX + '</p><p class="ad-card__d">질문 40개 × AI 4곳 중 이 사이트 인용 비율</p><div class="ad-chart" data-chart="ai-dash" style="margin-top:8px"></div><p class="ad-small" style="margin-top:6px"><a href="#aicheck">AI 답변 점검으로</a></p></div></div>';
    AFTER.push(function () { lineChart($('[data-chart="ai-dash"]'), { labels: SEED.aiTrend.map(function (x) { return x.w; }), series: [{ name: '인용 점수', color: '#1f4fd6', values: SEED.aiTrend.map(function (x) { return x.v; }) }], unit: '%', yMin: 0, yMax: 40, fmt: function (v) { return v + '%'; }, title: 'AI 인용 점수 추이(예시)', h: 200 }); });
    return h;
  };
  function orderTable(list, compact) {
    if (!list.length) return '<div class="ad-empty">주문이 없습니다.</div>';
    var mine = list.filter(function (o) { return o.mine; });
    return (mine.length ? '<p class="ad-small" style="margin:6px 0 8px;color:var(--blue-deep);font-weight:700">' + icon('check', 'ad-ico--xs') + ' 이 브라우저의 시연 주문 ' + mine.length + '건이 맨 위에 있습니다</p>' : '') +
      '<div class="ad-tablewrap"><table class="ad-table"' + (compact ? ' style="min-width:560px"' : '') + '><thead><tr><th>주문</th><th>상품</th><th class="n">금액</th><th>상태</th>' + (compact ? '' : '<th>할 일</th>') + '</tr></thead><tbody>' +
      list.map(function (o) {
        var s = orderStatus(o), b = OST[s] || [s, ''];
        var total = o.total != null ? o.total : o.items.reduce(function (t, x) { return t + x.price; }, 0);
        var act = '';
        if (!compact && s === 'refund-req') act = '<div class="ad-btns"><button class="ad-btn ad-btn--line ad-btn--sm" type="button" data-act="refund" data-id="' + esc(o.id) + '">환불 처리</button></div>';
        return '<tr' + (o.mine ? ' class="is-mine"' : '') + '><td><span class="ad-rowt">' + esc(o.id) + '</span><br><span class="ad-rows">' + esc(hm(o.at)) + ' · ' + esc(o.name) + (o.mine ? ' · <b style="color:var(--blue-deep)">이 브라우저의 시연 주문</b>' : ' ' + EX) + '</span></td>' +
          '<td>' + o.items.map(function (x) { return esc(x.title); }).join('<br>') + (o.note ? '<br><span class="ad-rows">' + esc(o.note) + '</span>' : '') + '</td>' +
          '<td class="n">' + (o.items.some(function (x) { return x.unit === '월'; }) ? '월 ' : '') + num(total) + '원<br><span class="ad-rows">' + esc(o.method) + '</span></td><td><span class="ad-badge ' + b[1] + '">' + esc(b[0]) + '</span></td>' + (compact ? '' : '<td>' + act + '</td>') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ── 판매 ──
  VIEWS.orders = function () {
    var mine = myOrders();
    var all = mine.concat(SEED.orders.map(function (o) { return Object.assign({ example: true }, o); }));
    var tab = UI.orderTab;
    var shown = all.filter(function (o) { var s = orderStatus(o); return tab === 'all' || s === tab || (tab === 'ship' && (s === 'shipping' || s === 'delivered')) || (tab === 'refund' && /refund|rejected/.test(s)); });
    var h = head('판매', '주문·환불', '강의·구독반·책·굿즈를 한 장바구니로 받은 주문입니다. 결제하면 강의는 바로 내 강의실에 열리고, 책·굿즈는 배송으로 넘어갑니다. 환불은 사람이 환불 규정에 따라 처리합니다.', '', 'receipt');
    h += '<div class="ad-tabs" role="group" aria-label="상태로 걸러 보기">' + [['all', '전체'], ['paid', '결제 완료'], ['ship', '배송'], ['refund-req', '환불 요청'], ['refund', '환불 처리됨']].map(function (t) {
      return '<button class="ad-tab" type="button" data-act="order-tab" data-tab="' + t[0] + '" aria-pressed="' + (tab === t[0]) + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    h += mine.length ? '' : '<p class="ad-note ad-note--plain" style="margin-bottom:12px">' + icon('info') + '<span>이 브라우저에서 사이트의 시연 결제(장바구니 → 결제)를 하면 그 주문이 맨 위에 ‘이 브라우저의 시연 주문’으로 나타납니다.</span></p>';
    h += orderTable(shown, false);
    return h;
  };
  VIEWS.subs = function () {
    var S = SEED.subscriptions;
    var name = function (slug) { var c = D.courses.find(function (x) { return x.slug === slug; }); return c ? c.title : slug; };
    var price = function (slug) { var c = D.courses.find(function (x) { return x.slug === slug; }); return c ? priceText(c) : ''; };
    var st = { active: ['이용 중', 'ad-badge--blue'], cancel: ['해지 예약', 'ad-badge--hold'], retry: ['결제 재시도', 'ad-badge--bad'], ended: ['종료', ''] };
    var h = head('판매', '구독', '2026 실전 투자반·판교불패처럼 매월 자동 결제(30일 단위)되는 구독입니다. 고객은 내 강의실에서 언제든 해지할 수 있고, 해지하면 다음 결제일에 끝납니다.', '', 'repeat');
    h += '<div class="ad-kpis">' + D.courses.filter(function (c) { return c.kind === '구독' || c.kind === '기업'; }).map(function (c) {
      var n = S.filter(function (s) { return s.plan === c.slug && s.status !== 'ended'; }).length;
      return '<div class="ad-kpi"><span class="ad-kpi__k">' + esc(c.short || c.title) + '</span><span class="ad-kpi__v">' + num(n) + '<small>명</small></span><span class="ad-kpi__d">' + esc(priceText(c)) + ' · 이용 중 ' + EX + '</span></div>';
    }).join('') + '<div class="ad-kpi"><span class="ad-kpi__k">결제 재시도</span><span class="ad-kpi__v">' + S.filter(function (s) { return s.status === 'retry'; }).length + '<small>건</small></span><span class="ad-kpi__d">카드 한도·만료 ' + EX + '</span></div></div>';
    h += '<div class="ad-tablewrap ad-sec"><table class="ad-table"><thead><tr><th>회원</th><th>구독</th><th>시작</th><th>다음 결제</th><th class="n">이용</th><th>상태</th></tr></thead><tbody>' +
      S.map(function (s) { var b = st[s.status] || [s.status, '']; return '<tr><td class="ad-rowt">' + esc(s.name) + ' ' + EX + '</td><td>' + esc(name(s.plan)) + '<br><span class="ad-rows">' + esc(price(s.plan)) + '</span></td><td class="ad-rows">' + esc(dot(s.start)) + '</td><td class="ad-rows">' + (s.next ? esc(dot(s.next)) : '—') + '</td><td class="n">' + s.months + '개월</td><td><span class="ad-badge ' + b[1] + '">' + b[0] + '</span>' + (s.note ? '<br><span class="ad-rows">' + esc(s.note) + '</span>' : '') + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
    return h;
  };
  VIEWS.coupons = function () {
    var list = ST.coupons.map(function (c) { return Object.assign({ mine: true }, c); }).concat(SEED.coupons.map(function (c) { return Object.assign({ example: true }, c); }));
    var kindText = function (c) { return c.kind === 'percent' ? c.value + '% 할인' : c.kind === 'won' ? num(c.value) + '원 할인' : '배송비 무료'; };
    var h = head('판매', '쿠폰', '할인율·금액은 가격과 같은 ‘사람만’ 영역입니다. AI 자동화는 쿠폰을 만들거나 바꾸지 않습니다.', '<button class="ad-btn ad-btn--primary ad-btn--sm" type="button" data-act="coupon-new">새 쿠폰</button>', 'ticket');
    h += '<div class="ad-tablewrap"><table class="ad-table"><thead><tr><th>코드</th><th>이름</th><th>혜택</th><th>대상</th><th>기한</th><th class="n">사용</th><th>켜기</th></tr></thead><tbody>' +
      list.map(function (c) {
        var on = ST.coupons.length && c.mine ? c.on : (ST.info['coupon:' + c.code] != null ? ST.info['coupon:' + c.code] : c.on);
        return '<tr' + (c.mine ? ' class="is-mine"' : '') + '><td class="ad-rowt"><code>' + esc(c.code) + '</code></td><td>' + esc(c.name) + (c.example ? ' ' + EX : ' <span class="ad-badge ad-badge--blue">이 브라우저</span>') + '</td><td>' + esc(kindText(c)) + '</td><td>' + esc(c.target) + '</td><td class="ad-rows">' + esc(dot(c.until)) + '</td><td class="n">' + num(c.used || 0) + (c.limit ? '/' + num(c.limit) : '') + '</td>' +
          '<td><button class="ad-switch" type="button" role="switch" aria-checked="' + !!on + '" data-act="coupon-on" data-code="' + esc(c.code) + '" aria-label="' + esc(c.name) + ' 켜기"><span class="ad-switch__track"></span></button></td></tr>';
      }).join('') + '</tbody></table></div>';
    return h;
  };

  // ── 상품 ──
  var CST = { open: ['판매 중', 'ad-badge--blue'], closed: ['모집 마감', 'ad-badge--hold'], hidden: ['숨김', ''] };
  VIEWS.courses = function () {
    var h = head('상품', '강의', '강의·구독반 ' + D.courses.length + '개(실제 데이터 — data/courses.json). 편집은 시연으로 이 브라우저에만 저장되고, 사이트 반영은 운영 단계에서 붙입니다. 가격은 사람만 바꿉니다.', '', 'play');
    h += '<div class="ad-tablewrap"><table class="ad-table"><thead><tr><th>강의</th><th>분류</th><th class="n">가격</th><th>기간·구성</th><th>강사</th><th>상태</th><th></th></tr></thead><tbody>' +
      D.courses.map(function (c0) {
        var e = ST.courseEdits[c0.slug] || {}, c = Object.assign({}, c0, e), b = CST[c.status] || [c.status, ''];
        return '<tr><td><div class="ad-cellflex"><img class="ad-thumb" src="../assets/img/' + esc(c0.img) + '" alt="" width="72" height="41" loading="lazy"><div><a class="ad-rowt" href="' + esc(site('/classes/' + c.slug + '/')) + '" target="_blank" rel="noopener">' + esc(c.title) + '</a><br><span class="ad-rows">' + esc(c.slug) + (Object.keys(e).length ? ' · <b style="color:var(--blue-deep)">편집됨(운영 단계에서 반영)</b>' : '') + '</span></div></div></td>' +
          '<td>' + esc(c.kind) + '</td><td class="n">' + esc(priceText(c)) + '</td><td class="ad-rows">' + esc(c.period || '') + (c.lessons ? ' · ' + c.lessons + '강' : '') + (c.minutes ? ' · ' + Math.round(c.minutes / 60 * 10) / 10 + '시간' : '') + '</td><td class="ad-rows">' + esc(c.instructors.join(', ')) + '</td>' +
          '<td><span class="ad-badge ' + b[1] + '">' + b[0] + '</span></td><td><button class="ad-btn ad-btn--line ad-btn--sm" type="button" data-act="course-edit" data-slug="' + esc(c.slug) + '">편집</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    return h;
  };
  var STOCK = [312, 148, 96, 205, 87, 133, 64, 41];
  VIEWS.books = function () {
    var h = head('상품', '책·굿즈', '애덤스미스 출판 도서 ' + D.books.length + '종과 굿즈(실제 데이터 — data/books.json). 재고 숫자는 예시입니다.', '', 'book');
    h += '<div class="ad-tablewrap"><table class="ad-table"><thead><tr><th>상품</th><th>저자</th><th class="n">판매가</th><th class="n">정가</th><th class="n">재고</th><th>판매</th><th></th></tr></thead><tbody>' +
      D.books.map(function (b0, i) {
        var e = ST.bookEdits[b0.slug] || {}, b = Object.assign({}, b0, e);
        return '<tr><td><div class="ad-cellflex"><img class="ad-thumb ad-thumb--book" src="../assets/img/' + esc(b0.img) + '" alt="" width="40" height="53" loading="lazy"><div><a class="ad-rowt" href="' + esc(site('/books/' + b.slug + '/')) + '" target="_blank" rel="noopener">' + esc(b.title) + '</a><br><span class="ad-rows">' + esc(b.publisher || '다른 출판사') + (Object.keys(e).length ? ' · <b style="color:var(--blue-deep)">편집됨</b>' : '') + '</span></div></div></td>' +
          '<td class="ad-rows">' + esc(b.author || '저자 확인 필요') + '</td><td class="n">' + won(b.price) + '</td><td class="n ad-muted">' + won(b.listPrice) + '</td><td class="n">' + num(STOCK[i % STOCK.length]) + ' ' + EX + '</td>' +
          '<td><span class="ad-badge ' + (b.sale ? 'ad-badge--blue' : '') + '">' + (b.sale ? '판매 중' : '판매 중지') + '</span></td><td><button class="ad-btn ad-btn--line ad-btn--sm" type="button" data-act="book-edit" data-slug="' + esc(b.slug) + '">편집</button></td></tr>';
      }).join('') +
      D.goods.map(function (g) { return '<tr><td><div class="ad-cellflex"><img class="ad-thumb ad-thumb--book" src="../assets/img/' + esc(g.img) + '" alt="" width="40" height="53" loading="lazy"><div><span class="ad-rowt">' + esc(g.title) + '</span><br><span class="ad-rows">굿즈</span></div></div></td><td class="ad-rows">—</td><td class="n">' + won(g.price) + '</td><td class="n ad-muted">—</td><td class="n">58 ' + EX + '</td><td><span class="ad-badge ad-badge--blue">판매 중</span></td><td></td></tr>'; }).join('') +
      '</tbody></table></div>';
    return h;
  };
  VIEWS.events = function () {
    var today = D.buildDate;
    var h = head('상품', '오프라인 특강', '지난 특강은 ‘상품 신선도’ 자동화가 매일 06시에 판매 목록에서 내리고 지난 특강으로 옮깁니다(자동 등급, 기록 남음).', '<button class="ad-btn ad-btn--primary ad-btn--sm" type="button" data-act="event-new">새 특강 등록</button>', 'cal');
    h += '<div class="ad-grid ad-grid--2">' + D.events.map(function (e) {
      var past = e.date && e.date < today;
      return '<div class="ad-card"><p class="ad-card__t">' + esc(e.title) + (past ? '<span class="ad-badge ad-badge--hold">지난 특강 · 자동 내림</span>' : e.soldOut ? '<span class="ad-badge ad-badge--hold">품절</span>' : '<span class="ad-badge ad-badge--blue">판매 중</span>') + '</p>' +
        '<dl class="ad-small" style="margin:10px 0 0;display:grid;grid-template-columns:64px 1fr;gap:4px 10px"><dt class="ad-muted">일시</dt><dd style="margin:0">' + (e.date ? esc(dot(e.date)) : '수집본에 날짜 없음(같은 특강 10시 회차로 보임)') + '</dd><dt class="ad-muted">장소</dt><dd style="margin:0">' + esc(e.place || '—') + '</dd><dt class="ad-muted">강사</dt><dd style="margin:0">' + esc(e.instructor || '표시 없음') + '</dd><dt class="ad-muted">가격</dt><dd style="margin:0">' + won(e.price) + '</dd></dl>' +
        '<p class="ad-small ad-muted" style="margin-top:8px">원본: <a href="' + esc(e.source) + '" target="_blank" rel="noopener">옛 스토어 상품</a></p></div>';
    }).join('') + '</div>';
    var qa = D.courses.find(function (c) { return c.slug === 'offline-qa-2026h2'; });
    if (qa) h += '<p class="ad-note ad-sec">' + icon('info') + '<span>특강 질의응답 영상은 무료 강의 「' + esc(qa.title) + '」로 공개되어 있습니다(' + esc(qa.period) + ' 수강). <a href="' + esc(site('/events/')) + '" target="_blank" rel="noopener">사이트의 오프라인 특강 쪽</a></span></p>';
    return h;
  };

  // ── 콘텐츠 ──
  function vState(v) {
    var k = 'video:' + v.id;
    if (v.status === 'published') return ['게시됨', 'ad-badge--blue', 'built'];
    if (ST.published[k]) return ['게시됨(이 브라우저)', 'ad-badge--ok', 'mine'];
    if (ST.held[k]) return ['보류', 'ad-badge--hold', 'held'];
    return ['승인 대기', 'ad-badge--bad', 'pending'];
  }
  VIEWS.videos = function () {
    var h = head('콘텐츠', '영상 정리', '유튜브 최근 영상 ' + D.videos.length + '편. ‘영상 정리’ 자동화가 매시간 새 영상을 보고 정리 초안을 만들어 오늘의 제안에 올립니다. 데이터 출처: ' + esc(D.videosSource) + '.', '<a class="ad-btn ad-btn--line ad-btn--sm" href="' + site('/videos/') + '" target="_blank" rel="noopener">사이트 영상 정리' + icon('ext', 'ad-ico--sm') + '</a>', 'video');
    h += '<div class="ad-tablewrap"><table class="ad-table"><thead><tr><th>영상</th><th>올라온 날</th><th class="n">조회</th><th>장 목차</th><th>상태</th><th></th></tr></thead><tbody>' +
      D.videos.map(function (v) {
        var s = vState(v);
        var act = s[2] === 'pending' || s[2] === 'held' ? '<a class="ad-btn ad-btn--primary ad-btn--sm" href="#inbox" data-act="goto-prop" data-key="video:' + esc(v.id) + '">승인함에서 보기</a>' : s[2] === 'mine' ? '<button class="ad-btn ad-btn--line ad-btn--sm" type="button" data-act="undo" data-key="video:' + esc(v.id) + '">되돌리기</button>' : '';
        return '<tr><td><div class="ad-cellflex"><img class="ad-thumb" src="../assets/img/' + esc(v.img) + '" alt="" width="72" height="41" loading="lazy"><a class="ad-rowt" href="' + esc(site('/videos/' + v.id + '/')) + '" target="_blank" rel="noopener">' + esc(v.title) + '</a></div></td><td class="ad-rows">' + esc(dot(v.date)) + '</td><td class="n">' + num(v.views) + '</td><td class="ad-rows">' + (v.chapters.length ? v.chapters.length + '개' : '없음') + '</td><td><span class="ad-badge ' + s[1] + '">' + s[0] + '</span></td><td>' + act + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h;
  };
  VIEWS.answers = function () {
    var h = head('콘텐츠', '질문 답변', 'AI 답변 엔진이 인용하도록 질문 하나에 쪽 하나로 답합니다. 경제 개념 설명은 ‘애덤스미스 편집팀’ 이름으로, 대표 의견처럼 쓰지 않습니다.', '<a class="ad-btn ad-btn--line ad-btn--sm" href="' + site('/answers/') + '" target="_blank" rel="noopener">사이트 질문 답변' + icon('ext', 'ad-ico--sm') + '</a>', 'qa');
    var drafts = SEED.searchDrafts.map(function (s) { return { q: s.q, key: 'search:' + s.q, ex: true }; }).concat(ST.searchDrafts.map(function (s) { return { q: s.q, key: 'search:' + s.q }; }));
    if (!D.answers.length) {
      h += '<div class="ad-empty">data/answers.json 이 아직 없습니다 — 질문 답변 담당 작업이 끝나면 빌드 때 여기에 채워집니다.</div>';
    } else {
      h += '<div class="ad-tablewrap"><table class="ad-table"><thead><tr><th>질문</th><th>첫 문단</th><th>상태</th><th></th></tr></thead><tbody>' +
        D.answers.map(function (a) {
          var k = 'answer:' + a.slug, s = a.status === 'pending' ? (ST.published[k] ? ['게시됨(이 브라우저)', 'ad-badge--ok'] : ST.held[k] ? ['보류', 'ad-badge--hold'] : ['승인 대기', 'ad-badge--bad']) : ['게시됨', 'ad-badge--blue'];
          return '<tr><td><a class="ad-rowt" href="' + esc(site('/answers/' + a.slug + '/')) + '" target="_blank" rel="noopener">' + esc(a.q) + '</a><br><span class="ad-rows">' + esc(a.by || '') + (a.checkedAt ? ' · 확인 ' + esc(dot(a.checkedAt)) : ' · ' + esc(a.from ? a.from + '에서 나온 초안' : '확인 전')) + '</span></td><td class="ad-small">' + esc(a.short.slice(0, 90)) + (a.short.length > 90 ? '…' : '') + '</td><td><span class="ad-badge ' + s[1] + '">' + s[0] + '</span></td><td>' + (a.status === 'pending' && !ST.published[k] ? '<a class="ad-btn ad-btn--primary ad-btn--sm" href="#inbox" data-act="goto-prop" data-key="' + esc(k) + '">승인함에서 보기</a>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    h += '<section class="ad-sec"><h2 class="ad-sec__t">' + icon('search') + '검색어에서 나온 답변 초안</h2><div class="ad-tablewrap"><table class="ad-table" style="min-width:420px"><thead><tr><th>검색어</th><th>상태</th></tr></thead><tbody>' +
      drafts.map(function (d) { return '<tr><td class="ad-rowt">' + esc(d.q) + (d.ex ? ' ' + EX : '') + '</td><td>' + (ST.published[d.key] ? '<span class="ad-badge ad-badge--ok">게시됨(이 브라우저)</span>' : '<a class="ad-badge ad-badge--blue" href="#inbox">승인함에 있음</a>') + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
    return h;
  };
  VIEWS.faq = function () {
    var base = D.faq.length ? D.faq.map(function (f) { return Object.assign({ src: 'data' }, f); }) : SEED.faqFallback.map(function (f) { return Object.assign({ example: true }, f); });
    var fromInbox = SEED.faqDrafts.filter(function (f) { return ST.published['faq:' + f.id]; }).map(function (f) { return { q: f.q, a: ST.edits['faq:' + f.id] != null ? ST.edits['faq:' + f.id] : f.a, cat: '문의 → 질문', mine: true }; });
    var h = head('콘텐츠', '자주 묻는 질문', '고객센터와 홈 맨 아래에 보이는 질문입니다. 화면에 보이는 질문만 구조화 데이터(FAQPage)로 냅니다. ‘문의 → 질문’ 자동화가 반복 문의를 묶어 초안을 올립니다.', '<a class="ad-btn ad-btn--line ad-btn--sm" href="' + site('/help/') + '" target="_blank" rel="noopener">사이트 고객센터' + icon('ext', 'ad-ico--sm') + '</a>', 'list');
    if (!D.faq.length) h += '<p class="ad-note ad-note--plain" style="margin-bottom:12px">' + icon('info') + '<span>고객센터 질문 데이터가 아직 빌드에 없어 예시 질문을 보여 줍니다.</span></p>';
    h += '<div class="ad-tablewrap"><table class="ad-table"><thead><tr><th>질문</th><th>답(앞부분)</th><th>분류</th></tr></thead><tbody>' +
      fromInbox.concat(base).map(function (f) { return '<tr' + (f.mine ? ' class="is-mine"' : '') + '><td class="ad-rowt">' + esc(f.q) + (f.example ? ' ' + EX : '') + (f.demo ? ' <span class="ad-badge ad-badge--hold">데모 기준안 · 운영 전 확정</span>' : '') + (f.mine ? ' <span class="ad-badge ad-badge--ok">승인함에서 게시</span>' : '') + '</td><td class="ad-small">' + esc(String(f.a || '').slice(0, 110)) + '</td><td class="ad-rows">' + esc(f.cat || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    return h;
  };

  // ── 고객 ──
  VIEWS.members = function () {
    var M = SEED.members;
    var cname = function (slug) { var c = D.courses.find(function (x) { return x.slug === slug; }); return c ? (c.short || c.title) : slug; };
    var h = head('고객', '회원·수강생', '두 사이트의 회원을 카카오 계정 기준으로 합치는 것을 전제로 한 화면입니다(운영 단계에서 동의 절차). 이름은 가리고 연락처는 보이지 않습니다.', '', 'users');
    h += '<div class="ad-kpis"><div class="ad-kpi"><span class="ad-kpi__k">회원</span><span class="ad-kpi__v">' + M.length + '<small>명</small></span><span class="ad-kpi__d">예시 목록</span></div><div class="ad-kpi"><span class="ad-kpi__k">오늘 가입</span><span class="ad-kpi__v">' + M.filter(function (m) { return m.join === D.buildDate; }).length + '<small>명</small></span><span class="ad-kpi__d">' + EX + '</span></div><div class="ad-kpi"><span class="ad-kpi__k">결제 후 첫 강의 전</span><span class="ad-kpi__v">' + M.filter(function (m) { return m.courses.some(function (c) { return c.progress === 0; }); }).length + '<small>명</small></span><span class="ad-kpi__d">안내 메시지 대상 ' + EX + '</span></div><div class="ad-kpi"><span class="ad-kpi__k">카카오 가입</span><span class="ad-kpi__v">' + pct(M.filter(function (m) { return m.via === '카카오'; }).length, M.length, 0) + '<small>%</small></span><span class="ad-kpi__d">' + EX + '</span></div></div>';
    h += '<div class="ad-tablewrap ad-sec"><table class="ad-table"><thead><tr><th>회원</th><th>가입</th><th>수강(진도)</th><th>최근 접속</th></tr></thead><tbody>' +
      M.map(function (m) {
        return '<tr><td class="ad-rowt">' + esc(m.name) + ' ' + EX + (m.note ? '<br><span class="ad-rows">' + esc(m.note) + '</span>' : '') + '</td><td class="ad-rows">' + esc(dot(m.join)) + ' · ' + esc(m.via) + '</td><td>' +
          m.courses.map(function (c) { return '<div class="ad-small" style="display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:8px;align-items:center;margin:2px 0"><span>' + esc(cname(c.slug)) + '</span><span class="ad-hbar__track" style="height:8px" title="진도 ' + c.progress + '%"><span class="ad-hbar__fill" style="width:' + Math.max(c.progress, 1) + '%"></span></span></div><span class="ad-rows">진도 ' + c.progress + '%</span>'; }).join('') +
          '</td><td class="ad-rows">' + esc(dot(m.last)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h;
  };
  VIEWS.inquiries = function () {
    var h = head('고객', '문의', '1:1 문의·채팅에 AI가 답변 초안을 붙입니다. 보내기 전에 금칙어를 점검하고, 환불 기준처럼 사람만 쓰는 문장은 담당자가 확인합니다. 같은 질문이 반복되면 자주 묻는 질문 초안으로 묶여 승인함에 올라갑니다.', '', 'chat');
    h += '<div class="ad-inbox">' + SEED.inquiries.map(function (q) {
      var key = 'inq:' + q.id, text = ST.edits[key] != null ? ST.edits[key] : q.draft, r = scan(text), bad = r.hits.length > 0;
      var sent = ST.inqSent[q.id] || q.status === 'answered';
      var editing = UI.editing === key;
      return '<article class="ad-prop' + (bad && !sent ? ' is-bad' : '') + (sent ? ' is-done' : '') + '"><div class="ad-prop__head"><span class="ad-prop__type">' + icon('chat') + esc(q.channel) + ' · ' + esc(q.cat) + '</span>' + (sent ? '<span class="ad-badge ad-badge--ok">답변함</span>' : '<span class="ad-badge ad-badge--blue">새 문의</span>') + EX + '<span class="ad-badge ad-badge--line">이름·연락처 가림</span><span class="ad-prop__when">' + esc(q.id) + ' · ' + esc(hm(q.at)) + ' · ' + esc(q.name) + '</span></div>' +
        '<div class="ad-prop__body"><div><p class="ad-meta__k">고객 문의</p><p style="margin:4px 0 12px">' + esc(q.text) + '</p><div class="ad-draft"><p class="ad-draft__k">' + icon('spark', 'ad-ico--xs') + 'AI 답변 초안' + (ST.edits[key] != null ? ' · 고침' : '') + '</p><p>' + marked(text) + '</p></div></div>' +
        '<div class="ad-meta"><div class="ad-meta__row"><span class="ad-meta__k">점검</span>' + checkBox(text) + '</div>' + (q.human ? '<div class="ad-check ad-check--lock"><p class="ad-check__h">' + icon('lock', 'ad-ico--sm') + esc(q.human) + '</p></div>' : '') + (q.faq ? '<div class="ad-meta__row"><span class="ad-meta__k">묶인 질문 초안</span><a class="ad-meta__v" href="#inbox" data-act="goto-prop" data-key="faq:' + esc(q.faq) + '">승인함에서 보기</a></div>' : '') + '</div></div>' +
        (editing ? '<div class="ad-edit"><label class="ad-field"><span class="ad-field__label">답변 고치기</span><textarea class="ad-textarea" id="ad-edit-text" data-key="' + esc(key) + '">' + esc(text) + '</textarea></label><div class="ad-edit__live" id="ad-edit-live">' + checkBox(text) + '</div><div class="ad-btns"><button class="ad-btn ad-btn--primary" type="button" data-act="edit-save" data-key="' + esc(key) + '">저장</button><button class="ad-btn ad-btn--ghost" type="button" data-act="edit-cancel">취소</button></div></div>' : '') +
        '<div class="ad-prop__foot">' + (sent ? '<span class="ad-prop__state ad-prop__state--ok">' + icon('check', 'ad-ico--sm') + '답변을 보냈습니다(시연)</span>' :
          '<button class="ad-btn ad-btn--primary" type="button" data-act="inq-send" data-id="' + esc(q.id) + '"' + (bad || q.human ? ' disabled' : '') + '>답변 보내기(시연)</button>' + (q.human ? '<button class="ad-btn ad-btn--ink" type="button" data-act="inq-send-human" data-id="' + esc(q.id) + '"' + (bad ? ' disabled' : '') + '>' + icon('lock', 'ad-ico--sm') + '담당자 확인 후 보내기</button>' : '') +
          '<button class="ad-btn ad-btn--line" type="button" data-act="edit" data-key="' + esc(key) + '">' + icon('edit', 'ad-ico--sm') + (bad ? '수정 후 보내기' : '수정') + '</button>') + '</div></article>';
    }).join('') + '</div>';
    return h;
  };
  VIEWS.reviews = function () {
    var cname = function (slug) { var c = D.courses.find(function (x) { return x.slug === slug; }); return c ? (c.short || c.title) : slug; };
    var h = head('고객', '후기', '수강생 후기를 공개하기 전에 금칙어를 점검합니다. 수익률·수익 인증 같은 체험 결과는 일반화될 수 있어 공개하지 않습니다(추천·보증 심사지침).', '', 'star');
    h += '<div class="ad-inbox">' + SEED.reviews.map(function (rv) {
      var r = scan(rv.text), bad = r.hits.length > 0, st = ST.reviewStatus[rv.id] || rv.status;
      var badge = st === 'shown' ? ['공개', 'ad-badge--blue'] : st === 'hidden' ? ['숨김', 'ad-badge--hold'] : ['검토 대기', 'ad-badge--bad'];
      return '<article class="ad-prop' + (bad && st !== 'hidden' ? ' is-bad' : '') + '"><div class="ad-prop__head"><span class="ad-prop__type">' + icon('star') + esc(cname(rv.course)) + '</span><span class="ad-badge ' + badge[1] + '">' + badge[0] + '</span>' + EX + '<span class="ad-prop__when">' + esc(rv.id) + ' · ' + esc(dot(rv.at)) + ' · ' + esc(rv.name) + ' · 별 ' + rv.stars + '개</span></div>' +
        '<div class="ad-prop__body"><div><p>' + marked(rv.text) + '</p></div><div class="ad-meta">' + checkBox(rv.text) + '</div></div>' +
        '<div class="ad-prop__foot"><button class="ad-btn ad-btn--primary ad-btn--sm" type="button" data-act="review" data-id="' + esc(rv.id) + '" data-s="shown"' + (bad || st === 'shown' ? ' disabled' : '') + '>공개</button><button class="ad-btn ad-btn--line ad-btn--sm" type="button" data-act="review" data-id="' + esc(rv.id) + '" data-s="hidden"' + (st === 'hidden' ? ' disabled' : '') + '>숨김</button>' + (bad ? '<span class="ad-small" style="color:var(--bad)">금칙어가 있어 공개할 수 없습니다 — 숨김 권장</span>' : '') + '</div></article>';
    }).join('') + '</div>';
    return h;
  };

  // ── 사이트 ──
  function homeOrder() {
    var base = SEED.homeSections.map(function (s) { return Object.assign({}, s); });
    if (!ST.homeOrder) return base;
    var by = {}; base.forEach(function (s) { by[s.id] = s; });
    var out = ST.homeOrder.map(function (o) { var s = by[o.id]; if (!s) return null; delete by[o.id]; return Object.assign(s, { on: o.on }); }).filter(Boolean);
    return out.concat(Object.keys(by).map(function (k) { return by[k]; }));
  }
  VIEWS.home = function () {
    var list = homeOrder();
    var h = head('사이트', '홈 순서', '홈 화면의 구간 순서와 켜기·끄기입니다. 구간 안의 카드 순서는 ‘추천 순서’ 자동화가 매주 조정합니다. 데모에서는 저장만 하고, 사이트 반영은 운영 단계입니다.', '<a class="ad-btn ad-btn--line ad-btn--sm" href="../" target="_blank" rel="noopener">홈 열기' + icon('ext', 'ad-ico--sm') + '</a>', 'layout');
    h += '<ol class="ad-order">' + list.map(function (s, i) {
      return '<li class="' + (s.on ? '' : 'is-off') + '"><div><p class="ad-order__t">' + esc(s.name) + '</p>' + (s.auto ? '<p class="ad-order__s">' + icon('gear', 'ad-ico--xs') + ' ' + esc(s.auto) + '</p>' : '') + '</div>' +
        '<button class="ad-switch" type="button" role="switch" aria-checked="' + !!s.on + '" data-act="home-on" data-id="' + s.id + '" aria-label="' + esc(s.name) + ' 보이기"><span class="ad-switch__track"></span><span>' + (s.on ? '보임' : '숨김') + '</span></button>' +
        '<div class="ad-order__mv"><button class="ad-iconbtn" type="button" data-act="home-mv" data-id="' + s.id + '" data-d="-1" aria-label="' + esc(s.name) + ' 위로"' + (i === 0 ? ' disabled' : '') + '>' + icon('up', 'ad-ico--sm') + '</button><button class="ad-iconbtn" type="button" data-act="home-mv" data-id="' + s.id + '" data-d="1" aria-label="' + esc(s.name) + ' 아래로"' + (i === list.length - 1 ? ' disabled' : '') + '>' + icon('down', 'ad-ico--sm') + '</button></div></li>';
    }).join('') + '</ol>';
    return h;
  };
  VIEWS.info = function () {
    var s = Object.assign({}, D.site, ST.info.site || {});
    var F = [['legalName', '상호'], ['ceo', '대표'], ['bizNo', '사업자등록번호'], ['mailOrderNo', '통신판매업 신고'], ['phone', '고객센터 전화'], ['email', '대표 이메일'], ['csHours', '고객센터 시간'], ['privacyOfficer', '개인정보 보호책임자'], ['address', '주소']];
    var h = head('사이트', '기본 정보', '바닥글·llms.txt·구조화 데이터(Organization)에 같이 쓰는 회사 정보입니다(실제 데이터 — data/site.json). 고치면 이 브라우저에만 저장되고, 사이트 반영은 운영 단계입니다.', '', 'info');
    h += '<div class="ad-grid ad-grid--side"><form class="ad-card ad-form ad-form--2" id="info-form">' + F.map(function (f) {
      return '<label class="ad-field' + (f[0] === 'address' ? ' ad-span2' : '') + '"><span class="ad-field__label">' + esc(f[1]) + '</span><input class="ad-input" name="' + f[0] + '" value="' + esc(s[f[0]] || '') + '"></label>';
    }).join('') + '<div class="ad-span2 ad-btns"><button class="ad-btn ad-btn--primary" type="submit">저장(시연)</button>' + (ST.info.site ? '<span class="ad-small ad-muted">이 브라우저에 저장된 값이 있습니다</span>' : '') + '</div></form>' +
      '<div class="ad-card"><p class="ad-card__t">' + icon('alert', 'ad-ico--sm') + '머니두에 확인할 것</p><ul class="ad-small" style="margin:10px 0 0;padding-left:18px;display:grid;gap:6px;color:var(--ink-2)">' + (D.site.checks || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' +
      '<p class="ad-card__t" style="margin-top:18px">투자 유의 문구</p><p class="ad-small" style="margin-top:6px;color:var(--ink-2)">' + esc(D.site.disclaimer) + '</p><p class="ad-small ad-muted" style="margin-top:6px">강의·구독반·영상·답변 상세에 반드시 둡니다(사람만 수정).</p></div></div>';
    return h;
  };

  // ── 차트(SVG, 실제 너비로 그려 글자가 작아지지 않게) ──
  // 눈금이 둥근 수(1·2·2.5·5 × 10ⁿ)로 떨어지게 위쪽 끝을 잡는다
  function niceMax(v) { var raw = v / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; var s = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; return s * Math.ceil(v * 1.05 / s); }
  function chartFrame(el, o) {
    var w = Math.max(280, el.clientWidth || 300), hgt = o.h || 220;
    return { w: w, h: hgt, l: 40, r: o.rightPad || 16, t: 16, b: 28 };
  }
  function tipOf(el) { var t = el.querySelector('.ad-tip'); if (!t) { t = document.createElement('div'); t.className = 'ad-tip'; t.hidden = true; el.appendChild(t); } return t; }
  function tableView(labels, series, fmt) {
    return '<details class="ad-tableview"><summary>표로 보기</summary><table><thead><tr><th></th>' + series.map(function (s) { return '<th>' + esc(s.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      labels.map(function (l, i) { return '<tr><td>' + esc(l) + '</td>' + series.map(function (s) { return '<td>' + esc(fmt(s.values[i])) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></details>';
  }
  function lineChart(el, o) {
    if (!el) return;
    CHARTS.push(function () { lineChart(el, o); });
    var multi = o.series.length > 1;
    var f = chartFrame(el, Object.assign({ rightPad: multi ? 44 : 16 }, o)), n = o.labels.length;
    var x = function (i) { return f.l + (n === 1 ? 0 : i * (f.w - f.l - f.r) / (n - 1)); };
    var y = function (v) { return f.t + (1 - (v - o.yMin) / (o.yMax - o.yMin)) * (f.h - f.t - f.b); };
    var ticks = []; var step = (o.yMax - o.yMin) / 4; for (var k = 0; k <= 4; k++) ticks.push(o.yMin + step * k);
    var svg = '<svg width="' + f.w + '" height="' + f.h + '" viewBox="0 0 ' + f.w + ' ' + f.h + '" role="img" aria-label="' + esc(o.title) + '" tabindex="0">';
    ticks.forEach(function (t) { svg += '<line class="grid" x1="' + f.l + '" x2="' + (f.w - f.r) + '" y1="' + y(t) + '" y2="' + y(t) + '"/><text class="axis" x="' + (f.l - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + esc((Math.round(t * 10) / 10) + (o.unit || '')) + '</text>'; });
    var every = f.w < 420 ? 2 : 1;
    o.labels.forEach(function (l, i) { if (i % every === 0 || i === n - 1) svg += '<text class="axis" x="' + x(i) + '" y="' + (f.h - 8) + '" text-anchor="middle">' + esc(l) + '</text>'; });
    o.series.forEach(function (s) {
      svg += '<path class="ln" stroke="' + s.color + '" d="' + s.values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ') + '"/>';
      var li = n - 1, lv = s.values[li];
      svg += '<circle class="pt" cx="' + x(li) + '" cy="' + y(lv) + '" r="4.5" fill="' + s.color + '"/>';
      svg += '<text class="lbl" x="' + (multi ? x(li) + 8 : x(li) - 8) + '" y="' + (y(lv) + (multi ? 4 : -10)) + '" text-anchor="' + (multi ? 'start' : 'end') + '">' + esc(multi ? s.name : o.fmt(lv)) + '</text>';
    });
    svg += '<line class="cross" x1="0" x2="0" y1="' + f.t + '" y2="' + (f.h - f.b) + '" visibility="hidden"/>';
    svg += '<g class="dots"></g><rect class="hit" x="' + f.l + '" y="0" width="' + (f.w - f.l - f.r) + '" height="' + f.h + '"/></svg>';
    var legend = multi ? '<p class="ad-legend" style="margin-bottom:6px">' + o.series.map(function (s) { return '<span><span class="ad-sw" style="background:' + s.color + '"></span>' + esc(s.name) + '</span>'; }).join('') + '</p>' : '';
    el.innerHTML = legend + svg + tableView(o.labels, o.series, o.fmt);
    var sv = el.querySelector('svg'), cross = sv.querySelector('.cross'), dots = sv.querySelector('.dots'), tip = tipOf(el), cur = -1;
    function show(i) {
      if (i < 0 || i >= n) return; cur = i;
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      dots.innerHTML = o.series.map(function (s) { return '<circle class="pt" cx="' + x(i) + '" cy="' + y(s.values[i]) + '" r="5" fill="' + s.color + '"/>'; }).join('');
      tip.innerHTML = '<b>' + esc(o.labels[i]) + '</b><br>' + o.series.map(function (s) { return esc(s.name) + ' <b>' + esc(o.fmt(s.values[i])) + '</b>'; }).join('<br>');
      tip.hidden = false;
      var top = Math.min.apply(null, o.series.map(function (s) { return y(s.values[i]); }));
      tip.style.left = Math.min(Math.max(x(i), 60), f.w - 60) + 'px'; tip.style.top = (sv.offsetTop + top - 8) + 'px';
    }
    function hide() { cross.setAttribute('visibility', 'hidden'); dots.innerHTML = ''; tip.hidden = true; cur = -1; }
    sv.addEventListener('pointermove', function (e) { var r = sv.getBoundingClientRect(); var px = e.clientX - r.left; show(Math.round((px - f.l) / ((f.w - f.l - f.r) / (n - 1)))); });
    sv.addEventListener('pointerleave', hide);
    sv.addEventListener('blur', hide);
    sv.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { show(Math.min(n - 1, cur + 1)); e.preventDefault(); } if (e.key === 'ArrowLeft') { show(Math.max(0, cur < 0 ? n - 1 : cur - 1)); e.preventDefault(); } });
  }
  function barChart(el, o) {
    if (!el) return;
    CHARTS.push(function () { barChart(el, o); });
    var f = chartFrame(el, o), n = o.values.length, max = niceMax(Math.max.apply(null, o.values));
    var bw = Math.min(44, (f.w - f.l - f.r) / n - 10), gap = (f.w - f.l - f.r) / n;
    var x = function (i) { return f.l + gap * i + (gap - bw) / 2; };
    var y = function (v) { return f.t + (1 - v / max) * (f.h - f.t - f.b); };
    var svg = '<svg width="' + f.w + '" height="' + f.h + '" viewBox="0 0 ' + f.w + ' ' + f.h + '" role="img" aria-label="' + esc(o.title) + '">';
    [0, .25, .5, .75, 1].forEach(function (k) { var v = max * k; svg += '<line class="grid" x1="' + f.l + '" x2="' + (f.w - f.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="axis" x="' + (f.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + esc(o.short(v)) + '</text>'; });
    var maxI = o.values.indexOf(Math.max.apply(null, o.values));
    o.values.forEach(function (v, i) {
      var x0 = x(i), y0 = y(v), base = f.h - f.b, r = Math.min(4, bw / 2);
      svg += '<path data-i="' + i + '" fill="' + (i === n - 1 ? '#1f4fd6' : '#6f8fe6') + '" d="M' + x0 + ' ' + base + 'V' + (y0 + r) + 'Q' + x0 + ' ' + y0 + ' ' + (x0 + r) + ' ' + y0 + 'H' + (x0 + bw - r) + 'Q' + (x0 + bw) + ' ' + y0 + ' ' + (x0 + bw) + ' ' + (y0 + r) + 'V' + base + 'Z"/>';
      svg += '<text class="axis" x="' + (x0 + bw / 2) + '" y="' + (f.h - 8) + '" text-anchor="middle">' + esc(o.labels[i]) + '</text>';
      if (i === n - 1 || i === maxI) svg += '<text class="lbl" x="' + (x0 + bw / 2) + '" y="' + (y0 - 6) + '" text-anchor="middle">' + esc(o.short(v)) + '</text>';
      svg += '<rect class="hit" data-i="' + i + '" x="' + (f.l + gap * i) + '" y="' + f.t + '" width="' + gap + '" height="' + (f.h - f.t - f.b) + '"/>';
    });
    svg += '</svg>';
    el.innerHTML = svg + tableView(o.labels, [{ name: '매출', values: o.values }], o.fmt);
    var sv = el.querySelector('svg'), tip = tipOf(el);
    sv.addEventListener('pointermove', function (e) {
      var t = e.target.closest('[data-i]'); if (!t) { tip.hidden = true; return; }
      var i = +t.getAttribute('data-i');
      tip.innerHTML = '<b>' + esc(o.labels[i]) + '</b> · ' + esc(o.fmt(o.values[i])) + ' <span style="opacity:.7">(예시)</span>';
      tip.hidden = false; tip.style.left = Math.min(Math.max(x(i) + bw / 2, 70), f.w - 70) + 'px'; tip.style.top = (sv.offsetTop + y(o.values[i]) - 8) + 'px';
    });
    sv.addEventListener('pointerleave', function () { tip.hidden = true; });
  }
  var rsz;
  window.addEventListener('resize', function () { clearTimeout(rsz); rsz = setTimeout(function () { var list = CHARTS.slice(); CHARTS = []; list.forEach(function (f) { f(); }); }, 150); });

  // ── 확인 상자·알림 ──
  var lastFocus = null;
  function modal(o) {
    lastFocus = document.activeElement;
    var layer = $('#ad-layer');
    layer.innerHTML = '<div class="ad-modal" data-modal><div class="ad-modal__box" role="dialog" aria-modal="true" aria-labelledby="ad-modal-t" tabindex="-1"><h2 id="ad-modal-t">' + esc(o.title) + '</h2>' + o.body +
      '<div class="ad-modal__btns">' + o.buttons.map(function (b, i) { return '<button class="ad-btn ' + (b.cls || 'ad-btn--line') + '" type="button" data-mb="' + i + '">' + esc(b.label) + '</button>'; }).join('') + '</div></div></div>';
    var box = layer.querySelector('.ad-modal__box');
    function close() { layer.innerHTML = ''; document.removeEventListener('keydown', onKey, true); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') { var f = $$('button,input,select,textarea', box).filter(function (x) { return !x.disabled; }); if (!f.length) return; var a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { z.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === z) { a.focus(); e.preventDefault(); } }
    }
    document.addEventListener('keydown', onKey, true);
    layer.querySelector('[data-modal]').addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-modal')) { close(); return; }
      var b = e.target.closest('[data-mb]'); if (!b) return;
      var fn = o.buttons[+b.getAttribute('data-mb')].on;
      if (fn && fn(box) === false) return;
      close();
    });
    var first = box.querySelector('input,select,textarea') || box.querySelector('[data-mb="' + (o.focus != null ? o.focus : 0) + '"]');
    (first || box).focus();
  }
  var toastT;
  function toast(msg, bad) {
    var t = $('#ad-toast');
    t.innerHTML = (bad ? icon('alert') : icon('check')) + '<span>' + esc(msg) + '</span>';
    t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 3200);
  }

  // ── 동작 ──
  function setNav(open) {
    var app = $('#ad-app'); if (!app) return;
    app.classList.toggle('nav-open', open);
    $('#ad-scrim').hidden = !open;
    var b = $('.ad-top__menu'); if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { var f = $('#ad-nav a'); if (f) f.focus(); }
  }
  function gotoProp(key) {
    UI.inboxTab = 'all';
    var go = function () { var el = document.getElementById('p-' + key.replace(/[^\w-]/g, '_')); if (el) { el.scrollIntoView({ block: 'start' }); el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); } };
    if (location.hash !== '#inbox') { location.hash = '#inbox'; setTimeout(go, 30); } else { rerender(); go(); }
  }
  var ACT = {
    'nav-open': function () { setNav(true); },
    'nav-close': function () { setNav(false); },
    'fill-demo': function () { $('#ad-login-id').value = ACCOUNT.id; $('#ad-login-pw').value = ACCOUNT.pw; $('#ad-login-pw').focus(); },
    logout: function () { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* 무시 */ } showLogin(); },
    reset: function () {
      modal({
        title: '시연 초기화', focus: 0,
        body: '<p>이 브라우저에 저장된 관리자 시연 상태를 지웁니다.</p><ul><li>게시·보류·담당자 지정, 실험 확정(사이트도 처음 상태로)</li><li>이 브라우저의 변경 기록·동의어·자동화 설정·편집 내용</li></ul><p class="ad-small ad-muted">사이트의 장바구니·시연 주문·검색 기록은 그대로 둡니다.</p>',
        buttons: [{ label: '취소', cls: 'ad-btn--line' }, { label: '초기화', cls: 'ad-btn--bad', on: function () { try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ } ST = freshState({}); UI.editing = null; UI.inboxTab = 'pending'; render(); toast('시연 상태를 처음으로 돌렸습니다'); } }]
      });
    },
    'inbox-tab': function (b) { UI.inboxTab = b.getAttribute('data-tab'); UI.editing = null; render(); },
    publish: function (b) { publish(b.getAttribute('data-key')); },
    hold: function (b) { var k = b.getAttribute('data-key'), p = propByKey(k); ST.held[k] = true; addLog('held', p ? p.loop : '보류', '「' + (p ? p.title : k) + '」 보류', null); commit(); rerender(); toast('보류했습니다 — 보류 탭에서 다시 볼 수 있습니다'); },
    unhold: function (b) { var k = b.getAttribute('data-key'); delete ST.held[k]; delete ST.assigned[k]; commit(); rerender(); toast('다시 승인 대기로 옮겼습니다'); },
    undo: function (b) { undo(b.getAttribute('data-key')); },
    edit: function (b) { UI.editing = b.getAttribute('data-key'); rerender(); var t = $('#ad-edit-text'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } },
    'edit-cancel': function () { UI.editing = null; rerender(); },
    'edit-save': function (b) { var k = b.getAttribute('data-key'), t = $('#ad-edit-text'); ST.edits[k] = t.value.trim(); commit(); UI.editing = null; rerender(); toast('고친 초안을 저장했습니다'); },
    'edit-publish': function (b) {
      var k = b.getAttribute('data-key'), t = $('#ad-edit-text'), v = t.value.trim();
      if (!v) { toast('내용을 써 주세요', true); return; }
      if (scan(v).hits.length) { toast('아직 금칙어가 있습니다 — 고친 뒤 게시하세요', true); return; }
      ST.edits[k] = v; publish(k, true);
    },
    'apply-fix': function (b) { var k = b.getAttribute('data-key'), f = SEED.faqDrafts.find(function (x) { return 'faq:' + x.id === k; }); if (!f) return; ST.edits[k] = f.fixed; commit(); rerender(); toast('AI 수정안을 적용했습니다 — 점검 통과 후 게시할 수 있습니다'); },
    assign: function (b) {
      var k = b.getAttribute('data-key'), p = propByKey(k);
      modal({
        title: '담당자에게 넘기기', body: '<p>「' + esc(p.title) + '」는 사람만 쓰는 문장이 들어갑니다. 누구에게 넘길까요?</p><label class="ad-field"><span class="ad-field__label">담당자</span><select class="ad-select" id="ad-assign-to"><option>머니두 운영팀</option><option>전인구 대표</option><option>법률 검토</option></select></label>',
        buttons: [{ label: '취소' }, { label: '넘기기', cls: 'ad-btn--primary', on: function (box) { var to = box.querySelector('#ad-assign-to').value; ST.assigned[k] = { to: to, at: nowIso() }; addLog('held', p.loop, '「' + p.title + '」 담당자 지정 — ' + to, null); commit(); rerender(); toast(to + '에게 넘겼습니다'); } }]
      });
    },
    'exp-b': function (b) { expSet(b.getAttribute('data-exp'), 'B'); },
    'exp-a': function (b) { expSet(b.getAttribute('data-exp'), 'A'); },
    'syn-add': function (b) { addSyn(b.getAttribute('data-q'), b.getAttribute('data-to')); rerender(); toast('동의어를 추가했습니다(자동 등급 — 바로 반영)'); },
    'syn-all': function () { synSuggestions().forEach(function (x) { addSyn(x.q, x.to); }); rerender(); toast('동의어를 모두 추가했습니다'); },
    'syn-ask': function (b) {
      var q = b.getAttribute('data-q'), to = b.getAttribute('data-to') || '';
      modal({
        title: '동의어로 추가', body: '<p>‘' + esc(q) + '’를 검색하면 어떤 말로도 찾을까요?</p><label class="ad-field"><span class="ad-field__label">같이 찾을 말</span><input class="ad-input" id="ad-syn-to" value="' + esc(to) + '" placeholder="예: 미국 주식"></label><p class="ad-small ad-muted">등급 ‘자동’ — 넣는 즉시 반영되고 변경 기록에 남습니다.</p>',
        buttons: [{ label: '취소' }, { label: '추가', cls: 'ad-btn--primary', on: function (box) { var v = box.querySelector('#ad-syn-to').value.trim(); if (!v) { box.querySelector('#ad-syn-to').focus(); return false; } addSyn(q, v); rerender(); toast('‘' + q + '’ → ‘' + v + '’ 동의어 추가'); } }]
      });
    },
    'syn-del': function (b) { undo('syn:' + b.getAttribute('data-q')); },
    'draft-search': function (b) {
      var q = b.getAttribute('data-q');
      if (!hasDraft(q)) { ST.searchDrafts.push({ q: q, at: nowIso() }); addLog('approved', '검색어 학습', '‘' + q + '’ 답변 초안을 승인함에 올림', null); commit(); }
      rerender(); toast('답변 초안을 오늘의 제안에 올렸습니다');
    },
    'ai-filter': function (b) { UI.aiFilter = b.getAttribute('data-f'); rerender(); },
    'log-filter': function (b) { UI.logFilter = b.getAttribute('data-f'); rerender(); },
    'auto-on': function (b) { var id = b.getAttribute('data-id'), on = b.getAttribute('aria-checked') !== 'true'; autoSet(id, { on: on }, on ? '켬' : '끔'); },
    'auto-grade': function (b) { var id = b.getAttribute('data-id'), g = b.getAttribute('data-g'); autoSet(id, { grade: g }, '등급 ' + GRADE[g]); },
    'order-tab': function (b) { UI.orderTab = b.getAttribute('data-tab'); rerender(); },
    refund: function (b) {
      var id = b.getAttribute('data-id');
      modal({
        title: '환불 처리', body: '<p>주문 ' + esc(id) + '의 환불 요청입니다. 환불 기준은 사람만 판단합니다 — 환불 규정을 확인한 뒤 고르세요.</p><p class="ad-small ad-muted">시연: 실제 결제 취소는 일어나지 않습니다.</p>',
        buttons: [{ label: '취소' }, { label: '거절', cls: 'ad-btn--bad', on: function () { ST.orderStatus[id] = 'rejected'; addLog('human', '주문·환불', id + ' 환불 거절', null); commit(); rerender(); toast('환불을 거절했습니다(시연)'); } }, { label: '환불 승인', cls: 'ad-btn--primary', on: function () { ST.orderStatus[id] = 'refunded'; addLog('human', '주문·환불', id + ' 환불 승인', null); commit(); rerender(); toast('환불을 승인했습니다(시연)'); } }]
      });
    },
    'coupon-on': function (b) {
      var code = b.getAttribute('data-code'), on = b.getAttribute('aria-checked') !== 'true';
      var mine = ST.coupons.find(function (c) { return c.code === code; });
      if (mine) mine.on = on; else ST.info['coupon:' + code] = on;
      addLog('human', '쿠폰', code + (on ? ' 켬' : ' 끔'), null); commit(); rerender();
    },
    'coupon-new': function () {
      modal({
        title: '새 쿠폰(시연)', body: '<div class="ad-form"><label class="ad-field"><span class="ad-field__label">코드</span><input class="ad-input" id="cp-code" placeholder="예: WINTER-BOOK" autocapitalize="characters"></label><label class="ad-field"><span class="ad-field__label">이름</span><input class="ad-input" id="cp-name" placeholder="예: 겨울 책 할인"></label><label class="ad-field"><span class="ad-field__label">할인율(%)</span><input class="ad-input" id="cp-val" type="number" min="1" max="50" value="10"></label><label class="ad-field"><span class="ad-field__label">대상</span><select class="ad-select" id="cp-target"><option>정규 강의</option><option>책</option><option>전체</option></select></label></div><p class="ad-small ad-muted">할인은 가격과 같은 사람만 영역입니다. 이 브라우저에만 저장됩니다.</p>',
        buttons: [{ label: '취소' }, { label: '만들기', cls: 'ad-btn--primary', on: function (box) {
          var code = box.querySelector('#cp-code').value.trim().toUpperCase(), name = box.querySelector('#cp-name').value.trim();
          if (!code || !name) { (code ? box.querySelector('#cp-name') : box.querySelector('#cp-code')).focus(); return false; }
          ST.coupons.unshift({ code: code, name: name, kind: 'percent', value: Math.max(1, Math.min(50, +box.querySelector('#cp-val').value || 10)), target: box.querySelector('#cp-target').value, until: '2026-12-31', used: 0, limit: 0, on: true });
          addLog('human', '쿠폰', code + ' 만듦', null); commit(); rerender(); toast('쿠폰을 만들었습니다(시연)');
        } }]
      });
    },
    'course-edit': function (b) {
      var slug = b.getAttribute('data-slug'), c0 = D.courses.find(function (x) { return x.slug === slug; }), c = Object.assign({}, c0, ST.courseEdits[slug] || {});
      modal({
        title: '강의 편집 — ' + c0.title, body: '<div class="ad-form"><label class="ad-field"><span class="ad-field__label">짧은 이름(카드용)</span><input class="ad-input" id="ce-short" value="' + esc(c.short || c.title) + '"></label><label class="ad-field"><span class="ad-field__label">가격(원) ' + icon('lock', 'ad-ico--xs') + ' 사람만</span><input class="ad-input" id="ce-price" type="number" min="0" step="1000" value="' + esc(c.price) + '"><span class="ad-field__hint">AI 자동화는 가격을 바꾸지 않습니다. 이 칸은 담당자 편집입니다.</span></label><label class="ad-field"><span class="ad-field__label">모집 상태</span><select class="ad-select" id="ce-status"><option value="open"' + (c.status === 'open' ? ' selected' : '') + '>판매 중</option><option value="closed"' + (c.status === 'closed' ? ' selected' : '') + '>모집 마감</option><option value="hidden"' + (c.status === 'hidden' ? ' selected' : '') + '>숨김</option></select></label></div><p class="ad-small ad-muted">저장은 이 브라우저에만 됩니다. 사이트 반영은 운영 단계(그때 구조화 데이터·llms.txt 같이 갱신).</p>',
        buttons: [{ label: '취소' }, { label: '저장(시연)', cls: 'ad-btn--primary', on: function (box) {
          var e = {}, sh = box.querySelector('#ce-short').value.trim(), pr = +box.querySelector('#ce-price').value, stt = box.querySelector('#ce-status').value;
          if (sh && sh !== (c0.short || c0.title)) e.short = sh;
          if (!isNaN(pr) && pr !== c0.price) e.price = pr;
          if (stt !== c0.status) e.status = stt;
          if (Object.keys(e).length) ST.courseEdits[slug] = e; else delete ST.courseEdits[slug];
          addLog('human', '강의', c0.title + ' 편집(시연)', null); commit(); rerender(); toast('저장했습니다 — 사이트 반영은 운영 단계');
        } }]
      });
    },
    'book-edit': function (b) {
      var slug = b.getAttribute('data-slug'), b0 = D.books.find(function (x) { return x.slug === slug; }), bk = Object.assign({}, b0, ST.bookEdits[slug] || {});
      modal({
        title: '책 편집 — ' + b0.title, body: '<div class="ad-form"><label class="ad-field"><span class="ad-field__label">판매가(원) ' + icon('lock', 'ad-ico--xs') + ' 사람만</span><input class="ad-input" id="be-price" type="number" min="0" step="100" value="' + esc(bk.price) + '"></label><label class="ad-field"><span class="ad-field__label">판매</span><select class="ad-select" id="be-sale"><option value="1"' + (bk.sale ? ' selected' : '') + '>판매 중</option><option value="0"' + (bk.sale ? '' : ' selected') + '>판매 중지</option></select></label></div><p class="ad-small ad-muted">이 브라우저에만 저장됩니다.</p>',
        buttons: [{ label: '취소' }, { label: '저장(시연)', cls: 'ad-btn--primary', on: function (box) {
          var e = {}, pr = +box.querySelector('#be-price').value, sale = box.querySelector('#be-sale').value === '1';
          if (!isNaN(pr) && pr !== b0.price) e.price = pr;
          if (sale !== b0.sale) e.sale = sale;
          if (Object.keys(e).length) ST.bookEdits[slug] = e; else delete ST.bookEdits[slug];
          addLog('human', '책·굿즈', b0.title + ' 편집(시연)', null); commit(); rerender(); toast('저장했습니다 — 사이트 반영은 운영 단계');
        } }]
      });
    },
    'event-new': function () {
      modal({ title: '새 특강 등록', body: '<p>특강 일정·장소·가격은 머니두 운영팀이 정합니다. 데모에서는 등록 화면만 보여 줍니다.</p><p class="ad-small ad-muted">운영 단계: 등록하면 ‘상품 신선도’ 자동화가 날짜가 지나는 다음 날 06시에 자동으로 지난 특강으로 옮깁니다.</p>', buttons: [{ label: '닫기', cls: 'ad-btn--primary' }] });
    },
    'inq-send': function (b) { var id = b.getAttribute('data-id'); ST.inqSent[id] = nowIso(); addLog('human', '문의', id + ' 답변 보냄(시연)', null); commit(); rerender(); toast('답변을 보냈습니다(시연)'); },
    'inq-send-human': function (b) { var id = b.getAttribute('data-id'); ST.inqSent[id] = nowIso(); addLog('human', '문의', id + ' 담당자 확인 후 답변(시연)', null); commit(); rerender(); toast('담당자 확인 후 보냈습니다(시연)'); },
    review: function (b) { var id = b.getAttribute('data-id'), s = b.getAttribute('data-s'); ST.reviewStatus[id] = s; addLog('human', '후기', id + (s === 'shown' ? ' 공개' : ' 숨김'), null); commit(); rerender(); },
    'home-on': function (b) { var id = b.getAttribute('data-id'); var list = homeOrder(); list.forEach(function (s) { if (s.id === id) s.on = !s.on; }); ST.homeOrder = list.map(function (s) { return { id: s.id, on: s.on }; }); commit(); rerender(); },
    'home-mv': function (b) { var id = b.getAttribute('data-id'), d = +b.getAttribute('data-d'); var list = homeOrder(); var i = list.findIndex(function (s) { return s.id === id; }), j = i + d; if (j < 0 || j >= list.length) return; var t = list[i]; list[i] = list[j]; list[j] = t; ST.homeOrder = list.map(function (s) { return { id: s.id, on: s.on }; }); commit(); rerender(); var nb = $('[data-act="home-mv"][data-id="' + id + '"][data-d="' + d + '"]'); if (nb && !nb.disabled) nb.focus(); },
    'goto-prop': function (b, e) { e.preventDefault(); gotoProp(b.getAttribute('data-key')); },
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-act');
    if (b.tagName === 'SELECT') return;
    if (ACT[a]) { if (b.tagName === 'BUTTON') e.preventDefault(); ACT[a](b, e); }
  });
  document.addEventListener('change', function (e) {
    var s = e.target.closest('[data-act="auto-when"]');
    if (s) autoSet(s.getAttribute('data-id'), { when: s.value }, '실행 ' + s.value);
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'ad-edit-text') { var live = $('#ad-edit-live'); if (live) live.innerHTML = checkBox(e.target.value); }
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id === 'info-form') {
      e.preventDefault();
      var o = {}; $$('input', e.target).forEach(function (i) { if (i.value !== (D.site[i.name] || '')) o[i.name] = i.value; });
      ST.info.site = Object.keys(o).length ? o : undefined;
      addLog('human', '기본 정보', '회사 정보 편집(시연)', null); commit(); rerender(); toast('저장했습니다 — 사이트 반영은 운영 단계');
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#ad-app').classList.contains('nav-open')) setNav(false); });
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === MISS_KEY || e.key === ORDERS_KEY) { if (e.key === KEY) ST = freshState(load(KEY, {})); if (!$('#ad-app').hidden) rerender(); } });

  // ── 로그인 ──
  function loggedIn() { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; } }
  function showLogin() {
    $('#ad-app').hidden = true; $('#ad-login').hidden = false;
    document.title = '관리자 로그인 | 애덤스미스';
    setTimeout(function () { $('#ad-login-id').focus(); }, 0);
  }
  function showApp() {
    $('#ad-login').hidden = true; $('#ad-app').hidden = false;
    buildNav();
    if (!location.hash) history.replaceState(null, '', '#inbox');
    route();
  }
  $('#ad-login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('#ad-login-id').value.trim(), pw = $('#ad-login-pw').value, err = $('#ad-login-err');
    if (id !== ACCOUNT.id || pw !== ACCOUNT.pw) { err.textContent = '아이디 또는 비밀번호가 맞지 않습니다. 예시 계정은 moneydo / demo1234 입니다.'; err.hidden = false; return; }
    err.hidden = true;
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (er) { /* 무시 */ }
    ready.then(showApp);
  });

  // ── 시작 ──
  ST = freshState(load(KEY, {}));
  var ready = Promise.all([
    fetch('data.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('data.json ' + r.status); return r.json(); }),
    fetch('seed.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('seed.json ' + r.status); return r.json(); }),
  ]).then(function (res) {
    D = res[0]; SEED = res[1];
    ['videos', 'answers', 'courses', 'books', 'goods', 'events', 'faq', 'changelog', 'rules'].forEach(function (k) { if (!Array.isArray(D[k])) D[k] = []; });
    D.site = D.site || {};
  }).catch(function (err) {
    $('#ad-main').innerHTML = '<div class="ad-empty">관리자 데이터를 불러오지 못했습니다(' + esc(err.message) + '). 빌드 후 docs/admin/data.json 이 있는지 확인하세요.</div>';
    throw err;
  });
  if (loggedIn()) ready.then(showApp).catch(function () { $('#ad-login').hidden = true; $('#ad-app').hidden = false; });
  else showLogin();

  // ── 연결 고리: 뒤에 실리는 스크립트(funnel.js 등)가 메뉴·화면·동작·제안을 더한다 ──
  // 메뉴는 로그인 뒤에 그리므로 MENU 에 넣으면 보인다. 상태·데이터는 바뀔 수 있어 함수로 넘긴다.
  window.AdminKit = {
    VIEWS: VIEWS, MENU: MENU, ACT: ACT, $: $, $$: $$, esc: esc, num: num, pct: pct, icon: icon, EX: EX, site: site, hm: hm,
    head: head, modal: modal, toast: toast, commit: commit, addLog: addLog, rerender: rerender, scan: scan,
    lineChart: lineChart, barChart: barChart, buildNav: buildNav, route: route,
    after: function (f) { AFTER.push(f); }, state: function () { return ST; }, data: function () { return D; }, seed: function () { return SEED; },
    extraProps: []
  };
})();
