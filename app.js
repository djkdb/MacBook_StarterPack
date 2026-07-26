/* ============================================================
 * app.js — 진행 상태, 화면 구성, 저장
 * ============================================================ */

const STORE_KEY = 'macbook-starterpack.v1';

const State = {
  data: { done: {}, skipped: {}, xp: 0, last: null, started: false },

  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch { /* 저장소를 못 쓰는 환경이면 그냥 메모리로 진행 */ }
  },
  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch {}
  },
  isDone(id)    { return !!this.data.done[id]; },
  isSkipped(id) { return !!this.data.skipped[id]; },
  isCleared(id) { return this.isDone(id) || this.isSkipped(id); },

  complete(id, xp) {
    if (this.data.done[id]) return false;
    this.data.done[id] = true;
    delete this.data.skipped[id];
    this.data.xp += xp;
    this.save();
    return true;
  },
  skip(id) { this.data.skipped[id] = true; this.save(); },
  reset()  { this.data = { done:{}, skipped:{}, xp:0, last:null, started:false }; this.save(); }
};

/* ─────────── 퀘스트 색인 ─────────── */
const ALL = [];
CHAPTERS.forEach((ch, ci) => ch.quests.forEach((q, qi) => {
  q._ch = ch; q._ci = ci; q._qi = qi; q._flat = ALL.length;
  ALL.push(q);
}));
const byId = Object.fromEntries(ALL.map(q => [q.id, q]));
const TOTAL_XP = ALL.reduce((s,q) => s + q.xp, 0);

/* 홈 타일의 밝기 리듬 — 색이 바뀌는 것 자체가 섹션 구분선.
   짝수는 어두운 타일, 홀수는 밝은 타일로 두어 챕터가 몇 개든 반드시 교차합니다.
   같은 계열이 연달아 올 때는 근접한 톤끼리 미세하게 어긋나도록 돌려 씁니다. */
const DARK_TONES  = ['dark', 'dark-2', 'dark-3'];
const LIGHT_TONES = ['light', 'parchment'];
const tileTone = (i) => (i % 2 === 0)
  ? DARK_TONES[Math.floor(i / 2) % DARK_TONES.length]
  : LIGHT_TONES[Math.floor(i / 2) % LIGHT_TONES.length];
const isDarkTone = (t) => t.startsWith('dark');

/* ─────────── 레벨 계산 ─────────── */
function rankOf(xp) {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (xp >= RANKS[k].xp) i = k;
  return { idx:i, ...RANKS[i], next: RANKS[i+1] || null };
}

/* ─────────── DOM 헬퍼 ─────────── */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

/* ─────────── 토스트 / 축하 ─────────── */
function toast(msg, kind='') {
  const t = el('div', 'toast ' + kind, msg);
  $('#toastwrap').appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(()=>t.remove(), 400); }, 2600);
}

// 축하도 시스템 색 안에서 — Action Blue 계열로만, 짧게
function confetti(n = 48) {
  const wrap = $('#confetti');
  const colors = ['#0066cc', '#2997ff', '#0071e3', '#d2d2d7'];
  for (let i = 0; i < n; i++) {
    const p = el('i');
    p.style.left = Math.random()*100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random()*0.3) + 's';
    p.style.animationDuration = (1.5 + Math.random()*1.1) + 's';
    wrap.appendChild(p);
    setTimeout(()=>p.remove(), 3000);
  }
}

/* ============================================================
 * 서브 내비 (레벨 · XP · 진행 표시줄)
 * ============================================================ */
function renderHeader() {
  const xp = State.data.xp;
  const r = rankOf(xp);
  const cleared = ALL.filter(q => State.isCleared(q.id)).length;
  const allDone = cleared === ALL.length;

  $('#rankName').textContent = r.icon + ' ' + r.name;
  $('#xpText').textContent = r.next ? `${xp} XP` : `${xp} XP · 완주`;
  $('#xpFill').style.width = (xp / TOTAL_XP * 100) + '%';
  $('#sideProgress').textContent = Math.round(cleared / ALL.length * 100) + '%';

  const btn = $('#resumeBtn');
  btn.textContent = allDone ? '치트시트' : (cleared ? '이어서 하기' : '시작하기');
  btn.onclick = () => {
    if (allDone) return openCheat();
    State.data.started = true; State.save();
    goTo(firstUncleared().id);
  };
}

