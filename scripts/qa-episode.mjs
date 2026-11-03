// فحص جودة ما بعد الإنتاج لحلقة منتَجة (يقرأ فقط، لا يعدّل شيئًا في المكتبة):
//  1) يفرّغ كل مقطع صوتي إلى نص (ElevenLabs Scribe) ويقارنه بالنص المعروض، فيكشف الكلمات الناقصة أو المغلوطة
//  2) يقيس الشدة والذروة (LUFS وdBFS) ويحذّر من الذروة القريبة من التشويه
//  3) يلتقط فريمًا لكل خطوة ويجمعها في لوحة واحدة qa/<series>-eNN/sheet.png لمراجعتها بالعين (الاقتصاص أو الإزاحة)
// usage: node scripts/qa-episode.mjs <series> <episode> [version]      مثال: node scripts/qa-episode.mjs accounting-basics 6
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
process.loadEnvFile();
const [sid, epArg, verArg] = process.argv.slice(2);
if (!sid || !epArg) { console.error("usage: node scripts/qa-episode.mjs <series> <episode> [version]"); process.exit(1); }
const n = String(epArg).padStart(2, "0");
const base = join("library", sid, `ep-${n}`);
const ver = verArg ? `v${verArg}` : readdirSync(base).filter((v) => /^v\d+$/.test(v)).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))[0];
const dir = join(base, ver);
const mp4 = join(dir, "episode.mp4");
if (!existsSync(mp4)) { console.error(`no episode.mp4 in ${dir}`); process.exit(1); }
const ev = JSON.parse(readFileSync(join(dir, "events.json"), "utf8"));
const problems = [];

// ---------- 1) تفريغ الصوت ومقارنته ----------
const norm = (t) => t.replace(/[\u064B-\u0652\u0640]/g, "").replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
// في المكتبة تُحفظ المقاطع بأسماء مرتبة: 00-intro ثم NN-step بترتيب الأحداث
const pad2 = (i) => String(i).padStart(2, "0");
const clips = ev.events.map((e, i) => e.audio && existsSync(join(dir, "audio", `${pad2(i + 1)}-step.mp3`)) && { text: e.narration, file: join("audio", `${pad2(i + 1)}-step.mp3`), step: e.stepIndex }).filter(Boolean);
async function transcribe(file) {
  const fd = new FormData();
  fd.append("model_id", "scribe_v1"); fd.append("language_code", "ara");
  fd.append("file", new Blob([readFileSync(join(dir, file))], { type: "audio/mpeg" }), "clip.mp3");
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }, body: fd });
  if (!r.ok) throw new Error(`STT ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return (await r.json()).text ?? "";
}
let checked = 0, sttOff = false;
for (const c of clips.filter((x) => x.text)) {
  let heard;
  try { heard = norm(await transcribe(c.file)); } catch (e) {
    // المفتاح يحتاج صلاحية Speech to Text في ElevenLabs (API Keys ← Edit ← Speech to Text)؛ دونها تُتخطى المقارنة ويكمل الباقي
    console.log(`transcript check skipped: ${e.message}`); sttOff = true; break;
  }
  const want = norm(c.text);
  const hs = new Set(heard.split(" ")), ws = want.split(" ").filter(Boolean);
  const hit = ws.filter((w) => hs.has(w)).length / Math.max(1, ws.length);
  checked++;
  console.log(`step ${c.step}: match ${(hit * 100).toFixed(0)}%${hit < 0.7 ? "  <-- low" : ""}`);
  if (hit < 0.7) problems.push(`step ${c.step}: heard «${heard}» but text is «${want}» (${(hit * 100).toFixed(0)}% words matched)`);
}

// ---------- 2) الشدة والذروة ----------
const o = spawnSync(ffmpeg, ["-hide_banner", "-nostats", "-i", mp4, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr ?? "";
const lufs = Number(/Integrated loudness:\s*I:\s*(-?[\d.]+)/.exec(o)?.[1]), peak = Number(/True peak:\s*Peak:\s*(-?[\d.]+)/.exec(o)?.[1]);
console.log(`loudness ${lufs} LUFS, true peak ${peak} dBFS`);
if (peak > -1) problems.push(`true peak ${peak} dBFS is close to clipping (target -1.5 or lower)`);
if (lufs < -17 || lufs > -13) problems.push(`loudness ${lufs} LUFS is outside -17..-13`);

// ---------- 3) لوحة فريمات للمراجعة البصرية ----------
const qdir = join("qa", `${sid}-e${n}-${ver}`); mkdirSync(qdir, { recursive: true });
const times = ev.events.map((e) => ((e.tMs + Math.min(1500, (e.endMs - e.tMs) / 2)) / 1000).toFixed(2));
times.forEach((t, i) => spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", t, "-i", mp4, "-frames:v", "1", "-vf", "scale=640:-1", join(qdir, `f${String(i).padStart(2, "0")}.png`)]));
const cols = 3, rows = Math.ceil(times.length / cols);
spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-framerate", "1", "-i", join(qdir, "f%02d.png"), "-vf", `tile=${cols}x${rows}`, "-frames:v", "1", join(qdir, "sheet.png")]);
console.log(`frames sheet: ${join(qdir, "sheet.png")} (راجعها بالعين: اقتصاص أو إزاحة)`);

console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n- ${problems.join("\n- ")}` : `\nOK${sttOff ? " (transcript check NOT run)" : `: ${checked} clips matched`}, loudness/peak fine`);
process.exit(problems.length ? 2 : 0);
