// SuperAttribution Automated Verification Suite
// Validates all Phase 6a requirements against the SuperAttribution 20 Nov 2026 fixture

import { attributeOrder, classifySource, filterJourney } from "../functions/_attribution.js";
import { DEMO_FIXTURE } from "../functions/api/attribution.js";
import { syncAndAttributeOrders } from "../functions/_sync.js";

console.log("=================================================");
console.log("    SuperAttribution Phase 6a Seed Test Suite    ");
console.log("=================================================\n");

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`[PASS] ${msg}`);
  } else {
    console.error(`[FAIL] ${msg}`);
    failures++;
  }
}

// 1. Validate SuperAttribution Demo Fixture Targets
const k = DEMO_FIXTURE.kpis;
assert(k.total_store_sales === 39368, `Store Sales = Rs 39,368 (got ${k.total_store_sales})`);
assert(k.total_store_orders === 26, `Total Store Orders = 26 (got ${k.total_store_orders})`);
assert(k.new_customers === 20, `New Customers = 20 (got ${k.new_customers})`);
assert(k.repeat_customers === 6, `Repeat Customers = 6 (got ${k.repeat_customers})`);
assert(k.meta_spend === 15437, `Meta Ad Spend = Rs 15,437 (got ${k.meta_spend})`);
assert(k.blend_sales === 31835, `Blend Real Sales = Rs 31,835 (got ${k.blend_sales})`);
assert(k.blend_orders === 20.0, `Blend Real Orders = 20.0 (got ${k.blend_orders})`);
assert(k.meta_claimed_sales === 38038, `Meta Claimed Sales = Rs 38,038 (got ${k.meta_claimed_sales})`);
assert(k.meta_claimed_orders === 25, `Meta Claimed Purchases = 25 (got ${k.meta_claimed_orders})`);
assert(k.meta_overclaim === 6203, `Meta Over-Claim = Rs 6,203 (got ${k.meta_overclaim})`);
assert(k.store_return === 2.55, `Store Return = 2.55x (got ${k.store_return})`);
assert(k.meta_lens_roas === 2.06, `Meta Lens ROAS = 2.06x (got ${k.meta_lens_roas})`);
assert(k.avg_order_value === 1514, `Avg Order Value = Rs 1,514 (got ${k.avg_order_value})`);
assert(k.blend_cost_per_order === 772, `Blend Cost/Order = Rs 772 (got ${k.blend_cost_per_order})`);

// 2. Multi-Model Attribution Tests
const now = new Date("2026-11-20T18:00:00Z");
const order = { id: 501, total: 1000, date_created: now.toISOString(), status: "completed" };

// A) 3-visit journey: test 30/50/20 split
const threeVisits = [
  { ts: new Date(now.getTime() - 4 * 86400000).toISOString(), utm_source: "facebook", utm_campaign: "C1", utm_term: "A1", utm_content: "Ad1", fbclid: "fb1" },
  { ts: new Date(now.getTime() - 2 * 86400000).toISOString(), utm_source: "google", utm_medium: "cpc", utm_campaign: "C2", gclid: "g1" },
  { ts: new Date(now.getTime() - 1 * 86400000).toISOString(), utm_source: "facebook", utm_campaign: "C3", utm_term: "A3", utm_content: "Ad3", fbclid: "fb3" },
];

const blendTouches = attributeOrder(order, threeVisits, "BLEND");
assert(blendTouches.length === 3, "3 visits produce 3 touches");
assert(Math.abs(blendTouches[0].weight - 0.3) < 0.001, `Visit 1 weight = 0.30 (got ${blendTouches[0].weight})`);
assert(Math.abs(blendTouches[1].weight - 0.2) < 0.001, `Visit 2 weight = 0.20 (got ${blendTouches[1].weight})`);
assert(Math.abs(blendTouches[2].weight - 0.5) < 0.001, `Visit 3 weight = 0.50 (got ${blendTouches[2].weight})`);
const blendSum = blendTouches.reduce((a, t) => a + t.revenue, 0);
assert(Math.abs(blendSum - 1000) < 0.001, `BLEND touches sum exactly to store revenue Rs 1,000 (got ${blendSum})`);

// B) FIRST model: 100% to first non-direct
const firstTouches = attributeOrder(order, threeVisits, "FIRST");
assert(firstTouches[0].weight === 1.0 && firstTouches[0].revenue === 1000, "FIRST model awards 100% to first non-direct visit");
assert(firstTouches[1].weight === 0 && firstTouches[2].weight === 0, "FIRST model gives 0% to later visits");

