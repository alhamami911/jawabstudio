// لوحة متابعة الإنتاج: npm run dashboard  ثم افتح http://127.0.0.1:4173
// خادم محلي بلا مكتبات. يقرأ الحالة من data/queue.json (نفس ما يكتبه العامل)، فالأرقام حقيقية دائمًا وتبقى بعد إعادة التشغيل.
import { createServer } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { enqueueSeries, jobAction, queuePause, queueResume, seriesAction, summary } from "./queue/ops.js";
import { compile, listSeriesIds, loadConfig, loadEpisodes, loadSeries } from "./queue/plan.js";
import { startWorker } from "./queue/launch.js";
import { PAGE } from "./dashboard-page.js";

try { process.loadEnvFile(); } catch {}
const cfg = loadConfig();
const PORT = Number(process.env.DASHBOARD_PORT ?? cfg.dashboardPort);
const HOST = process.env.DASHBOARD_HOST ?? "127.0.0.1"; // الافتراضي: هذا الجهاز فقط. ضع 0.0.0.0 صراحةً للمشاركة على الشبكة (ومعها DASHBOARD_SHARE_PASSWORD)
const ROOTS = ["library", "output"].map((d) => resolve(d) + sep);
const MIME: Record<string, string> = { ".mp4": "video/mp4", ".webm": "video/webm", ".json": "application/json", ".md": "text/plain; charset=utf-8", ".log": "text/plain; charset=utf-8", ".mp3": "audio/mpeg" };

// الزائر يرى المكتمل فقط (للمعاينة)؛ الطابور والعامل والأخطاء والسجلات للمسؤول
function publicState(st: ReturnType<typeof state>) {
  return { paused: false, workerAlive: false, planned: st.planned, jobs: st.jobs.filter((j: any) => j.status === "Completed").map((j: any) => ({ id: j.id, seriesId: j.seriesId, number: j.number, version: j.version, title: j.title, status: j.status, outputPath: j.outputPath, reelPath: j.reelPath, videoSec: j.videoSec })) };
}

function state() {
  const s = summary();
  const planned = Object.fromEntries(listSeriesIds().map((id) => [id, { def: loadSeries(id), episodes: loadEpisodes(id).map((e) => ({ number: e.number, title: e.title, estimatedMinutes: e.estimatedMinutes, objectives: e.objectives, prerequisites: e.prerequisites, expected: e.expected })) }]));
  // الفيديو العمودي (reel.mp4) بجانب الأفقي: يُعرض زر معاينته إن وُجد
  const jobs = s.jobs.map((j) => {
    const reel = j.outputPath?.replace(/episode\.mp4$/, "reel.mp4");
    return reel && reel !== j.outputPath && existsSync(resolve(reel)) ? { ...j, reelPath: reel } : j;
  });
  return { ...s, jobs, planned };
}

// قاموس الحلقات: كل حلقة بأهدافها وخطواتها المعروضة ومصطلحاتها (الإنجليزية بين الأقواس مع مقابلها من معجم السلسلة)
function dictionary() {
  const s = summary();
  return {
    series: listSeriesIds().filter((x) => x !== "selftest").map((id) => {
      const def = loadSeries(id);
      return {
        id, title: def.title, module: def.module,
        episodes: loadEpisodes(id).map((e) => {
          const job = s.jobs.filter((j) => j.seriesId === id && j.number === e.number).sort((a, b) => b.version - a.version)[0];
          const narration = compile(def, e, 1, cfg).scenario.steps.map((x) => x.narration).filter((x): x is string => !!x);
          const terms = [...new Set(narration.flatMap((n) => [...n.matchAll(/\(([A-Za-z][A-Za-z0-9 &/.-]*)\)/g)].map((m) => m[1])))].map((en) => ({ en, ar: def.glossary?.[en] }));
          return { number: e.number, title: e.title, objectives: e.objectives, prerequisites: e.prerequisites, expected: e.expected, estimatedMinutes: e.estimatedMinutes, narration, terms, status: job?.status, video: job?.status === "Completed" ? job.outputPath : undefined };
        }),
      };
    }),
  };
}

