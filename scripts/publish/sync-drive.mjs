// يملأ مجلد التسليم (JAWAB_DRIVE_DIR، مجلد Google Drive) بأحدث نسخة منتَجة من كل حلقة: ملفان لكل حلقة بالاسم «S01E01 - الموضوع».
// usage: node scripts/publish/sync-drive.mjs [--dry]   (لا يحذف شيئًا؛ يستبدل الملف إن اختلف حجمه)
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
process.loadEnvFile();
const dry = process.argv.includes("--dry");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7); // مثل --only=S01E01 أو --only=S03: يقتصر على الأسماء التي تبدأ بذلك
const prefixOk = (name) => !only || name.startsWith(only);
const root = process.env.JAWAB_DRIVE_DIR;
if (!root) { console.error("set JAWAB_DRIVE_DIR in .env"); process.exit(1); }
if (!dry) mkdirSync(root, { recursive: true });
const clean = (t) => t.replace(/[\/:*?"<>|]/g, " ").replace(/\s{2,}/g, " ").trim();
let copied = 0, same = 0;
for (const sid of readdirSync("series", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const sj = join("series", sid, "series.json"); if (!existsSync(sj)) continue;
  const series = JSON.parse(readFileSync(sj, "utf8"));
  for (const f of readdirSync(join("series", sid)).filter((x) => /^\d+.*\.json$/.test(x) && x !== "series.json")) {
    const ep = JSON.parse(readFileSync(join("series", sid, f), "utf8"));
    const n = String(ep.number).padStart(2, "0");
    const dir = join("library", sid, `ep-${n}`);
    if (!existsSync(dir)) continue;
    const vs = readdirSync(dir).filter((v) => /^v\d+$/.test(v) && existsSync(join(dir, v, "episode.mp4"))).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
    if (!vs.length) continue;
    const base = `${series.catalogCode ? `${series.catalogCode}E${n}` : n} - ${clean(ep.title.ar)}`;
    for (const [src, name] of [["episode.mp4", `${base}.mp4`], ["reel.mp4", `${base} (عمودي).mp4`]]) {
      const from = join(dir, vs[0], src); if (!existsSync(from) || !prefixOk(name)) continue;
      const to = join(root, name);
      if (existsSync(to) && statSync(to).size === statSync(from).size) { same++; continue; }
      console.log(`${dry ? "would copy" : "copy"} ${vs[0]} -> ${name}`);
      if (!dry) copyFileSync(from, to);
      copied++;
    }
  }
}
console.log(`done: ${copied} copied, ${same} already up to date`);
