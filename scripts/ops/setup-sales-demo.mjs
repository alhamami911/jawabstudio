// يملأ شركة الاستديو في premium.jawab.pro (رقم 16 «SA Company» افتراضيًا) ببيانات واقعية خيالية: عملاء وموردون ومنتجات وفواتير مرحَّلة ومدفوعات وأوامر بيع وشراء.
// كل سجل يحمل مرجعًا DEMO-... فلا يُكرَّر عند إعادة التشغيل. كل سجل يُربط بالشركة 47 صراحةً حتى لا يظهر في شركات العملاء.
// usage: node scripts/ops/seed-demo-data.mjs [--company 16]
import { chromium } from "playwright";
process.loadEnvFile();
const args = process.argv.slice(2);
const COMPANY = Number(args.includes("--company") ? args[args.indexOf("--company") + 1] : 16);
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") { console.error("host not allowed"); process.exit(1); }

const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto(base + "/web/login");
await p.fill("input[name=login]", process.env.JAWAB_USER);
await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]");
await p.waitForSelector(".o_app", { timeout: 60000 });
const CTX = { lang: "en_US", allowed_company_ids: [COMPANY], default_company_id: COMPANY, tracking_disable: true };
const call = async (model, method, args, kwargs = {}, extraCtx = {}) => {
  const r = await (await ctx.request.post(`${base}/web/dataset/call_kw/${model}/${method}`, { data: { jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs: { context: { ...CTX, ...extraCtx }, ...kwargs } } } })).json();
  if (r.error) throw new Error(`${model}.${method}: ${(r.error.data?.message ?? r.error.message).slice(0, 1200)}`);
  return r.result;
};
const uid = (await (await ctx.request.post(`${base}/web/session/get_session_info`, { data: { jsonrpc: "2.0", method: "call", params: {} } })).json()).result.uid;
const [co] = await call("res.company", "read", [[COMPANY]], { fields: ["name", "currency_id"] });
// S03: قائمة أسعار بالريال للشركة التجريبية وربطها بعملاء الديمو، فتظهر عروض الأسعار بالريال (القائمة الافتراضية بالدولار).
const [sar] = await call("res.currency", "search_read", [[["name", "=", "SAR"]]], { fields: ["id", "active"], context: { active_test: false } });
if (!sar.active) await call("res.currency", "write", [[sar.id], { active: true }]);
let [pl] = await call("product.pricelist", "search_read", [[["name", "=", "قائمة الأسعار بالريال"], ["company_id", "=", COMPANY]]], { fields: ["id"], limit: 1 });
const plId = pl ? pl.id : await call("product.pricelist", "create", [{ name: "قائمة الأسعار بالريال", currency_id: sar.id, company_id: COMPANY }]);
console.log("pricelist", plId, pl ? "(existing)" : "(created)");
const ps = await call("res.partner", "search_read", [[["ref", "=like", "DEMO-C%"]]], { fields: ["id", "name"] });
for (const x of ps) await call("res.partner", "write", [[x.id], { property_product_pricelist: plId }], { context: { ...CTX, force_company: COMPANY } });
console.log("partners updated:", ps.length);
await b.close();
