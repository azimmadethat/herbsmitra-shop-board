// WooCommerce data layer for Shop Board. Drop-in replacement for the kit's
// _board.js (which reads Shopify). Returns the EXACT snapshot shape the five
// designs and public/board.js were built against, so every theme works
// unchanged. Only the data source changes: the WooCommerce REST API.
//
// Secrets live in Cloudflare environment variables, never in this file:
//   WC_URL, WC_KEY, WC_SECRET   (required, read-only WooCommerce API key)
//   BOARD_KEY                   (required, the ?k= key on the board link)
//   STORE_NAME, STORE_TZ        (optional, defaults: Herbs Mitra, Asia/Kolkata)
//   META_TOKEN, META_AD_ACCOUNT (optional, ad numbers, same as the kit)
//   ANTHROPIC_API_KEY or OPENAI_API_KEY (optional, voice answers)
//   BREAK_EVEN_ROAS             (optional, default 2)
//
// Differences from the Shopify version, stated plainly:
// - History is built by reading orders over the last 14 days and adding them
//   up here (WooCommerce has no ShopifyQL). Yesterday, the 14-day projection
//   and month-best all work. The "best same weekday in 8 weeks" insight does
//   not fire, it needs 56 days of history.
// - "New customer" is checked for every order today (one cheap count request
//   per customer, cached 24h, fetched 20 at a time).
// - The snapshot also carries the ops page data: status pipeline, COD/prepaid
//   split, product sales with revenue, new/returning/guest split, low stock
//   and the full orders-today list. The orders-today list is only sent when
//   /api/state is called with ?full=1, so the TV board stays light.
// - First names come from the order's billing name. Only the first name and
//   the city ever reach the screen. No phone number, email or street address
//   is included in the snapshot.
// - Cancelled, refunded and failed orders are excluded from today's sales,
//   exactly like the kit excludes cancelled Shopify orders.
// - Order tiers are retuned for this store: most orders are one Rs 398
//   bottle, so tiers are 796 / 1194 / 2000 instead of the kit's 1200 / 2000 /
//   4000. Otherwise almost no order would ever get confetti.
import { cached, cacheGet, cachePut, local, midnightISO, addDays, shortName, metaCampaigns, money } from "./_lib.js";
import { complete } from "./_ai.js";

const MILESTONES = [10000, 25000, 50000, 75000, 100000, 150000, 200000, 300000, 500000, 1000000];
const THEMES = ["mango", "chai", "monsoon", "rasmalai", "bazaar", "dosa", "kulfi"];
const HATS = ["party", "shades", "crown", "flower", "headphones", "bowtie", "none"];
const CANCELLED_STATUSES = new Set(["cancelled", "refunded", "failed"]);
const HISTORY_DAYS = 28;

const titleCase = s => String(s || "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

let LATEST_TODAY_CACHE = {
  date: "",
  revenue: 0,
  ordersCount: 0,
  ordersMap: new Map(),
};

function toB64(s) {
  if (typeof btoa === "function") return btoa(s);
  return Buffer.from(s, "utf8").toString("base64");
}

function wooBase(env) {
  const url = String(env.WC_URL || "").replace(/\/+$/, "");
  if (!url || !env.WC_KEY || !env.WC_SECRET) {
    throw new Error("WooCommerce is not connected: WC_URL, WC_KEY and WC_SECRET must be set in Cloudflare secrets.");
  }
  return url;
}

/** Raw WooCommerce REST call. Returns { data, total, totalPages }. */
export async function wooRaw(env, path, params = {}) {
  const base = wooBase(env);
  const u = new URL(base + "/wp-json/wc/v3" + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u, {
    headers: { Accept: "application/json", Authorization: "Basic " + toB64(env.WC_KEY + ":" + env.WC_SECRET) },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    let hint = "";
    if (r.status === 401) hint = " The key or secret is wrong, or the site is not on HTTPS, or a security plugin is stripping the Authorization header. Do not fall back to putting the key in the URL.";
    if (r.status === 404) hint = " Check WC_URL: it must be the store address, e.g. https://herbsmitra.com, and pretty permalinks must be on.";
    throw new Error(`WooCommerce HTTP ${r.status}.${hint} ${body.slice(0, 200)}`);
  }
  return { data: await r.json(), total: r.headers.get("X-WP-Total"), totalPages: r.headers.get("X-WP-TotalPages") };
}

export async function wooGet(env, path, params = {}) {
  return (await wooRaw(env, path, params)).data;
}

export async function wooRawWithRetry(env, path, params = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await wooRaw(env, path, params);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
    }
  }
}

