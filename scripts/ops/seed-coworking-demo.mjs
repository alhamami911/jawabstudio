// يملأ موقع Odoo 18 التجريبي (وحدة coworking_space) ببيانات خيالية للاختبار. آمن لإعادة التشغيل: كل سجل يحمل DEMO ولا يُكرَّر.
// usage: node scripts/ops/seed-coworking-demo.mjs
process.loadEnvFile();
const base = process.env.ODOO18_URL;
if (new URL(base).hostname !== "18-modules.odoo.com") { console.error("host not allowed"); process.exit(1); }
const rpc = async (path, params, cookie) => {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", method: "call", params }) });
  return { r, j: await r.json() };
};
const db = (await rpc("/web/database/list", {})).j.result[0];
const { r, j } = await rpc("/web/session/authenticate", { db, login: process.env.ODOO18_USER, password: process.env.ODOO18_PASSWORD });
if (!j.result?.uid) { console.error("login failed"); process.exit(1); }
const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const call = async (model, method, args, kwargs = {}) => {
  const { j } = await rpc(`/web/dataset/call_kw/${model}/${method}`, { model, method, args, kwargs: { context: { lang: "en_US", tracking_disable: true }, ...kwargs } }, cookie);
  if (j.error) throw new Error(`${model}.${method}: ${(j.error.data?.message ?? j.error.message).slice(0, 600)}`); return j.result;
};
const report = {};
const ensure = async (model, domain, vals, key) => {
  const [hit] = await call(model, "search_read", [domain], { fields: ["id"], limit: 1 });
  if (hit) return hit.id;
  const id = await call(model, "create", [vals]);
  report[key ?? model] = (report[key ?? model] ?? 0) + 1;
  return id;
};
const step = async (label, fn) => { try { return await fn(); } catch (e) { console.log(`!! ${label}: ${e.message}`); return null; } };

const [hostel] = await call("hostel.hostel", "search_read", [[]], { fields: ["id", "name"], limit: 1 });
const HOSTEL = hostel.id;

// 1) عملاء وأعضاء
const partnerDefs = [
  ["DEMO-M1", "شركة نبراس للحلول الرقمية", "company"], ["DEMO-M2", "استوديو رسيل للتصميم", "company"],
  ["DEMO-M3", "مؤسسة الوفاء للاستشارات", "company"], ["DEMO-M4", "Horizon Startup Labs", "company"],
  ["DEMO-M5", "ليلى القحطاني", "person"], ["DEMO-M6", "Omar Haddad", "person"],
  ["DEMO-M7", "شركة أفق للتسويق", "company"], ["DEMO-M8", "Sara Mitchell", "person"],
];
const partner = {};
for (const [ref, name, kind] of partnerDefs)
  partner[ref] = await ensure("res.partner", [["ref", "=", ref]], { name, ref, company_type: kind, is_company: kind === "company", email: `${ref.toLowerCase()}@demo.test`, phone: `+966 50 000 ${String(1000 + partnerDefs.findIndex((d) => d[0] === ref))}` }, "partners");

// 2) أدوار ومصدر الحجز
const floors = {};
for (const f of ["2", "3", "Ground"]) floors[f] = await ensure("hostel.floor", [["name", "=", f]], { name: f }, "floors");
floors["1"] = (await call("hostel.floor", "search", [[["name", "=", "1"]]], { limit: 1 }))[0];
for (const s of ["Instagram", "LinkedIn", "Referral", "Walk-in"]) await ensure("hostel.reservation.source", [["name", "=", s]], { name: s }, "sources");

// 3) أنواع الوحدات
const rtypes = {};
for (const [name, rate] of [["DEMO Hot Desk", "daily"], ["DEMO Dedicated Desk", "monthly"], ["DEMO Private Office", "monthly"]])
  rtypes[name] = await step(`room_type ${name}`, () => ensure("hostel.room_type", [["name", "=", name]], { name, hostel_id: HOSTEL, rate_input_type: rate }, "room_types"));
console.log("room types", rtypes);
const cat = {};
for (const [name, id] of Object.entries(rtypes)) if (id) cat[name] = (await call("hostel.room_type", "read", [[id]], { fields: ["cat_id"] }))[0].cat_id[0];

// 0) العملة: ريال سعودي (الشركة نفسها تُحوَّل مرة واحدة يدويًا قبل وجود قيود محاسبية)
const sar = (await call("res.currency", "search", [[["name", "=", "SAR"], ["active", "in", [true, false]]]], { limit: 1 }))[0];
await call("res.currency", "write", [[sar], { active: true }]);
const [co] = await call("res.company", "read", [[1]], { fields: ["currency_id"] });
if (co.currency_id[0] !== sar) { console.error("company currency is not SAR: change it first"); process.exit(1); }
await call("product.pricelist", "write", [[(await call("product.pricelist", "search", [[]], { limit: 1 }))[0]], { currency_id: sar }]);

