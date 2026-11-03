// عامل الإنتاج: عملية مستقلة تقرأ الطابور من data/queue.json وتنتج الحلقات واحدة بعد أخرى.
// لا يعتمد على جلسة Claude ولا على VS Code: شغّله بـ  npm run worker  (أو من زر «ابدأ» في لوحة المتابعة).
// يستعمل المسجّل والتصدير الحاليين كما هما (src/record.ts و scripts/to-mp4.mjs) كعمليات فرعية.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import { STAGES, jobById, log, now, read, update, workerAlive, type Job, type Stage, type Status } from "./store.js";
import { compile, lintEpisode, loadConfig, loadEpisodes, loadSeries, ordinalAr, type EpisodeDef, type SeriesDef } from "./plan.js";
import { recoverInterrupted } from "./ops.js";
import { validateEpisode, mergeReports } from "./validate.js";
import type { Scenario, VerifyResult } from "../types.js";

try { process.loadEnvFile(); } catch {}
const cfg = loadConfig();
const watch = process.argv.includes("--watch");
const TSX_CLI = join("node_modules", "tsx", "dist", "cli.mjs");

// أنواع الأعطال: Fatal لا تنفع معه إعادة المحاولة، ProviderDown يوقف الطابور كله (لا ذنب للحلقة)، وغيرها مؤقت
class Fatal extends Error {}
class ProviderDown extends Error {}
class Canceled extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const get = (id: string) => jobById(read(), id);
const patch = (id: string, fn: (j: Job) => void) => update((s) => { const j = jobById(s, id); if (j) fn(j); });
const say = (m: string) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${m}`);

// ---------- قفل العامل الوحيد (لا حلقتان معًا على جلسة Jawab نفسها) ----------
const me = update((s) => {
  if (workerAlive(s) && s.worker!.pid !== process.pid) return false;
  s.worker = { pid: process.pid, heartbeat: now(), startedAt: now(), watch };
  return true;
});
if (!me) { say("another worker is already running; exiting"); process.exit(0); }
const hb = setInterval(() => update((s) => { if (s.worker?.pid === process.pid) s.worker.heartbeat = now(); }), 15000);
const release = () => { try { update((s) => { if (s.worker?.pid === process.pid) s.worker = undefined; }); } catch {} };
process.on("exit", release);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { release(); process.exit(0); });

const recovered = recoverInterrupted();
if (recovered.length) say(`recovered ${recovered.length} interrupted episode(s): ${recovered.join(", ")}`);

// ---------- اختيار الحلقة التالية ----------
type Pick = { id: string } | { waitMs: number } | { idle: true } | { paused: string };
function pickNext(): Pick {
  return update((s): Pick => {
    if (s.paused) return { paused: s.pausedReason ?? "queue paused" };
    let soonest = Infinity;
    for (const j of [...s.jobs].filter((x) => x.status === "Queued").sort((a, b) => a.position - b.position)) {
      if (s.seriesPaused[j.seriesId]) continue;
      // الاعتماد على حلقات سابقة (بيانات تنشئها): تأخير حتى تكتمل، أو تخطٍّ إن فشلت
      let blocked = false;
      for (const d of j.dependsOn) {
        const dep = s.jobs.filter((x) => x.seriesId === j.seriesId && x.number === d).sort((a, b) => b.version - a.version)[0];
        if (!dep || dep.status === "Completed") continue;
        if (dep.status === "Failed" || dep.status === "Skipped") {
          j.status = "Skipped"; j.skipReason = `depends on episode ${d} which is ${dep.status}`; j.finishedAt = now(); log(j, `skipped: ${j.skipReason}`);
        }
        blocked = true; break;
      }
      if (blocked) continue;
      const nb = j.notBefore ? Date.parse(j.notBefore) : 0;
      if (nb > Date.now()) { soonest = Math.min(soonest, nb); continue; }
      j.startedAt ??= now();
      return { id: j.id };
    }
    return soonest < Infinity ? { waitMs: soonest - Date.now() } : { idle: true };
  });
}

// ---------- تشغيل عملية فرعية مع مهلة وإلغاء وسجل ----------
function runChild(id: string, args: string[], timeoutMs: number, logPath: string): Promise<{ code: number | null; out: string; reason?: "timeout" | "cancel" }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd: process.cwd(), env: process.env, windowsHide: true });
    let out = "", reason: "timeout" | "cancel" | undefined;
    const sink = (d: Buffer) => { const t = d.toString(); out = (out + t).slice(-8000); try { appendFileSync(logPath, t); } catch {} };
    p.stdout.on("data", sink); p.stderr.on("data", sink);
    const kill = () => { try { spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true }); } catch {} };
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (get(id)?.cancelRequested) { reason = "cancel"; kill(); }
      else if (Date.now() - t0 > timeoutMs) { reason = "timeout"; kill(); }
    }, 1500);
    p.on("close", (code) => { clearInterval(iv); resolve({ code, out, reason }); });
  });
}

const tail = (s: string, n = 400) => s.trim().split("\n").slice(-6).join(" | ").slice(-n);

interface Ctx { j: Job; series: SeriesDef; ep: EpisodeDef; dir: string; scenarioPath: string; logPath: string; mp4: string }

// ---------- المراحل ----------
async function prepare(c: Ctx) {
  const base = process.env.JAWAB_BASE_URL;
  if (!base || !process.env.JAWAB_USER || !process.env.JAWAB_PASSWORD) throw new Fatal("JAWAB_BASE_URL / JAWAB_USER / JAWAB_PASSWORD missing in .env");
  // أمان: لا يُسجَّل إلا على بيئة مصرَّح بها في config/production.json (بيئة اختبار)
  const host = new URL(base).hostname;
  if (!cfg.allowedHosts.includes(host)) throw new Fatal(`host ${host} is not in allowedHosts (config/production.json): refusing to run against an unlisted environment`);
  if ((process.env.TTS_PROVIDER ?? "elevenlabs") === "elevenlabs" && (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID)) throw new Fatal("TTS_PROVIDER=elevenlabs needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID");
  if (!existsSync(ffmpeg as unknown as string)) throw new Fatal("ffmpeg-static binary missing (run npm install)");
  if (!existsSync(TSX_CLI)) throw new Fatal("tsx not installed (run npm install)");

  const eps = loadEpisodes(c.series.id);
  const next = eps.find((e) => e.number > c.ep.number);
  const { scenario } = compile(c.series, c.ep, c.j.version, cfg, next, eps.length);
  const errs = lintEpisode(c.ep, scenario);
  if (errs.length) throw new Fatal(`episode plan rejected: ${errs.join("; ")}`);

  try {
    const r = await fetch(new URL("/web/login", base), { signal: AbortSignal.timeout(20000), redirect: "manual" });
    if (r.status >= 500) throw new Error(`login page returned ${r.status}`);
  } catch (e) { throw new Error(`Jawab unreachable: ${(e as Error).message}`); }

  mkdirSync(c.dir, { recursive: true });
  for (const f of ["raw.webm", "events.json", "steps.md", "validation.json", `${c.j.id}.mp4`]) rmSync(join(c.dir, f), { force: true });
  writeFileSync(c.scenarioPath, JSON.stringify(scenario, null, 2));
  writeFileSync(join(c.dir, "episode.json"), JSON.stringify(c.ep, null, 2));
}

async function record(c: Ctx) {
  for (const f of ["raw.webm", "events.json", "steps.md", `${c.j.id}.mp4`]) rmSync(join(c.dir, f), { force: true });
  const r = await runChild(c.j.id, [TSX_CLI, "src/record.ts", c.scenarioPath], cfg.stageTimeoutMin.record * 60000, c.logPath);
  if (r.reason === "cancel") throw new Canceled();
  if (r.reason === "timeout") throw new Error(`recording timed out after ${cfg.stageTimeoutMin.record} min`);
  if (/ElevenLabs (401|402|403|429)|quota|plan\/quota/i.test(r.out)) throw new ProviderDown(`voice provider unavailable: ${tail(r.out)}`);
  if (/missing variable/.test(r.out)) throw new Fatal(tail(r.out));
  if (r.code === 3) throw new Error(`intended outcome not reached: ${tail(r.out)}`);
  if (r.code !== 0) throw new Error(`recorder exited ${r.code}: ${tail(r.out)}`);
  if (!existsSync(join(c.dir, "raw.webm")) || !existsSync(join(c.dir, "events.json"))) throw new Error("recorder produced no video/events");
}

async function processVideo(c: Ctx) {
  rmSync(c.mp4, { force: true });
  const r = await runChild(c.j.id, ["scripts/to-mp4.mjs", c.j.id], cfg.stageTimeoutMin.process * 60000, c.logPath);
  if (r.reason === "cancel") throw new Canceled();
  if (r.reason === "timeout") throw new Error("video export timed out");
  if (r.code !== 0 || !existsSync(c.mp4)) throw new Error(`export failed (${r.code}): ${tail(r.out)}`);
}

// النسخة العمودية: تسجيل أصلي ثانٍ بالخطوات نفسها في نافذة 900x1600 (شاشة واحدة متصلة، لا قصّ للأفقي) ثم تصدير 1080x1920.
// ملاحظة صريحة: التسجيل الثاني ينفّذ الخطوات في Jawab مرة أخرى، فتُنشأ سجلات اختبار إضافية (بأرقام/أسماء تالية تلقائيًا).
const vdirOf = (c: Ctx) => c.dir + "-vertical";
async function recordVertical(c: Ctx) {
  const vdir = vdirOf(c);
  for (const f of ["raw.webm", "events.json", "steps.md", "validation.json", `${c.j.id}-vertical.mp4`]) rmSync(join(vdir, f), { force: true });
  const r = await runChild(c.j.id, [TSX_CLI, "src/record.ts", c.scenarioPath, "--vertical"], cfg.stageTimeoutMin.record * 60000, c.logPath);
  if (r.reason === "cancel") throw new Canceled();
  if (r.reason === "timeout") throw new Error(`vertical recording timed out after ${cfg.stageTimeoutMin.record} min`);
  if (/ElevenLabs (401|402|403|429)|quota|plan\/quota/i.test(r.out)) throw new ProviderDown(`voice provider unavailable: ${tail(r.out)}`);
  if (r.code === 3) throw new Error(`vertical: intended outcome not reached: ${tail(r.out)}`);
  if (r.code !== 0) throw new Error(`vertical recorder exited ${r.code}: ${tail(r.out)}`);
  if (!existsSync(join(vdir, "raw.webm")) || !existsSync(join(vdir, "events.json"))) throw new Error("vertical recorder produced no video/events");
}
async function processVertical(c: Ctx) {
  const out = join(vdirOf(c), `${c.j.id}-vertical.mp4`);
  rmSync(out, { force: true });
  const r = await runChild(c.j.id, ["scripts/to-mp4.mjs", `${c.j.id}-vertical`], cfg.stageTimeoutMin.process * 60000, c.logPath);
  if (r.reason === "cancel") throw new Canceled();
  if (r.reason === "timeout") throw new Error("vertical export timed out");
  if (r.code !== 0 || !existsSync(out)) throw new Error(`vertical export failed (${r.code}): ${tail(r.out)}`);
}

async function validate(c: Ctx) {
  const scenario = JSON.parse(readFileSync(c.scenarioPath, "utf8")) as Scenario;
  const common = { scenario, episodeNumber: c.ep.number, episodeTitleAr: c.ep.title.ar, ordinal: ordinalAr(c.ep.number), objectives: c.ep.objectives.length, cfg };
  const landscape = validateEpisode({ dir: c.dir, mp4: c.mp4, ...common });
  const vertical = validateEpisode({ dir: vdirOf(c), mp4: join(vdirOf(c), `${c.j.id}-vertical.mp4`), format: "vertical", ...common });
  const report = mergeReports(landscape, vertical, "vertical");
  writeFileSync(join(c.dir, "validation.json"), JSON.stringify(report, null, 2));
  patch(c.j.id, (j) => { j.videoSec = report.videoSec; });
  if (report.ok) return;
  const failed = report.checks.filter((x) => !x.ok).map((x) => `${x.name}: ${x.detail}`).join(" | ");
  if (report.fatal) throw new Fatal(`validation failed (not retryable): ${failed}`);
  // أعد المرحلة المتأثرة فقط: process = إعادة التصدير، record = إعادة التسجيل ثم التصدير
  patch(c.j.id, (j) => {
    // كل مسار (أفقي/عمودي) مستقل: إعادة التسجيل تُعيد تصديره، والتصدير وحده يكفي أحيانًا
    j.checkpoints[report.failedStage!] = false;
    if (report.failedStage === "record") j.checkpoints.process = false;
    if (report.failedStage === "vrecord") j.checkpoints.vprocess = false;
    log(j, `validation failed → redo ${report.failedStage}`, failed, "validate");
  });
  throw new Error(`validation failed → redo ${report.failedStage}: ${failed}`);
}

// ---------- المكتبة ----------
function publish(c: Ctx) {
  const n = String(c.ep.number).padStart(2, "0");
  const rel = join("library", c.series.id, `ep-${n}`, `v${c.j.version}`);
  mkdirSync(rel, { recursive: true });
  copyFileSync(c.mp4, join(rel, "episode.mp4"));
  const vmp4 = join(vdirOf(c), `${c.j.id}-vertical.mp4`);
  if (existsSync(vmp4)) {
    copyFileSync(vmp4, join(rel, "reel.mp4"));
    spawnSync(ffmpeg as unknown as string, ["-y", "-loglevel", "error", "-ss", "3.6", "-i", vmp4, "-frames:v", "1", join(rel, "thumbnail-vertical.png")]);
  }
  for (const [src, dst] of [["scenario.json", "scenario.json"], ["steps.md", "steps.md"], ["validation.json", "validation.json"], ["events.json", "events.json"], ["episode.json", "episode-source.json"]])
    if (existsSync(join(c.dir, src))) copyFileSync(join(c.dir, src), join(rel, dst));
  const scenario = JSON.parse(readFileSync(c.scenarioPath, "utf8")) as Scenario;
  const events = JSON.parse(readFileSync(join(c.dir, "events.json"), "utf8")) as { verify?: VerifyResult[] };
  // مقاطع الصوت المولَّدة تُحفظ مع الحلقة: ملفات عادية تبقى صالحة حتى لو انتهى اشتراك مزود الصوت (voice bank)
  const ev = JSON.parse(readFileSync(join(c.dir, "events.json"), "utf8")) as { intro?: { file: string }; outro?: { file: string }; events: { stepIndex: number; audio?: { file: string } }[] };
  mkdirSync(join(rel, "audio"), { recursive: true });
  const keep = (f: string | undefined, name: string) => { if (f && existsSync(join(c.dir, f))) copyFileSync(join(c.dir, f), join(rel, "audio", name)); };
  keep(ev.intro?.file, "00-intro.mp3");
  for (const e of ev.events) keep(e.audio?.file, `${String(e.stepIndex + 1).padStart(2, "0")}-step.mp3`);
  keep(ev.outro?.file, "99-outro.mp3");

  // صورة مصغرة (بطاقة العنوان بعد اكتمال حركة النص) وملف ترجمة SRT من نوافذ الكلام الفعلية
  spawnSync(ffmpeg as unknown as string, ["-y", "-loglevel", "error", "-ss", "3.6", "-i", c.mp4, "-frames:v", "1", join(rel, "thumbnail.png")]);
  const clipLen = (f: string) => {
    const r = spawnSync(ffmpeg as unknown as string, ["-hide_banner", "-i", join(c.dir, f)], { encoding: "utf8" });
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr ?? "");
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  };
  const ts = (sec: number) => { const ms = Math.round(sec * 1000); const p = (n: number, w = 2) => String(n).padStart(w, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
  const sc0 = JSON.parse(readFileSync(c.scenarioPath, "utf8")) as Scenario;
  const evFull = JSON.parse(readFileSync(join(c.dir, "events.json"), "utf8")) as { intro?: { file: string; startMs: number }; outro?: { file: string; startMs: number }; events: { stepIndex: number; audio?: { file: string; startMs: number } }[] };
  const plainTxt = (t: string) => t.replace(/\s*\([A-Za-z][A-Za-z0-9\s&/.\-]*\)/g, "").replace(/\s{2,}/g, " ").trim();
  // الترجمة تُزاح بمدة مقدمة الاستديو المدموجة قبل الحلقة (wrap.json من wrap-assets)، وتُكتب بلا تشكيل ليسهل قراءتها على الشاشة (التشكيل للنطق فقط)
  let off = 0;
  try { off = (JSON.parse(readFileSync(join(c.dir, "wrap.json"), "utf8")) as { introSec?: number }).introSec ?? 0; } catch {}
  const noVowels = (t: string) => t.replace(/[ً-ْ]/g, "");
  const cues: { start: number; end: number; text: string }[] = [];
  if (evFull.intro && sc0.intro) cues.push({ start: off + evFull.intro.startMs / 1000, end: off + evFull.intro.startMs / 1000 + clipLen(evFull.intro.file), text: noVowels(sc0.intro) });
  for (const e of evFull.events) {
    const st = sc0.steps[e.stepIndex];
    if (e.audio && st?.narration) cues.push({ start: off + e.audio.startMs / 1000, end: off + e.audio.startMs / 1000 + clipLen(e.audio.file), text: st.narration });
  }
  if (evFull.outro && sc0.outro) cues.push({ start: off + evFull.outro.startMs / 1000, end: off + evFull.outro.startMs / 1000 + clipLen(evFull.outro.file), text: noVowels(sc0.outro) });
  writeFileSync(join(rel, "captions.srt"), cues.map((q, i) => `${i + 1}\n${ts(q.start)} --> ${ts(q.end)}\n${q.text}\n`).join("\n"));
  // نص التعليق كما يُنطق، مرتبًا
  const spoken = [scenario.intro, ...scenario.steps.map((s) => (s.narration ? (s.speech ?? s.narration) : undefined)), scenario.outro].filter(Boolean);
  writeFileSync(join(rel, "narration.md"), `# ${scenario.title.ar}\n\n${spoken.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n`);
  const jobNow = get(c.j.id)!;
  const logText = [`# production history ${c.j.id}`, ...jobNow.history.map((h) => `${h.ts} ${h.stage ?? "-"} ${h.event}${h.detail ? " :: " + h.detail : ""}`), "", "# recorder/exporter output", existsSync(c.logPath) ? readFileSync(c.logPath, "utf8") : ""].join("\n");
  writeFileSync(join(rel, "production.log"), logText);
  const meta = {
    seriesId: c.series.id, seriesTitle: c.series.title, episode: c.ep.number, version: c.j.version,
    title: c.ep.title, objectives: c.ep.objectives, prerequisites: c.ep.prerequisites, expectedOutcome: c.ep.expected,
    estimatedMinutes: c.ep.estimatedMinutes, producedAt: now(), videoSec: jobNow.videoSec,
    voice: { provider: process.env.TTS_PROVIDER ?? "elevenlabs", voiceId: process.env.ELEVENLABS_VOICE_ID },
    jawabHost: new URL(process.env.JAWAB_BASE_URL!).hostname,
    createdRecords: (events.verify ?? []).filter((v) => v.ids?.length).map((v) => ({ model: v.model, ids: v.ids })), // سجلات الاختبار التي أنشأها التسجيل
    attempts: jobNow.attempts,
  };
  writeFileSync(join(rel, "metadata.json"), JSON.stringify(meta, null, 2));
  // فهرس المكتبة: كل النسخ محفوظة، و latest تشير إلى الأحدث
  const idxPath = join("library", "index.json");
  const idx = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, "utf8")) : { series: {} };
  const s = (idx.series[c.series.id] ??= { title: c.series.title, episodes: {} });
  const e = (s.episodes[n] ??= { title: c.ep.title, versions: [] });
  e.title = c.ep.title; e.latest = c.j.version;
  e.versions = [...e.versions.filter((v: { version: number }) => v.version !== c.j.version), { version: c.j.version, producedAt: meta.producedAt, path: join(rel, "episode.mp4").replaceAll("\\", "/"), videoSec: meta.videoSec }].sort((a: { version: number }, b: { version: number }) => a.version - b.version);
  writeFileSync(idxPath, JSON.stringify(idx, null, 2));
  // حزمة يوتيوب (عنوان ووصف وفصول وترجمة مزاحة وغلاف) تُبنى مع كل نشر في المكتبة؛ فشلها لا يُبطل الإنتاج
  spawnSync(process.execPath, ["scripts/build-youtube-package.mjs", c.series.id, String(c.ep.number)], { stdio: "ignore" });
  exportDelivery(c, rel, n);
  return join(rel, "episode.mp4").replaceAll("\\", "/");
}