/** All orders in a date window, paged concurrently in parallel. `fields` keeps the payloads small. */
async function wooOrders(env, { after, before, fields, maxPages = 30, order = "asc" }) {
  const params = { per_page: 100, page: 1, order, orderby: "date", status: "any", _fields: fields };
  if (after) params.after = after;
  if (before) params.before = before;

  try {
    const p1 = await wooRawWithRetry(env, "/orders", params);
    const out = Array.isArray(p1.data) ? [...p1.data] : [];
    const totalPages = Math.min(parseInt(p1.totalPages || "1", 10) || 1, maxPages);

    if (totalPages > 1) {
      const concurrency = 6;
      for (let p = 2; p <= totalPages; p += concurrency) {
        const batch = [];
        for (let b = p; b < Math.min(p + concurrency, totalPages + 1); b++) {
          batch.push(
            wooRawWithRetry(env, "/orders", { ...params, page: b })
              .then(res => (Array.isArray(res.data) ? res.data : []))
              .catch(() => [])
          );
        }
        const batchRes = await Promise.all(batch);
        for (const pageOrders of batchRes) {
          out.push(...pageOrders);
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

const TODAY_FIELDS = "id,number,date_created,date_created_gmt,status,total,billing,shipping,line_items,customer_id,payment_method,payment_method_title,meta_data";

function mapOrder(o, storeName, tz) {
  const gmt = o.date_created_gmt ? new Date(o.date_created_gmt + "Z") : new Date(o.date_created);
  const at = local(gmt, tz);
  const billing = o.billing || {}, shipping = o.shipping || {};
  const first = titleCase(String(billing.first_name || "").trim().split(/\s+/)[0] || "");
  let visitorId = "";
  let journey = null;
  if (Array.isArray(o.meta_data)) {
    for (const m of o.meta_data) {
      if (m.key === "sa_visitor_id" || m.key === "_sa_vid") visitorId = String(m.value || "");
      if (m.key === "sa_journey" || m.key === "_sa_journey") {
        try { journey = typeof m.value === "string" ? JSON.parse(m.value) : m.value; } catch (e) {}
      }
    }
  }
  return {
    id: o.id,
    name: "#" + String(o.number),
    at,
    cancelled: CANCELLED_STATUSES.has(String(o.status || "").toLowerCase()),
    amount: parseFloat(o.total) || 0,
    city: titleCase(String(shipping.city || billing.city || "").trim()),
    first,
    status: String(o.status || "").toLowerCase(),
    pay: o.payment_method_title || "",
    method: String(o.payment_method || "").toLowerCase(),
    customerId: o.customer_id || 0,
    new: false,
    visitorId,
    journey,
    rawDate: o.date_created_gmt ? o.date_created_gmt + "Z" : o.date_created,
    items: (o.line_items || []).map(li => ({ name: shortName(li.name, storeName), qty: li.quantity || 1, amount: parseFloat(li.total) || 0 })),
  };
}

async function ordersSince(env, sinceISO, storeName, tz, todayDate) {
  // Query starting 1 hour before local midnight to catch all today's orders,
  // then strictly filter to today's local date so yesterday's orders never bleed in after 12am.
  const after = todayDate ? `${addDays(todayDate, -1)}T23:00:00` : sinceISO;
  const raw = await wooOrders(env, { after, fields: TODAY_FIELDS, maxPages: 25 });
  return raw.map(o => mapOrder(o, storeName, tz)).filter(o => !todayDate || o.at.date === todayDate);
}

async function ordersForDay(env, targetDate, storeName, tz) {
  // Query orders covering the target day (with 1-hour buffer on both sides)
  const after = addDays(targetDate, -1) + "T23:00:00";
  const before = addDays(targetDate, 1) + "T01:00:00";
  const raw = await wooOrders(env, { after, before, fields: TODAY_FIELDS, maxPages: 25 });
  return raw.map(o => mapOrder(o, storeName, tz)).filter(o => o.at.date === targetDate);
}

async function ordersForDateRange(env, startDate, endDate, storeName, tz, maxPages = 40) {
  // Query orders covering window from startDate to endDate (with buffer)
  const after = addDays(startDate, -1) + "T23:00:00";
  const before = addDays(endDate, 1) + "T01:00:00";
  const raw = await wooOrders(env, { after, before, fields: TODAY_FIELDS, maxPages, order: "desc" });
  return raw.map(o => mapOrder(o, storeName, tz)).filter(o => o.at.date >= startDate && o.at.date <= endDate);
}

async function wooSalesReport(env, startDate, endDate) {
  try {
    const raw = await wooRaw(env, "/reports/sales", { date_min: startDate, date_max: endDate });
    if (Array.isArray(raw.data) && raw.data.length > 0) {
      return raw.data[0];
    }
  } catch (err) {
    console.warn("WooCommerce sales report fetch error:", err.message);
  }
  return null;
}

/** 14 days of hourly sales and per-day order counts, aggregated here. */
async function history(env, today, storeName, tz) {
  return cached(env, `hist-woo-${wooBase(env)}-${today}`, 30 * 60, async () => {
    try {
      const yday = addDays(today, -1);
      const from = addDays(today, -14);
      // Fetch recent days first with order: "desc" so latest dates and yesterday are prioritized
      const light = await wooOrders(env, {
        after: from + "T00:00:00", before: today + "T00:00:00",
        fields: "date_created_gmt,total,status", maxPages: 25, order: "desc",
      });
      const hours = {}, orders = {};
      for (const o of light) {
        if (CANCELLED_STATUSES.has(String(o.status || "").toLowerCase())) continue;
        const at = local(new Date(o.date_created_gmt + "Z"), tz);
        (hours[at.date] = hours[at.date] || Array(24).fill(0))[at.hour] += parseFloat(o.total) || 0;
        orders[at.date] = (orders[at.date] || 0) + 1;
      }

      // Explicitly ensure yesterday (yday) is 100% complete with all items & hours:
      const items = {};
      const yOrders = await wooOrders(env, {
        after: addDays(yday, -1) + "T23:00:00", before: today + "T01:00:00",
        fields: "date_created_gmt,total,status,line_items", maxPages: 10, order: "desc",
      });
      const dayItems = {};
      hours[yday] = Array(24).fill(0);
      orders[yday] = 0;
      for (const o of yOrders) {
        if (CANCELLED_STATUSES.has(String(o.status || "").toLowerCase())) continue;
        const at = local(new Date(o.date_created_gmt + "Z"), tz);
        if (at.date === yday) {
          hours[yday][at.hour] += parseFloat(o.total) || 0;
          orders[yday] = (orders[yday] || 0) + 1;
          for (const li of o.line_items || []) {
            const n = shortName(li.name, storeName);
            dayItems[n] = (dayItems[n] || 0) + (li.quantity || 1);
          }
        }
      }
      items[yday] = dayItems;
      return { hours, orders, items };
    } catch (e) {
      return { hours: {}, orders: {}, items: {}, error: String(e.message || e) };
    }
  });
}

/** New-customer check: 1 if this is the customer's only order ever. Checked for
 *  every order today, one cheap count request per customer, cached 24h and
 *  fetched 20 at a time so the first load of the day stays fast. */
async function markNew(env, orders) {
  const ids = [...new Set(orders.filter(o => o.customerId).map(o => o.customerId))];
  const seen = new Map();
  for (let i = 0; i < ids.length; i += 20) {
    const results = await Promise.all(ids.slice(i, i + 20).map(async id => {
      try {
        const key = `cust-woo-${id}`;
        const hit = await cacheGet(env, key);
        if (hit !== null) return [id, hit];
        const { total } = await wooRaw(env, "/orders", { customer: id, per_page: 1, _fields: "id" });
        const isNew = String(total || "0") === "1";
        await cachePut(env, key, isNew, 86400);
        return [id, isNew];
      } catch (e) { return [id, false]; }
    }));
    for (const [id, v] of results) seen.set(id, v);
  }
  for (const o of orders) o.new = o.customerId ? !!seen.get(o.customerId) : false;
}

/** Products running low: stock at or below the product's low-stock amount, or
 *  out of stock. Returns null when the key cannot read products. */
async function lowStock(env) {
  return cached(env, `lowstock-woo-${wooBase(env)}`, 30 * 60, async () => {
    try {
      const out = [];
      let page = 1, totalPages = 1;
      do {
        const { data, totalPages: tp } = await wooRaw(env, "/products", { per_page: 100, page, _fields: "id,name,stock_quantity,stock_status,low_stock_amount,manage_stock" });
        for (const p of (Array.isArray(data) ? data : [])) {
          if (p.manage_stock === false) continue;
          const qty = p.stock_quantity;
          const low = p.low_stock_amount === "" || p.low_stock_amount == null ? 5 : +p.low_stock_amount;
          if (qty !== null && qty !== undefined && qty <= low) out.push({ name: p.name, stock: qty });
          else if (p.stock_status === "outofstock") out.push({ name: p.name, stock: 0 });
        }
        totalPages = parseInt(tp || "1", 10) || 1;
        page++;
      } while (page <= totalPages && page <= 5);
      return out.slice(0, 20);
    } catch (e) { return null; }
  });
}

const dayTotal = (h, d) => (h.hours[d] || []).reduce((a, b) => a + b, 0);
/** Sales on day d up to the same time of day as now (the current hour counted pro rata). */
const byNow = (h, d, l) => {
  const row = h.hours[d] || [];
  let s = 0;
  for (let i = 0; i < l.hour; i++) s += row[i] || 0;
  return s + (row[l.hour] || 0) * (l.minute / 60);
};

export async function snapshot(env, targetDate = null, targetEndDate = null) {
  const now = new Date();
  const tz = env.STORE_TZ || "Asia/Kolkata";
  const storeName = env.STORE_NAME || "Herbs Mitra";
  const l = local(now, tz);

  const isDatePattern = d => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d));
  let startDate = isDatePattern(targetDate) ? targetDate : null;
  let endDate = isDatePattern(targetEndDate) ? targetEndDate : null;

  if (startDate && endDate) {
    if (startDate > endDate) {
      const tmp = startDate; startDate = endDate; endDate = tmp;
    }
    if (startDate === endDate) {
      endDate = null;
    }
  }

  const isRange = Boolean(startDate && endDate && startDate !== endDate);
  const isCustomDate = !isRange && Boolean(startDate && startDate !== l.date);
  const today = isRange ? `${startDate} to ${endDate}` : (isCustomDate ? startDate : l.date);

  if (isRange) {
    const isHistoricalRange = endDate < l.date;
    const cacheKey = `snap-range-${startDate}_${endDate}`;
    const cachedSnap = await cacheGet(env, cacheKey);
    if (cachedSnap) return cachedSnap;
  } else if (isCustomDate) {
    const cachedSnap = await cacheGet(env, `snap-day-${today}`);
    if (cachedSnap) return cachedSnap;
  } else {
    const cachedLive = await cacheGet(env, `snap-live-${today}`);
    if (cachedLive) return cachedLive;
  }

  const yday = addDays(l.date, -1);
  const breakEven = +(env.BREAK_EVEN_ROAS || 2);
  const effL = (isCustomDate || isRange) ? { ...l, hour: 23, minute: 59, date: isRange ? endDate : today } : l;

  const metaRange = isRange
    ? { since: startDate, until: endDate }
    : (isCustomDate ? { since: startDate, until: startDate } : { since: l.date, until: l.date });

  const spanDays = isRange
    ? Math.max(1, Math.round((new Date(endDate + "T23:59:59Z") - new Date(startDate + "T00:00:00Z")) / 86400000))
    : 1;
  const isLongRange = isRange && spanDays > 14;

  const [{ orders: all, report: salesReport }, hist, meta, stock] = await Promise.all([
    isRange
      ? (isLongRange
          ? Promise.all([
              ordersForDateRange(env, startDate, endDate, storeName, tz, 2),
              wooSalesReport(env, startDate, endDate),
            ]).then(([list, report]) => ({ orders: list, report }))
          : ordersForDateRange(env, startDate, endDate, storeName, tz, 40).then(list => ({ orders: list, report: null })))
      : (isCustomDate
          ? ordersForDay(env, today, storeName, tz).then(list => ({ orders: list, report: null }))
          : ordersSince(env, midnightISO(now, tz), storeName, tz, today).then(async list => ({ orders: list, report: null }))),
    history(env, l.date, storeName, tz),
    metaCampaigns(env, storeName, metaRange).catch(e => ({ error: String(e.message || e), campaigns: [] })),
    lowStock(env).catch(() => null),
  ]);

  if (!isCustomDate && !isRange) {
    if (LATEST_TODAY_CACHE.date !== today) {
      LATEST_TODAY_CACHE = {
        date: today,
        revenue: 0,
        ordersCount: 0,
        ordersMap: new Map(),
      };
    }
    for (const o of all) {
      if (o.id && o.at.date === today) LATEST_TODAY_CACHE.ordersMap.set(o.id, o);
    }
  }

  const effectiveAll = (isCustomDate || isRange)
    ? all
    : Array.from(LATEST_TODAY_CACHE.ordersMap.values());

  const inWindow = isRange
    ? (d => d >= startDate && d <= endDate)
    : (d => d === today);

  const orders = effectiveAll
    .filter(o => !o.cancelled && inWindow(o.at.date))
    .sort((a, b) => (a.id || 0) - (b.id || 0));

  if (!isCustomDate && !isRange) {
    await markNew(env, orders.slice(0, 6));
  }

  const calculatedRev = orders.reduce((a, o) => a + o.amount, 0);
  let finalRev = Math.round(calculatedRev);
  let finalOrdersCount = orders.length;

  if (isLongRange && salesReport) {
    const repSales = parseFloat(salesReport.total_sales || salesReport.net_sales || 0);
    const repOrders = parseInt(salesReport.total_orders || 0, 10);
    if (repSales > 0 || repOrders > 0) {
      finalRev = Math.round(repSales);
      finalOrdersCount = repOrders;
    }
  } else if (!isCustomDate && !isRange) {
    // Monotonic ratchet: live sales and order counts never decrease within the same day!
    if (LATEST_TODAY_CACHE.date === today) {
      finalRev = Math.max(finalRev, LATEST_TODAY_CACHE.revenue);
      finalOrdersCount = Math.max(finalOrdersCount, LATEST_TODAY_CACHE.ordersCount);
      LATEST_TODAY_CACHE.revenue = finalRev;
      LATEST_TODAY_CACHE.ordersCount = finalOrdersCount;
    }
  }
  const rev = finalRev;

  const cityMap = {};
  for (const o of orders) {
    const e = cityMap[o.city || "Unknown"] || (cityMap[o.city || "Unknown"] = { city: o.city || "Unknown", orders: 0, revenue: 0 });
    e.orders++; e.revenue += o.amount;
  }
  const cities = Object.values(cityMap).sort((a, b) => b.orders - a.orders || b.revenue - a.revenue).slice(0, 10)
    .map(c => ({ city: c.city, orders: c.orders, revenue: Math.round(c.revenue) }));
  const rejected = {};
  for (const st of ["cancelled", "refunded", "failed"]) {
    const list = effectiveAll.filter(o => inWindow(o.at.date) && o.status === st);
    rejected[st] = { orders: list.length, amount: Math.round(list.reduce((a, o) => a + o.amount, 0)) };
  }
  const statuses = {};
  for (const st of ["pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed"]) {
    const list = effectiveAll.filter(o => inWindow(o.at.date) && o.status === st);
    statuses[st] = { orders: list.length, amount: Math.round(list.reduce((a, o) => a + o.amount, 0)) };
  }
  // COD is payment_method "cod" in WooCommerce.
  const isCod = o => o.method === "cod" || /cash on delivery/i.test(o.pay || "") || /^\s*cod\s*$/i.test(o.pay || "");
  const codList = orders.filter(isCod), preList = orders.filter(o => !isCod(o));
  let payment = {
    cod: { orders: codList.length, revenue: Math.round(codList.reduce((a, o) => a + o.amount, 0)) },
    prepaid: { orders: preList.length, revenue: Math.round(preList.reduce((a, o) => a + o.amount, 0)) },
  };
  if (isLongRange && salesReport && finalOrdersCount > orders.length && orders.length > 0) {
    const codSampleOrders = codList.length;
    const preSampleOrders = preList.length;
    const codSampleRev = codList.reduce((a, o) => a + o.amount, 0);
    const preSampleRev = preList.reduce((a, o) => a + o.amount, 0);
    const totalSampleRev = (codSampleRev + preSampleRev) || 1;
    const totalSampleOrders = (codSampleOrders + preSampleOrders) || 1;
    const codRatioOrders = codSampleOrders / totalSampleOrders;
    const codRatioRev = codSampleRev / totalSampleRev;
    const scaledCodOrders = Math.round(finalOrdersCount * codRatioOrders);
    const scaledPreOrders = Math.max(0, finalOrdersCount - scaledCodOrders);
    const scaledCodRev = Math.round(finalRev * codRatioRev);
    const scaledPreRev = Math.max(0, finalRev - scaledCodRev);
    payment = {
      cod: { orders: scaledCodOrders, revenue: scaledCodRev },
      prepaid: { orders: scaledPreOrders, revenue: scaledPreRev },
    };
  }
  const prodMap = {};
  for (const o of orders) for (const it of o.items) {
    const e = prodMap[it.name] || (prodMap[it.name] = { name: it.name, qty: 0, revenue: 0 });
    e.qty += it.qty; e.revenue += it.amount || 0;
  }
  const product_sales = Object.values(prodMap).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 10)
    .map(p => ({ name: p.name, qty: p.qty, revenue: Math.round(p.revenue) }));
  let customers = {
    new: orders.filter(o => o.customerId && o.new).length,
    returning: orders.filter(o => o.customerId && !o.new).length,
    guest: orders.filter(o => !o.customerId).length,
  };
  if (isLongRange && salesReport && finalOrdersCount > orders.length && orders.length > 0) {
    const repCust = parseInt(salesReport.total_customers || 0, 10);
    if (repCust > 0) {
      customers = {
        new: repCust,
        returning: Math.max(0, finalOrdersCount - repCust),
        guest: 0,
      };
    }
  }

  // Compare benchmark: yesterday, or the most recent day with recorded sales if yesterday was inactive
  let compareDay = yday;
  const histDayTotal = d => (hist && hist.hours && hist.hours[d] ? dayTotal(hist, d) : 0);
  if (!histDayTotal(compareDay) && hist && hist.hours) {
    const pastSalesDays = Object.keys(hist.hours).filter(d => d < l.date && histDayTotal(d) > 0).sort();
    if (pastSalesDays.length) {
      compareDay = pastSalesDays[pastSalesDays.length - 1];
    }
  }

  const yByNow = (isCustomDate || isRange) ? dayTotal(hist, compareDay) : byNow(hist, compareDay, l);
  const yTotal = dayTotal(hist, compareDay);
  const vsYesterdayPct = yByNow > 0
    ? Math.round((rev - yByNow) / yByNow * 100)
    : (yTotal > 0 ? Math.round((rev - yTotal) / yTotal * 100) : (rev > 0 ? 100 : null));
  const projection = (isCustomDate || isRange) ? Math.round(rev) : project(hist, rev, l, today);

  const camps = (meta && meta.campaigns) || [];
  const spend = camps.reduce((a, c) => a + c.spend, 0), metaRev = camps.reduce((a, c) => a + c.value, 0);
  const metaAt = meta && meta.at ? local(new Date(meta.at), tz) : null;

  const products = {};
  for (const o of orders) for (const it of o.items) products[it.name] = (products[it.name] || 0) + it.qty;

  let monthBest = null;
  if (isLongRange && salesReport && salesReport.totals && Object.keys(salesReport.totals).length > 0) {
    const entries = Object.entries(salesReport.totals);
    let maxRev = -1;
    let bestD = null;
    for (const [d, t] of entries) {
      const s = parseFloat(t.sales || 0);
      if (s > maxRev) {
        maxRev = s;
        bestD = d;
      }
    }
    if (bestD && maxRev > 0) {
      monthBest = { date: bestD, revenue: Math.round(maxRev) };
    }
  } else if (isRange) {
    const dayMap = {};
    for (const o of orders) dayMap[o.at.date] = (dayMap[o.at.date] || 0) + o.amount;
    const days = Object.keys(dayMap);
    if (days.length) {
      const bestD = days.reduce((a, b) => dayMap[b] > dayMap[a] ? b : a);
      monthBest = { date: bestD, revenue: Math.round(dayMap[bestD]) };
    }
  } else {
    const month = today.slice(0, 8);
    const monthDays = Object.keys(hist.hours).filter(d => d.startsWith(month));
    const best = monthDays.length ? monthDays.reduce((a, d) => dayTotal(hist, d) > dayTotal(hist, a) ? d : a) : null;
    monthBest = best ? { date: best, revenue: Math.round(dayTotal(hist, best)) } : null;
  }

  // Daily History for Range or Calendar
  let dailyHistory = [];
  if (isLongRange && salesReport && salesReport.totals && Object.keys(salesReport.totals).length > 0) {
    dailyHistory = Object.entries(salesReport.totals).map(([d, t]) => {
      const dOrders = parseInt(t.orders || 0, 10);
      const dRev = Math.round(parseFloat(t.sales || 0));
      return {
        date: d,
        orders: dOrders,
        revenue: dRev,
        aov: dOrders > 0 ? Math.round(dRev / dOrders) : 0,
        is_today: d === l.date
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
  } else if (isRange) {
    const dayMap = {};
    for (const o of effectiveAll) {
      if (o.cancelled) continue;
      const d = o.at.date;
      if (inWindow(d)) {
        if (!dayMap[d]) dayMap[d] = { date: d, orders: 0, revenue: 0 };
        dayMap[d].orders++;
        dayMap[d].revenue += o.amount;
      }
    }
    dailyHistory = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      date: d.date,
      orders: d.orders,
      revenue: Math.round(d.revenue),
      aov: d.orders > 0 ? Math.round(d.revenue / d.orders) : 0,
      is_today: d.date === l.date
    }));
  } else {
    const allDaysSet = new Set([today, l.date, ...Object.keys(hist.hours || {}), ...Object.keys(hist.orders || {})]);
    dailyHistory = Array.from(allDaysSet).sort().map(d => {
      const isToday = d === l.date;
      const dayOrders = isToday ? (effectiveAll.filter(o => !o.cancelled && o.at.date === d).length) : (hist.orders[d] || 0);
      const dayRevenue = Math.round(isToday ? rev : dayTotal(hist, d));
      return {
        date: d,
        orders: dayOrders,
        revenue: dayRevenue,
        aov: dayOrders > 0 ? Math.round(dayRevenue / dayOrders) : 0,
        is_today: isToday
      };
    }).filter(d => d.orders > 0 || d.revenue > 0 || d.is_today);
  }

  const snap = {
    now: now.toISOString(),
    date: isRange ? l.date : today,
    selected_date: isRange ? `${startDate} to ${endDate}` : today,
    start_date: isRange ? startDate : (isCustomDate ? startDate : l.date),
    end_date: isRange ? endDate : (isCustomDate ? startDate : l.date),
    is_past_date: isCustomDate || isRange,
    is_date_range: isRange,
    store_name: storeName,
    revenue: Math.round(rev),
    orders: finalOrdersCount,
    aov: finalOrdersCount ? Math.round(rev / finalOrdersCount) : 0,
    yesterday_by_now: Math.round(yByNow),
    yesterday_total: Math.round(yTotal),
    vs_yesterday_pct: isRange ? null : vsYesterdayPct,
    compare_date: isRange ? null : compareDay,
    is_yesterday: isRange ? false : (compareDay === yday),
    projection,
    spend: Math.round(spend),
    roas_real: spend ? Math.round(rev / spend * 100) / 100 : null,
    roas_meta: spend ? Math.round(metaRev / spend * 100) / 100 : null,
    break_even: breakEven,
    meta_on: !!(env.META_TOKEN && env.META_AD_ACCOUNT),
    meta_error: (meta && meta.error) || null,
    meta_at: metaAt ? `${String(metaAt.hour).padStart(2, "0")}:${String(metaAt.minute).padStart(2, "0")}` : null,
    meta_age_min: meta && meta.at ? Math.round((now - new Date(meta.at)) / 60000) : null,
    campaigns: camps,
    products: Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 5),
    new_customers: orders.filter(o => o.new).length,
    customer_details: true,
    cities,
    rejected,
    statuses,
    payment,
    product_sales,
    customers,
    low_stock: stock,
    orders_today: effectiveAll.filter(o => inWindow(o.at.date)).map(publicOrder),
    recent: orders.slice(-6).reverse().map(publicOrder),
    order_ids: orders.map(o => o.name),
    milestones: MILESTONES,
    month_best: monthBest,
    curve: isRange ? { today: [], yesterday: [] } : curve(orders, hist, compareDay, effL),
    history_error: hist.error || null,
    daily_history: dailyHistory,
    best_days_orders: [...dailyHistory]
      .filter(d => d.orders > 0)
      .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue),
    best_days_revenue: [...dailyHistory]
      .filter(d => d.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders),
    voice: false,
  };

  snap.insights = isRange ? [] : insights(snap, orders, hist, effL, today, camps, breakEven);
  snap.daily = isRange ? fallbackDaily(l.date) : await daily(env, snap, hist, today, effL);
  snap._hist = hist;   // used by /api/ask, stripped before sending to the TV
  if (isRange) {
    if (endDate < l.date) {
      await cachePut(env, `snap-range-${startDate}_${endDate}`, snap, 86400);
    } else {
      await cachePut(env, `snap-range-${startDate}_${endDate}`, snap, isLongRange ? 1800 : 60);
    }
  } else if (isCustomDate) {
    await cachePut(env, `snap-day-${today}`, snap, 86400);
  } else {
    await cachePut(env, `snap-live-${today}`, snap, 15);
  }
  return snap;
}

