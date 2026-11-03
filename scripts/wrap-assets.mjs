// يلصق مقدمة المسؤول وخاتمته بالفيديو النهائي إن وُجدتا، وينسخ غلاف السلسلة بجانبه.
//   assets/intro/   mp4 واحد على الأقل: 16x9.mp4 للأفقي وvertical.mp4 للعمودي، أو أي mp4 (يُلائَم بالتحجيم والحشو)
//   assets/outro/   الشروط نفسها
//   assets/covers/<السلسلة>.png|jpg  مثل accounting-basics.png
// لا ملفات = لا يفعل شيئًا. يُستدعى من to-mp4.mjs بعد بناء الفيديو. اختبار: ASSETS_DIR=<مجلد بديل>
// usage: node scripts/wrap-assets.mjs <id>
import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const id = process.argv[2];
if (!id) { console.error("usage: node scripts/wrap-assets.mjs <id>"); process.exit(1); }
const base = process.env.ASSETS_DIR ?? "assets";
const dir = join("output", id);
const dst = join(dir, `${id}.mp4`);
if (!existsSync(dst)) { console.error(`not found: ${dst}`); process.exit(1); }

const vertical = id.endsWith("-vertical");
const series = id.replace(/-vertical$/, "").replace(/-e\d+-v\d+$/, "");

const pick = (sub) => {
  const d = join(base, sub);
  if (!existsSync(d)) return undefined;
  const files = readdirSync(d).filter((f) => /\.(mp4|mov|m4v|webm)$/i.test(f));
  const want = vertical ? "vertical" : "16x9";
  const f = files.find((x) => x.toLowerCase().startsWith(want)) ?? files.find((x) => !/^(vertical|16x9)/i.test(x)) ?? undefined;
  return f && join(d, f);
};
const intro = pick("intro");
const outro = pick("outro");

// الغلاف: يُنسخ بجانب الفيديو (ظاهر للنشر) حتى لو لم توجد مقدمة ولا خاتمة
const coverDir = join(base, "covers");
// لا غلاف لهذه السلسلة وفيه خلفية أساسية: يُركَّب اسم السلسلة عليها تلقائيًا
if (existsSync(join(coverDir, "_base.png")) && !readdirSync(coverDir).some((f) => f.toLowerCase().startsWith(series.toLowerCase() + ".")) && existsSync(join("series", series, "series.json"))) {
  spawnSync(process.execPath, ["scripts/make-cover.mjs", series], { stdio: "inherit" });
}
if (existsSync(coverDir)) {
  const imgs = readdirSync(coverDir).filter((f) => /\.(png|jpe?g)$/i.test(f) && !f.startsWith("_"));
  // العمودي: <السلسلة>-vertical.png ثم أي ملف اسمه فيه short أو vertical (مثل «short cover»)، وإلا غلاف السلسلة العادي
  const c = (vertical && (imgs.find((f) => f.toLowerCase().startsWith(series.toLowerCase() + "-vertical.")) ?? imgs.find((f) => /short|vertical/i.test(f))))
    ?? imgs.find((f) => f.toLowerCase().startsWith(series.toLowerCase() + "."));
  if (c) { copyFileSync(join(coverDir, c), join(dir, "cover" + c.slice(c.lastIndexOf(".")))); console.log(`cover: ${c}`); }
}
if (!intro && !outro) { console.log("wrap-assets: no intro/outro files, skipped"); process.exit(0); }

