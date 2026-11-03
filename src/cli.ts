// سطر الأوامر: npm run queue -- <أمر>
//   plan:check                     فحص كل السلاسل والحلقات (سلامة، قوائم موجودة فعلًا في Jawab، ترقيم)
//   add <series> [--eps 1-5,8] [--regenerate]   إضافة حلقات إلى الطابور
//   status                         حالة الطابور
//   pause|resume|cancel|retry <series|jobId>    على سلسلة أو حلقة
//   pause-all | resume-all         إيقاف/استئناف الطابور كله
//   start [--watch]                تشغيل العامل في الخلفية (يستمر بعد إغلاق VS Code)
//   dash                           تشغيل لوحة المتابعة في الخلفية بلا نافذة
import { existsSync, readFileSync } from "node:fs";
import { enqueueSeries, jobAction, queuePause, queueResume, seriesAction, summary } from "./queue/ops.js";
import { compile, expandSteps, lintEpisode, listSeriesIds, loadConfig, loadEpisodes, loadSeries, type PlanStep } from "./queue/plan.js";
import { startDashboard, startWorker } from "./queue/launch.js";
import { read } from "./queue/store.js";

try { process.loadEnvFile(); } catch {}
const [cmd, arg, ...rest] = process.argv.slice(2);
const flag = (n: string) => rest.includes(n) || arg === n;
const val = (n: string) => { const i = [arg, ...rest].indexOf(n); return i >= 0 ? [arg, ...rest][i + 1] : undefined; };

const parseEps = (s?: string) => s ? s.split(",").flatMap((p) => { const [a, b] = p.split("-").map(Number); return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; }) : undefined;

function planCheck(): number {
  const cfg = loadConfig();
  const catalog = existsSync("catalog/menus.json") ? JSON.parse(readFileSync("catalog/menus.json", "utf8")) : undefined;
  if (!catalog) console.log("! catalog/menus.json missing: run  npm run discover  (menu names cannot be checked against the real system)");
  let bad = 0;
  for (const id of listSeriesIds()) {
    const series = loadSeries(id), eps = loadEpisodes(id);
    const appNamed = (n: string) => catalog?.apps.find((a: { name: string }) => a.name === n);
    const namesOf = (a: { menus: { path: string }[] } | undefined) => new Set<string>(a ? a.menus.map((m) => m.path.split(" > ").at(-1)!) : []);
    if (catalog && !appNamed(series.module)) { console.log(`✗ ${id}: module "${series.module}" is not an installed Jawab app`); bad++; }
    console.log(`\n${id}: ${series.title.ar}  (${eps.length} episodes, ~${eps.reduce((a, e) => a + e.estimatedMinutes, 0)} min)`);
    eps.forEach((e, i) => {
      const errs: string[] = [];
      if (e.number !== i + 1) errs.push(`numbering gap: expected ${i + 1}, found ${e.number}`);
      let cur = series.module; // التطبيق الحالي: يتغير عند خطوة {app}
      for (const st of e.steps as PlanStep[]) {
        const s = st as { nav?: string[]; app?: string };
        if (s.app) { cur = s.app; if (catalog && !appNamed(cur)) errs.push(`app "${cur}" is not installed`); }
        if (s.nav && catalog && appNamed(cur)) { const last = s.nav.at(-1)!; if (!namesOf(appNamed(cur)).has(last)) errs.push(`menu "${last}" does not exist in ${cur}`); }
      }
      try { errs.push(...lintEpisode(e, compile(series, e, 1, cfg).scenario)); } catch (x) { errs.push(String((x as Error).message)); }
      void expandSteps;
      console.log(`  ${errs.length ? "✗" : "✓"} ${String(e.number).padStart(2)}. ${e.title.ar}${errs.length ? "\n      " + errs.join("\n      ") : ""}`);
      if (errs.length) bad++;
    });
  }
  console.log(bad ? `\n${bad} problem(s)` : "\nall plans OK");
  return bad ? 1 : 0;
}

function status() {
  const s = summary();
  console.log(`queue: ${s.paused ? "PAUSED (" + s.pausedReason + ")" : "active"} | worker: ${s.workerAlive ? "running pid " + s.worker?.pid : "not running"}${s.avgEpisodeMin ? " | avg " + s.avgEpisodeMin + " min/episode" : ""}`);
  for (const x of s.series.filter((x) => x.total)) console.log(`\n${x.id}: ${x.progress}% | completed ${x.completed}, running ${x.running}, queued ${x.queued}, paused ${x.paused}, failed ${x.failed}, skipped ${x.skipped}${x.etaMin ? " | ~" + x.etaMin + " min left" : ""}`);
  for (const j of s.jobs.sort((a, b) => a.position - b.position)) console.log(`  #${String(j.position).padStart(3)} ${j.id.padEnd(34)} ${j.status.padEnd(10)} ${j.stage ?? ""}${j.error ? "  ! " + j.error.slice(0, 90) : ""}${j.skipReason ? "  (" + j.skipReason + ")" : ""}`);
}

const isJob = (x: string) => read().jobs.some((j) => j.id === x);
switch (cmd) {
  case "plan:check": process.exit(planCheck()); break;
  case "add": {
    const r = enqueueSeries(arg!, { episodes: parseEps(val("--eps")), regenerate: flag("--regenerate") });
    console.log(`added ${r.added.length}: ${r.added.join(", ")}`);
    for (const s of r.skipped) console.log(`skipped ${s.id}: ${s.reason}`);
    break;
  }
  case "status": status(); break;
  case "pause": case "resume": case "cancel": case "retry":
    console.log(isJob(arg!) ? jobAction(arg!, cmd) : seriesAction(arg!, cmd)); break;
  case "pause-all": queuePause(); console.log("queue paused"); break;
  case "resume-all": queueResume(); console.log("queue resumed"); break;
  case "start": console.log(startWorker(flag("--watch"))); break;
  case "dash": console.log(startDashboard()); break;
  default: console.log(readFileSync(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), "utf8").split("\n").filter((l) => l.startsWith("//")).join("\n"));
}
