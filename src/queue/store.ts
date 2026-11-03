// حالة الإنتاج الدائمة: ملف واحد data/queue.json يُقرأ ويُكتب من العامل ولوحة المتابعة وسطر الأوامر.
// كل تعديل = قراءة + تعديل + كتابة ذرية تحت قفل ملفي، فلا تضيع الحالة عند إغلاق VS Code أو توقف Claude أو إعادة التشغيل.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

export const STATUSES = ["Queued", "Preparing", "Recording", "Processing", "Validating", "Completed", "Failed", "Paused", "Skipped"] as const;
export type Status = (typeof STATUSES)[number];
export const STAGES = ["prepare", "record", "process", "vrecord", "vprocess", "validate", "publish"] as const;
export type Stage = (typeof STAGES)[number];

// حالات تعني أن العامل يعمل على الحلقة الآن
export const ACTIVE: Status[] = ["Preparing", "Recording", "Processing", "Validating"];
export const TERMINAL: Status[] = ["Completed", "Failed", "Skipped"];

export interface HistoryEntry { ts: string; stage?: Stage; event: string; detail?: string }

export interface Job {
  id: string; // <series>-eNN-vK ويطابق مجلد output/<id>
  seriesId: string;
  number: number;
  version: number;
  title: string;
  position: number; // ترتيب الطابور (الأصغر أولًا)
  status: Status;
  stage?: Stage; // المرحلة الجارية أو التي فشلت
  pausedFrom?: Status; // الحالة التي يعود إليها عند الاستئناف
  notBefore?: string; // لا يُلتقط قبل هذا الوقت (انتظار بين محاولات إعادة التسجيل، والطابور يتابع حلقات أخرى)
  pauseRequested?: boolean;
  cancelRequested?: boolean;
  dependsOn: number[]; // أرقام حلقات يجب أن تكتمل قبلها
  attempts: Partial<Record<Stage, number>>;
  checkpoints: Partial<Record<Stage, boolean>>; // مراحل أُنجزت ويمكن البناء عليها عند الاستئناف
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  productionMs?: number; // مجموع زمن العمل الفعلي
  videoSec?: number;
  outputPath?: string; // الفيديو النهائي في المكتبة (نسبيًا)
  error?: string;
  skipReason?: string;
  history: HistoryEntry[];
}

export interface QueueState {
  schema: 1;
  paused: boolean; // إيقاف الطابور كله
  pausedReason?: string;
  seriesPaused: Record<string, boolean>;
  jobs: Job[];
  nextPosition: number;
  worker?: { pid: number; heartbeat: string; startedAt: string; watch: boolean };
}

const DIR = "data";
const FILE = join(DIR, "queue.json");
const LOCK = join(DIR, "queue.lock");

const empty = (): QueueState => ({ schema: 1, paused: false, seriesPaused: {}, jobs: [], nextPosition: 1 });

const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function readRaw(): QueueState {
  mkdirSync(DIR, { recursive: true });
  for (const f of [FILE, FILE + ".bak"]) {
    if (!existsSync(f)) continue;
    for (let k = 0; k < 5; k++) {
      try { return JSON.parse(readFileSync(f, "utf8")) as QueueState; } catch { sleepSync(40); /* قراءة متزامنة مع كتابة، أو ملف تالف: أعد ثم جرّب النسخة الاحتياطية */ }
    }
  }
  return empty();
}

export const read = readRaw;

function withLock<T>(fn: () => T): T {
  mkdirSync(DIR, { recursive: true });
  const t0 = Date.now();
  for (;;) {
    try { mkdirSync(LOCK); break; } catch {
      // قفل عالق من عملية ماتت: يُزال بعد 15 ثانية
      try { if (Date.now() - statSync(LOCK).mtimeMs > 15000) rmSync(LOCK, { recursive: true, force: true }); } catch {}
      if (Date.now() - t0 > 20000) throw new Error("queue lock timeout");
      sleepSync(25);
    }
  }
  try { return fn(); } finally { rmSync(LOCK, { recursive: true, force: true }); }
}

export function update<T>(fn: (s: QueueState) => T): T {
  return withLock(() => {
    const s = readRaw();
    const out = fn(s);
    const tmp = FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify(s, null, 2));
    if (existsSync(FILE)) copyFileSync(FILE, FILE + ".bak");
    // ويندوز يرفض الاستبدال (EPERM/EBUSY) لحظة قراءة الملف من عملية أخرى (لوحة، سطر أوامر، مضاد فيروسات): نعيد المحاولة
    for (let k = 0; ; k++) {
      try { renameSync(tmp, FILE); break; } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (k >= 40 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw e;
        sleepSync(40 + k * 10);
      }
    }
    return out;
  });
}

export const now = () => new Date().toISOString();

export function log(job: Job, event: string, detail?: string, stage?: Stage) {
  job.history.push({ ts: now(), stage, event, detail: detail?.slice(0, 600) });
  if (job.history.length > 300) job.history.splice(0, job.history.length - 300);
}

export const jobById = (s: QueueState, id: string) => s.jobs.find((j) => j.id === id);

export function workerAlive(s: QueueState): boolean {
  if (!s.worker) return false;
  try { process.kill(s.worker.pid, 0); } catch { return false; }
  return Date.now() - Date.parse(s.worker.heartbeat) < 60000;
}
