// يولّد صوت المقدمة والخاتمة (موسيقى مركّبة خالية من الحقوق) مضبوطًا على مشاهد الفيديو، ويضيف الشعار الصوتي «Jawab. Stay connected.» في آخر الخاتمة.
// المخرجات: assets/intro/intro-audio.mp3 و assets/outro/outro-audio.mp3 (تُستعمل تلقائيًا في wrap-assets.mjs)،
// ومعها assets/outro/slogan.mp3 (الشعار وحده) والموسيقى منفصلة intro-music.mp3 / outro-music.mp3.
// usage: node scripts/voice/make-brand-audio.mjs [--regen-slogan] [--take 1]
//   --regen-slogan   يولّد الشعار من ElevenLabs (3 محاولات: slogan-take1..3.mp3) ثم يعتمد المحاولة --take (الافتراضي 1)
//   --take N         يعتمد محاولة محفوظة دون صرف رصيد جديد
// توقيت الموسيقى مأخوذ من مشاهد الفيديو (قياس السطوع وفحص اللقطات):
//   المقدمة: حركة سريعة 0-6ث (ومضات عند 2.5 و4.5)، ثم ثبات الشعار عند 6.0 ← ضربة كبرى عند 6.0
//   الخاتمة: شروق 0-2.4، انفجار ضوء عند 2.5، شظايا زجاج 3-5، تجميع 5.5-7.5، ظهور الشعار عند 8.0 ← ضربة كبرى عند 8.0 ثم الشعار الصوتي
import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
process.loadEnvFile();

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const TAKE = Number(arg("--take", 1));
const SR = 44100, TAU = Math.PI * 2;
const INTRO_DUR = 10, OUTRO_VIDEO = 10;
const LOGO_AT = 8.0; // لحظة ظهور شعار Jawab في الخاتمة
mkdirSync("assets/intro", { recursive: true }); mkdirSync("assets/outro", { recursive: true });
const ff = (args) => { const r = spawnSync(ffmpeg, ["-nostdin", "-loglevel", "error", "-y", ...args], { stdio: "inherit" }); if (r.status !== 0) process.exit(r.status ?? 1); };
const durOf = (f) => { const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(spawnSync(ffmpeg, ["-hide_banner", "-i", f], { encoding: "utf8" }).stderr ?? ""); return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]); };

// ---------- 1) الشعار الصوتي: إعلاني، أبطأ، بنبرة تحدٍّ ----------
// «Jawab» ثم وقفة قصيرة ثم «Stay connected»: كلمتان منفصلتان بوزن قوي. ثبات منخفض وتعبير مرتفع للحصول على نبرة إعلان
const SLOGAN_TEXT = 'Jawaab! <break time="0.65s" /> Stay connected!'; // «Jawaab» بمدّ الألف الثانية: النطق الصحيح طويل الحركة
if (process.argv.includes("--regen-slogan") || !existsSync("assets/outro/slogan-take1.mp3")) {
  // صوت الشعار في الخاتمة: جهوري إخباري (أصوات جاهزة في ElevenLabs، وليس صوت الشرح المستنسخ). المحاولات: دانيال (مذيع إخباري)، براين (جهوري عميق)، آدم (قوي رخيم)
  // الصوت المعتمد من المستخدم YVom6vJ8eyip50HaF8fc بثلاث درجات أداء: هادئ، متوازن، حماسي
  const V = "YVom6vJ8eyip50HaF8fc";
  // الدرجة «intense» معتمدة؛ المحاولات الثلاث تختلف في كتابة الاسم لضبط نطق «جَوَاب» (مقطعان، ضغط على الثاني، ألف طويلة)
  const TAIL = ' <break time="0.65s" /> Stay connected!';
  const SLOGAN_VOICES = [[1, 23, V, "Jawaab", 0.3, 0.8, "Jawaab!" + TAIL], [2, 23, V, "Jawapp", 0.3, 0.8, "Jawapp!" + TAIL], [3, 23, V, "Jawaap", 0.3, 0.8, "Jawaap!" + TAIL]];
  for (const [i, seed, voice, vname, stab, style, text] of SLOGAN_VOICES) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: stab, similarity_boost: 0.8, style, use_speaker_boost: true }, seed }),
    });
    if (!res.ok) { console.error(`ElevenLabs ${res.status} (${vname}): ${(await res.text()).slice(0, 200)}`); continue; }
    writeFileSync(`assets/outro/_take${i}.raw.mp3`, Buffer.from(await res.arrayBuffer()));
    // قصّ الصمت من الأطراف دون المساس بالوقفة الداخلية، إبطاء 8%، تقوية الجهارة والجسم (باص + ضغط)، صدى قصير يعطي قاعة إعلانية
    ff(["-i", `assets/outro/_take${i}.raw.mp3`, "-af",
      "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse," +
      // صوت جهوري: إبطاء 7%، دعم الباص (100-160Hz) وقطع الطنين، حضور في 3kHz، ضغط قوي، وصدى قاعة خفيف لنبرة إخبارية
      "atempo=0.93,equalizer=f=110:t=q:w=1:g=5,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3000:t=q:w=1:g=3,acompressor=threshold=-21dB:ratio=5:attack=4:release=100:makeup=4," +
      "loudnorm=I=-12:TP=-1.5:LRA=4,afade=t=in:d=0.01",
      "-c:a", "libmp3lame", "-b:a", "192k", `assets/outro/slogan-take${i}.mp3`]);
    rmSync(`assets/outro/_take${i}.raw.mp3`, { force: true });
    console.log(`slogan take ${i} (seed ${seed}) → assets/outro/slogan-take${i}.mp3`);
  }
}
if (!existsSync(`assets/outro/slogan-take${TAKE}.mp3`)) { console.error(`missing take ${TAKE}`); process.exit(1); }
copyFileSync(`assets/outro/slogan-take${TAKE}.mp3`, "assets/outro/slogan.mp3");
const SLOGAN = durOf("assets/outro/slogan.mp3");
console.log(`slogan (take ${TAKE}) length: ${SLOGAN.toFixed(2)}s`);

