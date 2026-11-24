import fs from "fs";
import path from "path";

const sqlFile = path.join(process.cwd(), "migrations", "001_init_attribution.sql");
const sql = fs.readFileSync(sqlFile, "utf8");

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

console.log("=== SuperAttribution Database Setup ===");

if (!tursoUrl || !tursoToken) {
  console.log("TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not set in environment.");
  console.log("To setup your free Turso database:");
  console.log("1. Sign up at https://turso.tech (Free starter plan, No card required)");
  console.log("2. Create a db: turso db create herbsmitra-attribution");
  console.log("3. Get URL & Token: turso db show herbsmitra-attribution --url ; turso db tokens create herbsmitra-attribution");
  console.log("4. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel / environment, then run this script again.");
  process.exit(0);
}

let endpoint = tursoUrl.replace(/^libsql:\/\//, "https://");
if (!endpoint.endsWith("/v2/pipeline")) {
  endpoint = endpoint.replace(/\/+$/, "") + "/v2/pipeline";
}

const statements = sql
  .split(";")
  .map(s => s.trim())
  .filter(s => s.length > 0);

const requests = statements.map(stmt => ({
  type: "execute",
  stmt: { sql: stmt, args: [] }
}));
requests.push({ type: "close" });

console.log(`Executing ${statements.length} DDL statements on Turso...`);

const res = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${tursoToken}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ requests })
});

if (!res.ok) {
  const errText = await res.text();
  console.error("Turso error:", res.status, errText);
  process.exit(1);
}

const out = await res.json();
console.log("Success! Tables created on Turso.");
