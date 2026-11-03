// تجربة حلقات على النظام الحقيقي بلا صوت وبلا تصدير (لا تستهلك رصيد ElevenLabs): تكشف أي خطوة لا تعمل.
// usage: npm run dryrun -- <series> [1-5,8]
// تنبيه: تنفّذ الخطوات فعلًا فتُنشئ سجلات اختبار في Jawab، تمامًا كما يفعل الإنتاج.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compile, lintEpisode, loadConfig, loadEpisodes, loadSeries } from "./queue/plan.js";

try { process.loadEnvFile(); } catch {}
const [seriesId, sel] = process.argv.slice(2);
if (!seriesId) { console.error("usage: npm run dryrun -- <series> [1-5,8]"); process.exit(1); }
const want = sel ? sel.split(",").flatMap((p) => { const [a, b] = p.split("-").map(Number); return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; }) : undefined;
const cfg = loadConfig(), series = loadSeries(seriesId), eps = loadEpisodes(seriesId);
const host = new URL(process.env.JAWAB_BASE_URL ?? "http://none").hostname;
if (!cfg.allowedHosts.includes(host)) { console.error(`host ${host} not in allowedHosts`); process.exit(1); }
let failed = 0;
for (const ep of eps.filter((e) => !want || want.includes(e.number))) {
  const { scenario } = compile(series, ep, 0, cfg);
  const errs = lintEpisode(ep, scenario);
  if (errs.length) { console.log(`✗ ${ep.number} ${ep.slug}: lint ${errs.join("; ")}`); failed++; continue; }
  const dir = join("output", scenario.id);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "scenario.json");
  writeFileSync(path, JSON.stringify(scenario, null, 2));
  const t = Date.now();
  const r = spawnSync(process.execPath, [join("node_modules", "tsx", "dist", "cli.mjs"), "src/record.ts", path, "--no-voice"], { encoding: "utf8", timeout: 6 * 60000 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const ok = r.status === 0;
  if (!ok) failed++;
  const why = ok ? "" : "\n     " + out.trim().split("\n").filter((l) => /Error|✗|waiting for|locator|Timeout/.test(l)).slice(0, 4).join("\n     ");
  console.log(`${ok ? "✓" : "✗"} ${String(ep.number).padStart(2)} ${ep.slug} (${((Date.now() - t) / 1000).toFixed(0)}s)${why}`);
}
process.exit(failed ? 1 : 0);
