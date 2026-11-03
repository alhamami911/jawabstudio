import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, renameSync, existsSync, cpSync } from "node:fs";
import { join } from "node:path";
import type { Scenario, RecordedEvent, VerifyResult } from "./types.js";
import { overlayInitScript, bootScript, type TitleCard } from "./overlay.js";
import { synthesizeAll, speechText, resolveTts } from "./tts.js";

const scenarioPath = process.argv[2];
// --vertical: نسخة عمودية أصلية للشورتس/تيك توك/ريلز (شاشة واحدة متصلة، لا قصّ للأفقية): نفس الخطوات في نافذة 900x1600
const vertical = process.argv.includes("--vertical");
if (!scenarioPath) {
  console.error("usage: npm run record -- scenarios/<file>.json");
  process.exit(1);
}

try { process.loadEnvFile(); } catch {} // .env اختياري

// يستبدل ${VAR} في قيم الكتابة بقيمة متغير البيئة، فلا تُخزَّن كلمات المرور في السيناريو
// ${NAME} يُحلّ أولًا من scenario.vars (قيم تُحسب قبل التسجيل)، ثم من متغيرات البيئة
const vars: Record<string, string> = {};
const fromEnv = (v: string) =>
  v.replace(/\$\{(\w+)\}/g, (_, k) => {
    const val = vars[k] ?? process.env[k];
    if (!val) { console.error(`missing variable ${k} (scenario.vars or .env)`); process.exit(1); }
    return val;
  });

const scenario: Scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
// بداية التشغيل بتوقيت UTC بصيغة Odoo (مع هامش دقيقة): يجعل فحوص "السجل أُنشئ" لا تتأثر بسجلات قديمة مشابهة
vars.RUN_START = new Date(Date.now() - 60000).toISOString().slice(0, 19).replace("T", " ");
const baseUrl = scenario.baseUrl ?? process.env.JAWAB_BASE_URL ?? "";
const abs = (u: string) => new URL(u, baseUrl || undefined).toString();
const outDir = join("output", vertical ? `${scenario.id}-vertical` : scenario.id);
mkdirSync(outDir, { recursive: true });
// الصوت نفسه: نسخ ذاكرة الصوت من التسجيل الأفقي فلا تُعاد معالجة الجمل ولا يُصرف رصيد الصوت
if (vertical && existsSync(join("output", scenario.id, "audio"))) cpSync(join("output", scenario.id, "audio"), join(outDir, "audio"), { recursive: true });

const size = vertical ? { width: 900, height: 1600 } : { width: 1280, height: 720 };
// ملاحظة: جُرّب رفع الدقة إلى 1080p عبر deviceScaleFactor مع recordVideo.size أكبر، فخرج المحتوى في ركن الإطار وبقية الصورة رمادية.
// لذلك يبقى التسجيل 720p الأصلي. الفحص الآلي "frame-filled" يمنع تكرار هذا العطل.
const ZOOM_MS = 620;
const GAP_MS = 320; // فاصل قصير بعد انتهاء الجملة قبل الخطوة التالية

// التعليق الصوتي: يُولَّد قبل التسجيل ليُعرف طول كل جملة، فيبقى الشرح على الشاشة بقدر ما تُقال
const voiceOn = !process.argv.includes("--no-voice");
const spoken = (s: { narration?: string; speech?: string }) =>
  s.narration ? (s.speech ?? speechText(s.narration)) : undefined;
const clips = voiceOn
  ? await synthesizeAll(
      [scenario.intro, ...scenario.steps.map(spoken), scenario.outro].filter((t): t is string => !!t),
      outDir,
      resolveTts(),
    )
  : new Map();
const introClip = scenario.intro ? clips.get(scenario.intro) : undefined;
const TITLE_MS = Math.max(4200, introClip ? introClip.ms + 800 : 0);
const outroClip = scenario.outro ? clips.get(scenario.outro) : undefined;
const OUTRO_MS = Math.max(3300, outroClip ? outroClip.ms + 1100 : 0);

