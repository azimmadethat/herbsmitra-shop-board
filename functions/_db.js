// Persistent Storage Adapter for SuperAttribution
// Supports Turso (libSQL HTTP pipeline) and Neon Postgres, with graceful fallback.

const MEM_DB = {
  visits: new Map(),
  synced_orders: new Map(),
  meta_rows: new Map(),
};

function formatTursoArg(val) {
  if (val === null || val === undefined) return { type: "null" };
  if (typeof val === "number") {
    return Number.isInteger(val) ? { type: "integer", value: String(val) } : { type: "float", value: val };
  }
  if (typeof val === "boolean") return { type: "integer", value: val ? "1" : "0" };
  return { type: "text", value: String(val) };
}

function parseTursoResult(result) {
  if (!result || !result.response || result.response.type !== "execute") return [];
  const { cols, rows } = result.response.result;
  if (!cols || !rows) return [];
  return rows.map(r => {
    const rowObj = {};
    cols.forEach((col, idx) => {
      const cell = r[idx];
      rowObj[col.name] = cell ? (cell.value !== undefined ? (cell.type === "integer" ? Number(cell.value) : cell.value) : null) : null;
    });
    return rowObj;
  });
}

export function getDbInfo(env) {
  if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
    return {
      connected: true,
      store: "turso",
      limits: "Turso Free Starter: 9 GB storage, 1B row reads/mo, 500 databases, no card needed",
    };
  }
  if (env.NEON_DATABASE_URL) {
    return {
      connected: true,
      store: "neon",
      limits: "Neon Free Tier: 0.5 GiB storage, free compute, no card needed",
    };
  }
  return {
    connected: false,
    store: "memory_fallback",
    limits: "Transient memory only. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to Vercel for 7-day persistence.",
  };
}

/** Execute a single SQL statement with parameters */
export async function query(env, sql, args = []) {
  if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
    let endpoint = env.TURSO_DATABASE_URL.replace(/^libsql:\/\//, "https://");
    if (!endpoint.endsWith("/v2/pipeline")) {
      endpoint = endpoint.replace(/\/+$/, "") + "/v2/pipeline";
    }

    const payload = {
      requests: [
        {
          type: "execute",
          stmt: {
            sql,
            args: args.map(formatTursoArg),
          },
        },
        { type: "close" },
      ],
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Turso libSQL query error (${res.status}): ${txt}`);
    }

    const out = await res.json();
    const firstResult = out.results && out.results[0];
    if (firstResult && firstResult.type === "error") {
      throw new Error(`Turso execution error: ${firstResult.error.message}`);
    }
    return parseTursoResult(firstResult);
  }

  // Neon Postgres query via HTTP
  if (env.NEON_DATABASE_URL) {
    const match = env.NEON_DATABASE_URL.match(/postgres(?:ql)?:\/\/(?:([^:]+):([^@]+)@)?([^/:]+)(?::(\d+))?\/([^?]+)/);
    if (match) {
      const host = match[3];
      const res = await fetch(`https://${host}/sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql, params: args }),
      });
      if (res.ok) {
        const out = await res.json();
        return out.rows || [];
      }
    }
  }

  // In-memory fallback
  return runMemoryQuery(sql, args);
}

