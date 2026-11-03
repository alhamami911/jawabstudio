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
if (co.currency_id[1] !== "SAR") { console.error(`company #${COMPANY} (${co.name}) is not a SAR studio company: refusing`); process.exit(1); }
console.log(`seeding company #${COMPANY} (${co.name}, ${co.currency_id[1]})`);
const report = {};
const bump = (k) => { report[k] = (report[k] ?? 0) + 1; };

// 0) قيم افتراضية لحساب الدروس: ما ينشئه من عملاء ومنتجات في الواجهة يُربط بالشركة التجريبية (وإلا يظهر في كل الشركات)
for (const model of ["res.partner", "product.template"]) await call("ir.default", "set", [model, "company_id", COMPANY], { user_id: true, company_id: COMPANY });
console.log("defaults set: new partners/products created by the lesson user belong to the demo company");

// أدوات: إنشاء إن لم يوجد
const ensure = async (model, domain, vals, key) => {
  const [hit] = await call(model, "search_read", [domain], { fields: ["id"], limit: 1 });
  if (hit) return hit.id;
  const id = await call(model, "create", [vals]);
  bump(key ?? model);
  return id;
};

// 1) جهات الاتصال
const city = { Riyadh: "الرياض", Jeddah: "جدة", Dammam: "الدمام" };
const [sa] = await call("res.country", "search_read", [[["code", "=", "SA"]]], { fields: ["id"] });
const partnerDefs = [
  ["DEMO-C1", "شركة الأفق للتجهيزات التجارية", "Riyadh", "customer"],
  ["DEMO-C2", "مؤسسة النخيل للمقاولات", "Jeddah", "customer"],
  ["DEMO-C3", "مجموعة الواحة للضيافة", "Riyadh", "customer"],
  ["DEMO-C4", "شركة بيان للحلول التقنية", "Dammam", "customer"],
  ["DEMO-C5", "مكتب الريادة للاستشارات", "Jeddah", "customer"],
  ["DEMO-V1", "الشركة المتحدة للتوريدات المكتبية", "Riyadh", "vendor"],
  ["DEMO-V2", "مؤسسة الراشد للمعدات", "Dammam", "vendor"],
  ["DEMO-V3", "شركة سما للتموين والضيافة", "Jeddah", "vendor"],
  ["DEMO-V4", "الخليج للطباعة والتغليف", "Riyadh", "vendor"],
];
const partner = {};
for (const [ref, name, c, kind] of partnerDefs) {
  partner[ref] = await ensure("res.partner", [["ref", "=", ref], ["company_id", "=", COMPANY]], {
    name, ref, is_company: true, company_type: "company", company_id: COMPANY, country_id: sa.id, city: city[c], ...(kind === "customer" ? { customer_rank: 1 } : { supplier_rank: 1 }),
  }, "partners");
}

// الفوترة الإلكترونية السعودية (ZATCA) تفرض بيانات على البائع والمشتري قبل الترحيل: قيم خيالية، وتُكتب الحقول الموجودة في النظام فقط
const pf = await call("res.partner", "fields_get", [], { attributes: ["type"] });
const only = (vals) => Object.fromEntries(Object.entries(vals).filter(([k]) => k in pf));
const hood = { Riyadh: "حي العليا", Jeddah: "حي الحمراء", Dammam: "حي الشاطئ" };
let n = 0;
for (const [ref, , c, kind] of partnerDefs) {
  n++;
  await call("res.partner", "write", [[partner[ref]], only({
    street: `طريق الملك فهد ${n}`, street2: hood[c], zip: "12211", l10n_sa_edi_building_number: String(1000 + n), l10n_sa_edi_plot_identification: String(2000 + n),
    l10n_sa_additional_identification_scheme: "CRN", l10n_sa_additional_identification_number: String(1010000000 + n), ...(kind === "customer" ? { vat: `30000000000${String(n).padStart(3, "0")}`.slice(0, 14) + "3" } : {}),
  })]);
}
// البائع = جهة اتصال الشركة نفسها
const [coRec] = await call("res.company", "read", [[COMPANY]], { fields: ["partner_id"] });
const [coPartner] = await call("res.partner", "read", [[coRec.partner_id[0]]], { fields: Object.keys(only({ l10n_sa_additional_identification_scheme: 1, l10n_sa_additional_identification_number: 1 })) });
if (coPartner && !["CRN", "MOM", "MLS", "SAG", "OTH"].includes(coPartner.l10n_sa_additional_identification_scheme)) { // القيمة الحالية «700» ترفضها الفوترة الإلكترونية
  await call("res.partner", "write", [[coRec.partner_id[0]], only({ l10n_sa_additional_identification_scheme: "CRN", l10n_sa_additional_identification_number: "1010000016" })]);
  console.log("seller (company partner): additional identification scheme set to CRN (fictional number)");
}

