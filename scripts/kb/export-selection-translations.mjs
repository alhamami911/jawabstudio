// يصدّر ترجمات خيارات الحقول المنسدلة (Selection) من النظام: catalog/selections-ar.json { "Current Assets": ["الأصول المتداولة"] }
// الغرض: خطوة "اختر النوع X" تعمل مهما كانت لغة الواجهة.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
await p.goto(base + "/web/login");
await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app", { timeout: 60000 });
const call = async (model, method, args, kwargs = {}) => { const r = await (await ctx.request.post(`${base}/web/dataset/call_kw/${model}/${method}`, { data: { jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs } } })).json(); if (r.error) throw new Error(r.error.data?.message ?? r.error.message); return r.result; };
const fields = ["id", "name", "value"];
const en = await call("ir.model.fields.selection", "search_read", [[]], { fields, context: { lang: "en_US" } });
const ar = await call("ir.model.fields.selection", "search_read", [[]], { fields, context: { lang: "ar_001" } });
const arById = new Map(ar.map((r) => [r.id, r.name]));
const map = {};
for (const r of en) { const a = (arById.get(r.id) ?? "").trim(); if (a && a !== r.name) (map[r.name] ??= new Set()).add(a); }
const out = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v]]));
writeFileSync("catalog/selections-ar.json", JSON.stringify(out, null, 1));
console.log(`selection labels: ${en.length}, with Arabic: ${Object.keys(out).length}`);
for (const k of ["Current Assets", "Expenses", "Income", "Current Liabilities", "Cash", "Sales", "Purchases"]) console.log(`  ${k} -> ${(out[k] ?? []).join(" | ") || "(none)"}`);
await b.close();
