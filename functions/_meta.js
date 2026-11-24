// Meta Marketing API Extension for SuperAttribution
// Read-only insights sync per Campaign, Ad Set, and Ad.
// Persists raw rows into meta_rows and reports sync health.

import { upsertMetaRow, query } from "./_db.js";

const GRAPH = "https://graph.facebook.com/v23.0";

function pickPurchase(list) {
  if (!Array.isArray(list)) return 0;
  const by = Object.fromEntries(list.map(a => [a.action_type, Number(a.value) || 0]));
  return by.omni_purchase ?? by.purchase ?? by["offsite_conversion.fb_pixel_purchase"] ?? 0;
}

export async function syncMetaInsights(env, timeRange = null) {
  // If no token or account, honestly report "Not connected"
  if (!env.META_TOKEN || !env.META_AD_ACCOUNT) {
    return {
      connected: false,
      message: "Not connected (Token pending from client)",
      campaigns: [],
      adsets: [],
      ads: [],
      totalSpend: 0,
      metaClaimedPurchases: 0,
      metaClaimedValue: 0,
    };
  }

  const acct = String(env.META_AD_ACCOUNT).replace(/^act_/, "");
  const dateStr = timeRange && timeRange.since ? timeRange.since : new Date().toISOString().slice(0, 10);

  const levels = ["campaign", "adset", "ad"];
  const results = { campaign: [], adset: [], ad: [] };

  try {
    for (const level of levels) {
      const u = new URL(`${GRAPH}/act_${acct}/insights`);
      const fields = [
        "campaign_id",
        "campaign_name",
        level !== "campaign" ? "adset_id" : null,
        level !== "campaign" ? "adset_name" : null,
        level === "ad" ? "ad_id" : null,
        level === "ad" ? "ad_name" : null,
        "spend",
        "impressions",
        "clicks",
        "actions",
        "action_values",
      ].filter(Boolean).join(",");

      const params = {
        level,
        limit: "100",
        fields,
        access_token: env.META_TOKEN,
      };

      if (timeRange && timeRange.since && timeRange.until) {
        params.time_range = JSON.stringify({ since: timeRange.since, until: timeRange.until });
      } else {
        params.date_preset = "today";
      }

      u.search = new URLSearchParams(params);
      const res = await fetch(u);
      const data = await res.json();

      if (!res.ok || data.error) {
        return {
          connected: false,
          error: data.error ? data.error.message : `Meta API HTTP ${res.status}`,
          campaigns: [],
          adsets: [],
          ads: [],
          totalSpend: 0,
          metaClaimedPurchases: 0,
          metaClaimedValue: 0,
        };
      }

      const rows = data.data || [];
      for (const r of rows) {
        const spend = Number(r.spend || 0);
        const impressions = Number(r.impressions || 0);
        const clicks = Number(r.clicks || 0);
        const purchases = pickPurchase(r.actions);
        const value = pickPurchase(r.action_values);

        const rowObj = {
          date: dateStr,
          campaign_id: r.campaign_id || "",
          campaign_name: r.campaign_name || "",
          adset_id: r.adset_id || "",
          adset_name: r.adset_name || "",
          ad_id: r.ad_id || "",
          ad_name: r.ad_name || "",
          spend,
          impressions,
          clicks,
          meta_purchases: Math.round(purchases),
          meta_value: Math.round(value),
          raw_json: r,
        };

        results[level].push(rowObj);

        // Persist to meta_rows table
        try {
          await upsertMetaRow(env, rowObj);
        } catch (e) {}
      }
    }

    const totalSpend = results.campaign.reduce((a, c) => a + c.spend, 0);
    const metaClaimedPurchases = results.campaign.reduce((a, c) => a + c.meta_purchases, 0);
    const metaClaimedValue = results.campaign.reduce((a, c) => a + c.meta_value, 0);

    return {
      connected: true,
      message: "Connected",
      campaigns: results.campaign,
      adsets: results.adset,
      ads: results.ad,
      totalSpend: Math.round(totalSpend),
      metaClaimedPurchases,
      metaClaimedValue: Math.round(metaClaimedValue),
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message,
      campaigns: [],
      adsets: [],
      ads: [],
      totalSpend: 0,
      metaClaimedPurchases: 0,
      metaClaimedValue: 0,
    };
  }
}
