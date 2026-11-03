// قراءة فقط: يتصل بموقع Odoo 18 التجريبي ويعرض الوحدات المثبتة ونماذج مساحات العمل المشتركة.
process.loadEnvFile();
const base = process.env.ODOO18_URL;
const rpc = async (path, params, cookie) => {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", method: "call", params }) });
  return { r, j: await r.json() };
};
const dbs = await rpc("/web/database/list", {}).catch(() => null);
console.log("DBS", JSON.stringify(dbs?.j?.result ?? dbs?.j?.error?.data?.message ?? null));
const db = dbs?.j?.result?.[0] ?? new URL(base).hostname.split(".")[0];
const { r, j } = await rpc("/web/session/authenticate", { db, login: process.env.ODOO18_USER, password: process.env.ODOO18_PASSWORD });
if (j.error || !j.result?.uid) { console.log("LOGIN FAILED", JSON.stringify(j.error?.data?.message ?? j.result)); process.exit(1); }
const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
console.log("LOGGED IN uid", j.result.uid, "db", db, "version", j.result.server_version);
const call = async (model, method, args, kwargs = {}) => {
  const { j } = await rpc(`/web/dataset/call_kw/${model}/${method}`, { model, method, args, kwargs: { context: { lang: "en_US" }, ...kwargs } }, cookie);
  if (j.error) throw new Error(j.error.data?.message ?? j.error.message); return j.result;
};
const mods = await call("ir.module.module", "search_read", [[["state", "=", "installed"]]], { fields: ["name", "shortdesc"] });
console.log("INSTALLED", mods.map((m) => m.name).join(", "));
const imd = await call("ir.model.data", "search_read", [[["module", "in", ["coworking_space", "coworking_space_custom"]], ["model", "=", "ir.model"]]], { fields: ["res_id"] });
const ms = await call("ir.model", "read", [imd.map((x) => x.res_id)], { fields: ["model", "name", "transient"] });
const models = ms.filter((m) => !m.transient && !m.model.startsWith("report."));
console.log("MODELS", models.map((m) => m.model + " (" + m.name + ")").join("\n  "));
for (const m of models.map((x) => x.model)) {
  let f, cnt;
  try { f = await call(m, "fields_get", [], { attributes: ["type", "string", "required", "relation", "selection", "readonly"] }); cnt = await call(m, "search_count", [[]]); } catch (e) { console.log("\n##", m, "ERR", e.message.slice(0, 80)); continue; }
  console.log("\n##", m, "count=" + cnt);
  for (const [k, v] of Object.entries(f)) if ((!v.readonly || v.required) && !["create_uid","write_uid","create_date","write_date","display_name"].includes(k) && !k.startsWith("message_") && !k.startsWith("activity_") && !k.startsWith("website_message")) console.log(" ", k, v.type, v.required ? "REQ" : "", v.relation ?? "", v.type === "selection" ? JSON.stringify(v.selection) : "");
}
