// يبدّل لغة حساب الدروس في Jawab: node scripts/ops/set-lesson-lang.mjs ar_001|en_US  (يطبع اللغة الحالية بلا وسيط)
import { chromium } from "playwright";
process.loadEnvFile();
const lang = process.argv[2];
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") { console.error("host not allowed"); process.exit(1); }
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
await p.goto(base + "/web/login");
await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app", { timeout: 60000 });
const call = async (model, method, args, kwargs = {}) => { const r = await (await ctx.request.post(`${base}/web/dataset/call_kw/${model}/${method}`, { data: { jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs } } })).json(); if (r.error) throw new Error(r.error.data?.message ?? r.error.message); return r.result; };
const uid = (await (await ctx.request.post(`${base}/web/session/get_session_info`, { data: { jsonrpc: "2.0", method: "call", params: {} } })).json()).result.uid;
if (lang) await call("res.users", "write", [[uid], { lang }]);
console.log(`lesson user #${uid} lang =`, (await call("res.users", "read", [[uid]], { fields: ["lang"] }))[0].lang);
if (process.argv.includes("--fields")) {
  const f = await call("account.account", "fields_get", [["code", "name", "account_type", "reconcile", "tax_ids"]], { attributes: ["string"], context: { lang: "ar_001" } });
  console.log(JSON.stringify(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.string]))));
}
await b.close();

