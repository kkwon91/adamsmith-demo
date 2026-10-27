/* 퍼널·이탈·유입 출처 + 이탈 차단 전략 — 관리자 데모(admin.js 다음에 싣는다. window.AdminKit 을 쓴다).
   읽는 것
     · 이 브라우저의 실제 방문 기록: localStorage 'adamsmith.events.v1'(사이트 05-track.js 가 남김 — 형식의 정본)
     · 예시 방문 기록: 이 파일이 씨앗 고정 난수로 즉석에서 만든다(매번 같은 결과, 화면에 '예시' 표시). 형식은 05-track.js 와 똑같다.
     · data.json 의 playbook(이탈 차단 사례 — sources/funnel_playbook.json 을 빌드가 넣는다. 없으면 빈 배열)
   쓰는 것(관리자 상태 adamsmith.admin.v1 안의 키)
     · expRun{ '<실험 id>': { start, from, playbook } } — 사이트 05-track.js 가 읽어 방문자를 A·B 반반으로 나눈다(키 이름 고정)
     · exp{ '<실험 id>': 'B' } — 확정(사이트 모두 B) · expDone{} 끝난 실험 기록 · funnels[] 직접 만든 퍼널 · playbookTodo{} 운영 단계 작업 목록
   계산은 한 갈래: 예시 기록과 내 기록을 같은 방식으로 방문(세션)별로 묶고, 같은 방문 안에서 순서대로 일어난 단계만 센다. */