function project(hist, rev, l, today) {
  const shares = [];
  for (const d of Object.keys(hist.hours).sort().slice(-14)) {
    const total = dayTotal(hist, d);
    if (total > 0 && d !== today) shares.push(byNow(hist, d, l) / total);
  }
  if (!shares.length || rev <= 0) return null;
  const share = shares.reduce((a, b) => a + b, 0) / shares.length;
  return share < 0.2 ? null : Math.round(rev / share);   // too early in the day to say anything honest
}

function curve(orders, hist, yday, l) {
  const per = Array(24).fill(0);
  for (const o of orders) per[o.at.hour] += o.amount;
  const cum = (row, upto) => { const out = []; let run = 0; for (let h = 0; h <= upto; h++) { run += row[h] || 0; out.push(Math.round(run)); } return out; };
  return { today: cum(per, l.hour), yesterday: cum(hist.hours[yday] || [], 23) };
}

export function publicOrder(o) {
  const amount = Math.round(o.amount);
  return {
    name: o.name, at: `${String(o.at.hour).padStart(2, "0")}:${String(o.at.minute).padStart(2, "0")}`,
    date: o.at ? o.at.date : null,
    amount, city: o.city, first: o.first, pay: o.pay, status: o.status, guest: !o.customerId, items: o.items, units: o.items.reduce((a, i) => a + i.qty, 0),
    tier: amount >= 2000 ? 4 : amount >= 1194 ? 3 : amount >= 796 ? 2 : 1, new: o.new,
  };
}