// 4) المقاعد والمكاتب (أسعار بالريال)
const seats = [
  ["DEMO Hot Desk H1", "DEMO Hot Desk", "2", 60], ["DEMO Hot Desk H2", "DEMO Hot Desk", "2", 60], ["DEMO Hot Desk H3", "DEMO Hot Desk", "2", 60],
  ["DEMO Desk D1", "DEMO Dedicated Desk", "2", 700], ["DEMO Desk D2", "DEMO Dedicated Desk", "2", 700], ["DEMO Desk D3", "DEMO Dedicated Desk", "3", 800],
  ["DEMO Office P1", "DEMO Private Office", "3", 2500], ["DEMO Office P2", "DEMO Private Office", "3", 3200],
];
const seatId = {};
for (const [name, rt, fl, price] of seats) {
  seatId[name] = await step(`seat ${name}`, async () => {
    const id = await ensure("hostel.room.beds", [["name", "=", name]], { name, hostel_id: HOSTEL, floor_id: floors[fl], categ_id: cat[rt], list_price: price, type: "service", detailed_type: "service" }, "seats");
    await call("hostel.room.beds", "write", [[id], { list_price: price }]);
    return id;
  });
}

// 5) خدمات (قاعات اجتماعات وغيرها) بالريال
const [meetCat] = await call("product.category", "search_read", [[["complete_name", "=", "Meeting Rooms"]]], { fields: ["id"], limit: 1 });
const svc = {};
for (const [name, price, hrs] of [["DEMO Meeting Room Alpha (hourly)", 100, 10], ["DEMO Meeting Room Beta (hourly)", 160, 10], ["DEMO Printing Pack", 40, 0]])
  svc[name] = await step(`service ${name}`, async () => {
    const id = await ensure("hostel.services", [["name", "=", name]], { name, price_unit: price, total_hours_allowed: hrs, categ_id: meetCat.id, type: "service", detailed_type: "service", list_price: price }, "services");
    await call("hostel.services", "write", [[id], { price_unit: price, list_price: price }]);
    return id;
  });

// 6) مواقف وخطوط هاتف ومراحل التراخيص
for (const [name, fl] of [["DEMO Parking P-01", "Ground"], ["DEMO Parking P-02", "Ground"], ["DEMO Parking P-03", "Ground"]])
  await step(`parking ${name}`, () => ensure("hostel.parking", [["name", "=", name]], { name, floor: fl }, "parking"));
for (const [name, c] of [["DEMO 011-555-0101", "normal"], ["DEMO 011-555-0102", "normal"], ["DEMO 011-555-0199", "vip"]])
  await step(`landline ${name}`, () => ensure("hostel.landline_number", [["name", "=", name]], { name, line_categ: c }, "landlines"));
const stage = {};
for (const s of ["Active", "Pending renewal", "Expired"]) stage[s] = await step(`license stage ${s}`, () => ensure("trade.license.stage", [["name", "=", s]], { name: s }, "license_stages"));

