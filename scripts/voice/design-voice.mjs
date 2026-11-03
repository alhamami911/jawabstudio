// ينشئ صوتًا جديدًا في ElevenLabs من وصف نصي (Voice Design) — لا يستنسخ شخصًا حقيقيًا.
// الخطوة 1: npm run voice:design                      -> يولّد معاينات في output/voice-design/ للاستماع
// الخطوة 2: npm run voice:design -- --create 2 "اسم"  -> يحفظ المعاينة رقم 2 صوتًا في حسابك ويطبع voice_id
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

process.loadEnvFile();
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error("set ELEVENLABS_API_KEY in .env first"); process.exit(1); }

const API = "https://api.elevenlabs.io/v1";
const dir = join("output", "voice-design");
const stateFile = join(dir, "previews.json");
mkdirSync(dir, { recursive: true });

const DESCRIPTION =
  "A calm, warm adult male voice speaking Arabic with a natural Saudi Arabian (Gulf, Najdi) accent. " +
  "Slow, clear and gentle, with an encouraging teacher tone, ideal for educational software tutorials. " +
  "Studio quality, no background noise.";

// نص المعاينة بالعامية السعودية (100-1000 حرف)
const SAMPLE_TEXT =
  "حيّاكم الله! اليوم بنتعلّم مع بعض كيف نجهّز شجرة الحسابات في جواب. الموضوع أسهل مما تتخيّل، تابعوا معي خطوة خطوة. " +
  "أول شي، من الشاشة الرئيسية ندخل على تطبيق المحاسبة، وبعدها نختار شجرة الحسابات. لا تشيلون هم، بنتعوّد عليها بسرعة.";

async function call(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const e = new Error(`ElevenLabs ${res.status}: ${text.slice(0, 400)}`);
    e.status = res.status;
    throw e;
  }
  return JSON.parse(text);
}

const createIdx = process.argv.indexOf("--create");
if (createIdx === -1) {
  // ---- الخطوة 1: معاينات ----
  let data;
  try {
    data = await call("/text-to-voice/design", { voice_description: DESCRIPTION, text: SAMPLE_TEXT, model_id: "eleven_multilingual_ttv_v2" });
  } catch (e) {
    if (e.status !== 404) { console.error(e.message); process.exit(1); }
    // واجهة قديمة
    data = await call("/text-to-voice/create-previews", { voice_description: DESCRIPTION, text: SAMPLE_TEXT });
  }
  const previews = data.previews ?? [];
  if (!previews.length) { console.error("no previews returned"); process.exit(1); }
  previews.forEach((p, i) => writeFileSync(join(dir, `preview-${i + 1}.mp3`), Buffer.from(p.audio_base_64, "base64")));
  writeFileSync(stateFile, JSON.stringify(previews.map((p) => p.generated_voice_id), null, 2));
  console.log(`${previews.length} previews saved in ${dir}/ (preview-1.mp3 ...). Listen, then:`);
  console.log(`  npm run voice:design -- --create <number> "Jawab Saudi"`);
} else {
  // ---- الخطوة 2: حفظ المعاينة المختارة صوتًا دائمًا ----
  const n = Number(process.argv[createIdx + 1]);
  const name = process.argv[createIdx + 2] ?? "Jawab Saudi Teacher";
  const ids = JSON.parse(readFileSync(stateFile, "utf8"));
  if (!n || !ids[n - 1]) { console.error(`pick a preview number 1-${ids.length}`); process.exit(1); }
  let voice;
  try {
    voice = await call("/text-to-voice", { voice_name: name, voice_description: DESCRIPTION, generated_voice_id: ids[n - 1] });
  } catch (e) {
    if (e.status !== 404) { console.error(e.message); process.exit(1); }
    voice = await call("/text-to-voice/create-voice-from-preview", { voice_name: name, voice_description: DESCRIPTION, generated_voice_id: ids[n - 1] });
  }
  console.log(`Created voice "${name}"`);
  console.log(`voice_id: ${voice.voice_id}`);
  console.log("\nضعه في .env: ELEVENLABS_VOICE_ID=" + voice.voice_id);
}
