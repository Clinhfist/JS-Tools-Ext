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

        case "material": { // визначити тип, запустити обробник; у верхньому фреймі ще й крок LMS
          let r = { kind: null };
          if (info.slides) r = { kind: "slides", ...CH.slides.start(cfg) };
          else if (info.video) r = { kind: "video", ...CH.video.run() };
          else if (info.pdf) r = { kind: "pdf", ...CH.pdf.run() };
          if (window === window.top) {
            const fl = CH.flow.start(cfg);
            const note = "чекаю кнопку «Завершити» → «Перейти до тестування»";
            if (!r.kind) r = { kind: "flow", ...fl, note };
            else r.note = (r.note ? r.note + "; " : "") + note;
          }
          return sendResponse(r);
        }

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
          CH.slides.stop(); CH.quiz.stop(); CH.flow.stop();
          return sendResponse({ stopped: true });
      }
      sendResponse({ error: "unknown-cmd" });
    } catch (e) {
      sendResponse({ error: String(e.message || e) });
    }
  })();
  return true; // асинхронна відповідь
});

// Фрейм, створений ПІСЛЯ старту тесту (наприклад, iframe з питаннями): сам перевіряє, чи стежити.
(async () => {
  try {
    const { autoQuiz } = await chrome.storage.local.get("autoQuiz");
    if (autoQuiz && autoQuiz.until > Date.now()) {
      const r = await chrome.runtime.sendMessage({ type: "autoQuizActive" });
      if (r?.active) CH.quiz.autoWatch();
    }
  } catch (_) {}
})();
