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
const show = async (m, fields, dom = [], lim = 10) => { try { console.log("\n##", m, JSON.stringify(await call(m, "search_read", [dom], { fields, limit: lim }))); } catch (e) { console.log("\n##", m, "ERR", e.message.slice(0, 150)); } };
await show("hostel.hostel", ["name", "payment_default_id", "pricelist_id", "company_id"]);
await show("hostel.floor", ["name"]);
await show("hostel.room_type", ["name", "cat_id", "hostel_id", "rate_input_type"]);
await show("hostel.room.beds", ["name", "product_id", "floor_id", "hostel_id", "avail_status", "list_price", "categ_id", "type", "detailed_type", "uom_id", "checkin_date", "checkout_date"]);
await show("hostel.reservation.source", ["name"]);
await show("hostel.reservation", ["name", "state", "partner_id", "hostel_id", "checkin", "checkout", "frequency", "categ_id", "deposit_policy", "contract_date", "payment_date", "real_checkout", "checkin_hour", "checkout_hour", "commission_type", "source_id", "pricelist_id", "duration_unit", "folio_id"]);
await show("hostel.reservation.line", ["line_id", "room_number", "categ_id", "product_uom_qty", "product_uom", "hostel_id"]);
await show("hostel.folio", ["name", "state", "partner_id", "frequency", "checkin_date", "checkout_date"]);
await show("res.partner", ["name", "email", "phone", "is_company", "company_type"]);
await show("product.category", ["complete_name"]);
await show("account.payment.term", ["name"]);
await show("product.pricelist", ["name", "currency_id"]);
await show("res.company", ["name", "currency_id", "country_id"]);
await show("account.journal", ["name", "type"]);
await show("hostel.services", ["name"], [], 3);
await show("trade.license.stage", ["name"]);
