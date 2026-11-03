// قراءة فقط: يبحث عن وحدة مساحات العمل المشتركة (coworking) في قاعدة الاستديو ويطبع نماذجها وحقولها.
import { chromium } from "playwright";
process.loadEnvFile();
const base = process.env.JAWAB_BASE_URL;
if (new URL(base).hostname !== "premium.jawab.pro") { console.error("host not allowed"); process.exit(1); }
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
await p.goto(base + "/web/login");
await p.fill("input[name=login]", process.env.JAWAB_USER); await p.fill("input[name=password]", process.env.JAWAB_PASSWORD);
await p.click(".oe_login_form button[type=submit]"); await p.waitForSelector(".o_app", { timeout: 60000 });
const call = async (model, method, args, kwargs = {}) => {
  const r = await (await ctx.request.post(`${base}/web/dataset/call_kw/${model}/${method}`, { data: { jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs: { context: { lang: "en_US" }, ...kwargs } } } })).json();
  if (r.error) throw new Error(r.error.data?.message ?? r.error.message); return r.result;
};
const mods = await call("ir.module.module", "search_read", [["|", "|", "|", ["name", "ilike", "cowork"], ["name", "ilike", "book"], ["name", "ilike", "member"], ["shortdesc", "ilike", "space"]]], { fields: ["name", "shortdesc", "state"] });
console.log("MODULES", JSON.stringify(mods));
const models = await call("ir.model", "search_read", [["|", "|", "|", ["model", "ilike", "cowork"], ["model", "ilike", "space"], ["model", "ilike", "desk"], ["model", "ilike", "workspace"]]], { fields: ["model", "name"] });
console.log("MODELS", JSON.stringify(models));
for (const m of models.map((x) => x.model)) {
  const f = await call(m, "fields_get", [], { attributes: ["type", "string", "required", "relation", "selection", "readonly"] });
  const cnt = await call(m, "search_count", [[]]);
  console.log("\n##", m, "count=" + cnt);
  for (const [k, v] of Object.entries(f)) if (!v.readonly || v.required) console.log(" ", k, v.type, v.required ? "REQ" : "", v.relation ?? "", v.type === "selection" ? JSON.stringify(v.selection) : "");
}
await b.close();