function setView(view, title) {
  document.body.dataset.view = view;
  $('#subnavTitle').textContent = title || '맥북 스타터팩';
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* ============================================================
 * 사이드바
 * ============================================================ */
let openChapter = 0;

function renderSidebar() {
  const nav = $('#chapterNav');
  nav.innerHTML = '';

  CHAPTERS.forEach((ch, ci) => {
    const done = ch.quests.filter(q => State.isCleared(q.id)).length;
    const all  = ch.quests.length;
    const complete = done === all;

    // 순서를 강제하지 않습니다 — 원하는 챕터부터 시작할 수 있게.
    const item = el('div', 'chapter' + (complete ? ' complete' : '') + (ci === openChapter ? ' open' : ''));
    item.innerHTML = `
      <button class="chapter-head">
        <span class="chapter-icon">${ch.icon}</span>
        <span class="chapter-name">
          <b>${ch.title}</b>
          <small>${done}/${all}</small>
        </span>
        <span class="chapter-mark">${complete ? '✓' : ''}</span>
      </button>
      <ul class="qlist"></ul>`;

    const ul = item.querySelector('.qlist');
    ch.quests.forEach(q => {
      const li = el('li', 'qitem'
        + (State.isDone(q.id) ? ' done' : '')
        + (State.isSkipped(q.id) ? ' skipped' : '')
        + (current && current.id === q.id ? ' active' : ''));
      // 레일에는 제목만 둡니다. 단축키는 퀘스트 화면·회고·치트시트에 이미 있고,
      // 오른쪽에 덧붙이면 제목이 줄바꿈될 때 줄이 어긋납니다.
      li.innerHTML = `
        <span class="qmark">${State.isDone(q.id) ? '✓' : (State.isSkipped(q.id) ? '–' : '○')}</span>
        <span class="qname">${q.title}</span>`;
      li.addEventListener('click', () => goTo(q.id));
      ul.appendChild(li);
    });

    item.querySelector('.chapter-head').addEventListener('click', () => {
      openChapter = (openChapter === ci) ? -1 : ci;
      renderSidebar();
    });

    nav.appendChild(item);
  });

  const bwrap = $('#badges');
  const earned = CHAPTERS.filter(ch => ch.quests.every(q => State.isDone(q.id)));
  if (!earned.length) bwrap.innerHTML = '<span class="badge-empty">아직 없어요</span>';
  else bwrap.innerHTML = earned.map(ch => {
    const b = BADGES[ch.id];
    return `<span class="badge" title="${b.name}">${b.icon}<em>${b.name}</em></span>`;
  }).join('');
}

/* ============================================================
 * 화면 전환
 * ============================================================ */
let current = null;       // 현재 퀘스트
let teardown = () => {};  // 현재 판정기 해제

function clearStage() {
  try { teardown(); } catch {}
  teardown = () => {};
  $('#stage').innerHTML = '';
}

function firstUncleared() {
  return ALL.find(q => !State.isCleared(q.id)) || ALL[0];
}

/* ─────────── 홈: 풀블리드 제품 타일 스택 ─────────── */
function renderHome() {
  clearStage();
  current = null;
  setView('home');

  const cleared = ALL.filter(q => State.isCleared(q.id)).length;

  const hero = `
    <section class="tile light">
      <div class="tile-inner">
        <h1>맥북, 처음이시죠?</h1>
        <p class="tile-lead">설명서를 읽는 대신 직접 눌러보면서 배웁니다.</p>
        <p class="tile-badge">${TARGET_OS.full} 기준</p>
        <div class="tile-actions">
          <button class="btn-pill hero" id="startBtn">${cleared ? '이어서 하기' : '퀘스트 시작하기'}</button>
          <button class="btn-ghost" id="reviewBtn">치트시트 보기</button>
        </div>
        <div class="tile-product hero">💻</div>
        <div class="statrow">
          <div><b>${CHAPTERS.length}</b><small>챕터</small></div>
          <div><b>${ALL.length}</b><small>퀘스트</small></div>
          <div><b class="tabular">${TOTAL_XP}</b><small>총 XP</small></div>
          <div><b class="tabular">${cleared}</b><small>클리어</small></div>
        </div>
        <div class="notice">
          ${TARGET_OS.note}
          ${Engine.isMac ? '' : `<br/><br/>
            지금 맥이 아닌 기기에서 열고 계신 것 같습니다. 내용은 그대로 보실 수 있지만,
            키 입력과 트랙패드 제스처 판정은 macOS의 브라우저에서 동작합니다.`}
        </div>
      </div>
    </section>`;

  const tiles = CHAPTERS.map((ch, i) => {
    const done = ch.quests.filter(q => State.isCleared(q.id)).length;
    const all = ch.quests.length;
    const complete = done === all;
    const tone = tileTone(i);
    const dark = isDarkTone(tone);
    const label = complete ? '다시 보기' : (done ? '이어서 하기' : '시작하기');

    return `
      <section class="tile ${tone}">
        <div class="tile-inner">
          <p class="tile-eyebrow">챕터 ${i + 1}${complete ? ' · 완료' : ''}</p>
          <h2>${ch.title}</h2>
          <p class="tile-lead">${ch.tagline}</p>
          <div class="tile-product">${ch.icon}</div>
          <div class="tile-progress"><i style="width:${done / all * 100}%"></i></div>
          <p class="tile-note">${all}개 퀘스트 · ${done}개 완료</p>
          <div class="tile-actions">
            <button class="btn-pill lg" data-ci="${i}">${label}</button>
          </div>
        </div>
      </section>`;
  }).join('');

  const v = el('div', 'tilestack');
  v.innerHTML = hero + tiles;
  $('#stage').appendChild(v);

  $('#startBtn').addEventListener('click', () => {
    State.data.started = true; State.save();
    goTo(firstUncleared().id);
  });
  $('#reviewBtn').addEventListener('click', openCheat);

  $$('.tile-actions [data-ci]').forEach(b => b.addEventListener('click', () => {
    const ci = +b.dataset.ci;
    const ch = CHAPTERS[ci];
    openChapter = ci;
    goTo((ch.quests.find(q => !State.isCleared(q.id)) || ch.quests[0]).id);
  }));

  renderSidebar();
  renderHeader();
}

/* ─────────── 퀘스트 화면 ─────────── */
function goTo(id) {
  const q = byId[id];
  if (!q) return renderHome();
  clearStage();
  current = q;
  openChapter = q._ci;
  State.data.last = id; State.save();
  setView('quest', q._ch.title);
  renderQuest(q);
  renderSidebar();
  renderHeader();
}

function renderQuest(q) {
  const ch = q._ch;
  const already = State.isDone(q.id);

  const v = el('article', 'questview');
  v.innerHTML = `
    <div class="qhead">
      <div class="qcrumb">
        <span>${ch.icon}</span>
        <span>${ch.title}</span>
        <span class="sep">·</span>
        <span class="tabular">${q._qi + 1} / ${ch.quests.length}</span>
        ${q.boss ? '<span class="bosstag">보스</span>' : ''}
        <span class="xp tabular">+${q.xp} XP</span>
      </div>
      <h1 class="qtitle">${q.title}</h1>
      ${q.sub ? `<div class="qsubtitle">${q.sub}</div>` : ''}
      ${q._qi === 0 && ch.intro ? `<p class="chintro">${ch.intro}</p>` : ''}
    </div>

    ${q.how ? `<ol class="howlist">${q.how.map(s => `<li>${s}</li>`).join('')}</ol>` : ''}

    <div class="practice" id="practice"></div>

    <div class="progline"><i id="qprog"></i></div>
    <div class="note" id="qnote" hidden></div>

    <div class="successbox" id="successbox" hidden>
      <div class="successhead"><span>✓</span> 클리어</div>
      ${q.tip ? `<p class="tipbody"><b>알아두면 좋은 것</b><br/>${q.tip}</p>` : ''}
      <button class="btn-pill lg" id="nextBtn">다음 퀘스트</button>
    </div>

    <div class="qfoot" id="qfoot">
      <button class="btn-link sm" id="prevBtn" ${q._flat === 0 ? 'disabled' : ''}>← 이전</button>
      <button class="btn-link sm" id="skipBtn">건너뛰기</button>
      <button class="btn-link sm spacer" id="homeBtn">여정 전체 보기</button>
    </div>`;

  $('#stage').appendChild(v);

  const prog = $('#qprog');
  const note = $('#qnote');

  // 판정기는 계속 살려두어 반복 연습이 가능하게 하되,
  // 성공 처리는 화면당 한 번만 일어나도록 막습니다.
  let fired = false;
  const api = {
    success: () => { if (fired) return; fired = true; onSuccess(q); },
    progress: (p) => { prog.style.width = Math.round(p*100) + '%'; },
    note: (html) => { note.hidden = false; note.innerHTML = html; }
  };

  teardown = Engine.mount(q, $('#practice'), api);

  $('#prevBtn').addEventListener('click', () => { if (q._flat > 0) goTo(ALL[q._flat-1].id); });
  $('#homeBtn').addEventListener('click', renderHome);
  $('#skipBtn').addEventListener('click', () => {
    State.skip(q.id);
    toast('건너뛰었습니다. 나중에 다시 올 수 있어요.');
    advance(q);
  });

  if (already) { fired = true; showSuccess(q, true); }
}

function onSuccess(q) {
  if (State.isDone(q.id)) { showSuccess(q, true); return; }

  const gained = State.complete(q.id, q.xp);
  const before = rankOf(State.data.xp - q.xp).idx;
  const after  = rankOf(State.data.xp).idx;

  showSuccess(q, false);
  renderHeader();
  renderSidebar();

  if (gained) toast(`+${q.xp} XP · ${q.title}`);
  if (after > before) {
    setTimeout(() => toast(`${RANKS[after].icon} ${RANKS[after].name}`, 'level'), 500);
  }

  const ch = q._ch;
  if (ch.quests.every(x => State.isDone(x.id))) {
    confetti(56);
    setTimeout(() => toast(`배지 획득 · ${BADGES[ch.id].icon} ${BADGES[ch.id].name}`, 'level'), 900);
  }
}

function showSuccess(q, quiet) {
  const box = $('#successbox');
  if (!box) return;
  box.hidden = false;
  if (!quiet) box.classList.add('pop');
  const btn = $('#nextBtn');
  btn.textContent = q._flat === ALL.length - 1 ? '졸업하기' : '다음 퀘스트';
  btn.onclick = () => advance(q);
  // 이미 클리어한 퀘스트를 다시 열었을 때는 화면을 건드리지 않습니다.
  if (!quiet) setTimeout(() => btn.focus(), 60);
}

function advance(q) {
  const ch = q._ch;
  if (q._flat === ALL.length - 1) return renderFinale();
  if (q._qi === ch.quests.length - 1) return renderChapterEnd(ch);
  goTo(ALL[q._flat + 1].id);
}

/* ─────────── 챕터 완료 ─────────── */
function renderChapterEnd(ch) {
  clearStage();
  current = null;
  setView('home', ch.title);

  const b = BADGES[ch.id];
  const done = ch.quests.filter(q => State.isDone(q.id)).length;
  const ci = CHAPTERS.indexOf(ch);
  const nextCh = CHAPTERS[ci + 1];

  const v = el('div', 'tilestack');
  v.innerHTML = `
    <section class="tile light">
      <div class="tile-inner">
        <p class="tile-eyebrow">챕터 ${ci + 1} 완료</p>
        <h1>${ch.title}</h1>
        <p class="tile-lead">${done} / ${ch.quests.length} 퀘스트를 해냈습니다.</p>
        <div class="tile-product">${b.icon}</div>

        <div class="recap">
          <ul>
            ${ch.quests.map(q => `
              <li class="${State.isDone(q.id) ? '' : 'undone'}">
                <span class="recap-mark">${State.isDone(q.id) ? '✓' : '–'}</span>
                <span>${q.title}</span>
                ${q.sub && q.sub.length <= 14 ? `<kbd>${q.sub}</kbd>` : ''}
              </li>`).join('')}
          </ul>
        </div>

        <div class="tile-actions">
          ${nextCh ? `<button class="btn-pill lg" id="nextChBtn">다음 챕터 · ${nextCh.title}</button>` : ''}
          <button class="btn-ghost" id="backHome">여정 전체 보기</button>
        </div>
      </div>
    </section>`;
  $('#stage').appendChild(v);

  if (nextCh) $('#nextChBtn').addEventListener('click', () => goTo(nextCh.quests[0].id));
  $('#backHome').addEventListener('click', renderHome);
  renderSidebar();
  renderHeader();
}

/* ─────────── 졸업 ─────────── */
function renderFinale() {
  clearStage();
  current = null;
  setView('home', '졸업');
  confetti(90);

  const done = ALL.filter(q => State.isDone(q.id)).length;
  const r = rankOf(State.data.xp);

  const v = el('div', 'tilestack');
  v.innerHTML = `
    <section class="tile dark">
      <div class="tile-inner">
        <p class="tile-eyebrow">MacBook Starter Pack</p>
        <h1>졸업을 축하합니다.</h1>
        <p class="tile-lead">
          ${ALL.length}개 중 ${done}개의 퀘스트를 클리어하고
          ${State.data.xp} XP · ${r.name} 에 도달했습니다.
        </p>
        <div class="tile-product">🎓</div>
        <div class="diploma-badges">
          ${CHAPTERS.map(ch => {
            const okc = ch.quests.every(q => State.isDone(q.id));
            const b = BADGES[ch.id];
            return `<span class="badge ${okc ? '' : 'off'}">${b.icon}<em>${b.name}</em></span>`;
          }).join('')}
        </div>
      </div>
    </section>

    <section class="tile light">
      <div class="tile-inner">
        <h2>이제 남은 건 습관입니다.</h2>
        <p class="tile-lead">
          마우스로 클릭하려던 순간마다 "이거 단축키 있었지?" 하고 한 번씩 떠올려보세요.
        </p>
        <div class="tile-actions">
          <button class="btn-pill lg" id="cheatFromEnd">치트시트 열기</button>
          <button class="btn-ghost" id="backHome2">여정 전체 보기</button>
        </div>
      </div>
    </section>`;
  $('#stage').appendChild(v);
  $('#cheatFromEnd').addEventListener('click', openCheat);
  $('#backHome2').addEventListener('click', renderHome);
  renderSidebar();
  renderHeader();
}

/* ============================================================
 * 치트시트
 * ============================================================ */
function shortcutOf(q) {
  if (q.check && q.check.spec) return Engine.symbols(q.check.spec);
  if (q.sub && /[⌘⌥⌃⇧]|^fn/.test(q.sub)) return q.sub;
  return null;
}

function openCheat() {
  const body = $('#cheatBody');
  body.innerHTML = CHAPTERS.map(ch => {
    const rows = ch.quests.map(q => {
      const sc = shortcutOf(q);
      return sc ? `<tr><td class="sc"><kbd>${sc}</kbd></td><td>${q.title}</td></tr>` : '';
    }).filter(Boolean).join('');
    const extras = (CHEAT_EXTRA[ch.id] || []).map(([k, d]) =>
      `<tr><td class="sc"><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('');
    if (!rows && !extras) return '';
    return `<section class="cheatsec"><h3>${ch.icon} ${ch.title}</h3><table>${rows}${extras}</table></section>`;
  }).join('');
  $('#cheatModal').hidden = false;
}

function closeCheat() { $('#cheatModal').hidden = true; }

/* ============================================================
 * 초기화
 * ============================================================ */
function boot() {
  State.load();
  Engine.installGuards();
  $('#footOs').textContent = TARGET_OS.full + ' 기준';

  if (State.data.started && State.data.last && !ALL.every(q => State.isCleared(q.id))) {
    goTo(State.data.last);
  } else {
    renderHome();
  }

  $('#brandBtn').addEventListener('click', renderHome);
  $('#navHome').addEventListener('click', renderHome);
  $('#subnavTitle').addEventListener('click', renderHome);
  $('#cheatBtn').addEventListener('click', openCheat);
  $('#cheatClose').addEventListener('click', closeCheat);
  $('#cheatPrint').addEventListener('click', () => window.print());
  $('#cheatModal').addEventListener('click', (e) => { if (e.target.id === 'cheatModal') closeCheat(); });

  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('진행 상황을 모두 지우고 처음부터 다시 시작할까요?')) return;
    State.reset();
    renderHome();
    toast('처음부터 다시 시작합니다.');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#cheatModal').hidden) closeCheat();
  });
}

document.addEventListener('DOMContentLoaded', boot);
