// يولّد قاموس واجهة Jawab (إنجليزي <-> عربي كما يظهر على الشاشة) داخل knowledge-base/glossary من catalog/menus-ar.json
// الغرض: مرجع واحد لكل كاتب شرح: المصطلح بين « » في النص يجب أن يطابق الشاشة حرفيًا.
// تحديث الكتالوج أولًا عند تغيّر النظام: node scripts/kb/export-menu-translations.mjs && node scripts/kb/export-selection-translations.mjs
// usage: node scripts/kb/build-kb.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const menus = JSON.parse(readFileSync("catalog/menus-ar.json", "utf8"));
const sel = JSON.parse(readFileSync("catalog/selections-ar.json", "utf8"));
mkdirSync("knowledge-base/glossary", { recursive: true });
const seg = (p) => p.split("/").map((x) => x.trim()).filter(Boolean);
const APPS = [["Accounting", "المحاسبة"], ["Sales", "المبيعات"], ["Purchase", "المشتريات"], ["Inventory", "المخزون"], ["CRM", "إدارة علاقات العملاء"], ["Point of Sale", "نقاط البيع"], ["Contacts", "جهات الاتصال"], ["Settings", "الإعدادات"], ["Employees", "الموظفون"], ["Project", "المشاريع"], ["Expenses", "المصاريف"]];
const lines = ["# قاموس واجهة JAWAB (عربي كما يظهر على الشاشة)", "",
  "مُولَّد آليًا من ترجمة النظام نفسه (`npm run kb`). **لا يُعدَّل يدويًا.** القاعدة: أي مصطلح بين « » في شرح الحلقة يُنسخ من العمود العربي حرفيًا.", "",
  `آخر توليد: ${new Date().toISOString().slice(0, 10)} · عدد القوائم: ${menus.length}`, ""];
let total = 0;
for (const [en] of APPS) {
  const rows = menus.filter((m) => seg(m.enPath)[0] === en);
  if (!rows.length) continue;
  lines.push(`## ${en} (${rows.length} قائمة)`, "", "| المسار بالإنجليزية | المسار على الشاشة بالعربية |", "|---|---|");
  for (const m of rows) lines.push(`| ${seg(m.enPath).join(" › ")} | ${seg(m.arPath).join(" › ")} |`);
  lines.push("");
  total += rows.length;
}
// تنبيه الأسماء ذات الترجمات المتعددة
const multi = new Map();
for (const m of menus) { const k = m.en; (multi.get(k) ?? multi.set(k, new Set()).get(k)).add(m.ar.trim()); }
const ambiguous = [...multi].filter(([, v]) => v.size > 1).slice(0, 40);
lines.push("## أسماء بترجمات متعددة (انتبه عند الكتابة)", "", "الاسم الإنجليزي الواحد قد يظهر بصيغ عربية مختلفة بحسب التطبيق؛ اكتب ما تراه في الحلقة نفسها.", "", "| الإنجليزية | الصيغ العربية |", "|---|---|");
for (const [k, v] of ambiguous) lines.push(`| ${k} | ${[...v].join(" ، ")} |`);
writeFileSync("knowledge-base/glossary/ui-menus.md", lines.join("\n") + "\n");

// خيارات القوائم المنسدلة الشائعة (أنواع الحسابات والدفاتر والضرائب...)
const keys = ["Current Assets", "Non-current Assets", "Fixed Assets", "Prepayments", "Receivable", "Payable", "Bank and Cash", "Credit Card", "Current Liabilities", "Non-current Liabilities", "Equity", "Current Year Earnings", "Income", "Other Income", "Expenses", "Depreciation", "Cost of Revenue", "Sales", "Purchases", "None", "Cash", "Bank", "Miscellaneous", "Percentage of Price", "Fixed", "Customer", "Vendor"];
const sl = ["# خيارات القوائم المنسدلة (إنجليزي ← عربي على الشاشة)", "", "| الإنجليزية | العربية |", "|---|---|"];
for (const k of keys) if (sel[k]) sl.push(`| ${k} | ${sel[k].join(" ، ")} |`);
sl.push("", `الجدول الكامل (${Object.keys(sel).length} خيارًا) في \`catalog/selections-ar.json\`.`);
writeFileSync("knowledge-base/glossary/ui-selections.md", sl.join("\n") + "\n");
console.log(`glossary written: ${total} menus in ${APPS.length} apps, ${keys.filter((k) => sel[k]).length} selection labels`);
