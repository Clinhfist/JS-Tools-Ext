// Запуск обробників матеріалу у цьому фреймі (спільний для кнопки в popup і для автоматичного режиму)
function startMaterial(cfg, info) {
  let r = { kind: null };
  if (info.slides) r = { kind: "slides", ...CH.slides.start(cfg) };
  else if (info.video) r = { kind: "video", ...CH.video.run() };
  else if (info.pdf) r = { kind: "pdf", ...CH.pdf.run() };
  // Слайди «Перевір себе» можуть бути в будь-якому фреймі презентації — слідкуємо в кожному
  const hasCheck = CH.check.present(cfg);
  CH.check.start(cfg);
  if (hasCheck) {
    const n = "проходжу «Перевір себе»: варіант → «Дати відповідь»";
    r = r.kind ? { ...r, note: (r.note ? r.note + "; " : "") + n } : { kind: "check", started: true, note: n };
  }
  if (window === window.top) {
    const fl = CH.flow.start(cfg);
    const note = "чекаю «Завершити» → «Перейти до тестування» / «Продовжити»";
    if (!r.kind) r = { kind: "flow", ...fl, note };
    else r.note = (r.note ? r.note + "; " : "") + note;
  }
  return r;
}

// Автоматичний режим для фреймів, створених ПІСЛЯ переходу до наступного модуля:
// вміст Storyline будується із затримкою, тому чекаємо, поки з'являться слайди чи відео.
function autoMaterial(cfg) {
  CH.check.start(cfg);
  const t0 = Date.now();
  const iv = setInterval(() => {
    const info = { slides: CH.slides.supported(cfg), video: CH.video.supported() };
    if (info.slides) { clearInterval(iv); CH.slides.start(cfg); }
    else if (info.video) { clearInterval(iv); CH.video.run(); }
    else if (Date.now() - t0 > 60000) clearInterval(iv);
  }, 500);
}

// Працює в КОЖНОМУ фреймі сторінки (all_frames) і працює лише зі своїм document.
// Popup розсилає команду в усі фрейми, кожен відповідає про себе.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      const db = await CH.getDb();
      if (!db) return sendResponse({ error: "no-db" });
      const cfg = db.config;

      const info = {
        url: location.href,
        questions: document.querySelectorAll(cfg.quiz.question).length,
        slides: CH.slides.supported(cfg),
        video: CH.video.supported(),
        pdf: CH.pdf.supported()
      };

      switch (msg.cmd) {
        case "detect":
          return sendResponse(info);

        case "material": // визначити тип, запустити обробник; у верхньому фреймі ще й крок LMS
          return sendResponse(startMaterial(cfg, info));

        case "quiz":
          return sendResponse({ kind: "quiz", ...(await CH.quiz.run({ click: msg.click, only: msg.only })) });

        case "diag": { // діагностика: скільки елементів questionText і карток, що в першій картці
          const els = [...document.querySelectorAll(cfg.quiz.question)];
          if (!els.length) return sendResponse({ kind: null });
          const first = els[0];
          let card = first.closest(cfg.quiz.card) || first.parentElement;
          const inCard = card ? [...card.querySelectorAll(cfg.quiz.question)] : [];
          return sendResponse({
            kind: "diag",
            elements: els.length,
            visible: els.filter(CH.shown).length,
            inFirstCard: inCard.map(e => CH.clean(e.textContent).slice(0, 50)),
            url: location.hostname + location.pathname.slice(0, 30)
          });
        }

        case "quizWatch":
          CH.quiz.autoWatch();
          return sendResponse({ kind: "quizWatch", watching: true });

        case "stop":
          CH.slides.stop(); CH.quiz.stop(); CH.flow.stop(); CH.check.stop();
          chrome.storage.local.remove(["autoMaterial", "autoQuiz"]).catch(() => {});
          return sendResponse({ stopped: true });
      }
      sendResponse({ error: "unknown-cmd" });
    } catch (e) {
      sendResponse({ error: String(e.message || e) });
    }
  })();
  return true; // асинхронна відповідь
});

// Фрейм, створений ПІСЛЯ старту тесту чи переходу до наступного модуля: сам перевіряє, що робити.
(async () => {
  try {
    const { autoQuiz, autoMaterial: am } = await chrome.storage.local.get(["autoQuiz", "autoMaterial"]);
    const now = Date.now();
    if ((autoQuiz && autoQuiz.until > now) || (am && am.until > now)) {
      const r = await chrome.runtime.sendMessage({ type: "autoState" });
      if (r?.quiz) CH.quiz.autoWatch();
      if (r?.material) { const db = await CH.getDb(); if (db) autoMaterial(db.config); }
    }
  } catch (_) {}
})();