// 7) سيناريوهات العضويات
const uom = {};
for (const n of ["Day", "Month", "Year"]) uom[n] = (await call("uom.uom", "search", [[["name", "=", n]]], { limit: 1 }))[0];
const [pl] = await call("product.pricelist", "search_read", [[]], { fields: ["id"], limit: 1 });
const srcId = async (n) => (await call("hostel.reservation.source", "search", [[["name", "=", n]]], { limit: 1 }))[0];
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (n) => iso(new Date(Date.now() + n * 864e5));
const resDefs = [
  // key, شريك, مقعد, تكرار, وحدة, كمية, بداية(أيام), نهاية(أيام), هدف, مصدر, ملاحظات [نوع, نص]
  ["S1 active office 12m", "DEMO-M1", "DEMO Office P1", "monthly", "Month", 12, -30, 335, "active", "LinkedIn", [["parking", "Extra parking P-01"], ["amenity", "Extra monitor"]]],
  ["S2 active desk 6m", "DEMO-M2", "DEMO Desk D1", "monthly", "Month", 6, -60, 120, "active", "Referral", []],
  ["S3 expiring in 10d", "DEMO-M3", "DEMO Desk D2", "monthly", "Month", 3, -80, 10, "active", "Instagram", [["discount", "10% loyalty discount"]]],
  ["S4 hot desk daily", "DEMO-M7", "DEMO Hot Desk H2", "daily", "Day", 20, -5, 15, "active", "Walk-in", []],
  ["S5 draft office", "DEMO-M4", "DEMO Office P2", "monthly", "Month", 12, 15, 380, "draft", "LinkedIn", [["other", "Start date to be confirmed"]]],
  ["S6 draft hot desk", "DEMO-M5", "DEMO Hot Desk H1", "daily", "Day", 10, 2, 12, "draft", "Instagram", []],
  ["S7 draft desk", "DEMO-M6", "DEMO Desk D3", "monthly", "Month", 6, 7, 187, "draft", "Referral", [["discount", "5% startup offer"]]],
  ["S8 confirmed not started", "DEMO-M8", "DEMO Hot Desk H3", "daily", "Day", 15, 5, 20, "confirm", "Walk-in", []],
  ["S9 cancelled", "DEMO-M5", "DEMO Desk D3", "monthly", "Month", 3, 20, 110, "cancel", "Instagram", []],
];
const reservations = {};
for (const [key, pref, seat, freq, unit, qty, s0, s1, target, source, notes] of resDefs) {
  const [seatRec] = await call("hostel.room.beds", "read", [[seatId[seat]]], { fields: ["product_id", "categ_id", "list_price"] });
  const tag = `DEMO-RES ${key}`;
  const sourceId = await srcId(source);
  const [hit] = await call("hostel.reservation.note", "search_read", [[["description", "=", tag]]], { fields: ["reservation_id"], limit: 1 });
  const rid = hit ? hit.reservation_id[0] : await step(`reservation ${key}`, () => call("hostel.reservation", "create", [{
    partner_id: partner[pref], hostel_id: HOSTEL, pricelist_id: pl.id, frequency: freq, duration_unit: unit === "Month" ? "month" : "day", source_id: sourceId,
    categ_id: seatRec.categ_id[0], checkin: addDays(s0), checkout: addDays(s1), real_checkout: addDays(s1), contract_date: addDays(s0), payment_date: addDays(s0),
    deposit_policy: "no_deposit", commission_type: "fixed", checkin_hour: 9, checkout_hour: 18,
    reservation_line: [[0, 0, { categ_id: seatRec.categ_id[0], room_number: seatRec.product_id[0], product_uom_qty: qty, product_uom: uom[unit], hostel_id: HOSTEL, price: seatRec.list_price }]],
    contract_note_ids: [[0, 0, { description: tag, note_type: "other" }], ...notes.map(([t, d]) => [0, 0, { description: d, note_type: t }])],
  }]));
  if (!rid) continue;
  if (!hit) report.reservations = (report.reservations ?? 0) + 1;
  reservations[key] = rid;
  const state = async () => (await call("hostel.reservation", "read", [[rid]], { fields: ["state"] }))[0].state;
  if (target === "cancel" && (await state()) === "draft") { await step(`cancel ${key}`, () => call("hostel.reservation", "cancel_reservation", [[rid]])); continue; }
  if (target === "draft") continue;
  if ((await state()) === "draft") await step(`confirm ${key}`, async () => { const w = await call("confirm.reservation.wizard", "create", [{ reservation_id: rid }]); await call("confirm.reservation.wizard", "action_confirm", [[w]]); report.confirmed = (report.confirmed ?? 0) + 1; });
  if (target === "active" && (await state()) === "confirm") await step(`folio ${key}`, async () => { const w = await call("create.subscription.wizard", "create", [{ reservation_id: rid }]); await call("create.subscription.wizard", "action_confirm", [[w]]); report.subscriptions = (report.subscriptions ?? 0) + 1; });
}

// 7a) خطة فوترة أسبوعية لحجوزات اليوم (Odoo لا يدعم خطة يومية)
const dailyPlan = await ensure("sale.subscription.plan", [["name", "=", "Weekly"]], { name: "Weekly", billing_period_value: 1, billing_period_unit: "week" }, "plans");
await call("hostel.folio", "write", [await call("hostel.folio", "search", [[["partner_id.ref", "like", "DEMO-"], ["frequency", "=", "daily"], ["folio_state", "=", "draft"]]]), { plan_id: dailyPlan }]);

// 7b) تأكيد الاشتراكات (folio) ليصير الحجز «جارٍ» وتُولَّد الفواتير
for (const f of await call("hostel.folio", "search_read", [[["partner_id.ref", "like", "DEMO-"], ["folio_state", "=", "draft"]]], { fields: ["name"] }))
  await step(`confirm folio ${f.name}`, async () => { const w = await call("confirm.confirmation.wizard", "create", [{ folio_id: f.id }]); await call("confirm.confirmation.wizard", "action_confirm", [[w]]); report.folios_confirmed = (report.folios_confirmed ?? 0) + 1; });

