/* ============================================================
   NEON-BG.JS — фон popup: зорі + неонові лінії до курсора.
   Скопійовано з сайту (js/animations.js, initNeonField); зорі генеруються
   один раз на максимальну площу popup і не «перемішуються», коли
   налаштування розкриваються. Розмітка/логіка popup не змінюється.
   ============================================================ */
(function () {
    "use strict";

    function ready(fn) {
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
        else fn();
    }

    function initNeonField(staticOnly) {
        var canvas = document.createElement("canvas");
        canvas.id = "neon-bg";
        canvas.setAttribute("aria-hidden", "true");
        document.documentElement.insertBefore(canvas, document.body);

        var ctx = canvas.getContext("2d");
        if (!ctx) {
            canvas.remove();
            return;
        }

        // ---------- НАЛАШТУВАННЯ ----------
        var CELL = 56;          // середня відстань між крапками, px (менше = більше крапок)
        var MAXW = 800;         // найбільший розмір popup: зорі генеруємо на нього ОДИН раз,
        var MAXH = 620;         // тож при відкритті налаштувань вони не «перемішуються»
        var LINK_RADIUS = 190;  // з якої відстані від курсора крапки «тягнуть» лінії
        var MAX_LINES = 10;     // максимум ліній одночасно
        var IDLE_MS = 900;      // через скільки мс після зупинки курсора лінії згасають
        var DRIFT = 4;          // повільний «дрейф» крапок, px (0 = нерухомі)
        var COLORS = [          // неонові кольори ліній (RGB)
            [34, 211, 238],     // ціан
            [88, 166, 255],     // синій
            [167, 139, 250]     // фіолетовий
        ];
        // -----------------------------------

        var R2 = LINK_RADIUS * LINK_RADIUS;
        var w = 0;
        var h = 0;
        var dots = [];
        var raf = 0;
        var pointer = { x: 0, y: 0, sx: 0, sy: 0, on: false, last: -1e9, glow: 0 };

        function resizeCanvas() {
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = Math.max(1, window.innerWidth);
            h = Math.max(1, window.innerHeight);
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        // Кольорові «температури» зірок — як на реальних астрофото:
        // здебільшого білі й тепло-білі, трохи блакитних (гарячих) і
        // помаранчевих (холодних), зваженою вибіркою.
        var STAR_TINTS = [
            { c: [255, 255, 255], w: 40 }, // біла
            { c: [255, 244, 221], w: 25 }, // тепло-біла
            { c: [202, 225, 255], w: 18 }, // блакитно-біла (гарячі зорі)
            { c: [255, 214, 170], w: 12 }, // помаранчева
            { c: [255, 179, 140], w: 5 }   // червонувата (рідкісні холодні зорі)
        ];
        var STAR_TINT_TOTAL = STAR_TINTS.reduce(function (s, t) { return s + t.w; }, 0);
        function pickTint() {
            var r = Math.random() * STAR_TINT_TOTAL;
            for (var i = 0; i < STAR_TINTS.length; i++) {
                r -= STAR_TINTS[i].w;
                if (r <= 0) return STAR_TINTS[i].c;
            }
            return STAR_TINTS[0].c;
        }

        // Три «яруси» зірок за розміром і яскравістю — переважна більшість
        // мають бути крихітними й ледь помітними, і лише одиниці — акцентними.
        var STAR_TIERS = [
            { p: 0.90, rMin: 0.4, rMax: 0.9, aMin: 0.12, aMax: 0.32, whiteChance: 0.88, star: false, twinkleChance: 0.10 }, // дрібні, тьмяні
            { p: 0.09, rMin: 0.9, rMax: 1.45, aMin: 0.32, aMax: 0.58, whiteChance: 0.6, star: false, twinkleChance: 0.35 }, // середні
            { p: 0.01, rMin: 1.5, rMax: 2.1, aMin: 0.65, aMax: 0.9, whiteChance: 0.35, star: true, twinkleChance: 0.7 }   // акцентні, з м'яким сяйвом
        ];
        function pickTier() {
            var r = Math.random();
            var acc = 0;
            for (var i = 0; i < STAR_TIERS.length; i++) {
                acc += STAR_TIERS[i].p;
                if (r <= acc) return STAR_TIERS[i];
            }
            return STAR_TIERS[STAR_TIERS.length - 1];
        }

        // «Розкидана сітка»: по одній випадковій крапці в кожній клітинці,
        // частину клітинок пропускаємо — виглядає довільно, але без згустків
        function build() {
            dots = [];
            var cols = Math.max(2, Math.round(MAXW / CELL));
            var rows = Math.max(2, Math.round(MAXH / CELL));
            for (var r = 0; r < rows; r++) {
                for (var c = 0; c < cols; c++) {
                    if (Math.random() < 0.12) continue;

                    var tier = pickTier();

                    // Мерехтить лише частина зірок кожного ярусу — переважно
                    // серед середніх/акцентних, дрібні майже завжди стабільні
                    var doTwinkle = Math.random() < tier.twinkleChance;

                    // Колір: здебільшого чисто білий (особливо серед дрібних),
                    // пастельний відтінок — рідкісний штрих, а не правило
                    var tint = Math.random() < tier.whiteChance ? [255, 255, 255] : pickTint();

                    dots.push({
                        x0: ((c + Math.random()) / cols) * MAXW,
                        y0: ((r + Math.random()) / rows) * MAXH,
                        vis: true,
                        x: 0,
                        y: 0,
                        d: 1e9,
                        star: tier.star,
                        r: tier.rMin + Math.random() * (tier.rMax - tier.rMin),
                        a: tier.aMin + Math.random() * (tier.aMax - tier.aMin),
                        ph: Math.random() * 6.283,
                        // швидкість і сила мерехтіння — виразні лише в «мерехтливих» зірок,
                        // решта майже нерухомі (тонкий, ледь помітний подих)
                        sp: doTwinkle ? 0.25 + Math.random() * 0.9 : 0.05 + Math.random() * 0.08,
                        tw: doTwinkle ? 0.5 + Math.random() * 0.35 : 0.04 + Math.random() * 0.05,
                        twinkle: doTwinkle,
                        tint: tint,
                        col: COLORS[(Math.random() * COLORS.length) | 0],
                        p: 0,        // прогрес лінії 0..1 (скільки «виросла»)
                        want: false
                    });
                }

            }
        }

        function byDist(a, b) {
            return a.d - b.d;
        }

        function draw(now) {
            ctx.clearRect(0, 0, w, h);
            var t = now / 1000;
            var i;
            var d;
            var active = !staticOnly && pointer.on && now - pointer.last < IDLE_MS;

            // Плавно наздоганяємо курсор — лінії «тягнуться» за ним
            pointer.sx += (pointer.x - pointer.sx) * 0.35;
            pointer.sy += (pointer.y - pointer.sy) * 0.35;
            pointer.glow += ((active ? 1 : 0) - pointer.glow) * 0.08;

            var near = [];
            for (i = 0; i < dots.length; i++) {
                d = dots[i];
                d.vis = d.x0 < w + 10 && d.y0 < h + 10;
                if (!d.vis) { d.d = 1e9; d.p = 0; d.want = false; continue; }
                d.x = d.x0 + (staticOnly ? 0 : Math.sin(t * d.sp + d.ph) * DRIFT);
                d.y = d.y0 + (staticOnly ? 0 : Math.cos(t * d.sp * 0.9 + d.ph) * DRIFT);
                var dx = d.x - pointer.sx;
                var dy = d.y - pointer.sy;
                var d2 = dx * dx + dy * dy;
                d.d = Math.sqrt(d2);
                if (active && d2 < R2) near.push(d);
            }
            if (near.length > MAX_LINES) {
                near.sort(byDist);
                near.length = MAX_LINES;
            }
            for (i = 0; i < near.length; i++) near[i].want = true;

            // Базові крапки — зорі: мерехтять і трохи світяться
            ctx.globalCompositeOperation = "source-over";
            for (i = 0; i < dots.length; i++) {
                d = dots[i];
                if (!d.vis) continue;
                d.p += ((d.want ? 1 : 0) - d.p) * (d.want ? 0.16 : 0.07);
                if (d.p < 0.004) d.p = 0;
                d.want = false;

                // Мерехтіння: 0..1, кожна зоря — з власною фазою й швидкістю
                var flicker = staticOnly
                    ? 1
                    : 1 - d.tw + d.tw * (0.5 + 0.5 * Math.sin(t * d.sp + d.ph));
                var alpha = d.a * flicker;

                var tintStr = d.tint[0] + "," + d.tint[1] + "," + d.tint[2];

                if (d.star) {
                    // Єдиний плавний градієнт від яскравого центру до прозорого краю —
                    // без окремого суцільного кружечка всередині, щоб зоря не виглядала
                    // як заштрихована 3D-кулька, а як м'яка цятка світла
                    var glowR = d.r * 4;
                    var glow = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, glowR);
                    glow.addColorStop(0, "rgba(" + tintStr + "," + alpha + ")");
                    glow.addColorStop(0.22, "rgba(" + tintStr + "," + alpha * 0.75 + ")");
                    glow.addColorStop(0.55, "rgba(" + tintStr + "," + alpha * 0.18 + ")");
                    glow.addColorStop(1, "rgba(" + tintStr + ",0)");
                    ctx.fillStyle = glow;
                    ctx.beginPath();
                    ctx.arc(d.x, d.y, glowR, 0, 6.2832);
                    ctx.fill();
                } else {
                    // тьмяні фонові зорі — теж із легким відтінком, а не чистим сірим
                    ctx.fillStyle = "rgba(" + tintStr + "," + alpha * 0.85 + ")";
                    ctx.beginPath();
                    ctx.arc(d.x, d.y, d.r, 0, 6.2832);
                    ctx.fill();
                }

                // На піку мерехтіння яскраві мерехтливі зорі дають тонкий
                // хрестоподібний відблиск — як дифракційні промені на фото неба
                if (d.star && d.twinkle && flicker > 0.86) {
                    var spikeA = (flicker - 0.86) / 0.14 * alpha * 0.75;
                    var sl = d.r * 9;
                    ctx.strokeStyle = "rgba(" + tintStr + "," + spikeA + ")";
                    ctx.lineWidth = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(d.x - sl, d.y);
                    ctx.lineTo(d.x + sl, d.y);
                    ctx.moveTo(d.x, d.y - sl);
                    ctx.lineTo(d.x, d.y + sl);
                    ctx.stroke();
                }
            }

            // Неонові лінії (адитивне змішування дає ефект світіння)
            ctx.globalCompositeOperation = "lighter";
            ctx.lineCap = "round";
            for (i = 0; i < dots.length; i++) {
                d = dots[i];
                if (d.p < 0.01) continue;

                var k = 1 - Math.min(1, d.d / LINK_RADIUS);   // ближче до курсора — яскравіше
                var s = d.p * (0.35 + 0.65 * k);
                var e = d.p * d.p * (3 - 2 * d.p);            // плавне «виростання»
                var ex = d.x + (pointer.sx - d.x) * e;
                var ey = d.y + (pointer.sy - d.y) * e;
                var rgb = d.col[0] + "," + d.col[1] + "," + d.col[2];

                ctx.beginPath();
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(ex, ey);
                ctx.strokeStyle = "rgba(" + rgb + "," + 0.06 * s + ")";
                ctx.lineWidth = 7;
                ctx.stroke();
                ctx.strokeStyle = "rgba(" + rgb + "," + 0.16 * s + ")";
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.strokeStyle = "rgba(" + rgb + "," + 0.9 * s + ")";
                ctx.lineWidth = 1;
                ctx.stroke();

                // Крапка, від якої йде лінія, теж світиться
                ctx.fillStyle = "rgba(" + rgb + "," + 0.14 * s + ")";
                ctx.beginPath();
                ctx.arc(d.x, d.y, 8, 0, 6.2832);
                ctx.fill();
                ctx.fillStyle = "rgba(" + rgb + "," + 0.9 * s + ")";
                ctx.beginPath();
                ctx.arc(d.x, d.y, d.r + 0.8, 0, 6.2832);
                ctx.fill();
            }

            // М'яка точка світла на самому курсорі, куди збігаються лінії
            if (pointer.glow > 0.01) {
                var g = ctx.createRadialGradient(pointer.sx, pointer.sy, 0, pointer.sx, pointer.sy, 56);
                g.addColorStop(0, "rgba(88,166,255," + 0.22 * pointer.glow + ")");
                g.addColorStop(1, "rgba(88,166,255,0)");
                ctx.fillStyle = g;
                ctx.fillRect(pointer.sx - 56, pointer.sy - 56, 112, 112);
            }
        }

        function loop(now) {
            raf = requestAnimationFrame(loop);
            if (document.hidden) return;
            draw(now);
        }

        function onPointer(e) {
            pointer.x = e.clientX;
            pointer.y = e.clientY;
            if (!pointer.on) {
                pointer.sx = e.clientX;
                pointer.sy = e.clientY;
            }
            pointer.on = true;
            pointer.last = performance.now();
        }

        resizeCanvas();
        build();

        if (staticOnly) {
            draw(0);
        } else {
            window.addEventListener("pointermove", onPointer, { passive: true });
            window.addEventListener("pointerdown", onPointer, { passive: true });
            document.documentElement.addEventListener("mouseleave", function () {
                pointer.on = false;
            });
            raf = requestAnimationFrame(loop);
        }

        // Popup змінює розмір (анімація налаштувань): підганяємо canvas щокадру, зорі лишаються на місцях
        var rs = 0;
        function onResize() {
            if (rs) return;
            rs = requestAnimationFrame(function () {
                rs = 0;
                resizeCanvas();
                if (staticOnly) draw(0);
            });
        }
        if (window.ResizeObserver) new ResizeObserver(onResize).observe(document.documentElement);
        window.addEventListener("resize", onResize);
    }

    // Поважаємо «зменшити рух»: лише статичні крапки, без руху й ліній
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ready(function () { initNeonField(!!reduce); });
})();
