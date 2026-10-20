// Слайди «Перевір себе» у Storyline: на них не можна перейти далі, поки не дано правильну відповідь.
// Алгоритм: клік по варіанту -> «Дати відповідь» -> якщо слайд не змінився, пробуємо наступний варіант
// -> і так по колу, доки слайд не перемкнеться. Далі презентацію гортає engine/slides.js.
// Працює в КОЖНОМУ фреймі (презентацію малює iframe) і лише зі своїм document.
// Варіанти, що є в базі відповідей, пробуються першими.
CH.check = (() => {
  const DEF = {
    option: '[data-field="optionText"], .text.resizeable-text', // текст варіанта (як у medicine.js)
    clickable: '.cs-button, button, label, [role="button"], [role="radio"], [role="checkbox"]',
    submitTexts: ["Дати відповідь"],
    retryTexts: ["Спробувати ще", "Спробуйте ще", "Спробувати ще раз", "Ще раз"],
    pollMs: 400,
    selectWaitMs: 2500,   // скільки чекати, поки «Дати відповідь» стане активною після вибору
    resultWaitMs: 3000,   // скільки чекати зміни слайда після відповіді
    maxRounds: 3,         // скільки разів обійти всі варіанти, перш ніж здатися
    minOptionLen: 3       // відсікає «літери-позначки» A, B, C, D
  };
  let st = null;
  let timer = null;

  const conf = cfg => ({ ...DEF, ...(cfg.slides?.check || {}) });

  // Повна послідовність подій — надійніше за один .click() для кастомних Storyline-об'єктів
  function press(el) {
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(t =>
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })));
  }

  const clickables = c => [...document.querySelectorAll(c.clickable)];

  function findByText(words, c) {
    const ws = words.map(CH.norm);
    const hit = el => { const t = CH.norm(el.textContent); return !!t && ws.some(w => t === w || (t.includes(w) && t.length <= w.length + 6)); };
    // 1) сама кнопка; 2) текстовий об'єкт, чий клікабельний предок — кнопка
    let el = clickables(c).find(e => hit(e) && CH.shown(e));
    if (el) return el;
    const txt = [...document.querySelectorAll(c.option)].find(e => hit(e) && CH.shown(e));
    return txt ? (txt.closest(c.clickable) || txt) : null;
  }

  function findOptions(c, submit) {
    const seen = new Set();
    const out = [];
    const controls = new Set([...c.submitTexts, ...c.retryTexts].map(CH.norm));
    document.querySelectorAll(c.option).forEach(el => {
      if (!CH.shown(el) || (submit && submit.contains(el))) return;
      const key = CH.norm(el.textContent);
      if (key.length < c.minOptionLen || controls.has(key)) return; // літери-позначки та кнопки керування
      const target = el.closest(c.clickable);
      if (!target || seen.has(target)) return; // питання, заголовки, лічильник — без клікабельного предка
      if (submit && (target === submit || target.contains(submit))) return;
      seen.add(target);
      out.push({ key, target });
    });
    return out;
  }

  const signature = (opts, submit) => opts.map(o => o.key).join("|") + (submit ? "#s" : "");

  // Чи є на цій сторінці/фреймі слайд-перевірка (видима кнопка «Дати відповідь»)
  const present = cfg => !!findByText(conf(cfg).submitTexts, conf(cfg));

  function start(cfg) {
    if (st?.running) return { already: true };
    const c = conf(cfg);
    st = { running: true, phase: "idle", sig: null, tried: new Set(), rounds: 0, t0: 0, known: new Set(), solved: 0 };
    const ready = CH.getDb()
      .then(db => { if (db && CH.quiz?.knownTexts) st.known = CH.quiz.knownTexts(db); })
      .catch(() => {});

    const nextActive = () => {
      const n = document.querySelector(cfg.slides?.next || "#next");
      return !!n && CH.enabled(n);
    };

    const tick = () => {
      if (!st.running) return;
      const submit = findByText(c.submitTexts, c);
      if (!submit) { // це не слайд-перевірка (або вона вже пройдена)
        st.phase = "idle"; st.sig = null; st.tried.clear(); st.rounds = 0;
        timer = setTimeout(tick, c.pollMs);
        return;
      }
      const opts = findOptions(c, submit);
      const sig = signature(opts, submit);

      if (st.phase === "idle") {
        if (st.sig !== sig) { st.sig = sig; st.tried.clear(); st.rounds = 0; } // нове питання
        const pick = () =>
          opts.find(o => !st.tried.has(o.key) && st.known.has(o.key)) || opts.find(o => !st.tried.has(o.key));
        let cand = pick();
        if (!cand && opts.length) {
          if (st.rounds >= c.maxRounds) { st.running = false; return; } // здаємось, далі працює звичайний автопрохід
          st.rounds++; st.tried.clear(); cand = pick();
        }
        if (cand) { st.tried.add(cand.key); press(cand.target); st.phase = "selected"; st.t0 = Date.now(); }
      } else if (st.phase === "selected") {
        if (CH.enabled(submit)) { press(submit); st.phase = "submitted"; st.t0 = Date.now(); }
        else if (Date.now() - st.t0 > c.selectWaitMs) st.phase = "idle"; // не активувалась — інший варіант
      } else if (st.phase === "submitted") {
        if (nextActive() || sig !== st.sig) { // слайд змінився або відкрито «Далі» — відповідь правильна
          st.solved++; st.phase = "idle"; st.sig = null; st.tried.clear(); st.rounds = 0;
        } else if (Date.now() - st.t0 >= c.resultWaitMs) { // той самий слайд — відповідь хибна
          const retry = findByText(c.retryTexts, c);
          if (retry) press(retry);
          st.phase = "idle";
        }
      }
      timer = setTimeout(tick, c.pollMs);
    };
    ready.then(() => { if (st.running) tick(); });
    return { started: true };
  }

  return {
    start, present,
    stop() { if (st) st.running = false; clearTimeout(timer); },
    status: () => ({ ...st, tried: st ? [...st.tried] : [], known: st ? st.known.size : 0 })
  };
})();
