// يعرض أصوات ElevenLabs المتاحة في حسابك، ويبرز العربية منها، مع رابط للاستماع.
// usage: npm run voices            (أصواتك: الافتراضية والمضافة)
//        npm run voices -- --library   (مكتبة الأصوات العربية العامة)
import process from "node:process";
process.loadEnvFile();
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error("set ELEVENLABS_API_KEY in .env first"); process.exit(1); }

const library = process.argv.includes("--library");
const url = library
  ? "https://api.elevenlabs.io/v1/shared-voices?language=ar&page_size=30"
  : "https://api.elevenlabs.io/v1/voices";
const res = await fetch(url, { headers: { "xi-api-key": key } });
if (!res.ok) { console.error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
const data = await res.json();
const voices = data.voices ?? [];

const isArabic = (v) =>
  v.language === "ar" ||
  v.labels?.language === "ar" ||
  (v.verified_languages ?? []).some((l) => l.language === "ar");

const rows = voices.map((v) => ({
  arabic: isArabic(v) ? "AR" : "",
  name: v.name,
  voice_id: v.voice_id,
  gender: v.labels?.gender ?? v.gender ?? "",
  accent: v.labels?.accent ?? v.accent ?? "",
  preview: v.preview_url ?? "",
}));
rows.sort((a, b) => b.arabic.localeCompare(a.arabic));
console.table(rows.map(({ preview, ...r }) => r));
console.log("\nروابط الاستماع (AR فقط):");
for (const r of rows.filter((r) => r.arabic && r.preview)) console.log(`${r.name}: ${r.preview}`);
console.log("\nاختر voice_id وضعه في .env: ELEVENLABS_VOICE_ID=...");
