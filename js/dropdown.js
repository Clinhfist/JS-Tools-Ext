/* ============================================================
   JS/DROPDOWN.JS — власний випадаючий список замість стандартного <select>.
   Справжній <select id="set"> лишається в DOM (прихований) і є джерелом правди:
   popup.js як і раніше читає/ставить його value та слухає change. Ця надбудова
   лише малює красивий інтерфейс поверх нього й синхронізується з ним.
   ============================================================ */
(function () {
    "use strict";

    function enhanceSelect(select) {
        if (!select || select.dataset.enhanced) return;
        select.dataset.enhanced = "1";

        var uid = "dd-" + (select.id || Math.random().toString(36).slice(2, 7));
        var wrap = document.createElement("div");
        wrap.className = "dd";

        var trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "dd-trigger";
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("aria-controls", uid + "-list");
        var labelId = select.getAttribute("aria-labelledby");
        if (labelId) trigger.setAttribute("aria-labelledby", labelId + " " + uid + "-value");

        var valueEl = document.createElement("span");
        valueEl.className = "dd-value";
        valueEl.id = uid + "-value";
        trigger.appendChild(valueEl);
        trigger.insertAdjacentHTML("beforeend",
            '<svg class="dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');

        var list = document.createElement("ul");
        list.className = "dd-list";
        list.id = uid + "-list";
        list.setAttribute("role", "listbox");
        list.tabIndex = -1;

        wrap.appendChild(trigger);
        wrap.appendChild(list);
        select.insertAdjacentElement("afterend", wrap);
        select.hidden = true;

        var open = false;
        var active = -1;
        var group = select.closest(".group");
        var typed = "";
        var typedTimer = 0;

        /* ----- відображення ----- */
        function options() { return Array.prototype.slice.call(select.options); }

        function render() {
            list.innerHTML = "";
            options().forEach(function (o, i) {
                var li = document.createElement("li");
                li.className = "dd-opt";
                li.id = uid + "-opt-" + i;
                li.setAttribute("role", "option");
                li.dataset.index = i;
                li.innerHTML = '<span class="dd-check" aria-hidden="true">✓</span><span class="dd-text"></span>';
                li.querySelector(".dd-text").textContent = o.textContent;
                li.title = o.textContent;
                list.appendChild(li);
            });
            sync();
        }

        function sync() {
            var o = select.options[select.selectedIndex];
            valueEl.textContent = o ? o.textContent : "";
            Array.prototype.forEach.call(list.children, function (li, i) {
                var sel = i === select.selectedIndex;
                li.classList.toggle("is-selected", sel);
                li.setAttribute("aria-selected", sel ? "true" : "false");
            });
        }

        function setActive(i, scroll) {
            var items = list.children;
            if (!items.length) return;
            active = Math.max(0, Math.min(items.length - 1, i));
            Array.prototype.forEach.call(items, function (li, k) { li.classList.toggle("is-active", k === active); });
            trigger.setAttribute("aria-activedescendant", items[active].id);
            if (scroll !== false) items[active].scrollIntoView({ block: "nearest" });
        }

        /* ----- відкриття / закриття ----- */
        function setOpen(v) {
            if (v === open) return;
            open = v;
            wrap.classList.toggle("open", v);
            trigger.setAttribute("aria-expanded", v ? "true" : "false");
            if (group) group.classList.toggle("dd-open", v); // піднімаємо групу над сусідніми «скляними» картками
            if (v) {
                // не вміщається знизу — відкриваємо вгору
                var r = trigger.getBoundingClientRect();
                var h = Math.min(list.scrollHeight, 224) + 12;
                wrap.classList.toggle("dd-up", r.bottom + h > window.innerHeight - 6 && r.top > h);
                setActive(select.selectedIndex < 0 ? 0 : select.selectedIndex);
            } else {
                trigger.removeAttribute("aria-activedescendant");
            }
        }

        function choose(i) {
            if (i < 0 || i >= select.options.length) return;
            var changed = select.selectedIndex !== i;
            select.selectedIndex = i;           // нативний сеттер: подію change шлемо самі
            sync();
            setOpen(false);
            trigger.focus();
            if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
        }

        /* ----- події ----- */
        trigger.addEventListener("click", function () { setOpen(!open); });

        trigger.addEventListener("keydown", function (e) {
            var k = e.key;
            if (!open) {
                if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
                    e.preventDefault(); setOpen(true);
                }
                return;
            }
            if (k === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
            else if (k === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
            else if (k === "Home") { e.preventDefault(); setActive(0); }
            else if (k === "End") { e.preventDefault(); setActive(list.children.length - 1); }
            else if (k === "Enter" || k === " ") { e.preventDefault(); choose(active); }
            else if (k === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); } // не закриваємо панель налаштувань
            else if (k === "Tab") { setOpen(false); }
            else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { // швидкий пошук за першими літерами
                typed += k.toLowerCase();
                clearTimeout(typedTimer);
                typedTimer = setTimeout(function () { typed = ""; }, 700);
                var opts = options();
                for (var n = 0; n < opts.length; n++) {
                    var idx = (active + 1 + n) % opts.length;
                    if (opts[idx].textContent.toLowerCase().indexOf(typed) === 0) { setActive(idx); break; }
                }
            }
        });

        list.addEventListener("mousedown", function (e) { e.preventDefault(); }); // фокус лишається на кнопці
        list.addEventListener("mousemove", function (e) {
            var li = e.target.closest(".dd-opt");
            if (li && +li.dataset.index !== active) setActive(+li.dataset.index, false);
        });
        list.addEventListener("click", function (e) {
            var li = e.target.closest(".dd-opt");
            if (li) choose(+li.dataset.index);
        });

        document.addEventListener("pointerdown", function (e) { if (open && !wrap.contains(e.target)) setOpen(false); });
        trigger.addEventListener("blur", function () { setOpen(false); });

        // Закрилась панель налаштувань — закриваємо й список
        new MutationObserver(function () {
            if (open && !document.body.classList.contains("settings-open")) setOpen(false);
        }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

        /* ----- синхронізація з popup.js ----- */
        // popup.js перебудовує <option> і ставить select.value програмно
        new MutationObserver(render).observe(select, { childList: true, subtree: true, characterData: true });
        var desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
        Object.defineProperty(select, "value", {
            configurable: true,
            get: function () { return desc.get.call(this); },
            set: function (v) { desc.set.call(this, v); sync(); }
        });

        render();
    }

    enhanceSelect(document.getElementById("set"));
})();
