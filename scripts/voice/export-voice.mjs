// يحفظ نسخة محلية من كل ما يمكن تصديره عن صوت ElevenLabs: بياناته وإعداداته والعيّنات الأصلية التي استُنسخ منها (إن أتاحها الحساب).
// الغرض: ألا يضيع الصوت إن انتهى الاشتراك، فيمكن استنساخه لاحقًا بأداة أخرى. usage: npm run voice:export
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
process.loadEnvFile();
const key = process.env.ELEVENLABS_API_KEY, id = process.env.ELEVENLABS_VOICE_ID;
if (!key || !id) { console.error("ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID missing in .env"); process.exit(1); }
const get = (path) => fetch(`https://api.elevenlabs.io${path}`, { headers: { "xi-api-key": key } });
const dir = join("assets", "voice", id);
mkdirSync(dir, { recursive: true });
const r = await get(`/v1/voices/${id}`);
if (!r.ok) { console.error(`voice lookup failed: ${r.status} ${(await r.text()).slice(0, 200)}`); process.exit(1); }
const voice = await r.json();
const s = await get(`/v1/voices/${id}/settings`); // الإعدادات الفعلية
const settings = s.ok ? await s.json() : null;
writeFileSync(join(dir, "voice.json"), JSON.stringify({ exportedAt: new Date().toISOString(), voice_id: id, name: voice.name, category: voice.category, description: voice.description, labels: voice.labels, settings: settings ?? voice.settings, model_used_in_project: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2", samples: (voice.samples ?? []).map((x) => ({ sample_id: x.sample_id, file_name: x.file_name, mime_type: x.mime_type, size_bytes: x.size_bytes, hash: x.hash })) }, null, 2));
console.log(`voice: ${voice.name} (${voice.category}), ${voice.samples?.length ?? 0} sample(s) listed`);
let saved = 0;
for (const x of voice.samples ?? []) {
  const a = await get(`/v1/voices/${id}/samples/${x.sample_id}/audio`);
  if (!a.ok) { console.log(`  sample ${x.sample_id}: not downloadable (${a.status})`); continue; }
  const name = (x.file_name || x.sample_id).replace(/[^\w.\-]+/g, "_");
  writeFileSync(join(dir, name), Buffer.from(await a.arrayBuffer()));
  saved++; console.log(`  saved ${name} (${x.size_bytes} bytes)`);
}
console.log(saved ? `Done → ${dir} (${saved} sample file(s))` : `No sample audio could be downloaded; metadata saved in ${dir}/voice.json. Keep your original recordings used for cloning.`);