// شعار Jawab (مقصوص، خلفية شفافة) يُضمَّن في الصفحة كـ data URI
const logoFile = "assets/logo/logo.trim.png";
const logo = existsSync(logoFile) ? `data:image/png;base64,${readFileSync(logoFile).toString("base64")}` : undefined;
const label = "JAWAB ERP · شرح تعليمي";
// شرائح المقدمة: كل جملة منطوقة لها شريحة (ترحيب بالسلسلة، عنوان الحلقة، أهدافها). زمن كل جملة يُقدَّر بنسبة عدد حروفها من مدة الصوت،
// والصوت يبدأ بعد 400ms من رسم البطاقة. الشريحة تبدأ قبل جملتها بقليل وتتداخل مع التي بعدها فيكون الانتقال ناعمًا
const introSentences = (scenario.intro ?? "").split(/[.]\s+/).map((s) => s.trim()).filter(Boolean);
const plainAr = (s: string) => s.replace(/[ً-ْ]/g, ""); // الجمل المنطوقة قد تكون مشكَّلة: المطابقة والأطوال بلا تشكيل
const hasWelcome = /أهلًا بكم/.test(plainAr(introSentences[0] ?? ""));
const scenes = (() => {
  if (!introSentences.length || !introClip) return undefined;
  const kinds = (hasWelcome ? ["series", "episode", "points"] : ["episode", "points"]).slice(0, introSentences.length) as ("series" | "episode" | "points")[];
  const total = introSentences.reduce((a, s) => a + plainAr(s).length, 0);
  const sentStart: number[] = []; // زمن بدء كل جملة (ms من رسم البطاقة)
  let acc = 0;
  introSentences.forEach((s, i) => { sentStart[i] = 400 + (acc / total) * introClip.ms; acc += plainAr(s).length; });
  return kinds.map((kind, k) => ({
    kind,
    startMs: k === 0 ? 0 : Math.max(0, Math.round(sentStart[k] - 250)),
    endMs: k === kinds.length - 1 ? TITLE_MS : Math.round(sentStart[k + 1] + 350),
  }));
})();
const card: TitleCard = { title: scenario.title.ar, subtitle: scenario.title.en, label, logo, points: scenario.card?.points, durMs: TITLE_MS, series: scenario.card?.series, epLabel: scenario.card?.epLabel, epTitle: scenario.card?.epTitle, scenes };
const outroCard: TitleCard = { title: "شكرًا لمتابعتكم", subtitle: scenario.title.en, label, logo, note: scenario.nextTitle ? `الحلقة التالية · ${scenario.nextTitle}` : undefined };
const browser = await chromium.launch();

// 1) تسجيل الدخول في الخلفية (بلا فيديو) ثم حفظ الجلسة
let storageState: Awaited<ReturnType<import("playwright").BrowserContext["storageState"]>> | undefined;
if (scenario.login) {
  const l = scenario.login;
  const lc = await browser.newContext({ viewport: size });
  const lp = await lc.newPage();
  await lp.goto(abs(l.url));
  await lp.fill(l.user.selector, fromEnv(l.user.value));
  await lp.fill(l.password.selector, fromEnv(l.password.value));
  await lp.click(l.submit);
  await lp.waitForSelector(l.ready);

  // قيم فريدة في كل تسجيل: أول رقم شاغر في النظام يبدأ من start (يُسأل النظام عبر JSON-RPC بجلسة الدخول نفسها)
  for (const [name, v] of Object.entries(scenario.vars ?? {})) {
    for (let n = v.start, tries = 0; ; n++, tries++) {
      if (tries > 500) { console.error(`no free ${v.model}.${v.field} found from ${v.start}`); process.exit(1); }
      const res = await lc.request.post(abs(`/web/dataset/call_kw/${v.model}/search_count`), {
        data: {
          jsonrpc: "2.0",
          method: "call",
          params: { model: v.model, method: "search_count", args: [[[v.field, "=", (v.prefix ?? "") + String(n)]]], kwargs: { context: { active_test: false } } },
        },
      });
      const body = await res.json();
      if (body.error) { console.error(`cannot check ${v.model}.${v.field}: ${body.error.data?.message ?? body.error.message}`); process.exit(1); }
      if (body.result === 0) { vars[name] = String(n); break; }
    }
    console.log(`✓ ${name} = ${vars[name]}`);
  }
  storageState = await lc.storageState();
  await lc.close();
  console.log("✓ logged in (not recorded)");
}

// 2) التسجيل
const context = await browser.newContext({
  viewport: size,
  recordVideo: { dir: outDir, size },
  storageState,
});
await context.addInitScript({ content: bootScript(card, vertical ? 1.45 : 1, vertical ? 170 : 28) + overlayInitScript });
const page = await context.newPage();
const t0 = Date.now();
const events: RecordedEvent[] = [];
// مربع الشرح: نص التعليق كاملًا، أو (keyCaptions) المزايا الرئيسية فقط عبر caption؛ الصوت لا يتأثر
const capOf = (s: { narration?: string; caption?: string }) => (scenario.keyCaptions ? s.caption : s.narration);
const total = scenario.steps.filter((s) => capOf(s)).length;
let shown = 0;

