// قراءة فقط: يطبع حقول l10n_sa في نماذج معيّنة وقيمها للشركة. usage: node scripts/probes/probe-fields.mjs
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") process.exit(1);
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
await p.goto(base + "/web/login"); await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app, .o_home_menu", { timeout: 60000 });
const call = async (model, method, args, kwargs = {}) => { const r = await (await ctx.request.post(`${base}/web/dataset/call_kw/${model}/${method}`, { data: { jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs } } })).json(); return r.error ? { error: (r.error.data?.message ?? r.error.message).slice(0, 200) } : r.result; };
for (const m of ["res.company", "res.partner"]) { const f = await call(m, "fields_get", [], { attributes: ["string", "type"] }); console.log(m, Object.entries(f).filter(([k]) => /l10n_sa/.test(k)).map(([k, v]) => `${k}(${v.type})`).join(", ")); }
const [c] = await call("res.company", "read", [[16]], { fields: ["partner_id", "vat"] });
console.log("company partner", c.partner_id, "vat", c.vat);
const pf = await call("res.partner", "fields_get", [], { attributes: ["type"] });
const keys = Object.keys(pf).filter((k) => /l10n_sa/.test(k));
console.log(JSON.stringify(await call("res.partner", "read", [[c.partner_id[0]]], { fields: keys })));
await b.close();
