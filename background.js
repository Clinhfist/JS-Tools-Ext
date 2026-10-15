// Service worker: тягне ДАНІ (JSON) з GitHub і кладе в chrome.storage.local.
// Код з мережі не виконується.
importScripts("config.js");

const FILES = ["answers.json", "index.json", "config.json"];

async function fetchText(name) {
  const r = await fetch(CH_BASE + name, { cache: "no-store" });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.text();
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sync(force = false) {
  try {
    const meta = JSON.parse(await fetchText("version.json"));
    const { db } = await chrome.storage.local.get("db");

    if (!force && db && db.version === meta.version) {
      await chrome.storage.local.set({ lastCheck: Date.now(), lastError: null });
      return { ok: true, updated: false, version: meta.version };
    }

    const parts = {};
    for (const name of FILES) {
      const text = await fetchText(name);
      const expected = meta.files?.[name]?.sha256;
      if (expected && (await sha256(text)) !== expected) {
        throw new Error(`${name}: хеш не збігається (GitHub ще кешує? спробуйте за хвилину)`);
      }
      parts[name.replace(".json", "")] = JSON.parse(text);
    }

    await chrome.storage.local.set({
      db: { version: meta.version, updated: meta.updated, ...parts },
      lastCheck: Date.now(),
      lastError: null
    });
    return { ok: true, updated: true, version: meta.version };
  } catch (e) {
    const error = String(e.message || e);
    await chrome.storage.local.set({ lastError: error, lastCheck: Date.now() });
    return { ok: false, error };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  sync();
  chrome.alarms.create("sync", { periodInMinutes: 360 });
});
chrome.runtime.onStartup.addListener(() => sync());
chrome.alarms.onAlarm.addListener(a => { if (a.name === "sync") sync(); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "sync") {
    sync(true).then(sendResponse);
    return true; // асинхронна відповідь
  }

  // Flow дійшов до «Почати тест»: помічаємо вкладку і будимо всі наявні фрейми
  if (msg?.type === "autoQuiz" && sender.tab) {
    const tabId = sender.tab.id;
    chrome.storage.local.set({ autoQuiz: { tabId, until: Date.now() + 5 * 60 * 1000 } }).then(async () => {
      const frames = (await chrome.webNavigation.getAllFrames({ tabId })) || [];
      frames.forEach(f =>
        chrome.tabs.sendMessage(tabId, { cmd: "quizWatch" }, { frameId: f.frameId }).catch(() => {})
      );
    });
    return;
  }

  // Фрейм, що з'явився пізніше, питає, чи треба стежити за тестом у цій вкладці
  if (msg?.type === "autoQuizActive") {
    chrome.storage.local.get("autoQuiz").then(({ autoQuiz }) =>
      sendResponse({ active: !!autoQuiz && autoQuiz.tabId === sender.tab?.id && autoQuiz.until > Date.now() })
    );
    return true;
  }

  // Результат автопошуку: значок на іконці розширення + запис для popup
  if (msg?.type === "quizResult" && sender.tab) {
    const ok = msg.unmatched === 0;
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.finished ? "✓" : ok ? "OK" : String(msg.unmatched) });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: ok ? "#2ecc71" : "#e74c3c" });
    chrome.storage.local.set({ lastQuiz: { ...msg, ts: Date.now() } });
  }
});