function insights(s, orders, hist, l, today, camps, be) {
  const out = [], add = (emoji, text, w = 1) => out.push({ emoji, text, w });
  const rev = s.revenue, yByNow = s.yesterday_by_now, yTotal = s.yesterday_total, proj = s.projection;
  const monthName = new Date(today + "T12:00:00Z").toLocaleString("en-IN", { month: "long", timeZone: "UTC" });
  const weekday = new Date(today + "T12:00:00Z").toLocaleString("en-IN", { weekday: "long", timeZone: "UTC" });

  if (yByNow > 0 && rev) {
    const pct = Math.round((rev - yByNow) / yByNow * 100);
    if (pct >= 5) add("🚀", `${pct}% ahead of yesterday at this time`, 3);
    else if (pct <= -5) add("🐢", `${Math.abs(pct)}% behind yesterday at this time. Plenty of day left.`, 2);
    else add("🤝", "Neck and neck with yesterday", 2);
  }
  if (yTotal && rev > yTotal) add("🏁", `Already beat all of yesterday (${money(yTotal)})`, 4);
  if (proj && yTotal && proj > yTotal && rev < yTotal) add("📈", `On track for about ${money(proj)} today, more than yesterday`, 3);
  const mb = s.month_best;
  if (mb && rev > mb.revenue) add("🏆", `Best day of ${monthName} so far!`, 5);
  else if (mb && proj && proj > mb.revenue) add("👀", `Could become the best day of ${monthName}`, 3);

  const sameWd = [1, 2, 3, 4, 5, 6, 7, 8].map(k => dayTotal(hist, addDays(today, -7 * k))).filter(Boolean);
  if (sameWd.length >= 3 && rev > Math.max(...sameWd)) add("📅", `Best ${weekday} in 8 weeks`, 4);

  const lastHour = orders.filter(o => l.mins - o.at.mins <= 60 && l.mins >= o.at.mins);
  if (lastHour.length >= 3) add("🔥", `${lastHour.length} orders in the last hour`, 4);

  if (orders.length) {
    const big = orders.reduce((a, o) => o.amount > a.amount ? o : a);
    if (big.amount >= 1500) {
      const who = big.city ? " from " + big.city + (big.first ? ", " + big.first : "") : big.first ? " from " + big.first : "";
      add("💎", `Biggest order today: ${money(big.amount)}${who}`, 2);
    }
    if (s.customer_details) {
      const nw = orders.filter(o => o.new).length;
      if (orders.length >= 3) add("🌱", `${nw} of today's ${orders.length} orders are brand new customers`, 2);
      else if (orders[orders.length - 1].new) add("🌱", "Latest order is a brand new customer", 1);
    }
    const cities = {};
    for (const o of orders) if (o.city) cities[o.city] = (cities[o.city] || 0) + 1;
    const top = Object.entries(cities).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) add("📍", `People from ${top[0]} have ordered ${top[1]} times today`, 1);
    else if (top && top[1] === 1) add("📍", `People from ${top[0]} have ordered today`, 1);
    const rj = s.rejected;
    if (rj) {
      const bad = rj.cancelled.orders + rj.refunded.orders + rj.failed.orders;
      if (bad) add("✖️", `${bad} order${bad === 1 ? "" : "s"} did not go through today: ${rj.cancelled.orders} cancelled, ${rj.refunded.orders} refunded, ${rj.failed.orders} failed`, 2);
    }
    if (Object.keys(cities).length >= 3) add("🗺️", `Orders from ${Object.keys(cities).length} cities today`, 1);

    // products that sold today after a dry spell
    const sold = new Set(orders.flatMap(o => o.items.map(i => i.name)));
    const days = Object.keys(hist.items).sort().reverse();
    for (const name of sold) {
      const last = days.find(d => hist.items[d][name]);
      if (!last) continue;
      const gap = Math.round((new Date(today) - new Date(last)) / 86400000);
      if (gap >= 3) add("✨", `${name} sold again, first time in ${gap} days`, 3);
    }
  }
  const top = s.milestones.filter(m => rev >= m).pop();
  if (top) add("🎉", `Crossed ${money(top)} today`, 2);

  if (s.spend) {
    const roas = rev / s.spend;
    if (roas >= be) add("☀️", `Every ₹1 on ads brought back ₹${roas.toFixed(2)} in sales today`, 2);
    else add("🌧️", `Ads: ₹${roas.toFixed(2)} back per ₹1 so far, break-even is ${be}`, 2);
    const good = camps.filter(c => c.spend >= 500 && c.roas);
    if (good.length) { const c = good.reduce((a, c) => c.roas > a.roas ? c : a); add("🥇", `${c.short} is today's star at ${c.roas.toFixed(1)}x on Meta`, 2); }
    const dry = camps.filter(c => c.spend >= 1000 && !c.purchases);
    if (dry.length) add("🫣", `${dry[0].short}: ${money(dry[0].spend)} spent, no purchase yet on Meta`, 2);
  }
  if (!orders.length && l.hour < 6) add("🌙", "Night shift. Even the orders are asleep.", 1);
  else if (!orders.length && l.hour < 11) add("☕", "Quiet morning. The first order is brewing.", 1);
  if (!out.length) add("👋", "Waiting for today's first order", 1);
  return out;
}

