// يُحقن في كل صفحة: بطاقة العنوان/الختام المتحركة، شريط شرح سفلي، إطار تمييز، مؤشر ونقرة، وتكبير/تصغير للشاشة.
// نص JS خام (وليس دالة TS) لأن tsx يضيف مساعدات إلى الدوال المُسلسلة فتفشل داخل الصفحة.
// الشريط والإطار والمؤشر تُرسم في الـ top layer (popover) فلا تتأثر بتكبير الصفحة.
// الحركة كلها CSS (opacity/transform فقط) وتتزامن مع الصوت: يبدأ كل شيء عند بدء مقطع الصوت، ويمتد شريط التقدم بطول المقطع.
// عند تغيّر الصفحة أثناء حركة جارية تُحسب الحركة بتأخير سالب من الزمن المنقضي، فلا تُعاد من البداية.
// ممنوع استعمال الشرطة المعكوسة (backslash) داخل هذا النص: القالب يبتلعها.

// ألوان هوية Jawab (من الشعار)
export const BRAND = { navy: "#1e3a8a", blue: "#60a5fa", green: "#10b981" };

export type TitleCard = {
  title: string; subtitle: string; label: string; logo?: string; note?: string;
  ep?: { n: number; total: number }; // خريطة السلسلة: نقاط بعدد الحلقات والحلقة الحالية مضيئة
  points?: string[]; // أهداف التعلّم: تظهر تباعًا أسفل البطاقة أثناء كلام المقدمة
  durMs?: number; // مدة بقاء البطاقة: يمتد خط تقدم رفيع بطولها فلا تبدو ساكنة
  // مقدمة بشرائح: كل شريحة تظهر مع جملتها المنطوقة (series: اسم السلسلة، episode: عنوان الحلقة، points: أهداف التعلّم) بدل مشهد ساكن طويل
  series?: string; epLabel?: string; epTitle?: string;
  scenes?: { kind: "series" | "episode" | "points"; startMs: number; endMs: number }[];
};

// scale/bottom: للنسخة العمودية يكبُر الشرح والمؤشر ويرتفع الشريط فوق منطقة واجهة المنصات (الأزرار والتعليقات في أسفل الشاشة)
export const bootScript = (card: TitleCard, scale = 1, bottom = 28) =>
  `window.__TUT_BOOT = ${JSON.stringify(card)}; window.__TUT_LOGO = ${JSON.stringify(card.logo ?? "")}; window.__TUT_S = ${scale}; window.__TUT_BOT = ${bottom};`;

