// GET /api/attribution - True Return Attribution Engine API
// Behind BOARD_KEY only. Returns multi-model attribution, Meta claims vs truth, and KPI alerts.

import { json, authorised, local, midnightISO, addDays } from "../_lib.js";
import { snapshot } from "../_woo.js";
import { getDbInfo, query } from "../_db.js";
import { syncAndAttributeOrders } from "../_sync.js";
import { syncMetaInsights } from "../_meta.js";
import { SEVEN_DAYS_MS } from "../_attribution.js";

// Demo fixture constants for seed verification (20 Nov 2026 fixture)
export const DEMO_FIXTURE = {
  is_demo: true,
  store_name: "Herbs Mitra (Demo)",
  date_label: "20 Nov 2026 (Demo Fixture)",
  model: "BLEND",
  break_even_roas: 2.0,
  cost_per_order_target: 84.70,
  kpis: {
    total_store_sales: 39368,
    total_store_orders: 26,
    new_customers: 20,
    repeat_customers: 6,
    meta_spend: 15437,
    store_return: 2.55,
    meta_lens_roas: 2.06,
    avg_order_value: 1514,
    blend_cost_per_order: 772,
    blend_sales: 31835,
    blend_orders: 20.0,
    meta_claimed_sales: 38038,
    meta_claimed_orders: 25,
    meta_overclaim: 6203,
  },
  alerts: {
    winner: { name: "MeriMaaArthritis Sales Campaign", return: 3.12, spend: 5400, orders: 11.2 },
    star_creative: { name: "Video Hook 03 - Hindi Doctor", return: 3.45, spend: 2800, orders: 6.4 },
    burner: { name: "AAMAJI • HINDI • SCALE • WIDE", return: 0.85, spend: 3200, orders: 1.8, note: "Spend >= ₹1,000 & Return < Break-even (2.0x)" },
  },
  campaigns: [
    {
      id: "1202101",
      name: "MeriMaaArthritis Sales Campaign",
      spend: 5400,
      real_orders: 11.2,
      real_sales: 16848,
      true_return: 3.12,
      meta_claim_sales: 19500,
      meta_claim_orders: 13,
      meta_overclaim: 2652,
      cost_per_order: 482,
      avg_order: 1504,
      clicks: 420,
      cpc: 12.86,
      ctr: 2.45,
      impressions: 17142,
      page_views: 390,
      cost_per_view: 13.85,
      add_to_cart: 48,
      cost_per_cart: 112.50,
      reached_checkout: 24,
      buyer_rate: 2.87,
      cpm: 315.01,
      verdict: "Crushing It",
      verdict_type: "crushing",
    },
    {
      id: "1202102",
      name: "Vericose Vain Targeted",
      spend: 4200,
      real_orders: 6.0,
      real_sales: 8960,
      true_return: 2.13,
      meta_claim_sales: 10400,
      meta_claim_orders: 7,
      meta_overclaim: 1440,
      cost_per_order: 700,
      avg_order: 1493,
      clicks: 310,
      cpc: 13.55,
      ctr: 1.95,
      impressions: 15897,
      page_views: 280,
      cost_per_view: 15.00,
      add_to_cart: 32,
      cost_per_cart: 131.25,
      reached_checkout: 16,
      buyer_rate: 2.14,
      cpm: 264.20,
      verdict: "Making Profit",
      verdict_type: "profit",
    },
    {
      id: "1202103",
      name: "AAMAJI • HINDI • SCALE • WIDE",
      spend: 3200,
      real_orders: 1.8,
      real_sales: 2720,
      true_return: 0.85,
      meta_claim_sales: 4500,
      meta_claim_orders: 3,
      meta_overclaim: 1780,
      cost_per_order: 1778,
      avg_order: 1511,
      clicks: 190,
      cpc: 16.84,
      ctr: 1.45,
      impressions: 13103,
      page_views: 170,
      cost_per_view: 18.82,
      add_to_cart: 14,
      cost_per_cart: 228.57,
      reached_checkout: 7,
      buyer_rate: 1.06,
      cpm: 244.22,
      verdict: "Below break-even",
      verdict_type: "loss",
    },
    {
      id: "1202104",
      name: "Retargeting DPA All Products",
      spend: 2637,
      real_orders: 1.0,
      real_sales: 3307,
      true_return: 1.25,
      meta_claim_sales: 3638,
      meta_claim_orders: 2,
      meta_overclaim: 331,
      cost_per_order: 2637,
      avg_order: 3307,
      clicks: 145,
      cpc: 18.19,
      ctr: 3.10,
      impressions: 4677,
      page_views: 130,
      cost_per_view: 20.28,
      add_to_cart: 12,
      cost_per_cart: 219.75,
      reached_checkout: 5,
      buyer_rate: 0.77,
      cpm: 563.82,
      verdict: "Below break-even",
      verdict_type: "loss",
    },
    {
      id: "unattributed_broken_utm",
      name: "Unattributed / Broken UTM",
      spend: 0,
      real_orders: 1.0,
      real_sales: 1500,
      true_return: null,
      meta_claim_sales: 0,
      meta_claim_orders: 0,
      meta_overclaim: 0,
      cost_per_order: null,
      avg_order: 1500,
      clicks: 0,
      cpc: 0,
      ctr: 0,
      impressions: 0,
      page_views: 0,
      cost_per_view: null,
      add_to_cart: 0,
      cost_per_cart: null,
      reached_checkout: 0,
      buyer_rate: null,
      cpm: 0,
      verdict: "Missing UTM Tag",
      verdict_type: "broken",
    },
  ],
  traffic_sources: [
    { source: "Meta Ads", spend: 15437, real_orders: 20.0, real_sales: 31835, true_return: 2.06, cost_per_order: 772, roas_label: "2.06x" },
    { source: "Direct", spend: 0, real_orders: 4.0, real_sales: 5233, true_return: null, cost_per_order: null, roas_label: "No ad spend" },
    { source: "WhatsApp", spend: 0, real_orders: 1.5, real_sales: 1800, true_return: null, cost_per_order: null, roas_label: "No ad spend" },
    { source: "Organic Search", spend: 0, real_orders: 0.5, real_sales: 500, true_return: null, cost_per_order: null, roas_label: "No ad spend" },
  ],
  model_comparison: [
    { model: "BLEND (Position Blend)", store_sales: 39368, attributed_sales: 31835, attributed_orders: 20.0, roas: 2.06, exact_sum: 39368 },
    { model: "FIRST (First Non-Direct)", store_sales: 39368, attributed_sales: 30400, attributed_orders: 19.0, roas: 1.97, exact_sum: 39368 },
    { model: "LAST (Last Non-Direct)", store_sales: 39368, attributed_sales: 32600, attributed_orders: 21.0, roas: 2.11, exact_sum: 39368 },
    { model: "LINEAR (Equal Split)", store_sales: 39368, attributed_sales: 31500, attributed_orders: 20.0, roas: 2.04, exact_sum: 39368 },
    { model: "SURVEY (Survey Blend)", store_sales: 39368, attributed_sales: 31500, attributed_orders: 20.0, roas: 2.04, exact_sum: 39368, note: "0 of 30 answers needed (pure equal split)" },
    { model: "PAID LC (Paid Last Click)", store_sales: 39368, attributed_sales: 34100, attributed_orders: 22.0, roas: 2.21, exact_sum: 41668, note: "Double-counting model (can exceed store sales)" },
    { model: "META (Meta Claimed)", store_sales: 39368, attributed_sales: 38038, attributed_orders: 25.0, roas: 2.46, note: "Untouched Meta numbers with view-through" },
  ],
  sync_health: {
    db: { connected: true, store: "turso" },
    meta: { connected: true, message: "Connected" },
    no_journey_orders: 4,
    broken_utm_orders: 1,
    synced_at: new Date().toISOString(),
  },
};

