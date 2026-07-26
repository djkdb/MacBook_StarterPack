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

/* ─────────── 토스트 / 색종이 ─────────── */
function toast(msg, kind='ok') {
  const t = el('div', 'toast ' + kind, msg);
  $('#toastwrap').appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(()=>t.remove(), 400); }, 2600);
}

function confetti(n = 70) {
  const wrap = $('#confetti');
  const colors = ['#5b8cff','#a06bff','#ff6b9d','#ffd166','#4ade80','#38e5d0'];
  for (let i = 0; i < n; i++) {
    const p = el('i');
    p.style.left = Math.random()*100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random()*0.4) + 's';
    p.style.animationDuration = (1.6 + Math.random()*1.4) + 's';
    p.style.transform = `rotate(${Math.random()*360}deg)`;
    wrap.appendChild(p);
    setTimeout(()=>p.remove(), 3400);
  }
}

/* ============================================================
 * 상단 XP 바
 * ============================================================ */
function renderHeader() {
  const xp = State.data.xp;
  const r = rankOf(xp);
  const base = r.xp;
  const cap  = r.next ? r.next.xp : TOTAL_XP;
  const pct  = Math.min(100, ((xp - base) / Math.max(1, cap - base)) * 100);

  $('#lvlBadge').textContent = 'Lv.' + (r.idx + 1);
  $('#rankName').textContent = r.icon + ' ' + r.name;
  $('#xpText').textContent = r.next ? `${xp} / ${cap} XP` : `${xp} XP · MAX`;
  $('#xpFill').style.width = pct + '%';

  const cleared = ALL.filter(q => State.isCleared(q.id)).length;
  $('#sideProgress').textContent = Math.round(cleared / ALL.length * 100) + '%';
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
          <small>${done}/${all}${complete ? ' · 완료' : ''}</small>
        </span>
        <span class="chapter-ring" style="--p:${done/all*100}">${complete ? '✓' : ''}</span>
      </button>
      <ul class="qlist"></ul>`;

    const ul = item.querySelector('.qlist');
    ch.quests.forEach(q => {
      const li = el('li', 'qitem'
        + (State.isDone(q.id) ? ' done' : '')
        + (State.isSkipped(q.id) ? ' skipped' : '')
        + (current && current.id === q.id ? ' active' : ''));
      // 부제가 단축키처럼 짧을 때만 옆에 붙입니다 (긴 설명문은 이름을 밀어내므로 생략)
      const tag = q.sub && q.sub.length <= 14 ? q.sub : '';
      li.innerHTML = `
        <span class="qdot"></span>
        <span class="qname">${q.title}</span>
        ${tag ? `<span class="qsub">${tag}</span>` : ''}`;
      li.addEventListener('click', () => goTo(q.id));
      ul.appendChild(li);
    });

    item.querySelector('.chapter-head').addEventListener('click', () => {
      openChapter = (openChapter === ci) ? -1 : ci;
      renderSidebar();
    });

    nav.appendChild(item);
  });

  // 배지
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
let current = null;      // 현재 퀘스트
let teardown = () => {};  // 현재 판정기 해제

function clearStage() {
  try { teardown(); } catch {}
  teardown = () => {};
  $('#stage').innerHTML = '';
}

/* ─────────── 시작 화면 ─────────── */
function renderHome() {
  clearStage();
  current = null;

  const cleared = ALL.filter(q => State.isCleared(q.id)).length;
  const resume = State.data.last && byId[State.data.last];

  const v = el('div', 'home');
  v.innerHTML = `
    <div class="hero">
      <div class="hero-emoji">💻</div>
      <h1>맥북, 처음이시죠?</h1>
      <p class="lead">
        설명서를 읽는 대신 <b>직접 눌러보면서</b> 배웁니다.<br/>
        키를 실제로 누르고 트랙패드를 실제로 문질러야 다음으로 넘어가요.
      </p>

      <div class="stats">
        <div><b>${CHAPTERS.length}</b><small>챕터</small></div>
        <div><b>${ALL.length}</b><small>퀘스트</small></div>
        <div><b>${TOTAL_XP}</b><small>총 XP</small></div>
        <div><b>${cleared}</b><small>클리어</small></div>
      </div>

      <div class="hero-actions">
        <button class="primary big" id="startBtn">
          ${cleared ? '이어서 하기' : '퀘스트 시작하기'} →
        </button>
        ${cleared ? '<button class="ghost big" id="reviewBtn">치트시트 보기</button>' : ''}
      </div>

      ${Engine.isMac ? '' : `
        <div class="warn">
          지금 맥이 아닌 기기에서 열고 계신 것 같아요. 내용은 볼 수 있지만
          키 입력·트랙패드 판정은 맥북에서 열어야 정상 동작합니다.
        </div>`}
    </div>

    <div class="chaptergrid">
      ${CHAPTERS.map((ch, i) => {
        const d = ch.quests.filter(q => State.isCleared(q.id)).length;
        return `
        <button class="chapcard${d===ch.quests.length?' complete':''}" data-ci="${i}">
          <span class="chapcard-icon">${ch.icon}</span>
          <b>${ch.title}</b>
          <small>${ch.quests.length}개 퀘스트 · ${d}개 완료</small>
          <span class="chapbar"><i style="width:${d/ch.quests.length*100}%"></i></span>
        </button>`;
      }).join('')}
    </div>`;

  $('#stage').appendChild(v);

  $('#startBtn').addEventListener('click', () => {
    State.data.started = true; State.save();
    goTo(resume && !State.isCleared(resume.id) ? resume.id : firstUncleared().id);
  });
  const rb = $('#reviewBtn');
  if (rb) rb.addEventListener('click', openCheat);

  $$('.chapcard').forEach(b => b.addEventListener('click', () => {
    const ch = CHAPTERS[+b.dataset.ci];
    const target = ch.quests.find(q => !State.isCleared(q.id)) || ch.quests[0];
    openChapter = +b.dataset.ci;
    goTo(target.id);
  }));

  renderSidebar();
}

function firstUncleared() {
  return ALL.find(q => !State.isCleared(q.id)) || ALL[0];
}

/* ─────────── 퀘스트 화면 ─────────── */
function goTo(id) {
  const q = byId[id];
  if (!q) return renderHome();
  clearStage();
  current = q;
  openChapter = q._ci;
  State.data.last = id; State.save();
  renderQuest(q);
  renderSidebar();
  renderHeader();
  $('#stage').scrollTop = 0;
}

function renderQuest(q) {
  const ch = q._ch;
  const already = State.isDone(q.id);

  const v = el('article', 'questcard' + (q.boss ? ' boss' : ''));
  v.innerHTML = `
    <div class="qtop">
      <div class="qcrumb">
        <span class="qcrumb-icon">${ch.icon}</span>
        <span>${ch.title}</span>
        <span class="qcrumb-sep">·</span>
        <span>${q._qi + 1} / ${ch.quests.length}</span>
        ${q.boss ? '<span class="bosstag">BOSS</span>' : ''}
      </div>
      <div class="qxp">+${q.xp} XP</div>
    </div>

    <h1 class="qtitle">${q.title}</h1>
    ${q.sub ? `<div class="qsubtitle">${q.sub}</div>` : ''}

    ${q._qi === 0 && ch.intro ? `<p class="chintro">${ch.intro}</p>` : ''}

    ${q.how ? `
      <ol class="howlist">
        ${q.how.map(s => `<li>${s}</li>`).join('')}
      </ol>` : ''}

    <div class="practice" id="practice"></div>

    <div class="progline"><i id="qprog"></i></div>
    <div class="note" id="qnote" hidden></div>

    <div class="successbox" id="successbox" hidden>
      <div class="successhead">✓ 클리어!</div>
      ${q.tip ? `<p class="tipbody"><b>알아두면 좋은 것</b><br/>${q.tip}</p>` : ''}
      <button class="primary big" id="nextBtn">다음 퀘스트 →</button>
    </div>

    <div class="qfoot" id="qfoot">
      <button class="ghost" id="prevBtn" ${q._flat === 0 ? 'disabled' : ''}>← 이전</button>
      <button class="ghost" id="skipBtn">건너뛰기</button>
      <button class="ghost" id="homeBtn">처음 화면</button>
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
    toast('건너뛰었습니다. 나중에 다시 올 수 있어요.', 'info');
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

  if (gained) toast(`+${q.xp} XP · ${q.title} 클리어!`);
  if (after > before) {
    confetti(60);
    setTimeout(() => toast(`레벨 업! 이제 «${RANKS[after].name}» 입니다 ${RANKS[after].icon}`, 'level'), 500);
  }

  // 챕터를 다 끝냈으면 축하
  const ch = q._ch;
  if (ch.quests.every(x => State.isDone(x.id))) {
    confetti(90);
    setTimeout(() => toast(`배지 획득: ${BADGES[ch.id].icon} ${BADGES[ch.id].name}`, 'level'), 900);
  }
}

