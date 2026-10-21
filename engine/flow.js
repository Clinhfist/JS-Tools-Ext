// Крок оболонки LMS:
//  «Завершити» (активне після перегляду) -> «Перейти до тестування» -> «Почати тест» -> автопошук відповідей.
// Налаштування — з config.json (блок "flow"); без нього діють значення за замовчуванням.
CH.flow = (() => {
  const DEF = {
    finishText: "Завершити",               // точний збіг (не «Завершити і вийти», не «Завершити курс»)
    gotoTestText: "Перейти до тестування", // частковий збіг
    startTestText: "Почати тест",          // частковий збіг
    continueText: "Продовжити",            // вікно завершення модуля БЕЗ тесту: перехід до наступного модуля
    nextModule: true,                      // false = після «Завершити» без тесту зупинитись
    gotoTest: true,                        // false = лише дійти до вікна, не натискати
    startTest: true,                       // false = зупинитись перед «Почати тест»
    autoQuiz: true,                        // після старту тесту шукати й позначати відповіді
    pollMs: 1000,
    gotoTimeoutMs: 10000,
    startTimeoutMs: 30000,
    nextWaitMs: 20000,                     // скільки чекати зміни модуля після «Продовжити»
    maxAttempts: 3
  };
  let st = null;
  let timer = null;

  const buttons = () => [...document.querySelectorAll("button, a, [role='button']")];
  const text = el => CH.norm(el.textContent);

  function start(cfg) {
    if (st?.running) return { already: true };
    const f = { ...DEF, ...(cfg.flow || {}) };
    const finishWord = CH.norm(f.finishText);
    const gotoWord = CH.norm(f.gotoTestText);
    const startWord = CH.norm(f.startTestText);
    const contWord = CH.norm(f.continueText);
    st = { running: true, phase: "finish", attempts: 0, since: 0, autonext: true, modules: 0, waitUrl: null, settleUntil: 0 };
    // Налаштування popup («Переходити до наступного модуля») — до першого кроку
    const ready = chrome.storage.local.get("settings")
      .then(r => { st.autonext = r?.settings?.autonext !== false; })
      .catch(() => {});

    const finish = () => { st.running = false; st.done = true; };

    const tick = () => {
      if (!st.running) return;
      const quizHere = !!document.querySelector(cfg.quiz.question);

      // A. Сторінка перед тестом: «Почати тест» -> передаємо естафету пошуку відповідей
      if (f.startTest && !quizHere) {
        const sb = buttons().find(el => text(el).includes(startWord) && CH.enabled(el));
        if (sb) {
          sb.click();
          finish();
          if (f.autoQuiz) chrome.runtime.sendMessage({ type: "autoQuiz" }).catch(() => {});
          return;
        }
      }

      if (st.phase === "finish") {
        // Щойно перейшли до наступного модуля: чекаємо, поки зміниться адреса й усе завантажиться,
        // інакше старе «Завершити» (ще активне) спрацює передчасно
        if (st.waitUrl) {
          if (location.href === st.waitUrl && Date.now() - st.since < f.nextWaitMs) { timer = setTimeout(tick, f.pollMs); return; }
          if (location.href !== st.waitUrl) st.settleUntil = Date.now() + 2500;
          st.waitUrl = null;
        }
        if (st.settleUntil && Date.now() < st.settleUntil) { timer = setTimeout(tick, f.pollMs); return; }
        // На сторінці самого тесту така ж кнопка «Завершити» (completeQuiz) здає тест — не чіпаємо.
        if (!quizHere) {
          const b = buttons().find(el => text(el) === finishWord && CH.enabled(el));
          if (b) { b.click(); st.attempts++; st.phase = "goto"; st.since = Date.now(); }
        }
      } else if (st.phase === "goto") {
        const g = buttons().find(el => text(el).includes(gotoWord) && CH.visible(el));
        if (g) {
          if (!f.gotoTest) return finish();
          g.click();
          if (!f.startTest) return finish();
          st.phase = "start"; st.since = Date.now();
        } else {
          // Вікно без тесту: «Продовжити» → наступний модуль, і весь ланцюжок повторюється для нього
          const cont = f.nextModule && st.autonext
            ? buttons().find(el => text(el) === contWord && CH.visible(el)) : null;
          if (cont) {
            cont.click();
            st.modules++; st.phase = "finish"; st.attempts = 0; st.since = Date.now(); st.waitUrl = location.href;
            chrome.runtime.sendMessage({ type: "autoMaterial" }).catch(() => {}); // нові фрейми самі запустять матеріал
          } else if (Date.now() - st.since > f.gotoTimeoutMs) {
            if (st.attempts >= f.maxAttempts) return finish();
            st.phase = "finish"; // вікно не з'явилось — пробуємо ще
          }
        }
      } else if (st.phase === "start") {
        if (Date.now() - st.since > f.startTimeoutMs) return finish(); // кнопки «Почати тест» не дочекались
      }
      timer = setTimeout(tick, f.pollMs);
    };
    ready.then(() => { if (st.running) tick(); });
    return { started: true };
  }

  return {
    start,
    stop() { if (st) st.running = false; clearTimeout(timer); },
    status: () => ({ ...st })
  };
})();
