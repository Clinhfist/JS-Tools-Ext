// ЗАГЛУШКА. Вбудований PDF-переглядач Chrome недоступний для content-скриптів.
// Працює лише для PDF, відкритих у DOM-переглядачі (pdf.js з #viewerContainer).
// Допишіть під вашу LMS, коли побачите, як саме вона показує PDF.
CH.pdf = {
  supported: () =>
    /\.pdf($|\?)/i.test(location.pathname) ||
    !!document.querySelector('embed[type="application/pdf"], #viewerContainer'),
  run() {
    const c = document.querySelector("#viewerContainer");
    if (c) { c.scrollTop = c.scrollHeight; return { done: true, note: "pdf.js прокручено до кінця" }; }
    return { done: false, note: "Потрібен власний обробник PDF для цієї LMS" };
  }
};