// ثواني القراءة تتناسب مع طول النص (حد أدنى 1.5 ثانية)
const readTime = (text?: string) => (text ? Math.max(1500, text.length * 70) : 0);
const setOverlay = (s: object) => page.evaluate((v) => (window as any).__tutSet?.(v), s).catch(() => {});
const zoom = async (ox: number, oy: number, s: number) => {
  await page.evaluate(([a, b, c, d]) => (window as any).__tutZoom?.(a, b, c, d), [ox, oy, s, ZOOM_MS] as const).catch(() => {});
  await page.waitForTimeout(ZOOM_MS + 100);
};

// بطاقة العنوان تظهر فورًا على صفحة فارغة، ثم تُحمَّل الصفحة الأولى خلفها
await page.setContent('<body style="margin:0"></body>');
await page.evaluate(overlayInitScript);
await page.evaluate((c) => (window as any).__tutBoot(c, true), card);
const tCard = Date.now();
// زمن بدء حركة المقدمة: تكملها بطاقة الصفحة التالية من حيث وصلت بدل أن تعيدها من البداية
// (ملف تعريف ارتباط يُقرأ بشكل متزامن عند رسم البطاقة في الصفحة الجديدة، فلا يتوقف على ترتيب سكربتات الحقن)
await context.addCookies([{ name: "__tut_t0", value: String(tCard), url: abs(scenario.start?.url ?? "/") }]);
const intro = introClip && { file: introClip.file, startMs: tCard - t0 + 400 };
// حركة المقدمة تكتمل أولًا؛ تحميل Jawab يشغل المتصفح ويجمّد الرسم، فلا نترك فيها حركة جارية أثناءه
// تحميل مسبق للتطبيق في صفحة جانبية (عملية متصفح مستقلة): تُدفأ ذاكرة التخزين فيصير تحميل الصفحة الرئيسية بعد قليل أسرع
// وأخف على بطاقة المقدمة. فيديو الصفحة الجانبية يُهمل ويُحذف.
const warm = scenario.start ? await context.newPage() : undefined;
warm?.goto(abs(scenario.start!.url)).catch(() => {});
// حركة المقدمة تكتمل أولًا؛ التحميل يشغل المتصفح ويجمّد الرسم، فلا نترك فيها حركة جارية أثناءه
await page.waitForTimeout(3800);
if (scenario.start) {
  await page.goto(abs(scenario.start.url));
  if (scenario.start.ready) await page.waitForSelector(scenario.start.ready);
}
if (warm) { const wv = warm.video(); await warm.close().catch(() => {}); await wv?.delete().catch(() => {}); }
for (const sel of scenario.hide ?? []) await page.addStyleTag({ content: `${sel}{display:none !important}` });
// الصفحات التي تُعاد تحميلها أثناء الحلقة (مثل تبديل اللغة) تفقد الأنماط المضافة، فنحقنها في كل تحميل جديد أيضًا
if (scenario.hide?.length) {
  const css = scenario.hide.map((sel) => `${sel}{display:none !important}`).join("");
  // نص برمجي لا دالة: tsx يضيف دوالًا مساعدة داخل الدوال المحقونة فتفشل في الصفحة
  await context.addInitScript(`(() => { const css = ${JSON.stringify(css)}; const add = () => { const st = document.createElement("style"); st.textContent = css; (document.head || document.documentElement).appendChild(st); }; if (document.head) add(); else document.addEventListener("DOMContentLoaded", add); })();`);
}
await page.waitForTimeout(Math.max(0, TITLE_MS - (Date.now() - tCard)));
await page.evaluate(() => (window as any).__tutBootHide?.());
await page.waitForTimeout(820); // خروج نص المقدمة بالتتابع ثم ذوبان البطاقة

