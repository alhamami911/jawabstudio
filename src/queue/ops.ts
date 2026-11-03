// عمليات الطابور: تُستعمل من سطر الأوامر ولوحة المتابعة والعامل، وكلها تمر عبر update() فتبقى الحالة متسقة.
import { ACTIVE, TERMINAL, log, now, update, read, workerAlive, type Job, type QueueState } from "./store.js";
import { jobId, loadEpisodes, loadSeries, listSeriesIds } from "./plan.js";

const newJob = (s: QueueState, seriesId: string, number: number, version: number, title: string, dependsOn: number[]): Job => ({
  id: jobId(seriesId, number, version),
  seriesId, number, version, title,
  position: s.nextPosition++,
  status: "Queued",
  dependsOn,
  attempts: {}, checkpoints: {},
  createdAt: now(),
  history: [{ ts: now(), event: "queued" }],
});

const latestOf = (s: QueueState, seriesId: string, n: number) =>
  s.jobs.filter((j) => j.seriesId === seriesId && j.number === n).sort((a, b) => b.version - a.version)[0];

export interface EnqueueResult { added: string[]; skipped: { id: string; reason: string }[] }

// regenerate: إنتاج نسخة جديدة (v+1) من حلقة مكتملة دون المساس بالنسخة القديمة
export function enqueueSeries(seriesId: string, opts: { episodes?: number[]; regenerate?: boolean } = {}): EnqueueResult {
  const series = loadSeries(seriesId); // يفشل بوضوح إن لم توجد السلسلة
  const eps = loadEpisodes(seriesId).filter((e) => !opts.episodes || opts.episodes.includes(e.number));
  return update((s) => {
    const res: EnqueueResult = { added: [], skipped: [] };
    for (const ep of eps) {
      const cur = latestOf(s, series.id, ep.number);
      const title = ep.title.ar;
      if (!cur) { const j = newJob(s, series.id, ep.number, 1, title, ep.dependsOn ?? []); s.jobs.push(j); res.added.push(j.id); continue; }
      if (!TERMINAL.includes(cur.status)) { res.skipped.push({ id: cur.id, reason: `already ${cur.status}` }); continue; }
      if (cur.status === "Completed") {
        if (!opts.regenerate) { res.skipped.push({ id: cur.id, reason: "already completed (use regenerate)" }); continue; }
        const j = newJob(s, series.id, ep.number, cur.version + 1, title, ep.dependsOn ?? []);
        s.jobs.push(j); res.added.push(j.id); continue;
      }
      // Failed / Skipped: يعاد تشغيل نفس المحاولة من الصفر (النسخة نفسها لم تكتمل أصلًا)
      resetJob(cur, "re-queued");
      cur.position = s.nextPosition++;
      res.added.push(cur.id);
    }
    return res;
  });
}

function resetJob(j: Job, event: string) {
  j.status = "Queued"; j.stage = undefined; j.error = undefined; j.skipReason = undefined;
  j.attempts = {}; j.checkpoints = {}; j.pausedFrom = undefined; j.pauseRequested = false; j.cancelRequested = false;
  j.notBefore = undefined; j.finishedAt = undefined;
  log(j, event);
}

type JobAction = "pause" | "resume" | "cancel" | "retry";
export function jobAction(id: string, action: JobAction): string {
  return update((s) => {
    const j = s.jobs.find((x) => x.id === id);
    if (!j) throw new Error(`no such job: ${id}`);
    return applyAction(j, action);
  });
}

function applyAction(j: Job, action: JobAction): string {
  switch (action) {
    case "pause":
      if (j.status === "Queued") { j.pausedFrom = "Queued"; j.status = "Paused"; log(j, "paused"); return "paused"; }
      if (ACTIVE.includes(j.status)) { j.pauseRequested = true; log(j, "pause requested (takes effect at the next stage boundary)"); return "pause requested"; }
      return `cannot pause a ${j.status} episode`;
    case "resume":
      if (j.status === "Paused") { j.status = j.pausedFrom ?? "Queued"; j.pausedFrom = undefined; j.pauseRequested = false; log(j, "resumed"); return "resumed"; }
      j.pauseRequested = false;
      return "nothing to resume";
    case "cancel":
      if (j.status === "Queued" || j.status === "Paused") { j.status = "Skipped"; j.skipReason = "canceled by user"; j.finishedAt = now(); log(j, "canceled"); return "canceled"; }
      if (ACTIVE.includes(j.status)) { j.cancelRequested = true; log(j, "cancel requested"); return "cancel requested"; }
      return `cannot cancel a ${j.status} episode`;
    case "retry":
      if (j.status === "Failed" || j.status === "Skipped") { resetJob(j, "manual retry"); return "re-queued"; }
      return `cannot retry a ${j.status} episode`;
  }
}

