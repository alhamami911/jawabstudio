// يحذف ملفات الفيديو السابقة (مخرجات التسجيل والمكتبة ومجلدات العرض على سطح المكتب) ويُبقي إصدارات الحلقات المذكورة في KEEP فقط.
// الافتراضي عرض فقط. usage: node scripts/ops/clean-old-videos.mjs [--apply]
// لا يمسّ: data/ (سجل الطابور)، assets/ (الصوتان والشعار والموسيقى)، ملفات الصوت المخزنة للإصدارات المُبقاة، مجلد Voice Test.
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const apply = process.argv.includes("--apply");
const KEEP_OUTPUT = new Set(["accounting-basics-e01-v12", "accounting-basics-e01-v12-vertical", "accounting-basics-e02-v14", "accounting-basics-e02-v14-vertical"]);
const KEEP_LIBRARY = new Set(["accounting-basics/ep-01/v12", "accounting-basics/ep-02/v14"]);
const DESKTOP = join(homedir(), "Desktop");
const DESKTOP_DIRS = ["Jawab Episodes", "Jawab Sample Final", "Jawab Sample Pro", "Jawab Sample v3", "Jawab Language Episode", "JAWAB Episodes 1-5"];

const size = (p) => { let t = 0; const w = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); e.isDirectory() ? w(f) : (t += statSync(f).size); } }; statSync(p).isDirectory() ? w(p) : (t += statSync(p).size); return t; };
const mb = (n) => (n / 1048576).toFixed(0) + " MB";
const targets = [];

// 1) output/
if (existsSync("output")) for (const d of readdirSync("output")) if (!KEEP_OUTPUT.has(d)) targets.push(join("output", d));
// 2) library/<series>/ep-NN/vN
const libVersions = [];
if (existsSync("library")) for (const s of readdirSync("library", { withFileTypes: true }).filter((e) => e.isDirectory())) for (const ep of readdirSync(join("library", s.name))) for (const v of readdirSync(join("library", s.name, ep))) {
  const rel = `${s.name}/${ep}/${v}`;
  libVersions.push(rel);
  if (!KEEP_LIBRARY.has(rel)) targets.push(join("library", s.name, ep, v));
}
// 3) سطح المكتب
for (const d of DESKTOP_DIRS) if (existsSync(join(DESKTOP, d))) targets.push(join(DESKTOP, d));

let total = 0;
for (const t of targets) total += size(t);
console.log(`${targets.length} folders, ${mb(total)} ${apply ? "(deleting)" : "(dry-run, nothing deleted)"}`);
console.log("kept output:", [...KEEP_OUTPUT].filter((d) => existsSync(join("output", d))).join(", "));
console.log("kept library:", libVersions.filter((r) => KEEP_LIBRARY.has(r)).join(", "));
for (const t of targets.filter((x) => x.startsWith(DESKTOP))) console.log("  desktop:", t);
console.log(`  output: ${targets.filter((x) => x.startsWith("output")).length}, library versions: ${targets.filter((x) => x.startsWith("library")).length}`);

if (apply) {
  for (const t of targets) rmSync(t, { recursive: true, force: true });
  // مجلدات المكتبة الفارغة بعد الحذف، ثم فهرس المكتبة يبقى فيه المُبقى فقط
  if (existsSync("library")) for (const s of readdirSync("library", { withFileTypes: true }).filter((e) => e.isDirectory())) {
    for (const ep of readdirSync(join("library", s.name))) if (!readdirSync(join("library", s.name, ep)).length) rmSync(join("library", s.name, ep), { recursive: true });
    if (!readdirSync(join("library", s.name)).length) rmSync(join("library", s.name), { recursive: true });
  }
  const idxPath = join("library", "index.json");
  if (existsSync(idxPath)) {
    const idx = JSON.parse(readFileSync(idxPath, "utf8"));
    for (const [sid, s] of Object.entries(idx.series ?? {})) {
      for (const [en, ep] of Object.entries(s.episodes ?? {})) {
        ep.versions = ep.versions.filter((v) => KEEP_LIBRARY.has(String(v.path).replace(/^library\//, "").replace(/\/[^/]+$/, "")));
        if (!ep.versions.length) delete s.episodes[en]; else ep.latest = Math.max(...ep.versions.map((v) => v.version));
      }
      if (!Object.keys(s.episodes ?? {}).length) delete idx.series[sid];
    }
    writeFileSync(idxPath, JSON.stringify(idx, null, 2));
  }
  console.log("done");
}
