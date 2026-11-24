import { onRequestPost } from "../functions/api/track.js";
import { query } from "../functions/_db.js";

console.log("=== Testing Phase 1e Checkpoint: Visit Round-Trip ===");

const testVisit = {
  visitor_id: "test_visitor_uuid_99999",
  ts: new Date().toISOString(),
  landing_url: "https://herbsmitra.com/?utm_source=facebook&utm_medium=cpc&utm_campaign=12033001&fbclid=fb_abc_123",
  referrer: "https://l.instagram.com/",
  utm_source: "facebook",
  utm_medium: "cpc",
  utm_campaign: "12033001",
  utm_term: "adset_555",
  utm_content: "ad_777",
  fbclid: "fb_abc_123",
  gclid: "",
};

const req = new Request("https://localhost/api/track", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Origin": "https://herbsmitra.com"
  },
  body: JSON.stringify(testVisit)
});

const env = { WC_URL: "https://herbsmitra.com" };

const res = await onRequestPost({ request: req, env });
const body = await res.json();

console.log("Response status:", res.status);
console.log("Response body:", body);

if (res.status !== 200 || !body.ok) {
  console.error("FAIL: Ingestion failed!");
  process.exit(1);
}

// Verify round-trip in database
const rows = await query(env, "SELECT * FROM visits WHERE visitor_id = ?", ["test_visitor_uuid_99999"]);
console.log("Database round-trip rows:", rows);

if (rows.length !== 1 || rows[0].visitor_id !== "test_visitor_uuid_99999" || rows[0].source !== "Meta Ads") {
  console.error("FAIL: Visit did not round-trip accurately!");
  process.exit(1);
}

// Test PII rejection
const piiReq = new Request("https://localhost/api/track", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ visitor_id: "vid_pii", email: "secret@example.com" })
});
const piiRes = await onRequestPost({ request: piiReq, env });
console.log("PII rejection test status (expected 400):", piiRes.status);
if (piiRes.status !== 400) {
  console.error("FAIL: PII was not rejected!");
  process.exit(1);
}

console.log("Phase 1e Checkpoint: SUCCESS!");
