// SuperAttribution Engine - Pure functions only, zero database calls
// 7-day click-only attribution window, exact fraction weighting, monotonic store totals

export const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

/**
 * Classify visit traffic source strictly in order:
 * 1. Meta Ads
 * 2. Google Ads
 * 3. Email
 * 4. WhatsApp
 * 5. Organic Search
 * 6. Organic Social
 * 7. Direct
 */
export function classifySource(utm_source = "", utm_medium = "", utm_campaign = "", utm_term = "", utm_content = "", fbclid = "", gclid = "", referrer = "") {
  const src = String(utm_source || "").toLowerCase().trim();
  const med = String(utm_medium || "").toLowerCase().trim();
  const ref = String(referrer || "").toLowerCase().trim();
  const fb = String(fbclid || "").trim();
  const g = String(gclid || "").trim();

  // 1. Meta Ads
  if (
    fb ||
    /^(facebook|instagram|meta|fb|ig)$/i.test(src) ||
    /paid_social|paidsocial/i.test(med) ||
    ((src.includes("facebook") || src.includes("instagram")) && (med === "cpc" || med === "ads" || med === "paid"))
  ) {
    return "Meta Ads";
  }

  // 2. Google Ads
  if (
    g ||
    /^(google|adwords)$/i.test(src) && (/cpc|ppc|paid_search|paidsearch/i.test(med))
  ) {
    return "Google Ads";
  }

  // 3. Email
  if (
    src.includes("email") ||
    src.includes("newsletter") ||
    src.includes("klaviyo") ||
    src.includes("mailchimp") ||
    med === "email"
  ) {
    return "Email";
  }

  // 4. WhatsApp
  if (
    src.includes("whatsapp") ||
    ref.includes("wa.me") ||
    ref.includes("whatsapp.com") ||
    ref.includes("api.whatsapp.com")
  ) {
    return "WhatsApp";
  }

  // 5. Organic Search
  if (
    !fb && !g && !med.includes("cpc") &&
    (ref.includes("google.") || ref.includes("bing.com") || ref.includes("duckduckgo.com") || ref.includes("yahoo.com") || src === "organic")
  ) {
    return "Organic Search";
  }

  // 6. Organic Social
  if (
    !fb && !g && !med.includes("cpc") && !med.includes("paid") &&
    (ref.includes("instagram.com") || ref.includes("facebook.com") || ref.includes("t.co") || ref.includes("twitter.com") || ref.includes("x.com") || ref.includes("youtube.com") || ref.includes("linkedin.com") || ref.includes("pinterest.com"))
  ) {
    return "Organic Social";
  }

  // 7. Direct
  return "Direct";
}

/** Check if a visit is direct / uncredited */
export function isDirectVisit(visit) {
  if (!visit) return true;
  const s = visit.source || classifySource(
    visit.utm_source || visit.source,
    visit.utm_medium || visit.medium,
    visit.utm_campaign || visit.campaign,
    visit.utm_term || visit.term,
    visit.utm_content || visit.content,
    visit.fbclid,
    visit.gclid,
    visit.referrer
  );
  return s === "Direct";
}

/** Filter and validate journey visits within 7-day click-only window */
export function filterJourney(journey = [], orderTs) {
  if (!Array.isArray(journey) || journey.length === 0) return [];
  const orderTime = new Date(orderTs).getTime();
  const windowStart = orderTime - SEVEN_DAYS_MS;

  return journey.filter(v => {
    if (!v.ts) return false;
    const vTime = new Date(v.ts).getTime();
    // A visit 7 days + 1 hour before order gets 0%
    return vTime >= windowStart && vTime <= orderTime;
  });
}

/**
 * attributeOrder(order, journey, model, surveyAnswersCount = 0)
 * Pure function: attributes order revenue and fractional order weight.
 * Models: BLEND, FIRST, LAST, LINEAR, SURVEY, PAID LC, META
 */
