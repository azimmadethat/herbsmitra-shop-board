// SuperAttribution Order Sync & Matching
// Synchronizes WooCommerce orders into synced_orders table and resolves visit journeys.

import { upsertSyncedOrder, getVisitsForVisitor, query } from "./_db.js";
import { attributeOrder } from "./_attribution.js";

// Counted statuses: Real Sales counts ONLY processing and completed
export const COUNTED_STATUSES = new Set(["processing", "completed"]);
export const PIPELINE_STATUSES = new Set(["pending", "on-hold"]);
export const EXCLUDED_STATUSES = new Set(["cancelled", "refunded", "failed"]);

/**
 * Sync orders for a date range and compute multi-model attribution breakdown
 */
export async function syncAndAttributeOrders(env, orders = [], model = "BLEND") {
  const syncResults = [];
  let noJourneyCount = 0;
  let verifiedStoreSales = 0;
  let verifiedStoreOrders = 0;

  const pipeline = { orders: 0, revenue: 0 };
  const reconciliation = { cancelled: 0, refunded: 0, failed: 0 };

  for (const o of orders) {
    const st = String(o.status || "").toLowerCase();
    const amount = Number(o.amount || o.total || 0);

    // Track pipeline and excluded reconciliation
    if (PIPELINE_STATUSES.has(st)) {
      pipeline.orders++;
      pipeline.revenue += amount;
      continue;
    }
    if (EXCLUDED_STATUSES.has(st)) {
      if (st === "cancelled") reconciliation.cancelled += amount;
      else if (st === "refunded") reconciliation.refunded += amount;
      else if (st === "failed") reconciliation.failed += amount;
      continue;
    }

    // Only COUNTED_STATUSES count toward Real Sales
    if (!COUNTED_STATUSES.has(st)) {
      continue;
    }

    verifiedStoreSales += amount;
    verifiedStoreOrders++;

    // 1. Resolve journey: from cart stamp first, else from DB visits
    let journey = [];
    if (Array.isArray(o.journey) && o.journey.length > 0) {
      journey = o.journey;
    } else if (o.visitorId) {
      try {
        const orderDateStr = o.rawDate || (o.at ? `${o.at.date}T${String(o.at.hour).padStart(2, "0")}:${String(o.at.minute).padStart(2, "0")}:00Z` : new Date().toISOString());
        const dbVisits = await getVisitsForVisitor(env, o.visitorId, orderDateStr);
        if (Array.isArray(dbVisits) && dbVisits.length > 0) {
          journey = dbVisits;
        }
      } catch (err) {}
    }

    const hasJourney = Array.isArray(journey) && journey.length > 0;
    if (!hasJourney) {
      noJourneyCount++;
    }

    // 2. Persist order into synced_orders table (upsert by order_id)
    try {
      await upsertSyncedOrder(env, {
        order_id: o.id,
        order_date: o.rawDate || (o.at ? `${o.at.date}` : new Date().toISOString()),
        total: amount,
        status: st,
        payment_method: o.method || "",
        payment_method_title: o.pay || "",
        visitor_id: o.visitorId || "",
        journey_json: journey,
      });
    } catch (err) {}

    // 3. Compute attribution touches
    const touches = attributeOrder(o, journey, model);
    syncResults.push({
      order_id: o.id,
      amount,
      status: st,
      visitor_id: o.visitorId || "",
      has_journey: hasJourney,
      touches,
    });
  }

  return {
    verifiedStoreSales: Math.round(verifiedStoreSales),
    verifiedStoreOrders,
    noJourneyCount,
    pipeline,
    reconciliation,
    orders: syncResults,
  };
}
