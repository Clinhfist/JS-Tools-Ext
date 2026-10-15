// Спільні утиліти. Усі файли engine/* живуть в одному ізольованому світі content-скрипта.
var CH = {};

CH.clean = t =>
  (t || "").replace(/\u00a0/g, " ").replace(/\\/g, "/").replace(/\s+/g, " ").trim();

// Нормалізація для порівняння: регістр, NFKC, лишаються тільки літери й цифри
// (пробіли, лапки, тире, пунктуація, символи прибираються повністю).
CH.norm = t =>
  (t || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]/gu, "");

CH.visible = el => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return (
    r.width > 0 && r.height > 0 &&
    s.display !== "none" && s.visibility !== "hidden" &&
    !el.disabled && el.getAttribute("aria-disabled") !== "true"
  );
};

// Видима й справді клікабельна (враховує class="disabled" та pointer-events)
CH.enabled = el =>
  CH.visible(el) &&
  !el.classList.contains("disabled") &&
  getComputedStyle(el).pointerEvents !== "none";

// Елемент реально відображається (є розміри, не display:none) — для відсіювання прихованих дублікатів
CH.shown = el => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return (r.width > 0 || r.height > 0) && getComputedStyle(el).display !== "none";
};

CH.sleep = ms => new Promise(r => setTimeout(r, ms));

CH.getDb = async () => (await chrome.storage.local.get("db")).db || null;