// ----------------------------------------------------------- daily opener --

function fallbackDaily(today) {
  const k = Math.floor(new Date(today + "T00:00:00Z").getTime() / 86400000);
  const weekday = new Date(today + "T12:00:00Z").toLocaleString("en-IN", { weekday: "long", timeZone: "UTC" });
  return { date: today, theme: THEMES[k % THEMES.length], hat: HATS[Math.floor(k / 2) % HATS.length],
           headline: `Happy ${weekday}!`, subline: "Let's see what today brings." };
}

/** Once a day (after 7am) the AI, if one is connected, writes the classic design's greeting. */
async function daily(env, s, hist, today, l) {
  const base = fallbackDaily(today);
  if (!(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY) || l.hour < 7) return base;
  const key = `daily-woo-${today}`;
  const hit = await cacheGet(env, key);
  if (hit) return hit;
  const week = Object.keys(hist.hours).sort().slice(-8).map(d => [d, Math.round(dayTotal(hist, d)), hist.orders[d] || 0]);
  const prompt = `You write the morning greeting for a cute, playful TV sales board in a D2C founder's home or office
(store: ${s.store_name}). Today is ${today}.
Recent days (date, sales, orders): ${JSON.stringify(week)}
Yesterday's units by product: ${JSON.stringify(hist.items[addDays(today, -1)] || {})}
Pick a theme from ${JSON.stringify(THEMES)} and a hat for the mascot from ${JSON.stringify(HATS)}.
Write a headline (max 7 words) and a subline (max 16 words): warm, a little funny, specific to the numbers.
Never invent numbers. Never use em dashes.
Reply with ONLY this JSON: {"theme": "...", "hat": "...", "headline": "...", "subline": "..."}`;
  try {
    const m = (await complete(env, prompt, 200)).match(/\{[\s\S]*\}/);
    const d = { ...base, ...JSON.parse(m[0]) };
    if (!THEMES.includes(d.theme)) d.theme = base.theme;
    if (!HATS.includes(d.hat)) d.hat = base.hat;
    d.headline = String(d.headline).replace(/—/g, ","); d.subline = String(d.subline).replace(/—/g, ",");
    await cachePut(env, key, d, 86400);
    return d;
  } catch (e) {
    await cachePut(env, key, base, 3600);   // try the AI again in an hour, not on every refresh
    return base;
  }
}