// تكبير ذكي: يتناسب مع حجم العنصر (الصغير يُكبَّر أكثر، والكبير يُترك)، ولا يُكبَّر عنصر داخل قائمة منسدلة
const pickZoom = (step: { selector?: string; zoom?: number | false }, box?: { width: number; height: number }) => {
  if (!box || step.zoom === false) return 1;
  if (typeof step.zoom === "number") return step.zoom;
  if (/dropdown|autocomplete|modal|popover/i.test(step.selector ?? "")) return 1;
  if (box.width > 560 || box.height > 260) return 1;
  if (box.width > 300) return 1.25;
  if (box.width > 140) return 1.45;
  return 1.7;
};

for (const [i, step] of scenario.steps.entries()) {
  const tMs = Date.now() - t0;
  let box: RecordedEvent["box"];
  let radius = 6;
  const n = capOf(step) ? ++shown : 0;
  const interactive = step.action === "click" || step.action === "fill" || step.action === "select" || step.action === "point";

  // 1) حدّد العنصر (والشاشة بحجمها الطبيعي)
  if (interactive) {
    const el = page.locator(step.selector);
    await el.scrollIntoViewIfNeeded();
    box = (await el.boundingBox()) ?? undefined;
    radius = await el.evaluate((e) => parseFloat(getComputedStyle(e).borderRadius) || 6).catch(() => 6);
  }
  const zoomScale = interactive ? pickZoom(step, box) : 1;
  const center = box && { ox: box.x + box.width / 2, oy: box.y + box.height / 2 };
  const z = center && zoomScale !== 1 ? { ...center, s: zoomScale } : undefined;
  const tCap = Date.now();
  const text = spoken(step);
  const clip = text ? clips.get(text) : undefined;
  const audio = clip && { file: clip.file, startMs: tCap - t0 };
  // k: رقم الخطوة (الحركة تُشغَّل مرة لكل خطوة)، dur/t0: طول مقطع الصوت ووقت بدئه ليتزامن شريط التقدم مع الكلام
  const cap = { text: capOf(step), n, total, k: i, dur: clip?.ms, t0: tCap };

  // 2) الشرح والصوت يبدآن فورًا؛ المؤشر يتجه إلى العنصر والتكبير يجري معه في الوقت نفسه
  //    (مركز العنصر لا يتحرك أثناء التكبير لأن أصل التحويل هو المركز نفسه، فالمؤشر يعرف وجهته مسبقًا)
  if (step.narration) await setOverlay(cap);
  const moving = box && center
    ? page.evaluate(([x, y]) => (window as any).__tutCursor?.(x, y), [center.ox, center.oy] as const).then((ms) => page.waitForTimeout(Math.min(1000, Number(ms) || 0))).catch(() => {})
    : Promise.resolve();
  await Promise.all([moving, z ? zoom(z.ox, z.oy, z.s) : Promise.resolve()]);
  if (box && step.narration) await setOverlay({ ...cap, box, zoom: z, radius });
  if (box) await page.waitForTimeout(260); // لحظة تُرى فيها العين العنصر المحدد قبل التفاعل

  // 3) نفّذ الخطوة أثناء الكلام: ضغطة المؤشر ثم الفعل
  if (box && step.action !== "point") await page.evaluate(() => (window as any).__tutClick?.()).catch(() => {});
  switch (step.action) {
    case "goto":
      await page.goto(abs(step.url));
      if (step.narration) await setOverlay(cap);
      break;
    case "click":
      await page.locator(step.selector).click();
      break;
    case "fill":
      if (step.clear) await page.locator(step.selector).fill("");
      await page.locator(step.selector).pressSequentially(fromEnv(step.value), { delay: 45 });
      if (step.submit) await page.keyboard.press("Enter");
      break;
    case "select":
      {
        // الخيار يُعرَّف بنصه الإنجليزي؛ إن كانت الواجهة عربية نبحث عن ترجمته من جدول ترجمات النظام
        const sel = page.locator(step.selector);
        const opts = (await sel.locator("option").allTextContents()).map((o) => o.trim());
        const tr: Record<string, string[]> = existsSync("catalog/selections-ar.json") ? JSON.parse(readFileSync("catalog/selections-ar.json", "utf8")) : {};
        const label = [step.label, ...(tr[step.label] ?? [])].find((l) => opts.includes(l)) ?? step.label;
        await sel.selectOption({ label });
      }
      break;
    case "hide":
      await page.addStyleTag({ content: `${step.selector}{display:none !important}` });
      break;
    case "point":
      break; // إشارة وتحديد فقط؛ المدة من طول الصوت
    case "wait":
      break; // المدة تُحسب أدناه من بداية الخطوة، فتتداخل مع الكلام بدل أن تُضاف إليه
    case "press":
      await page.keyboard.press(step.key);
      break;
  }

  // 4) أبقِ النتيجة ظاهرة لحظة، ثم صغّر وأزل الإطار والشرح ما زال يُقال
  if (z) {
    await page.waitForTimeout(420);
    await setOverlay(cap);
    await zoom(z.ox, z.oy, 1);
  } else if (box) {
    await page.waitForTimeout(300);
    await setOverlay(cap);
  }

  // 5) أكمل بقية الجملة (أو مدة الانتظار المطلوبة) من بداية الخطوة، ثم فاصل قصير
  const need = Math.max(clip ? clip.ms + GAP_MS : step.narration ? readTime(step.narration) : 0, step.action === "wait" ? step.ms : 0);
  const left = need - (Date.now() - tCap);
  if (left > 0) await page.waitForTimeout(left);
  await setOverlay({}); // الشريط يخرج بحركة قصيرة
  await page.waitForTimeout(140);
  events.push({ stepIndex: i, action: step.action, tMs, endMs: Date.now() - t0, box, narration: step.narration, audio });
  console.log(`✓ step ${i + 1}/${scenario.steps.length} ${step.action}`);
}