export async function onRequestGet({ request, env }) {
  if (!authorised(request, env)) {
    return json({ error: "This attribution link is missing its valid key." }, 401);
  }

  const url = new URL(request.url);
  const isDemo = url.searchParams.get("demo") === "1" || url.searchParams.get("demo") === "true";
  const model = (url.searchParams.get("model") || "BLEND").toUpperCase().trim();
  const date = url.searchParams.get("date") || null;
  const startDate = url.searchParams.get("start_date") || url.searchParams.get("from") || date;
  const endDate = url.searchParams.get("end_date") || url.searchParams.get("to") || null;

  // Serve verified demo fixture if requested
  if (isDemo) {
    const resp = { ...DEMO_FIXTURE, model };
    return json(resp);
  }

  try {
    const tz = env.STORE_TZ || "Asia/Kolkata";
    const storeName = env.STORE_NAME || "Herbs Mitra";
    const breakEven = Number(env.BREAK_EVEN_ROAS || 2.0);
    const costPerOrderTarget = Number(env.COST_PER_ORDER_TARGET || 84.70);

    // 1. Fetch live snapshot with full orders from WooCommerce
    const snap = await snapshot(env, startDate, endDate);
    const orders = snap.orders_today || [];

    // 2. Multi-model attribution sync
    const attrSync = await syncAndAttributeOrders(env, orders, model);

    // 3. Meta insights sync
    const timeRange = startDate && endDate
      ? { since: startDate, until: endDate }
      : (startDate ? { since: startDate, until: startDate } : { since: snap.date, until: snap.date });

    const metaSync = await syncMetaInsights(env, timeRange);

    // 4. Aggregate by Campaign, Ad Set, Ad, and Traffic Source
    const campaignsMap = new Map();
    const sourcesMap = new Map();

    // Seed Meta campaigns from Meta Insights if available
    for (const c of metaSync.campaigns) {
      campaignsMap.set(c.campaign_id, {
        id: c.campaign_id,
        name: c.campaign_name,
        spend: c.spend,
        impressions: c.impressions,
        clicks: c.clicks,
        meta_claim_sales: c.meta_value,
        meta_claim_orders: c.meta_purchases,
        real_orders: 0,
        real_sales: 0,
        page_views: 0,
        add_to_cart: 0,
        reached_checkout: 0,
      });
    }

    // Accumulate attribution touches from WooCommerce orders
    for (const o of attrSync.orders) {
      for (const t of o.touches) {
        // Aggregate sources
        const ch = t.channel || "Direct";
        const srcObj = sourcesMap.get(ch) || { source: ch, spend: 0, real_orders: 0, real_sales: 0 };
        srcObj.real_orders += t.weight;
        srcObj.real_sales += t.revenue;
        sourcesMap.set(ch, srcObj);

        // Aggregate campaigns
        const cid = t.campaign_id || "unattributed";
        let camp = campaignsMap.get(cid);
        if (!camp) {
          camp = {
            id: cid,
            name: t.is_broken_utm ? "Unattributed / Broken UTM" : (t.channel + " Campaign " + cid),
            spend: 0,
            impressions: 0,
            clicks: 0,
            meta_claim_sales: 0,
            meta_claim_orders: 0,
            real_orders: 0,
            real_sales: 0,
            page_views: 0,
            add_to_cart: 0,
            reached_checkout: 0,
            is_broken_utm: t.is_broken_utm,
          };
          campaignsMap.set(cid, camp);
        }
        camp.real_orders += t.weight;
        camp.real_sales += t.revenue;
      }
    }

    // Set spend for Meta Ads traffic source
    const metaSource = sourcesMap.get("Meta Ads") || { source: "Meta Ads", spend: 0, real_orders: 0, real_sales: 0 };
    metaSource.spend = metaSync.totalSpend;
    sourcesMap.set("Meta Ads", metaSource);

    // Compute derived metrics for campaigns
    const campaignList = Array.from(campaignsMap.values()).map(c => {
      const realOrders = Math.round(c.real_orders * 10) / 10;
      const realSales = Math.round(c.real_sales);
      const spend = Math.round(c.spend);
      const trueReturn = spend > 0 ? Math.round((realSales / spend) * 100) / 100 : null;
      const costPerOrder = realOrders > 0 && spend > 0 ? Math.round(spend / realOrders) : null;
      const avgOrder = realOrders > 0 ? Math.round(realSales / realOrders) : null;
      const metaOverclaim = Math.max(0, c.meta_claim_sales - realSales);

      let verdict = "Below break-even";
      let verdictType = "loss";
      if (c.is_broken_utm) {
        verdict = "Missing UTM Tag";
        verdictType = "broken";
      } else if (trueReturn >= 2.50) {
        verdict = "Crushing It";
        verdictType = "crushing";
      } else if (trueReturn >= breakEven) {
        verdict = "Making Profit";
        verdictType = "profit";
      }

      return {
        ...c,
        real_orders: realOrders,
        real_sales: realSales,
        spend,
        true_return: trueReturn,
        cost_per_order: costPerOrder,
        avg_order: avgOrder,
        meta_overclaim: metaOverclaim,
        verdict,
        verdict_type: verdictType,
      };
    }).sort((a, b) => b.spend - a.spend || b.real_sales - a.real_sales);

    // Format traffic sources
    const trafficSources = Array.from(sourcesMap.values()).map(s => {
      const spend = Math.round(s.spend);
      const realSales = Math.round(s.real_sales);
      const realOrders = Math.round(s.real_orders * 10) / 10;
      const trueReturn = spend > 0 ? Math.round((realSales / spend) * 100) / 100 : null;
      const costPerOrder = spend > 0 && realOrders > 0 ? Math.round(spend / realOrders) : null;
      const roasLabel = spend > 0 ? `${trueReturn}x` : "No ad spend";

      return {
        source: s.source,
        spend,
        real_orders: realOrders,
        real_sales: realSales,
        true_return: trueReturn,
        cost_per_order: costPerOrder,
        roas_label: roasLabel,
      };
    }).sort((a, b) => b.spend - a.spend || b.real_sales - a.real_sales);

    // Compute KPIs
    const totalStoreSales = snap.revenue || attrSync.verifiedStoreSales;
    const totalStoreOrders = snap.orders || attrSync.verifiedStoreOrders;
    const newCust = snap.customers ? snap.customers.new : 0;
    const repCust = snap.customers ? snap.customers.returning : 0;

    const metaSpend = metaSync.totalSpend;
    const blendMetaRow = trafficSources.find(s => s.source === "Meta Ads") || { real_sales: 0, real_orders: 0 };
    const blendSales = blendMetaRow.real_sales;
    const blendOrders = blendMetaRow.real_orders;

    const storeReturn = metaSpend > 0 ? Math.round((totalStoreSales / metaSpend) * 100) / 100 : null;
    const metaLensRoas = metaSpend > 0 ? Math.round((blendSales / metaSpend) * 100) / 100 : null;
    const avgOrderValue = totalStoreOrders > 0 ? Math.round(totalStoreSales / totalStoreOrders) : 0;
    const blendCostPerOrder = blendOrders > 0 && metaSpend > 0 ? Math.round(metaSpend / blendOrders) : null;

    const metaClaimedSales = metaSync.metaClaimedValue;
    const metaClaimedOrders = metaSync.metaClaimedPurchases;
    const metaOverclaim = Math.max(0, metaClaimedSales - blendSales);

    // Identify Alerts
    const paidCamps = campaignList.filter(c => c.spend > 0);
    const winner = paidCamps.find(c => c.true_return >= breakEven) || paidCamps[0] || null;
    const burner = paidCamps.find(c => c.spend >= 1000 && c.true_return < breakEven && c.real_orders < 1.0) || null;

    const dbInfo = getDbInfo(env);

    return json({
      is_demo: false,
      store_name: storeName,
      date_label: snap.is_date_range ? snap.selected_date : (snap.is_past_date ? snap.selected_date : "Today (Live)"),
      model,
      break_even_roas: breakEven,
      cost_per_order_target: costPerOrderTarget,
      kpis: {
        total_store_sales: totalStoreSales,
        total_store_orders: totalStoreOrders,
        new_customers: newCust,
        repeat_customers: repCust,
        meta_spend: metaSpend,
        store_return: storeReturn,
        meta_lens_roas: metaLensRoas,
        avg_order_value: avgOrderValue,
        blend_cost_per_order: blendCostPerOrder,
        blend_sales: blendSales,
        blend_orders: blendOrders,
        meta_claimed_sales: metaClaimedSales,
        meta_claimed_orders: metaClaimedOrders,
        meta_overclaim: metaOverclaim,
      },
      alerts: {
        winner: winner ? { name: winner.name, return: winner.true_return, spend: winner.spend, orders: winner.real_orders } : null,
        star_creative: null,
        burner: burner ? { name: burner.name, return: burner.true_return, spend: burner.spend, orders: burner.real_orders, note: "Spend >= ₹1,000 & Return < Break-even" } : null,
      },
      campaigns: campaignList,
      traffic_sources: trafficSources,
      sync_health: {
        db: dbInfo,
        meta: { connected: metaSync.connected, message: metaSync.message || metaSync.error },
        no_journey_orders: attrSync.noJourneyCount,
        synced_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    return json({ error: err.message || String(err) }, 500);
  }
}
