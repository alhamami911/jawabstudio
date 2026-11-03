// تحميل السلاسل والحلقات من series/ وتحويل كل حلقة إلى سيناريو يفهمه المسجّل الحالي (src/record.ts) دون تعديل صيغته.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Scenario, Step, Verify } from "../types.js";

export interface Bilingual { ar: string; en: string }
export interface SeriesDef {
  id: string;
  title: Bilingual;
  description: string;
  module: string; // تطبيق Jawab الذي تغطيه السلسلة (من catalog/menus.json)
  audience: string;
  language: "ar" | "en";
  objectives: string[];
  glossary?: Record<string, string>; // مصطلح إنجليزي ← مقابله العربي الموحَّد في كل الحلقات
  titleSpeech?: string; // العنوان بالتشكيل لينطقه المقدّم صحيحًا (يُعرض العنوان بلا تشكيل)
  catalogCode?: string; // رمز القسم في docs/CATALOG.md (مثل S01): يربط الدليل في لوحة الإنتاج بهذه السلسلة وزر «ابدأ الإنتاج»
}

// خطوة مختصرة تُوسَّع إلى خطوات المسجّل. say: نص الشريط المكتوب (يُنطق بعد حذف الإنجليزية بين الأقواس إلا إذا وُجد speech)
type Say = { say?: string; speech?: string; caption?: string };
export type PlanStep =
  | ({ app: string } & Say) // فتح تطبيق من الشاشة الرئيسية
  | ({ nav: string[]; say?: string[]; speech?: string[]; caption?: string }) // [قائمة علوية, عنصر] أو [عنصر مباشر في الشريط]؛ speech: النطق المشكَّل لكل خطوة بالتوازي مع say
  | ({ new: true } & Say)
  | ({ field: string; value: string; kind?: "char" | "m2o" | "select"; label?: string } & Say)
  | ({ save: true } & Say)
  | ({ look: string; ms?: number; at?: string; zoom?: number | false } & Say) // وقفة شرح بلا تفاعل؛ look = وصف داخلي فقط. at = محدد عنصر يشير إليه المؤشر ويُحدَّد بإطار وتكبير أثناء الكلام
  | ({ search: string } & Say) // كتابة في خانة البحث ثم Enter
  | Step;

export interface EpisodeDef {
  number: number;
  slug: string;
  title: Bilingual;
  objectives: string[];
  prerequisites: string[];
  expected: string;
  estimatedMinutes: number;
  dependsOn?: number[];
  keyCaptions?: boolean; // مربع الشرح يعرض caption الخطوات فقط (انظر types.ts)
  allowEdit?: boolean; // يسمح بتعديل سجلات موجودة (الافتراضي: إنشاء فقط)
  allowPost?: boolean; // يسمح بالترحيل/التأكيد/التحقق (أفعال لا رجعة فيها): مسموح داخل الشركة التجريبية فقط
  vars?: Scenario["vars"];
  opening: string; // جملة تعريفية تُقال بعد الترحيب في المقدمة
  closing: string; // جملة ختام تُقال في الخاتمة
  // نسخ مشكَّلة للنطق (يُنطق المشكَّل ويُعرض/يُكتب غير المشكَّل): عنوان الحلقة، المقدمة، الخاتمة
  titleSpeech?: string;
  openingSpeech?: string;
  closingSpeech?: string;
  steps: PlanStep[];
  verify: Verify[];
}

export interface ProductionConfig {
  allowedHosts: string[];
  maxAttempts: { prepare: number; record: number; process: number; vrecord: number; vprocess: number; validate: number };
  retryDelaySec: number[];
  stageTimeoutMin: { record: number; process: number };
  dashboardPort: number;
  scenarioBase: Pick<Scenario, "login" | "start" | "hide">;
  brandLabel: string;
  validation: { blackSec: number; whiteSec: number; unexplainedFreezeSec: number; maxSilentGapSec: number; minMeanVolumeDb: number; syncToleranceMs: number };
}

export const loadConfig = (): ProductionConfig => JSON.parse(readFileSync(join("config", "production.json"), "utf8"));

const SERIES_DIR = "series";

export function listSeriesIds(): string[] {
  if (!existsSync(SERIES_DIR)) return [];
  return readdirSync(SERIES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(SERIES_DIR, d.name, "series.json")))
    .map((d) => d.name)
    .sort();
}

export const loadSeries = (id: string): SeriesDef => JSON.parse(readFileSync(join(SERIES_DIR, id, "series.json"), "utf8"));

export function loadEpisodes(seriesId: string): EpisodeDef[] {
  const dir = join(SERIES_DIR, seriesId);
  return readdirSync(dir)
    .filter((f) => /^\d+.*\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as EpisodeDef)
    .sort((a, b) => a.number - b.number);
}