// ---------- 2) موسيقى مركّبة ----------
const BPM = 128, beat = 60 / BPM, step = beat / 2, s16 = beat / 4;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
let seed = 4242;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const C = { bass: 36, tones: [60, 64, 67] }, G = { bass: 43, tones: [59, 62, 67] }, Am = { bass: 45, tones: [57, 60, 64] }, F = { bass: 41, tones: [57, 60, 65] };
const prog = [C, G, Am, F];
const pluck = (f) => (t) => Math.min(t / 0.003, 1) * Math.exp(-t * 7) * (Math.sin(TAU * f * t) + 0.4 * Math.sin(TAU * 2 * f * t) * Math.exp(-t * 9) + 0.15 * Math.sin(TAU * 3 * f * t));
const bell = (f) => (t) => Math.exp(-t * 2.2) * (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * 2.76 * f * t) * Math.exp(-t * 3) + 0.25 * Math.sin(TAU * 5.4 * f * t) * Math.exp(-t * 5));
const pad = (f, len) => (t) => Math.min(t / 0.5, 1) * Math.min(Math.max((len - t) / 0.7, 0), 1) * (Math.sin(TAU * f * t) + 0.4 * Math.sin(TAU * f * 1.004 * t) + 0.25 * Math.sin(TAU * 2 * f * t));
const bassN = (f, d = 2.4) => (t) => Math.min(t / 0.008, 1) * Math.exp(-t * d) * (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * 2 * f * t));
const kick = (t) => Math.exp(-t * 14) * Math.sin(TAU * (48 * t + (100 / 24) * (1 - Math.exp(-24 * t))));
const boom = (t) => Math.exp(-t * 2.2) * Math.sin(TAU * (34 * t + 22 * (1 - Math.exp(-3 * t)) / 3)); // دوي منخفض طويل للضربة الكبرى
const hat = () => { let prev = 0; return (t) => { const w = rnd(); const h = w - prev; prev = w; return h * Math.exp(-t * 80); }; };
const crash = (len) => { let p1 = 0; return (t) => { const w = rnd(); const h = w - p1 * 0.9; p1 = w; return h * Math.exp(-t * (6 / len * 2)) * 0.9; }; };
const whoosh = (len, up = true) => { let lp = 0; return (t) => { const a = up ? t / len : 1 - t / len; lp += (rnd() - lp) * (0.03 + 0.6 * a * a); return lp * Math.sin(Math.PI * Math.min(t / len, 1)) * 3; }; };
const riser = (len) => { let lp = 0; return (t) => { const a = t / len; lp += (rnd() - lp) * (0.02 + 0.55 * a * a); return (lp * 2.6 + 0.25 * Math.sin(TAU * (220 + 900 * a * a) * t)) * a * a; }; };
const stab = (tones) => (t) => Math.min(t / 0.005, 1) * Math.exp(-t * 2.6) * tones.reduce((s, m) => s + Math.sin(TAU * mtof(m) * t) + 0.5 * Math.sin(TAU * 2 * mtof(m) * t) + 0.25 * Math.sin(TAU * 3 * mtof(m) * t), 0) / 3;
const shard = () => { let lp = 0; return (t) => { lp += (rnd() - lp) * 0.9; return lp * Math.exp(-t * 55) * Math.sin(TAU * 2800 * t + 3); }; }; // نقرة زجاج قصيرة

