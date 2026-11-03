// يحصر حساب الدروس في الشركة التجريبية فلا تظهر شركات العملاء في الفيديوهات حتى لو فُتحت قائمة الشركات، مع إمكانية الرجوع.
// usage: node scripts/ops/lesson-user.mjs status | restrict | restore
//   restrict: يحفظ الشركات المسموحة الحالية في data/lesson-user-backup.json ثم يقصر الحساب على الشركة التجريبية
//   restore : يعيد الشركات من النسخة الاحتياطية (مثلًا لتنظيف سجلات قديمة في شركات أخرى)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
process.loadEnvFile();
const cmd = process.argv[2] ?? "status";
const DEMO = 47;
const BACKUP = "data/lesson-user-backup.json";
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "samar.jawab.pro") { console.error("host not allowed"); process.exit(1); }
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
await p.goto(base + "/web/login");
await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app", { timeout: 60000 });
const call = async (model, method, args, kwargs = {}) => { const r = await (await ctx.request.post(`${base}/web/dataset/call_kw/${model}/${method}`, { data: { jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs } } })).json(); if (r.error) throw new Error(r.error.data?.message ?? r.error.message); return r.result; };
const uid = (await (await ctx.request.post(`${base}/web/session/get_session_info`, { data: { jsonrpc: "2.0", method: "call", params: {} } })).json()).result.uid;
const read = async () => (await call("res.users", "read", [[uid]], { fields: ["company_ids", "company_id", "lang"] }))[0];
const show = async (tag) => { const u = await read(); console.log(`${tag}: user #${uid} companies=[${u.company_ids.join(",")}] default=${u.company_id[0]} lang=${u.lang}`); };

if (cmd === "status") await show("status");
else if (cmd === "restrict") {
  const u = await read();
  if (u.company_ids.length === 1 && u.company_ids[0] === DEMO) console.log("already restricted");
  else {
    if (!existsSync(BACKUP)) { mkdirSync("data", { recursive: true }); writeFileSync(BACKUP, JSON.stringify({ at: new Date().toISOString(), userId: uid, company_ids: u.company_ids, company_id: u.company_id[0] }, null, 2)); console.log(`backup saved: ${BACKUP}`); }
    await call("res.users", "write", [[uid], { company_id: DEMO, company_ids: [[6, 0, [DEMO]]] }]);
  }
  await show("after");
} else if (cmd === "restore") {
  const bk = JSON.parse(readFileSync(BACKUP, "utf8"));
  await call("res.users", "write", [[uid], { company_ids: [[6, 0, bk.company_ids]], company_id: DEMO }]);
  await show("restored");
} else console.error("usage: status | restrict | restore");
await b.close();