(function () {
  'use strict';
  var K = window.AdminKit;
  if (!K) return;
  var esc = K.esc, num = K.num, icon = K.icon, EX = K.EX;
  var EV_KEY = 'adamsmith.events.v1';
  var DAY = 864e5;

  // ── 출처(05-track.js 의 SOURCES 표와 같은 id·이름) ──
  var SRC = {
    'yt-desc': '유튜브 설명란', 'yt-pin': '유튜브 고정 댓글', 'yt-community': '유튜브 커뮤니티', 'yt-other': '유튜브(기타)',
    kakao: '카카오톡 채널', telegram: '텔레그램', instagram: '인스타그램', 'naver-premium': '네이버 프리미엄',
    'naver-search': '네이버 검색', google: '구글 검색', 'ai-chatgpt': 'ChatGPT', 'ai-perplexity': 'Perplexity', 'ai-gemini': 'Gemini', 'ai-naver': '네이버 AI 브리핑',
    direct: '직접 방문', other: '기타 사이트'
  };
  var GROUPS = [
    { id: 'yt', name: '유튜브', src: ['yt-desc', 'yt-pin', 'yt-community', 'yt-other'] },
    { id: 'social', name: '메신저·SNS', src: ['kakao', 'telegram', 'instagram', 'naver-premium'] },
    { id: 'search', name: '검색', src: ['naver-search', 'google'] },
    { id: 'ai', name: 'AI 답변', src: ['ai-chatgpt', 'ai-perplexity', 'ai-gemini', 'ai-naver'] },
    { id: 'etc', name: '직접·기타', src: ['direct', 'other'] }
  ];
  var GROUP_OF = {};
  GROUPS.forEach(function (g) { g.src.forEach(function (s) { GROUP_OF[s] = g.id; }); });
  function groupOf(src) { return GROUP_OF[src] || 'etc'; }
  function groupName(id) { var g = GROUPS.find(function (x) { return x.id === id; }); return g ? g.name : id; }
  function srcName(id) { return SRC[id] || id || '알 수 없음'; }

  // ── 데이터 도우미 ──
  function D() { return K.data(); }
  function course(slug) { return (D().courses || []).find(function (c) { return c.slug === slug; }); }
  function courseKind(slug) { var c = course(slug); return c ? c.kind : ''; }
  function courseName(slug) { var c = course(slug); return c ? (c.short || c.title) : slug; }
  function slugOf(p, base) { var m = new RegExp('^/' + base + '/([^/]+)/$').exec(p || ''); return m ? m[1] : ''; }
  function pageKind(p) {
    p = p || '';
    if (p === '/') return 'home';
    if (p === '/classes/') return 'classes';
    var c = slugOf(p, 'classes');
    if (c) { var k = courseKind(c); return k === '구독' ? 'course-sub' : k === '정규' ? 'course-reg' : k === '무료' ? 'course-free' : 'course'; }
    if (p === '/membership/') return 'membership';
    if (p === '/books/') return 'books';
    if (slugOf(p, 'books')) return 'book';
    if (p === '/videos/') return 'videos';
    if (slugOf(p, 'videos')) return 'video';
    if (p === '/answers/') return 'answers';
    if (slugOf(p, 'answers')) return 'answer';
    if (p === '/start/') return 'start';
    if (p === '/cart/') return 'cart';
    if (p === '/checkout/') return 'checkout';
    if (p === '/my/') return 'my';
    return 'other';
  }
  function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function pageName(p) {
    var k = pageKind(p), d = D(), s;
    if (k === 'home') return '홈';
    if (k === 'classes') return '강의 목록';
    if (/^course/.test(k)) return '강의 · ' + courseName(slugOf(p, 'classes'));
    if (k === 'membership') return '구독반 비교';
    if (k === 'books') return '책 목록';
    if (k === 'book') { s = slugOf(p, 'books'); var b = (d.books || []).find(function (x) { return x.slug === s; }); return '책 · ' + (b ? b.title : s); }
    if (k === 'videos') return '영상 정리 목록';
    if (k === 'video') { s = slugOf(p, 'videos'); var v = (d.videos || []).find(function (x) { return x.id === s; }); return '영상 정리 · ' + cut(v ? v.title : s, 22); }
    if (k === 'answers') return '질문 답변 목록';
    if (k === 'answer') { s = slugOf(p, 'answers'); var a = (d.answers || []).find(function (x) { return x.slug === s; }); return '답변 · ' + cut(a ? a.q : s, 22); }
    if (k === 'start') return '2분 진단';
    if (k === 'cart') return '장바구니';
    if (k === 'checkout') return '결제 화면';
    if (k === 'my') return '내 강의실';
    return p;
  }
  // 구간 이름 다듬기: 첫 칸은 '맨 위', '커리큘럼 지금 열린 차시'(구독반)는 '커리큘럼', 제목 없는 진단 칸은 '진단 질문'
  function secName(n, i, p) {
    n = String(n || '');
    if (i === 0) return '맨 위';
    if (/^커리큘럼/.test(n)) return '커리큘럼';
    if (p === '/start/' && /^구간 \d/.test(n)) return '진단 질문';
    return n;
  }

  // ── 단계 목록(퍼널 만들기에서 고르는 것) — 쪽 경로 규칙 또는 이벤트 종류(+조건) ──
  function isSub(x) { return x.type === 'course' && courseKind(x.slug) === '구독'; }
  function isReg(x) { return x.type === 'course' && courseKind(x.slug) === '정규'; }
  var STEPS = {
    any: { name: '아무 쪽 도착', ev: 'start' }, // 방문 시작(첫 쪽) — 같은 쪽이 다음 단계(예: 구독반 상세)도 될 수 있게 쪽 보기가 아니라 시작 기록으로 센다
    home: { name: '홈', pv: function (p) { return p === '/'; } },
    classes: { name: '강의 목록', pv: function (p) { return p === '/classes/'; } },
    course: { name: '강의 상세', pv: function (p) { return /^course/.test(pageKind(p)); } },
    'course-sub': { name: '구독반 상세', pv: function (p) { return pageKind(p) === 'course-sub'; } },
    'course-reg': { name: '정규 강의 상세', pv: function (p) { return pageKind(p) === 'course-reg'; } },
    'course-free': { name: '무료 강의 상세', pv: function (p) { return pageKind(p) === 'course-free'; } },
    membership: { name: '구독반 비교', pv: function (p) { return p === '/membership/'; } },
    books: { name: '책 목록', pv: function (p) { return p === '/books/'; } },
    book: { name: '책 상세', pv: function (p) { return pageKind(p) === 'book'; } },
    videos: { name: '영상 정리 목록', pv: function (p) { return p === '/videos/'; } },
    video: { name: '영상 정리 쪽', pv: function (p) { return pageKind(p) === 'video'; } },
    answer: { name: '질문 답변 쪽', pv: function (p) { return pageKind(p) === 'answer'; } },
    start: { name: '2분 진단 쪽', pv: function (p) { return p === '/start/'; } },
    'finder-done': { name: '진단 완료', ev: 'finder_done' },
    'finder-add': { name: '진단 결과에서 담기', ev: 'finder_add' },
    add: { name: '담기', ev: 'cart_add' },
    'add-course': { name: '담기(강의)', ev: 'cart_add', cond: function (x) { return x.type === 'course'; } },
    'add-sub': { name: '담기·구독 시작', ev: 'cart_add', cond: isSub },
    'add-reg': { name: '담기(정규 강의)', ev: 'cart_add', cond: isReg },
    'add-book': { name: '담기(책)', ev: 'cart_add', cond: function (x) { return x.type === 'book' || x.type === 'goods'; } },
    'buy-now': { name: '바로 결제', ev: 'buy_now' },
    cart: { name: '장바구니', pv: function (p) { return p === '/cart/'; } },
    checkout: { name: '결제 화면', pv: function (p) { return p === '/checkout/'; } },
    purchase: { name: '결제 완료', ev: 'purchase' },
    'out-yt': { name: '유튜브로 나감', ev: 'out_yt' }
  };
  // 고르는 상자에 보이는 순서
  var STEP_ORDER = ['any', 'home', 'classes', 'course', 'course-sub', 'course-reg', 'course-free', 'membership', 'books', 'book', 'videos', 'video', 'answer', 'start', 'finder-done', 'finder-add',
    'add', 'add-course', 'add-sub', 'add-reg', 'add-book', 'buy-now', 'cart', 'checkout', 'purchase', 'out-yt'];
  function stepName(id) { return STEPS[id] ? STEPS[id].name : id; }
  function matchStep(id, e) {
    var s = STEPS[id];
    if (!s) return false;
    if (s.pv) return e.e === 'pv' && s.pv(e.p);
    return e.e === s.ev && (!s.cond || s.cond(e.x || {}));
  }

  // ── 기본 퍼널 6개 ──
  var PRESET = [
    { id: 'f-sub', no: '①', name: '구독반 결제', steps: ['any', 'course-sub', 'add-sub', 'checkout', 'purchase'], desc: '어느 쪽으로 들어왔든 → 구독반 상세(2026 실전 투자반·판교불패) → 담기·구독 시작 → 결제 화면 → 결제 완료' },
    { id: 'f-reg', no: '②', name: '정규 강의 결제', steps: ['course-reg', 'add-reg', 'checkout', 'purchase'], desc: '정규 강의 상세(왕초보 주식투자·양자컴퓨터 정규) → 담기 → 결제 화면 → 결제 완료' },
    { id: 'f-finder', no: '③', name: '2분 진단 → 결제', steps: ['start', 'finder-done', 'finder-add', 'checkout', 'purchase'], desc: '2분 진단 쪽 → 진단 완료 → 결과에서 담기 → 결제 화면 → 결제 완료' },
    { id: 'f-book', no: '④', name: '책 구매', steps: ['book', 'add-book', 'checkout', 'purchase'], desc: '책 상세 → 담기 → 결제 화면 → 결제 완료' },
    { id: 'f-video', no: '⑤', name: '영상 정리 → 강의', steps: ['video', 'course', 'add-course', 'purchase'], desc: '영상 정리 쪽 → 강의 상세 → 담기 → 결제 완료' },
    { id: 'f-answer', no: '⑥', name: '검색·AI 답변 → 강의', steps: ['answer', 'course', 'add-course', 'purchase'], desc: '질문 답변 쪽 → 강의 상세 → 담기 → 결제 완료' }
  ];

  // ── 사이트의 B안 조각 실험 4개(P.expB) ──
  var EXPS = {
    'exp-curriculum-summary': {
      name: '커리큘럼 5단계 요약', page: '/classes/beginner-stock/', where: '왕초보 주식투자 상세 — 커리큘럼 표 위', metric: '담기', stage: '강의 상세',
      a: '30강 차시 표가 바로 나옵니다(지금 모습).',
      b: '커리큘럼 표 위에 ‘한눈에 보는 5단계 구성’(단계 이름 5개 · 30강 · 수강 기간)을 먼저 보여 주고, 전체 차시는 그 아래 표에서 펼쳐 봅니다.'
    },
    'exp-checkout-cancel': {
      name: '결제 단추 아래 해지 안내', page: '/checkout/', where: '결제 화면 — 결제 단추 바로 아래', metric: '결제 완료', stage: '구독 결제',
      a: '해지 방법은 고객센터·약관 쪽에서 찾아야 합니다(지금 모습).',
      b: '결제 단추 바로 아래에 ‘구독반을 담으셨다면 — 내 강의실에서 언제든 해지할 수 있고, 해지하면 다음 결제일부터 결제되지 않습니다.’ 한 줄을 둡니다.'
    },
    'exp-answer-cta': {
      name: '답변 아래 이어지는 강의 띠', page: '/answers/where-to-watch/', where: '질문 답변 쪽 — 답변 문단 바로 아래', metric: '강의 상세로 이동', stage: '콘텐츠→강의',
      a: '관련 강의는 쪽 아래쪽 ‘관련 강의’ 칸에만 있습니다(지금 모습).',
      b: '답변 문단 바로 아래에 ‘이 질문과 이어지는 강의’ 띠(강의 이름·가격·바로 가기)를 둡니다.'
    },
    'exp-video-cta': {
      name: '장 목차 위 이어지는 강의 띠', page: '/videos/QFmkNcRdk0g/', where: '영상 정리 쪽 — 장 목차 바로 위', metric: '강의 상세로 이동', stage: '콘텐츠→강의',
      a: '이어서 볼 강의는 장 목차 아래 ‘이어서 볼 강의·책’ 칸에 있습니다(지금 모습).',
      b: '장 목차 바로 위에 ‘이 영상과 이어지는 강의’ 띠(강의 이름·가격·바로 가기)를 둡니다.'
    }
  };
  // 7일 결과 미리 보기(예시) — 실제 실험 결과가 아니다. 판정 기준은 문구 실험과 같다(두 안 노출 1,000회·기준 행동 100회 이상이면 표본 충분)
  var PREVIEW = {
    'exp-curriculum-summary': { A: { views: 1184, hits: 132 }, B: { views: 1171, hits: 171 } },
    'exp-checkout-cancel': { A: { views: 1036, hits: 318 }, B: { views: 1052, hits: 389 } },
    'exp-answer-cta': { A: { views: 1342, hits: 168 }, B: { views: 1318, hits: 236 } },
    'exp-video-cta': { A: { views: 2210, hits: 302 }, B: { views: 2188, hits: 371 } }
  };
  // 퍼널의 한 단계(from → to)에 맞는 B안 조각
  function expForTr(from, to) {
    if (from === 'course-reg' && /^add/.test(to)) return 'exp-curriculum-summary';
    if (from === 'checkout' && to === 'purchase') return 'exp-checkout-cancel';
    if (from === 'answer') return 'exp-answer-cta';
    if (from === 'video') return 'exp-video-cta';
    return null;
  }
  // 퍼널의 한 단계 → 이탈 차단 사례의 단계 이름(앞이 더 맞는 것)
  function pbStageOf(R, t) {
    var from = t.from, subFunnel = R.f.steps.some(function (s) { return s === 'course-sub' || s === 'add-sub'; });
    if (from === 'checkout') return subFunnel ? ['구독 결제', '장바구니·결제'] : ['장바구니·결제', '구독 결제'];
    if (from === 'cart' || /^add|buy-now/.test(from)) return ['장바구니·결제', '이탈 직전·후'];
    if (/^course/.test(from) || from === 'book') return ['강의 상세', '이탈 직전·후'];
    if (from === 'video' || from === 'answer' || from === 'videos') return ['콘텐츠→강의', '유입 맞춤'];
    if (from === 'start' || /^finder/.test(from)) return ['무료→유료', '이탈 직전·후'];
    if (from === 'any' || from === 'home') return ['유입 맞춤', '이탈 직전·후'];
    return ['이탈 직전·후'];
  }

  // ── 씨앗 고정 난수 ──
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ── 예시 방문 기록 만들기 ──
  // 출처별 14일 방문 수(합 약 7,200) · 출처별 '의지' 배수(담기·결제·강의로 넘어갈 확률에 곱함)
  var VOL = { 'yt-desc': 1900, 'yt-pin': 480, 'yt-community': 260, 'yt-other': 420, kakao: 520, telegram: 260, instagram: 220, 'naver-premium': 180, 'naver-search': 900, google: 400, 'ai-chatgpt': 190, 'ai-perplexity': 70, 'ai-gemini': 55, 'ai-naver': 115, direct: 1000, other: 230 };
  var INTENT = { 'yt-pin': 1.2, 'yt-community': 1.15, 'yt-other': 0.8, kakao: 1.2, telegram: 1.0, instagram: 0.65, 'naver-premium': 1.2, 'naver-search': 0.55, google: 0.8, 'ai-chatgpt': 1.9, 'ai-perplexity': 2.0, 'ai-gemini': 1.9, 'ai-naver': 1.6, direct: 1.0, other: 0.7 };
  var COURSE_W = { 'practical-2026': 3, pangyo: 1.6, 'beginner-stock': 2.6, quantum: 1.0, 'quantum-free': 0.8, 'superant-park': 0.4, 'yangyang-videos': 0.3, 'kids-economy': 0.5, 'offline-qa-2026h2': 0.5 };
  var ANS_SEARCH = { sidecar: 3, 'fx-rise': 3, 'bond-price-rates': 2.5, 'who-is-jeoningu': 1.5, 'kids-economy': 1.2, 'where-to-watch': 1.2, pangyo: 0.8, 'practical-2026-price': 0.6, 'brand-names': 0.6, 'my-classroom': 0.6, devices: 0.5, 'cancel-subscription': 0.5, 'store-course': 0.4 };
  var ANS_AI = { 'where-to-watch': 3, 'practical-2026-price': 2.5, pangyo: 2, 'who-is-jeoningu': 2, 'store-course': 1, 'cancel-subscription': 1, 'brand-names': 1, sidecar: 0.8, 'fx-rise': 0.6, 'kids-economy': 0.5, 'bond-price-rates': 0.5, 'my-classroom': 0.5, devices: 0.4 };
  // 쪽 종류별 구간(사이트에서 실제로 잡히는 이름 그대로)
  var SECS = {
    home: ['맨 위', '이번 주 영상이 다룬 것', '무엇이 궁금해서 오셨나요?', '지금 들을 수 있는 강의', '우리가 하지 않는 것부터 말씀드립니다', '교실에서 시작한 경제 수업', '책으로 먼저 시작하기', '공식 채널은 이 여섯 곳입니다', '처음 오신 분들이 많이 묻습니다', '무엇부터 들을지 모르겠다면'],
    classes: ['맨 위', '강의 목록', '강의별 가격과 기간', '구독반과 오프라인 특강', '강의를 고르기 전에'],
    'course-reg': ['맨 위', '소개', '핵심 정보', '이런 분께 맞습니다', '커리큘럼', '강사', '먼저 볼 무료 영상·관련 책', '수강 방법과 환불', '자주 묻는 질문'],
    'course-sub': ['맨 위', '소개', '핵심 정보', '이런 분께 맞습니다', '구독하면 받는 것', '커리큘럼 지금 열린 차시', '강사', '먼저 볼 무료 영상·관련 책', '수강 방법과 환불', '자주 묻는 질문'],
    'course-free': ['맨 위', '소개', '핵심 정보', '이런 분께 맞습니다', '커리큘럼', '강사', '함께 보면 좋은 책·강의', '수강 방법과 환불', '자주 묻는 질문'],
    membership: ['맨 위', '여기서 결제하는 구독반 두 가지', '구독반과 다른 유료 채널 비교', '유튜브 멤버십 · 네이버 프리미엄 콘텐츠', '구독 전에 많이 묻는 것'],
    books: ['맨 위', '판매 중인 책', '전인구 대표가 쓴 책', '책 주문 전에 많이 묻습니다'],
    book: ['맨 위', '책 정보', '책 소개', '이 책과 이어지는 강의', '이 책에 대해 많이 묻습니다', '함께 읽으면 좋은 책'],
    videos: ['맨 위', '편집팀 확인을 기다리는 정리', '주제별로 보기', '정리된 영상 전체'],
    video: ['맨 위', '장 목차', '이어서 볼 강의·책', '다른 영상 정리', '정리 출처'],
    answers: ['맨 위', '강의·구독·이용 안내', '영상에 나온 경제 개념'],
    answer: ['맨 위', '근거', '관련 강의', '정리 출처'],
    start: ['맨 위', '구간 2', '목적별 공부 길 바로 보기'],
    cart: ['맨 위', '담은 항목'],
    checkout: ['맨 위', '주문 내용', '결제 수단', '확인'],
    my: ['맨 위', '수강 중인 강의']
  };
  // 나간 사람의 마지막 구간 비중(구간 순서대로) — 이야기 (가)(나)(다)가 여기서 나온다
  var EXIT_W = {
    'course-reg': [9, 8, 12, 7, 50, 5, 4, 4, 3],
    'course-sub': [14, 12, 15, 9, 17, 12, 6, 7, 5, 3],
    'course-free': [16, 12, 14, 10, 22, 8, 7, 6, 5],
    'checkout-sub': [8, 16, 26, 50],
    checkout: [26, 34, 24, 16],
    'answer-search': [34, 54, 8, 4],
    answer: [22, 44, 24, 10],
    video: [16, 47, 15, 14, 8],
    book: [18, 22, 30, 14, 10, 6],
    start: [40, 52, 8],
    cart: [32, 68],
    home: [30, 18, 12, 12, 6, 6, 5, 4, 4, 3]
  };

  function genExample() {
    var d = D();
    var R = mulberry32(20261020);
    var rnd = function () { return R(); };
    var pickW = function (list) {
      var tot = 0, i;
      for (i = 0; i < list.length; i++) tot += list[i][1];
      var x = rnd() * tot;
      for (i = 0; i < list.length; i++) { x -= list[i][1]; if (x < 0) return list[i][0]; }
      return list[list.length - 1][0];
    };
    var pickObj = function (o, allowed) { return pickW(Object.keys(o).filter(function (k) { return !allowed || allowed[k]; }).map(function (k) { return [k, o[k]]; })); };
    var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    var openCourses = (d.courses || []).filter(function (c) { return c.status === 'open' && c.kind !== '기업'; });
    var byKind = function (k) { var o = {}; openCourses.filter(function (c) { return c.kind === k; }).forEach(function (c) { o[c.slug] = COURSE_W[c.slug] || 0.4; }); return o; };
    var allCW = {}; openCourses.forEach(function (c) { allCW[c.slug] = COURSE_W[c.slug] || 0.4; });
    var subW = byKind('구독'), regW = byKind('정규'), freeW = byKind('무료');
    var books = (d.books || []).filter(function (b) { return b.sale; });
    var bookW = {}; books.forEach(function (b, i) { bookW[b.slug] = 3 / (1 + i * 0.35); });
    var ansOk = {}; (d.answers || []).forEach(function (a) { if (a.status !== 'pending') ansOk[a.slug] = true; });
    var vids = (d.videos || []).slice();
    var vidOk = {}; vids.forEach(function (v) { vidOk[v.id] = true; });
    var hasW = function (o) { return Object.keys(o).length > 0; };
    var cPath = function (slug) { return '/classes/' + slug + '/'; };
    var anyCourse = function () { return cPath(pickObj(allCW)); };
    var kindCourse = function (o) { return cPath(pickObj(hasW(o) ? o : allCW)); };
    var aBook = function () { return books.length ? '/books/' + pickObj(bookW) + '/' : '/books/'; };
    var aVideo = function () { return vids.length ? '/videos/' + vids[Math.floor(rnd() * Math.min(vids.length, 10))].id + '/' : '/videos/'; };
    var anAnswer = function (w) { var ok = {}; Object.keys(w).forEach(function (k) { if (ansOk[k]) ok[k] = 1; }); return hasW(ok) ? '/answers/' + pickObj(w, ok) + '/' : '/answers/'; };
    var vidCourse = function (v) {
      var rel = ((v && v.related && v.related.courses) || []).filter(function (s) { var c = course(s); return c && c.status === 'open' && c.kind !== '기업'; });
      return rel.length ? cPath(rel[Math.floor(rnd() * rel.length)]) : anyCourse();
    };
    var ansCourse = function (slug) {
      if (course(slug) && course(slug).kind !== '기업') return cPath(slug);
      if (/practical|cancel/.test(slug)) return cPath('practical-2026');
      return cPath(pickW([['beginner-stock', 3], ['practical-2026', 3], ['pangyo', 1.5], ['quantum', 0.7]]));
    };
    // 영상별 결제 의지(관련 강의 + 영상마다 다른 값) — 이야기 (마)
    var vidF = {};
    vids.forEach(function (v) {
      var rel = (v.related && v.related.courses) || [];
      var base = rel.indexOf('beginner-stock') >= 0 ? 1.35 : rel.indexOf('practical-2026') >= 0 ? 1.15 : rel.indexOf('pangyo') >= 0 ? 0.85 : 0.5;
      vidF[v.id] = base * (0.4 + 1.2 * ((hashStr(v.id) % 1000) / 1000));
    });

    // 날짜: buildDate 까지 14일(한국 시각)
    var endDay = Date.parse(d.buildDate + 'T00:00:00+09:00');
    var day0 = endDay - 13 * DAY;
    var HOURS = [2, 1, 0.6, 0.4, 0.3, 0.4, 1, 2, 3, 3.5, 3.5, 4, 5, 4.5, 3.8, 3.6, 3.8, 4, 4.5, 5, 6, 7, 6.5, 4];
    var dayW = [];
    for (var di = 0; di < 14; di++) { var wd = new Date(day0 + di * DAY + 9 * 3600e3).getUTCDay(); dayW.push((wd === 0 || wd === 6 ? 0.86 : 1) * (0.9 + rnd() * 0.2)); }
    var timeOn = function (di) { var h = pickW(HOURS.map(function (w, i) { return [i, w]; })); return day0 + di * DAY + h * 3600e3 + Math.floor(rnd() * 3600e3); };
    var dayPick = function () { return pickW(dayW.map(function (w, i) { return [i, w]; })); };

    // 방문 목록 [src, camp, t]
    var plan = [];
    Object.keys(VOL).forEach(function (src) {
      if (src === 'yt-desc' || src === 'yt-pin') return;
      for (var i = 0; i < VOL[src]; i++) plan.push([src, '', timeOn(dayPick())]);
    });
    // 유튜브 설명란·고정 댓글: 영상 조회수에 비례, 올린 날부터 빠르게 줄어든다
    var totViews = vids.reduce(function (s, v) { return s + (v.views || 0); }, 0) || 1;
    ['yt-desc', 'yt-pin'].forEach(function (src) {
      vids.forEach(function (v) {
        var n = Math.round(VOL[src] * (v.views || 0) / totViews);
        var up = Math.max(0, Math.round((Date.parse(String(v.date || d.buildDate) + 'T00:00:00+09:00') - day0) / DAY));
        var w = [];
        for (var k = up; k < 14; k++) w.push([k, Math.pow(0.6, k - up)]);
        if (!w.length) w.push([13, 1]);
        for (var i = 0; i < n; i++) plan.push([src, v.id, timeOn(pickW(w))]);
      });
    });
    plan.sort(function (a, b) { return a[2] - b[2]; });

    var out = [], vidSeq = 0, visitors = [];
    var newId = function (p) { return p + (++vidSeq).toString(36) + '-' + Math.floor(rnd() * 46656).toString(36); };
    plan.forEach(function (pl, si) {
      var src = pl[0], camp = pl[1], t = pl[2];
      var v = visitors.length > 30 && rnd() < 0.18 ? visitors[Math.floor(rnd() * visitors.length)] : newId('x');
      visitors.push(v);
      var sid = 'ex' + si.toString(36);
      var video = camp ? vids.find(function (x) { return x.id === camp; }) : null;
      var I = src === 'yt-desc' ? (video ? vidF[video.id] : 1) : (INTENT[src] || 1);
      if (src === 'yt-pin' && video) I *= 0.6 + 0.4 * vidF[video.id];
      var ctx = { src: src, I: I, cart: [], paid: false, search: src === 'naver-search' || src === 'google', ai: /^ai-/.test(src), video: video };
      // 첫 쪽
      var land;
      if (src === 'yt-desc') land = pickW([[video ? '/videos/' + video.id + '/' : aVideo(), 46], ['/', 22], [vidCourse(video), 20], ['/start/', 6], [aBook(), 6]]);
      else if (src === 'yt-pin') land = pickW([[vidCourse(video), 42], [video ? '/videos/' + video.id + '/' : aVideo(), 36], ['/', 22]]);
      else if (src === 'yt-community') land = pickW([[cPath('practical-2026'), 25], ['/membership/', 20], ['/', 40], [cPath('pangyo'), 15]]);
      else if (src === 'yt-other') land = pickW([['/', 55], ['/videos/', 20], [aVideo(), 25]]);
      else if (src === 'kakao') land = pickW([[cPath('practical-2026'), 20], [cPath('pangyo'), 10], ['/', 35], [aBook(), 12], ['/start/', 11], [cPath('beginner-stock'), 12]]);
      else if (src === 'telegram') land = pickW([[aVideo(), 40], ['/', 30], [cPath('pangyo'), 30]]);
      else if (src === 'instagram') land = pickW([['/', 45], [aBook(), 30], [cPath('beginner-stock'), 15], ['/start/', 10]]);
      else if (src === 'naver-premium') land = pickW([['/membership/', 40], [cPath('practical-2026'), 22], ['/', 38]]);
      else if (src === 'naver-search') land = pickW([[anAnswer(ANS_SEARCH), 55], ['/', 15], [anyCourse(), 12], [aBook(), 18]]);
      else if (src === 'google') land = pickW([[anAnswer(ANS_SEARCH), 40], ['/', 20], [anyCourse(), 20], [aBook(), 20]]);
      else if (ctx.ai) land = pickW([[anAnswer(ANS_AI), 52], [kindCourse(rnd() < 0.55 ? subW : regW), 33], ['/', 15]]);
      else if (src === 'direct') land = pickW([['/', 50], ['/my/', 12], ['/classes/', 15], ['/start/', 10], [anyCourse(), 10], ['/cart/', 3]]);
      else land = pickW([['/', 60], ['/classes/', 20], ['/books/', 20]]);
      if (land === '/cart/') ctx.cart.push({ type: 'course', slug: 'beginner-stock', price: 150000 });

      var t0 = t, pathNow = land, steps = 0, first = true;
      var ev = function (e, p, pv, x, at) { var o = { t: new Date(at).toISOString(), v: v, s: sid, src: src, e: e, p: p, pv: pv }; if (camp) o.c = camp; if (x) o.x = x; out.push(o); };
      while (pathNow && steps < 9) {
        steps++;
        var p = pathNow, kind = pageKind(p), secs = SECS[kind] || ['맨 위'];
        var pv = sid + '-' + steps;
        if (first) { ev('start', p, pv, { land: p, ref: '' }, t); first = false; }
        ev('pv', p, pv, { title: pageName(p) }, t);
        // 이 쪽에서 할 일 정하기
        var r = page(kind, p, ctx);
        var ew = EXIT_W[r.exitKey || kind] || [];
        var depth = r.depth != null ? r.depth : pickW(secs.map(function (_, i) { return [i, ew[i] != null ? ew[i] : Math.pow(0.7, i)]; }));
        depth = clamp(depth, 0, secs.length - 1);
        var tt = t + 400;
        for (var i = 0; i <= depth; i++) { tt += 2500 + Math.floor(rnd() * (i === 0 ? 4000 : 22000)); ev('sec', p, pv, { n: secs[i], i: i, of: secs.length }, tt); }
        (r.acts || []).forEach(function (a) { tt += 1500 + Math.floor(rnd() * 6000); ev(a[0], p, pv, a[1], tt); });
        tt += 1500 + Math.floor(rnd() * 9000);
        ev('leave', p, pv, { last: secs[depth], dur: tt - t, scroll: Math.min(100, Math.round((depth + 1) / secs.length * 100)) }, tt);
        t = tt + 800 + Math.floor(rnd() * 2500);
        pathNow = r.next || null;
      }
      void t0;
    });
    return out;

    // 쪽마다 하는 일 → { next, acts, depth?, exitKey? }
    function page(kind, p, c) {
      var I = c.I, acts = [], slug;
      if (kind === 'home') return { next: pickW([[kindCourse(subW), 10], [kindCourse(regW), 12], [kindCourse(freeW), 5], ['/classes/', 10], [aVideo(), 10], ['/books/', 4], [aBook(), 4], ['/start/', 8], ['/membership/', 5], [anAnswer(ANS_AI), 2], [null, 30]]) };
      if (kind === 'classes') return { next: pickW([[kindCourse(subW), 20], [kindCourse(regW), 22], [kindCourse(freeW), 12], ['/membership/', 6], ['/', 5], [null, 35]]) };
      if (kind === 'membership') return { next: pickW([[kindCourse(subW), 55], ['/classes/', 5], [null, 40]]) };
      if (/^course/.test(kind)) {
        slug = slugOf(p, 'classes');
        var cc = course(slug) || { price: 0 };
        var item = { type: 'course', slug: slug, price: cc.price || 0 };
        var pAdd = kind === 'course-sub' ? 0.26 * I : kind === 'course-reg' ? 0.06 * I : 0.08 * I;
        if (kind === 'course-sub' && c.search) pAdd *= 0.7;
        if (!c.cart.some(function (x) { return x.slug === slug; }) && rnd() < clamp(pAdd, 0.02, 0.75)) {
          var go = kind === 'course-sub' ? (rnd() < 0.6 ? '/checkout/' : '/cart/') : kind === 'course-reg' ? (rnd() < 0.35 ? '/checkout/' : '/cart/') : '/checkout/';
          c.cart.push(item);
          acts.push(['cart_add', { type: 'course', slug: slug, price: item.price, go: go }]);
          if (go === '/checkout/') acts.push(['buy_now', { slug: slug }]);
          var secsN = (SECS[kind] || []).length;
          return { next: go, acts: acts, depth: pickW([[0, 22], [2, 26], [Math.min(4, secsN - 1), 22], [Math.min(5, secsN - 1), 14], [Math.min(7, secsN - 1), 16]]) };
        }
        var nx = pickW([[anyCourse(), 10], [aVideo(), 6], [aBook(), 4], ['/classes/', 5], ['/', 4], [c.cart.length ? '/cart/' : null, c.cart.length ? 6 : 0], [null, 71]]);
        if (nx === p) nx = null;
        return { next: nx };
      }
      if (kind === 'cart') {
        if (!c.cart.length) return { next: pickW([['/classes/', 30], [null, 70]]) };
        var sub = c.cart.some(isSub), onlyBook = c.cart.every(function (x) { return x.type === 'book'; });
        var pCo = (sub ? 0.85 : onlyBook ? 0.6 : 0.82) * Math.pow(I, 0.25);
        if (rnd() < clamp(pCo, 0.2, 0.96)) return { next: '/checkout/', depth: 1 };
        return { next: pickW([[anyCourse(), 12], [aBook(), 8], [null, 80]]) };
      }
      if (kind === 'checkout') {
        if (!c.cart.length || c.paid) return { next: null, depth: 1 };
        var hasSub = c.cart.some(isSub);
        var pPay = (hasSub ? 0.18 : 0.8) * Math.pow(I, hasSub ? 0.45 : 0.3);
        if (rnd() < clamp(pPay, 0.08, 0.95)) {
          var items = c.cart.map(function (x) { var o = { type: x.type, slug: x.slug, price: x.price }; if (x.type === 'course' && courseKind(x.slug) === '구독') o.unit = '월'; return o; });
          acts.push(['purchase', { total: items.reduce(function (s, x) { return s + (x.price || 0); }, 0), items: items }]);
          c.cart = []; c.paid = true;
          return { next: rnd() < 0.55 ? '/my/' : null, acts: acts, depth: 3 };
        }
        return { next: pickW([['/cart/', 10], [null, 90]]), exitKey: hasSub ? 'checkout-sub' : 'checkout', depth: null };
      }
      if (kind === 'video') {
        if (rnd() < 0.07) return { next: null, acts: [['out_yt', { href: 'https://www.youtube.com/watch?v=' + slugOf(p, 'videos') }]], depth: 1 };
        var vv = (D().videos || []).find(function (x) { return x.id === slugOf(p, 'videos'); });
        var pc = 0.13 * (c.video && vv && c.video.id === vv.id ? I : Math.min(I, 1.3));
        var nxv = pickW([[vidCourse(vv), clamp(pc, 0.03, 0.6) * 100], [aBook(), 4], [aVideo(), 10], ['/', 5], ['/videos/', 3], [null, 60]]);
        return { next: nxv, depth: nxv && /^\/classes\//.test(nxv) ? pickW([[1, 30], [2, 70]]) : null };
      }
      if (kind === 'answer') {
        slug = slugOf(p, 'answers');
        var pa = c.src === 'naver-search' ? 0.045 : c.src === 'google' ? 0.12 : c.ai ? 0.46 : 0.14;
        var nxa = pickW([[ansCourse(slug), pa * 100], [anAnswer(c.ai ? ANS_AI : ANS_SEARCH), 8], ['/', 5], [null, Math.max(10, 87 - pa * 100)]]);
        return { next: nxa, exitKey: c.search ? 'answer-search' : 'answer', depth: nxa && /^\/classes\//.test(nxa) ? pickW([[1, 45], [2, 55]]) : null };
      }
      if (kind === 'start') {
        if (rnd() < 0.58) {
          acts.push(['finder_done', { track: pickW([['처음 시작하는 주식 공부', 3], ['미국 주식 공부', 2], ['환율·경제 흐름', 1.5], ['연금·노후 준비', 1]]) }]);
          if (rnd() < clamp(0.18 * Math.pow(I, 0.5), 0.04, 0.6)) {
            acts.push(['finder_add', {}]);
            c.cart.push({ type: 'course', slug: 'beginner-stock', price: (course('beginner-stock') || {}).price || 150000 });
            return { next: '/cart/', acts: acts, depth: 1 };
          }
          return { next: pickW([[anyCourse(), 25], [aBook(), 6], [null, 69]]), acts: acts, depth: pickW([[1, 70], [2, 30]]) };
        }
        return { next: pickW([['/', 15], [null, 85]]) };
      }
      if (kind === 'books') return { next: pickW([[aBook(), 62], [null, 38]]) };
      if (kind === 'book') {
        slug = slugOf(p, 'books');
        var bk = books.find(function (x) { return x.slug === slug; }) || { price: 0 };
        if (!c.cart.some(function (x) { return x.slug === slug; }) && rnd() < clamp(0.16 * Math.pow(I, 0.5), 0.04, 0.5)) {
          c.cart.push({ type: 'book', slug: slug, price: bk.price || 0 });
          acts.push(['cart_add', { type: 'book', slug: slug, price: bk.price || 0, go: '/cart/' }]);
          return { next: '/cart/', acts: acts, depth: pickW([[1, 40], [2, 40], [3, 20]]) };
        }
        return { next: pickW([[anyCourse(), 6], [aBook(), 7], ['/books/', 5], [null, 82]]) };
      }
      if (kind === 'videos') return { next: pickW([[aVideo(), 60], [null, 40]]) };
      if (kind === 'answers') return { next: pickW([[anAnswer(ANS_SEARCH), 55], [null, 45]]) };
      if (kind === 'my') return { next: pickW([['/classes/', 10], [null, 90]]) };
      return { next: null };
    }
  }

  // ── 방문(세션)으로 묶기 ──
  function sessionize(events, isEx) {
    var by = {}, list = [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (!e || !e.s || !e.e) continue;
      var S = by[e.s];
      if (!S) { S = by[e.s] = { s: e.s, v: e.v, src: e.src || 'direct', c: e.c || '', t0: Infinity, evs: [], ex: !!isEx }; list.push(S); }
      var tm = Date.parse(e.t);
      e._t = isNaN(tm) ? 0 : tm;
      if (e._t < S.t0) S.t0 = e._t;
      S.evs.push(e);
    }
    list.forEach(function (S) { S.evs.sort(function (a, b) { return a._t - b._t; }); });
    // 쪽 보기가 하나도 없는 방문(기록 앞부분이 잘려 '나감'만 남은 것 등)은 세지 않는다
    return list.filter(function (S) { return S.evs.some(function (e) { return e.e === 'pv'; }); });
  }

  var EXC = null; // { events, sess, from, to }
  function example() {
    if (EXC) return EXC;
    var evs = genExample();
    var sess = sessionize(evs, true);
    var end = Date.parse(D().buildDate + 'T23:59:59.999+09:00');
    EXC = { events: evs, sess: sess, end: end, from: end - 14 * DAY + 1 };
    return EXC;
  }
  var MINE = { sig: '', events: [], sess: [] };
  function mine() {
    var raw = '';
    try { raw = localStorage.getItem(EV_KEY) || ''; } catch (e) { raw = ''; }
    var sig = raw.length + ':' + raw.slice(-64);
    if (sig === MINE.sig) return MINE;
    var list = [];
    try { list = JSON.parse(raw || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    MINE = { sig: sig, events: list, sess: sessionize(list, false) };
    return MINE;
  }

  // 화면 상태(이 탭에만)
  var U = { mode: 'all', days: 14, grp: 'all', funnel: 'f-sub', preview: {}, pbStage: 'all', srcView: 'group' };
  function sessionsFor(o) {
    o = o || U;
    var list = [];
    if (o.mode !== 'mine') { var X = example(), from = X.end - o.days * DAY + 1; X.sess.forEach(function (S) { if (S.t0 >= from) list.push(S); }); }
    mine().sess.forEach(function (S) { list.push(S); });
    if (o.grp && o.grp !== 'all') list = list.filter(function (S) { return groupOf(S.src) === o.grp; });
    return list;
  }

  // ── 퍼널 계산 ──
  function runFunnel(f, list) {
    var n = f.steps.length, cnt = [], hits = [], bySrc = {}, i, j;
    for (i = 0; i < n; i++) cnt.push(0);
    list.forEach(function (S) {
      var k = 0, m = [];
      for (var x = 0; x < S.evs.length && k < n; x++) if (matchStep(f.steps[k], S.evs[x])) { m.push(x); k++; }
      if (!k) return;
      var b = bySrc[S.src] || (bySrc[S.src] = zeros(n));
      for (j = 0; j < k; j++) { cnt[j]++; b[j]++; }
      hits.push({ S: S, k: k, m: m });
    });
    var tr = [];
    for (i = 0; i < n - 1; i++) tr.push({ i: i, from: f.steps[i], to: f.steps[i + 1], n0: cnt[i], n1: cnt[i + 1], go: cnt[i] ? cnt[i + 1] / cnt[i] : 0, drop: cnt[i] ? 1 - cnt[i + 1] / cnt[i] : 0 });
    // 가장 큰 이탈: 첫 단계가 '아무 쪽 도착'이면 그 다음부터 본다(들어온 사람 대부분이 그 상품을 안 보는 것은 이탈이 아니다)
    var big = null;
    tr.forEach(function (t) { if (t.i === 0 && f.steps[0] === 'any') return; if (!t.n0) return; if (!big || t.drop > big.drop) big = t; });
    if (big && big.drop <= 0) big = null;
    return { f: f, n: n, cnt: cnt, tr: tr, big: big, hits: hits, bySrc: bySrc, conv: cnt[0] ? cnt[n - 1] / cnt[0] : 0 };
  }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }

  // 그 단계의 '쪽'(나간 사람이 마지막으로 본 쪽): 쪽 단계면 그 쪽, 이동이 붙은 행동(담기 → 장바구니)이면 이동한 쪽, 아니면 행동이 일어난 쪽
  function anchorIdx(S, ei) {
    var e = S.evs[ei], j;
    if (e.e === 'pv') return ei;
    if (e.x && e.x.go) { for (j = ei + 1; j < S.evs.length; j++) if (S.evs[j].e === 'pv') return j; }
    for (j = ei; j >= 0; j--) if (S.evs[j].e === 'pv' && S.evs[j].pv === e.pv) return j;
    return -1;
  }
  // 그 쪽에서 본 구간·마지막 구간·다음에 간 쪽
  function pvInfo(S, ai) {
    var a = S.evs[ai], secs = [], rawIdx = {}, last = null, next = null, yt = false;
    for (var j = ai + 1; j < S.evs.length; j++) {
      var e = S.evs[j];
      if (e.e === 'pv') { next = e.p; break; }
      if (e.pv !== a.pv) continue;
      if (e.e === 'sec' && e.x) { var i = +e.x.i || 0; rawIdx[e.x.n] = i; secs.push({ n: secName(e.x.n, i, a.p), i: i }); }
      if (e.e === 'leave' && e.x && e.x.last != null) last = String(e.x.last);
      if (e.e === 'out_yt') yt = true;
    }
    var lastName = last != null && rawIdx[last] != null ? secName(last, rawIdx[last], a.p) : secs.length ? secs[secs.length - 1].n : '맨 위';
    return { p: a.p, secs: secs, last: lastName, next: next, yt: yt };
  }
  function dropDetail(R, t) {
    var reached = R.hits.filter(function (h) { return h.k >= t.i + 1; });
    var order = {}, reach = {}, nReached = 0, lastCnt = {}, nextCnt = {}, nDrop = 0, pageCnt = {};
    reached.forEach(function (h) {
      var ai = anchorIdx(h.S, h.m[t.i]);
      if (ai < 0) return;
      var info = pvInfo(h.S, ai);
      nReached++;
      pageCnt[info.p] = (pageCnt[info.p] || 0) + 1;
      var seen = {};
      info.secs.forEach(function (s) { if (seen[s.n]) return; seen[s.n] = 1; reach[s.n] = (reach[s.n] || 0) + 1; var o = order[s.n] || (order[s.n] = { sum: 0, n: 0 }); o.sum += s.i; o.n++; });
      if (h.k === t.i + 1) {
        nDrop++;
        lastCnt[info.last] = (lastCnt[info.last] || 0) + 1;
        if (!order[info.last]) order[info.last] = { sum: 99, n: 1 };
        var to = info.next ? pageName(info.next) : info.yt ? '유튜브로 나감' : '사이트 밖(방문 끝)';
        nextCnt[to] = (nextCnt[to] || 0) + 1;
      }
    });
    var names = Object.keys(order).sort(function (a, b) { return order[a].sum / order[a].n - order[b].sum / order[b].n; });
    var rows = names.map(function (n) { return { name: n, last: nDrop ? (lastCnt[n] || 0) / nDrop : 0, lastN: lastCnt[n] || 0, reach: nReached ? (reach[n] || 0) / nReached : 0 }; });
    var top = rows.slice().sort(function (a, b) { return b.last - a.last; })[0] || null;
    rows.forEach(function (r) { r.isTop = top && r === top && r.last > 0; });
    var nextRows = Object.keys(nextCnt).map(function (k) { return { name: k, n: nextCnt[k], share: nDrop ? nextCnt[k] / nDrop : 0 }; }).sort(function (a, b) { return b.n - a.n; });
    var outside = nextRows.filter(function (r) { return r.name === '사이트 밖(방문 끝)' || r.name === '유튜브로 나감'; });
    var others = nextRows.filter(function (r) { return outside.indexOf(r) < 0; }).slice(0, 5);
    var mainPage = Object.keys(pageCnt).sort(function (a, b) { return pageCnt[b] - pageCnt[a]; })[0] || '';
    var pages = Object.keys(pageCnt).length;
    // 출처별 그 단계 이탈률
    var src = [];
    Object.keys(R.bySrc).forEach(function (s) { var b = R.bySrc[s]; if (b[t.i]) src.push({ src: s, n0: b[t.i], n1: b[t.i + 1], drop: 1 - b[t.i + 1] / b[t.i] }); });
    return { rows: rows, top: top, nDrop: nDrop, nReached: nReached, next: outside.concat(others), mainPage: mainPage, pages: pages, src: src };
  }

  // ── 출처별 집계(유입 출처 화면) ──
  function sourceStats(list) {
    var by = {};
    list.forEach(function (S) {
      var o = by[S.src] || (by[S.src] = { src: S.src, visits: 0, course: 0, add: 0, paid: 0, revenue: 0, ex: 0, mine: 0 });
      o.visits++;
      if (S.ex) o.ex++; else o.mine++;
      var c = false, a = false, p = false;
      S.evs.forEach(function (e) {
        if (e.e === 'pv' && /^course/.test(pageKind(e.p))) c = true;
        if (e.e === 'cart_add' || e.e === 'finder_add') a = true;
        if (e.e === 'purchase') { p = true; o.revenue += +((e.x && e.x.total) || 0); }
      });
      if (c) o.course++; if (a) o.add++; if (p) o.paid++;
    });
    return by;
  }
  function campaignStats(list) {
    var by = {};
    list.forEach(function (S) {
      if (S.src !== 'yt-desc' || !S.c) return;
      var o = by[S.c] || (by[S.c] = { id: S.c, visits: 0, course: 0, add: 0, paid: 0, revenue: 0 });
      o.visits++;
      var c = false, a = false, p = false;
      S.evs.forEach(function (e) {
        if (e.e === 'pv' && /^course/.test(pageKind(e.p))) c = true;
        if (e.e === 'cart_add' || e.e === 'finder_add') a = true;
        if (e.e === 'purchase') { p = true; o.revenue += +((e.x && e.x.total) || 0); }
      });
      if (c) o.course++; if (a) o.add++; if (p) o.paid++;
    });
    return by;
  }

  // ════════════════════════ 화면 ════════════════════════
  // 관리자 상태(이 파일이 쓰는 키를 늘 갖춰 둔다 — 메모리에서만, 저장은 commit 할 때)
  function S() {
    var st = K.state();
    ['expRun', 'expDone', 'playbookTodo'].forEach(function (k) { if (!st[k] || typeof st[k] !== 'object' || Array.isArray(st[k])) st[k] = {}; });
    if (!st.exp || typeof st.exp !== 'object') st.exp = {};
    if (!Array.isArray(st.funnels)) st.funnels = [];
    return st;
  }
  var CIRC = ['⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮'];
  function allFunnels() {
    return PRESET.concat(S().funnels.filter(function (f) { return f && Array.isArray(f.steps) && f.steps.length >= 2; }).map(function (f, i) {
      return { id: f.id, no: CIRC[i] || '·', name: f.name, steps: f.steps.filter(function (s) { return STEPS[s]; }), desc: f.steps.map(stepName).join(' → '), custom: true };
    }));
  }
  // 받침에 맞는 조사: josa('직접 방문', '이', '가') → '이'. 한글이 아니면(ChatGPT 등) 받침 없는 쪽
  function josa(w, a, b) {
    var t = String(w || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/[’'"」』\s]+$/, ''), c = t.charCodeAt(t.length - 1);
    return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? a : b;
  }
  function P0(x) { return Math.round((x || 0) * 100) + '%'; }
  function P1(x) { var v = (x || 0) * 100; return (v > 0 && v < 10 ? v.toFixed(1) : String(Math.round(v))) + '%'; }
  function md(ms) { var d = new Date(ms + 9 * 3600e3); var p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getUTCMonth() + 1) + '.' + p(d.getUTCDate()); }
  function exTag() { return U.mode === 'mine' ? '' : EX; }
  function seg(act, items, cur, disabled) {
    return items.map(function (t) { return '<button type="button" data-act="' + act + '" data-v="' + esc(t[0]) + '" aria-pressed="' + (String(cur) === String(t[0])) + '"' + (disabled ? ' disabled title="내 기록은 기간과 관계없이 모두 셉니다"' : '') + '>' + esc(t[1]) + '</button>'; }).join('');
  }
  // 보기·기간·출처 띠
  function toolbar(withGrp) {
    var X = example(), M = mine(), from = X.end - U.days * DAY + 1;
    var nEx = U.mode === 'mine' ? 0 : X.sess.filter(function (s) { return s.t0 >= from; }).length;
    var h = '<div class="fn-bar"><div class="fn-bar__g"><span class="fn-bar__k">보기</span><div class="ad-seg" role="group" aria-label="보기">' + seg('fn-mode', [['all', '예시 + 내 기록'], ['mine', '내 기록만']], U.mode) + '</div></div>' +
      '<div class="fn-bar__g"><span class="fn-bar__k">기간</span><div class="ad-seg" role="group" aria-label="기간">' + seg('fn-days', [['7', '최근 7일'], ['14', '최근 14일']], U.days, U.mode === 'mine') + '</div></div>';
    if (withGrp) {
      h += '<div class="fn-bar__g fn-bar__g--grp"><span class="fn-bar__k">출처</span><div class="ad-tabs fn-tabs" role="group" aria-label="출처 묶음으로 걸러 보기">' + [['all', '전체']].concat(GROUPS.map(function (g) { return [g.id, g.name]; })).map(function (t) {
        return '<button class="ad-tab" type="button" data-act="fn-grp" data-v="' + t[0] + '" aria-pressed="' + (U.grp === t[0]) + '">' + esc(t[1]) + '</button>';
      }).join('') + '</div></div>';
    }
    h += '</div><p class="ad-note ad-note--plain fn-mine">' + icon('info') + '<span>' +
      (U.mode === 'mine' ? '' : '예시 방문 <b>' + num(nEx) + '번</b>(' + md(from) + '~' + md(X.end) + ', 씨앗 고정 가짜 기록) + ') +
      '이 브라우저의 실제 기록 <b data-mine-ev>' + num(M.events.length) + '건</b>(방문 <b data-mine-sess>' + num(M.sess.length) + '번</b>)' +
      (U.mode === 'mine' ? '' : ' — 내 기록은 기간과 관계없이 모두 셉니다') + '. 사이트를 돌아다니면 쌓입니다 · <a href="#sources">출처를 정해 사이트 열기</a></span></p>';
    return h;
  }
  function hbar(label, ratio, val, sub, tone) {
    return '<div class="ad-hbar fn-hbar' + (tone ? ' is-' + tone : '') + '"><span class="ad-hbar__k">' + esc(label) + '</span><span class="ad-hbar__track"><span class="ad-hbar__fill" style="width:' + Math.max(0.5, Math.min(100, ratio * 100)).toFixed(1) + '%"></span></span><span class="ad-hbar__v">' + val + (sub ? '<small>' + sub + '</small>' : '') + '</span></div>';
  }

  // ── 플레이북(이탈 차단 사례) ──
  // 사례 파일의 stage 1~7
  var PB_STAGES = ['유입 맞춤', '강의 상세', '장바구니·결제', '구독 결제', '이탈 직전·후', '무료→유료', '콘텐츠→강의'];
  var PB_HINT = { '유입 맞춤': '영상·검색·AI 답변에서 들어온 사람에게 맞는 첫 화면', '강의 상세': '상세 쪽에서 담기까지', '장바구니·결제': '담은 뒤 결제 완료까지', '구독 결제': '매월 자동 결제·해지 불안', '이탈 직전·후': '나가려는 순간과 나간 뒤', '무료→유료': '무료 강의·진단에서 유료로', '콘텐츠→강의': '영상 정리·답변에서 강의로' };
  // 사례 → 사이트 B안 조각(사람이 맞춰 둔 표 — 사례에 exp 가 있으면 그것을 먼저). 표에 없는 사례는 운영 단계 작업 목록으로
  var PB_EXP = { 'S2-02': 'exp-curriculum-summary', 'S4-01': 'exp-checkout-cancel', 'S4-03': 'exp-checkout-cancel', 'S7-01': 'exp-answer-cta', 'S7-02': 'exp-video-cta' };
  var PBC = null;
  function stageNameOf(p) {
    var s = p.stage;
    if (typeof s === 'string' && isNaN(+s)) {
      var t = s.replace(/\s/g, '');
      return PB_STAGES.find(function (n) { return n.replace(/\s/g, '') === t; }) || PB_STAGES.find(function (n) { return n.replace(/\s/g, '').indexOf(t) >= 0 || t.indexOf(n.replace(/\s/g, '').split('·')[0]) >= 0; }) || s;
    }
    return PB_STAGES[(+s || 0) - 1] || '이탈 직전·후';
  }
  function pbExp(p) {
    if (p.exp && EXPS[p.exp]) return p.exp;
    if (PB_EXP[p.id]) return PB_EXP[p.id];
    // 표에 없는 새 사례: 전략 이름(pattern)만 보고 좁게 맞춘다
    var t = String(p.pattern || ''), st = p.stageName;
    if (st === '강의 상세' && /커리큘럼|차시/.test(t)) return 'exp-curriculum-summary';
    if (st === '구독 결제' && /언제든 해지|해지 안내|결제 화면/.test(t)) return 'exp-checkout-cancel';
    if (st === '콘텐츠→강의' && /답변|정리 글|아티클/.test(t)) return 'exp-answer-cta';
    if (st === '콘텐츠→강의' && /영상/.test(t)) return 'exp-video-cta';
    return null;
  }
  function playbook() {
    var raw = (D() && D().playbook) || [];
    if (PBC && PBC.raw === raw) return PBC.list;
    var list = Array.isArray(raw) ? raw.filter(function (p) { return p && (p.pattern || p.what); }) : [];
    list = list.map(function (p, i) {
      var o = Object.assign({}, p), c = p.compliance && typeof p.compliance === 'object' ? p.compliance : { level: p.compliance };
      o.id = String(p.id || 'pb-' + (i + 1));
      o.stageName = stageNameOf(p);
      o.comp = c.level === 'banned' ? 'banned' : c.level === 'caution' ? 'caution' : 'ok';
      o.compWhy = c.reason || '';
      o.basis = Array.isArray(c.basis) ? c.basis : [];
      o.alt = c.alternative || '';
      o.expId = o.comp === 'banned' ? null : pbExp(o);
      return o;
    });
    PBC = { raw: raw, list: list };
    return list;
  }
  // 공개 효과 수치 { value, source(주소) }
  function metricHtml(m) {
    if (!m) return '';
    if (typeof m === 'string') return esc(m);
    var t = m.value || m.text || '', src = String(m.source || m.url || '');
    var url = /^https?:/.test(src) ? src : '';
    return esc(t) + (src ? ' <span class="fn-pb__src">출처 ' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(hostOf(url) || '링크') + icon('ext', 'ad-ico--xs') + '</a>' : esc(src)) + '</span>' : '');
  }
  function compBadge(p) {
    if (p.comp === 'banned') return '<span class="ad-badge ad-badge--bad">' + icon('lock', 'ad-ico--xs') + '우리 업종에서는 금지</span>';
    if (p.comp === 'caution') return '<span class="ad-badge fn-badge--warn">' + icon('alert', 'ad-ico--xs') + '조건을 지켜 적용</span>';
    return '<span class="ad-badge ad-badge--ok">' + icon('check', 'ad-ico--xs') + '적용 가능</span>';
  }
  function pbApplied(p) { var st = S(); return !!(st.playbookTodo[p.id] || (p.expId && (st.expRun[p.expId] || st.exp[p.expId] === 'B'))); }
  function pbAction(p, from) {
    var st = S();
    if (p.comp === 'banned') return '';
    if (p.expId) {
      if (st.exp[p.expId] === 'B') return '<span class="ad-badge ad-badge--ok">' + icon('check', 'ad-ico--xs') + 'B안 확정됨 — ' + esc(EXPS[p.expId].name) + '</span>';
      if (st.expRun[p.expId]) return '<a class="ad-badge ad-badge--blue" href="#funnel" data-act="fn-goto-run">' + icon('flask', 'ad-ico--xs') + '실험 진행 중 — ' + esc(EXPS[p.expId].name) + '</a>';
      return '<button class="ad-btn ad-btn--primary ad-btn--sm" type="button" data-act="fn-exp-start" data-exp="' + esc(p.expId) + '" data-pb="' + esc(p.id) + '" data-from="' + esc(from || '이탈 차단 전략 · ' + (p.platform || '') + ' 사례') + '">' + icon('flask', 'ad-ico--sm') + '우리 사이트에 적용하기</button><span class="ad-small ad-muted">B안: ' + esc(EXPS[p.expId].name) + '</span>';
    }
    if (st.playbookTodo[p.id]) return '<span class="ad-badge ad-badge--blue">' + icon('list', 'ad-ico--xs') + '운영 단계 작업 목록에 있음</span><button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-act="fn-todo-del" data-id="' + esc(p.id) + '">빼기</button>';
    return '<button class="ad-btn ad-btn--line ad-btn--sm" type="button" data-act="fn-todo-add" data-id="' + esc(p.id) + '">' + icon('list', 'ad-ico--sm') + '우리 사이트에 적용하기</button><span class="ad-small ad-muted">맞는 B안 조각이 없어 운영 단계 작업 목록에 담습니다</span>';
  }
  function pbCard(p, opt) {
    opt = opt || {};
    var ev = p.evidence ? (Array.isArray(p.evidence) ? p.evidence : [p.evidence]) : [];
    return '<article class="fn-pb' + (p.comp === 'banned' ? ' is-banned' : '') + (opt.mini ? ' fn-pb--mini' : '') + '" data-pb="' + esc(p.id) + '">' +
      '<div class="fn-pb__head"><span class="fn-pb__plat">' + esc(p.platform || '플랫폼') + '</span>' + compBadge(p) + (opt.mini ? '' : '<span class="ad-badge ad-badge--line">' + esc(p.stageName) + '</span>') + '</div>' +
      '<h3 class="fn-pb__t">' + esc(p.pattern || '') + '</h3>' +
      (p.what && !opt.mini ? '<div class="fn-pb__what"><span class="fn-pb__k">그 플랫폼이 하는 것</span><p class="fn-clamp">' + esc(p.what) + '</p>' + (p.what.length > 110 ? '<button class="fn-more" type="button" data-act="pb-more" aria-expanded="false">더 보기</button>' : '') + '</div>' : '') +
      (p.metric ? '<p class="fn-pb__metric"><span class="fn-pb__k">공개된 효과 수치</span>' + metricHtml(p.metric) + '</p>' : '') +
      (p.comp === 'banned' ? '<p class="fn-pb__ban">' + icon('lock', 'ad-ico--xs') + '<span><b>우리 업종에서는 금지</b>' + (p.compWhy ? ' — ' + esc(p.compWhy) : '') + (p.alt || p.applyHere ? '<br><b>대안</b> ' + esc(p.alt || p.applyHere) : '') + '</span></p>'
        : (p.applyHere ? '<p class="fn-pb__here"><span class="fn-pb__k">우리 사이트에 적용하면</span>' + esc(p.applyHere) + '</p>' : '') +
          (p.comp === 'caution' && p.compWhy ? '<p class="fn-pb__warn">' + icon('alert', 'ad-ico--xs') + '<span><b>조건</b> ' + esc(p.compWhy) + '</span></p>' : p.compWhy && !opt.mini ? '<p class="fn-pb__okwhy">' + icon('check', 'ad-ico--xs') + '<span>' + esc(p.compWhy) + '</span></p>' : '')) +
      (p.basis && p.basis.length && !opt.mini ? '<p class="fn-pb__basis">근거 규정 · ' + p.basis.map(esc).join(' · ') + '</p>' : '') +
      (ev.length && !opt.mini ? '<p class="fn-pb__ev">근거 ' + ev.map(function (u, i) { var url = typeof u === 'string' ? u : (u.url || u.href || ''); return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(hostOf(url) || '링크 ' + (i + 1)) + icon('ext', 'ad-ico--xs') + '</a>' : ''; }).join(' ') + (p.evidenceNote ? ' <span class="ad-muted">· ' + esc(p.evidenceNote) + '</span>' : '') + '</p>' : '') +
      (opt.noAction ? '' : '<div class="fn-pb__foot ad-btns">' + pbAction(p, opt.from) + (ev.length && opt.mini ? '<a class="ad-small" href="' + esc(typeof ev[0] === 'string' ? ev[0] : ev[0].url || '') + '" target="_blank" rel="noopener">근거' + icon('ext', 'ad-ico--xs') + '</a>' : '') + '</div>') +
      '</article>';
  }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  // 퍼널의 한 단계에 맞는 사례 고르기(금지 사례 뺌, 적용 가능 → 주의 순, 공개 수치 있는 것 먼저, 멈춘 구간 낱말이 맞으면 먼저)
  function recommend(R, t, d, n) {
    var stages = pbStageOf(R, t), top = d && d.top ? d.top.name : '';
    var kw = /커리큘럼/.test(top) ? /커리큘럼|목차|차시|요약|구성/ : /확인|결제 수단/.test(top) ? /해지|자동|타임라인|결제일|언제든/ : /근거|장 목차/.test(top) ? /추천|이어|강의|다음/ : null;
    var want = expForTr(t.from, t.to);
    return playbook().filter(function (p) { return p.comp !== 'banned' && stages.indexOf(p.stageName) >= 0; }).map(function (p) {
      var sc = (3 - stages.indexOf(p.stageName)) * 10 + (p.comp === 'ok' ? 4 : 0) + (p.metric ? 3 : 0) + (kw && kw.test([p.pattern, p.what, p.applyHere].join(' ')) ? 6 : 0) + (want && p.expId === want ? 8 : 0);
      return { p: p, sc: sc };
    }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, n).map(function (x) { return x.p; });
  }

  // ── 퍼널·이탈 ──
  function pickCard(r) {
    var on = r.f.id === U.funnel, b = r.big;
    return '<button class="fn-pick' + (on ? ' is-on' : '') + '" type="button" data-act="fn-pick" data-id="' + esc(r.f.id) + '" aria-pressed="' + on + '">' +
      '<span class="fn-pick__h"><span class="fn-pick__no" aria-hidden="true">' + esc(r.f.no) + '</span><span class="fn-pick__t">' + esc(r.f.name) + '</span></span>' +
      '<span class="fn-pick__v">' + (r.cnt[0] ? P1(r.conv) : '—') + '<small>전체 전환 · ' + num(r.cnt[0]) + '명 시작</small></span>' +
      '<span class="fn-pick__d">' + (b ? '<span class="fn-pick__bad">가장 큰 이탈</span>' + esc(stepName(b.from)) + ' → ' + esc(stepName(b.to)) + ' <b>' + P0(b.drop) + '</b>' : r.cnt[0] ? '나간 단계가 없습니다' : '아직 기록이 없습니다') + '</span></button>';
  }
  function flowCard(R) {
    var f = R.f, n0 = R.cnt[0] || 0;
    var h = '<section class="ad-card fn-flow" aria-labelledby="fn-flow-t"><div class="fn-flow__head"><div><h2 class="ad-card__t" id="fn-flow-t">' + esc(f.no + ' ' + f.name) + exTag() + (f.custom ? '<span class="ad-badge ad-badge--blue">직접 만든 퍼널</span>' : '') + '</h2>' +
      '<p class="ad-card__d">' + esc(f.desc) + ' · 같은 방문 안에서 순서대로 일어난 것만 셉니다</p></div>' +
      '<div class="fn-flow__kpi"><b data-conv>' + (n0 ? P1(R.conv) : '—') + '</b><span>전체 전환 ' + num(R.cnt[R.n - 1]) + '/' + num(n0) + '</span>' + (f.custom ? '<button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-act="fn-del" data-id="' + esc(f.id) + '">지우기</button>' : '') + '</div></div><ol class="fn-steps">';
    f.steps.forEach(function (s, i) {
      var c = R.cnt[i];
      h += '<li class="fn-step" data-i="' + i + '" data-n="' + c + '"><span class="fn-step__no">' + (i + 1) + '</span><span class="fn-step__name">' + esc(stepName(s)) + '</span>' +
        '<span class="fn-step__bar"><span style="width:' + (n0 ? Math.max(0.6, c / n0 * 100) : 0).toFixed(2) + '%"></span></span><span class="fn-step__n">' + num(c) + '<small>' + (i ? '처음의 ' + P1(n0 ? c / n0 : 0) : '시작') + '</small></span></li>';
      if (i < R.n - 1) {
        var t = R.tr[i], big = R.big && R.big.i === i, skip = i === 0 && f.steps[0] === 'any';
        h += '<li class="fn-gap' + (big ? ' is-big' : '') + (skip ? ' is-skip' : '') + '"><span class="fn-gap__arrow" aria-hidden="true">↓</span><span class="fn-gap__go">이어짐 <b>' + P0(t.go) + '</b></span><span class="fn-gap__drop">나감 <b>' + P0(t.drop) + '</b> · ' + num(t.n0 - t.n1) + '명</span>' +
          (big ? '<span class="fn-gap__flag">' + icon('alert', 'ad-ico--xs') + '여기서 가장 많이 나갑니다</span>' : skip ? '<span class="fn-gap__note">들어온 사람 대부분은 다른 상품을 봅니다 — 이탈로 치지 않습니다</span>' : '') + '</li>';
      }
    });
    return h + '</ol></section>';
  }
  // 마지막 구간 막대 + 도달률 선
  function secChart(rows) {
    if (!rows.length) return '<p class="ad-small ad-muted" style="margin-top:12px">구간 기록이 없습니다.</p>';
    var H = 34, n = rows.length;
    var pts = rows.map(function (r, i) { return (r.reach * 100).toFixed(2) + ',' + (i * H + H / 2); }).join(' ');
    return '<div class="fn-sc" role="img" aria-label="구간별 마지막으로 본 비율과 도달률 — 아래 표로 보기에 같은 값">' +
      '<div class="fn-sc__names">' + rows.map(function (r) { return '<div title="' + esc(r.name) + '"' + (r.isTop ? ' class="is-top"' : '') + '>' + esc(r.name) + '</div>'; }).join('') + '</div>' +
      '<div class="fn-sc__plot">' + rows.map(function (r) { return '<div class="fn-sc__row"><span class="fn-sc__bar' + (r.isTop ? ' is-top' : '') + '" style="width:' + Math.max(r.last ? 1 : 0, r.last * 100).toFixed(1) + '%"></span><span class="fn-sc__dot" style="left:' + (r.reach * 100).toFixed(1) + '%"></span></div>'; }).join('') +
      '<svg class="fn-sc__line" viewBox="0 0 100 ' + n * H + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" vector-effect="non-scaling-stroke"/></svg></div>' +
      '<div class="fn-sc__vals">' + rows.map(function (r) { return '<div><b>' + P0(r.last) + '</b><small>도달 ' + P0(r.reach) + '</small></div>'; }).join('') + '</div>' +
      '<div></div><div class="fn-sc__axis"><span>0</span><span>50%</span><span>100%</span></div><div></div></div>' +
      '<p class="ad-legend fn-sc__legend"><span><span class="ad-sw" style="background:var(--blue-line)"></span>마지막으로 본 구간</span><span><span class="ad-sw" style="background:var(--bad)"></span>가장 많이 멈춘 구간</span><span><span class="fn-sw-line"></span>그 구간까지 내려온 비율</span></p>' +
      '<details class="ad-tableview"><summary>표로 보기</summary><table><thead><tr><th>구간</th><th>마지막으로 본 비율</th><th>도달률</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td>' + P1(r.last) + ' (' + num(r.lastN) + '명)</td><td>' + P1(r.reach) + '</td></tr>'; }).join('') + '</tbody></table></details>';
  }
  function anchorLabel(t, d) {
    if (d.pages <= 1) return d.mainPage ? pageName(d.mainPage) : stepName(t.from);
    var s = STEPS[t.from];
    var name = s && s.pv ? stepName(t.from) : pageName(d.mainPage).split(' · ')[0];
    return name + ' ' + d.pages + '곳(가장 많은 곳: ' + pageName(d.mainPage) + ')';
  }
  function dropSection(R, d) {
    var t = R.big, min = U.mode === 'mine' ? 1 : 20;
    var src = d.src.filter(function (s) { return s.n0 >= min; }).sort(function (a, b) { return b.drop - a.drop; });
    var h = '<section class="ad-sec fn-drop" aria-labelledby="fn-drop-t"><h2 class="ad-sec__t" id="fn-drop-t">' + icon('alert') + '이탈 지점 자세히 · ' + esc(stepName(t.from)) + ' → ' + esc(stepName(t.to)) + exTag() + '</h2>' +
      '<p class="ad-sec__d">이 단계까지 온 ' + num(t.n0) + '명 중 ' + num(t.n0 - t.n1) + '명(' + P0(t.drop) + ')이 다음 단계로 가지 않았습니다. 나간 사람이 머문 쪽: ' + esc(anchorLabel(t, d)) + '.</p><div class="fn-drop__grid">';
    h += '<div class="ad-card fn-drop__sec"><p class="ad-card__t">나간 사람이 마지막으로 본 구간</p><p class="ad-card__d">막대 = 나간 ' + num(d.nDrop) + '명 중 그 구간에서 멈춘 비율 · 점과 선 = 이 쪽을 본 ' + num(d.nReached) + '명 중 그 구간까지 내려온 비율</p>' + secChart(d.rows) + '</div>';
    h += '<div class="ad-card"><p class="ad-card__t">나간 뒤 간 곳</p><p class="ad-card__d">나간 ' + num(d.nDrop) + '명이 바로 다음에 한 일</p><div class="ad-hbars fn-hbars">' +
      d.next.map(function (r) { return hbar(r.name, r.share, P0(r.share), num(r.n) + '명', /사이트 밖|유튜브로/.test(r.name) ? 'out' : ''); }).join('') + '</div></div>';
    h += '<div class="ad-card"><p class="ad-card__t">출처별 이 단계 이탈률</p><p class="ad-card__d">이 단계까지 온 사람이 ' + min + '명 이상인 출처 · 빨강 가장 많이 나감 · 초록 가장 적게 나감</p><div class="ad-hbars fn-hbars">' +
      (src.length ? src.map(function (s, i) { return hbar(srcName(s.src), s.drop, P0(s.drop), num(s.n0) + '명 중', src.length > 1 && i === 0 ? 'bad' : src.length > 1 && i === src.length - 1 ? 'ok' : ''); }).join('') : '<p class="ad-small ad-muted">표본이 적습니다.</p>') + '</div></div>';
    return h + '</div></section>';
  }
  function srcTable(R) {
    var f = R.f, n = R.n, min = U.mode === 'mine' ? 1 : 30;
    var rows = [];
    GROUPS.forEach(function (g) {
      if (U.grp !== 'all' && U.grp !== g.id) return;
      var agg = zeros(n), subs = [];
      g.src.forEach(function (s) { var b = R.bySrc[s]; if (!b) return; for (var i = 0; i < n; i++) agg[i] += b[i]; subs.push({ id: s, name: srcName(s), c: b, sub: true }); });
      Object.keys(R.bySrc).forEach(function (s) { if (!GROUP_OF[s] && g.id === 'etc') { var b = R.bySrc[s]; for (var i = 0; i < n; i++) agg[i] += b[i]; subs.push({ id: s, name: srcName(s), c: b, sub: true }); } });
      if (!agg[0]) return;
      rows.push({ id: g.id, name: g.name, c: agg, grp: true });
      subs.sort(function (a, b) { return b.c[0] - a.c[0]; }).forEach(function (s) { rows.push(s); });
    });
    var conv = function (r) { return r.c[0] ? r.c[n - 1] / r.c[0] : 0; };
    var cand = rows.filter(function (r) { return r.sub && r.c[0] >= min; });
    var best = cand.length > 1 ? cand.reduce(function (a, b) { return conv(b) > conv(a) ? b : a; }) : null;
    var worst = cand.length > 1 ? cand.reduce(function (a, b) { return conv(b) < conv(a) ? b : a; }) : null;
    var h = '<section class="ad-sec" aria-labelledby="fn-src-t"><div class="ad-tblcap"><h2 class="ad-sec__t" id="fn-src-t" style="margin:0">' + icon('route') + '출처별 퍼널' + exTag() + '</h2><p class="ad-small ad-muted">초록 = 전체 전환이 가장 높은 출처 · 빨강 = 가장 낮은 출처(시작 ' + min + '명 이상)</p></div>';
    if (!rows.length) return h + '<div class="ad-empty">이 조건에 맞는 방문이 없습니다.</div></section>';
    h += '<div class="ad-tablewrap"><table class="ad-table fn-srct"><thead><tr><th>출처</th>' + f.steps.map(function (s, i) { return '<th class="n">' + (i + 1) + '. ' + esc(stepName(s)) + '</th>'; }).join('') + '<th class="n">전체 전환</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var cv = conv(r), tone = r === best ? ' is-best' : r === worst ? ' is-worst' : '';
        return '<tr class="' + (r.grp ? 'fn-grp-row' : 'fn-src-row') + '" data-src="' + esc(r.id) + '"><td class="' + (r.grp ? 'ad-rowt' : 'fn-indent') + '">' + esc(r.name) + '</td>' +
          r.c.map(function (v, i) { return '<td class="n">' + num(v) + (i && r.c[i - 1] ? '<small class="fn-go">' + P0(v / r.c[i - 1]) + '</small>' : '') + '</td>'; }).join('') +
          '<td class="n fn-conv' + tone + '">' + (r.c[0] ? P1(cv) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
    return h;
  }
  // AI 진단(규칙 기반) 문장
  function sentences(R, d, results) {
    var t = R.big, out = [], top = d.top;
    out.push('‘' + stepName(t.from) + ' → ' + stepName(t.to) + '’에서 <b>' + P0(t.drop) + '</b>가 나갑니다(' + num(t.n0) + '명 중 ' + num(t.n0 - t.n1) + '명). 이 퍼널에서 가장 많이 나가는 단계입니다.');
    if (top && top.last > 0) {
      var hint = '';
      var reachOf = function (n) { var r = d.rows.find(function (x) { return x.name === n; }); return r ? P0(r.reach) : null; };
      if (top.name === '커리큘럼') {
        var regs = (D().courses || []).filter(function (c) { return c.kind === '정규' && c.lessons; });
        var maxL = regs.reduce(function (m, c) { return Math.max(m, c.lessons); }, 0);
        hint = maxL ? ' 차시 목록(최대 ' + maxL + '강)이 길어 한눈에 구성을 보지 못하고 나간 것으로 보입니다.' : '';
      } else if (top.name === '확인') hint = ' 결제 단추 바로 위의 동의·확인 칸입니다. 매월 자동으로 결제된다는 것과 해지 방법을 그 자리에서 확인하지 못한 것일 수 있습니다.';
      else if (top.name === '결제 수단') hint = ' 결제 수단을 고르는 칸에서 멈췄습니다.';
      else if (top.name === '근거') hint = ' 답변만 읽고 다음에 볼 곳을 찾지 못한 것으로 보입니다.' + (reachOf('관련 강의') ? ' ‘관련 강의’ 칸까지 내려온 사람은 ' + reachOf('관련 강의') + '입니다.' : '');
      else if (top.name === '장 목차') hint = ' 장 목차만 보고 나갑니다.' + (reachOf('이어서 볼 강의·책') ? ' ‘이어서 볼 강의·책’까지 내려온 사람은 ' + reachOf('이어서 볼 강의·책') + '입니다.' : '');
      else if (top.name === '진단 질문') hint = ' 진단 결과를 본 뒤 담지 않고 나갑니다.';
      out.push('나간 사람의 <b>' + P0(top.last) + '</b>가 ‘' + esc(top.name) + '’ 구간에서 멈췄습니다.' + hint);
    }
    var outside = d.next.filter(function (r) { return /사이트 밖|유튜브로/.test(r.name); }).reduce(function (s, r) { return s + r.share; }, 0);
    var other = d.next.find(function (r) { return !/사이트 밖|유튜브로/.test(r.name); });
    if (d.nDrop) out.push('나간 사람의 ' + P0(outside) + '는 그대로 사이트를 떠났고' + (other ? ', 다른 쪽으로 간 곳은 ‘' + esc(other.name) + '’(' + P0(other.share) + ')' + josa(other.name, '이', '가') + ' 가장 많습니다.' : '.'));
    var min = U.mode === 'mine' ? 1 : 20, src = d.src.filter(function (s) { return s.n0 >= min; }).sort(function (a, b) { return b.drop - a.drop; });
    if (src.length > 1) { var sw = srcName(src[0].src), sb = srcName(src[src.length - 1].src); out.push('출처별로는 ' + esc(sw) + '(' + P0(src[0].drop) + ')' + josa(sw, '이', '가') + ' 가장 많이 나가고, ' + esc(sb) + '(' + P0(src[src.length - 1].drop) + ')' + josa(sb, '이', '가') + ' 가장 적게 나갑니다.'); }
    // 퍼널마다 하나 더 비교
    if (t.from === 'checkout' && R.f.steps.indexOf('course-sub') >= 0) {
      var rb = results.find(function (r) { return r.f.id === 'f-book'; });
      var tb = rb && rb.tr.find(function (x) { return x.from === 'checkout' && x.to === 'purchase'; });
      if (tb && tb.n0 && tb.drop > 0) out.push('같은 결제 화면에서 책 구매는 ' + P0(tb.drop) + '만 나갑니다. 구독반은 그 ' + (t.drop / tb.drop).toFixed(1) + '배입니다 — 금액보다 ‘매월 자동 결제’가 걸림돌일 수 있습니다.');
    }
    if (t.from === 'answer') {
      var g = { search: [0, 0], ai: [0, 0], naver: [0, 0] };
      d.src.forEach(function (s) { var k = groupOf(s.src); if (g[k]) { g[k][0] += s.n0; g[k][1] += s.n1; } if (s.src === 'naver-search') { g.naver[0] += s.n0; g.naver[1] += s.n1; } });
      if (g.naver[0] && g.ai[0]) out.push('네이버 검색으로 온 사람은 ' + P1(g.naver[1] / g.naver[0]) + '만 강의로 넘어가고, AI 답변(ChatGPT 등)으로 온 사람은 ' + P1(g.ai[1] / g.ai[0]) + '가 넘어갑니다.');
    }
    if (t.from === 'video') {
      var byC = {};
      R.hits.forEach(function (hh) { if (hh.S.src !== 'yt-desc' || !hh.S.c) return; var o = byC[hh.S.c] || (byC[hh.S.c] = [0, 0]); o[0]++; if (hh.k > t.i + 1) o[1]++; });
      var cs = Object.keys(byC).filter(function (k) { return byC[k][0] >= (U.mode === 'mine' ? 1 : 30); }).map(function (k) { return { id: k, r: byC[k][1] / byC[k][0] }; }).sort(function (a, b) { return b.r - a.r; });
      var vt = function (id) { var v = (D().videos || []).find(function (x) { return x.id === id; }); return v ? cut(v.title, 18) : id; };
      if (cs.length > 1) out.push('유튜브 설명란으로 온 사람이 강의로 넘어가는 비율은 영상마다 다릅니다 — ‘' + esc(vt(cs[0].id)) + '’ ' + P1(cs[0].r) + ', ‘' + esc(vt(cs[cs.length - 1].id)) + '’ ' + P1(cs[cs.length - 1].r) + '(<a href="#sources">유입 출처 → 영상별</a>).');
    }
    return out;
  }
  function expBox(id, from, pbId) {
    var st = S(), e = EXPS[id];
    var state = st.exp[id] === 'B' ? '<span class="ad-badge ad-badge--ok">' + icon('check', 'ad-ico--xs') + 'B안 확정됨 — 사이트 방문자 모두에게 보임</span>'
      : st.expRun[id] ? '<a class="ad-badge ad-badge--blue" href="#fn-running" data-act="fn-goto-run">' + icon('flask', 'ad-ico--xs') + '실험 진행 중 · 아래 진행 중 실험에서 보기</a>'
        : '<button class="ad-btn ad-btn--primary" type="button" data-act="fn-exp-start" data-exp="' + esc(id) + '" data-from="' + esc(from) + '"' + (pbId ? ' data-pb="' + esc(pbId) + '"' : '') + '>' + icon('flask', 'ad-ico--sm') + '실험으로 적용하기</button>';
    return '<div class="fn-apply"><p class="fn-apply__k">' + icon('flask', 'ad-ico--sm') + '바로 시험할 수 있는 B안 · ' + esc(e.name) + '</p>' +
      '<div class="ad-ab"><div class="ad-ab__arm"><p class="ad-ab__k"><span class="ad-ab__sw" style="background:var(--series-a)"></span>A안(지금)</p><p class="ad-ab__text ad-small">' + esc(e.a) + '</p></div>' +
      '<div class="ad-ab__arm is-win"><p class="ad-ab__k"><span class="ad-ab__sw" style="background:var(--series-b)"></span>B안 · ' + esc(e.where) + '</p><p class="ad-ab__text ad-small">' + esc(e.b) + '</p></div></div>' +
      '<div class="ad-btns" style="margin-top:12px">' + state + '<a class="ad-btn ad-btn--ghost ad-btn--sm" href="' + esc(K.site(e.page)) + '" target="_blank" rel="noopener">B안 자리 보기' + icon('ext', 'ad-ico--sm') + '<span class="ad-sr">(새 창)</span></a></div>' +
      '<p class="ad-small ad-muted" style="margin-top:8px">누르면 사이트 방문자의 절반(방문자마다 고정)에게 B안이 보입니다. 기준 행동(' + esc(e.metric) + ')을 7일 동안 A·B 로 나눠 세고, 표본이 충분할 때 확정합니다.</p></div>';
  }
  function diagSection(R, d, results) {
    var h = '<section class="ad-sec fn-diag" aria-labelledby="fn-diag-t"><h2 class="ad-sec__t" id="fn-diag-t">' + icon('spark') + 'AI 진단' + exTag() + '</h2>';
    if (!R.big) return h + '<div class="ad-empty">' + (R.cnt[0] ? '이 기록에서는 다음 단계로 가지 않고 나간 사람이 없습니다.' : '이 퍼널에 맞는 방문이 아직 없습니다.') + '</div></section>';
    var t = R.big, id = expForTr(t.from, t.to), from = '퍼널 ' + R.f.name + ' · ' + stepName(t.from) + ' → ' + stepName(t.to);
    var pbs = recommend(R, t, d, 3), pm = pbs.find(function (p) { return p.expId === id; }) || pbs[0];
    h += '<div class="fn-diag__main"><p class="fn-diag__k">' + icon('spark', 'ad-ico--sm') + '규칙 기반 진단 · 수치는 이 화면의 계산값</p><ul class="fn-diag__list">' + sentences(R, d, results).map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' +
      (id ? expBox(id, from, pm && pm.id) : '<p class="fn-apply fn-apply--none">' + icon('info', 'ad-ico--sm') + '이 단계에 맞는 B안 조각은 아직 사이트에 없습니다. 아래 추천 전략을 운영 단계 작업 목록에 담아 두면 다음 개발 때 B안으로 만듭니다.</p>') + '</div></section>';
    return h;
  }
  // 추천 전략: 이 단계에 맞는 이탈 차단 사례 2~3개(한 줄)
  function pbRow(R, d) {
    var t = R.big, from = '퍼널 ' + R.f.name + ' · ' + stepName(t.from) + ' → ' + stepName(t.to), pbs = recommend(R, t, d, 3);
    return '<section class="ad-sec" aria-labelledby="fn-pbrow-t"><div class="ad-tblcap"><h2 class="ad-sec__t" id="fn-pbrow-t" style="margin:0">' + icon('target') + '추천 전략 · 다른 플랫폼은 ‘' + esc(pbStageOf(R, t)[0]) + '’에서 이렇게 합니다</h2><a class="ad-small" href="#playbook">이탈 차단 전략 전체 보기</a></div>' +
      (pbs.length ? '<div class="fn-pbs fn-pbs--3">' + pbs.map(function (p) { return pbCard(p, { mini: true, from: from }); }).join('') + '</div>' : '<div class="ad-empty fn-pb-empty">사례 준비 중입니다. 다른 플랫폼의 이탈 차단 사례가 들어오면 여기에 이 단계에 맞는 2~3개가 붙습니다.</div>') + '</section>';
  }
  // 진행 중 실험 — 이 브라우저의 실제 노출(exp 이벤트)과 그 뒤 행동을 A/B 로 센다
  function vidHashVariant(id) {
    var v = ''; try { v = JSON.parse(localStorage.getItem('adamsmith.vid.v1')) || ''; } catch (e) { v = ''; }
    if (!v) return '';
    var s = v + ':' + id, h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 2 ? 'B' : 'A';
  }
  function expReal(id) {
    var o = { A: { n: 0, course: 0, add: 0, paid: 0 }, B: { n: 0, course: 0, add: 0, paid: 0 } };
    mine().sess.forEach(function (S1) {
      var at = -1, v = '';
      S1.evs.forEach(function (e, i) { if (at < 0 && e.e === 'exp' && e.x && e.x.id === id && (e.x.v === 'A' || e.x.v === 'B')) { at = i; v = e.x.v; } });
      if (at < 0) return;
      var r = o[v], c = false, a = false, p = false;
      for (var j = at + 1; j < S1.evs.length; j++) { var e = S1.evs[j]; if (e.e === 'pv' && /^course/.test(pageKind(e.p))) c = true; if (e.e === 'cart_add' || e.e === 'finder_add') a = true; if (e.e === 'purchase') p = true; }
      r.n++; if (c) r.course++; if (a) r.add++; if (p) r.paid++;
    });
    return o;
  }
  function runCard(id) {
    var st = S(), e = EXPS[id], run = st.expRun[id], done = st.exp[id] === 'B', real = expReal(id), me = vidHashVariant(id), pv = PREVIEW[id];
    var h = '<article class="ad-card fn-run' + (done ? ' is-done' : '') + '" data-exp="' + esc(id) + '"><div class="ad-tblcap"><div><p class="ad-card__t">' + esc(e.name) +
      (done ? '<span class="ad-badge ad-badge--ok">' + icon('check', 'ad-ico--xs') + 'B안 확정 — 방문자 모두 B</span>' : '<span class="ad-badge ad-badge--blue">진행 중 · 방문자 반반</span>') + '</p>' +
      '<p class="ad-card__d">' + esc(id) + ' · ' + esc(e.where) + (run ? ' · 시작 ' + esc(K.hm(run.start)) + (run.from ? ' · ' + esc(run.from) : '') : '') + (done && st.expDone[id] ? ' · 확정 ' + esc(K.hm(st.expDone[id].end)) : '') + '</p></div>' +
      '<a class="ad-btn ad-btn--ghost ad-btn--sm" href="' + esc(K.site(e.page)) + '" target="_blank" rel="noopener">사이트에서 보기' + icon('ext', 'ad-ico--sm') + '<span class="ad-sr">(새 창)</span></a></div>';
    if (!done) {
      h += '<p class="ad-small" style="margin-top:8px;color:var(--ink-2)">' + icon('info', 'ad-ico--xs') + ' 이 브라우저의 방문자 번호로는 <b>' + (me || '(아직 방문 기록 없음)') + (me ? '안' : '') + '</b>이 보입니다. 새 방문자(다른 브라우저·시크릿 창)는 반반으로 나뉩니다.</p>';
      h += '<div class="ad-tablewrap" style="margin-top:10px"><table class="ad-table fn-runt"><thead><tr><th>안</th><th class="n">노출(방문)</th><th class="n">강의 상세로</th><th class="n">담기</th><th class="n">결제</th></tr></thead><tbody>' +
        ['A', 'B'].map(function (k) { var r = real[k]; return '<tr data-v="' + k + '"><td><span class="ad-sw" style="background:var(--series-' + k.toLowerCase() + ')"></span> ' + k + '안</td><td class="n" data-k="n">' + num(r.n) + '</td><td class="n">' + num(r.course) + '</td><td class="n">' + num(r.add) + '</td><td class="n">' + num(r.paid) + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="ad-small ad-muted" style="margin-top:6px">이 브라우저의 실제 기록(사이트 방문 기록의 실험 노출과 그 뒤 행동)입니다. 운영 단계에서는 모든 방문자의 기록으로 셉니다.</p>';
      if (U.preview[id] && pv) {
        var ra = pv.A.hits / pv.A.views, rb = pv.B.hits / pv.B.views, lift = Math.round((rb / ra - 1) * 100), enough = pv.A.views >= 1000 && pv.B.views >= 1000 && pv.A.hits >= 100 && pv.B.hits >= 100;
        h += '<div class="fn-preview"><p class="ad-strong">7일 결과 미리 보기' + EX + '</p><div class="ad-tablewrap" style="margin-top:8px"><table class="ad-table" style="min-width:420px"><thead><tr><th>안</th><th class="n">노출</th><th class="n">' + esc(e.metric) + '</th><th class="n">비율</th></tr></thead><tbody>' +
          ['A', 'B'].map(function (k) { var r = pv[k]; return '<tr><td>' + k + '안</td><td class="n">' + num(r.views) + '</td><td class="n">' + num(r.hits) + '</td><td class="n">' + P1(r.hits / r.views) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
          '<div class="ad-verdict"><span class="ad-verdict__big">' + (lift >= 0 ? '+' : '') + lift + '%</span><div><p class="ad-strong">' + (enough ? (lift > 0 ? 'B안 우세' : 'A안 유지') : '표본 부족') + ' · ' + (enough ? '표본 충분' : '7일 더 필요') + EX + '</p><p class="ad-small ad-muted">' + esc(e.metric) + ' 비율 A ' + P1(ra) + ' → B ' + P1(rb) + '. 실제 운영에서는 7일이 지나고 기준(두 안 노출 1,000회·' + esc(e.metric) + ' 100회 이상)을 넘으면 오늘의 제안에 결과가 올라옵니다.</p></div></div></div>';
      }
      h += '<div class="ad-btns" style="margin-top:12px"><button class="ad-btn ad-btn--line" type="button" data-act="fn-exp-preview" data-exp="' + esc(id) + '" aria-pressed="' + !!U.preview[id] + '">' + (U.preview[id] ? '미리 보기 닫기' : '7일 결과 미리 보기(예시)') + '</button>' +
        '<button class="ad-btn ad-btn--primary" type="button" data-act="fn-exp-b" data-exp="' + esc(id) + '">' + icon('check', 'ad-ico--sm') + 'B안 확정</button>' +
        '<button class="ad-btn ad-btn--ghost" type="button" data-act="fn-exp-stop" data-exp="' + esc(id) + '">' + icon('pause', 'ad-ico--sm') + '실험 멈춤</button></div>';
    } else {
      h += '<p class="ad-small" style="margin-top:8px;color:var(--ink-2)">사이트 방문자 모두에게 B안(' + esc(e.b) + ')이 보입니다.</p><div class="ad-btns" style="margin-top:10px"><button class="ad-btn ad-btn--line ad-btn--sm" type="button" data-act="fn-exp-a" data-exp="' + esc(id) + '">' + icon('undo', 'ad-ico--sm') + '되돌리기(A안)</button></div>';
    }
    return h + '</article>';
  }
  function runningSection() {
    var st = S(), ids = Object.keys(EXPS).filter(function (id) { return st.expRun[id] || st.exp[id] === 'B'; });
    var h = '<section class="ad-sec" id="fn-running" aria-labelledby="fn-run-t"><h2 class="ad-sec__t" id="fn-run-t">' + icon('flask') + '진행 중 실험 <span class="ad-badge ad-badge--blue">' + Object.keys(st.expRun).filter(function (k) { return EXPS[k]; }).length + '</span></h2>' +
      '<p class="ad-sec__d">사이트의 B안 조각 4개(커리큘럼 요약·결제 단추 아래 해지 안내·답변 아래 강의 띠·장 목차 위 강의 띠)를 방문자 반반으로 보여 줍니다. 사이트 방문 기록이 방문자마다 A·B 를 고정 배정합니다.</p>';
    if (!ids.length) return h + '<div class="ad-empty">진행 중인 실험이 없습니다. 위 AI 진단의 [실험으로 적용하기], 오늘의 제안, 이탈 차단 전략에서 시작합니다.</div></section>';
    return h + '<div class="fn-runs">' + ids.map(runCard).join('') + '</div></section>';
  }

  K.VIEWS.funnel = function () {
    var sub = (location.hash.split('/')[1] || '');
    var fs = allFunnels();
    if (sub && fs.some(function (f) { return f.id === sub; })) U.funnel = sub;
    if (!fs.some(function (f) { return f.id === U.funnel; })) U.funnel = 'f-sub';
    var list = sessionsFor(U);
    var results = fs.map(function (f) { return runFunnel(f, list); });
    var R = results.find(function (r) { return r.f.id === U.funnel; });
    var d = R.big ? dropDetail(R, R.big) : null;
    var h = K.head('한눈에', '퍼널·이탈', '방문자가 어디서 들어와 어느 단계에서 나가는지 봅니다. 가장 많이 나가는 단계에는 AI 진단이 원인 후보와 다른 플랫폼의 이탈 차단 사례를 붙이고, <b>[실험으로 적용하기]</b>를 누르면 사이트 방문자 절반에게 B안이 보입니다.',
      '<button class="ad-btn ad-btn--primary ad-btn--sm" type="button" data-act="fn-new">' + icon('edit', 'ad-ico--sm') + '퍼널 만들기</button><a class="ad-btn ad-btn--line ad-btn--sm" href="#sources">' + icon('route', 'ad-ico--sm') + '유입 출처</a>', 'funnel');
    h += toolbar(true);
    h += '<div class="fn-picks" role="group" aria-label="퍼널 고르기">' + results.map(pickCard).join('') + '</div>';
    h += '<div class="fn-main">' + flowCard(R) + diagSection(R, d, results) + '</div>';
    if (R.big) h += pbRow(R, d);
    if (d) h += dropSection(R, d);
    h += srcTable(R);
    h += runningSection();
    return h;
  };

  // ── 유입 출처 ──
  function demos() {
    var vids = (D().videos || []).slice().sort(function (a, b) { return (b.views || 0) - (a.views || 0); });
    var v = vids.find(function (x) { return x.status === 'published'; }) || vids[0];
    var list = [];
    if (v) list.push({ src: 'yt-desc', label: '유튜브 설명란 링크 → 홈', note: '영상 「' + cut(v.title, 26) + '」', href: '?utm_source=youtube&utm_medium=description&utm_campaign=' + v.id });
    list.push({ src: 'ai-chatgpt', label: 'ChatGPT 답변 → 질문 답변 쪽', note: '「전인구 강의는 어디서 듣나요?」', href: 'answers/where-to-watch/?utm_source=chatgpt' });
    list.push({ src: 'kakao', label: '카카오톡 채널 → 구독반 상세', note: '「2026 실전 투자반」', href: 'classes/practical-2026/?utm_source=kakao&utm_medium=channel' });
    list.push({ src: 'naver-search', label: '네이버 검색 → 질문 답변 쪽', note: '「사이드카란 무엇인가요?」', href: 'answers/sidecar/?utm_source=naver&utm_medium=search' });
    list.push({ src: 'ai-perplexity', label: 'Perplexity 답변 → 가격 답변', note: '「2026 실전 투자반은 얼마이고…」', href: 'answers/practical-2026-price/?utm_source=perplexity' });
    if (v) list.push({ src: 'yt-pin', label: '유튜브 고정 댓글 → 정규 강의', note: '「왕초보 주식투자」', href: 'classes/beginner-stock/?utm_source=youtube&utm_medium=pinned_comment&utm_campaign=' + v.id });
    return list;
  }
  K.VIEWS.sources = function () {
    var list = sessionsFor({ mode: U.mode, days: U.days, grp: 'all' });
    var st = sourceStats(list), cs = campaignStats(list), ex = exTag();
    var tot = { visits: 0, course: 0, add: 0, paid: 0, revenue: 0 };
    Object.keys(st).forEach(function (k) { var o = st[k]; tot.visits += o.visits; tot.course += o.course; tot.add += o.add; tot.paid += o.paid; tot.revenue += o.revenue; });
    var h = K.head('한눈에', '유입 출처', '방문이 어디서 왔고, 그중 얼마가 강의 상세·담기·결제까지 갔는지 봅니다. 출처는 주소의 utm 값을 먼저 보고, 없으면 직전 사이트로 판정합니다(사이트 방문 기록 — 이 브라우저에만 저장).',
      '<a class="ad-btn ad-btn--line ad-btn--sm" href="#funnel">' + icon('funnel', 'ad-ico--sm') + '퍼널·이탈</a>', 'route');
    h += toolbar(false);
    h += '<div class="ad-kpis fn-kpis"><div class="ad-kpi"><span class="ad-kpi__k">방문' + ex + '</span><span class="ad-kpi__v">' + num(tot.visits) + '<small>번</small></span><span class="ad-kpi__d">강의 상세까지 ' + P0(tot.visits ? tot.course / tot.visits : 0) + '</span></div>' +
      '<div class="ad-kpi"><span class="ad-kpi__k">담기' + ex + '</span><span class="ad-kpi__v">' + num(tot.add) + '<small>번</small></span><span class="ad-kpi__d">방문의 ' + P1(tot.visits ? tot.add / tot.visits : 0) + '</span></div>' +
      '<div class="ad-kpi"><span class="ad-kpi__k">결제' + ex + '</span><span class="ad-kpi__v">' + num(tot.paid) + '<small>건</small></span><span class="ad-kpi__d">결제 전환 ' + P1(tot.visits ? tot.paid / tot.visits : 0) + '</span></div>' +
      '<div class="ad-kpi"><span class="ad-kpi__k">매출' + ex + '</span><span class="ad-kpi__v">' + num(Math.round(tot.revenue / 10000)) + '<small>만 원</small></span><span class="ad-kpi__d">결제 완료 기준 · 시연 결제 포함</span></div></div>';
    // 묶음별 방문·전환
    var g = GROUPS.map(function (gr) { var o = { id: gr.id, name: gr.name, visits: 0, paid: 0, revenue: 0 }; gr.src.forEach(function (s) { var x = st[s]; if (x) { o.visits += x.visits; o.paid += x.paid; o.revenue += x.revenue; } }); o.conv = o.visits ? o.paid / o.visits : 0; return o; });
    Object.keys(st).forEach(function (s) { if (!GROUP_OF[s]) { var o = g[g.length - 1], x = st[s]; o.visits += x.visits; o.paid += x.paid; o.revenue += x.revenue; o.conv = o.visits ? o.paid / o.visits : 0; } });
    var maxV = Math.max.apply(null, g.map(function (x) { return x.visits; }).concat([1])), maxC = Math.max.apply(null, g.map(function (x) { return x.conv; }).concat([0.0001]));
    var gWith = g.filter(function (x) { return x.visits; });
    var bestG = gWith.length > 1 ? gWith.reduce(function (a, b) { return b.conv > a.conv ? b : a; }) : null;
    h += '<div class="ad-grid ad-grid--2 ad-sec"><div class="ad-card"><p class="ad-card__t">출처 묶음별 방문' + ex + '</p><p class="ad-card__d">방문 수와 전체에서의 비중</p><div class="ad-hbars" style="margin-top:14px">' +
      g.map(function (x) { return hbar(x.name, x.visits / maxV, num(x.visits), P0(tot.visits ? x.visits / tot.visits : 0), ''); }).join('') + '</div></div>' +
      '<div class="ad-card"><p class="ad-card__t">출처 묶음별 결제 전환' + ex + '</p><p class="ad-card__d">방문 중 결제까지 간 비율 · 초록이 가장 높음</p><div class="ad-hbars" style="margin-top:14px">' +
      g.map(function (x) { return hbar(x.name, x.conv / maxC, P1(x.conv), num(x.paid) + '건', x === bestG ? 'ok' : ''); }).join('') + '</div>' +
      (bestG && bestG.id === 'ai' ? '<p class="ad-small fn-callout">' + icon('spark', 'ad-ico--xs') + ' AI 답변(ChatGPT·Perplexity 등)으로 온 방문은 전체의 ' + P0(tot.visits ? bestG.visits / tot.visits : 0) + '뿐이지만 결제 전환은 ' + P1(bestG.conv) + '로 가장 높습니다 — AI 답변에 인용되는 쪽(질문 답변·강의 상세)을 늘리는 이유입니다.</p>' : '') + '</div></div>';
    // 출처 표
    var min = U.mode === 'mine' ? 1 : 30;
    var srcRows = [];
    g.forEach(function (gr) {
      if (!gr.visits) return;
      var ids = (GROUPS.find(function (x) { return x.id === gr.id; }) || { src: [] }).src.slice();
      if (gr.id === 'etc') Object.keys(st).forEach(function (s) { if (!GROUP_OF[s]) ids.push(s); });
      var agg = { visits: 0, course: 0, add: 0, paid: 0, revenue: 0 };
      var kids = ids.filter(function (s) { return st[s]; }).map(function (s) { var o = st[s]; agg.course += o.course; agg.add += o.add; agg.paid += o.paid; agg.revenue += o.revenue; agg.visits += o.visits; return Object.assign({ name: srcName(s), id: s }, o); }).sort(function (a, b) { return b.visits - a.visits; });
      srcRows.push(Object.assign({ name: gr.name, id: gr.id, grp: true }, agg));
      kids.forEach(function (k) { srcRows.push(k); });
    });
    var cands = srcRows.filter(function (r) { return !r.grp && r.visits >= min; });
    var conv = function (r) { return r.visits ? r.paid / r.visits : 0; };
    var best = cands.length > 1 ? cands.reduce(function (a, b) { return conv(b) > conv(a) ? b : a; }) : null, worst = cands.length > 1 ? cands.reduce(function (a, b) { return conv(b) < conv(a) ? b : a; }) : null;
    h += '<section class="ad-sec" aria-labelledby="fn-st-t"><div class="ad-tblcap"><h2 class="ad-sec__t" id="fn-st-t" style="margin:0">' + icon('route') + '출처별 방문 → 결제' + ex + '</h2><p class="ad-small ad-muted">초록 = 결제 전환이 가장 높은 출처 · 빨강 = 가장 낮은 출처(방문 ' + min + '번 이상)</p></div>' +
      (srcRows.length ? '<div class="ad-tablewrap"><table class="ad-table fn-srct"><thead><tr><th>출처</th><th class="n">방문</th><th class="n">강의 상세 도달</th><th class="n">담기</th><th class="n">결제</th><th class="n">결제 전환</th><th class="n">매출' + (U.mode === 'mine' ? '(시연)' : '') + '</th><th>방문 비중</th></tr></thead><tbody>' +
        srcRows.map(function (r) {
          var tone = r === best ? ' is-best' : r === worst ? ' is-worst' : '';
          return '<tr class="' + (r.grp ? 'fn-grp-row' : 'fn-src-row') + '" data-src="' + esc(r.id) + '"><td class="' + (r.grp ? 'ad-rowt' : 'fn-indent') + '">' + esc(r.name) + '</td><td class="n" data-k="visits">' + num(r.visits) + '</td><td class="n">' + num(r.course) + '<small class="fn-go">' + P0(r.visits ? r.course / r.visits : 0) + '</small></td><td class="n">' + num(r.add) + '</td><td class="n" data-k="paid">' + num(r.paid) + '</td><td class="n fn-conv' + tone + '">' + P1(conv(r)) + '</td><td class="n">' + num(r.revenue) + '원</td>' +
            '<td><span class="fn-mini"><span style="width:' + (tot.visits ? r.visits / tot.visits * 100 : 0).toFixed(1) + '%"></span></span></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="ad-empty">이 브라우저의 방문 기록이 아직 없습니다. 아래 [시연] 단추로 출처를 정해 사이트를 열어 보세요.</div>') + '</section>';
    // 유튜브 영상별
    var vids = (D().videos || []).map(function (v) { var o = cs[v.id] || { visits: 0, course: 0, add: 0, paid: 0, revenue: 0 }; return Object.assign({ v: v }, o); });
    Object.keys(cs).forEach(function (k) { if (!vids.some(function (x) { return x.v.id === k; })) vids.push(Object.assign({ v: { id: k, title: '영상 ' + k, views: null, img: '' } }, cs[k])); });
    vids = vids.filter(function (x) { return U.mode !== 'mine' || x.visits; }).sort(function (a, b) { return b.visits - a.visits || (b.v.views || 0) - (a.v.views || 0); });
    var vmin = U.mode === 'mine' ? 1 : 30, vc = vids.filter(function (x) { return x.visits >= vmin; });
    var vconv = function (x) { return x.visits ? x.paid / x.visits : 0; };
    var vb = vc.length > 1 ? vc.reduce(function (a, b) { return vconv(b) > vconv(a) ? b : a; }) : null, vw = vc.length > 1 ? vc.reduce(function (a, b) { return vconv(b) < vconv(a) ? b : a; }) : null;
    h += '<section class="ad-sec" aria-labelledby="fn-vid-t"><div class="ad-tblcap"><h2 class="ad-sec__t" id="fn-vid-t" style="margin:0">' + icon('video') + '유튜브 영상별 · 설명란 링크(캠페인 = 영상 id)' + ex + '</h2><p class="ad-small ad-muted">조회수는 공개 값(' + esc(D().buildDate || '') + ' 수집) · 방문·결제는 ' + (U.mode === 'mine' ? '이 브라우저 기록' : '예시') + '</p></div>' +
      (vb && vw ? '<p class="ad-small fn-callout" style="margin-bottom:10px">' + icon('spark', 'ad-ico--xs') + ' 같은 설명란 링크라도 영상마다 결제 전환이 다릅니다 — 가장 높은 ‘' + esc(cut(vb.v.title, 24)) + '’ ' + P1(vconv(vb)) + ', 가장 낮은 ‘' + esc(cut(vw.v.title, 24)) + '’ ' + P1(vconv(vw)) + '. 조회수가 많다고 결제가 많은 것은 아닙니다.</p>' : '') +
      (vids.length ? '<div class="ad-tablewrap"><table class="ad-table fn-vidt"><thead><tr><th>영상</th><th class="n">조회수</th><th class="n">방문</th><th class="n">강의 상세</th><th class="n">결제</th><th class="n">결제 전환</th><th class="n">매출</th></tr></thead><tbody>' +
        vids.map(function (x) {
          var tone = x === vb ? ' is-best' : x === vw ? ' is-worst' : '';
          return '<tr data-camp="' + esc(x.v.id) + '"><td><div class="ad-cellflex">' + (x.v.img ? '<img class="ad-thumb" src="../assets/img/' + esc(x.v.img) + '" alt="" width="72" height="41" loading="lazy">' : '') + '<div><a class="ad-rowt" href="' + esc(K.site('/videos/' + x.v.id + '/')) + '" target="_blank" rel="noopener">' + esc(cut(x.v.title, 40)) + '</a><br><span class="ad-rows">' + esc(x.v.date ? String(x.v.date).replace(/-/g, '.') : '') + ' · ' + esc(x.v.id) + '</span></div></div></td>' +
            '<td class="n ad-muted">' + (x.v.views != null ? num(x.v.views) : '—') + '</td><td class="n">' + num(x.visits) + '</td><td class="n">' + num(x.course) + '</td><td class="n">' + num(x.paid) + '</td><td class="n fn-conv' + tone + '">' + (x.visits ? P1(vconv(x)) : '—') + '</td><td class="n">' + num(x.revenue) + '원</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="ad-empty">내 기록에 유튜브 설명란(캠페인 붙은) 방문이 없습니다. 아래 첫 번째 [시연] 단추로 열어 보세요.</div>') + '</section>';
    // 시연
    h += '<section class="ad-sec" aria-labelledby="fn-demo-t"><h2 class="ad-sec__t" id="fn-demo-t">' + icon('ext') + '[시연] 이 출처에서 온 것처럼 사이트 열기</h2><p class="ad-sec__d">새 창으로 열어 돌아다니다(강의 보기·담기·시연 결제) 돌아오면, ‘내 기록’에 그 출처로 잡힙니다. 새 창은 새 방문으로 셉니다(같은 창에서는 30분 동안 같은 방문).</p><div class="fn-demos">' +
      demos().map(function (x) {
        var url = K.site('/' + x.href.replace(/^\//, ''));
        return '<a class="fn-demo" href="' + esc(url) + '" target="_blank" rel="noopener" data-demo="' + esc(x.src) + '"><span class="fn-demo__src">' + esc(srcName(x.src)) + '</span><span class="fn-demo__t">' + esc(x.label) + '</span><span class="fn-demo__n">' + esc(x.note) + '</span><code>' + esc(x.href) + '</code><span class="fn-demo__go">새 창으로 열기' + icon('ext', 'ad-ico--xs') + '</span></a>';
      }).join('') + '</div>' +
      '<p class="ad-note fn-ops" style="margin-top:14px">' + icon('info') + '<span><b>운영 단계</b> — 유튜브 설명란·고정 댓글의 사이트 링크를 영상마다 utm 이 붙은 주소(예: <code>?utm_source=youtube&amp;utm_medium=description&amp;utm_campaign=영상 id</code>)로 바꾸면 ‘어느 영상이 결제를 만들었는지’가 위 영상별 표에 그대로 나옵니다. utm 이 없는 링크로 들어오면 ‘유튜브(기타)’로 묶여 영상별로 나눌 수 없습니다. 카카오톡 채널·텔레그램·인스타그램 링크도 같은 방식입니다.</span></p></section>';
    return h;
  };

  // ── 이탈 차단 전략(플레이북) ──
  function presetResults() {
    var list = sessionsFor({ mode: 'all', days: 14, grp: 'all' });
    return PRESET.map(function (f) { return runFunnel(f, list); });
  }
  // 가장 효과가 클 곳: 그 단계에서 다음으로 이어지는 비율이 지금보다 10% 늘면(예: 8% → 8.8%) 매주 더 생기는 결제 규모.
  // 나간 사람 모두가 결제했을 것처럼 셈하지 않는다(과장 방지). 순서만 정하는 데 쓰고 화면에는 '예시 데이터로 계산'이라고 적는다
  function lossOf(R) {
    var t = R.big; if (!t || !t.n0) return null;
    var wk = 7 / 14, lostWk = (t.n0 - t.n1) * wk, moreWk = t.n0 * wk * t.go * 0.1, after = t.n1 ? R.cnt[R.n - 1] / t.n1 : 0;
    var tot = 0, n = 0;
    R.hits.forEach(function (hh) { if (hh.k === R.n) hh.S.evs.forEach(function (e) { if (e.e === 'purchase') { tot += +((e.x && e.x.total) || 0); n++; } }); });
    var avg = n ? tot / n : 0;
    return { R: R, t: t, lostWk: lostWk, moreWk: moreWk, paidWk: moreWk * after, value: moreWk * after * avg };
  }
  // 우리 업종 규칙(요약) — sources/funnel_playbook_rules.md(확인 2026-10-27)를 줄인 것. 법률 자문이 아니다
  var RULES_SUM = [
    ['정기결제 금액 인상·무료→유료 전환', '바뀌기 전 30일 이내에 따로 동의를 받고, 바뀌기 전후 가격과 해지 조건·방법을 알립니다. 가입 때 한꺼번에 받은 동의는 원칙적으로 인정되지 않습니다.', '전자상거래법 제21조의2·시행령(2025-02-14 시행), 공정위 문답서(2025-02-13)'],
    ['해지', '가입보다 어렵게 만들 수 없습니다. 단계 수와 해지 링크를 찾기 쉬운지로 판단하고, 마이페이지처럼 한 번 눌러 가는 곳에 둡니다. 전화로만 받거나 붙잡기 창을 반복하면 안 됩니다.', '전자상거래법 제21조의2(취소·탈퇴 방해), 다크패턴 방지 가이드라인(2026-10-06)'],
    ['나가려는 순간 창·반복 안내', '한 번만, 그리고 최소 7일 동안 다시 보지 않기를 고를 수 있어야 합니다. 망신 주는 문구는 쓰지 않습니다.', '반복간섭 기준(시행령)'],
    ['마감·카운트다운', '실제 개강일·정원·가격 변경일만 날짜로 씁니다. 날짜를 넘겨 같은 조건으로 다시 파는 반복 마감은 제재된 사례가 있습니다(메가스터디교육·챔프스터디 과징금 7억 5,100만 원, 2025-01-16).', '표시광고법 제3조, 전자상거래법 제21조 제1항 제1호'],
    ['후기·수익 표현', '수익 화면을 인증하는 후기, 목표 수익률, 손실이 나면 환불한다는 광고는 쓰지 않습니다. 학습 경험 후기와 투자 유의 문구로 대신합니다. 대가를 받은 후기는 첫머리에 표시합니다.', '자본시장법(2024-08-14 시행), 추천·보증 심사지침'],
    ['총액·같이 사기·미리 체크', '총액(책 배송비 포함)을 처음부터 보여 주고, 같이 사기·광고 수신 동의는 미리 체크하지 않으며 같은 크기로 둡니다.', '순차공개 가격책정·특정옵션 사전선택·잘못된 계층구조'],
    ['장바구니 알림·할인 안내', '광고성 메시지는 미리 동의한 사람에게만, 첫머리에 ‘(광고)’, 밤 9시~아침 8시는 따로 동의를 받습니다. 결제 예정 안내 같은 정보성 메시지에는 다른 상품 권유를 섞지 않습니다.', '정보통신망법 제50조']
  ];
  function rulesFold() {
    return '<details class="fn-rules ad-sec"><summary>' + icon('lock', 'ad-ico--sm') + '<b>우리 업종 규칙</b><span class="ad-muted">· 금융 교육·구독 결제에서 지킬 것 7가지(요약 · 확인 2026.10.27 · 법률 자문 아님)</span></summary>' +
      '<ol class="fn-rules__list">' + RULES_SUM.map(function (r) { return '<li><b>' + esc(r[0]) + '</b><p>' + esc(r[1]) + '</p><span class="fn-rules__basis">' + esc(r[2]) + '</span></li>'; }).join('') + '</ol>' +
      '<p class="ad-small ad-muted">공정위 「다크패턴 방지를 위한 온라인 인터페이스 운영 가이드라인」(2026-10-06 통합본)의 13개 유형 — 편취형: 숨은 갱신·순차공개 가격책정 / 오도형: 특정옵션 사전선택·잘못된 계층구조·거짓 할인·거짓 추천·유인 판매·위장 광고·속임수 질문 / 방해형: 취소·탈퇴 방해·숨겨진 정보·가격비교 방해 / 압박형: 반복간섭. 각 사례 카드의 배지가 이 기준의 판정입니다.</p></details>';
  }
  K.VIEWS.playbook = function () {
    var pb = playbook(), st = S();
    var results = presetResults();
    var losses = results.map(lossOf).filter(Boolean).sort(function (a, b) { return b.value - a.value; });
    var hot = {};
    results.forEach(function (R) { if (R.big) pbStageOf(R, R.big).slice(0, 1).forEach(function (s) { hot[s] = 1; }); });
    // 바로 적용할 만한 전략 = 지금 퍼널에서 가장 많이 나가는 단계에 맞고, 규제 조건 없이(적용 가능) 쓸 수 있는 사례
    var ready = pb.filter(function (p) { return p.comp === 'ok' && hot[p.stageName]; });
    var applied = ready.filter(pbApplied).length;
    var running = Object.keys(st.expRun).filter(function (k) { return EXPS[k]; }).length;
    var h = K.head('AI 자가진화 센터', '이탈 차단 전략', '강의·구독 플랫폼이 퍼널의 각 단계에서 이탈을 막으려고 실제로 하는 일을 모았습니다. 우리 사이트의 퍼널 수치에 맞춰 바로 적용할 만한 것을 먼저 보여 주고, B안 조각이 있는 전략은 <b>[우리 사이트에 적용하기]</b>로 바로 실험합니다. 금융 교육 업종에서 쓰면 안 되는 방식은 빨간 표시와 대안을 같이 둡니다.', '<a class="ad-btn ad-btn--line ad-btn--sm" href="#funnel">' + icon('funnel', 'ad-ico--sm') + '퍼널·이탈</a>', 'target');
    // 독려 띠
    var pctDone = ready.length ? Math.round(applied / ready.length * 100) : 0;
    h += '<section class="fn-push" aria-label="적용 현황"><div class="fn-push__nums"><div><b>' + ready.length + '</b><span>지금 데이터로 보면 바로 적용할 만한 전략</span></div><div><b>' + applied + '</b><span>적용함(실험·작업 목록)</span></div><div><b>' + running + '</b><span>진행 중 실험</span></div></div>' +
      '<div class="fn-push__bar" role="progressbar" aria-label="바로 적용할 만한 전략 중 적용한 비율" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pctDone + '"><span style="width:' + pctDone + '%"></span></div>' +
      '<p class="fn-push__d">' + (pb.length ? (ready.length ? '퍼널에서 가장 많이 나가는 단계(' + Object.keys(hot).join(' · ') + ')에 맞고 규제 조건 없이 쓸 수 있는 사례 ' + ready.length + '개 중 ' + applied + '개를 적용했습니다.' + (ready.length - applied > 0 ? ' 남은 ' + (ready.length - applied) + '개 가운데 B안 조각이 있는 ' + ready.filter(function (p) { return p.expId && !pbApplied(p); }).length + '개는 누르면 바로 실험이 시작되고, 나머지는 운영 단계 작업 목록에 담깁니다.' : ' 모두 적용했습니다. 실험 결과는 퍼널·이탈 화면에서 봅니다.') : '지금 퍼널의 큰 이탈 단계에 맞는 사례가 아직 없습니다.') : '사례가 들어오면 지금 퍼널 수치에 맞는 것부터 셉니다.') + '</p>' +
      (ready.length ? '<div class="ad-btns"><button class="ad-btn ad-btn--sm fn-push__btn" type="button" data-act="pb-stage" data-v="ready" data-scroll="1">바로 적용할 만한 ' + ready.length + '개만 보기</button></div>' : '') + '</section>';
    // 1순위
    var top = losses[0];
    if (top) {
      var tid = expForTr(top.t.from, top.t.to), rec = recommend(top.R, top.t, dropDetail(top.R, top.t), 1)[0];
      var from = '퍼널 ' + top.R.f.name + ' · ' + stepName(top.t.from) + ' → ' + stepName(top.t.to);
      h += '<section class="fn-first" aria-labelledby="fn-first-t"><p class="fn-first__k">' + icon('target', 'ad-ico--sm') + '가장 효과가 클 곳 · 1순위' + EX + '</p>' +
        '<h2 class="fn-first__t" id="fn-first-t">‘' + esc(top.R.f.name) + '’의 ‘' + esc(stepName(top.t.from)) + ' → ' + esc(stepName(top.t.to)) + '’에서 매주 약 ' + num(Math.round(top.lostWk)) + '명이 나갑니다</h2>' +
        '<p class="fn-first__d">이 단계에서 다음으로 가는 비율은 ' + P1(top.t.go) + '입니다. 이 비율이 지금보다 10%만 늘어도(' + P1(top.t.go) + ' → ' + P1(top.t.go * 1.1) + ') 매주 약 ' + num(Math.max(1, Math.round(top.moreWk))) + '명이 더 다음 단계로 가고, 지금의 결제 비율대로면 결제 약 ' + num(Math.max(1, Math.round(top.paidWk))) + '건 · ' + num(Math.max(1, Math.round(top.value / 10000))) + '만 원 규모입니다(예시 데이터로 계산 · 여섯 퍼널 중 가장 큼).</p>' +
        (rec ? '<p class="fn-first__d"><b>다른 플랫폼 사례</b> · ' + esc(rec.platform || '') + ' — ‘' + esc(rec.pattern || '') + '’' + (rec.metric && rec.metric.value ? ' <span class="ad-muted">(공개 수치: ' + esc(cut(rec.metric.value, 60)) + ')</span>' : '') + '</p>' : '') +
        '<div class="ad-btns">' + (tid ? (st.exp[tid] === 'B' ? '<span class="ad-badge ad-badge--ok">' + icon('check', 'ad-ico--xs') + 'B안 확정됨</span>' : st.expRun[tid] ? '<a class="ad-badge ad-badge--blue" href="#funnel" data-act="fn-goto-run">' + icon('flask', 'ad-ico--xs') + '실험 진행 중</a>' :
          '<button class="ad-btn ad-btn--primary" type="button" data-act="fn-exp-start" data-exp="' + esc(tid) + '" data-from="' + esc(from) + '"' + (rec ? ' data-pb="' + esc(rec.id) + '"' : '') + '>' + icon('flask', 'ad-ico--sm') + '실험으로 적용하기 · ' + esc(EXPS[tid].name) + '</button>') : '') +
        '<a class="ad-btn ad-btn--line" href="#funnel/' + esc(top.R.f.id) + '">퍼널에서 자세히</a></div>' +
        (losses.length > 1 ? '<p class="fn-first__d ad-small" style="margin-top:4px">다음 순위</p><ol class="fn-first__more" start="2">' + losses.slice(1, 4).map(function (l) { return '<li><b>' + esc(l.R.f.name) + '</b> · ' + esc(stepName(l.t.from)) + ' → ' + esc(stepName(l.t.to)) + ' — 매주 약 ' + num(Math.round(l.lostWk)) + '명 나감(' + P0(l.t.drop) + ') · 10% 개선 시 결제 약 ' + num(Math.max(0, Math.round(l.paidWk * 10) / 10)) + '건 · ' + num(Math.round(l.value / 10000)) + '만 원</li>'; }).join('') + '</ol>' : '') + '</section>';
    }
    h += rulesFold();
    if (!pb.length) return h + '<div class="ad-empty ad-sec">사례 준비 중입니다. 다른 플랫폼의 이탈 차단 사례(sources/funnel_playbook.json — 단계·플랫폼·전략·근거 링크·규제 판단)가 들어오면 빌드 때 여기에 단계별 카드로 채워집니다.</div>';
    // 단계 걸러 보기
    var stages = PB_STAGES.filter(function (s) { return pb.some(function (p) { return p.stageName === s; }); });
    pb.forEach(function (p) { if (stages.indexOf(p.stageName) < 0) stages.push(p.stageName); });
    if (U.pbStage !== 'all' && U.pbStage !== 'ready' && stages.indexOf(U.pbStage) < 0) U.pbStage = 'all';
    var only = U.pbStage === 'ready' ? function (p) { return ready.indexOf(p) >= 0; } : function () { return true; };
    h += '<div class="ad-tabs ad-sec" role="group" aria-label="단계로 걸러 보기"><button class="ad-tab" type="button" data-act="pb-stage" data-v="all" aria-pressed="' + (U.pbStage === 'all') + '">전체 <b>' + pb.length + '</b></button>' +
      '<button class="ad-tab" type="button" data-act="pb-stage" data-v="ready" aria-pressed="' + (U.pbStage === 'ready') + '">' + icon('target', 'ad-ico--xs') + '바로 적용할 만한 것 <b>' + ready.length + '</b></button>' +
      stages.map(function (s) { return '<button class="ad-tab" type="button" data-act="pb-stage" data-v="' + esc(s) + '" aria-pressed="' + (U.pbStage === s) + '">' + (hot[s] ? '<span class="fn-hotdot" aria-hidden="true"></span>' : '') + esc(s) + ' <b>' + pb.filter(function (p) { return p.stageName === s; }).length + '</b></button>'; }).join('') + '</div>';
    h += '<p class="ad-legend" style="margin:-4px 0 12px"><span><span class="fn-hotdot"></span>지금 퍼널에서 가장 많이 나가는 단계</span><span>' + compBadge({ comp: 'ok' }) + '</span><span>' + compBadge({ comp: 'caution' }) + '</span><span>' + compBadge({ comp: 'banned' }) + '</span></p>';
    stages.filter(function (s) { return U.pbStage === 'all' || U.pbStage === 'ready' || U.pbStage === s; }).forEach(function (s, si) {
      var items = pb.filter(function (p) { return p.stageName === s && only(p); }).sort(function (a, b) { return (a.comp === 'banned') - (b.comp === 'banned') || !!b.expId - !!a.expId; });
      if (!items.length) return;
      h += '<section class="ad-sec" aria-labelledby="pb-st-' + si + '"><h2 class="ad-sec__t" id="pb-st-' + si + '">' + (hot[s] ? '<span class="fn-hotdot" aria-hidden="true"></span>' : '') + esc(s) + ' <span class="ad-muted ad-small" style="font-weight:500">' + esc(PB_HINT[s] || '') + ' · ' + items.length + '개</span></h2><div class="fn-pbs">' + items.map(function (p) { return pbCard(p); }).join('') + '</div></section>';
    });
    // 작업 목록
    var todo = pb.filter(function (p) { return st.playbookTodo[p.id]; });
    h += '<section class="ad-sec" aria-labelledby="pb-todo-t"><h2 class="ad-sec__t" id="pb-todo-t">' + icon('list') + '운영 단계 작업 목록 <span class="ad-badge">' + todo.length + '</span></h2><p class="ad-sec__d">사이트에 B안 조각이 아직 없는 전략입니다. 운영 단계에서 B안으로 만들어 같은 방식(방문자 반반 → 7일 → 확정)으로 시험합니다.</p>' +
      (todo.length ? '<ol class="fn-todo">' + todo.map(function (p) { return '<li><b>' + esc(p.platform || '') + '</b> · ' + esc(p.pattern || '') + '<span class="ad-muted"> — ' + esc(p.stageName) + ' · 담은 때 ' + esc(K.hm(st.playbookTodo[p.id].at)) + '</span><button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-act="fn-todo-del" data-id="' + esc(p.id) + '">빼기</button></li>'; }).join('') + '</ol>' : '<div class="ad-empty">아직 담은 전략이 없습니다.</div>') + '</section>';
    return h;
  };

  // ── 오늘의 제안(승인함)에 '퍼널 진단 → 실험 제안' 카드 ──
  var PROPC = { sig: null, list: [] };
  function propCandidates() {
    var sig = mine().sig;
    if (PROPC.sig === sig) return PROPC.list;
    var results = presetResults(), seen = {}, out = [];
    results.map(lossOf).filter(Boolean).sort(function (a, b) { return b.value - a.value; }).forEach(function (l) {
      var id = expForTr(l.t.from, l.t.to);
      if (!id || seen[id]) return;
      seen[id] = 1;
      var d = dropDetail(l.R, l.t);
      out.push({ l: l, id: id, d: d, lines: sentences(l.R, d, results), pb: recommend(l.R, l.t, d, 1)[0] || null });
    });
    PROPC = { sig: sig, list: out.slice(0, 3) };
    return PROPC.list;
  }
  K.extraProps.push(function () {
    if (!D()) return [];
    return propCandidates().map(function (c) {
      var R = c.l.R, t = c.l.t, e = EXPS[c.id], key = 'funnel:' + c.id;
      var from = '퍼널 ' + R.f.name + ' · ' + stepName(t.from) + ' → ' + stepName(t.to);
      var plain = function (s) { return String(s).replace(/<[^>]+>/g, ''); };
      return {
        key: key, type: 'funnel', typeName: '퍼널 진단 → 실험 제안', short: '퍼널 실험', icon: 'funnel', loop: '퍼널 진단',
        title: '‘' + stepName(t.from) + ' → ' + stepName(t.to) + '’에서 ' + P0(t.drop) + '가 나갑니다 — ' + e.name + ' 실험',
        when: (D().buildDate || '') + 'T08:10:00+09:00',
        src: '퍼널 ‘' + R.f.name + '’ · 최근 14일 · 이 단계까지 온 ' + num(t.n0) + '명 중 ' + num(t.n0 - t.n1) + '명 나감',
        srcDetail: '규칙 기반 진단 · 예시 데이터 + 이 브라우저 기록' + (c.pb ? ' · 참고 사례: ' + (c.pb.platform || '') : ''),
        example: true, noEdit: true,
        text: [e.name, e.b].concat(c.lines.map(plain)).join('\n'),
        where: e.where + ' — 사이트 방문자 절반에게 B안(방문자마다 고정)',
        siteHref: K.site(e.page), siteLabel: 'B안 자리 보기',
        isDone: function () { var st = S(); return !!st.expRun[c.id] || st.exp[c.id] === 'B'; },
        draft: function () {
          return '<div class="ad-draft"><p class="ad-draft__k">' + icon('spark', 'ad-ico--xs') + 'AI 진단 · 규칙 기반 ' + EX + '</p><ul class="fn-diag__list fn-diag__list--sm">' + c.lines.slice(0, 3).map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' +
            '<div class="ad-draft__reco"><span class="ad-muted">B안 ·</span> ' + esc(e.b) + '</div>' +
            (c.pb ? '<p class="ad-small" style="margin-top:6px"><span class="ad-muted">참고 사례 ·</span> ' + esc(c.pb.platform || '') + ' — ' + esc(c.pb.pattern || '') + '</p>' : '') + '</div>';
        },
        actions: function (state) {
          var st = S(), link = '<a class="ad-btn ad-btn--ghost ad-btn--sm ad-push" href="' + esc(K.site(e.page)) + '" target="_blank" rel="noopener" data-site-link>B안 자리 보기' + icon('ext', 'ad-ico--sm') + '<span class="ad-sr">(새 창)</span></a>';
          if (state === 'done') return '<span class="ad-prop__state ad-prop__state--ok">' + icon('check', 'ad-ico--sm') + (st.exp[c.id] === 'B' ? 'B안 확정 — 사이트 방문자 모두에게 보입니다' : '실험 진행 중 — 사이트 방문자 절반에게 B안') + '</span><a class="ad-btn ad-btn--line ad-btn--sm" href="#funnel/' + esc(R.f.id) + '">퍼널·이탈에서 보기</a>' + link;
          return '<button class="ad-btn ad-btn--primary" type="button" data-act="fn-exp-start" data-exp="' + esc(c.id) + '" data-from="' + esc(from) + '"' + (c.pb ? ' data-pb="' + esc(c.pb.id) + '"' : '') + '>' + icon('flask', 'ad-ico--sm') + '실험 시작</button>' +
            '<a class="ad-btn ad-btn--line" href="#funnel/' + esc(R.f.id) + '">진단 자세히</a>' +
            (state === 'held' ? '<button class="ad-btn ad-btn--ghost" type="button" data-act="unhold" data-key="' + esc(key) + '">다시 대기로</button>' : '<button class="ad-btn ad-btn--ghost" type="button" data-act="hold" data-key="' + esc(key) + '">' + icon('pause', 'ad-ico--sm') + '보류</button>') + link;
        }
      };
    });
  });

  // ── 동작 ──
  function rer() { K.rerender(); }
  function expStart(id, from, pb) {
    var st = S(), e = EXPS[id];
    if (!e) return;
    if (st.exp[id] === 'B') { K.toast('이미 B안으로 확정된 실험입니다'); return; }
    if (st.expRun[id]) { K.toast('이미 진행 중인 실험입니다'); return; }
    st.expRun[id] = { start: new Date().toISOString(), from: from || '퍼널 진단', playbook: pb || null };
    K.addLog('approved', '문구 실험', e.name + ' 실험 시작 — ' + (from || '퍼널 진단') + '(방문자 절반에게 B안)', null);
    K.commit(); rer();
    K.toast('사이트 방문자의 절반에게 B안이 보입니다');
  }
  K.ACT['fn-mode'] = function (b) { U.mode = b.getAttribute('data-v') === 'mine' ? 'mine' : 'all'; rer(); };
  K.ACT['fn-days'] = function (b) { U.days = +b.getAttribute('data-v') === 7 ? 7 : 14; rer(); };
  K.ACT['fn-grp'] = function (b) { U.grp = b.getAttribute('data-v') || 'all'; rer(); };
  K.ACT['fn-pick'] = function (b) {
    U.funnel = b.getAttribute('data-id');
    try { history.replaceState(null, '', '#funnel/' + U.funnel); } catch (e) { /* 무시 */ }
    rer();
    var f = document.getElementById('fn-flow-t'); if (f && f.getBoundingClientRect().top > window.innerHeight * 0.8) f.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  K.ACT['pb-stage'] = function (b) {
    U.pbStage = b.getAttribute('data-v') || 'all'; rer();
    if (b.hasAttribute('data-scroll')) { var t = document.querySelector('[data-act="pb-stage"][data-v="ready"]:not([data-scroll])'); if (t) { t.scrollIntoView({ block: 'start' }); t.focus({ preventScroll: true }); } }
  };
  K.ACT['pb-more'] = function (b) { var w = b.closest('.fn-pb__what'), open = !w.classList.contains('is-open'); w.classList.toggle('is-open', open); b.setAttribute('aria-expanded', String(open)); b.textContent = open ? '접기' : '더 보기'; };
  K.ACT['fn-exp-start'] = function (b) { expStart(b.getAttribute('data-exp'), b.getAttribute('data-from'), b.getAttribute('data-pb')); };
  K.ACT['fn-exp-preview'] = function (b) { var id = b.getAttribute('data-exp'); U.preview[id] = !U.preview[id]; rer(); };
  K.ACT['fn-exp-b'] = function (b) {
    var id = b.getAttribute('data-exp'), st = S(), e = EXPS[id];
    if (!e) return;
    if (K.scan(e.b).hits.length) { K.toast('B안에 금칙어가 있어 확정할 수 없습니다', true); return; }
    st.exp[id] = 'B';
    st.expDone[id] = Object.assign({}, st.expRun[id] || {}, { end: new Date().toISOString(), result: 'B' });
    delete st.expRun[id];
    K.addLog('approved', '문구 실험', e.name + ' B안 확정 — 사이트 방문자 모두에게 B안', null);
    K.commit(); rer();
    K.toast('B안으로 확정했습니다 — 사이트 방문자 모두에게 B안이 보입니다');
  };
  K.ACT['fn-exp-a'] = function (b) {
    var id = b.getAttribute('data-exp'), st = S(), e = EXPS[id];
    if (!e) return;
    delete st.exp[id];
    K.addLog('human', '문구 실험', e.name + ' A안으로 되돌림', null);
    K.commit(); rer(); K.toast('A안으로 되돌렸습니다');
  };
  K.ACT['fn-exp-stop'] = function (b) {
    var id = b.getAttribute('data-exp'), st = S(), e = EXPS[id];
    if (!e) return;
    st.expDone[id] = Object.assign({}, st.expRun[id] || {}, { end: new Date().toISOString(), result: 'stopped' });
    delete st.expRun[id];
    K.addLog('human', '문구 실험', e.name + ' 실험 멈춤 — 모든 방문자에게 A안', null);
    K.commit(); rer(); K.toast('실험을 멈췄습니다 — 모든 방문자에게 A안이 보입니다');
  };
  K.ACT['fn-goto-run'] = function (b, e) {
    if (e) e.preventDefault();
    var go = function () { var el = document.getElementById('fn-running'); if (el) el.scrollIntoView({ block: 'start' }); };
    if (!/^#funnel/.test(location.hash)) { location.hash = '#funnel'; setTimeout(go, 60); } else go();
  };
  K.ACT['fn-todo-add'] = function (b) {
    var id = b.getAttribute('data-id'), st = S(), p = playbook().find(function (x) { return x.id === id; });
    if (!p) return;
    st.playbookTodo[id] = { at: new Date().toISOString() };
    K.addLog('human', '이탈 차단 전략', (p.platform || '') + ' — ' + (p.pattern || '') + ' 운영 단계 작업 목록에 담음', null);
    K.commit(); rer(); K.toast('운영 단계 작업 목록에 담았습니다');
  };
  K.ACT['fn-todo-del'] = function (b) { var id = b.getAttribute('data-id'), st = S(); delete st.playbookTodo[id]; K.commit(); rer(); K.toast('작업 목록에서 뺐습니다'); };
  K.ACT['fn-del'] = function (b) {
    var id = b.getAttribute('data-id'), st = S(), f = st.funnels.find(function (x) { return x.id === id; });
    if (!f) return;
    K.modal({
      title: '퍼널 지우기', body: '<p>「' + esc(f.name) + '」 퍼널을 지울까요? 방문 기록은 그대로 남고, 퍼널 정의만 지웁니다.</p>',
      buttons: [{ label: '취소' }, { label: '지우기', cls: 'ad-btn--bad', on: function () { st.funnels = st.funnels.filter(function (x) { return x.id !== id; }); U.funnel = 'f-sub'; K.addLog('human', '퍼널', '「' + f.name + '」 퍼널 지움', null); K.commit(); try { history.replaceState(null, '', '#funnel'); } catch (e) { /* 무시 */ } rer(); K.toast('퍼널을 지웠습니다'); } }]
    });
  };
  K.ACT['fn-new'] = function () {
    var opts = function (sel) { return '<option value="">— 없음 —</option>' + STEP_ORDER.map(function (s) { return '<option value="' + s + '"' + (s === sel ? ' selected' : '') + '>' + esc(stepName(s)) + '</option>'; }).join(''); };
    var pre = ['course', 'add', 'checkout', 'purchase', '', ''];
    K.modal({
      title: '퍼널 만들기',
      body: '<div class="ad-form"><label class="ad-field"><span class="ad-field__label">이름</span><input class="ad-input" id="fn-new-name" placeholder="예: 강의 상세 → 결제" maxlength="30"></label>' +
        '<div class="fn-new-steps">' + pre.map(function (s, i) { return '<label class="ad-field"><span class="ad-field__label">단계 ' + (i + 1) + (i < 2 ? ' (꼭)' : '') + '</span><select class="ad-select" data-fn-step="' + i + '">' + opts(s) + '</select></label>'; }).join('') + '</div>' +
        '<p class="ad-small ad-muted">같은 방문 안에서 위 단계가 순서대로 일어난 것만 셉니다. ‘아무 쪽 도착’은 방문 시작입니다. 이 브라우저에만 저장됩니다.</p><p class="ad-small" id="fn-new-err" style="color:var(--bad)" hidden></p></div>',
      buttons: [{ label: '취소' }, { label: '만들기', cls: 'ad-btn--primary', on: function (box) {
        var name = box.querySelector('#fn-new-name').value.trim(), err = box.querySelector('#fn-new-err');
        var steps = Array.prototype.slice.call(box.querySelectorAll('[data-fn-step]')).map(function (s) { return s.value; }).filter(Boolean);
        if (!name) { err.textContent = '이름을 써 주세요.'; err.hidden = false; box.querySelector('#fn-new-name').focus(); return false; }
        if (steps.length < 2) { err.textContent = '단계를 2개 이상 고르세요.'; err.hidden = false; return false; }
        var st = S(), id = 'c-' + Date.now().toString(36);
        st.funnels.push({ id: id, name: name.slice(0, 30), steps: steps.slice(0, 6), at: new Date().toISOString() });
        K.addLog('human', '퍼널', '「' + name + '」 퍼널 만듦(' + steps.map(stepName).join(' → ') + ')', null);
        K.commit(); U.funnel = id;
        if (!/^#funnel/.test(location.hash)) location.hash = '#funnel/' + id; else { try { history.replaceState(null, '', '#funnel/' + id); } catch (e) { /* 무시 */ } rer(); }
        K.toast('퍼널을 만들었습니다');
      } }]
    });
  };

  // ── 메뉴: '한눈에'에 퍼널·이탈·유입 출처, 'AI 자가진화 센터'에 이탈 차단 전략 ──
  K.MENU.forEach(function (g) {
    if (g.g === 'glance' && !g.items.some(function (x) { return x.id === 'funnel'; })) g.items.push({ id: 'funnel', name: '퍼널·이탈', icon: 'funnel' }, { id: 'sources', name: '유입 출처', icon: 'route' });
    if (g.g === 'evo' && !g.items.some(function (x) { return x.id === 'playbook'; })) {
      var at = g.items.findIndex(function (x) { return x.id === 'exp'; });
      g.items.splice(at < 0 ? g.items.length : at + 1, 0, { id: 'playbook', name: '이탈 차단 전략', icon: 'target' });
    }
  });
  // 사이트를 다른 창에서 돌아다니면 기록이 바뀐다 → 이 화면들이 열려 있으면 다시 그린다
  window.addEventListener('storage', function (e) {
    if (e.key !== EV_KEY) return;
    PROPC.sig = null;
    var id = (location.hash.replace(/^#\/?/, '') || '').split(/[/?]/)[0];
    var app = document.getElementById('ad-app');
    if (app && !app.hidden && (id === 'funnel' || id === 'sources' || id === 'inbox' || id === 'playbook')) K.rerender();
  });
  // 메뉴가 이 파일보다 먼저 그려졌으면(느린 연결) 다시 그린다
  if (document.querySelector('#ad-nav .ad-nav__a')) { K.buildNav(); K.route(); }

  // 시험·다른 화면에서 쓰는 창구
  window.AdminFunnel = { SRC: SRC, GROUPS: GROUPS, STEPS: STEPS, PRESET: PRESET, EXPS: EXPS, genExample: genExample, sessionize: sessionize, example: example, mine: mine, sessionsFor: sessionsFor, runFunnel: runFunnel, dropDetail: dropDetail, sourceStats: sourceStats, campaignStats: campaignStats, pageName: pageName, U: U };
})();