// 7c) ترحيل الفواتير وتسجيل مدفوعات: S1 مدفوعة كاملة، S2 دفعة جزئية، وبقية الفواتير مفتوحة
const invs = await call("account.move", "search_read", [[["partner_id.ref", "like", "DEMO-"], ["move_type", "=", "out_invoice"]]], { fields: ["name", "state", "partner_id", "amount_total", "payment_state", "invoice_date"], order: "id" });
for (const m of invs.filter((x) => x.state === "draft")) await step(`post ${m.id}`, () => call("account.move", "action_post", [[m.id]]));
const payPlan = { "DEMO-M1": 1, "DEMO-M2": 0.5 };
const posted = await call("account.move", "search_read", [[["partner_id.ref", "like", "DEMO-"], ["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["payment_state", "=", "not_paid"]]], { fields: ["partner_id", "amount_total"], order: "id" });
await call("res.company", "write", [[1], { email: "info@demo.test" }]);
await call("res.partner", "write", [[(await call("res.users", "read", [[(await rpc("/web/session/get_session_info", {}, cookie)).j.result.uid]], { fields: ["partner_id"] }))[0].partner_id[0]], { email: "admin@demo.test" }]);
const paidOnce = new Set();
for (const m of posted) {
  const ref = (await call("res.partner", "read", [[m.partner_id[0]]], { fields: ["ref"] }))[0].ref;
  if (!(ref in payPlan) || paidOnce.has(ref) || await call("account.payment", "search_count", [[["partner_id", "=", m.partner_id[0]]]])) continue;
  paidOnce.add(ref);
  await step(`pay ${ref}`, async () => {
    const w = await call("account.payment.register", "create", [{ amount: m.amount_total * payPlan[ref] }], { context: { lang: "en_US", active_model: "account.move", active_ids: [m.id] } });
    await call("account.payment.register", "action_create_payments", [[w]], { context: { lang: "en_US", active_model: "account.move", active_ids: [m.id] } });
    report.payments = (report.payments ?? 0) + 1;
  });
}

// 8) استخدام قاعات الاجتماعات
const rows = [["S1 active office 12m", "DEMO Meeting Room Alpha (hourly)", -7, 2], ["S1 active office 12m", "DEMO Meeting Room Beta (hourly)", -3, 3.5], ["S2 active desk 6m", "DEMO Meeting Room Alpha (hourly)", -10, 1.5], ["S4 hot desk daily", "DEMO Printing Pack", -2, 1]];
for (const [key, sv, d, hours] of rows) {
  if (!reservations[key] || !svc[sv]) continue;
  const dom = [["reservation_id", "=", reservations[key]], ["service_id", "=", svc[sv]], ["date", "=", addDays(d)]];
  await step(`usage ${key}`, () => ensure("hostel.service.usage", dom, { reservation_id: reservations[key], service_id: svc[sv], date: addDays(d), hours_used: hours }, "service_usage"));
}

// 9) تراخيص تجارية
for (const [key, num, expiry, st] of [["S1 active office 12m", "1010000001", 300, "Active"], ["S3 expiring in 10d", "1010000003", 20, "Pending renewal"], ["S2 active desk 6m", "1010000002", -15, "Expired"]]) {
  if (!reservations[key]) continue;
  const [r] = await call("hostel.reservation", "read", [[reservations[key]]], { fields: ["partner_id"] });
  await step(`license ${num}`, () => ensure("trade.license", [["trade_license_number", "=", num]], { reservation_id: reservations[key], partner_id: r.partner_id[0], trade_license_number: num, trade_license_expiry: addDays(expiry), trade_license_stage_id: stage[st], desk_number: key.slice(0, 2), comment: "DEMO license" }, "licenses"));
}

// 10) فرص CRM بالريال
for (const [name, rev, pref] of [["DEMO Lead: private office for 6 staff", 18000, "DEMO-M4"], ["DEMO Lead: startup hot desks", 3600, "DEMO-M5"], ["DEMO Lead: team meeting room package", 9500, "DEMO-M7"]])
  await step(`lead ${name}`, () => ensure("crm.lead", [["name", "=", name]], { name, expected_revenue: rev, partner_id: partner[pref], type: "opportunity" }, "leads"));

console.log("\nCREATED", JSON.stringify(report));





