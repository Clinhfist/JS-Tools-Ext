const $ = id => document.getElementById(id);
const out = t => { $("out").textContent = t; };

async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}

// Надсилаємо команду в усі фрейми вкладки й збираємо відповіді.
async function broadcast(msg) {
  const tab = await activeTab();
  const frames = (await chrome.webNavigation.getAllFrames({ tabId: tab.id })) || [];
  const res = await Promise.all(
    frames.map(f =>
      chrome.tabs.sendMessage(tab.id, msg, { frameId: f.frameId })
        .then(r => ({ frameId: f.frameId, ...r }))
        .catch(() => null)
    )
  );
  const ok = res.filter(r => r && !r.error);
  if (!ok.length) {
    const err = res.find(r => r?.error)?.error;
    throw new Error(err === "no-db"
      ? "База ще не завантажена — натисніть «Оновити базу»."
      : "Немає відповіді від сторінки. Оновіть вкладку (F5) і спробуйте ще раз.");
  }
  return ok;
}

async function renderMeta() {
  const { db, lastCheck, lastError, lastQuiz, settings } =
    await chrome.storage.local.get(["db", "lastCheck", "lastError", "lastQuiz", "settings"]);
  $("meta").textContent = db
    ? `База: ${db.version}` + (lastCheck ? ` · перевірено ${new Date(lastCheck).toLocaleString("uk")}` : "") +
      (lastError ? `\n⚠ ${lastError}` : "")
    : "База не завантажена" + (lastError ? `\n⚠ ${lastError}` : "");

  $("lastQuiz").textContent = lastQuiz
    ? `Останній автотест: питань ${lastQuiz.questions}, відповідей знайдено ${lastQuiz.highlighted}, без відповіді ${lastQuiz.unmatched}` +
      (lastQuiz.finished ? ", тест завершено" : "")
    : "";

  // Список наборів для вибору (з index.json: записи типу quiz мають поле answers)
  const sel = $("set");
  sel.length = 1;
  (db?.index || []).filter(e => e.answers).forEach(e => {
    const o = document.createElement("option");
    o.value = e.answers; o.textContent = e.title;
    sel.appendChild(o);
  });
  sel.value = settings?.only || "";
  $("autoclick").checked = settings?.autoclick !== false;
  $("autofinish").checked = settings?.autofinish !== false;
}

// Налаштування зберігаються: їх використовує й автоматичний режим (popup тоді закритий)
const saveSettings = () =>
  chrome.storage.local.set({
    settings: { autoclick: $("autoclick").checked, autofinish: $("autofinish").checked, only: $("set").value || null }
  });
$("autoclick").onchange = saveSettings;
$("autofinish").onchange = saveSettings;
$("set").onchange = saveSettings;

// Налаштування: панель розкривається збільшенням body (див. css/style.css)
function toggleSettings(open) {
  document.body.classList.toggle("settings-open", open);
  const b = $("btnSettings");
  b.setAttribute("aria-expanded", String(open));
  b.textContent = open ? "✕ Закрити" : "⚙ Налаштування";
}
$("btnSettings").onclick = () => toggleSettings(!document.body.classList.contains("settings-open"));
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.body.classList.contains("settings-open")) toggleSettings(false);
});

async function guard(fn) {
  try { await fn(); } catch (e) { out("⚠ " + e.message); }
}

$("btnDetect").onclick = () => guard(async () => {
  const r = await broadcast({ cmd: "detect" });
  const q = r.reduce((s, x) => s + x.questions, 0);
  const lines = [];
  if (q) lines.push(`Тест: ${q} питань`);
  if (r.some(x => x.slides)) lines.push("Презентація (Storyline)");
  if (r.some(x => x.video)) lines.push("Відео");
  if (r.some(x => x.pdf)) lines.push("PDF");
  out(lines.length ? lines.join("\n") : "Нічого знайомого не знайдено");
});

$("btnMaterial").onclick = () => guard(async () => {
  const r = (await broadcast({ cmd: "material" })).filter(x => x.kind);
  out(r.length
    ? r.map(x => `${x.kind}: ${x.note || (x.started ? "запущено" : x.already ? "вже працює" : "виконано")}`).join("\n")
    : "Не знайшов, що запускати на цій сторінці");
});

$("btnQuiz").onclick = () => guard(async () => {
  const r = (await broadcast({ cmd: "quiz", click: $("autoclick").checked, only: $("set").value || null }))
    .filter(x => x.kind);
  const sum = k => r.reduce((s, x) => s + (x[k] || 0), 0);
  const un = r.flatMap(x => x.unmatched || []);
  out(`Питань: ${sum("questions")}\nЗнайдено відповідей: ${sum("highlighted")}` +
      (un.length ? `\nНе знайдено в базі (${un.length}):\n- ` + un.slice(0, 5).join("\n- ") : ""));
});

$("btnDiag").onclick = () => guard(async () => {
  const r = (await broadcast({ cmd: "diag" })).filter(x => x.kind);
  out(r.length
    ? r.map(x => `${x.url}\nелементів questionText: ${x.elements} (видимих ${x.visible})\nу першій картці:\n- ${x.inFirstCard.join("\n- ")}`).join("\n\n")
    : "Питань на сторінці не знайдено");
});

$("btnStop").onclick = () => guard(async () => { await broadcast({ cmd: "stop" }); out("Зупинено"); });

$("btnSync").onclick = async () => {
  out("Оновлюю…");
  const r = await chrome.runtime.sendMessage({ type: "sync" });
  out(r.ok ? (r.updated ? `Оновлено до ${r.version}` : `Вже актуально: ${r.version}`) : "⚠ " + r.error);
  renderMeta();
};

renderMeta();