// 2) المنتجات
const [saleTax] = await call("account.tax", "search_read", [[["company_id", "=", COMPANY], ["type_tax_use", "=", "sale"], ["amount", "=", 15], ["price_include_override", "!=", "tax_included"]]], { fields: ["id"], limit: 1, order: "sequence" });
const [purchTax] = await call("account.tax", "search_read", [[["company_id", "=", COMPANY], ["type_tax_use", "=", "purchase"], ["amount", "=", 15], ["price_include_override", "!=", "tax_included"]]], { fields: ["id"], limit: 1, order: "sequence" });
const [cat] = await call("product.category", "search_read", [[["name", "=", "Saleable"]]], { fields: ["id"], limit: 1 });
const productDefs = [
  ["DEMO-P1", "استشارة محاسبية (ساعة)", "service", 500, 0],
  ["DEMO-P2", "إعداد القوائم المالية", "service", 1500, 0],
  ["DEMO-P3", "تدريب على النظام (يوم)", "service", 1200, 0],
  ["DEMO-P4", "اشتراك دعم شهري", "service", 800, 0],
  ["DEMO-G1", "ورق طباعة A4 (كرتون)", "consu", 85, 55],
  ["DEMO-G2", "طابعة مكتبية", "consu", 650, 480],
  ["DEMO-G3", "حبر طابعة", "consu", 120, 80],
  ["DEMO-G4", "كرسي مكتب", "consu", 420, 300],
];
const product = {}; // default_code -> product.product id
for (const [code, name, type, price, cost] of productDefs) {
  const vals = { name, default_code: code, type, list_price: price, standard_price: cost, company_id: COMPANY, categ_id: cat?.id, taxes_id: [[6, 0, [saleTax.id]]], supplier_taxes_id: [[6, 0, [purchTax.id]]], ...(type === "consu" ? { is_storable: true } : {}) };
  const tmplId = await ensure("product.template", [["default_code", "=", code], ["company_id", "=", COMPANY]], vals, "products");
  const [pp] = await call("product.product", "search_read", [[["product_tmpl_id", "=", tmplId]]], { fields: ["id"], limit: 1 });
  product[code] = pp.id;
}

// 3) فواتير العملاء المرحَّلة ثم الدفعات
const journal = async (type) => (await call("account.journal", "search_read", [[["company_id", "=", COMPANY], ["type", "=", type]]], { fields: ["id"], limit: 1 }))[0].id;
const jSale = await journal("sale"), jPurch = await journal("purchase"), jBank = await journal("bank");
const term = { now: 1, d15: 2, d30: 4 };
const invoiceDefs = [
  // ref, partner, date, term, lines [[code, qty]], pay: 'full' | 'half' | null
  ["DEMO-INV-1", "DEMO-C1", "2026-08-05", "d30", [["DEMO-P2", 1], ["DEMO-P1", 4]], null],
  ["DEMO-INV-2", "DEMO-C2", "2026-08-18", "d15", [["DEMO-G2", 3], ["DEMO-G1", 10]], "full"],
  ["DEMO-INV-3", "DEMO-C3", "2026-09-02", "d30", [["DEMO-P3", 2]], "full"],
  ["DEMO-INV-4", "DEMO-C4", "2026-09-15", "d30", [["DEMO-P4", 3], ["DEMO-P1", 2]], "half"],
  ["DEMO-INV-5", "DEMO-C5", "2026-09-28", "now", [["DEMO-P1", 6]], "full"],
  ["DEMO-INV-6", "DEMO-C1", "2026-10-06", "d30", [["DEMO-G4", 6], ["DEMO-G3", 5]], null],
  ["DEMO-INV-7", "DEMO-C3", "2026-10-15", "d15", [["DEMO-P2", 1]], "full"],
  ["DEMO-INV-8", "DEMO-C2", "2026-10-22", "d30", [["DEMO-P3", 1], ["DEMO-P4", 1]], null],
];
const billDefs = [
  ["DEMO-BILL-1", "DEMO-V1", "2026-08-10", "d30", [["DEMO-G1", 40], ["DEMO-G3", 20]], "full"],
  ["DEMO-BILL-2", "DEMO-V2", "2026-08-25", "d30", [["DEMO-G2", 8]], "full"],
  ["DEMO-BILL-3", "DEMO-V4", "2026-09-12", "d15", [["DEMO-G1", 25]], "full"],
  ["DEMO-BILL-4", "DEMO-V1", "2026-09-30", "d30", [["DEMO-G4", 10]], null],
  ["DEMO-BILL-5", "DEMO-V3", "2026-10-08", "d30", [["DEMO-G3", 30]], "half"],
  ["DEMO-BILL-6", "DEMO-V2", "2026-10-20", "d30", [["DEMO-G2", 4]], null],
];
const makeMoves = async (defs, moveType) => {
  const isOut = moveType === "out_invoice";
  for (const [ref, pr, date, tm, lines, pay] of defs) {
    const [hit] = await call("account.move", "search_read", [[["ref", "=", ref], ["company_id", "=", COMPANY]]], { fields: ["id", "state", "payment_state"], limit: 1 });
    if (hit && hit.state !== "draft") { report.skippedMoves = (report.skippedMoves ?? 0) + 1; continue; }
    if (hit) { await call("account.move", "action_post", [[hit.id]]); bump("postedDrafts"); continue; } // مسودة بقيت من محاولة سابقة فشل ترحيلها
    const id = await call("account.move", "create", [{
      move_type: moveType, partner_id: partner[pr], invoice_date: date, date, ref, company_id: COMPANY, journal_id: isOut ? jSale : jPurch, invoice_payment_term_id: term[tm],
      invoice_line_ids: lines.map(([code, qty]) => [0, 0, { product_id: product[code], quantity: qty, tax_ids: [[6, 0, [isOut ? saleTax.id : purchTax.id]]] }]),
    }]);
    await call("account.move", "action_post", [[id]]);
    bump(isOut ? "customerInvoices" : "vendorBills");
    if (pay) {
      const [m] = await call("account.move", "read", [[id]], { fields: ["amount_total"] });
      const amount = pay === "half" ? Math.round(m.amount_total / 2) : m.amount_total;
      const wiz = await call("account.payment.register", "create", [{ journal_id: jBank, payment_date: date.slice(0, 8) + "28" > "2026-10-28" ? "2026-10-28" : date.slice(0, 8) + "28", amount }], {}, { active_model: "account.move", active_ids: [id] });
      await call("account.payment.register", "action_create_payments", [[wiz]], {}, { active_model: "account.move", active_ids: [id] });
      bump("payments");
    }
  }
};
await makeMoves(invoiceDefs, "out_invoice");
await makeMoves(billDefs, "in_invoice");

