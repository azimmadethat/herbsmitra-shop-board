/**
 * SuperAttribution First-Party Pixel for WooCommerce
 * Logs visits, click IDs, UTMs, and journey touchpoints.
 * 100% Free, first-party cookie/localStorage, zero third-party tracking, zero personal data.
 */
(function() {
  "use strict";

  // Check Do Not Track
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.msDoNotTrack === "1") {
    return;
  }

  const COOKIE_NAME = "_sa_vid";
  const JOURNEY_KEY = "_sa_journey";
  const QUEUE_KEY = "_sa_queue";
  const MAX_JOURNEY = 15;

  // Derive endpoint from script src or current origin
  let scriptEl = document.currentScript;
  let trackUrl = "/api/track";
  if (scriptEl && scriptEl.src) {
    try {
      const u = new URL(scriptEl.src);
      trackUrl = u.origin + "/api/track";
    } catch (e) {}
  }

  // 1. Get or Create Visitor ID (UUIDv4)
  function getCookie(name) {
    const v = document.cookie.match("(^|;) ?" + name + "=([^;]*)(;|$)");
    return v ? decodeURIComponent(v[2]) : null;
  }

  function setCookie(name, val, days) {
    const d = new Date();
    d.setTime(d.getTime() + 24 * 60 * 60 * 1000 * days);
    document.cookie = name + "=" + encodeURIComponent(val) + ";path=/;expires=" + d.toUTCString() + ";SameSite=Lax";
  }

  function uuidv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  let vid = getCookie(COOKIE_NAME);
  if (!vid) {
    try { vid = localStorage.getItem(COOKIE_NAME); } catch (e) {}
  }
  if (!vid) {
    vid = uuidv4();
    setCookie(COOKIE_NAME, vid, 365);
    try { localStorage.setItem(COOKIE_NAME, vid); } catch (e) {}
  } else {
    // Refresh cookie expiry
    setCookie(COOKIE_NAME, vid, 365);
  }

  // Expose visitor ID globally so checkout scripts can stamp it
  window._sa_vid = vid;

  // 2. Extract UTMs and Click IDs
  const params = new URLSearchParams(window.location.search);
  const touch = {
    visitor_id: vid,
    ts: new Date().toISOString(),
    landing_url: window.location.href.split("#")[0],
    referrer: document.referrer || "",
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
    utm_term: params.get("utm_term") || "",
    utm_content: params.get("utm_content") || "",
    fbclid: params.get("fbclid") || "",
    gclid: params.get("gclid") || params.get("gbraid") || params.get("wbraid") || "",
    msclkid: params.get("msclkid") || "",
    ttclid: params.get("ttclid") || "",
  };

  // 3. Maintain Local Journey for Cart Stamp
  try {
    let journey = JSON.parse(localStorage.getItem(JOURNEY_KEY) || "[]");
    // Only append if there are UTMs, click IDs, or an external referrer
    const isNonDirect = Boolean(
      touch.utm_source || touch.utm_medium || touch.utm_campaign ||
      touch.fbclid || touch.gclid ||
      (touch.referrer && !touch.referrer.includes(window.location.hostname))
    );
    if (isNonDirect || journey.length === 0) {
      journey.push({
        ts: touch.ts,
        source: touch.utm_source || (touch.fbclid ? "facebook" : (touch.gclid ? "google" : "")),
        medium: touch.utm_medium,
        campaign: touch.utm_campaign,
        term: touch.utm_term,
        content: touch.utm_content,
        fbclid: touch.fbclid,
        gclid: touch.gclid,
        referrer: touch.referrer,
      });
      if (journey.length > MAX_JOURNEY) journey = journey.slice(-MAX_JOURNEY);
      localStorage.setItem(JOURNEY_KEY, JSON.stringify(journey));
    }
    window._sa_journey = journey;
  } catch (e) {}

  // 4. Send Track Beacon Non-Blocking
  function sendPayload(payload) {
    const dataStr = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(trackUrl, dataStr);
      if (ok) return;
    }
    fetch(trackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: dataStr,
      keepalive: true,
      mode: "cors",
    }).catch(function() {
      // Queue on failure
      try {
        const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
        queue.push(payload);
        if (queue.length > 20) queue.shift();
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      } catch (err) {}
    });
  }

  // Flush retry queue if any
  try {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    if (queue.length > 0) {
      localStorage.removeItem(QUEUE_KEY);
      queue.forEach(function(item) {
        sendPayload(item);
      });
    }
  } catch (err) {}

  // Log current visit
  sendPayload(touch);

  // 5. Funnel Event Dispatcher
  window.saEvent = function(eventName, data) {
    const evt = {
      visitor_id: vid,
      event: eventName,
      ts: new Date().toISOString(),
      url: window.location.href.split("#")[0],
      data: data || {},
    };
    sendPayload(evt);
  };

  // Auto-detect WooCommerce funnel interactions
  document.addEventListener("DOMContentLoaded", function() {
    // AddToCart button click detection
    document.querySelectorAll(".add_to_cart_button, .single_add_to_cart_button, [name='add-to-cart']").forEach(function(btn) {
      btn.addEventListener("click", function() {
        window.saEvent("AddToCart", {
          product_id: btn.value || btn.dataset.productId || ""
        });
      });
    });
  });
})();
