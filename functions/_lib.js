// Shared helpers for the board's API (Cloudflare Pages Functions).
// Everything secret lives in Cloudflare environment variables, never in these files:
//   SHOPIFY_SHOP, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, BOARD_KEY      (required)
//   META_TOKEN, META_AD_ACCOUNT                                            (optional, ad numbers)
//   ANTHROPIC_API_KEY or OPENAI_API_KEY                                    (optional, voice answers)
//   BREAK_EVEN_ROAS, STORE_NAME, OPENAI_MODEL                              (optional settings)

const API_VERSION = "2026-01";
const GRAPH = "https://graph.facebook.com/v23.0";

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
  });

/** The board link carries ?k=<BOARD_KEY>, so only people with the link can see the numbers. */
export function authorised(request, env) {
  const k = new URL(request.url).searchParams.get("k") || request.headers.get("X-Board-Key");
  return !!env.BOARD_KEY && k === env.BOARD_KEY;
}

// ------------------------------------------------------------------ cache --
// Memory first (fast, but lost whenever Cloudflare recycles the worker), then the BOARD_KV
// key-value store if it is bound (survives restarts). Without KV everything still works,
// it just asks Shopify and Meta a little more often.

const MEM = new Map();

export async function cacheGet(env, key) {
  const m = MEM.get(key);
  if (m && m.until > Date.now()) return m.value;
  if (env.BOARD_KV) {
    const v = await env.BOARD_KV.get(key, "json");
    if (v && v.until > Date.now()) { MEM.set(key, v); return v.value; }
  }
  return null;
}

export async function cachePut(env, key, value, seconds) {
  const v = { value, until: Date.now() + seconds * 1000 };
  MEM.set(key, v);
  if (env.BOARD_KV) await env.BOARD_KV.put(key, JSON.stringify(v), { expirationTtl: Math.max(60, seconds) });
}

export async function cached(env, key, seconds, fn) {
  const hit = await cacheGet(env, key);
  if (hit !== null) return hit;
  const value = await fn();
  await cachePut(env, key, value, seconds);
  return value;
}

// ---------------------------------------------------------------- shopify --

async function shopifyToken(env) {
  return cached(env, `token-${env.SHOPIFY_CLIENT_ID}`, 20 * 3600, async () => {
    const r = await fetch(`https://${env.SHOPIFY_SHOP}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "client_credentials", client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET,
      }),
    });
    if (!r.ok) throw new Error(`Shopify login failed (HTTP ${r.status}). Check the Client ID, secret and that the app is installed.`);
    return (await r.json()).access_token;
  });
}

export async function shopify(env, query, variables = {}) {
  const token = await shopifyToken(env);
  const r = await fetch(`https://${env.SHOPIFY_SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`Shopify HTTP ${r.status}`);
  const out = await r.json();
  if (out.errors) throw new Error("Shopify: " + JSON.stringify(out.errors).slice(0, 300));
  return out.data;
}

export async function shopInfo(env) {
  return cached(env, `shop-${env.SHOPIFY_SHOP}`, 6 * 3600, async () => {
    const d = await shopify(env, "{ shop { name ianaTimezone currencyCode } }");
    return d.shop;
  });
}

// ------------------------------------------------------------------- time --

/** Wall-clock parts of `date` in the store's time zone. */
export function local(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute, mins: +p.hour * 60 + +p.minute };
}

/** ISO timestamp for local midnight today in the store's time zone. */
export function midnightISO(now, tz) {
  const l = local(now, tz);
  const asUTC = Date.UTC(+l.date.slice(0, 4), +l.date.slice(5, 7) - 1, +l.date.slice(8, 10), l.hour, l.minute);
  const offsetMs = asUTC - Math.floor(now.getTime() / 60000) * 60000;   // store time minus UTC
  return new Date(Date.UTC(+l.date.slice(0, 4), +l.date.slice(5, 7) - 1, +l.date.slice(8, 10)) - offsetMs).toISOString();
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ names --

/** "Brand™ Medical-Grade Silicone Roll (1.5m)" -> "Medical-Grade Silicone Roll". */
export function shortName(title, storeName) {
  let t = String(title || "Item").replace(/[™®©]/g, "");
  if (storeName) t = t.replace(new RegExp("^\\s*" + storeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\W*", "i"), "");
  t = t.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().replace(/^[-–\s]+|[-–\s]+$/g, "");
  // Keep names short enough for the TV: up to 4 words and 30 characters.
  const words = t.split(" ").slice(0, 4);
  while (words.length > 1 && words.join(" ").length > 30) words.pop();
  return words.join(" ") || String(title);
}

export function shortCampaign(name, storeName) {
  let n = String(name || "");
  if (storeName) n = n.replace(new RegExp("^\\s*" + storeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[-–|:]\\s*", "i"), "");
  n = n.replace(/\s*\(.*?\)/g, "").replace(/\s*[–|-]\s*/g, " · ").trim().replace(/^·\s*|\s*·$/g, "");
  return n.length > 28 ? n.slice(0, 27).trim() + "…" : n;
}

export function money(v) {
  return "₹" + Math.round(v).toLocaleString("en-IN");
}

// ------------------------------------------------------------------- meta --

/** Spend and Meta-reported purchases per campaign. Supports today or custom timeRange { since, until }. */
export async function metaCampaigns(env, storeName, timeRange = null) {
  if (!env.META_TOKEN || !env.META_AD_ACCOUNT) return null;
  const acct = String(env.META_AD_ACCOUNT).replace(/^act_/, "");
  const isCustomRange = Boolean(timeRange && timeRange.since && timeRange.until);
  const cacheKey = isCustomRange ? `meta-${acct}-${timeRange.since}_${timeRange.until}` : `meta-${acct}`;
  const ttl = isCustomRange ? 3600 : 15 * 60;
  return cached(env, cacheKey, ttl, async () => {
    const u = new URL(`${GRAPH}/act_${acct}/insights`);
    const params = {
      level: "campaign", limit: "50",
      fields: "campaign_id,campaign_name,spend,actions,action_values",
      access_token: env.META_TOKEN,
    };
    if (isCustomRange) {
      params.time_range = JSON.stringify({ since: timeRange.since, until: timeRange.until });
    } else {
      params.date_preset = "today";
    }
    u.search = new URLSearchParams(params);
    const r = await fetch(u);
    const out = await r.json();
    if (!r.ok || out.error) {
      return { error: (out.error && out.error.message) || `Meta HTTP ${r.status}`, campaigns: [], at: null };
    }
    const pick = (list) => {
      const by = Object.fromEntries((list || []).map(a => [a.action_type, +a.value]));
      return by.omni_purchase ?? by.purchase ?? by["offsite_conversion.fb_pixel_purchase"] ?? 0;
    };
    const campaigns = (out.data || []).map(c => {
      const spend = +c.spend || 0, value = pick(c.action_values);
      return {
        id: c.campaign_id, name: c.campaign_name, short: shortCampaign(c.campaign_name, storeName),
        spend: Math.round(spend), value: Math.round(value), purchases: Math.round(pick(c.actions)),
        roas: spend ? Math.round(value / spend * 100) / 100 : null,
      };
    }).filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend);
    return { campaigns, at: new Date().toISOString() };
  });
}