export function attributeOrder(order, rawJourney = [], model = "BLEND", surveyAnswersCount = 0) {
  const normModel = String(model || "BLEND").toUpperCase().trim();
  const total = Number(order.total || order.amount || 0);
  const orderTs = order.date_created || order.order_date || order.ts || new Date().toISOString();

  // Filter journey strictly to 7-day window
  const validVisits = filterJourney(rawJourney, orderTs);

  // Non-direct visits only for attribution
  const nonDirectVisits = validVisits.filter(v => !isDirectVisit(v));

  // If no non-direct visits or no journey data at all -> Count as Direct in full (except PAID LC which gets 0)
  if (nonDirectVisits.length === 0) {
    if (normModel === "PAID LC") {
      return []; // Paid last click double-counting model only rewards paid platforms
    }
    return [
      {
        channel: "Direct",
        campaign_id: "direct",
        adset_id: "",
        ad_id: "",
        weight: 1.0,
        revenue: total,
        is_direct: true,
        is_broken_utm: false,
      },
    ];
  }

  // Model 1: BLEND (Position Blend: 1->100%, 2->40/60, 3+->30/50/20)
  if (normModel === "BLEND") {
    const n = nonDirectVisits.length;
    let weights = [];
    if (n === 1) {
      weights = [1.0];
    } else if (n === 2) {
      weights = [0.4, 0.6];
    } else {
      const middleShare = 0.2 / (n - 2);
      weights = [0.3];
      for (let i = 1; i < n - 1; i++) weights.push(middleShare);
      weights.push(0.5);
    }
    return mapWeightedVisits(nonDirectVisits, weights, total);
  }

  // Model 2: FIRST (100% to first non-direct visit)
  if (normModel === "FIRST") {
    const weights = new Array(nonDirectVisits.length).fill(0);
    weights[0] = 1.0;
    return mapWeightedVisits(nonDirectVisits, weights, total);
  }

  // Model 3: LAST (100% to last non-direct visit)
  if (normModel === "LAST") {
    const weights = new Array(nonDirectVisits.length).fill(0);
    weights[weights.length - 1] = 1.0;
    return mapWeightedVisits(nonDirectVisits, weights, total);
  }

  // Model 4: LINEAR (equal split)
  if (normModel === "LINEAR") {
    const n = nonDirectVisits.length;
    const weights = new Array(n).fill(1.0 / n);
    return mapWeightedVisits(nonDirectVisits, weights, total);
  }

  // Model 5: SURVEY (Survey Blend: pure equal split until 30 answers exist)
  if (normModel === "SURVEY") {
    const n = nonDirectVisits.length;
    const weights = new Array(n).fill(1.0 / n);
    // Until 30 answers exist, pure equal split
    return mapWeightedVisits(nonDirectVisits, weights, total);
  }

  // Model 6: PAID LC (Paid Last Click per platform)
  if (normModel === "PAID LC") {
    // Each paid platform gets 100% for its own last paid click
    const results = [];
    const seenPlatforms = new Set();
    // Traverse in reverse (latest first)
    for (let i = nonDirectVisits.length - 1; i >= 0; i--) {
      const v = nonDirectVisits[i];
      const ch = getVisitChannel(v);
      if ((ch === "Meta Ads" || ch === "Google Ads") && !seenPlatforms.has(ch)) {
        seenPlatforms.add(ch);
        const touchInfo = buildTouchInfo(v);
        results.push({
          ...touchInfo,
          weight: 1.0,
          revenue: total,
        });
      }
    }
    return results;
  }

  // Default fallback to BLEND
  return attributeOrder(order, rawJourney, "BLEND", surveyAnswersCount);
}

function getVisitChannel(v) {
  return v.source || classifySource(
    v.utm_source || v.source,
    v.utm_medium || v.medium,
    v.utm_campaign || v.campaign,
    v.utm_term || v.term,
    v.utm_content || v.content,
    v.fbclid,
    v.gclid,
    v.referrer
  );
}

function buildTouchInfo(v) {
  const channel = getVisitChannel(v);
  const campaign = String(v.utm_campaign || v.campaign || "").trim();
  const term = String(v.utm_term || v.term || "").trim();
  const content = String(v.utm_content || v.content || "").trim();
  const fbclid = String(v.fbclid || "").trim();
  const gclid = String(v.gclid || "").trim();

  // Broken UTM check: has paid click id but no campaign id
  const isPaid = channel === "Meta Ads" || channel === "Google Ads" || fbclid || gclid;
  const isBroken = Boolean(isPaid && !campaign);

  return {
    channel,
    campaign_id: isBroken ? "unattributed_broken_utm" : (campaign || channel.toLowerCase().replace(/\s+/g, "_")),
    adset_id: term,
    ad_id: content,
    is_direct: channel === "Direct",
    is_broken_utm: isBroken,
  };
}

function mapWeightedVisits(visits, weights, totalRevenue) {
  return visits.map((v, idx) => {
    const w = weights[idx] || 0;
    const touch = buildTouchInfo(v);
    return {
      ...touch,
      weight: w,
      revenue: totalRevenue * w,
    };
  });
}