function showSuccess(q, quiet) {
  const box = $('#successbox');
  if (!box) return;
  box.hidden = false;
  if (!quiet) box.classList.add('pop');
  $('#qfoot').classList.add('dim');
  const btn = $('#nextBtn');
  btn.textContent = q._flat === ALL.length - 1 ? '졸업하기 🎓' : '다음 퀘스트 →';
  btn.onclick = () => advance(q);
  // 이미 클리어한 퀘스트를 다시 열었을 때는 화면을 건드리지 않습니다.
  if (!quiet) setTimeout(() => btn.focus(), 60);
}

function advance(q) {
  const ch = q._ch;
  const isLastOfChapter = q._qi === ch.quests.length - 1;

  if (q._flat === ALL.length - 1) return renderFinale();
  if (isLastOfChapter) return renderChapterEnd(ch);
  goTo(ALL[q._flat + 1].id);
}

/* ─────────── 챕터 완료 화면 ─────────── */
function renderChapterEnd(ch) {
  clearStage();
  const b = BADGES[ch.id];
  const done = ch.quests.filter(q => State.isDone(q.id)).length;
  const nextCh = CHAPTERS[CHAPTERS.indexOf(ch) + 1];

  const v = el('div', 'home');
  v.innerHTML = `
    <div class="hero">
      <div class="hero-emoji big">${b.icon}</div>
      <h1>${ch.title} 완주!</h1>
      <p class="lead">${done} / ${ch.quests.length} 퀘스트를 해냈습니다.</p>

      <div class="recap">
        <div class="recap-title">이번 챕터에서 배운 것</div>
        <ul>
          ${ch.quests.map(q => `
            <li class="${State.isDone(q.id) ? '' : 'undone'}">
              <span class="recap-mark">${State.isDone(q.id) ? '✓' : '·'}</span>
              <span>${q.title}</span>
              ${q.sub ? `<kbd>${q.sub}</kbd>` : ''}
            </li>`).join('')}
        </ul>
      </div>

      <div class="hero-actions">
        ${nextCh ? `<button class="primary big" id="nextChBtn">다음 챕터 · ${nextCh.icon} ${nextCh.title} →</button>` : ''}
        <button class="ghost big" id="backHome">처음 화면</button>
      </div>
    </div>`;
  $('#stage').appendChild(v);

  if (nextCh) $('#nextChBtn').addEventListener('click', () => goTo(nextCh.quests[0].id));
  $('#backHome').addEventListener('click', renderHome);
  renderSidebar();
}

