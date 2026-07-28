/* ============================================================
 * engine.js — 퀘스트 판정 엔진
 * 실제 키 입력 / 트랙패드 제스처 / 클립보드를 감지합니다.
 * ============================================================ */

const Engine = (() => {

  /* ─────────── 키 스펙 파싱 ─────────── */

  // 'cmd+shift+z' → { meta:true, shift:true, code:'KeyZ' }
  const CODE_MAP = {
    'backspace':'Backspace', 'space':'Space', 'tab':'Tab', 'return':'Enter', 'esc':'Escape',
    'left':'ArrowLeft', 'right':'ArrowRight', 'up':'ArrowUp', 'down':'ArrowDown',
    ',':'Comma', '.':'Period', '`':'Backquote', '/':'Slash', '-':'Minus', '=':'Equal',
    '[':'BracketLeft', ']':'BracketRight', ';':'Semicolon', "'":'Quote', '\\':'Backslash'
  };

  const SYMBOL_MAP = {
    'backspace':'⌫', 'space':'Space', 'tab':'⇥', 'return':'↩', 'esc':'esc',
    'left':'←', 'right':'→', 'up':'↑', 'down':'↓'
  };

  function toCode(key) {
    if (CODE_MAP[key]) return CODE_MAP[key];
    if (/^[a-z]$/.test(key)) return 'Key' + key.toUpperCase();
    if (/^[0-9]$/.test(key)) return 'Digit' + key;
    return key;
  }

  function parseSpec(spec) {
    const parts = spec.toLowerCase().split('+');
    const out = { meta:false, alt:false, ctrl:false, shift:false, fn:false, code:null, key:null };
    for (const p of parts) {
      if (p === 'cmd' || p === 'meta') out.meta = true;
      else if (p === 'opt' || p === 'alt') out.alt = true;
      else if (p === 'ctrl' || p === 'control') out.ctrl = true;
      else if (p === 'shift') out.shift = true;
      else if (p === 'fn') out.fn = true;
      else { out.key = p; out.code = toCode(p); }
    }
    return out;
  }

  // Apple 표기 순서: ⌃ ⌥ ⇧ ⌘ + 키
  function symbols(spec) {
    const s = parseSpec(spec);
    let out = '';
    if (s.fn)    out += 'fn ';
    if (s.ctrl)  out += '⌃';
    if (s.alt)   out += '⌥';
    if (s.shift) out += '⇧';
    if (s.meta)  out += '⌘';
    if (s.key)   out += (SYMBOL_MAP[s.key] || s.key.toUpperCase());
    return out;
  }

  // 스펙을 개별 키캡 배열로 (화면 표시용)
  function keycaps(spec) {
    const s = parseSpec(spec);
    const caps = [];
    if (s.fn)    caps.push('fn');
    if (s.ctrl)  caps.push('⌃');
    if (s.alt)   caps.push('⌥');
    if (s.shift) caps.push('⇧');
    if (s.meta)  caps.push('⌘');
    if (s.key)   caps.push(SYMBOL_MAP[s.key] || s.key.toUpperCase());
    return caps;
  }

  function matches(e, s) {
    return e.metaKey === s.meta
        && e.altKey === s.alt
        && e.ctrlKey === s.ctrl
        && e.shiftKey === s.shift
        && (e.code === s.code || e.key.toLowerCase() === s.key);
  }

  /* ─────────── 환경 감지 ─────────── */

  // 여기서 묻는 것은 "애플 기기인가"가 아니라 "물리 키보드와 트랙패드로
  // 판정을 받을 수 있는 기기인가" 입니다. 아이폰·아이패드는 애플 기기지만
  // ⌘ 를 누를 수도, 세 손가락 제스처를 보낼 수도 없으므로 맥으로 치면 안 됩니다.
  // (iPadOS 13+ 는 navigator.platform 이 'MacIntel' 이고 UA 에도 'Mac OS X' 가
  //  들어오기 때문에, 터치 지원 여부로 한 번 더 걸러냅니다.)
  const looksApple = /Mac/.test(navigator.platform || '') || /Mac OS X/.test(navigator.userAgent);
  const isPhoneOrTablet = /iPhone|iPad|iPod/.test(navigator.platform || '')
                       || /iPhone|iPad|iPod/.test(navigator.userAgent)
                       || (looksApple && navigator.maxTouchPoints > 1);
  const isMac = looksApple && !isPhoneOrTablet;

  /* ─────────── 브라우저 기본 동작 차단 ─────────── */
  // ⌘← (뒤로 가기), ⌘S (저장 대화상자) 등이 학습을 방해하지 않도록
  // 입력칸 밖에서의 ⌘ 조합은 기본 동작을 막습니다.
  // (⌘R 새로고침, ⌘T 새 탭 등 탈출구는 남겨둡니다.)
  //
  // ⌘C·⌘F·⌘+·⌘-·⌘0 도 막지 않습니다. 가이드 본문을 복사해 메모하고,
  // 113개짜리 페이지에서 찾고, 글씨를 키우는 것은 학습을 방해하는 동작이
  // 아니라 학습에 필요한 동작입니다. 특히 치트시트가 ⌘+ / ⌘0 을 직접
  // 가르치고 있어서, 막아두면 배운 것이 이 앱에서만 안 되는 꼴이 됩니다.
  const ESCAPE_HATCH = new Set([
    'KeyR','KeyT','KeyN','KeyW','KeyQ',
    'KeyC','KeyF','Equal','Minus','Digit0','NumpadAdd','NumpadSubtract','Numpad0'
  ]);

  function installGuards() {
    document.addEventListener('keydown', (e) => {
      if (!e.metaKey) return;
      const t = e.target;
      const editable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (editable) return;
      if (ESCAPE_HATCH.has(e.code)) return;
      e.preventDefault();
    }, { capture: true });

    // 핀치 줌으로 페이지 전체가 확대되는 것 방지 (Safari)
    ['gesturestart','gesturechange','gestureend'].forEach(type => {
      document.addEventListener(type, (e) => e.preventDefault(), { passive:false });
    });
  }

  /* ─────────── 유틸 ─────────── */

  const h = (tag, cls, html) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  };

  const EMOJI_RE = (() => {
    try { return new RegExp('\\p{Extended_Pictographic}', 'u'); }
    catch { return /[‼-㊙\uD83C\uD83D\uD83E]/; }
  })();

  /* ============================================================
   * mount(quest, container, api)
   *   api.success()  — 퀘스트 완료
   *   api.progress(0~1) — 진행률 표시
   *   api.note(html) — 보조 메시지
   * 반환값: teardown 함수
   * ============================================================ */
  function mount(quest, container, api) {
    const c = quest.check;
    const handler = DETECTORS[c.t];
    if (!handler) {
      container.appendChild(h('p','muted','(판정 방식을 찾을 수 없습니다: ' + c.t + ')'));
      return () => {};
    }
    return handler(quest, c, container, api) || (() => {});
  }

  /* ─────────── 판정기들 ─────────── */

  const DETECTORS = {

    /* 수식어 키 하나 */
    mod(q, c, box, api) {
      const pad = h('div','padzone');
      pad.innerHTML = `
        <div class="modrow">
          ${['⌃ control','⌥ option','⇧ shift','⌘ command'].map(x => {
            const [sym, name] = x.split(' ');
            return `<div class="modkey" data-mod="${name}"><b>${sym}</b><small>${name}</small></div>`;
          }).join('')}
        </div>
        <p class="padhint">키보드에서 <b>${c.label}</b> 키를 눌러보세요</p>`;
      box.appendChild(pad);

      const want = c.mod; // 'Meta' | 'Alt' | 'Control' | 'Shift'

      const paint = (e) => {
        pad.querySelectorAll('.modkey').forEach(el => {
          const n = el.dataset.mod;
          const on = (n==='command'&&e.metaKey)||(n==='option'&&e.altKey)||
                     (n==='control'&&e.ctrlKey)||(n==='shift'&&e.shiftKey);
          el.classList.toggle('lit', !!on);
        });
      };

      // 왼쪽/오른쪽 키 모두 허용 (MetaLeft / MetaRight 등)
      const onDown = (e) => {
        paint(e);
        if (e.key === want || (e.code && e.code.startsWith(want))) api.success();
      };
      const onUp = paint;

      window.addEventListener('keydown', onDown);
      window.addEventListener('keyup', onUp);
      return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
    },

    /* 네 개 동시에 */
    allmods(q, c, box, api) {
      const pad = h('div','padzone');
      pad.innerHTML = `
        <div class="modrow">
          ${[['⌃','control'],['⌥','option'],['⇧','shift'],['⌘','command']].map(([s,n]) =>
            `<div class="modkey" data-mod="${n}"><b>${s}</b><small>${n}</small></div>`).join('')}
        </div>
        <p class="padhint">네 개를 <b>동시에</b> 눌러 모두 켜보세요</p>`;
      box.appendChild(pad);

      const onDown = (e) => {
        pad.querySelectorAll('.modkey').forEach(el => {
          const n = el.dataset.mod;
          const on = (n==='command'&&e.metaKey)||(n==='option'&&e.altKey)||
                     (n==='control'&&e.ctrlKey)||(n==='shift'&&e.shiftKey);
          el.classList.toggle('lit', !!on);
        });
        const cnt = [e.metaKey,e.altKey,e.ctrlKey,e.shiftKey].filter(Boolean).length;
        api.progress(cnt/4);
        if (cnt === 4) api.success();
      };
      const onUp = (e) => onDown(e);

      window.addEventListener('keydown', onDown);
      window.addEventListener('keyup', onUp);
      return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
    },

    /* 연속 조합 — 보스전과 복습 관문.
       하나씩 따로 아는 것과 이어서 쓰는 것은 다른 능력입니다. 순서대로 전부
       눌러야 통과하고, 중간에 다른 조합을 누르면 처음으로 돌아갑니다.
       틀려도 잃는 것은 없습니다. 되돌아갈 뿐이라 부담 없이 다시 하면 됩니다. */
    chain(q, c, box, api) {
      const steps = (c.steps || []).map(s => ({ ...s, parsed: parseSpec(s.spec) }));
      if (!steps.length) {
        box.appendChild(h('p','muted','(연습할 단축키를 찾지 못했습니다)'));
        return () => {};
      }

      const pad = h('div','padzone');
      pad.innerHTML = `
        <ol class="chainsteps">${steps.map((s, i) => `
          <li data-i="${i}">
            <span class="chain-mark">${i + 1}</span>
            <kbd>${symbols(s.spec)}</kbd>
            <span class="chain-label">${s.label || ''}</span>
          </li>`).join('')}</ol>
        <p class="padhint">${c.label || '위에서부터 <b>순서대로</b> 눌러보세요'}</p>
        <p class="livekey" id="livekey">&nbsp;</p>`;
      box.appendChild(pad);

      const live = pad.querySelector('#livekey');
      const items = [...pad.querySelectorAll('.chainsteps li')];
      let at = 0;

      const paint = () => {
        items.forEach((li, i) => {
          li.classList.toggle('hit', i < at);
          li.classList.toggle('now', i === at);
        });
        api.progress(at / steps.length);
      };
      paint();

      const restart = (why) => {
        at = 0; paint();
        live.textContent = why;
        pad.classList.add('miss');
        setTimeout(() => pad.classList.remove('miss'), 300);
      };

      const onDown = (e) => {
        if (['Meta','Alt','Control','Shift'].includes(e.key)) return;

        if (matches(e, steps[at].parsed)) {
          e.preventDefault();
          at++;
          if (at >= steps.length) {
            paint();
            live.textContent = '전부 이어서 해냈습니다.';
            api.success();
            return;
          }
          paint();
          live.textContent = `${at} / ${steps.length} — 다음은 ${symbols(steps[at].spec)}`;
          return;
        }

        // 수식어가 하나도 없는 평범한 타이핑은 흐름을 깨지 않습니다.
        if (!(e.metaKey || e.altKey || e.ctrlKey)) return;
        if (at > 0) restart(`${symbols(steps[at].spec)} 차례였어요. 처음부터 다시.`);
      };

      window.addEventListener('keydown', onDown);
      return () => window.removeEventListener('keydown', onDown);
    },

    /* 단축키 조합 */
    combo(q, c, box, api) {
      const spec = parseSpec(c.spec);
      const pad = h('div','padzone');
      pad.innerHTML = `
        <div class="keycaps">${keycaps(c.spec).map(k =>
          `<kbd class="cap${k.length>2?' wide':''}">${k}</kbd>`).join('<span class="plus">+</span>')}</div>
        <p class="padhint">위 조합을 실제로 눌러보세요</p>
        <p class="livekey" id="livekey">&nbsp;</p>`;
      box.appendChild(pad);
      const live = pad.querySelector('#livekey');

      const onDown = (e) => {
        if (['Meta','Alt','Control','Shift'].includes(e.key)) return;
        const pressed = [];
        if (e.ctrlKey) pressed.push('⌃');
        if (e.altKey) pressed.push('⌥');
        if (e.shiftKey) pressed.push('⇧');
        if (e.metaKey) pressed.push('⌘');
        const label = (e.code || '').replace(/^(Key|Digit)/,'') || e.key;
        live.textContent = '지금 누른 키: ' + pressed.join('') + label;

        if (matches(e, spec)) {
          e.preventDefault();
          api.success();
        } else {
          live.classList.add('miss');
          setTimeout(() => live.classList.remove('miss'), 300);
        }
      };
      window.addEventListener('keydown', onDown);
      return () => window.removeEventListener('keydown', onDown);
    },

    /* 브라우저가 포커스를 잃었다가 돌아옴 (OS 화면을 다녀옴) */
    blur(q, c, box, api) {
      const pad = h('div','padzone');
      pad.innerHTML = `
        <div class="radar"><span></span><span></span><span></span></div>
        <p class="padhint">${c.label || '실행했다가 이 화면으로 돌아오면 자동으로 완료됩니다'}</p>
        <p class="livekey" id="blurstat">대기 중…</p>`;
      box.appendChild(pad);
      const stat = pad.querySelector('#blurstat');

      // macOS 가 가로채는 동작(Spotlight, 미션 컨트롤 등)은 키 이벤트가 오지
      // 않으므로 "다녀왔다"는 사실로만 판정합니다. 다만 그냥 다른 탭에 다녀와도
      // 통과되면 아무것도 배우지 않고 진도가 나갑니다. 그래서 둘을 구분합니다 —
      // 다른 앱으로 전환하면 창의 포커스만 잃고, 다른 탭으로 가면 문서가 숨겨집니다.
      let leftAt = 0;
      let hiddenWhileAway = false;
      let missed = 0;

      const onHide = () => { if (document.hidden && leftAt) hiddenWhileAway = true; };
      const onBlur = () => {
        leftAt = Date.now();
        hiddenWhileAway = document.hidden;
        stat.textContent = '화면을 벗어났습니다 — 돌아오면 완료돼요';
      };
      const onFocus = () => {
        if (!leftAt) return;
        const dt = Date.now() - leftAt;
        const wasTabSwitch = hiddenWhileAway;
        leftAt = 0;
        hiddenWhileAway = false;

        if (dt < 250) { stat.textContent = '너무 빨랐어요. 다시 해볼까요?'; return; }
        if (wasTabSwitch) {
          stat.textContent = '다른 탭에 다녀오신 것 같아요. 위 안내대로 직접 해보세요.';
          if (++missed >= 2) showFallback();
          return;
        }
        stat.textContent = '돌아왔습니다!';
        api.success();
      };

      // 브라우저나 창 관리 방식에 따라 위 구분이 어긋날 수 있습니다.
      // 그때 사용자가 갇히지 않도록, 두 번 어긋나면 직접 확인 버튼을 내어줍니다.
      function showFallback() {
        if (pad.querySelector('#blurmanual')) return;
        const btn = h('button', 'checkbtn',
          '<span class="checkbox">✓</span><span>직접 해봤어요</span>');
        btn.id = 'blurmanual';
        btn.addEventListener('click', () => api.success());
        pad.appendChild(btn);
      }

      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onHide);
      return () => {
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onHide);
      };
    },

    /* 트랙패드 스크롤 / 스와이프 */
    scroll(q, c, box, api) {
      const horiz = c.axis === 'x';
      const pad = h('div','padzone');
      if (horiz) {
        pad.innerHTML = `
          <div class="rail" id="rail">
            ${['📄','🖼','🎵','📊','🎬','📦','🗺','🧩'].map((e,i)=>
              `<div class="railcard">${e}<small>카드 ${i+1}</small></div>`).join('')}
          </div>
          <p class="padhint">두 손가락을 <b>좌우</b>로 밀어보세요</p>`;
      } else {
        pad.innerHTML = `
          <div class="scrollbox" id="rail">
            ${Array.from({length:14},(_,i)=>
              `<p>${i+1}. 두 손가락을 트랙패드에 올리고 위아래로 부드럽게 밀어보세요.</p>`).join('')}
          </div>
          <p class="padhint">두 손가락을 <b>위아래</b>로 밀어보세요</p>`;
      }
      box.appendChild(pad);

      const rail = pad.querySelector('#rail');
      let acc = 0;
      const onWheel = (e) => {
        if (e.ctrlKey) return;                       // 핀치는 제외
        const d = horiz ? e.deltaX : e.deltaY;       // 요청한 축만 인정
        acc += Math.abs(d);
        api.progress(Math.min(1, acc / c.amount));
        if (acc >= c.amount) api.success();
      };
      rail.addEventListener('wheel', onWheel, { passive:true });
      return () => rail.removeEventListener('wheel', onWheel);
    },

    /* 핀치 줌 */
    pinch(q, c, box, api) {
      const pad = h('div','padzone');
      pad.innerHTML = `
        <div class="pinchstage"><div class="pinchtarget" id="pt">🏔</div></div>
        <p class="padhint">두 손가락을 <b>벌렸다 오므렸다</b> 해보세요</p>`;
      box.appendChild(pad);

      const target = pad.querySelector('#pt');
      let scale = 1, acc = 0;

      const bump = (delta) => {
        scale = Math.min(3.2, Math.max(0.4, scale * delta));
        target.style.transform = `scale(${scale})`;
        acc += Math.abs(1 - delta) * 100;
        api.progress(Math.min(1, acc / 22));
        if (acc >= 22) api.success();
      };

      // Chrome/Firefox: 핀치는 ctrlKey가 붙은 wheel 이벤트로 옵니다
      const onWheel = (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        bump(1 - e.deltaY * 0.01);
      };
      // Safari: gesture 이벤트
      let last = 1;
      const onGStart = (e) => { e.preventDefault(); last = 1; };
      const onGChange = (e) => { e.preventDefault(); bump(e.scale / last); last = e.scale; };

      pad.addEventListener('wheel', onWheel, { passive:false });
      pad.addEventListener('gesturestart', onGStart);
      pad.addEventListener('gesturechange', onGChange);
      return () => {
        pad.removeEventListener('wheel', onWheel);
        pad.removeEventListener('gesturestart', onGStart);
        pad.removeEventListener('gesturechange', onGChange);
      };
    },

    /* 보조 클릭(우클릭) */
    contextmenu(q, c, box, api) {
      const pad = h('div','padzone');
      pad.innerHTML = `
        <div class="clickzone" id="cz">
          <span>여기를 <b>두 손가락으로 클릭</b></span>
          <small>또는 ⌃ 를 누른 채 클릭</small>
        </div>`;
      box.appendChild(pad);
      const zone = pad.querySelector('#cz');
      const onCtx = (e) => { e.preventDefault(); zone.classList.add('hit'); api.success(); };
      zone.addEventListener('contextmenu', onCtx);
      return () => zone.removeEventListener('contextmenu', onCtx);
    },

    /* 클립보드 이미지 붙여넣기 */
    pasteImage(q, c, box, api) {
      const pad = h('div','padzone');
      pad.innerHTML = `
        <div class="dropzone" id="dz" tabindex="0" contenteditable="true" spellcheck="false"
             data-ph="여기를 클릭한 뒤 ⌘V 를 누르세요"></div>
        <p class="padhint">클립보드에 <b>이미지</b>가 들어 있어야 통과합니다</p>`;
      box.appendChild(pad);
      const dz = pad.querySelector('#dz');

      const onPaste = (e) => {
        e.preventDefault();
        const items = (e.clipboardData && e.clipboardData.items) || [];
        let found = null;
        for (const it of items) if (it.type && it.type.startsWith('image/')) found = it.getAsFile();
        if (found) {
          const url = URL.createObjectURL(found);
          dz.innerHTML = `<img src="${url}" alt="붙여넣은 스크린샷" />`;
          api.note('클립보드에서 이미지를 확인했습니다. 파일을 하나도 만들지 않고 캡처했어요.');
          api.success();
        } else {
          dz.textContent = '';
          api.note('클립보드에 이미지가 없습니다. ⌃ 를 빠뜨리지 않았는지 확인해보세요. (⌃⌘⇧4)');
        }
      };
      dz.addEventListener('paste', onPaste);
      return () => dz.removeEventListener('paste', onPaste);
    },

    /* 클립보드 텍스트 붙여넣기 (유니버설 클립보드 확인용) */
    pasteText(q, c, box, api) {
      const pad = h('div','padzone');
      pad.innerHTML = `
        <div class="dropzone" id="dz" tabindex="0" contenteditable="true" spellcheck="false"
             data-ph="여기를 클릭한 뒤 ⌘V 를 누르세요"></div>
        <p class="padhint">${c.hint || ''}</p>`;
      box.appendChild(pad);
      const dz = pad.querySelector('#dz');

      const onPaste = (e) => {
        e.preventDefault();
        const text = ((e.clipboardData && e.clipboardData.getData('text/plain')) || '').trim();
        dz.textContent = text;
        if (!text) return api.note('클립보드가 비어 있습니다.');
        if (c.match && !new RegExp(c.match).test(text)) {
          return api.note(`"${c.expectLabel || c.match}" 가 아니네요. 아이폰에서 복사한 내용이 맞는지 확인해보세요.`);
        }
        if (text.length < (c.minLen || 2)) {
          return api.note('내용이 너무 짧습니다. 조금 더 긴 문장을 복사해보세요.');
        }
        api.note('클립보드에서 텍스트를 확인했습니다.');
        api.success();
      };
      dz.addEventListener('paste', onPaste);
      return () => dz.removeEventListener('paste', onPaste);
    },

    /* 이모지 입력 */
    emoji(q, c, box, api) {
      const pad = h('div','padzone');
      pad.innerHTML = `
        <input class="bigin" id="ei" placeholder="${c.placeholder||''}" autocomplete="off" />
        <p class="padhint">입력칸에 커서를 두고 <b>⌃⌘Space</b> 를 누르세요</p>`;
      box.appendChild(pad);
      const inp = pad.querySelector('#ei');
      setTimeout(()=>inp.focus(), 60);
      const onIn = () => { if (EMOJI_RE.test(inp.value)) api.success(); };
      inp.addEventListener('input', onIn);
      return () => inp.removeEventListener('input', onIn);
    },

    /* 텍스트 편집 실습 */
    editor(q, c, box, api) {
      const pad = h('div','padzone');
      pad.innerHTML = `
        <textarea class="editor" id="ed" spellcheck="false" rows="3"></textarea>
        <div class="editmeta">
          <span id="caretinfo"></span>
          <button class="btn-link sm" id="resetEd">처음으로 되돌리기</button>
        </div>`;
      box.appendChild(pad);

      const ta = pad.querySelector('#ed');
      const info = pad.querySelector('#caretinfo');

      // 마우스 클릭만으로 우연히 통과하지 않도록, 지정된 단축키를 실제로 눌렀는지 확인합니다.
      const viaSpec = c.via ? parseSpec(c.via) : null;
      let usedShortcut = !viaSpec;
      let viaHintShown = false;

      const reset = () => {
        ta.value = c.initial;
        const pos = c.caretStart === 'end' ? ta.value.length : (c.caretStart || 0);
        usedShortcut = !viaSpec;
        ta.focus();
        ta.setSelectionRange(pos, pos);
        update();
      };

      const want = () => {
        if (c.expectText != null) return `목표: 아래 내용이 "${c.expectText || '(빈 칸)'}" 이 되어야 합니다`;
        if (c.expectSel) return `목표: ${c.expectSel[0]}~${c.expectSel[1]}번째 글자가 선택되어야 합니다`;
        const n = c.expectCaret === 'end' ? c.initial.length : c.expectCaret;
        return `목표: 커서를 ${n}번 위치로 (현재 <b id="cnow"></b>)`;
      };

      const update = () => {
        const s = ta.selectionStart, e2 = ta.selectionEnd;
        info.innerHTML = want();
        const now = pad.querySelector('#cnow');
        if (now) now.textContent = s;

        let ok = false;
        if (c.expectText != null) ok = ta.value === c.expectText;
        else if (c.expectSel) ok = (s === c.expectSel[0] && e2 === c.expectSel[1]);
        else {
          const target = c.expectCaret === 'end' ? ta.value.length : c.expectCaret;
          ok = (s === target && e2 === target) && ta.value === c.initial;
        }
        if (ok && usedShortcut) api.success();
        else if (ok && !viaHintShown) {
          viaHintShown = true;
          api.note('위치는 맞았지만 <b>' + symbols(c.via) + '</b> 로 옮긴 게 아니네요. “처음으로 되돌리기”를 누른 뒤 단축키로 해보세요.');
        }
      };

      const onKey = (e) => { if (viaSpec && matches(e, viaSpec)) usedShortcut = true; };

      pad.querySelector('#resetEd').addEventListener('click', (ev) => { ev.preventDefault(); reset(); });
      ta.addEventListener('keydown', onKey);
      ['keyup','input','click','select','mouseup'].forEach(t => ta.addEventListener(t, update));
      document.addEventListener('selectionchange', update);
      reset();

      return () => document.removeEventListener('selectionchange', update);
    },

    /* 정답 입력 */
    answer(q, c, box, api) {
      const pad = h('div','padzone');
      pad.innerHTML = `
        <div class="answerrow">
          <input class="bigin" id="ai" placeholder="${c.placeholder||'정답 입력'}" autocomplete="off" />
          <button class="btn-pill lg" id="asub">확인</button>
        </div>
        <p class="padhint" id="ahint">${c.hint || ''}</p>`;
      box.appendChild(pad);

      const inp = pad.querySelector('#ai');
      const hint = pad.querySelector('#ahint');
      const norm = (v) => v.replace(/[\s,]/g,'').toLowerCase();

      // accept: 정답 목록과 정확히 일치 / range: 그럴듯한 숫자 범위 안이면 인정
      // (기기마다 답이 다른 "내 저장 공간은 몇 GB?" 같은 질문에 쓰입니다)
      const isCorrect = () => {
        const v = norm(inp.value);
        if (c.accept && c.accept.some(a => norm(a) === v)) return true;
        if (c.range) {
          const n = parseFloat(v.replace(/[^0-9.]/g, ''));
          return Number.isFinite(n) && n >= c.range[0] && n <= c.range[1];
        }
        return false;
      };

      const submit = () => {
        if (isCorrect()) api.success();
        else {
          inp.classList.add('shake');
          hint.textContent = '아직 아니에요. ' + (c.hint || '');
          setTimeout(()=>inp.classList.remove('shake'), 400);
        }
      };
      pad.querySelector('#asub').addEventListener('click', submit);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      return () => {};
    },

    /* 객관식 */
    quiz(q, c, box, api) {
      const pad = h('div','padzone quiz');
      pad.innerHTML = `
        <p class="quizq">${c.q}</p>
        <div class="opts">${c.options.map((o,i)=>
          `<button class="opt" data-i="${i}"><span class="optmark">${'ABCD'[i]}</span>${o}</button>`).join('')}</div>
        <div class="explain" id="ex" hidden></div>`;
      box.appendChild(pad);

      const ex = pad.querySelector('#ex');
      let done = false;

      pad.querySelectorAll('.opt').forEach(btn => {
        btn.addEventListener('click', () => {
          if (done) return;
          const i = +btn.dataset.i;
          if (i === c.answer) {
            done = true;
            btn.classList.add('right');
            ex.hidden = false;
            ex.innerHTML = '<b>정답!</b> ' + c.explain;
            api.success();
          } else {
            btn.classList.add('wrong');
            btn.disabled = true;
          }
        });
      });
      return () => {};
    },

    /* 직접 해보고 체크 */
    manual(q, c, box, api) {
      const pad = h('div','padzone');
      pad.innerHTML = `
        <button class="checkbtn" id="cb">
          <span class="checkbox">✓</span>
          <span>${c.confirm || '직접 해봤어요'}</span>
        </button>`;
      box.appendChild(pad);
      pad.querySelector('#cb').addEventListener('click', () => api.success());
      return () => {};
    }
  };

  return { parseSpec, symbols, keycaps, matches, mount, isMac, installGuards };
})();
