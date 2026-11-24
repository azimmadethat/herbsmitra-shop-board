// Setup check: says in plain words which connections work. WooCommerce version.
// Used by: node scripts/check.mjs "<board link with ?k=...>"
import { json, authorised, metaCampaigns } from "../_lib.js";
import { wooRaw } from "../_woo.js";
import { complete } from "../_ai.js";

export async function onRequestGet({ request, env }) {
  const out = {};
  out.board_key = env.BOARD_KEY ? (authorised(request, env) ? "ok" : "wrong key in the link") : "BOARD_KEY is not set";
  if (out.board_key !== "ok") return json(out, 401);
  out.storage = env.BOARD_KV ? "ok" : "not connected (works, but slower)";
  try {
    const { data, total } = await wooRaw(env, "/orders", { per_page: 1, _fields: "id,number,status,billing,shipping" });
    const o = (data && data[0]) || {};
    const city = (o.shipping && o.shipping.city) || (o.billing && o.billing.city) || "";
    out.woocommerce = `ok: ${env.WC_URL} (${total || "?"} orders in total)`;
    out.woocommerce_customer_details = city ? `ok: latest order ships to ${city}` : "not allowed (board works, without cities and first names)";
  } catch (e) { out.woocommerce = "error: " + String(e.message || e).slice(0, 300); }
  if (env.META_TOKEN && env.META_AD_ACCOUNT) {
    const m = await metaCampaigns(env, "").catch(e => ({ error: String(e.message || e) }));
    out.meta = m.error ? "error: " + m.error : `ok: ${m.campaigns.length} campaigns with spend today`;
  } else out.meta = "not set up (optional)";
  out.voice_ai = "disabled";
  return json(out);
}