function track(total, build) {
  const n = Math.ceil(total * SR), L = new Float32Array(n), R = new Float32Array(n);
  const add = (start, len, fn, gain, pan = 0) => {
    const s0 = Math.floor(start * SR), m = Math.floor(len * SR);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4), gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < m && s0 + i < n; i++) { const v = fn(i / SR); L[s0 + i] += v * gl; R[s0 + i] += v * gr; }
  };
  build(add);
  return { L, R, n };
}
function wavOut(path, { L, R, n }) {
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = 0.88 / (peak || 1);
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE((Math.max(-1, Math.min(1, L[i] * k)) * 32767) | 0, 44 + i * 4); buf.writeInt16LE((Math.max(-1, Math.min(1, R[i] * k)) * 32767) | 0, 46 + i * 4); }
  writeFileSync(path, buf);
}
const chordAt = (t) => prog[Math.floor(t / (beat * 4)) % 4];
// أرپيجيو بالأجزاء السادسة عشرية (طاقة عالية) بين اليسار واليمين
const arp16 = (add, t0, t1, gain) => {
  const pat = [0, 1, 2, 1, 3, 2, 1, 2];
  for (let t = t0, i = 0; t < t1; t += s16, i++) {
    const c = chordAt(t), m = (pat[i % 8] === 3 ? c.tones[0] + 12 : c.tones[pat[i % 8]]) + 12;
    add(t, 0.5, pluck(mtof(m)), gain, i % 2 ? 0.4 : -0.4);
  }
};
const drive = (add, t0, t1, { kicks = true, hats = true, bass = true } = {}) => {
  for (let t = t0; t < t1 - 1e-6; t += beat) {
    if (kicks) add(t, 0.35, kick, 0.36);
    if (bass) add(t, beat * 0.9, bassN(mtof(chordAt(t).bass), 5), 0.24);
    if (hats) { add(t + step, 0.07, hat(), 0.09, 0.3); add(t + step + s16, 0.05, hat(), 0.05, -0.3); }
  }
};
const bigImpact = (add, t, tail = 2.2) => {
  add(t, 0.5, kick, 0.55); add(t, tail + 0.4, boom, 0.5); add(t, tail, stab([60, 64, 67, 72, 76, 79]), 0.6);
  add(t, 1.8, crash(1.8), 0.38, 0); add(t, tail, bassN(mtof(36), 1.2), 0.4);
};

// ---------- المقدمة (10 ثوانٍ) ----------
const intro = track(INTRO_DUR, (add) => {
  for (let b = 0; b < 3; b++) for (const m of prog[b].tones) add(b * 4 * beat, 4 * beat + 0.4, pad(mtof(m - 12), 4 * beat + 0.4), 0.045);
  // 0-6: حركة الكاميرا السريعة فوق الأيقونات = إيقاع مباشر وأرپيجيو سريع
  add(0, 1.1, whoosh(1.1, true), 0.2);
  drive(add, 0, 6.0);
  arp16(add, 0.2, 6.0, 0.15);
  // تحولات المشهد عند 2.5 و4.5 (ومضتان في الصورة)
  add(2.2, 0.7, whoosh(0.7, true), 0.2); add(2.5, 0.8, bell(mtof(88)), 0.12, 0.3);
  add(4.2, 0.7, whoosh(0.7, true), 0.22); add(4.5, 0.9, bell(mtof(91)), 0.14, -0.3);
  // صعود نحو لحظة ثبات الشعار
  add(4.6, 1.4, riser(1.4), 0.3);
  // 6.0: استقرار الشاشة النهائية = ضربة كبرى
  bigImpact(add, 6.0, 3.8);
  // 6-10: أجراس لامعة هادئة فوق وتر ممتد
  for (const m of [48, 55, 64, 67]) add(6.0, 4.0, pad(mtof(m), 4.0), 0.07);
  [[6.5, 84], [7.0, 88], [7.5, 91], [8.0, 96], [8.8, 91]].forEach(([t, m], i) => add(t, 1.6, bell(mtof(m)), 0.1, i % 2 ? 0.4 : -0.4));
  for (const t of [6.0 + beat * 4, 6.0 + beat * 8]) add(t, 0.3, kick, 0.25);
});
wavOut("assets/intro/_i.wav", intro);
ff(["-i", "assets/intro/_i.wav", "-af", `aecho=0.7:0.5:90:0.16,afade=t=in:d=0.06,afade=t=out:st=${INTRO_DUR - 0.7}:d=0.7`, "-t", String(INTRO_DUR), "-c:a", "libmp3lame", "-b:a", "192k", "assets/intro/intro-music.mp3"]);

