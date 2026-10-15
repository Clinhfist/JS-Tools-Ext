// Порт skip.js: перемотати відео в кінець.
CH.video = {
  supported: () => !!document.querySelector("video"),
  run() {
    const vs = [...document.querySelectorAll("video")];
    vs.forEach(v => { try { v.currentTime = 9999; } catch (_) {} });
    return { videos: vs.length };
  }
};