/** In-memory query simulation for visits, orders, and meta_rows */
function runMemoryQuery(sql, args) {
  const norm = sql.trim().toUpperCase();

  // INSERT INTO visits
  if (norm.startsWith("INSERT INTO VISITS") || norm.startsWith("INSERT OR REPLACE INTO VISITS")) {
    const [id, visitor_id, ts, landing_url, referrer, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbclid, gclid, source] = args;
    MEM_DB.visits.set(id, {
      id, visitor_id, ts, landing_url, referrer, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbclid, gclid, source
    });
    return [];
  }

  // SELECT FROM visits WHERE visitor_id = ?
  if (norm.includes("FROM VISITS") && norm.includes("VISITOR_ID")) {
    const vid = args[0];
    const results = [];
    for (const v of MEM_DB.visits.values()) {
      if (v.visitor_id === vid) results.push(v);
    }
    return results.sort((a, b) => (a.ts > b.ts ? 1 : -1));
  }

  // SELECT FROM visits WHERE ts >= ? (range)
  if (norm.includes("FROM VISITS")) {
    return Array.from(MEM_DB.visits.values()).sort((a, b) => (a.ts > b.ts ? 1 : -1));
  }

  // INSERT INTO synced_orders
  if (norm.startsWith("INSERT INTO SYNCED_ORDERS") || norm.startsWith("INSERT OR REPLACE INTO SYNCED_ORDERS")) {
    const [order_id, order_date, total, status, payment_method, payment_method_title, visitor_id, journey_json, synced_at] = args;
    MEM_DB.synced_orders.set(order_id, {
      order_id, order_date, total, status, payment_method, payment_method_title, visitor_id, journey_json, synced_at
    });
    return [];
  }

  // SELECT FROM synced_orders
  if (norm.includes("FROM SYNCED_ORDERS")) {
    return Array.from(MEM_DB.synced_orders.values());
  }

  // INSERT INTO meta_rows
  if (norm.startsWith("INSERT INTO META_ROWS") || norm.startsWith("INSERT OR REPLACE INTO META_ROWS")) {
    const [date, campaign_id, adset_id, ad_id, spend, impressions, clicks, meta_purchases, meta_value, raw_json] = args;
    const key = `${date}_${campaign_id}_${adset_id}_${ad_id}`;
    MEM_DB.meta_rows.set(key, {
      date, campaign_id, adset_id, ad_id, spend, impressions, clicks, meta_purchases, meta_value, raw_json
    });
    return [];
  }

  // SELECT FROM meta_rows
  if (norm.includes("FROM META_ROWS")) {
    return Array.from(MEM_DB.meta_rows.values());
  }

  return [];
}

/** Record a visit into the visits table */
export async function recordVisit(env, visit) {
  const sql = `INSERT OR REPLACE INTO visits (id, visitor_id, ts, landing_url, referrer, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbclid, gclid, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const args = [
    visit.id || ("v_" + Math.random().toString(36).slice(2) + Date.now().toString(36)),
    visit.visitor_id,
    visit.ts || new Date().toISOString(),
    visit.landing_url || "",
    visit.referrer || "",
    visit.utm_source || "",
    visit.utm_medium || "",
    visit.utm_campaign || "",
    visit.utm_term || "",
    visit.utm_content || "",
    visit.fbclid || "",
    visit.gclid || "",
    visit.source || "Direct",
  ];
  return query(env, sql, args);
}

/** Fetch all visits for a visitor_id in the 7 days leading up to orderTs */
export async function getVisitsForVisitor(env, visitorId, orderTs) {
  const orderTime = new Date(orderTs).getTime();
  const windowStart = new Date(orderTime - 7 * 24 * 3600 * 1000).toISOString();
  const orderTimeIso = new Date(orderTime).toISOString();

  const sql = `SELECT * FROM visits WHERE visitor_id = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC`;
  return query(env, sql, [visitorId, windowStart, orderTimeIso]);
}

/** Upsert order into synced_orders */
export async function upsertSyncedOrder(env, o) {
  const sql = `INSERT OR REPLACE INTO synced_orders (order_id, order_date, total, status, payment_method, payment_method_title, visitor_id, journey_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  return query(env, sql, [
    o.order_id,
    o.order_date,
    o.total,
    o.status,
    o.payment_method || "",
    o.payment_method_title || "",
    o.visitor_id || "",
    typeof o.journey_json === "string" ? o.journey_json : JSON.stringify(o.journey_json || []),
    new Date().toISOString(),
  ]);
}

/** Upsert meta row */
export async function upsertMetaRow(env, row) {
  const sql = `INSERT OR REPLACE INTO meta_rows (date, campaign_id, adset_id, ad_id, spend, impressions, clicks, meta_purchases, meta_value, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  return query(env, sql, [
    row.date,
    row.campaign_id,
    row.adset_id || "",
    row.ad_id || "",
    row.spend || 0,
    row.impressions || 0,
    row.clicks || 0,
    row.meta_purchases || 0,
    row.meta_value || 0,
    typeof row.raw_json === "string" ? row.raw_json : JSON.stringify(row.raw_json || {}),
  ]);
}
