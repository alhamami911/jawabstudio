// يجهّز حزمة نشر يوتيوب لكل حلقة مكتملة في library/ (قراءة وكتابة محلية فقط، لا اتصال بأي خدمة):
//   library/<سلسلة>/ep-NN/vN/youtube/{package.json, captions.ar.srt, thumbnail.jpg}
// العنوان والوصف والفصول (من أزمنة الشرح الفعلية) والوسوم والغلاف 1280x720 والترجمة بلا تشكيل ومزاحة بمدة المقدمة المدموجة.
// usage: node scripts/build-youtube-package.mjs [series] [episodeNumber]
import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [onlySeries, onlyEp] = process.argv.slice(2);
const NO_VOWELS = /[ً-ْ]/g;
const info = (f) => spawnSync(ffmpeg, ["-hide_banner", "-i", f], { encoding: "utf8" }).stderr ?? "";
const dur = (f) => { const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(info(f)); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0; };
const srtTime = (sec) => { const ms = Math.round(sec * 1000), p = (n, w = 2) => String(n).padStart(w, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
const chapTime = (sec) => { const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`; };

// مدة مقدمة الاستديو المدموجة قبل الحلقة: من wrap.json إن وُجد في مخرجات الحلقة، وإلا من ملفات assets/intro
function introSecFor(seriesId, n, v) {
  for (const id of [`${seriesId}-e${String(n).padStart(2, "0")}-v${v}`]) {
    const f = join("output", id, "wrap.json");
    if (existsSync(f)) { try { return JSON.parse(readFileSync(f, "utf8")).introSec ?? 0; } catch {} }
  }
  const d = "assets/intro";
  if (!existsSync(d)) return 0;
  const files = readdirSync(d);
  const vid = files.find((x) => /\.(mp4|mov|m4v|webm)$/i.test(x) && x.toLowerCase().startsWith("16x9")) ?? files.find((x) => /\.(mp4|mov|m4v|webm)$/i.test(x));
  const aud = join(d, "intro-audio.mp3");
  return Math.max(vid ? dur(join(d, vid)) : 0, existsSync(aud) ? dur(aud) : 0);
}

// عنوان الفصل: أول جملة قصيرة من نص الخطوة (بلا «» وبلا الإنجليزية بين الأقواس)
const chapterLabel = (text) => {
  const t = text.replace(/\s*\([A-Za-z][A-Za-z0-9\s&/.\-]*\)/g, "").replace(/[«»]/g, "").replace(NO_VOWELS, "").trim();
  const first = t.split(/[،,.:؟!]/)[0].trim() || t;
  if (first.length <= 46) return first;
  const cut = first.slice(0, 46); return cut.slice(0, Math.max(cut.lastIndexOf(" "), 20)).trim();
};

const coverFor = (seriesId) => {
  const d = "assets/covers";
  if (!existsSync(d)) return undefined;
  const f = readdirSync(d).find((x) => /\.(png|jpe?g)$/i.test(x) && !x.startsWith("_") && x.toLowerCase().startsWith(seriesId.toLowerCase() + "."));
  return f && join(d, f);
};

const seriesDirs = existsSync("library") ? readdirSync("library").filter((s) => statSync(join("library", s)).isDirectory()) : [];
let built = 0;
for (const sid of seriesDirs) {
  if (onlySeries && onlySeries !== sid) continue;
  for (const ep of readdirSync(join("library", sid)).filter((x) => /^ep-\d+$/.test(x)).sort()) {
    const n = Number(ep.slice(3));
    if (onlyEp && Number(onlyEp) !== n) continue;
    const vs = readdirSync(join("library", sid, ep)).filter((x) => /^v\d+$/.test(x)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    const vdir = vs.length && join("library", sid, ep, vs[vs.length - 1]);
    if (!vdir || !existsSync(join(vdir, "metadata.json")) || !existsSync(join(vdir, "episode.mp4"))) continue;
    const v = Number(vs[vs.length - 1].slice(1));
    const meta = JSON.parse(readFileSync(join(vdir, "metadata.json"), "utf8"));
    const sc = JSON.parse(readFileSync(join(vdir, "scenario.json"), "utf8"));
    const ev = JSON.parse(readFileSync(join(vdir, "events.json"), "utf8"));
    const off = introSecFor(sid, n, v);
    const aud = (f) => join(vdir, "audio", f);

    // ---- الترجمة: نوافذ الكلام الفعلية + مدة المقدمة، بلا تشكيل ----
    const cues = [];
    const stepAudio = (i) => aud(`${String(i + 1).padStart(2, "0")}-step.mp3`);
    if (ev.intro && sc.intro && existsSync(aud("00-intro.mp3"))) cues.push({ start: off + ev.intro.startMs / 1000, end: off + ev.intro.startMs / 1000 + dur(aud("00-intro.mp3")), text: sc.intro.replace(NO_VOWELS, "") });
    for (const e of ev.events) {
      const st = sc.steps[e.stepIndex];
      if (e.audio && st?.narration && existsSync(stepAudio(e.stepIndex))) cues.push({ start: off + e.audio.startMs / 1000, end: off + e.audio.startMs / 1000 + dur(stepAudio(e.stepIndex)), text: st.narration });
    }
    if (ev.outro && sc.outro && existsSync(aud("99-outro.mp3"))) cues.push({ start: off + ev.outro.startMs / 1000, end: off + ev.outro.startMs / 1000 + dur(aud("99-outro.mp3")), text: sc.outro.replace(NO_VOWELS, "") });
    const yt = join(vdir, "youtube");
    mkdirSync(yt, { recursive: true });
    writeFileSync(join(yt, "captions.ar.srt"), cues.map((q, i) => `${i + 1}\n${srtTime(q.start)} --> ${srtTime(q.end)}\n${q.text}\n`).join("\n"));

    // ---- الفصول: أول فصل 0:00، والفاصل بين فصلين 25 ثانية على الأقل، وبحد أقصى 8 ----
    // المرشحون: خطوات الاختيار (select) إن وُجد منها ثلاث على الأقل (مثل أنواع الحسابات)، وإلا خطوات النقر والإشارة التي نصها طويل ومعبّر؛ لا حقول ولا حفظ
    const withText = ev.events.filter((e) => e.audio && sc.steps[e.stepIndex]?.narration);
    const selects = withText.filter((e) => e.action === "select");
    const pool = selects.length >= 3 ? selects : withText.filter((e) => e.action !== "fill" && e.action !== "press" && e.action !== "hide" && sc.steps[e.stepIndex].narration.length >= 35);
    const chapters = [{ t: 0, label: "المقدمة" }];
    let last = Math.max(off + 5, 12);
    const gap = selects.length >= 3 ? 15 : 25;
    for (const e of pool) {
      const label = chapterLabel(sc.steps[e.stepIndex].narration);
      const t = off + e.audio.startMs / 1000;
      if (label.length >= 10 && !/^و?(نحفظ|أخيرا|أخيرًا نحفظ)/.test(label) && t - last >= gap && chapters.length < 7) { chapters.push({ t, label }); last = t; }
    }
    if (ev.outro && ev.outro.startMs) { const t = off + ev.outro.startMs / 1000; if (t - last >= 12) chapters.push({ t, label: "الخاتمة" }); }
    const chapterLines = chapters.length >= 3 ? chapters.map((c) => `${chapTime(c.t)} ${c.label}`) : [];

    // ---- العنوان والوصف والوسوم ----
    const titleAr = meta.title.ar;
    const shortTitle = titleAr.length > 58 ? titleAr.slice(0, 58).replace(/\s\S*$/, "") : titleAr;
    const title = `${shortTitle} | JAWAB ERP`;
    const seriesAr = meta.seriesTitle.ar;
    const description = [
      `في هذه الحلقة من «${seriesAr}»:`,
      ...meta.objectives.map((o) => `• ${o}`),
      ...(chapterLines.length ? ["", "الفصول:", ...chapterLines] : []),
      "",
      `ضمن سلسلة: ${seriesAr}`,
      "JAWAB ERP: نظام لإدارة أعمال الشركات بواجهة عربية. شروحات قصيرة خطوة بخطوة.",
      "",
      "#JAWAB #ERP #أودو #شرح_عربي",
    ].join("\n");
    const module = (() => { try { return JSON.parse(readFileSync(join("series", sid, "series.json"), "utf8")).module; } catch { return undefined; } })();
    const tags = ["JAWAB", "جواب", "ERP", "نظام ERP", "أودو", "Odoo", "شرح عربي", seriesAr, module, meta.title.en].filter(Boolean);

    // ---- الغلاف 1280x720 (JPG أقل من 2 ميجابايت) ----
    let thumbnail;
    const cover = coverFor(sid);
    if (cover) {
      thumbnail = "youtube/thumbnail.jpg";
      const r = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", cover, "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720", "-q:v", "3", join(yt, "thumbnail.jpg")]);
      if (r.status !== 0) thumbnail = undefined;
    }

    const sec = meta.videoSec ?? dur(join(vdir, "episode.mp4"));
    const pkg = {
      version: 1,
      seriesId: sid, episode: n, contentVersion: v,
      builtAt: new Date().toISOString(),
      // الرفع الآلي خاص دائمًا (مسودة)؛ النشر العلني يدوي من YouTube Studio بعد المراجعة
      privacyStatus: "private",
      video: { file: "episode.mp4", seconds: Math.round(sec), title, description, tags, categoryId: "27", defaultLanguage: "ar", defaultAudioLanguage: "ar", selfDeclaredMadeForKids: false },
      captions: { file: "youtube/captions.ar.srt", language: "ar", name: "العربية" },
      thumbnail,
      playlist: { title: seriesAr, description: `${seriesAr}: سلسلة شروحات JAWAB ERP` },
      chapters: chapterLines.length ? chapters.map((c) => ({ at: Math.round(c.t), label: c.label })) : [],
      // النسخة العمودية: Shorts تقبل حتى 3 دقائق؛ الأطول تبقى عمودية عادية ولا تُرفع افتراضيًا
      vertical: existsSync(join(vdir, "reel.mp4")) ? { file: "reel.mp4", seconds: Math.round(sec), shortsEligible: sec <= 180, title: sec <= 180 ? `${shortTitle} #Shorts` : `${shortTitle} | JAWAB ERP (عمودي)`, upload: sec <= 180 } : undefined,
    };
    writeFileSync(join(yt, "package.json"), JSON.stringify(pkg, null, 2));
    built++;
    console.log(`${sid} ep-${String(n).padStart(2, "0")} v${v}: ${title} | ${chapterLines.length} chapters | captions ${cues.length} cues (+${off.toFixed(1)}s) | ${thumbnail ? "thumbnail" : "no cover"}${pkg.vertical?.upload ? " | Shorts" : ""}`);
  }
}
console.log(`built ${built} package(s)`);
