// فحص جودة الحلقة قبل اعتبارها مكتملة. كل فحص يقيس شيئًا فعليًا (ffmpeg أو events.json أو النظام نفسه)،
// ولا يوجد فحص «يمرّ دائمًا». كل فشل يحدد المرحلة التي تُعاد: record (إعادة التسجيل) أو process (إعادة التصدير فقط).
import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Scenario, RecordedEvent, VerifyResult } from "../types.js";
import type { ProductionConfig } from "./plan.js";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  retryStage: "record" | "process" | "vrecord" | "vprocess" | "none"; // none: خلل في بيانات الحلقة نفسها، لا تنفع إعادة المحاولة
}
export interface Report { ok: boolean; checks: Check[]; failedStage?: "record" | "process" | "vrecord" | "vprocess"; fatal: boolean; videoSec: number; ranAt: string }

const ff = (args: string[]) =>
  spawnSync(ffmpeg as unknown as string, ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const secOf = (s: string) => {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
};

interface Win { start: number; end: number; what: string } // بالثواني

export function validateEpisode(o: {
  dir: string; // output/<jobId>
  mp4: string;
  format?: "vertical"; // الفيديو العمودي للشورتس/تيك توك: يُتوقع 1080x1920
  scenario: Scenario;
  episodeNumber: number;
  episodeTitleAr: string;
  ordinal: string;
  objectives: number;
  cfg: ProductionConfig;
}): Report {
  const v = o.cfg.validation;
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string, retryStage: Check["retryStage"] = "record") => checks.push({ name, ok, detail, retryStage });

  const evPath = join(o.dir, "events.json");
  if (!existsSync(evPath) || !existsSync(o.mp4)) {
    add("files", false, "events.json or final mp4 missing", "record");
    return finish(checks, 0);
  }
  const data = JSON.parse(readFileSync(evPath, "utf8")) as {
    intro?: { file: string; startMs: number }; outro?: { file: string; startMs: number };
    events: RecordedEvent[]; verify?: VerifyResult[];
  };

  // 1) الخطوات نُفّذت كلها
  const n = o.scenario.steps.length;
  add("workflow-executed", data.events.length === n && data.events.every((e) => e.endMs > e.tMs), `${data.events.length}/${n} steps recorded`);

  // 2) النتيجة المقصودة تحققت فعلًا (عنصر ظاهر + سجل أُنشئ في النظام)
  const expectedVerify = o.scenario.verify?.length ?? 0;
  const vr = data.verify ?? [];
  const failedV = vr.filter((x) => !x.ok);
  add("outcome-verified", expectedVerify > 0 && vr.length === expectedVerify && failedV.length === 0,
    expectedVerify === 0 ? "episode defines no verify checks" : failedV.length ? `failed: ${failedV.map((x) => x.note).join("; ")}` : `${vr.length}/${expectedVerify} checks passed`);

  // 3) الفيديو يُفكّ كاملًا دون أخطاء
  const dec = ff(["-v", "error", "-i", o.mp4, "-f", "null", "-"]);
  const decErr = (dec.stderr ?? "").trim();
  add("playable", dec.status === 0 && decErr === "", decErr ? decErr.slice(0, 200) : "decodes cleanly", "process");

  // 4) مسارا الصورة والصوت موجودان والمدة معقولة
  const info = ff(["-i", o.mp4]).stderr ?? "";
  const dur = secOf(info);
  const lastEnd = (data.events.at(-1)?.endMs ?? 0) / 1000;
  const hasV = (o.format === "vertical" ? /Video:.*\b1080x1920\b/ : /Video:.*\b(1280x720|1920x1080)\b/).test(info), hasA = /Audio:/.test(info);
  add("streams", hasV && hasA && dur >= lastEnd * 0.9, `video ${hasV ? (o.format === "vertical" ? "1080x1920" : /1920x1080/.test(info) ? "1920x1080" : "1280x720") : "wrong or missing size"}, audio ${hasA ? "ok" : "missing"}, ${dur.toFixed(1)}s (steps end ${lastEnd.toFixed(1)}s)`, "process");

  // 4b) المحتوى يملأ الإطار كله: عطل سابق وضع الصفحة في ركن الفيديو وترك الباقي رماديًا (128,128,128)
  const grayCorners: string[] = [];
  for (const t of [3.6, Math.max(4, dur / 2)]) {
    for (const [name, x, y] of [["bottom-right", "iw-12", "ih-12"], ["bottom-left", "4", "ih-12"], ["top-right", "iw-12", "4"]] as const) {
      const r = spawnSync(ffmpeg as unknown as string, ["-v", "error", "-ss", String(t), "-i", o.mp4, "-frames:v", "1", "-vf", `crop=8:8:${x}:${y},scale=1:1`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1024 });
      const px = r.stdout as Buffer | undefined;
      if (px && px.length >= 3 && px.slice(0, 3).every((v) => Math.abs(v - 128) <= 8)) grayCorners.push(`${name}@${t.toFixed(1)}s`);
    }
  }
  add("frame-filled", grayCorners.length === 0, grayCorners.length ? `flat gray at ${grayCorners.join(", ")}: content does not fill the frame` : "corners show real content", "record");

  // 4c) أول إطار: يظهر كصورة بداية في المشغلات، فلا يجوز أن يكون ناقصًا أو رماديًا
  const f0 = spawnSync(ffmpeg as unknown as string, ["-v", "error", "-i", o.mp4, "-frames:v", "1", "-vf", "crop=8:8:iw-12:ih-12,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1024 }).stdout as Buffer | undefined;
  const firstGray = !!f0 && f0.length >= 3 && f0.slice(0, 3).every((v) => Math.abs(v - 128) <= 8);
  add("first-frame", !firstGray, firstGray ? "first frame is flat gray (shows as a broken poster in players)" : "first frame shows real content", "process");

  // 5) نوافذ الكلام الفعلية (من الملفات الصوتية المسجلة)
  const clipSec = (file: string) => {
    const p = join(o.dir, file);
    return existsSync(p) ? secOf(ff(["-i", p]).stderr ?? "") : 0;
  };
  const wins: Win[] = [];
  const missing: string[] = [];
  if (data.intro) wins.push({ start: data.intro.startMs / 1000, end: data.intro.startMs / 1000 + clipSec(data.intro.file), what: "intro" });
  else if (o.scenario.intro) missing.push("intro audio");
  for (const e of data.events) {
    if (!e.narration) continue;
    if (!e.audio) { missing.push(`step ${e.stepIndex + 1} audio`); continue; }
    const len = clipSec(e.audio.file);
    if (len === 0) { missing.push(`step ${e.stepIndex + 1} clip unreadable`); continue; }
    wins.push({ start: e.audio.startMs / 1000, end: e.audio.startMs / 1000 + len, what: `step ${e.stepIndex + 1}` });
  }
  if (data.outro) wins.push({ start: data.outro.startMs / 1000, end: data.outro.startMs / 1000 + clipSec(data.outro.file), what: "outro" });
  else if (o.scenario.outro) missing.push("outro audio");
  add("narration-present", missing.length === 0 && wins.length > 0, missing.length ? `missing: ${missing.join(", ")}` : `${wins.length} narration clips`);

  // 6) التزامن: كل جملة تبدأ مع خطوتها وتنتهي قبل أن تتجاوزها بأكثر من الهامش
  const tol = v.syncToleranceMs / 1000;
  const bad: string[] = [];
  for (const e of data.events) {
    if (!e.narration || !e.audio) continue;
    const w = wins.find((x) => x.what === `step ${e.stepIndex + 1}`);
    if (!w) continue;
    if (w.start < e.tMs / 1000 - 0.3 || w.start > e.endMs / 1000) bad.push(`step ${e.stepIndex + 1} starts outside its step`);
    else if (w.end > e.endMs / 1000 + tol) bad.push(`step ${e.stepIndex + 1} speech runs ${(w.end - e.endMs / 1000).toFixed(1)}s past its step`);
  }
  const first = data.events[0];
  const introWin = wins.find((w) => w.what === "intro");
  if (introWin && first && introWin.end > first.tMs / 1000 + tol) bad.push("intro speech overruns the title card");
  add("narration-synced", bad.length === 0, bad.length ? bad.join("; ") : "all clips inside their steps");

  // 7) الصوت مسموع فعلًا في الملف النهائي
  const vol = ff(["-i", o.mp4, "-af", "volumedetect", "-vn", "-f", "null", "-"]).stderr ?? "";
  const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(vol);
  add("audible", !!mean && Number(mean[1]) > v.minMeanVolumeDb, mean ? `mean ${mean[1]} dB` : "no audio level found", "process");

  // 8) لا فجوات صمت طويلة بين الجمل
  const sorted = [...wins].sort((a, b) => a.start - b.start);
  let worst = 0, where = "";
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i].start - sorted[i - 1].end;
    if (g > worst) { worst = g; where = `${sorted[i - 1].what} → ${sorted[i].what}`; }
  }
  add("no-long-silence", worst <= v.maxSilentGapSec, `longest silent gap ${worst.toFixed(1)}s (${where || "n/a"})`);

  // 9) لا شاشة سوداء ولا بيضاء فارغة
  const blk = ff(["-i", o.mp4, "-vf", `blackdetect=d=${v.blackSec}:pix_th=0.10`, "-an", "-f", "null", "-"]).stderr ?? "";
  const blacks = [...blk.matchAll(/black_start:([\d.]+).*?black_duration:([\d.]+)/g)].map((m) => `${Number(m[1]).toFixed(1)}s for ${Number(m[2]).toFixed(1)}s`);
  add("no-black-screen", blacks.length === 0, blacks.length ? `black at ${blacks.join(", ")}` : "none");
  const wht = ff(["-i", o.mp4, "-vf", `negate,blackdetect=d=${v.whiteSec}:pix_th=0.04`, "-an", "-f", "null", "-"]).stderr ?? "";
  const whites = [...wht.matchAll(/black_start:([\d.]+).*?black_duration:([\d.]+)/g)].map((m) => `${Number(m[1]).toFixed(1)}s for ${Number(m[2]).toFixed(1)}s`);
  add("no-blank-white", whites.length === 0, whites.length ? `blank white at ${whites.join(", ")}` : "none");

  // 10) لا جمود طويل غير مفسَّر (الجمود أثناء الكلام مقبول: الشاشة ثابتة والمعلّق يشرح)
  const fr = ff(["-i", o.mp4, "-vf", `freezedetect=n=-55dB:d=${v.unexplainedFreezeSec - 2}`, "-an", "-f", "null", "-"]).stderr ?? "";
  const starts = [...fr.matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...fr.matchAll(/freeze_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const unexplained: string[] = [];
  starts.forEach((s, i) => {
    const e = ends[i] ?? dur;
    // الجزء المجمّد الذي لا يغطيه أي كلام
    let cur = s, uncovered = 0;
    for (const w of sorted.filter((x) => x.end > s && x.start < e)) {
      uncovered += Math.max(0, w.start - cur);
      cur = Math.max(cur, w.end);
    }
    uncovered += Math.max(0, e - cur);
    if (uncovered > v.unexplainedFreezeSec) unexplained.push(`${s.toFixed(1)}s–${e.toFixed(1)}s`);
  });
  add("no-unexplained-freeze", unexplained.length === 0, unexplained.length ? `frozen without narration: ${unexplained.join(", ")}` : "none");

  // 11) العنوان والترقيم صحيحان (فحص بيانات: لا تنفع معه إعادة المحاولة)
  const stepsMd = existsSync(join(o.dir, "steps.md")) ? readFileSync(join(o.dir, "steps.md"), "utf8") : "";
  const titleOk = o.scenario.title.ar === `الحلقة ${o.episodeNumber} · ${o.episodeTitleAr}` && stepsMd.startsWith(`# ${o.scenario.title.ar}`);
  const plainIntro = (o.scenario.intro ?? "").replace(/[ً-ْ]/g, ""); // المقدمة المنطوقة قد تكون مشكَّلة
  const introOk = plainIntro.includes(o.ordinal) && plainIntro.includes(o.episodeTitleAr);
  add("title-and-number", titleOk && introOk, titleOk && introOk ? `episode ${o.episodeNumber}: title card, steps file and spoken intro agree` : "title card / steps file / spoken intro disagree on number or title", "none");

  // 12) أهداف التعلّم مرتبطة بنتيجة مُتحقَّق منها
  add("objectives-covered", o.objectives > 0 && expectedVerify > 0 && failedV.length === 0, `${o.objectives} objectives, ${vr.filter((x) => x.ok).length} verified outcomes (structural: objectives are tied to verified outcomes, not judged by content)`, "none");

  return finish(checks, dur);
}

function finish(checks: Check[], videoSec: number): Report {
  const failed = checks.filter((c) => !c.ok);
  const fatal = failed.some((c) => c.retryStage === "none");
  // أبكر مرحلة متأثرة: إعادة التسجيل تعيد التصدير بعدها تلقائيًا
  const order = ["record", "process", "vrecord", "vprocess"] as const;
  const failedStage = order.find((st) => failed.some((c) => c.retryStage === st));
  return { ok: failed.length === 0, checks, failedStage, fatal, videoSec, ranAt: new Date().toISOString() };
}

// يدمج تقرير الفيديو الأفقي مع تقرير العمودي: أسماء فحوص العمودي تُسبق بـ "vertical:" ومراحل إعادته vrecord/vprocess
export function mergeReports(landscape: Report, vertical: Report, label = "vertical"): Report {
  const map = (c: Check): Check => ({ ...c, name: `${label}: ${c.name}`, retryStage: c.retryStage === "record" ? "vrecord" : c.retryStage === "process" ? "vprocess" : c.retryStage });
  return finish([...landscape.checks, ...vertical.checks.map(map)], landscape.videoSec);
}
