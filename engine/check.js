// Слайди «Перевір себе» у Storyline (шар доступності «acc-shadow»).
// Як це влаштовано (за діагностикою реального слайда):
//   варіанти  = input.acc-radio (aria-hidden="true", коли їх перекриває шар відгуку);
//   їхній текст = div.acc-text, що має в data-represents id варіанта;
//   відповідь = button.acc-button «Дати відповідь»;
//   після неї відкривається шар: «Спробувати ще» (хибно) або «Продовжити» (правильно).
// Алгоритм: вибрати варіант -> «Дати відповідь» -> «Спробувати ще» і наступний варіант
//           або «Продовжити» -> далі презентацію гортає engine/slides.js.
// Працює в КОЖНОМУ фреймі (презентацію малює iframe) і лише зі своїм document.
CH.check = (() => {
  const DEF = {
    optionInput: "input.acc-radio",
    submitTexts: ["Дати відповідь"],
    retryTexts: ["Спробувати ще", "Спробуйте ще", "Спробувати ще раз"],
    continueTexts: ["Продовжити"],
    pollMs: 400,
    selectDelayMs: 600,  // пауза між вибором варіанта і «Дати відповідь» (анімація стану)
    submitWaitMs: 4000,  // скільки чекати шар відгуку після відповіді
    maxRounds: 3         // скільки разів обійти всі варіанти, перш ніж здатися
  };
  let st = null;
  let timer = null;
  // Короткі повідомлення в консоль (F12) — видно, на якому кроці зупинилось
  const dbg = (...a) => console.info("[JS Tools Ext · check]", ...a);

  const conf = cfg => ({ ...DEF, ...(cfg.slides?.check || {}) });

  // Елемент «живий»: не перекритий шаром (aria-hidden), не вимкнений, має розміри.
  // pointer-events тут НЕ перевіряємо: у тіньових acc-елементів воно завжди none.
  const live = el => el.getAttribute("aria-hidden") !== "true" && !el.disabled && CH.shown(el);

  // Імітація миші (запасний шлях): повна послідовність подій із координатами центру
  function press(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(t => el.dispatchEvent(new MouseEvent(t, o)));
  }

  const accButtons = () => [...document.querySelectorAll("button.acc-button, button.acc-shadow-el")];
  function button(words) {
    const ws = words.map(CH.norm);
    return accButtons().find(b => {
      if (!live(b)) return false;
      const t = CH.norm(b.textContent);
      return !!t && ws.some(w => t === w || (t.includes(w) && t.length <= w.length + 6));
    }) || null;
  }
  const radios = c => [...document.querySelectorAll(c.optionInput)].filter(live);
  const idOf = el => (el.id || "").replace(/^acc-/, "");

  // Текст варіанта: найдовший acc-text, у data-represents якого є id варіанта (без «ПРАВИЛЬНА ВІДПОВІДЬ» і літер A–D)
  function optionText(radio) {
    const id = idOf(radio);
    let best = "";
    document.querySelectorAll(".acc-shadow-el.acc-text[data-represents]").forEach(el => {
      if (!(el.getAttribute("data-represents") || "").includes("." + id + ".")) return;
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length < 3 || CH.norm(t) === "правильнавідповідь") return;
      if (t.length > best.length) best = t;
    });
    return best;
  }

  function questionText(optionKeys) {
    let best = "";
    document.querySelectorAll(".acc-shadow-el.acc-text").forEach(el => {
      if (el.getAttribute("aria-hidden") === "true") return;
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length < 12 || optionKeys.has(CH.norm(t)) || /^google shape/i.test(t)) return;
      const score = t.length + (t.includes("?") ? 1000 : 0);
      if (score > (best ? best.length + (best.includes("?") ? 1000 : 0) : -1)) best = t;
    });
    return best;
  }

  // Storyline показує вибраний стан у data-acc-text об'єкта: «… 1» — звичайний, «… 2» — вибраний
  function isSelected(id) {
    const marks = [...document.querySelectorAll(`[data-model-id="${id}"]`)].map(e => e.getAttribute("data-acc-text") || "").filter(Boolean);
    return marks.length ? marks.some(m => /\s2$/.test(m)) : null; // null = невідомо
  }
  const visual = id => document.querySelector(`.slide-object-stategroup[data-model-id="${id}"]`) || document.querySelector(`[data-model-id="${id}"]`);

  // Чи це слайд-перевірка (щоб автопрохід у slides.js не клікав навмання)
  function present(cfg) {
    const c = conf(cfg);
    if (document.querySelector(c.optionInput)) return true;
    return !!button(c.submitTexts);
  }

  function start(cfg) {
    if (st?.running) return { already: true };
    const c = conf(cfg);
    dbg("запущено; фрейм:", location.href.slice(0, 90));
    st = { running: true, phase: "idle", sig: null, tried: new Set(), rounds: 0, t0: 0, cur: null,
           fbRadio: false, fbSubmit: false, known: new Set(), db: null, solved: 0 };
    const ready = CH.getDb()
      .then(db => { if (db && CH.quiz) { st.db = db; st.known = CH.quiz.knownTexts(db); } })
      .catch(() => {});

    const resetQ = () => { st.sig = null; st.tried.clear(); st.rounds = 0; st.cur = null; };

    const tick = () => {
      if (!st.running) return;
      const next = () => { timer = setTimeout(tick, c.pollMs); };
      const now = Date.now();
      const hasQuiz = !!document.querySelector(c.optionInput);

      // 1. Шар відгуку: «Продовжити» (правильно) має пріоритет над «Спробувати ще» (хибно)
      if (hasQuiz || st.phase === "submitted") {
        const cont = button(c.continueTexts);
        if (cont) { dbg("правильно → «Продовжити»"); cont.click(); st.solved++; resetQ(); st.phase = "idle"; return next(); }
        const retry = button(c.retryTexts);
        if (retry) { dbg("хибно → «Спробувати ще»"); retry.click(); st.phase = "idle"; return next(); } // tried зберігаємо — пробуємо інший варіант
      }

      // 2. Варіанти відповідей, доступні зараз
      const rs = radios(c);
      if (!rs.length) { // перехід між шарами або це не слайд-перевірка
        if (!hasQuiz) { resetQ(); st.phase = "idle"; }
        else if (st.phase === "submitted" && now - st.t0 > c.submitWaitMs * 2) st.phase = "idle";
        return next();
      }
      const submit = button(c.submitTexts);
      const opts = rs.map(r => ({ id: idOf(r), radio: r, key: CH.norm(optionText(r)) || idOf(r) }));
      const sig = opts.map(o => o.key).join("|");
      if (st.sig !== sig) { resetQ(); st.sig = sig; st.phase = "idle"; } // нове питання

      if (st.phase === "idle") {
        const keys = new Set(opts.map(o => o.key));
        const qa = st.db && CH.quiz?.answersFor ? CH.quiz.answersFor(st.db, questionText(keys)) : null;
        const rank = o => (qa && qa.has(o.key) ? 0 : st.known.has(o.key) ? 1 : 2); // відомі з бази — першими
        const pick = () => opts.filter(o => !st.tried.has(o.key)).sort((a, b) => rank(a) - rank(b))[0];
        let cand = pick();
        if (!cand) {
          if (st.rounds >= c.maxRounds) { dbg("здаюсь: усі варіанти пройдено", c.maxRounds, "разів"); st.running = false; return; } // здаємось, далі працює звичайний автопрохід
          st.rounds++; st.tried.clear(); cand = pick();
        }
        if (cand) {
          st.tried.add(cand.key); st.cur = cand; st.fbRadio = false;
          dbg("варіант:", cand.key.slice(0, 40), "| з бази:", rank(cand) < 2);
          cand.radio.click();               // основний шлях: через шар доступності
          st.phase = "selected"; st.t0 = now;
        }
      } else if (st.phase === "selected") {
        if (now - st.t0 >= c.selectDelayMs) {
          if (isSelected(st.cur.id) === false && !st.fbRadio) { // нативний клік не позначив варіант — імітуємо мишу
            dbg("радіо не позначилось → імітую мишу"); st.fbRadio = true; press(visual(st.cur.id)); st.t0 = now; return next();
          }
          if (submit) { dbg("→ «Дати відповідь»"); submit.click(); st.phase = "submitted"; st.t0 = now; st.fbSubmit = false; }
          else if (now - st.t0 > c.selectDelayMs * 5) st.phase = "idle";
        }
      } else if (st.phase === "submitted") { // варіанти ще активні, а шару відгуку немає — відповідь не прийнята
        if (now - st.t0 > c.submitWaitMs) {
          if (!st.fbSubmit && submit) { dbg("відгуку немає → імітую мишу на «Дати відповідь»"); st.fbSubmit = true; press(visual(idOf(submit))); st.t0 = now; }
          else st.phase = "idle";
        }
      }
      next();
    };
    ready.then(() => { if (st.running) tick(); });
    return { started: true };
  }

  return {
    start, present,
    stop() { if (st) st.running = false; clearTimeout(timer); },
    status: () => (st ? { ...st, tried: [...st.tried], known: st.known.size, db: !!st.db } : null)
  };
})();
