// ينظّف سجلات الاختبار التي أنشأها إنتاج الدروس في Jawab (وليس بيانات العمل).
// قواعد الأمان: المستخدم المنشئ = مستخدم الدروس نفسه، وتاريخ الإنشاء بعد --since، واسم السجل يطابق نمطًا من أسماء الحلقات.
// الافتراضي عرض فقط (dry-run). usage:
//   node scripts/ops/cleanup-test-data.mjs [--since 2026-10-26] [--apply]
import { chromium } from "playwright";
process.loadEnvFile();
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const since = (args.includes("--since") ? args[args.indexOf("--since") + 1] : "2026-10-26") + " 00:00:00";
const base = process.env.JAWAB_BASE_URL;
if (!base || !process.env.JAWAB_USER) { console.error("JAWAB_BASE_URL / JAWAB_USER missing in .env"); process.exit(1); }
const allowed = ["samar.jawab.pro"];
if (!allowed.includes(new URL(base).hostname)) { console.error("host not allowed for cleanup"); process.exit(1); }

const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto(base + "/web/login");
await p.fill("input[name=login]", process.env.JAWAB_USER);
await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]");
await p.waitForSelector(".o_app");
// يرى السكربت سجلات كل الشركات المسموحة للمستخدم، لا شركته الافتراضية فقط (سجلات الاختبار القديمة في شركة أخرى غير الشركة التجريبية)
let allowedCompanies = [];
const rpc = async (model, method, args, kwargs = {}) => {
  const r = await (await ctx.request.post(`${base}/web/dataset/call_kw/${model}/${method}`, { data: { jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs: { context: { active_test: false, ...(allowedCompanies.length ? { allowed_company_ids: allowedCompanies } : {}) }, ...kwargs } } } })).json();
  if (r.error) throw new Error(r.error.data?.message ?? r.error.message);
  return r.result;
};
const session = await (await ctx.request.post(`${base}/web/session/get_session_info`, { data: { jsonrpc: "2.0", method: "call", params: {} } })).json();
const uid = session.result.uid;
allowedCompanies = (await rpc("res.users", "read", [[uid]], { fields: ["company_ids"] }))[0].company_ids;
console.log(`user uid=${uid}, created since ${since}, mode=${apply ? "APPLY (will delete)" : "dry-run"}`);

const own = [["create_uid", "=", uid], ["create_date", ">=", since]];
const orNames = (f, pats) => { // (f ilike a) OR (f ilike b) ...
  const out = []; pats.forEach((x, i) => { if (i < pats.length - 1) out.push("|"); out.push([f, "=ilike", x]); }); return out;
};

// الترتيب مهم: الفواتير المسودة أولًا ثم ما تعتمد عليه، والخطط التحليلية آخرًا
const plan = [
  ["account.move", "draft invoices/bills made by episodes", [...own, ["state", "=", "draft"], "|", ["ref", "=", "INV-2026-001"], ["invoice_line_ids.product_id.name", "=ilike", "Accounting Consultation%"]]],
  ["account.analytic.account", "analytic accounts", [...own, ...orNames("name", ["Main Branch %"])]],
  ["account.account", "accounts", [...own, ...orNames("name", ["Petty Cash", "Petty Cash Box", "Office Supplies Expense", "Consulting Service Revenue", "Accrued Expenses Payable"])]],
  ["account.tax", "taxes", [...own, ...orNames("name", ["VAT 15% Sales %", "VAT 15% Purchases %"])]],
  ["account.payment.term", "payment terms", [...own, ...orNames("name", ["Net 30 Days %"])]],
  ["account.fiscal.position", "fiscal positions", [...own, ...orNames("name", ["Export Customers %"])]],
  ["account.journal", "journals", [...own, ...orNames("name", ["Branch Cash Journal"])]],
  ["product.template", "products", [...own, ...orNames("name", ["Accounting Consultation %"])]],
  ["product.category", "product categories", [...own, ...orNames("name", ["Professional Services %"])]],
  ["res.partner.category", "contact tags", [...own, ...orNames("name", ["Priority Customers %"])]],
  ["res.partner", "partners", [...own, ...orNames("name", ["Al Noor Trading %", "Al Amal Supplies %"])]],
  ["account.analytic.plan", "analytic plans (schema-affecting, last)", [...own, ...orNames("name", ["Branches %"])]],
];

let total = 0, deleted = 0;
const failures = [];
for (const [model, label, domain] of plan) {
  let rows;
  try { rows = await rpc(model, "search_read", [domain], { fields: ["id", "display_name", "create_date"], limit: 500 }); }
  catch (e) { console.log(`\n${label} (${model}): cannot query: ${e.message.slice(0, 120)}`); continue; }
  console.log(`\n${label} (${model}): ${rows.length}`);
  for (const r of rows) console.log(`   #${r.id}  ${r.display_name}  [${r.create_date}]`);
  total += rows.length;
  if (apply && rows.length) {
    for (const r of rows) {
      try { await rpc(model, "unlink", [[r.id]]); deleted++; }
      catch (e) { failures.push(`${model} #${r.id} ${r.display_name}: ${e.message.slice(0, 120)}`); }
    }
  }
}
console.log(`\n${apply ? `deleted ${deleted} of ${total}` : `${total} record(s) would be deleted (run with --apply)`}`);
for (const f of failures) console.log(`  could not delete: ${f}`);
await b.close();