export const loadEpisode = (seriesId: string, n: number): EpisodeDef => {
  const e = loadEpisodes(seriesId).find((x) => x.number === n);
  if (!e) throw new Error(`episode ${n} not found in series ${seriesId}`);
  return e;
};

export const jobId = (seriesId: string, n: number, version: number) => `${seriesId}-e${String(n).padStart(2, "0")}-v${version}`;

// ---------- الترقيم العربي: «الحلقة الحادية والعشرون» ----------
const UNITS = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة"];
const TEEN = ["العاشرة", "الحادية عشرة", "الثانية عشرة", "الثالثة عشرة", "الرابعة عشرة", "الخامسة عشرة", "السادسة عشرة", "السابعة عشرة", "الثامنة عشرة", "التاسعة عشرة"];
const TENS = ["", "", "العشرون", "الثلاثون", "الأربعون", "الخمسون", "الستون", "السبعون", "الثمانون", "التسعون"];
const TENS_AND = ["", "", "والعشرون", "والثلاثون", "والأربعون", "والخمسون", "والستون", "والسبعون", "والثمانون", "والتسعون"];
const UNITS_AND = ["", "الحادية", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة"];
// الترتيب مشكَّلًا (للنطق): الحلقةُ الأُولى، الثَّانيةُ ...
const ORD_V: Record<number, string> = {
  1: "الْأُولَى", 2: "الثَّانِيَةُ", 3: "الثَّالِثَةُ", 4: "الرَّابِعَةُ", 5: "الْخَامِسَةُ",
  6: "السَّادِسَةُ", 7: "السَّابِعَةُ", 8: "الثَّامِنَةُ", 9: "التَّاسِعَةُ", 10: "الْعَاشِرَةُ",
};
export function ordinalAr(n: number): string {
  if (n < 1 || n > 99) return String(n);
  if (n < 10) return UNITS[n];
  if (n < 20) return TEEN[n - 10];
  const t = Math.floor(n / 10), u = n % 10;
  return u === 0 ? TENS[t] : `${UNITS_AND[u]} ${TENS_AND[t]}`;
}

// ---------- توسيع الخطوات المختصرة ----------
const q = (s: string) => s.replace(/'/g, "\\'");
const FIELD = (name: string, inner: string) => `.o_content .o_field_widget[name=${name}] ${inner} >> visible=true >> nth=0`;

// ---------- لغة الواجهة: القوائم تُعرَّف بأسمائها الإنجليزية وتُطابَق بالإنجليزية والعربية معًا ----------
// الترجمة من نظام Jawab نفسه (catalog/menus-ar.json)؛ الاسم الواحد يترجم بأكثر من صيغة، فنقصر البحث على قوائم التطبيق الحالي
interface MenuTr { en: string; ar: string; enPath: string; arPath: string }
let menuTr: MenuTr[] | undefined;
const loadMenuTr = (): MenuTr[] => (menuTr ??= existsSync(join("catalog", "menus-ar.json")) ? JSON.parse(readFileSync(join("catalog", "menus-ar.json"), "utf8")) : []);
export function menuLabels(name: string, app: string): string[] {
  const all = loadMenuTr().filter((m) => m.en === name);
  const inApp = all.filter((m) => m.enPath.startsWith(app + "/") || m.enPath === app);
  return [...new Set([name, ...(inApp.length ? inApp : all).map((m) => m.ar.trim())])].filter(Boolean);
}
const anyText = (labels: string[], tag = "") => labels.length === 1 ? `${tag}:text-is('${q(labels[0])}')` : `${tag}:is(${labels.map((l) => `:text-is('${q(l)}')`).join(",")})`;

export function expandSteps(steps: PlanStep[]): Step[] {
  const out: Step[] = [];
  let curApp = "";
  const add = (s: Step, say?: string, speech?: string) => out.push({ ...s, ...(say ? { narration: say } : {}), ...(speech ? { speech } : {}) } as Step);
  for (const st of steps) {
    const s = st as any;
    const before = out.length;
    if ("app" in s) { curApp = s.app; add({ action: "click", selector: `.o_app:has(${anyText(menuLabels(s.app, s.app))})` }, s.say, s.speech); }
    else if ("nav" in s) {
      const [first, ...rest] = s.nav as string[];
      const says = (s.say ?? []) as string[];
      const sps = (s.speech ?? []) as string[];
      // zoom:false: القوائم المنسدلة تعيد تموضعها أثناء التكبير فينزاح الإطار الأخضر عن العنصر
      if (rest.length === 0) add({ action: "click", selector: `.o_menu_sections .o_nav_entry${anyText(menuLabels(first, curApp))}`, zoom: false }, says[0], sps[0]);
      else {
        add({ action: "click", selector: `.o_menu_sections button.dropdown-toggle:has(span${anyText(menuLabels(first, curApp))})`, zoom: false }, says[0], sps[0]);
        rest.forEach((item, i) => add({ action: "click", selector: `.o-dropdown--menu .dropdown-item${anyText(menuLabels(item, curApp))}`, zoom: false }, says[i + 1], sps[i + 1]));
      }
    } else if ("new" in s) add({ action: "click", selector: ".o_control_panel :is(button.o_list_button_add,button.o_form_button_create,button.o-kanban-button-new,button:text-is('New'))" }, s.say, s.speech);
    else if ("field" in s) {
      const kind = s.kind ?? "char";
      if (kind === "select") add({ action: "select", selector: `.o_content .o_field_widget[name=${s.field}] select >> visible=true >> nth=0`, label: s.label ?? s.value }, s.say, s.speech);
      else {
        // علاقة m2o بلا قيمة: نكتفي بالنقر على الحقل لتظهر الاقتراحات ثم نختار أولها
        if (kind === "m2o" && !s.value) add({ action: "click", selector: FIELD(s.field, ":is(input,textarea)"), zoom: false }, s.say, s.speech);
        // zoom:false في m2o: التصغير بعد الخطوة يرسل حدث resize فتُغلق قائمة الاقتراحات قبل اختيار أحدها
        else add({ action: "fill", selector: FIELD(s.field, ":is(input,textarea)"), value: s.value, clear: kind !== "m2o", ...(kind === "m2o" ? { zoom: false } : {}) } as Step, s.say, s.speech);
        // ننتظر وصول نتائج البحث المفلترة، وإلا يضيع النقر على قائمة تُعاد رسمها
        if (kind === "m2o") { add({ action: "wait", ms: 1300 }); add({ action: "click", selector: ".o-autocomplete--dropdown-item >> visible=true >> nth=0", zoom: false }); }
      }
    } else if ("save" in s) add({ action: "click", selector: ".o_control_panel :is(.o_form_button_save,.o_list_button_save)" }, s.say, s.speech);
    else if ("search" in s) {
      // كتابة ثم Enter في الخطوة نفسها: الشرح يُقال أثناء الكتابة بدل أن تبقى قائمة البحث معلّقة حتى نهاية الجملة
      add({ action: "fill", selector: ".o_control_panel .o_searchview_input", value: s.search, submit: true } as Step, s.say, s.speech);
      add({ action: "wait", ms: 900 });
    } else if ("look" in s) add(s.at ? { action: "point", selector: s.at, ...(s.zoom !== undefined ? { zoom: s.zoom } : {}) } as Step : { action: "wait", ms: s.ms ?? 1500 }, s.say, s.speech);
    else out.push(st as Step);
    if (s.caption && out[before]) (out[before] as any).caption = s.caption;
  }
  return out;
}

export interface Compiled { scenario: Scenario; intro: string; outro: string }

export function compile(series: SeriesDef, ep: EpisodeDef, version: number, cfg: ProductionConfig, next?: EpisodeDef, total?: number): Compiled {
  const ord = ordinalAr(ep.number);
  // مقدمة قصيرة (جملة واحدة): الترحيب والسلسلة ورقم الحلقة وعنوانها. جملة الهدف تُقال لاحقًا فوق أول خطوة بدل أن تطيل بطاقة العنوان
  // الترحيب والسلسلة في الحلقة الأولى فقط؛ بقية الحلقات تبدأ برقمها وعنوانها مباشرة (أقصر وأقرب لأسلوب السلاسل المهنية)
  // النص المنطوق مشكَّل إن وُجدت نسخة التشكيل (titleSpeech/openingSpeech/closingSpeech) وإلا يُستعمل النص العادي
  const vowelled = !!(ep.openingSpeech || ep.closingSpeech || ep.titleSpeech);
  const sTitle = series.titleSpeech ?? series.title.ar, eTitle = ep.titleSpeech ?? ep.title.ar;
  const sOrd = vowelled ? (ORD_V[ep.number] ?? ord) : ord;
  const head = ep.number === 1
    ? `${vowelled ? "أَهْلًا بِكُمْ فِي" : "أهلًا بكم في"} ${sTitle}. ${vowelled ? "الْحَلْقَةُ" : "الحلقة"} ${sOrd}: ${eTitle}.`
    : `${vowelled ? "الْحَلْقَةُ" : "الحلقة"} ${sOrd}: ${eTitle}.`;
  // وقت تحميل Jawab (نحو 5 ثوانٍ) يبقى فيه المشاهد أمام البطاقة، فنملؤه بجملة الهدف مع ظهور أهداف التعلّم بعلامات صح
  const intro = `${head} ${ep.openingSpeech ?? ep.opening}`;
  // الختام: خلاصة قصيرة ثم تشويق للحلقة القادمة (أو شكر في آخر حلقة). بطاقة الختام تحمل كلمة الشكر مرئيًا
  const closeSrc = ep.closingSpeech ?? ep.closing;
  const recap = closeSrc.replace(/\s*(شكرًا لمتابعتكم|شُكْرًا لِمُتَابَعَتِكُمْ)\.?\s*$/, "").trim();
  // الترتيب: خلاصة، ثم الشكر، ثم تشويق للحلقة القادمة (إن وُجدت)
  const nextTitle = next ? (next.titleSpeech ?? next.title.ar) : "";
  const outro = vowelled
    ? `${recap} شُكْرًا لِمُتَابَعَتِكُمْ.${next ? ` وَفِي الْحَلْقَةِ الْقَادِمَةِ: ${nextTitle}.` : ""}`
    : `${recap} شكرًا لمتابعتكم.${next ? ` وفي الحلقة القادمة: ${nextTitle}.` : ""}`;
  const scenario: Scenario = {
    id: jobId(series.id, ep.number, version),
    title: { ar: `الحلقة ${ep.number} · ${ep.title.ar}`, en: `Episode ${ep.number} · ${ep.title.en}` },
    intro,
    outro,
    nextTitle: next?.title.ar,
    card: { points: ep.objectives.slice(0, 3), series: series.title.ar, epLabel: `الحلقة ${ord}`, epTitle: ep.title.ar }, // لا "حلقة n من N": كل حلقة تُنشر مستقلة
    ...cfg.scenarioBase,
    ...(ep.keyCaptions ? { keyCaptions: true } : {}),
    vars: ep.vars,
    verify: ep.verify,
    steps: expandSteps(ep.steps),
  };
  return { scenario, intro, outro };
}

// ---------- فحص السلامة والجودة قبل أي تسجيل ----------
const DESTRUCTIVE = /\b(delete|unlink|archive|remove|discard|reject|refuse|reverse|unreconcile|unlock|merge|cancel|reset|trash|purge|drop)\b|حذف|أرشف|إلغاء|رفض|عكس/i;

export function lintEpisode(ep: EpisodeDef, scenario: Scenario): string[] {
  const errs: string[] = [];
  if (!ep.objectives?.length) errs.push("no learning objectives");
  if (!ep.expected) errs.push("no expected outcome");
  if (!ep.verify?.length) errs.push("no verify checks (an episode must prove its outcome)");
  if (!scenario.steps.some((s) => s.narration)) errs.push("no narrated steps");
  let creates = false;
  let writes = false;
  scenario.steps.forEach((s, i) => {
    const probe = JSON.stringify(s.action === "goto" ? { u: s.url } : { sel: (s as any).selector ?? "", label: (s as any).label ?? "" });
    if (DESTRUCTIVE.test(probe)) errs.push(`step ${i + 1}: destructive-looking target (${probe.slice(0, 80)})`);
    if (s.action === "click" && /button:text-is\('New'\)|Add a line|Add a bank/i.test((s as any).selector)) creates = true;
    // الكتابة في خانة البحث ليست تعديل بيانات؛ المقصود حقول السجلات
    if ((s.action === "fill" || s.action === "select") && /o_field_widget/.test((s as any).selector)) writes = true;
    // قائمة الشركات تكشف أسماء شركات العملاء: ممنوع فتحها في أي حلقة
    if (/switch_company|company_switcher/i.test(JSON.stringify((s as any).selector ?? ""))) errs.push(`step ${i + 1}: opens the company switcher (would expose real customer companies)`);
    // أفعال لا رجعة فيها تتطلب allowPost صراحةً
    if (s.action === "click" && /action_post|action_confirm|button_confirm|button_validate|:text-is\('(Confirm|Post|Validate)'\)/i.test((s as any).selector ?? "") && !ep.allowPost) errs.push(`step ${i + 1}: posts/confirms/validates but the episode does not set allowPost`);
    if (s.action === "goto" && /^https?:\/\//i.test(s.url)) errs.push(`step ${i + 1}: absolute URL not allowed`);
  });
  if (writes && !creates && !ep.allowEdit) errs.push("writes data without creating a new record (set allowEdit only if editing existing data is intended)");
  const n = ep.number;
  if (ep.dependsOn?.some((d) => d >= n)) errs.push("dependsOn must reference earlier episodes");
  return errs;
}