const info = (f) => spawnSync(ffmpeg, ["-hide_banner", "-i", f], { encoding: "utf8" }).stderr ?? "";
const dm = /Video:.*?([0-9]{3,4})x([0-9]{3,4})/.exec(info(dst));
const W = dm ? Number(dm[1]) : vertical ? 1080 : 1280;
const H = dm ? Number(dm[2]) : vertical ? 1920 : 720;
const fps = Number(/([0-9.]+) fps/.exec(info(dst))?.[1] ?? 25) || 25;
const run = (args) => {
  const r = spawnSync(ffmpeg, ["-nostdin", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const durOf = (f) => { const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(info(f)); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0; };
// كل مقطع يُوحَّد (الأبعاد، المعدل، الصوت) ثم تُدمج المقاطع الثلاثة
// مقدمة الشعار تُقصّ إلى wrap.introMaxSec ثانية (الافتراضي 4، 0 = بلا قص) مع تلاشٍ في آخرها: 10 ثوانٍ قبل أي شرح كانت طويلة (طلب المستخدم 1 نوفمبر 2026، للحلقات الجديدة فقط)
const introMax = (() => { try { return Number(JSON.parse(readFileSync("config/production.json", "utf8")).wrap?.introMaxSec ?? 4); } catch { return 4; } })();
const norm = (src, out, audioFile, maxSec = 0) => {
  const hasAudio = /Audio:/.test(info(src));
  // مقطع بنسبة مختلفة (مقدمة أفقية داخل فيديو عمودي): تُملأ الخلفية بنسخة مموّهة من المقطع نفسه بدل الأشرطة البيضاء
  const sm = /Video:.*?([0-9]{3,4})x([0-9]{3,4})/.exec(info(src));
  const diff = sm ? Math.abs(Number(sm[1]) / Number(sm[2]) - W / H) > 0.02 : false;
  // صوت أطول من الفيديو (الشعار الصوتي يمتد بعد نهاية الخاتمة): يُثبَّت آخر إطار بقدر الفرق
  const cut = maxSec > 0 && durOf(src) > maxSec + 0.3; // مقطع أقصر من الحد لا يُقصّ
  const extra = audioFile && !cut ? Math.max(0, durOf(audioFile) - durOf(src)) : 0;
  const fadeV = cut ? `trim=0:${maxSec},setpts=PTS-STARTPTS,fade=t=out:st=${(maxSec - 0.6).toFixed(2)}:d=0.6,` : "";
  const tail = `${fadeV}${extra > 0.05 ? `tpad=stop_mode=clone:stop_duration=${extra.toFixed(2)},` : ""}setsar=1,fps=${fps},format=yuv420p`;
  const fc = diff
    ? `[0:v]split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:6[bg];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,${tail}[v]`
    : `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=white,${tail}[v]`;
  const args = ["-i", src];
  // صوت جاهز للمقطع (موسيقى المقدمة/الخاتمة والشعار الصوتي من make-brand-audio.mjs) يحلّ محل صوت الملف الأصلي
  if (audioFile) args.push("-i", audioFile);
  else if (!hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
  args.push("-filter_complex", fc, "-map", "[v]", "-map", audioFile || !hasAudio ? "1:a" : "0:a", "-af", `aresample=48000,aformat=channel_layouts=stereo,alimiter=limit=0.841:level=disabled${cut ? `,atrim=0:${maxSec},afade=t=out:st=${(maxSec - 0.6).toFixed(2)}:d=0.6` : ""}`,
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", out);
  run(args);
};
const parts = [];
const tmp = [];
const wrapInfo = { introSec: 0, outroSec: 0 }; // مدة المقدمة والخاتمة: تُزاح بها الترجمة والفصول عند النشر
for (const [name, src] of [["intro", intro], ["main", dst], ["outro", outro]]) {
  if (!src) continue;
  const out = join(dir, `_wrap_${name}.mp4`);
  const af = name === "main" ? undefined : join(base, name, `${name}-audio.mp3`);
  norm(src, out, af && existsSync(af) ? af : undefined, name === "intro" ? introMax : 0);
  if (name !== "main") wrapInfo[`${name}Sec`] = Number(durOf(out).toFixed(3));
  parts.push(out); tmp.push(out);
}
const inputs = parts.flatMap((p) => ["-i", p]);
const labels = parts.map((_, i) => `[${i}:v][${i}:a]`).join("");
const wrapped = join(dir, "_wrapped.mp4");
run([...inputs, "-filter_complex", `${labels}concat=n=${parts.length}:v=1:a=1[v][a]`, "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", wrapped]);
for (const t of tmp) rmSync(t, { force: true });
renameSync(wrapped, dst);
writeFileSync(join(dir, "wrap.json"), JSON.stringify(wrapInfo));
console.log(`wrapped: ${intro ? "intro " : ""}${outro ? "outro" : ""} → ${dst}`);
