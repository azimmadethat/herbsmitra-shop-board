// POST /api/track - Ingests anonymous visit pings from first-party pixel
// No board key required. Strictly sanitizes data to guarantee NO PII.

import { recordVisit } from "../_db.js";
import { classifySource } from "../_attribution.js";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b[6-9]\d{9}\b/;

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  let allowedOrigin = "*";
  if (env.WC_URL) {
    try {
      const storeHost = new URL(env.WC_URL).origin;
      if (origin === storeHost || !origin) allowedOrigin = storeHost;
    } catch (e) {}
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    const rawBody = await request.text();
    if (!rawBody || rawBody.length > 32768) {
      return new Response(JSON.stringify({ error: "Payload empty or too large" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Reject any PII (names, emails, phone numbers, addresses)
    if (EMAIL_REGEX.test(rawBody) || PHONE_REGEX.test(rawBody)) {
      return new Response(JSON.stringify({ error: "PII detected; personal data is strictly forbidden" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const payload = JSON.parse(rawBody);

    // Reject objects containing forbidden PII fields
    const forbiddenKeys = ["name", "email", "phone", "address", "customer_name", "billing", "shipping", "card", "token"];
    for (const key of forbiddenKeys) {
      if (key in payload) {
        return new Response(JSON.stringify({ error: `Forbidden field '${key}' in payload` }), {
          status: 400,
          headers: corsHeaders,
        });
      }
    }

    if (!payload.visitor_id) {
      return new Response(JSON.stringify({ error: "Missing visitor_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Classify source
    const source = classifySource(
      payload.utm_source,
      payload.utm_medium,
      payload.utm_campaign,
      payload.utm_term,
      payload.utm_content,
      payload.fbclid,
      payload.gclid,
      payload.referrer
    );

    const visit = {
      visitor_id: String(payload.visitor_id).slice(0, 64),
      ts: payload.ts || new Date().toISOString(),
      landing_url: String(payload.landing_url || payload.url || "").slice(0, 500),
      referrer: String(payload.referrer || "").slice(0, 500),
      utm_source: String(payload.utm_source || "").slice(0, 100),
      utm_medium: String(payload.utm_medium || "").slice(0, 100),
      utm_campaign: String(payload.utm_campaign || "").slice(0, 100),
      utm_term: String(payload.utm_term || "").slice(0, 100),
      utm_content: String(payload.utm_content || "").slice(0, 100),
      fbclid: String(payload.fbclid || "").slice(0, 120),
      gclid: String(payload.gclid || "").slice(0, 120),
      source,
    };

    await recordVisit(env, visit);

    return new Response(JSON.stringify({ ok: true, source }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Invalid payload" }), {
      status: 400,
      headers: corsHeaders,
    });
  }
}

export async function onRequestOptions({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