// فحوص النتيجة (للطابور): العنصر المتوقع ظاهر، والسجل أُنشئ فعلًا في النظام (JSON-RPC بجلسة التسجيل نفسها)
const verifyResults: VerifyResult[] = [];
for (const v of scenario.verify ?? []) {
  try {
    if (v.kind === "visible") {
      await page.locator(v.selector!).first().waitFor({ state: "visible", timeout: 10000 });
      verifyResults.push({ note: v.note, ok: true });
    } else {
      const domain = JSON.parse(fromEnv(JSON.stringify(v.domain ?? [])));
      // بعض السجلات تتأخر ثوانيَ حتى تظهر (إعادة تحميل السجل في الخادم)، فنعيد السؤال حتى 20 ثانية
      let ids: number[] = [];
      for (let k = 0; k < 14 && !ids.length; k++) {
        if (k) await page.waitForTimeout(1500);
        const res = await context.request.post(abs(`/web/dataset/call_kw/${v.model}/search_read`), {
          data: { jsonrpc: "2.0", method: "call", params: { model: v.model, method: "search_read", args: [domain], kwargs: { fields: ["id"], limit: 5, context: { active_test: false } } } },
        });
        const body = await res.json();
        if (body.error) throw new Error(body.error.data?.message ?? body.error.message);
        ids = (body.result as { id: number }[]).map((x) => x.id);
      }
      verifyResults.push({ note: v.note, ok: ids.length > 0, ids, model: v.model, detail: ids.length ? undefined : "no matching record" });
    }
  } catch (e) {
    verifyResults.push({ note: v.note, ok: false, detail: String((e as Error).message).slice(0, 200) });
  }
  const last = verifyResults[verifyResults.length - 1];
  console.log(`${last.ok ? "✓" : "✗"} verify: ${last.note}${last.detail ? " (" + last.detail + ")" : ""}`);
}

// بطاقة الختام (المؤشر يختفي قبلها)
await page.evaluate(() => (window as any).__tutCursorHide?.()).catch(() => {});
await page.evaluate((c) => (window as any).__tutBoot(c, true), outroCard);
const outro = outroClip && { file: outroClip.file, startMs: Date.now() - t0 + 400 };
await page.waitForTimeout(Math.max(0, OUTRO_MS - 750));
await page.evaluate(() => (window as any).__tutBootExit?.()).catch(() => {});
await page.waitForTimeout(750);

const video = page.video();
await context.close(); // يُنهي كتابة الفيديو
await browser.close();
if (video) renameSync(await video.path(), join(outDir, "raw.webm"));
writeFileSync(join(outDir, "events.json"), JSON.stringify({ size, intro, outro, events, verify: verifyResults }, null, 2));

// ملف الخطوات المكتوبة
const lines = events.filter((e) => e.narration).map((e, k) => `${k + 1}. ${e.narration}`);
writeFileSync(join(outDir, "steps.md"), `# ${scenario.title.ar}\n\n${lines.join("\n")}\n`);
console.log(`Done → ${outDir}/raw.webm + events.json + steps.md`);
if (verifyResults.some((v) => !v.ok)) {
  console.error("✗ verification failed: the intended outcome was not reached");
  process.exitCode = 3;
}