// 4) أوامر بيع وشراء (للسلاسل القادمة): مسودة ومؤكدة
const warnings = [];
const orderOnce = async (model, ref, vals, confirm) => {
  try {
  const [hit] = await call(model, "search_read", [[["origin", "=", ref], ["company_id", "=", COMPANY]]], { fields: ["id"], limit: 1 });
  if (hit) { report.skippedOrders = (report.skippedOrders ?? 0) + 1; return; }
  const id = await call(model, "create", [{ ...vals, origin: ref, company_id: COMPANY }]);
  bump(model === "sale.order" ? "salesOrders" : "purchaseOrders");
  if (confirm) await call(model, model === "sale.order" ? "action_confirm" : "button_confirm", [[id]]);
  } catch (e) { warnings.push(`${ref}: ${String(e.message).replace(/\s+/g, " ").slice(0, 160)}`); }
};
const sline = (code, qty) => [0, 0, { product_id: product[code], product_uom_qty: qty }];
await orderOnce("sale.order", "DEMO-SO-1", { partner_id: partner["DEMO-C1"], order_line: [sline("DEMO-G2", 2), sline("DEMO-G3", 6)] }, false);
await orderOnce("sale.order", "DEMO-SO-2", { partner_id: partner["DEMO-C4"], order_line: [sline("DEMO-P1", 8)] }, true);
await orderOnce("sale.order", "DEMO-SO-3", { partner_id: partner["DEMO-C5"], order_line: [sline("DEMO-G4", 4)] }, true);
const pline = (code, qty) => [0, 0, { product_id: product[code], product_qty: qty, date_planned: "2026-11-05 08:00:00" }];
await orderOnce("purchase.order", "DEMO-PO-1", { partner_id: partner["DEMO-V1"], order_line: [pline("DEMO-G1", 30)] }, false);
await orderOnce("purchase.order", "DEMO-PO-2", { partner_id: partner["DEMO-V2"], order_line: [pline("DEMO-G4", 12)] }, true);

// 5) ملخص التحقق
const sum = async (model, domain, field) => (await call(model, "read_group", [domain, [field], []], { lazy: false }))[0]?.[field] ?? 0;
const posted = [["company_id", "=", COMPANY], ["state", "=", "posted"], ["ref", "=like", "DEMO-%"]];
console.log("created this run:", JSON.stringify(report));
for (const w of warnings) console.log("  skipped order:", w);
console.log("totals:", JSON.stringify({
  partners: await call("res.partner", "search_count", [[["company_id", "=", COMPANY], ["ref", "=like", "DEMO-%"]]]),
  products: await call("product.template", "search_count", [[["company_id", "=", COMPANY], ["default_code", "=like", "DEMO-%"]]]),
  postedInvoices: await call("account.move", "search_count", [[...posted, ["move_type", "=", "out_invoice"]]]),
  postedBills: await call("account.move", "search_count", [[...posted, ["move_type", "=", "in_invoice"]]]),
  receivableOpenSAR: await sum("account.move", [...posted, ["move_type", "=", "out_invoice"]], "amount_residual"),
  payableOpenSAR: await sum("account.move", [...posted, ["move_type", "=", "in_invoice"]], "amount_residual"),
  salesOrders: await call("sale.order", "search_count", [[["company_id", "=", COMPANY], ["origin", "=like", "DEMO-%"]]]),
  purchaseOrders: await call("purchase.order", "search_count", [[["company_id", "=", COMPANY], ["origin", "=like", "DEMO-%"]]]),
}));
console.log(`lesson user #${uid}: ir.default company set`);
await b.close();
