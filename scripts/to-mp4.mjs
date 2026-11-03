// يحوّل output/<id>/raw.webm إلى output/<id>/<id>.mp4 (H.264 + AAC):
//  1) يدمج التعليق الصوتي المسجَّل في events.json
//  2) يضيف موسيقى خلفية من assets/music/ (إن وُجدت) تنخفض تلقائيًا أثناء الكلام
// usage: npm run mp4 -- chart-of-accounts [--no-music] [--no-fx]   (--no-fx: بلا تلاشي النهاية)
import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const id = process.argv[2];
if (!id) { console.error("usage: npm run mp4 -- <scenario-id> [--no-music]"); process.exit(1); }
const dir = join("output", id);
const src = join(dir, "raw.webm");
const dst = join(dir, `${id}.mp4`);
if (!existsSync(src)) { console.error(`not found: ${src} (run npm run record first)`); process.exit(1); }

const run = (args) => {
  const r = spawnSync(ffmpeg, ["-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// ---------- 1) الفيديو + التعليق الصوتي ----------
const data = JSON.parse(readFileSync(join(dir, "events.json"), "utf8"));
const clips = [data.intro, ...data.events.map((e) => e.audio), data.outro].filter(Boolean);

const args = ["-i", src];
for (const c of clips) args.push("-i", join(dir, c.file));
if (clips.length) {
  // كل مقطع يُؤخَّر إلى وقت بدئه ثم تُجمع المقاطع؛ normalize=0 يمنع amix من إعادة توزيع الأوزان فيبقى مستوى الصوت ثابتًا
  // كل مقطع يبدأ وينتهي بتلاشٍ قصير (15 و40 مللي ثانية): القصّ في منتصف الموجة كان يُسمع طقّة بين الجمل
  const fades = "afade=t=in:d=0.015,areverse,afade=t=in:d=0.09,areverse";
  const delays = clips.map((c, i) => `[${i + 1}:a]${fades},adelay=${c.startMs}|${c.startMs}[a${i}]`);
  const labels = clips.map((_, i) => `[a${i}]`).join("");
  const mix = `${delays.join(";")};${labels}amix=inputs=${clips.length}:duration=longest:dropout_transition=0:normalize=0`;
  // ضبط المستوى بمرحلتين (قياس ثم تطبيق خطي): loudnorm بمرحلة واحدة يغيّر الكسب مع الزمن فيُسمع تموّجًا وقطعًا في الصوت
  const probe = spawnSync(ffmpeg, ["-hide_banner", "-nostdin", ...args, "-filter_complex", `${mix},loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json[aout]`, "-map", "[aout]", "-f", "null", "-"], { encoding: "utf8" });
  const js = /\{[^{}]*"input_i"[^{}]*\}/s.exec(probe.stderr ?? "");
  let ln = "loudnorm=I=-15:TP=-1.5:LRA=11";
  if (js) {
    const m = JSON.parse(js[0]);
    ln = `loudnorm=I=-15:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  }
  const filter = `${mix},${ln}[aout]`;
  args.push("-filter_complex", filter, "-map", "0:v", "-map", "[aout]", "-c:a", "aac", "-b:a", "160k", "-ar", "48000");
}

// ---------- 2) الموسيقى ----------
const musicDir = "assets/music";
const files = existsSync(musicDir) ? readdirSync(musicDir).filter((f) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f)) : [];
// الأولوية: --music <اسم ملف> ثم ملف يضعه المستخدم ثم uplifting-generated ثم أي ملف مولَّد آخر
const pick = process.argv.includes("--music") ? process.argv[process.argv.indexOf("--music") + 1] : undefined;
const music =
  (pick && files.find((f) => f === pick)) ??
  files.find((f) => !f.includes("-generated")) ??
  files.find((f) => f.startsWith("uplifting-generated")) ??
  files[0];
if (pick && music !== pick) { console.error(`music file not found in ${musicDir}: ${pick}`); process.exit(1); }
const useMusic = !!music && clips.length > 0 && !process.argv.includes("--no-music");

// ---------- 3) تلاشٍ سينمائي في نهاية الفيديو (إلى لون خلفية بطاقة الختام) ----------
// raw.webm بلا مدة في الترويسة، فتُقرأ المدة بفك الملف مرة واحدة
const webmSeconds = () => {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-i", src, "-f", "null", "-"], { encoding: "utf8" });
  const t = [...(r.stderr ?? "").matchAll(/time=(d+):(d+):(d+(?:.d+)?)/g)].pop();
  return t ? Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]) : 0;
};
const fxOn = !process.argv.includes("--no-fx");
const fadeSec = 0.9;
const vDur = fxOn ? webmSeconds() : 0;
// الفيديو العمودي (900x1600) يُكبَّر إلى 1080x1920 القياسي للمنصات
const dm = /Video:.*?([0-9]{3,4})x([0-9]{3,4})/.exec(spawnSync(ffmpeg, ["-hide_banner", "-i", src], { encoding: "utf8" }).stderr ?? "");
// أول إطار في تسجيل Playwright يأتي ناقصًا (المحتوى في ركن والباقي رمادي) ويظهر كصورة البداية في المشغلات:
// نستبدله بنسخة من الإطار التالي بنفس المدة فلا يتغير توقيت الصوت
const vfs = ["trim=start_frame=1,setpts=PTS-STARTPTS,tpad=start_mode=clone:start_duration=0.04"];
if (dm && Number(dm[2]) > Number(dm[1])) vfs.push("scale=1080:1920:flags=lanczos");
if (fxOn && vDur > fadeSec * 2) vfs.push(`fade=t=out:st=${(vDur - fadeSec).toFixed(2)}:d=${fadeSec}:color=white`);
const fx = vfs.length ? ["-vf", vfs.join(",")] : [];

const voiceOut = useMusic ? join(dir, "_voice.mp4") : dst;
run([...args, ...fx, "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", voiceOut]);

if (useMusic) {
  const info = spawnSync(ffmpeg, ["-hide_banner", "-i", voiceOut], { encoding: "utf8" }).stderr;
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(info);
  const D = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  // الموسيقى: تُكرَّر عند اللزوم وتُقصّ على طول الفيديو، مستواها أقل من الصوت بـ14 LUFS تقريبًا،
  // وتنخفض أكثر (sidechain) أثناء الكلام، مع دخول وخروج تدريجيين. volume=0.6: خُفّضت 40% بطلب المستخدم (28 أكتوبر 2026)
  const filter = [
    `[1:a]atrim=0:${D.toFixed(2)},asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo,loudnorm=I=-30:TP=-3:LRA=7,volume=0.6,afade=t=in:d=2.5,afade=t=out:st=${Math.max(0, D - 3.5).toFixed(2)}:d=3.5[mus]`,
    `[0:a]aformat=channel_layouts=stereo,asplit=2[v1][v2]`,
    `[mus][v2]sidechaincompress=threshold=0.03:ratio=3:attack=80:release=1200[duck]`,
    // محدّد ذروة نهائي عند -1.5 dBFS (0.841): جمع الصوت مع الموسيقى كان يرفع الذروة إلى -0.3 dBFS قرب التشويه (الحلقة 6 من S02)
    `[v1][duck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.841:level=disabled[aout]`,
  ].join(";");
  run([
    "-i", voiceOut, "-stream_loop", "-1", "-i", join(musicDir, music),
    "-filter_complex", filter, "-map", "0:v", "-map", "[aout]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", D.toFixed(2), "-movflags", "+faststart", dst,
  ]);
  rmSync(voiceOut);
  console.log(`♪ music: ${music}`);
}
console.log(`Done → ${dst} (${clips.length} voice clips${useMusic ? " + music" : ""})`);

// مقدمة/خاتمة/غلاف المسؤول من assets/ (لا يفعل شيئًا إن لم توجد ملفات)
if (!process.argv.includes("--no-wrap")) {
  const w = spawnSync(process.execPath, ["scripts/wrap-assets.mjs", id], { stdio: "inherit" });
  if (w.status !== 0) process.exit(w.status ?? 1);
}
