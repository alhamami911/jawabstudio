// ينشئ شركة تجريبية مخصصة للدروس في Jawab (السعودية، الريال، دليل حسابات l10n_sa) كي لا تلوّث الدروس شركات العملاء.
// آمن لإعادة التشغيل: إن وُجدت الشركة بالاسم نفسه لا ينشئ غيرها، ويكمل ما نقص (دليل الحسابات، إضافتها لمستخدم الدروس).
// usage: node scripts/ops/setup-demo-company.mjs [--name "اسم الشركة"] [--set-default]
import { chromium } from "playwright";
process.loadEnvFile();
const args = process.argv.slice(2);
const name = args.includes("--name") ? args[args.indexOf("--name") + 1] : "شركة جواب التجريبية";
const setDefault = args.includes("--set-default");
const base = process.env.JAWAB_BASE_URL;
if (!base || new URL(base).hostname !== "samar.jawab.pro") { console.error("host not allowed"); process.exit(1); }

const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto(base + "/web/login");
await p.fill("input[name=login]", process.env.JAWAB_USER);
await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]");
await p.waitForSelector(".o_app", { timeout: 60000 });
const call = async (model, method, args, kwargs = {}) => {
  const r = await (await ctx.request.post(`${base}/web/dataset/call_kw/${model}/${method}`, { data: { jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs: { context: { active_test: false }, ...kwargs } } } })).json();
  if (r.error) throw new Error(`${model}.${method}: ${r.error.data?.message ?? r.error.message}`);
  return r.result;
};
const uid = (await (await ctx.request.post(`${base}/web/session/get_session_info`, { data: { jsonrpc: "2.0", method: "call", params: {} } })).json()).result.uid;

const [sar] = await call("res.currency", "search_read", [[["name", "=", "SAR"]]], { fields: ["id"] });
const [sa] = await call("res.country", "search_read", [[["code", "=", "SA"]]], { fields: ["id"] });
let [co] = await call("res.company", "search_read", [[["name", "=", name]]], { fields: ["id", "chart_template", "currency_id", "country_id"] });
if (co) console.log(`company exists: #${co.id}`);
else {
  const id = await call("res.company", "create", [{ name, country_id: sa.id, currency_id: sar.id }]);
  [co] = await call("res.company", "read", [[id]], { fields: ["id", "chart_template", "currency_id", "country_id"] });
  console.log(`company created: #${co.id}`);
}
console.log(`  country=${co.country_id?.[1]} currency=${co.currency_id?.[1]} chart_template=${co.chart_template || "(none)"}`);

const ctxCo = { allowed_company_ids: [co.id], force_company: co.id };
if (!co.chart_template) {
  // دليل الحسابات السعودي (l10n_sa) يُحمَّل على الشركة الجديدة
  await call("account.chart.template", "try_loading", ["sa", co.id], { context: ctxCo });
  [co] = await call("res.company", "read", [[co.id]], { fields: ["id", "chart_template"] });
  console.log(`  chart loaded: ${co.chart_template || "(still none)"}`);
}
const accounts = await call("account.account", "search_count", [[["company_ids", "in", [co.id]]]], { context: ctxCo }).catch(() => "?");
const journals = await call("account.journal", "search_read", [[["company_id", "=", co.id]]], { fields: ["name", "type"] });
const taxes = await call("account.tax", "search_count", [[["company_id", "=", co.id]]]);
console.log(`  accounts=${accounts} taxes=${taxes} journals=${journals.map((j) => j.name).join(", ") || "none"}`);

const [u] = await call("res.users", "read", [[uid]], { fields: ["company_ids", "company_id", "lang"] });
if (!u.company_ids.includes(co.id)) { await call("res.users", "write", [[uid], { company_ids: [[4, co.id]] }]); console.log("  added to lesson user's allowed companies"); }
if (setDefault && u.company_id[0] !== co.id) { await call("res.users", "write", [[uid], { company_id: co.id }]); console.log("  set as lesson user's default company"); }
console.log(`lesson user #${uid}: lang=${u.lang}, default company=${setDefault ? co.id : u.company_id[1]}`);
await b.close();