export const overlayInitScript = `
(() => {
  const KEY = "__tut_state";
  const FONT = "'Segoe UI',Tahoma,sans-serif";
  // خط بطاقتي المقدمة والختام: Dubai (عربي ولاتيني هندسي حديث، مثبّت مع ويندوز) بدل Segoe UI؛ أما شريط الشرح فيبقى بخطه
  const TFONT = "'Dubai','Segoe UI',Tahoma,sans-serif";
  const NAVY = "${BRAND.navy}", BLUE = "${BRAND.blue}", GREEN = "${BRAND.green}";
  const S = window.__TUT_S || 1, BOT = window.__TUT_BOT || 28;
  const EASE = "cubic-bezier(.2,.8,.2,1)";
  const SMOOTH = "cubic-bezier(.16,1,.3,1)"; // حركة النصوص: تبدأ سريعة وتستقر بنعومة

  // ---------- أنماط الحركة ----------
  const css = [
    "@keyframes __tutPageIn{from{opacity:0}to{opacity:1}}",
    "@keyframes __tutActionIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}",
    "@keyframes __tutDrop{from{opacity:0}to{opacity:1}}",
    "@keyframes __tutLogoIn{from{opacity:0;transform:scale(.88);filter:blur(10px)}to{opacity:1;transform:none;filter:blur(0)}}",
    "@keyframes __tutPillIn{from{opacity:0;transform:translateY(-12px) scale(.86)}to{opacity:1;transform:none}}",
    "@keyframes __tutWordUp{from{transform:translateY(112%);opacity:0}to{transform:none;opacity:1}}",
    "@keyframes __tutTrack{from{opacity:0;letter-spacing:.16em;transform:translateY(8px)}to{opacity:1;letter-spacing:0;transform:none}}",
    "@keyframes __tutFadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}",
    "@keyframes __tutGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}",
    "@keyframes __tutFoot{from{transform:translateY(100%)}to{transform:none}}",
    "@keyframes __tutExitUp{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-16px)}}",
    "@keyframes __tutPush{from{scale:1}to{scale:1.07}}",
    "@keyframes __tutGlow{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0);transform:scale(1)}50%{box-shadow:0 0 0 9px rgba(16,185,129,.32);transform:scale(1.12)}}",
    "@keyframes __tutLine{from{transform:scaleX(0)}to{transform:scaleX(1)}}",
    "@keyframes __tutDrift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}",
    "@keyframes __tutDot{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:none}}",
    "@keyframes __tutDotNow{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.6)}50%{box-shadow:0 0 0 7px rgba(16,185,129,0)}}",
    "@keyframes __tutTick{from{transform:scale(0) rotate(-25deg)}to{transform:none}}",
    "@keyframes __tutFloatA{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(60px,40px) scale(1.12)}}",
    "@keyframes __tutFloatB{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-70px,-30px) scale(1.08)}}",
    "@keyframes __tutBreathe{0%,100%{filter:drop-shadow(0 0 0 rgba(96,165,250,0))}50%{filter:drop-shadow(0 8px 26px rgba(96,165,250,.55))}}",
    "@keyframes __tutBarIn{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}",
    "@keyframes __tutBarOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(18px)}}",
    "@keyframes __tutPop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}",
    "@keyframes __tutRingIn{from{opacity:0;transform:scale(1.1)}to{opacity:1;transform:none}}",
    "@keyframes __tutPulse{0%,100%{box-shadow:0 0 0 2px #fff,0 0 0 9999px rgba(15,23,42,.2),0 0 0 0 rgba(16,185,129,.55)}50%{box-shadow:0 0 0 2px #fff,0 0 0 9999px rgba(15,23,42,.2),0 0 0 12px rgba(16,185,129,0)}}",
    "@keyframes __tutSweep{from{transform:scaleX(0)}to{transform:scaleX(1)}}",
    "@keyframes __tutRipple{from{transform:translate(-50%,-50%) scale(.2);opacity:.8}to{transform:translate(-50%,-50%) scale(2.6);opacity:0}}",
    "body{animation:__tutPageIn .35s ease-out both}",
    ".o_action_manager > .o_action.__tut_enter{animation:__tutActionIn .3s " + EASE + " both}",
    ".o-dropdown--menu,.o-autocomplete--dropdown-menu{animation:__tutDrop .16s ease-out both}"
  ].join("");
  const injectCss = () => {
    if (!document.documentElement) return false;
    if (document.getElementById("__tut_css")) return true;
    const st = document.createElement("style");
    st.id = "__tut_css";
    st.textContent = css;
    document.documentElement.appendChild(st);
    return true;
  };
  if (!injectCss()) new MutationObserver((_, o) => { if (injectCss()) o.disconnect(); }).observe(document, { childList: true });

  // انتقال ناعم عند تبديل الشاشة داخل Jawab (التطبيق لا يعيد تحميل الصفحة)
  const watchActions = () => {
    const mgr = document.querySelector(".o_action_manager");
    if (!mgr || mgr.__tutWatched) return;
    mgr.__tutWatched = true;
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && n.classList.contains("o_action")) n.classList.add("__tut_enter");
      }
    }).observe(mgr, { childList: true });
  };
  new MutationObserver(watchActions).observe(document, { childList: true, subtree: true });

  // ---------- بطاقة العنوان / الختام ----------
  // كل عنصر نصي يحمل data-x (ترتيب الخروج) ليخرج بالتتابع بعكس دخوله
  const exitText = () => {
    const els = [...document.querySelectorAll("#__tut_boot [data-x]")];
    els.forEach((e, i) => { e.style.animation = "__tutExitUp .42s ease-in " + (i * 0.05).toFixed(2) + "s both"; });
    return els.length;
  };
  const drawBoot = (c, restart) => {
    const SC = 1 + (S - 1) * 0.55; // النسخة العمودية: نصوص البطاقة الصغيرة أكبر قليلًا
    if (restart) window.__TUT_T0 = Date.now();
    // الزمن المنقضي منذ بدء الحركة: يجعل إعادة الرسم بعد تحميل صفحة جديدة تكمل من حيث وصلت
    let t0v = window.__TUT_T0;
    if (!t0v) { try { const m = /(?:^|; )__tut_t0=([0-9]+)/.exec(document.cookie); if (m) t0v = Number(m[1]); } catch (e) {} }
    const e = t0v ? Math.max(0, (Date.now() - t0v) / 1000) : 0;
    const anim = (name, dur, delay, ease) => "animation:" + name + " " + dur + "s " + (ease || SMOOTH) + " " + (delay - e).toFixed(2) + "s both;";
    const old = document.getElementById("__tut_boot");
    if (old) old.remove();
    const el = document.createElement("div");
    el.id = "__tut_boot";
    el.dir = "rtl";
    el.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;text-align:center;overflow:hidden;background:linear-gradient(120deg,#ffffff 0%,#eef3fb 30%,#e3edfc 55%,#f3f8ff 80%,#ffffff 100%);background-size:300% 300%;animation:__tutDrift 18s ease-in-out " + (-e).toFixed(2) + "s infinite,__tutPush 26s linear " + (-e).toFixed(2) + "s both;color:" + NAVY + ";font-family:" + TFONT + ";transition:opacity .55s ease,transform .55s ease,filter .55s ease";

    // كتل لونية هادئة تطفو ببطء خلف المحتوى
    for (const [col, x, y, s, nm, d] of [[BLUE, "-8%", "-12%", 520, "A", 11], [GREEN, "70%", "58%", 460, "B", 13]]) {
      const b = document.createElement("div");
      b.style.cssText = "position:absolute;left:" + x + ";top:" + y + ";width:" + s + "px;height:" + s + "px;border-radius:50%;background:radial-gradient(circle," + col + "33 0%," + col + "00 70%);animation:__tutFloat" + nm + " " + d + "s ease-in-out infinite;pointer-events:none";
      el.appendChild(b);
    }
    // ---- مقدمة بشرائح ----
    if (c.scenes && c.scenes.length) {
      const style = document.createElement("style");
      let css = "";
      let xs = 0;
      const mkWords = (text, size, st, base) => {
        const t = document.createElement("div");
        t.setAttribute("data-x", String(xs++));
        t.style.cssText = "font-size:" + size + "px;font-weight:800;line-height:1.4;padding:0 60px;max-width:92%;position:relative;text-wrap:balance;";
        text.split(" ").forEach((w, i) => {
          const mask = document.createElement("span");
          mask.style.cssText = "display:inline-block;overflow:hidden;vertical-align:top;margin:0 .14em;padding:.14em .04em;margin-top:-.14em;margin-bottom:-.14em";
          const sp = document.createElement("span");
          sp.textContent = w;
          sp.style.cssText = "display:inline-block;animation:__tutWordUp .85s " + SMOOTH + " " + (base + i * 0.075 + st - e).toFixed(2) + "s both;";
          mask.appendChild(sp);
          t.appendChild(mask);
        });
        return t;
      };
      c.scenes.forEach((sc, i) => {
        const st = sc.startMs / 1000, en = sc.endMs / 1000, d = Math.max(1.4, en - st), last = i === c.scenes.length - 1;
        const an = (name, dur, delay, ease) => "animation:" + name + " " + dur + "s " + (ease || SMOOTH) + " " + (delay + st - e).toFixed(2) + "s both;";
        const fi = (Math.min(0.6, d / 3) / d) * 100, fo = 100 - (Math.min(0.5, d / 3) / d) * 100;
        css += "@keyframes __tutScene" + i + "{0%{opacity:0;transform:translateY(18px)}" + fi.toFixed(2) + "%{opacity:1;transform:none}" +
          (last ? "100%{opacity:1;transform:none}" : fo.toFixed(2) + "%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-14px)}") + "}";
        const layer = document.createElement("div");
        layer.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;text-align:center;opacity:0;animation:__tutScene" + i + " " + d.toFixed(2) + "s linear " + (st - e).toFixed(2) + "s both;";
        const pill = (txt, delay) => {
          const p = document.createElement("div");
          p.textContent = txt;
          p.setAttribute("data-x", String(xs++));
          p.style.cssText = "font-size:" + 22 * SC + "px;font-weight:700;color:#fff;background:" + NAVY + ";border-radius:999px;padding:6px 22px;position:relative;" + an("__tutPillIn", 0.7, delay);
          return p;
        };
        const bars = () => {
          const b = document.createElement("div");
          b.setAttribute("data-x", String(xs++));
          b.style.cssText = "display:flex;gap:8px;position:relative";
          [NAVY, BLUE, GREEN].forEach((col, k) => { const s = document.createElement("span"); s.style.cssText = "display:block;width:56px;height:8px;border-radius:4px;background:" + col + ";transform-origin:center;" + an("__tutGrow", 0.6, 1.3 + k * 0.1); b.appendChild(s); });
          return b;
        };
        const logo = (w, delay) => {
          if (!c.logo) return null;
          const img = document.createElement("img");
          img.src = c.logo;
          img.style.cssText = "width:" + w + "px;height:auto;display:block;" + an("__tutLogoIn", 1.0, delay, EASE);
          const wrap = document.createElement("div");
          wrap.setAttribute("data-x", String(xs++));
          wrap.style.cssText = "position:relative;margin-bottom:10px;";
          wrap.appendChild(img);
          return wrap;
        };
        if (sc.kind === "series") {
          const lg = logo(380, 0.15);
          if (lg) layer.appendChild(lg);
          layer.appendChild(pill(c.label, 0.5));
          layer.appendChild(mkWords(c.series || c.title, 58, st, 0.8));
          layer.appendChild(bars());
        } else if (sc.kind === "episode") {
          const lg = logo(230, 0.1);
          if (lg) layer.appendChild(lg);
          layer.appendChild(pill(c.epLabel || c.label, 0.4));
          layer.appendChild(mkWords(c.epTitle || c.title, 62, st, 0.7));
          layer.appendChild(bars());
          const sub = document.createElement("div");
          sub.textContent = c.subtitle;
          sub.dir = "ltr";
          sub.setAttribute("data-x", String(xs++));
          sub.style.cssText = "max-width:88%;line-height:1.35;font-size:" + (S > 1 ? 24 : 28) + "px;color:#475569;position:relative;text-wrap:balance;" + an("__tutTrack", 0.9, 1.6);
          layer.appendChild(sub);
        } else {
          layer.appendChild(pill("في هذه الحلقة", 0.3));
          const pts = (c.points || []).slice(0, 3);
          const gap = Math.max(0.7, Math.min(1.6, (d - 1.6) / (pts.length + 1)));
          const box = document.createElement("div");
          box.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:" + 16 * SC + "px;max-width:84%;";
          pts.forEach((t, k) => {
            const chip = document.createElement("div");
            chip.setAttribute("data-x", String(xs++));
            chip.style.cssText = "display:flex;align-items:center;gap:14px;font-size:" + 31 * SC + "px;line-height:1.35;color:" + NAVY + ";background:rgba(255,255,255,.9);border:1.5px solid #d6e2f5;border-radius:" + 30 * SC + "px;padding:9px 26px 9px 20px;" + an("__tutFadeUp", 0.7, 0.9 + k * gap);
            const tick = document.createElement("span");
            tick.textContent = "✓";
            tick.style.cssText = "flex:none;display:grid;place-items:center;width:" + 34 * SC + "px;height:" + 34 * SC + "px;border-radius:50%;background:" + GREEN + ";color:#fff;font-size:" + 20 * SC + "px;font-weight:700;animation:__tutTick .5s " + SMOOTH + " " + (1.2 + k * gap + st - e).toFixed(2) + "s both,__tutGlow 3.6s ease-in-out " + (2.6 + k * gap + st - e).toFixed(2) + "s infinite;";
            const tx = document.createElement("span");
            tx.textContent = t;
            tx.style.cssText = "text-wrap:balance;";
            chip.append(tick, tx);
            box.appendChild(chip);
          });
          layer.appendChild(box);
        }
        el.appendChild(layer);
      });
      style.textContent = css;
      el.appendChild(style);
      if (c.durMs) {
        const ln = document.createElement("div");
        ln.style.cssText = "position:absolute;left:0;right:0;bottom:18px;height:4px;background:linear-gradient(270deg," + NAVY + "," + BLUE + "," + GREEN + ");transform-origin:right center;animation:__tutLine " + (c.durMs / 1000).toFixed(2) + "s linear " + (-e).toFixed(2) + "s both;";
        el.appendChild(ln);
      }
      const foot0 = document.createElement("div");
      foot0.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:18px;display:flex;" + anim("__tutFoot", 0.7, 0.1, EASE);
      for (const col of [NAVY, BLUE, GREEN]) { const b = document.createElement("span"); b.style.cssText = "flex:1;background:" + col; foot0.appendChild(b); }
      el.appendChild(foot0);
      document.documentElement.appendChild(el);
      return;
    }
    const kids = [];
    let xi = 0;
    if (c.logo) {
      const img = document.createElement("img");
      img.src = c.logo;
      img.style.cssText = "width:380px;height:auto;margin-bottom:14px;display:block;" + anim("__tutLogoIn", 1.0, 0.15, EASE);
      const wrap = document.createElement("div");
      wrap.style.cssText = "position:relative;animation:__tutBreathe 4s ease-in-out " + (1.2 - e).toFixed(2) + "s infinite;";
      wrap.setAttribute("data-x", String(xi++));
      wrap.appendChild(img);
      kids.push(wrap);
    }
    const label = document.createElement("div");
    label.textContent = c.label;
    label.setAttribute("data-x", String(xi++));
    label.style.cssText = "font-size:" + 22 * SC + "px;font-weight:700;color:#fff;background:" + NAVY + ";border-radius:999px;padding:6px 22px;position:relative;" + anim("__tutPillIn", 0.7, 0.6);
    // العنوان: كل كلمة تنزلق من خلف قناع بتتابع هادئ
    const title = document.createElement("div");
    title.setAttribute("data-x", String(xi++));
    title.style.cssText = "font-size:62px;font-weight:800;line-height:1.4;padding:0 60px;max-width:92%;position:relative;text-wrap:balance;";
    c.title.split(" ").forEach((w, i) => {
      const mask = document.createElement("span");
      mask.style.cssText = "display:inline-block;overflow:hidden;vertical-align:top;margin:0 .14em;padding:.14em .04em;margin-top:-.14em;margin-bottom:-.14em";
      const s = document.createElement("span");
      s.textContent = w;
      s.style.cssText = "display:inline-block;" + anim("__tutWordUp", 0.85, 0.85 + i * 0.075);
      mask.appendChild(s);
      title.appendChild(mask);
    });
    const bars = document.createElement("div");
    bars.setAttribute("data-x", String(xi++));
    bars.style.cssText = "display:flex;gap:8px;position:relative";
    [NAVY, BLUE, GREEN].forEach((col, i) => {
      const b = document.createElement("span");
      b.style.cssText = "display:block;width:56px;height:8px;border-radius:4px;background:" + col + ";transform-origin:center;" + anim("__tutGrow", 0.6, 1.5 + i * 0.1);
      bars.appendChild(b);
    });
    const sub = document.createElement("div");
    sub.textContent = c.subtitle;
    sub.dir = "ltr";
    sub.setAttribute("data-x", String(xi++));
    sub.style.cssText = "max-width:88%;line-height:1.35;font-size:" + (S > 1 ? 24 : 28) + "px;color:#475569;position:relative;text-wrap:balance;" + anim("__tutTrack", 0.9, 1.85);
    kids.push(label, title, bars, sub);
    if (c.note) {
      const note = document.createElement("div");
      note.textContent = c.note;
      note.setAttribute("data-x", String(xi++));
      note.style.cssText = "font-size:24px;color:" + NAVY + ";background:#fff;border:2px solid " + BLUE + ";border-radius:999px;padding:6px 22px;position:relative;" + anim("__tutFadeUp", 0.8, 2.3);
      kids.push(note);
    }
    // خريطة السلسلة في أعلى البطاقة: نقطة لكل حلقة، السابقة كحلية والحالية خضراء نابضة والقادمة باهتة
    if (c.ep && c.ep.total > 1 && c.ep.total <= 40) {
      const row = document.createElement("div");
      row.style.cssText = "position:absolute;top:26px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:7px;";
      row.setAttribute("data-x", String(xi++));
      for (let i = 1; i <= c.ep.total; i++) {
        const d = document.createElement("span");
        const now = i === c.ep.n, done = i < c.ep.n;
        d.style.cssText = "display:block;border-radius:50%;width:" + (now ? 14 : 9) + "px;height:" + (now ? 14 : 9) + "px;background:" + (now ? GREEN : done ? NAVY : "#cdd7ea") + ";" +
          anim("__tutDot", 0.45, 0.5 + i * 0.03) + (now ? "animation:__tutDot .45s " + SMOOTH + " " + (0.5 + i * 0.03 - e).toFixed(2) + "s both,__tutDotNow 1.6s ease-in-out " + (1.6 - e).toFixed(2) + "s infinite;" : "");
        row.appendChild(d);
      }
      const cnt = document.createElement("span");
      cnt.textContent = c.ep.n + " / " + c.ep.total;
      cnt.dir = "ltr";
      cnt.style.cssText = "font-size:16px;font-weight:700;color:" + NAVY + ";margin-inline-start:10px;" + anim("__tutFadeUp", 0.6, 0.9);
      row.appendChild(cnt);
      el.appendChild(row);
    }
    // أهداف التعلّم: تظهر واحدًا واحدًا بعلامة صح، فلا تبقى البطاقة ساكنة أثناء كلام المقدمة
    if (c.points && c.points.length) {
      const box = document.createElement("div");
      box.style.cssText = "position:absolute;left:12%;right:12%;bottom:46px;display:flex;flex-direction:column;align-items:center;gap:8px;";
      c.points.slice(0, 3).forEach((t, i) => {
        const chip = document.createElement("div");
        chip.setAttribute("data-x", String(xi++));
        chip.style.cssText = "display:flex;align-items:center;gap:12px;font-size:" + 23 * SC + "px;color:" + NAVY + ";background:rgba(255,255,255,.86);border:1.5px solid #d6e2f5;border-radius:999px;padding:5px 20px 5px 16px;" + anim("__tutFadeUp", 0.7, 2.1 + i * 0.6);
        const tick = document.createElement("span");
        tick.textContent = "✓";
        // وهج ينتقل بين الأهداف بالتتابع طوال المقدمة (كل هدف يلمع في دوره) فتبقى الحركة مستمرة
        tick.style.cssText = "display:grid;place-items:center;width:" + 26 * SC + "px;height:" + 26 * SC + "px;border-radius:50%;background:" + GREEN + ";color:#fff;font-size:" + 16 * SC + "px;font-weight:700;animation:__tutTick .5s " + SMOOTH + " " + (2.4 + i * 0.6 - e).toFixed(2) + "s both,__tutGlow 3.6s ease-in-out " + (3.3 + i * 1.2 - e).toFixed(2) + "s infinite;";
        const tx = document.createElement("span");
        tx.textContent = t;
        chip.append(tick, tx);
        box.appendChild(chip);
      });
      el.appendChild(box);
    }
    // خط تقدم رفيع يمتد بطول بقاء البطاقة (أعلى الشريط السفلي)
    if (c.durMs) {
      const ln = document.createElement("div");
      ln.style.cssText = "position:absolute;left:0;right:0;bottom:18px;height:4px;background:linear-gradient(270deg," + NAVY + "," + BLUE + "," + GREEN + ");transform-origin:right center;animation:__tutLine " + (c.durMs / 1000).toFixed(2) + "s linear " + (-e).toFixed(2) + "s both;";
      el.appendChild(ln);
    }
    // شريط الألوان السفلي كما في الشعار: يصعد من الحافة
    const foot = document.createElement("div");
    foot.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:18px;display:flex;" + anim("__tutFoot", 0.7, 0.1, EASE);
    for (const col of [NAVY, BLUE, GREEN]) { const b = document.createElement("span"); b.style.cssText = "flex:1;background:" + col; foot.appendChild(b); }
    el.append(...kids, foot);
    document.documentElement.appendChild(el);
  };
  window.__tutBoot = drawBoot;
  // خروج النص بالتتابع فقط (البطاقة تبقى): يُستعمل قبل نهاية الختام
  window.__tutBootExit = () => { exitText(); };
  // خروج كامل: النص يصعد ويتلاشى بالتتابع ثم تذوب البطاقة بتكبير خفيف
  window.__tutBootHide = () => {
    try { sessionStorage.setItem("__tut_boot_done", "1"); } catch (e) {}
    const el = document.getElementById("__tut_boot");
    if (!el) return;
    exitText();
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "scale(1.04)";
      el.style.filter = "blur(6px)";
    }, 300);
    setTimeout(() => el.remove(), 1000);
  };
  let bootDone = false;
  try { bootDone = sessionStorage.getItem("__tut_boot_done") === "1"; } catch (e) {}
  if (window.__TUT_BOOT && !bootDone) {
    // يُرسم بعد انتهاء كل سكربتات الحقن (فيكون __TUT_T0 معرَّفًا)
    const go = () => { if (document.documentElement) { drawBoot(window.__TUT_BOOT); return true; } return false; };
    if (!go()) new MutationObserver((_, o) => { if (go()) o.disconnect(); }).observe(document, { childList: true });
  }

  // ---------- المؤشر: عنصر دائم يتحرك بمنحنى ناعم ويبقى بين الخطوات ----------
  let curPos = null;
  try { curPos = JSON.parse(sessionStorage.getItem("__tut_cur") || "null"); } catch (e) {}
  const ensureCursor = () => {
    let c = document.getElementById("__tut_cursor");
    if (c) return c;
    if (!document.documentElement) return null;
    c = document.createElement("div");
    c.id = "__tut_cursor";
    c.setAttribute("popover", "manual");
    const p = curPos || { x: 640, y: 360 };
    c.style.cssText = "position:fixed;inset:auto;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;width:" + 26 * S + "px;height:" + 26 * S + "px;left:" + p.x + "px;top:" + p.y + "px;opacity:0;transition:opacity .25s;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))";
    c.innerHTML = '<svg viewBox="0 0 24 24" width="' + 26 * S + '" height="' + 26 * S + '" style="display:block;transform-origin:3px 2px;transition:transform .12s"><path d="M3 2l7 19 3-8 8-3z" fill="#fff" stroke="' + NAVY + '" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    try { c.showPopover(); } catch (e) {}
    return c;
  };
  // يتحرك إلى (x,y) بمنحنى: المحوران بمنحنيي تسارع مختلفين، والمدة تتناسب مع المسافة. يرجع المدة بالمللي ثانية
  window.__tutCursor = (x, y) => {
    const c = ensureCursor();
    if (!c) return 0;
    const from = curPos || { x, y };
    const dist = Math.hypot(x - from.x, y - from.y);
    const ms = curPos ? Math.round(Math.min(950, Math.max(420, 360 + dist * 0.6))) : 0;
    c.style.transition = "left " + ms + "ms cubic-bezier(.25,.9,.3,1)," + "top " + ms + "ms cubic-bezier(.55,.1,.25,1),opacity .25s";
    c.style.opacity = "1";
    requestAnimationFrame(() => { c.style.left = x + "px"; c.style.top = y + "px"; });
    curPos = { x: x, y: y };
    try { sessionStorage.setItem("__tut_cur", JSON.stringify(curPos)); } catch (e) {}
    return ms;
  };
  // ضغطة: المؤشر ينغمس لحظة وتخرج موجة من نقطة النقر
  window.__tutClick = () => {
    const c = ensureCursor();
    if (!c || !curPos) return;
    try {
      const st = JSON.parse(sessionStorage.getItem(KEY) || "{}");
      if (st.box) { delete st.box; sessionStorage.setItem(KEY, JSON.stringify(st)); }
    } catch (e) {}
    const rg = document.querySelector("#__tut_root [data-ring]");
    if (rg) { rg.style.animation = "none"; rg.style.transition = "opacity .22s ease"; rg.style.opacity = "0"; setTimeout(() => rg.remove(), 260); }
    const svg = c.firstChild;
    if (svg) { svg.style.transform = "scale(.82)"; setTimeout(() => { svg.style.transform = "none"; }, 140); }
    const rip = document.createElement("div");
    rip.setAttribute("popover", "manual");
    rip.style.cssText = "position:fixed;inset:auto;margin:0;padding:0;background:rgba(16,185,129,.18);overflow:visible;pointer-events:none;left:" + curPos.x + "px;top:" + curPos.y + "px;width:60px;height:60px;border-radius:50%;border:3px solid " + GREEN + ";animation:__tutRipple .6s ease-out both";
    document.documentElement.appendChild(rip);
    try { rip.showPopover(); } catch (e) {}
    setTimeout(() => rip.remove(), 700);
  };
  window.__tutCursorHide = () => { const c = document.getElementById("__tut_cursor"); if (c) c.style.opacity = "0"; };

  // ---------- الشريط والإطار ----------
  let lastK = null;
  try { const v = sessionStorage.getItem("__tut_lastk"); lastK = v === null ? null : Number(v); } catch (e) {}
  let lastBoxK = null;
  try { const v = sessionStorage.getItem("__tut_lastbk"); lastBoxK = v === null ? null : Number(v); } catch (e) {}

  const render = () => {
    let state = {};
    try { state = JSON.parse(sessionStorage.getItem(KEY) || "{}"); } catch (e) {}
    const old = document.getElementById("__tut_root");
    // لا شيء لعرضه: نُخرج الشريط القديم بحركة هادئة بدل حذفه فجأة
    if (!state.text && !state.box) {
      if (old && !old.__leaving) {
        old.__leaving = true;
        old.removeAttribute("id");
        const bar = old.querySelector("[data-bar]");
        if (bar) bar.style.animation = "__tutBarOut .22s ease-in both";
        setTimeout(() => old.remove(), 240);
      } else if (old) old.remove();
      return;
    }
    if (old) old.remove();
    // الحركة الأولى فقط عند ظهور خطوة جديدة؛ إعادة الرسم داخل الخطوة نفسها ثابتة بلا وميض
    const fresh = state.k !== undefined && state.k !== lastK;
    lastK = state.k;
    try { sessionStorage.setItem("__tut_lastk", String(lastK)); } catch (e) {}
    const root = document.createElement("div");
    root.id = "__tut_root";
    root.setAttribute("popover", "manual");
    root.style.cssText = "position:fixed;inset:0;margin:0;padding:0;border:0;width:100%;height:100%;max-width:none;max-height:none;overflow:visible;background:transparent;color:#fff;pointer-events:none;font-family:" + FONT;
    if (state.box) {
      let b = state.box;
      const z = state.zoom;
      if (z) b = { x: z.ox + (b.x - z.ox) * z.s, y: z.oy + (b.y - z.oy) * z.s, width: b.width * z.s, height: b.height * z.s };
      // الإطار والمؤشر يظهران بعد الشريط بلحظة، فلهما مفتاح حركة مستقل
      const freshBox = state.k !== undefined && state.k !== lastBoxK;
      lastBoxK = state.k;
      try { sessionStorage.setItem("__tut_lastbk", String(lastBoxK)); } catch (e) {}
      // هامش الإطار يتناسب مع حجم العنصر: العنصر الصغير يحتاج إطارًا أقرب فيبدو التركيز دقيقًا
      const pad = Math.max(3, Math.min(8, Math.round(Math.min(b.width, b.height) * 0.16)));
      const rad = Math.max(6, Math.min(18, (state.radius || 6) * (z ? z.s : 1) + pad));
      const ring = document.createElement("div");
      ring.style.cssText = "position:absolute;left:" + (b.x - pad) + "px;top:" + (b.y - pad) + "px;width:" + (b.width + pad * 2) + "px;height:" + (b.height + pad * 2) + "px;border:3px solid " + GREEN + ";border-radius:" + rad + "px;box-shadow:0 0 0 2px #fff,0 0 0 9999px rgba(15,23,42,.2);" +
        (freshBox ? "animation:__tutRingIn .35s " + EASE + " both,__tutPulse 1.6s ease-in-out .4s infinite;" : "animation:__tutPulse 1.6s ease-in-out infinite;");
      ring.setAttribute("data-ring", "1");
      root.appendChild(ring);
    }
    if (state.text) {
      const bar = document.createElement("div");
      bar.dir = "rtl";
      bar.setAttribute("data-bar", "1");
      bar.style.cssText = "position:absolute;left:5%;right:5%;bottom:" + BOT + "px;display:flex;align-items:center;gap:" + 16 * S + "px;padding:" + 14 * S + "px " + 22 * S + "px;background:rgba(30,58,138,.96);color:#fff;border-radius:14px;border-bottom:5px solid transparent;font-size:" + 26 * S + "px;line-height:1.5;box-shadow:0 6px 24px rgba(0,0,0,.25);overflow:hidden;" +
        (fresh ? "animation:__tutBarIn .38s " + EASE + " both;" : "");
      // شريط تقدم أخضر يمتد بطول مقطع الصوت: يتزامن مع الكلام ويُكمل من الزمن المنقضي عند إعادة الرسم
      if (state.dur) {
        const el = Math.max(0, (Date.now() - (state.t0 || Date.now())) / 1000);
        const sweep = document.createElement("span");
        sweep.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:5px;background:" + GREEN + ";transform-origin:right center;animation:__tutSweep " + (state.dur / 1000).toFixed(2) + "s linear " + (-el).toFixed(2) + "s both";
        bar.appendChild(sweep);
      } else {
        bar.style.borderBottomColor = GREEN;
      }
      if (state.n) {
        const badge = document.createElement("span");
        badge.textContent = state.n + "/" + state.total;
        badge.style.cssText = "background:" + GREEN + ";color:#fff;font-weight:700;border-radius:999px;padding:4px 14px;font-size:" + 22 * S + "px;white-space:nowrap;" + (fresh ? "animation:__tutPop .45s " + EASE + " .15s both;" : "");
        bar.appendChild(badge);
      }
      const txt = document.createElement("span");
      txt.textContent = state.text;
      txt.style.cssText = "text-wrap:balance;" + (fresh ? "animation:__tutFadeUp .5s " + SMOOTH + " .1s both" : "");
      bar.appendChild(txt);
      if (window.__TUT_LOGO) {
        const chip = document.createElement("span");
        chip.style.cssText = "margin-inline-start:auto;background:#fff;border-radius:10px;padding:6px 12px;display:flex;align-items:center";
        const img = document.createElement("img");
        img.src = window.__TUT_LOGO;
        img.style.cssText = "height:" + 30 * S + "px;width:auto;display:block";
        chip.appendChild(img);
        bar.appendChild(chip);
      }
      root.appendChild(bar);
    }
    // خط تقدم الحلقة العلوي
    if (state.n && state.total) {
      const prog = document.createElement("div");
      prog.style.cssText = "position:absolute;left:0;right:0;top:0;height:4px;background:rgba(30,58,138,.15)";
      const fill = document.createElement("div");
      fill.style.cssText = "position:absolute;right:0;top:0;bottom:0;width:" + (state.n / state.total * 100).toFixed(1) + "%;background:linear-gradient(270deg," + NAVY + "," + BLUE + "," + GREEN + ")";
      prog.appendChild(fill);
      root.appendChild(prog);
    }
    document.documentElement.appendChild(root);
    try { root.showPopover(); } catch (e) {}
    // المؤشر دائمًا فوق الإطار والشريط
    const cur = document.getElementById("__tut_cursor");
    if (cur) { try { cur.hidePopover(); cur.showPopover(); } catch (e) {} }
  };
  window.__tutSet = (s) => {
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    render();
  };
  document.addEventListener("DOMContentLoaded", () => { render(); if (curPos) ensureCursor(); const c = document.getElementById("__tut_cursor"); if (c && curPos) c.style.opacity = "1"; });

  // ---------- التكبير/التصغير ----------
  window.__tutZoom = (ox, oy, s, ms) => {
    const h = document.documentElement;
    if (s !== 1) h.style.overflow = "hidden";
    h.style.transition = "transform " + ms + "ms cubic-bezier(.45,.05,.2,1)";
    h.style.transformOrigin = ox + "px " + oy + "px";
    h.style.transform = "scale(" + s + ")";
    // بعد انتهاء التصغير نطلب من الصفحة إعادة حساب مواضع القوائم المنبثقة (فُتحت أثناء التكبير).
    // لا نفعل ذلك أثناء التكبير: القياسات حينها مُكبّرة فتُزاح القوائم
    setTimeout(() => {
      if (s !== 1) return;
      h.style.transform = ""; h.style.transition = ""; h.style.overflow = "";
      window.dispatchEvent(new Event("resize"));
    }, ms + 50);
  };
})();
`;