// ---------- الخاتمة ----------
// الشعار يبدأ مع ظهور الشعار المرئي (8.0)، فتمتد الخاتمة بعد نهاية الفيديو بقدر ما يلزم (يُثبَّت آخر إطار)
const SLOGAN_AT = LOGO_AT + 0.15;
const OUTRO_DUR = Math.max(OUTRO_VIDEO, SLOGAN_AT + SLOGAN + 0.9);
const outro = track(OUTRO_DUR, (add) => {
  // 0-2.4 شروق: وسادة وأجراس رقيقة بلا إيقاع
  for (const m of C.tones) add(0, 3.0, pad(mtof(m - 12), 3.0), 0.05);
  [[0.3, 84], [0.9, 88], [1.5, 91], [2.0, 96]].forEach(([t, m], i) => add(t, 1.4, bell(mtof(m)), 0.1, i % 2 ? 0.4 : -0.4));
  add(1.4, 1.1, riser(1.1), 0.2);
  // 2.5: انفجار الضوء
  bigImpact(add, 2.5, 1.2); add(2.5, 1.0, whoosh(1.0, false), 0.22);
  // 2.5-5.5: اندفاع وشظايا زجاج
  drive(add, 2.5, 5.5);
  arp16(add, 2.5, 5.5, 0.14);
  for (let i = 0; i < 26; i++) add(2.8 + i * 0.1 + Math.abs(rnd()) * 0.06, 0.07, shard(), 0.1, rnd());
  // 5.5-7.9 تجميع المنصات والأيقونات: بناء متصاعد
  drive(add, 5.5, LOGO_AT);
  arp16(add, 5.5, LOGO_AT, 0.16);
  add(5.9, 2.0, riser(2.0), 0.32);
  add(7.4, 0.6, whoosh(0.6, true), 0.2); // عمود الضوء قبل الشعار
  // 8.0: ظهور الشعار = ضربة كبرى ثم يتراجع كل شيء تحت الصوت
  bigImpact(add, LOGO_AT, 1.8);
  for (const m of [48, 55, 60, 64]) add(LOGO_AT, OUTRO_DUR - LOGO_AT + 0.3, pad(mtof(m), OUTRO_DUR - LOGO_AT + 0.3), 0.045);
  // ضربة ختام خفيفة بعد انتهاء الشعار
  const end = SLOGAN_AT + SLOGAN + 0.05;
  add(end, 0.4, kick, 0.3); add(end, 1.0, stab([60, 64, 67, 72]), 0.2); add(end, 0.8, bell(mtof(96)), 0.12);
});
wavOut("assets/outro/_o.wav", outro);
ff(["-i", "assets/outro/_o.wav", "-af", `aecho=0.7:0.5:90:0.16,afade=t=in:d=0.2,afade=t=out:st=${OUTRO_DUR - 0.5}:d=0.5`, "-t", OUTRO_DUR.toFixed(2), "-c:a", "libmp3lame", "-b:a", "192k", "assets/outro/outro-music.mp3"]);
rmSync("assets/intro/_i.wav", { force: true }); rmSync("assets/outro/_o.wav", { force: true });

// ---------- دمج الشعار فوق موسيقى الخاتمة: الموسيقى تخفت أثناء الكلام (sidechain) والشعار أعلى بوضوح ----------
const d = Math.round(SLOGAN_AT * 1000);
ff(["-i", "assets/outro/outro-music.mp3", "-i", "assets/outro/slogan.mp3", "-filter_complex",
  `[0:a]volume=7dB,aformat=channel_layouts=stereo[m];[1:a]adelay=${d}|${d},aformat=channel_layouts=stereo,apad=whole_dur=${OUTRO_DUR.toFixed(2)},asplit=2[s][sc];[m][sc]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=300[duck];[duck][s]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,volume=4dB,alimiter=limit=0.95[a]`,
  "-map", "[a]", "-t", OUTRO_DUR.toFixed(2), "-c:a", "libmp3lame", "-b:a", "192k", "assets/outro/outro-audio.mp3"]);
ff(["-i", "assets/intro/intro-music.mp3", "-af", "volume=11dB,alimiter=limit=0.95", "-t", String(INTRO_DUR), "-c:a", "libmp3lame", "-b:a", "192k", "assets/intro/intro-audio.mp3"]);
console.log(`intro-audio.mp3 (${durOf("assets/intro/intro-audio.mp3").toFixed(2)}s) and outro-audio.mp3 (${durOf("assets/outro/outro-audio.mp3").toFixed(2)}s) ready · slogan at ${SLOGAN_AT.toFixed(2)}s`);