// تسليم الحلقة الناجحة في مكانين:
// 1) سطح المكتب «production to publish»: مجلد لكل حلقة (S01E01 - العنوان) فيه 16x9.mp4 و vertical.mp4 والأغلفة والترجمة ونص يوتيوب. المجلد الجذر من JAWAB_EXPORT_DIR إن وُجد.
// 2) Google Drive (JAWAB_DRIVE_DIR): الفيديوهات فقط، مجلد واحد مسطح، ملفان لكل حلقة: «S01E01 - العنوان.mp4» و«S01E01 - العنوان (عمودي).mp4».
// إعادة إنتاج الحلقة تستبدل الملفات بأحدث نسخة (بلا رقم نسخة في الاسم). فشل أحد المكانين لا يمنع الآخر ولا يُبطل الإنتاج.
const cleanName = (t: string) => t.replace(/[\/:*?"<>|]/g, " ").replace(/\s{2,}/g, " ").trim();
function exportDelivery(c: Ctx, rel: string, n: string) {
  const code = c.series.catalogCode ? c.series.catalogCode + "E" + n : n;
  const safe = cleanName(c.ep.title.ar);
  try {
    const root = process.env.JAWAB_EXPORT_DIR ?? join(process.env.USERPROFILE ?? ".", "Desktop", "JAWAB Studio", "production to publish");
    // اسم المجلد بتسلسل الدليل (S01E01 - العنوان) لأن الرقم وحده يتكرر بين الأقسام
    const dest = join(root, code + " - " + safe);
    mkdirSync(dest, { recursive: true });
    const put = (src: string, name: string) => { if (existsSync(src)) copyFileSync(src, join(dest, name)); };
    put(join(rel, "episode.mp4"), "16x9.mp4");
    put(join(rel, "reel.mp4"), "vertical.mp4");
    for (const ext of ["png", "jpg", "jpeg"]) {
      put(join(c.dir, "cover." + ext), "cover-16x9." + ext);
      put(join(vdirOf(c), "cover." + ext), "cover-vertical." + ext);
    }
    put(join(rel, "narration.md"), "narration.md");
    put(join(rel, "captions.srt"), "captions.srt");
    // ترجمة يوتيوب (مزاحة بمدة المقدمة) تحل محل captions.srt، ونص النشر الجاهز للنسخ
    put(join(rel, "youtube", "captions.ar.srt"), "captions.srt");
    put(join(rel, "youtube", "thumbnail.jpg"), "youtube-thumbnail.jpg");
    const pk = join(rel, "youtube", "package.json");
    if (existsSync(pk)) {
      const p = JSON.parse(readFileSync(pk, "utf8"));
      writeFileSync(join(dest, "youtube.txt"), p.video.title + "\n\n" + p.video.description + "\n\nالوسوم: " + p.video.tags.join(", ") + "\nقائمة التشغيل: " + p.playlist.title + "\nالخصوصية: مسودة خاصة (النشر العلني يدوي بعد المراجعة)\n");
    }
  } catch (e) {
    console.error("export to desktop failed (library copy is intact):", (e as Error).message);
  }
  try {
    const drive = process.env.JAWAB_DRIVE_DIR;
    if (!drive) return;
    mkdirSync(drive, { recursive: true });
    const base = code + " - " + safe;
    if (existsSync(join(rel, "episode.mp4"))) copyFileSync(join(rel, "episode.mp4"), join(drive, base + ".mp4"));
    if (existsSync(join(rel, "reel.mp4"))) copyFileSync(join(rel, "reel.mp4"), join(drive, base + " (عمودي).mp4"));
  } catch (e) {
    console.error("drive export failed (desktop and library copies are intact):", (e as Error).message);
  }
}

const STATUS_OF: Record<Stage, Status> = { prepare: "Preparing", record: "Recording", process: "Processing", vrecord: "Recording", vprocess: "Processing", validate: "Validating", publish: "Validating" };

// ---------- تشغيل حلقة ----------
async function processJob(id: string) {
  const first = get(id)!;
  const series = loadSeries(first.seriesId);
  const ep = loadEpisodes(first.seriesId).find((e) => e.number === first.number);
  const dir = join("output", id);
  mkdirSync(dir, { recursive: true });
  const c: Ctx = { j: first, series, ep: ep!, dir, scenarioPath: join(dir, "scenario.json"), logPath: join(dir, "production.log"), mp4: join(dir, `${id}.mp4`) };
  say(`▶ ${id}  ${first.title}`);
  if (!ep) { patch(id, (j) => { j.status = "Failed"; j.error = "episode definition no longer exists in series/"; j.finishedAt = now(); }); return; }

  for (;;) {
    const j = get(id)!;
    c.j = j;
    if (j.cancelRequested) { patch(id, (x) => { x.status = "Skipped"; x.skipReason = "canceled by user"; x.finishedAt = now(); x.cancelRequested = false; log(x, "canceled"); }); say(`✗ ${id} canceled`); return; }
    const stage = STAGES.find((st) => !j.checkpoints[st]);
    if (!stage) return;
    const s = read();
    if (j.pauseRequested) { patch(id, (x) => { x.status = "Paused"; x.pausedFrom = "Queued"; x.pauseRequested = false; log(x, "paused at stage boundary"); }); say(`⏸ ${id} paused`); return; }
    if (s.paused || s.seriesPaused[j.seriesId]) { patch(id, (x) => { x.status = "Queued"; }); return; }

    const max = stage === "publish" ? 2 : cfg.maxAttempts[stage];
    const attempt = (j.attempts[stage] ?? 0) + 1;
    if (attempt > max) {
      patch(id, (x) => { x.status = "Failed"; x.finishedAt = now(); x.error ??= `retry limit reached at ${stage}`; log(x, `retry limit (${max}) reached at ${stage}`, x.error, stage); });
      say(`✗ ${id} failed: retry limit at ${stage}`); return;
    }
    patch(id, (x) => { x.status = STATUS_OF[stage]; x.stage = stage; x.attempts[stage] = attempt; x.notBefore = undefined; log(x, `${stage} started (attempt ${attempt}/${max})`, undefined, stage); });
    say(`  ${stage} (attempt ${attempt}/${max})`);
    const t = Date.now();
    try {
      let outputPath: string | undefined;
      if (stage === "prepare") await prepare(c);
      else if (stage === "record") await record(c);
      else if (stage === "process") await processVideo(c);
      else if (stage === "vrecord") await recordVertical(c);
      else if (stage === "vprocess") await processVertical(c);
      else if (stage === "validate") await validate(c);
      else outputPath = publish(c);
      patch(id, (x) => {
        x.checkpoints[stage] = true; x.productionMs = (x.productionMs ?? 0) + (Date.now() - t); x.error = undefined;
        log(x, `${stage} ok (${((Date.now() - t) / 1000).toFixed(0)}s)`, undefined, stage);
        if (stage === "publish") { x.status = "Completed"; x.outputPath = outputPath; x.finishedAt = now(); x.stage = undefined; }
      });
      if (stage === "publish") { say(`✓ ${id} completed → ${outputPath}`); return; }
    } catch (e) {
      const msg = (e as Error).message;
      patch(id, (x) => { x.productionMs = (x.productionMs ?? 0) + (Date.now() - t); });
      if (e instanceof Canceled) continue; // الحلقة العلوية تعالج الإلغاء
      if (e instanceof ProviderDown) {
        patch(id, (x) => { x.status = "Queued"; x.attempts[stage] = (x.attempts[stage] ?? 1) - 1; log(x, "voice provider unavailable: queue paused", msg, stage); });
        update((st) => { st.paused = true; st.pausedReason = `voice provider unavailable (${msg.slice(0, 160)}). Fix the key/quota, then resume.`; });
        say(`⏸ queue paused: ${msg.slice(0, 160)}`); return;
      }
      if (e instanceof Fatal) {
        patch(id, (x) => { x.status = "Failed"; x.error = msg; x.finishedAt = now(); log(x, `${stage} failed (not retryable)`, msg, stage); });
        say(`✗ ${id} failed: ${msg.slice(0, 200)}`); return;
      }
      const j2 = get(id)!;
      const done = j2.attempts[stage] ?? attempt;
      // المرحلة المطلوب إعادتها قد تكون سابقة للحالية (فشل التحقق يعيد التسجيل)
      const redo = STAGES.find((st) => !j2.checkpoints[st]) ?? stage;
      const redoMax = redo === "publish" ? 2 : cfg.maxAttempts[redo];
      if ((j2.attempts[redo] ?? 0) >= redoMax || done >= max && redo === stage) {
        patch(id, (x) => { x.status = "Failed"; x.error = msg; x.finishedAt = now(); log(x, `${redo} failed, no attempts left`, msg, stage); });
        say(`✗ ${id} failed: ${msg.slice(0, 200)}`); return;
      }
      const delay = cfg.retryDelaySec[Math.min((j2.attempts[redo] ?? 1) - 1, cfg.retryDelaySec.length - 1)] ?? 30;
      patch(id, (x) => { x.status = "Queued"; x.error = msg; x.notBefore = new Date(Date.now() + delay * 1000).toISOString(); log(x, `${stage} failed, retry in ${delay}s`, msg, stage); });
      say(`↻ ${id} ${stage} failed, retry in ${delay}s (other episodes continue): ${msg.slice(0, 160)}`);
      return;
    }
  }
}

// ---------- الحلقة الرئيسية ----------
say(`worker started (pid ${process.pid}${watch ? ", watching" : ""})`);
for (;;) {
  const p = pickNext();
  if ("id" in p) { try { await processJob(p.id); } catch (e) { say(`internal error on ${p.id}: ${(e as Error).message}`); await sleep(2000); patch(p.id, (j) => { j.status = "Queued"; j.notBefore = new Date(Date.now() + 15000).toISOString(); j.error = `internal: ${(e as Error).message}`; log(j, "internal error, re-queued", (e as Error).message); }); } }
  else if ("waitMs" in p) await sleep(Math.min(Math.max(p.waitMs, 500), 5000));
  else if ("paused" in p) { if (!watch) { say(`queue paused: ${p.paused}`); break; } await sleep(3000); }
  else if (watch) await sleep(3000);
  else break;
}
clearInterval(hb);
release();
say("worker finished: nothing left to do");
process.exit(0);