/* ─────────── 졸업 화면 ─────────── */
function renderFinale() {
  clearStage();
  confetti(140);

  const done = ALL.filter(q => State.isDone(q.id)).length;
  const r = rankOf(State.data.xp);

  const v = el('div', 'home');
  v.innerHTML = `
    <div class="diploma">
      <div class="diploma-seal">🎓</div>
      <div class="diploma-kicker">MacBook Starter Pack</div>
      <h1>졸업을 축하합니다</h1>
      <p class="lead">
        ${ALL.length}개 중 <b>${done}개</b>의 퀘스트를 클리어하고<br/>
        <b>${State.data.xp} XP</b> · <b>${r.icon} ${r.name}</b> 에 도달했습니다.
      </p>
      <div class="diploma-badges">
        ${CHAPTERS.map(ch => {
          const ok = ch.quests.every(q => State.isDone(q.id));
          const b = BADGES[ch.id];
          return `<span class="badge ${ok?'':'off'}" title="${b.name}">${b.icon}<em>${b.name}</em></span>`;
        }).join('')}
      </div>
      <p class="muted">
        이제 남은 건 습관입니다. 마우스로 클릭하려던 순간마다
        "이거 단축키 있었지?" 하고 한 번씩 떠올려보세요.
      </p>
      <div class="hero-actions">
        <button class="primary big" id="cheatFromEnd">치트시트 열기</button>
        <button class="ghost big" id="backHome2">처음 화면</button>
      </div>
    </div>`;
  $('#stage').appendChild(v);
  $('#cheatFromEnd').addEventListener('click', openCheat);
  $('#backHome2').addEventListener('click', renderHome);
  renderSidebar();
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
      if (!sc) return '';
      return `<tr><td class="sc"><kbd>${sc}</kbd></td><td>${q.title}</td></tr>`;
    }).filter(Boolean).join('');
    const extras = (CHEAT_EXTRA[ch.id] || []).map(([k, d]) =>
      `<tr><td class="sc"><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('');
    if (!rows && !extras) return '';
    return `
      <section class="cheatsec">
        <h3>${ch.icon} ${ch.title}</h3>
        <table>${rows}${extras}</table>
      </section>`;
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
  renderHeader();
  renderSidebar();

  if (State.data.started && State.data.last && !ALL.every(q => State.isCleared(q.id))) {
    goTo(State.data.last);
  } else {
    renderHome();
  }

  $('#brandBtn').addEventListener('click', renderHome);
  $('#cheatBtn').addEventListener('click', openCheat);
  $('#cheatClose').addEventListener('click', closeCheat);
  $('#cheatPrint').addEventListener('click', () => window.print());
  $('#cheatModal').addEventListener('click', (e) => { if (e.target.id === 'cheatModal') closeCheat(); });

  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('진행 상황을 모두 지우고 처음부터 다시 시작할까요?')) return;
    State.reset();
    renderHeader();
    renderHome();
    toast('처음부터 다시 시작합니다.', 'info');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#cheatModal').hidden) closeCheat();
  });
}

document.addEventListener('DOMContentLoaded', boot);