export function seriesAction(seriesId: string, action: JobAction): string {
  return update((s) => {
    const mine = s.jobs.filter((j) => j.seriesId === seriesId);
    if (!mine.length) throw new Error(`series ${seriesId} has no jobs in the queue`);
    // لا نمس الحلقات المكتملة؛ كل نسخة قديمة غير نهائية فقط
    const latest = mine.filter((j) => latestOf(s, seriesId, j.number) === j);
    let n = 0;
    for (const j of latest) {
      if (action === "retry" && j.status !== "Failed" && j.status !== "Skipped") continue;
      if (action === "resume" && j.status !== "Paused") continue;
      if ((action === "pause" || action === "cancel") && TERMINAL.includes(j.status)) continue;
      applyAction(j, action); n++;
    }
    s.seriesPaused[seriesId] = action === "pause" ? true : action === "resume" ? false : s.seriesPaused[seriesId] ?? false;
    return `${action}: ${n} episodes`;
  });
}

export function queuePause(reason?: string) { update((s) => { s.paused = true; s.pausedReason = reason ?? "paused by user"; }); }
export function queueResume() { update((s) => { s.paused = false; s.pausedReason = undefined; }); }

// استعادة بعد انقطاع: حلقات كانت قيد العمل عند توقف العامل تعود للطابور من آخر نقطة محفوظة ولا تُحتسب محاولة
export function recoverInterrupted(): string[] {
  return update((s) => {
    const out: string[] = [];
    for (const j of s.jobs) {
      if (!ACTIVE.includes(j.status)) continue;
      if (j.stage && j.attempts[j.stage]) j.attempts[j.stage]! -= 1;
      log(j, `interrupted while ${j.status}; resuming from last checkpoint`, undefined, j.stage);
      j.status = j.cancelRequested ? "Skipped" : "Queued";
      if (j.cancelRequested) { j.skipReason = "canceled by user"; j.finishedAt = now(); }
      j.pauseRequested = false;
      out.push(j.id);
    }
    return out;
  });
}

// ---------- ملخص للوحة المتابعة وسطر الأوامر ----------
export function summary() {
  const s = read();
  const done = s.jobs.filter((j) => j.status === "Completed" && j.productionMs);
  const avgMs = done.length ? done.reduce((a, j) => a + (j.productionMs ?? 0), 0) / done.length : 0;
  const ids = new Set([...listSeriesIds(), ...s.jobs.map((j) => j.seriesId)]);
  const series = [...ids].map((id) => {
    let def; try { def = loadSeries(id); } catch { def = undefined; }
    const planned = (() => { try { return loadEpisodes(id); } catch { return []; } })();
    const mine = s.jobs.filter((j) => j.seriesId === id).filter((j) => latestOf(s, id, j.number) === j);
    const count = (st: string) => mine.filter((j) => j.status === st).length;
    const running = mine.filter((j) => ACTIVE.includes(j.status)).length;
    const remaining = mine.filter((j) => !TERMINAL.includes(j.status)).length;
    return {
      id, def, plannedEpisodes: planned.length,
      plannedMinutes: planned.reduce((a, e) => a + (e.estimatedMinutes ?? 0), 0),
      queued: count("Queued"), running, completed: count("Completed"), failed: count("Failed"), paused: count("Paused"), skipped: count("Skipped"),
      total: mine.length, progress: mine.length ? Math.round((mine.filter((j) => TERMINAL.includes(j.status)).length / mine.length) * 100) : 0,
      etaMin: avgMs && remaining ? Math.round((avgMs * remaining) / 60000) : undefined,
    };
  });
  return { paused: s.paused, pausedReason: s.pausedReason, workerAlive: workerAlive(s), worker: s.worker, avgEpisodeMin: avgMs ? +(avgMs / 60000).toFixed(1) : undefined, series, jobs: s.jobs };
}
