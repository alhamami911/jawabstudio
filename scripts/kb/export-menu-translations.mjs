// يحمّل أسماء قوائم Jawab بالعربية (ترجمة النظام نفسه) مقابل الإنجليزية: catalog/menus-ar.json
// الغرض: لتعمل خطوات الحلقات سواء كانت لغة الواجهة إنجليزية أو عربية، ولتطابق عبارات الشرح ما يُرى على الشاشة حرفيًا.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
await p.goto(base + "/web/login");
await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app", { timeout: 60000 });
const call = async (model, method, args, kwargs = {}) => { const r = await (await ctx.request.post(`${base}/web/dataset/call_kw/${model}/${method}`, { data: { jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs } } })).json(); if (r.error) throw new Error(r.error.data?.message ?? r.error.message); return r.result; };
const en = await call("ir.ui.menu", "search_read", [[]], { fields: ["id", "name", "complete_name"], context: { lang: "en_US", active_test: true } });
const ar = await call("ir.ui.menu", "search_read", [[]], { fields: ["id", "name", "complete_name"], context: { lang: "ar_001", active_test: true } });
const arById = new Map(ar.map((m) => [m.id, m]));
const out = en.map((m) => ({ id: m.id, en: m.name, ar: arById.get(m.id)?.name ?? m.name, enPath: m.complete_name, arPath: arById.get(m.id)?.complete_name ?? m.complete_name }));
writeFileSync("catalog/menus-ar.json", JSON.stringify(out, null, 1));
const translated = out.filter((m) => m.en !== m.ar).length;
console.log(`menus: ${out.length}, translated: ${translated}`);
for (const n of ["Accounting", "Customers", "Invoices", "Vendors", "Bills", "Journal Entries", "Configuration", "Chart of Accounts", "Settings", "Sales", "Purchase", "Inventory", "CRM", "Reporting", "Journals", "Taxes"]) {
  const hits = [...new Map(out.filter((m) => m.en === n).map((m) => [m.ar, m])).values()];
  console.log(`  ${n} -> ${hits.map((h) => h.ar).join(" | ") || "(none)"}`);
}
await b.close();
