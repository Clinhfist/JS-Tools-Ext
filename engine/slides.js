// Автопрогортання презентацій (Storyline). Порт teoria.js.
CH.slides = (() => {
  let state = null;

  const supported = cfg =>
    !!(document.querySelector(cfg.slides.next) || document.querySelector(cfg.slides.interactive));

  function start(cfg) {
    if (state?.running) return { already: true };
    const s = cfg.slides;
    state = { running: true, steps: 0, clicked: new Set() };

    const key = b => b.getAttribute("data-represents") || b.id || CH.clean(b.textContent);
    const interactive = () =>
      [...document.querySelectorAll(s.interactive)].filter(
        b => CH.visible(b) && b.getAttribute("aria-hidden") !== "true"
      );

    const tick = () => {
      if (!state.running) return;

      // 1. Завершити курс
      const fin = [...document.querySelectorAll("button")].find(
        b => CH.clean(b.textContent).includes(s.finishText) && CH.visible(b)
      );
      if (fin) { state.running = false; fin.click(); return; }

      // 2. «Далі» має пріоритет
      const next = document.querySelector(s.next);
      if (next && CH.visible(next)) {
        next.click(); state.steps++; state.clicked.clear();
        return setTimeout(tick, s.nextDelay);
      }

      // 2.5. Слайд «Перевір себе»: відповіді дає engine/check.js — тут чекаємо, поки слайд перемкнеться
      if (CH.check && CH.check.present(cfg)) return setTimeout(tick, s.buttonDelay);

      // 3. Інтерактивні кнопки, поки «Далі» неактивне
      const fresh = interactive().find(b => !state.clicked.has(key(b)));
      if (fresh) {
        state.clicked.add(key(fresh)); fresh.click();
        return setTimeout(tick, s.buttonDelay);
      }

      // 4. Submit (за налаштуванням)
      const sub = document.querySelector(s.submit);
      if (s.autoSubmit && sub && CH.visible(sub)) {
        sub.click(); state.clicked.clear();
        return setTimeout(tick, s.buttonDelay);
      }

      setTimeout(tick, s.nextDelay); // чекаємо
    };

    tick();
    return { started: true };
  }

  return {
    supported,
    start,
    stop: () => { if (state) state.running = false; },
    status: () => ({ running: !!state?.running, steps: state?.steps || 0 })
  };
})();
