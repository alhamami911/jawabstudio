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
console.log(JSON.stringify(await call("sale.subscription.plan", "search_read", [[]], { fields: ["name", "billing_period_value", "billing_period_unit"] })));
console.log(JSON.stringify(await call("hostel.folio", "search_read", [[["name", "=", "S00011"]]], { fields: ["plan_id", "frequency", "folio_state", "state"] })));
console.log("moves", await call("account.move", "search_count", [[]]), JSON.stringify(await call("hostel.folio", "search_read", [[["partner_id.ref", "like", "DEMO-"]]], { fields: ["name", "folio_state", "plan_id", "invoice_status", "move_count"] })));
