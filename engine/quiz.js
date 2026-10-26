// Один движок замість десяти копій QA у різних скриптах.
CH.quiz = (() => {
  let cache = { key: null, qMap: null, medical: null };
  let runId = 0;
  let watchToken = 0;

  // answers.json -> Map(питання -> Set(правильні відповіді)) + Set для категорії-масиву (MEDICAL)
  function build(db, only) {
    const key = `${db.version}|${only || ""}`;
    if (cache.key === key) return cache;
    const qMap = new Map();
    const medical = new Set();
    for (const [cat, val] of Object.entries(db.answers)) {
      if (only && cat !== only) continue;
      if (Array.isArray(val)) { val.forEach(a => medical.add(CH.norm(a))); continue; }
      for (const [q, a] of Object.entries(val)) {
        const k = CH.norm(q);
        if (!qMap.has(k)) qMap.set(k, new Set());
        (Array.isArray(a) ? a : [a]).forEach(x => qMap.get(k).add(CH.norm(x)));
      }
    }
    cache = { key, qMap, medical };
    return cache;
  }

  function lookup(qMap, qNorm) {
    if (qMap.has(qNorm)) return qMap.get(qNorm);
    if (qNorm.length < 20) return null;
    for (const [k, v] of qMap) {
      if (k.length >= 20 && (qNorm.includes(k) || k.includes(qNorm))) return v;
    }
    return null;
  }

  // Картка питання: найближчий предок, де є варіанти відповідей.
  function findCard(qEl, sel) {
    let el = sel.card ? qEl.closest(sel.card) : null;
    if (el && el.querySelector(sel.option)) return el;
    el = qEl.parentElement;
    for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
      if (el.querySelector(sel.option)) return el;
    }
    return null;
  }

  function clickTarget(opt) {
    return (
      opt.closest("label") ||
      opt.parentElement?.querySelector("input") ||
      opt.querySelector("input") ||
      opt.closest(".option-row") ||
      opt.closest(".cs-button") ||
      opt.closest("button") ||
      opt
    );
  }

  function isChecked(t) {
    const inp = t.tagName === "INPUT" ? t : (t.control || t.querySelector?.("input"));
    return !!(inp && inp.checked);
  }

  function highlight(opt) {
    const st = opt.style;
    st.setProperty("background", "#c8f7c5", "important");
    st.setProperty("border", "2px solid #2ecc71", "important");
    st.setProperty("border-radius", "4px");
    st.setProperty("font-weight", "bold");
  }

  async function clickAll(items, delay, id) {
    for (const { opt, target } of items) {
      if (id !== runId) return; // зупинено
      if (!opt.dataset.chDone && !isChecked(target)) target.click();
      opt.dataset.chDone = "1";
      await CH.sleep(delay);
    }
  }

  // Публічний run(): повертає лише підсумок, кліки йдуть у фоні.
  async function run(opts) {
    return (await runInternal(opts)).summary;
  }

  // Повертає і підсумок, і promise завершення кліків (потрібен автозавершенню).
  async function runInternal({ click = true, only = null } = {}) {
    const db = await CH.getDb();
    if (!db) return { summary: { error: "База не завантажена — натисніть «Оновити базу»" }, clickDone: Promise.resolve() };
    const sel = db.config.quiz;
    const { qMap, medical } = build(db, only);

    const found = new Map(); // елемент варіанта -> що клікати
    const unmatched = [];
    const consider = (root, set) => {
      let hit = 0;
      root.querySelectorAll(sel.option).forEach(opt => {
        if (set.has(CH.norm(opt.textContent))) { found.set(opt, clickTarget(opt)); hit++; }
      });
      return hit;
    };

    // Групуємо елементи questionText за КАРТКОЮ: в одній картці їх може бути кілька
    // (саме питання, підказка «Оберіть один із варіантів…» тощо). Питання = картка, а не елемент.
    const questionEls = [...document.querySelectorAll(sel.question)];
    const cards = new Map(); // картка -> [елементи questionText]
    for (const q of questionEls) {
      const card = findCard(q, sel);
      if (!card || !CH.shown(card)) continue; // приховані дублікати ігноруємо
      if (!cards.has(card)) cards.set(card, []);
      cards.get(card).push(q);
    }

    for (const [card, qEls] of cards) {
      let hit = 0;
      for (const q of qEls) { // питанням вважаємо той елемент, текст якого є в базі
        const answers = lookup(qMap, CH.norm(q.textContent));
        if (answers) { hit = consider(card, answers); if (hit) break; }
      }
      if (!hit && medical.size) hit = consider(card, medical); // формат «лише правильні відповіді»
      if (!hit) {
        const longest = qEls.map(q => CH.clean(q.textContent)).sort((a, b) => b.length - a.length)[0];
        unmatched.push(longest.slice(0, 80));
      }
    }
    if (!cards.size && !questionEls.length && medical.size) consider(document, medical);

    const items = [...found].map(([opt, target]) => ({ opt, target }));
    items.forEach(i => highlight(i.opt));

    const id = ++runId;
    const clickDone = click && items.length
      ? clickAll(items, db.config.quiz.delayMs ?? 100, id)
      : Promise.resolve();

    return { summary: { questions: cards.size, highlighted: items.length, unmatched }, clickDone };
  }

  // Чекає (до 10 с), поки кнопка «Завершити» (або «Відправити» — на тестах, що вантажаться
  // по кілька питань) стане активною, і натискає її один раз.
  async function clickFinish(finishWord, token) {
    const end = Date.now() + 10000;

    const finishWords = [
      CH.norm(finishWord || "Завершити"),
      CH.norm("Відправити")
    ];

    while (token === watchToken && Date.now() < end) {
      const b = [...document.querySelectorAll(
        "button, a, [role='button']"
      )].find(el => {
        const text = CH.norm(el.textContent);

        return finishWords.includes(text) && CH.enabled(el);
      });

      if (b) {
        b.click();
        return true;
      }

      await CH.sleep(300);
    }

    return false;
  }

  // Чекає, поки на сторінці з'являться питання (тест ще вантажиться), і запускає run().
  // Продовжує стежити: якщо набір питань змінився (посторінкові тести) — запускає знову.
  async function autoWatch(timeoutMs = 5 * 60 * 1000) {
    const my = ++watchToken;
    const db = await CH.getDb();
    if (!db) return;
    const { settings } = await chrome.storage.local.get("settings");
    const opts = { click: settings?.autoclick !== false, only: settings?.only || null };
    const autoFinish = opts.click && settings?.autofinish !== false;
    const finishWord = CH.norm(db.config.flow?.finishText || "Завершити");
    const sel = db.config.quiz;
    const end = Date.now() + timeoutMs;
    let prevSig = "";
    let ranSig = "";
    while (my === watchToken && Date.now() < end) {
      const qs = [...document.querySelectorAll(sel.question)];
      const sig = qs.map(q => CH.norm(q.textContent)).join("|");
      if (qs.length && sig === prevSig && sig !== ranSig) { // стабільно два опитування поспіль
        ranSig = sig;
        const { summary: r, clickDone } = await runInternal(opts);
        if (!r.error) {
          await clickDone; // дочекались, поки всі відповіді позначено

          // «Завершити» / «Відправити» натискаємо лише якщо в базі знайдено відповіді на ВСІ питання —
          // щоб не спалити спробу на неповному тесті.
          let finished = false;
          if (autoFinish && r.questions > 0 && r.unmatched.length === 0 && my === watchToken) {
            finished = await clickFinish(finishWord, my);
          }
          chrome.runtime.sendMessage({
            type: "quizResult",
            questions: r.questions, highlighted: r.highlighted, unmatched: r.unmatched.length, finished
          }).catch(() => {});
        }
      }
      prevSig = sig;
      await CH.sleep(700);
    }
  }

  // Усі правильні відповіді з бази (нормалізовані) — для слайдів «Перевір себе»
  function knownTexts(db) {
    const { qMap, medical } = build(db, null);
    const all = new Set(medical);
    qMap.forEach(set => set.forEach(x => all.add(x)));
    return all;
  }

  // Відповіді з бази на конкретне питання (або null) — для слайдів «Перевір себе»
  function answersFor(db, questionText) {
    if (!questionText) return null;
    const { qMap } = build(db, null);
    return lookup(qMap, CH.norm(questionText));
  }

  return { run, autoWatch, knownTexts, answersFor, stop: () => { runId++; watchToken++; } };
})();
