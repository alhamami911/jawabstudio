// مقارنة صوتية: نفس الجمل بإعدادات مختلفة لنفس الصوت، لتحكم الأذن أيهما أقرب للإلقاء البشري المتسق.
// usage: node scripts/voice/voice-ab.mjs <مجلد الإخراج>
// A = الإعدادات الحالية، B = ثبات أعلى + seed ثابت، C = B + سياق الجملة السابقة واللاحقة (تتابع نغمة أطبع)
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
process.loadEnvFile();
const out = process.argv[2];
if (!out) { console.error("usage: node scripts/voice/voice-ab.mjs <out dir>"); process.exit(1); }
mkdirSync(out, { recursive: true });
const key = process.env.ELEVENLABS_API_KEY, voice = process.env.ELEVENLABS_VOICE_ID, model = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";
const sentences = [
  "أهلًا بكم في سلسلة أساسيات المحاسبة في جواب.",
  "الحلقة الثالثة: إضافة حساب أصول متداولة.",
  "لإضافة حساب جديد نضغط على زر جديد",
  "نكتب رمز الحساب، وهو رقم فريد لا يتكرر",
  "نختار النوع «الأصول المتداولة»، وهو يحدد مكان الحساب في الميزانية العمومية",
  "وأخيرًا نحفظ الحساب بزر الحفظ",
];
const variants = {
  A: { settings: { stability: 0.65, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true }, extra: () => ({}) },
  B: { settings: { stability: 0.85, similarity_boost: 0.8, style: 0, use_speaker_boost: true }, extra: () => ({ seed: 7 }) },
  C: { settings: { stability: 0.85, similarity_boost: 0.8, style: 0, use_speaker_boost: true }, extra: (i) => ({ seed: 7, ...(i > 0 ? { previous_text: sentences[i - 1] } : {}), ...(i < sentences.length - 1 ? { next_text: sentences[i + 1] } : {}) }) },
};
const tmp = join(out, "_tmp"); mkdirSync(tmp, { recursive: true });
for (const [name, v] of Object.entries(variants)) {
  const files = [];
  for (let i = 0; i < sentences.length; i++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: sentences[i], model_id: model, voice_settings: v.settings, ...v.extra(i) }),
    });
    if (!res.ok) { console.error(name, i, res.status, (await res.text()).slice(0, 200)); process.exit(1); }
    const f = join(tmp, `${name}${i}.mp3`); writeFileSync(f, Buffer.from(await res.arrayBuffer())); files.push(f);
  }
  const list = join(tmp, `${name}.txt`);
  writeFileSync(list, files.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
  const r = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-af", "apad=pad_dur=0.6", "-c:a", "libmp3lame", "-b:a", "128k", join(out, `${name}.mp3`)]);
  if (r.status !== 0) { console.error(String(r.stderr)); process.exit(1); }
  console.log("done", name);
}
rmSync(tmp, { recursive: true, force: true });