// طلبات الإنتاج من المسؤول لأقسام لم تُكتب حلقاتها بعد (data/requests.json): تُحفظ لتُكتب وتُنتَج لاحقًا
const REQ_FILE = "data/requests.json";
const readReqs = (): Record<string, { at: string }> => { try { return JSON.parse(readFileSync(REQ_FILE, "utf8")); } catch { return {}; } };
const writeReqs = (r: Record<string, { at: string }>) => { mkdirSync("data", { recursive: true }); writeFileSync(REQ_FILE, JSON.stringify(r, null, 2)); };

// دخول المسؤول: بيانات الدخول من .env (ADMIN_USER / ADMIN_PASSWORD)، جلسة في الذاكرة بكوكي HttpOnly، وقفل بعد 5 محاولات خاطئة
const sessions = new Map<string, number>();
const fails = new Map<string, { n: number; until: number }>();
const SESSION_MS = 12 * 3600_000;
const digest = (s: string) => createHash("sha256").update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
const cookieOf = (h?: string) => /(?:^|;\s*)adm=([a-f0-9]{64})/.exec(h ?? "")?.[1];
const hasSession = (h?: string) => { const t = cookieOf(h); const exp = t && sessions.get(t); if (!exp) return false; if (exp < Date.now()) { sessions.delete(t!); return false; } return true; };