// C) LAST model: 100% to last non-direct
const lastTouches = attributeOrder(order, threeVisits, "LAST");
assert(lastTouches[2].weight === 1.0 && lastTouches[2].revenue === 1000, "LAST model awards 100% to last non-direct visit");
assert(lastTouches[0].weight === 0 && lastTouches[1].weight === 0, "LAST model gives 0% to earlier visits");

// D) LINEAR model: equal split
const linearTouches = attributeOrder(order, threeVisits, "LINEAR");
assert(Math.abs(linearTouches[0].weight - 1/3) < 0.001, "LINEAR splits equally (1/3 each)");
const linearSum = linearTouches.reduce((a, t) => a + t.revenue, 0);
assert(Math.abs(linearSum - 1000) < 0.001, `LINEAR touches sum to Rs 1,000 (got ${linearSum})`);

// E) SURVEY model: equal split before 30 answers
const surveyTouches = attributeOrder(order, threeVisits, "SURVEY", 0);
assert(Math.abs(surveyTouches[0].weight - 1/3) < 0.001, "SURVEY splits equally before 30 answers");

// F) PAID LC model: each paid platform gets 100% for its own last paid click (Meta + Google -> 200%)
const paidLcTouches = attributeOrder(order, threeVisits, "PAID LC");
assert(paidLcTouches.length === 2, "PAID LC rewarded both Meta and Google last clicks");
const paidLcSum = paidLcTouches.reduce((a, t) => a + t.revenue, 0);
assert(paidLcSum === 2000, `PAID LC can double count and exceed store revenue (got ${paidLcSum} vs 1000)`);

// 3. Broken UTM test: fbclid present but no utm_campaign
const brokenUtmVisit = [
  { ts: new Date(now.getTime() - 100000).toISOString(), fbclid: "fb_click_without_campaign" }
];
const brokenTouches = attributeOrder(order, brokenUtmVisit, "BLEND");
assert(brokenTouches.length === 1 && brokenTouches[0].is_broken_utm === true, "Order with fbclid but no campaign flagged as is_broken_utm = true");
assert(brokenTouches[0].campaign_id === "unattributed_broken_utm", `Broken UTM lands in unattributed_broken_utm (got ${brokenTouches[0].campaign_id})`);

// 4. No Journey test: counts as Direct in full
const noJourneyTouches = attributeOrder(order, [], "BLEND");
assert(noJourneyTouches.length === 1 && noJourneyTouches[0].channel === "Direct", "No-journey order counts as Direct in full");
assert(noJourneyTouches[0].weight === 1.0 && noJourneyTouches[0].revenue === 1000, "Direct receives 100% credit");

// 5. 8-Day old visit test (outside 7-day window -> gets 0%)
const eightDayOldVisit = [
  { ts: new Date(now.getTime() - (8 * 86400000)).toISOString(), utm_source: "facebook", utm_campaign: "C_OLD", fbclid: "fb_old" }
];
const oldTouches = attributeOrder(order, eightDayOldVisit, "BLEND");
assert(oldTouches.length === 1 && oldTouches[0].channel === "Direct", "Visit 8 days prior gets 0% credit; order falls back to Direct");

// 6. Idempotency test: syncing seed twice produces identical results
const envMock = { WC_URL: "https://example.com" };
const mockOrders = [
  { id: 101, amount: 500, status: "completed", date_created: now.toISOString() },
  { id: 102, amount: 750, status: "processing", date_created: now.toISOString() },
];
const run1 = await syncAndAttributeOrders(envMock, mockOrders, "BLEND");
const run2 = await syncAndAttributeOrders(envMock, mockOrders, "BLEND");
assert(run1.verifiedStoreSales === run2.verifiedStoreSales, `Sync idempotency verified: Sales run1=${run1.verifiedStoreSales}, run2=${run2.verifiedStoreSales}`);
assert(run1.verifiedStoreOrders === run2.verifiedStoreOrders, `Sync idempotency verified: Orders run1=${run1.verifiedStoreOrders}, run2=${run2.verifiedStoreOrders}`);

console.log("\n=================================================");
if (failures === 0) {
  console.log("   ALL SUPERATTRIBUTION SEED TESTS PASSED (100%) ");
} else {
  console.error(`   ${failures} TESTS FAILED! STOPPING.`);
  process.exit(1);
}
console.log("=================================================");
