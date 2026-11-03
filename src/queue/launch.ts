// تشغيل العامل كعملية مستقلة منفصلة عن الطرفية وVS Code وجلسة Claude، فيستمر بعد إغلاقها.
import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { read, workerAlive } from "./store.js";

export function startWorker(watch = false): string {
  if (workerAlive(read())) return "worker already running";
  mkdirSync("data", { recursive: true });
  const out = openSync(join("data", "worker.log"), "a");
  const p = spawn(process.execPath, [join("node_modules", "tsx", "dist", "cli.mjs"), join("src", "queue", "worker.ts"), ...(watch ? ["--watch"] : [])], {
    cwd: process.cwd(), detached: true, stdio: ["ignore", out, out], windowsHide: true,
  });
  p.unref();
  return `worker started (pid ${p.pid}), log: data/worker.log`;
}

// لوحة المتابعة كعملية خفية مستقلة (بلا نافذة طرفية). تُرجع الرابط.
export function startDashboard(port = 4173): string {
  mkdirSync("data", { recursive: true });
  const out = openSync(join("data", "dashboard.log"), "a");
  const p = spawn(process.execPath, [join("node_modules", "tsx", "dist", "cli.mjs"), join("src", "dashboard.ts")], {
    cwd: process.cwd(), detached: true, stdio: ["ignore", out, out], windowsHide: true,
  });
  p.unref();
  return `dashboard started (pid ${p.pid}): http://127.0.0.1:${port}`;
}