// الدليل الكامل: يُقرأ من docs/CATALOG.md (الدفعة 1 بحلقاتها، والدفعتان 2 و3 بأقسامهما)، فأي تعديل في الكتالوج يظهر هنا مباشرة
function guide(admin: boolean) {
  const text = existsSync("docs/CATALOG.md") ? readFileSync("docs/CATALOG.md", "utf8") : "";
  type Sec = { code: string; title: string; batch: number; episodes: { code: string; title: string; tag: string }[] };
  const sections: Sec[] = [];
  let cur: Sec | undefined;
  let batch = 1;
  for (const line of text.split(/\r?\n/)) {
    const h = /^## (S\d+) \| (.+?)(?: \((\d+) حلق(?:ة|ات)\))?\s*$/.exec(line);
    if (h) { cur = { code: h[1], title: h[2], batch, episodes: [] }; sections.push(cur); continue; }
    const b = /^## الدفعة (\d)/.exec(line);
    if (b) { batch = Number(b[1]); cur = undefined; continue; }
    if (line.startsWith("## ")) { cur = undefined; continue; }
    if (batch === 1 && cur) {
      const row = /^\|\s*(S\d+E\d+)\s*\|\s*(.+?)\s*\|\s*([ABCD])\s*\|/.exec(line);
      if (row) { cur.episodes.push({ code: row[1], title: row[2], tag: row[3] }); continue; }
      if (/^S\d+E\d+\s/.test(line)) for (const m of line.matchAll(/(?:(S\d+)E|E)(\d+)\s+(.+?)\s+\(([ABCD])\)/g)) cur.episodes.push({ code: `${cur.code}E${m[2]}`, title: m[3].replace(/^[·\s]+/, ""), tag: m[4] });
    } else if (batch === 2 && /^S\d+ /.test(line)) {
      for (const part of line.split(" · ")) { const m = /^(S\d+)\s+([^(.`]+?)\s*(?:\(|\.|$)/.exec(part.trim()); if (m) sections.push({ code: m[1], title: m[2].trim(), batch: 2, episodes: [] }); }
    } else if (batch === 3) {
      for (const m of line.matchAll(/\*\*(S\d+) ([^*]+?)\*\*/g)) sections.push({ code: m[1], title: m[2].trim(), batch: 3, episodes: [] });
    }
  }
  // قسم له سلسلة إنتاج (series.json فيه catalogCode) يحمل حالة حلقاته الفعلية وزر «ابدأ الإنتاج»
  const jobs = summary().jobs;
  const linked = sections.map((s) => {
    const seriesId = listSeriesIds().find((id) => loadSeries(id).catalogCode === s.code);
    if (!seriesId) return s;
    const latest = (n: number) => jobs.filter((j) => j.seriesId === seriesId && j.number === n).sort((a, b) => b.version - a.version)[0];
    return { ...s, series: seriesId, episodes: s.episodes.map((e) => { const j = latest(Number(/E(\d+)$/.exec(e.code)?.[1])); return { ...e, id: j?.id, status: j?.status, error: j?.status === "Failed" ? j.error : undefined, video: j?.status === "Completed" ? j.outputPath : undefined, reel: j?.status === "Completed" && j.outputPath ? j.outputPath.replace(/episode\.mp4$/, "reel.mp4") : undefined }; }) };
  });
  const reqs = readReqs();
  // الزائر لا يرى إلا ما اكتمل: بقية الحالات والأخطاء والطلبات للمسؤول فقط
  const out = linked.map((s) => ({ ...s, requested: admin && !!reqs[s.code], episodes: admin ? s.episodes : s.episodes.map((e: any) => (e.status === "Completed" ? { code: e.code, title: e.title, tag: e.tag, status: e.status, video: e.video, reel: e.reel } : { code: e.code, title: e.title, tag: e.tag })) }));
  return { sections: out, total: out.reduce((n, s) => n + s.episodes.length, 0) };
}

// حزم النشر على يوتيوب (للمسؤول): من library/<سلسلة>/ep-NN/vN/youtube/package.json وسجل الرفع data/youtube-uploads.json
function publishInfo() {
  const ledger = (() => { try { return JSON.parse(readFileSync("data/youtube-uploads.json", "utf8")); } catch { return {}; } })();
  const out: any[] = [];
  if (!existsSync("library")) return { items: out, authorized: false };
  for (const sid of readdirSync("library")) {
    const sdir = join("library", sid);
    let eps: string[]; try { eps = readdirSync(sdir).filter((x) => /^ep-\d+$/.test(x)).sort(); } catch { continue; }
    const code = (() => { try { return loadSeries(sid).catalogCode; } catch { return undefined; } })();
    for (const ep of eps) {
      const vs = readdirSync(join(sdir, ep)).filter((x) => /^v\d+$/.test(x)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
      if (!vs.length) continue;
      const f = join(sdir, ep, vs[vs.length - 1], "youtube", "package.json");
      if (!existsSync(f)) continue;
      const p = JSON.parse(readFileSync(f, "utf8"));
      const base = `${sid}/${ep}/v${p.contentVersion}`;
      out.push({ code: `${code ?? sid}E${ep.slice(3)}`, title: p.video.title, description: p.video.description, tags: p.video.tags, chapters: p.chapters.length, seconds: p.video.seconds, playlist: p.playlist.title, thumbnail: !!p.thumbnail, shorts: !!p.vertical?.shortsEligible, uploaded: ledger[`${base}/16x9`] ?? null });
    }
  }
  out.sort((a, b) => (a.code < b.code ? -1 : 1));
  return { items: out, authorized: existsSync("data/youtube-token.json"), configured: !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET) };
}

function command(b: any): string {
  switch (b.action) {
    case "add": { const r = enqueueSeries(b.series, { episodes: b.eps, regenerate: !!b.regenerate }); return `added ${r.added.length}, skipped ${r.skipped.length}`; }
    case "pause": case "resume": case "cancel": case "retry": return b.job ? jobAction(b.job, b.action) : seriesAction(b.series, b.action);
    // إنتاج قسم كامل في أي وقت: يضيف حلقاته غير المنتجة إلى الطابور، ويستأنف الطابور إن كان متوقفًا، ويشغّل العامل
    case "run-series": { const done = new Set(summary().jobs.filter((j) => j.seriesId === b.series && j.status === "Completed").map((j) => j.number)); const todo = loadEpisodes(b.series).map((e) => e.number).filter((n) => !done.has(n)); const r = enqueueSeries(b.series, { episodes: b.limit ? todo.slice(0, Number(b.limit)) : undefined }); queueResume(); return `${r.added.length ? `queued ${r.added.length}` : "nothing new to queue"}; ${startWorker(false)}`; }
    case "request": { if (!/^S\d+$/.test(b.section)) throw new Error("bad section"); const r = readReqs(); r[b.section] = { at: new Date().toISOString() }; writeReqs(r); return `requested ${b.section}`; }
    case "unrequest": { if (!/^S\d+$/.test(b.section)) throw new Error("bad section"); const r = readReqs(); delete r[b.section]; writeReqs(r); return `withdrawn ${b.section}`; }
    case "prepare-youtube": { const r = spawnSync(process.execPath, ["scripts/build-youtube-package.mjs"], { encoding: "utf8" }); return r.status === 0 ? (r.stdout.trim().split("\n").pop() ?? "done") : "failed"; }
    case "pause-all": queuePause(); return "queue paused";
    case "resume-all": queueResume(); return "queue resumed";
    case "start-worker": return startWorker(false);
    default: throw new Error(`unknown action ${b.action}`);
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const send = (code: number, body: string, type = "application/json") => { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(body); };
  // نفق عام (Cloudflare) يصل من هذا الجهاز نفسه لكن برؤوس وسيط: يُعامل كزائر خارجي ولا يُنفَّذ له أي أمر
  const proxied = !!(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"]) || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host ?? "");
  const lan = !/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress ?? "");
  const SHARE_PW = process.env.DASHBOARD_SHARE_PASSWORD; // اختياري: إن وُضعت طُلبت من الزوار الخارجيين
  if (SHARE_PW && (proxied || lan)) {
    const got = Buffer.from((req.headers.authorization ?? "").replace(/^Basic /i, ""), "base64").toString();
    if (got.slice(got.indexOf(":") + 1) !== SHARE_PW) { res.writeHead(401, { "www-authenticate": 'Basic realm="JAWAB production dashboard"' }); return void res.end("password required"); }
  }
  const admin = (!lan && !proxied) || hasSession(req.headers.cookie);
  const ipKey = String(req.headers["cf-connecting-ip"] ?? (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0] ?? req.socket.remoteAddress);
  try {
    if (url.pathname === "/api/login" && req.method === "POST") {
      if (req.headers["x-tutorial"] !== "1") return send(403, '{"ok":false}');
      const f = fails.get(ipKey);
      if (f && f.n >= 5 && f.until > Date.now()) return send(429, '{"ok":false,"error":"locked"}');
      let body = "";
      req.on("data", (d) => { body += d; if (body.length > 2000) req.destroy(); });
      req.on("end", () => {
        let u = "", p = "";
        try { ({ user: u = "", password: p = "" } = JSON.parse(body)); } catch {}
        const AU = process.env.ADMIN_USER, AP = process.env.ADMIN_PASSWORD;
        if (AU && AP && same(String(u), AU) && same(String(p), AP)) {
          fails.delete(ipKey);
          const token = randomBytes(32).toString("hex");
          sessions.set(token, Date.now() + SESSION_MS);
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "set-cookie": `adm=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${proxied ? "; Secure" : ""}` });
          return void res.end('{"ok":true}');
        }
        const n = (fails.get(ipKey)?.n ?? 0) + 1;
        fails.set(ipKey, { n, until: Date.now() + 15 * 60_000 });
        send(401, '{"ok":false}');
      });
      return;
    }
    if (url.pathname === "/api/logout" && req.method === "POST") {
      const tk = cookieOf(req.headers.cookie); if (tk) sessions.delete(tk);
      res.writeHead(200, { "content-type": "application/json", "set-cookie": "adm=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
      return void res.end('{"ok":true}');
    }
    if (url.pathname === "/") return send(200, PAGE, "text/html; charset=utf-8");
    if (url.pathname === "/dictionary") return send(200, DICT_PAGE, "text/html; charset=utf-8");
    if (url.pathname === "/api/dictionary") return send(200, JSON.stringify(dictionary()));
    if (url.pathname === "/api/publish") return admin ? send(200, JSON.stringify(publishInfo())) : send(403, '{"error":"admin sign in required"}');
    if (url.pathname === "/api/guide") return send(200, JSON.stringify(guide(admin)));
    if (url.pathname === "/api/state") return send(200, JSON.stringify(admin ? { ...state(), admin } : { ...publicState(state()), admin }));
    if (url.pathname === "/api/cmd" && req.method === "POST") {
      // الأوامر للمسؤول فقط: هذا الجهاز نفسه، أو جلسة دخول صحيحة (الزائر يعرض ويعاين فقط)
      if (!admin) return send(403, '{"error":"admin sign in required"}');
      if (req.headers["x-tutorial"] !== "1" || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) return send(403, '{"error":"forbidden"}');
      let body = "";
      req.on("data", (d) => { body += d; if (body.length > 20_000) req.destroy(); });
      req.on("end", () => { try { send(200, JSON.stringify({ ok: true, message: command(JSON.parse(body)) })); } catch (e) { send(400, JSON.stringify({ ok: false, message: (e as Error).message })); } });
      return;
    }
    if (url.pathname.startsWith("/media/")) {
      const file = resolve(decodeURIComponent(url.pathname.slice(7)));
      if (!ROOTS.some((r) => file.startsWith(r)) || !existsSync(file) || !statSync(file).isFile()) return send(404, "not found", "text/plain");
      const size = statSync(file).size, type = MIME[extname(file)] ?? "application/octet-stream";
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
      if (m) {
        const start = m[1] ? Number(m[1]) : 0, end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        res.writeHead(206, { "content-type": type, "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "content-length": end - start + 1 });
        return void createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes" });
      return void createReadStream(file).pipe(res);
    }
    send(404, "not found", "text/plain");
  } catch (e) { send(500, JSON.stringify({ error: (e as Error).message })); }
}).listen(PORT, HOST, () => {
  console.log(`dashboard: http://127.0.0.1:${PORT}`);
  if (HOST !== "127.0.0.1") for (const a of Object.values(networkInterfaces()).flat()) if (a && a.family === "IPv4" && !a.internal) console.log(`share on the local network: http://${a.address}:${PORT}  (view only; commands work from this computer only)`);
});

const DICT_PAGE = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>قاموس الحلقات</title>
<style>
:root{--navy:#1e3a8a;--blue:#60a5fa;--green:#10b981;--bg:#f4f7fc;--line:#dbe3f0;--txt:#0f172a;--mut:#64748b}
*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",Tahoma,sans-serif;background:var(--bg);color:var(--txt);height:100vh;display:flex;flex-direction:column}
header{background:linear-gradient(90deg,var(--navy),#27479e);color:#fff;padding:12px 20px;display:flex;gap:14px;align-items:center}
header h1{font-size:19px;margin:0;flex:1}header a{color:#fff;font-size:14px;text-decoration:none;background:#ffffff26;padding:5px 12px;border-radius:8px}
.wrap{flex:1;display:flex;min-height:0}
aside{width:340px;background:#fff;border-inline-end:1px solid var(--line);display:flex;flex-direction:column}
aside input{margin:12px;padding:9px 12px;border:1px solid var(--line);border-radius:10px;font:inherit}
#list{overflow:auto;flex:1;padding:0 8px 16px}
.ser{font-weight:700;color:var(--navy);padding:10px 8px 4px;font-size:14px}
.it{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;cursor:pointer;font-size:14px}.it:hover{background:#eef3fb}.it.on{background:#dbe7fb}
.n{min-width:26px;height:26px;border-radius:50%;background:var(--navy);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:700}
.dot{width:9px;height:9px;border-radius:50%;background:#cbd5e1;margin-inline-start:auto}.dot.Completed{background:var(--green)}.dot.Failed{background:#dc2626}.dot.Queued,.dot.Paused{background:#d97706}.dot.Skipped{background:#475569}
main{flex:1;overflow:auto;padding:24px 32px}
h2{margin:0 0 4px;color:var(--navy)}.en{direction:ltr;text-align:right;color:var(--mut);margin-bottom:14px}
.box{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:16px}
.box h3{margin:0 0 8px;font-size:15px;color:var(--navy)}ul,ol{margin:0;padding-inline-start:22px;line-height:1.9}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.chip{background:#eef3fb;border-radius:999px;padding:3px 12px;font-size:13px}
.term{display:flex;gap:10px;padding:5px 0;border-top:1px solid #eef2f8}.term:first-child{border-top:0}.term b{direction:ltr;min-width:160px;text-align:left}
button{font:inherit;background:var(--green);color:#fff;border:0;border-radius:8px;padding:6px 14px;cursor:pointer}
video{width:100%;max-width:720px;border-radius:10px;background:#000;margin-top:10px}
.empty{color:var(--mut);padding:60px 0;text-align:center}
</style></head><body>
<header><h1>قاموس الحلقات</h1><a href="/">لوحة الإنتاج</a></header>
<div class="wrap"><aside><input id="q" placeholder="ابحث في الحلقات والمصطلحات…" oninput="draw()"><div id="list"></div></aside>
<main id="main"><div class="empty">اختر حلقة من القائمة الجانبية</div></main></div>
<script>
let D=null,cur=null;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const AR={Queued:'في الطابور',Preparing:'تحضير',Recording:'تسجيل',Processing:'معالجة',Validating:'تحقق',Completed:'مكتملة',Failed:'فشلت',Paused:'متوقفة',Skipped:'متخطّاة'};
const hay=e=>(e.title.ar+' '+e.title.en+' '+e.objectives.join(' ')+' '+e.expected+' '+e.narration.join(' ')+' '+e.terms.map(t=>t.en+' '+(t.ar||'')).join(' ')).toLowerCase();
function draw(){
  const q=document.getElementById('q').value.trim().toLowerCase();let h='';
  for(const s of D.series){
    const es=s.episodes.filter(e=>!q||hay(e).includes(q));
    if(!es.length)continue;
    h+='<div class="ser">'+esc(s.title.ar)+'</div>';
    for(const e of es)h+='<div class="it'+(cur&&cur.s===s.id&&cur.n===e.number?' on':'')+'" onclick="pick(\\''+s.id+'\\','+e.number+')"><span class="n">'+e.number+'</span><span>'+esc(e.title.ar)+'</span><span class="dot '+(e.status||'')+'" title="'+esc(AR[e.status]||'غير مضافة')+'"></span></div>';
  }
  document.getElementById('list').innerHTML=h||'<div class="empty">لا نتائج</div>';
}
function pick(s,n){cur={s,n};draw();show();location.hash=s+'/'+n}
function show(){
  const s=D.series.find(x=>x.id===cur.s),e=s.episodes.find(x=>x.number===cur.n);
  let h='<h2>الحلقة '+e.number+': '+esc(e.title.ar)+'</h2><div class="en">'+esc(e.title.en)+'</div><div class="chips"><span class="chip">'+esc(s.title.ar)+'</span><span class="chip">التطبيق: '+esc(s.module)+'</span><span class="chip">~'+e.estimatedMinutes+' دقيقة</span><span class="chip">'+esc(AR[e.status]||'غير مضافة للطابور')+'</span></div>';
  h+='<div class="box"><h3>أهداف التعلّم</h3><ul>'+e.objectives.map(o=>'<li>'+esc(o)+'</li>').join('')+'</ul></div>';
  h+='<div class="box"><h3>المتطلبات السابقة</h3>'+(e.prerequisites.length?'<ul>'+e.prerequisites.map(o=>'<li>'+esc(o)+'</li>').join('')+'</ul>':'لا يوجد')+'</div>';
  h+='<div class="box"><h3>النتيجة المتوقعة</h3>'+esc(e.expected)+'</div>';
  h+='<div class="box"><h3>خطوات الشرح كما تُعرض في الفيديو</h3><ol>'+e.narration.map(o=>'<li>'+esc(o)+'</li>').join('')+'</ol></div>';
  if(e.terms.length)h+='<div class="box"><h3>مصطلحات الحلقة</h3>'+e.terms.map(t=>'<div class="term"><b>'+esc(t.en)+'</b><span>'+esc(t.ar||'')+'</span></div>').join('')+'</div>';
  if(e.video)h+='<div class="box"><h3>الفيديو</h3><video controls src="/media/'+esc(e.video)+'"></video></div>';
  document.getElementById('main').innerHTML=h;
}
fetch('/api/dictionary').then(r=>r.json()).then(d=>{D=d;draw();const m=/#(.+)\\/(\\d+)/.exec(location.hash);if(m){cur={s:m[1],n:+m[2]};draw();show()}});
</script></body></html>
`;
