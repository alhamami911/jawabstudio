// يولّد docs/episodes.md: قائمة مقروءة بكل حلقات كل السلاسل (العنوان، الأهداف، المتطلبات، النتيجة، الحالة). npm run episodes
import { mkdirSync, writeFileSync } from "node:fs";
import { read } from "./queue/store.js";
import { listSeriesIds, loadEpisodes, loadSeries } from "./queue/plan.js";

const jobs = read().jobs;
let md = "# قائمة الحلقات\n\n";
for (const id of listSeriesIds().filter((x) => x !== "selftest")) {
  const s = loadSeries(id), eps = loadEpisodes(id);
  md += `## ${s.title.ar} (${s.title.en})\n\n${s.description}\n\n- التطبيق: ${s.module}\n- الجمهور: ${s.audience}\n- عدد الحلقات: ${eps.length} (~${eps.reduce((a, e) => a + e.estimatedMinutes, 0)} دقيقة)\n\n`;
  md += "| # | الحلقة | الأهداف | الحالة |\n|---|---|---|---|\n";
  for (const e of eps) {
    const j = jobs.filter((x) => x.seriesId === id && x.number === e.number).sort((a, b) => b.version - a.version)[0];
    md += `| ${e.number} | ${e.title.ar}<br>${e.title.en} | ${e.objectives.join(" · ")} | ${j?.status ?? "غير مضافة"} |\n`;
  }
  md += "\n";
  for (const e of eps) md += `### ${e.number}. ${e.title.ar}\n\n- المتطلبات: ${e.prerequisites.join("، ") || "لا يوجد"}\n- النتيجة المتوقعة: ${e.expected}\n\n`;
}
mkdirSync("docs", { recursive: true });
writeFileSync("docs/episodes.md", md);
console.log("docs/episodes.md written");
