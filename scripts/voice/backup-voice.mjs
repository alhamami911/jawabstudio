// نسخة احتياطية من صوت المقدّم قبل انتهاء اشتراك ElevenLabs: مجلد voice-backup/ فيه
//   clips/   مقاطع كل حلقة (أحدث نسخة) بأسماء <series>-eNN-<الملف الأصلي>.mp3
//   dataset.csv   مقطع، نص مشكَّل إن وُجد وإلا النص المعروض (لتدريب أو استنساخ صوت لاحقًا)
//   voice.json    معرّف الصوت والنموذج والإعدادات (لا يحوي أي مفتاح)
// لا يحذف شيئًا ولا يكتب في المكتبة. usage: node scripts/voice/backup-voice.mjs
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
process.loadEnvFile();
const out = "voice-backup", clips = join(out, "clips");
mkdirSync(clips, { recursive: true });
const csv = ["file,text"];
const q = (t) => `"${String(t).replace(/"/g, '""').replace(/\s+/g, " ").trim()}"`;
let n = 0, bytes = 0;
for (const sid of readdirSync("library", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  for (const ep of readdirSync(join("library", sid)).filter((x) => /^ep-\d+$/.test(x))) {
    const vs = readdirSync(join("library", sid, ep)).filter((v) => /^v\d+$/.test(v) && existsSync(join("library", sid, ep, v, "audio"))).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
    if (!vs.length) continue;
    const dir = join("library", sid, ep, vs[0]);
    let texts = {};
    try {
      const ev = JSON.parse(readFileSync(join(dir, "events.json"), "utf8"));
      const sc = JSON.parse(readFileSync(join(dir, "scenario.json"), "utf8"));
      texts["00-intro.mp3"] = sc.intro;
      ev.events.forEach((e, i) => { texts[`${String(i + 1).padStart(2, "0")}-step.mp3`] = e.narration; });
      const last = readdirSync(join(dir, "audio")).find((f) => /outro/.test(f)); if (last) texts[last] = sc.outro;
    } catch {}
    for (const f of readdirSync(join(dir, "audio")).filter((x) => x.endsWith(".mp3"))) {
      const name = `${sid}-${ep.replace("ep-", "e")}-${f}`;
      copyFileSync(join(dir, "audio", f), join(clips, name));
      bytes += statSync(join(dir, "audio", f)).size; n++;
      csv.push(`${name},${q(texts[f] ?? "")}`);
    }
  }
}
writeFileSync(join(out, "dataset.csv"), "﻿" + csv.join("\n"));
writeFileSync(join(out, "voice.json"), JSON.stringify({
  provider: "ElevenLabs", voiceId: process.env.ELEVENLABS_VOICE_ID, model: process.env.ELEVENLABS_MODEL ?? "(default in src/tts.ts)",
  settings: { stability: 0.85, similarity_boost: 0.8, style: 0, use_speaker_boost: true },
  note: "المقاطع المحفوظة هي ما بقي من الصوت بعد انتهاء الاشتراك؛ توليد جمل جديدة بنفس الصوت يحتاج حساب ElevenLabs أو نموذج استنساخ مدرَّب على هذه المقاطع.",
  savedAt: new Date().toISOString(),
}, null, 2));
console.log(`saved ${n} clips (${(bytes / 1048576).toFixed(1)} MB) -> ${out}`);
