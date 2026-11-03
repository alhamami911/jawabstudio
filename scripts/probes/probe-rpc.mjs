// قراءة فقط: search_read على قاعدة الاستديو. usage: node scripts/probes/probe-rpc.mjs <model> '<domain json>' <field,field> [limit]
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") process.exit(1);
const [model, domain = "[]", fields = "name", limit = "20"] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
await p.goto(base + "/web/login"); await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app, .o_home_menu", { timeout: 60000 });
const r = await ctx.request.post(base + `/web/dataset/call_kw/${model}/search_read`, { data: { jsonrpc: "2.0", method: "call", params: { model, method: "search_read", args: [JSON.parse(domain)], kwargs: { fields: fields.split(","), limit: Number(limit), context: { lang: "ar_001" } } } } });
const j = await r.json();
console.log(j.error ? "ERR " + (j.error.data?.message ?? j.error.message) : j.result.map((x) => JSON.stringify(x)).join("\n"));
await b.close();
