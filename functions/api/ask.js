// Voice questions from the board's mic. With an AI key the answer is written by the AI from the
// board's numbers; without one, simple questions are answered straight from the numbers.
import { json, authorised, money } from "../_lib.js";
import { snapshot } from "../_woo.js";
import { complete } from "../_ai.js";

export async function onRequestPost({ request, env }) {
  if (!authorised(request, env)) return json({ error: "This board link is missing its key." }, 401);
  let q = "";
  try { q = String((await request.json()).q || "").trim().slice(0, 500); } catch (e) {}
  if (!q) return json({ error: "empty question" }, 400);
  let s;
  try { s = await snapshot(env); }
  catch (e) { return json({ answer: "Sorry, I couldn't reach the shop's numbers just now." }); }
  if (env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY) {
    try { return json({ answer: await aiAnswer(env, q, s) }); } catch (e) { /* fall through to the simple answer */ }
  }
  return json({ answer: simpleAnswer(q, s) });
}

async function aiAnswer(env, q, s) {
  const hist = s._hist || { hours: {}, orders: {}, items: {} };
  delete s._hist; delete s.insights; delete s.orders_today;
  const days = Object.keys(hist.hours).sort().slice(-30)
    .map(d => [d, Math.round(hist.hours[d].reduce((a, b) => a + b, 0)), hist.orders[d] || 0]);
  const units = {};
  for (const d of Object.keys(hist.items).sort().slice(-30))
    for (const [n, u] of Object.entries(hist.items[d])) units[n] = (units[n] || 0) + u;
  const prompt = `You are the voice of a TV sales board for the online store "${s.store_name}".
The owner pressed the mic and asked: "${q}"

Live board right now (WooCommerce sales today, Meta campaign spend and Meta-reported purchases today): ${JSON.stringify(s)}
Shopify daily sales for the last 30 days (date, sales, orders): ${JSON.stringify(days)}
Units sold per product over the last 30 days, excluding today: ${JSON.stringify(Object.entries(units).sort((a, b) => b[1] - a[1]))}
Break-even ROAS is ${s.break_even}. "roas_real" is Shopify sales divided by ad spend; "roas_meta" is what Meta claims. Say which one you mean.
If the numbers above do not answer the question, say so briefly and say what the board does know.

Your answer is spoken aloud by the TV. Rules: 2 to 4 short sentences, plain speech, no markdown, no lists,
no emojis, no em dashes. Write amounts like "₹12,400". Lead with the direct answer. Never invent a number.`;
  return complete(env, prompt, 300);
}

function simpleAnswer(question, s) {
  const q = question.toLowerCase();
  const camps = s.campaigns || [], products = s.products || [], recent = s.recent || [];
  const has = words => words.some(w => q.includes(w));
  if (has(["spend", "spent", "ad cost", "ads", "campaign"])) {
    if (!s.spend) return s.meta_on ? "No ad spend recorded yet today." : "The board isn't connected to Meta ads yet.";
    const top = camps.reduce((a, c) => c.spend > a.spend ? c : a, camps[0]);
    return [`Ad spend today is ${money(s.spend)} across ${camps.length} campaigns.`,
            s.roas_real ? `Real return is ${s.roas_real.toFixed(2)} times against a break-even of ${s.break_even}.` : "",
            top ? `The biggest spender is ${top.short} at ${money(top.spend)}.` : ""].join(" ").trim();
  }
  if (has(["roas", "return", "break-even", "breakeven"])) {
    if (!s.spend) return "There's no ad spend yet today, so no return to report.";
    return [`Real return today is ${s.roas_real.toFixed(2)} times, Shopify sales divided by ad spend.`,
            s.roas_meta ? `Meta reports ${s.roas_meta.toFixed(2)} times.` : "", `Break-even is ${s.break_even}.`].join(" ").trim();
  }
  if (has(["product", "selling", "seller", "item", "units"])) {
    if (!products.length) return "Nothing has sold yet today.";
    return `${products[0][0]} is today's best seller with ${products[0][1]} sold.` +
      (products[1] ? ` Next is ${products[1][0]} with ${products[1][1]}.` : "");
  }
  if (has(["yesterday", "ahead", "behind", "compare"])) {
    return [`Yesterday finished at ${money(s.yesterday_total)}.`,
            s.vs_yesterday_pct !== null ? `Right now you're ${Math.abs(s.vs_yesterday_pct)}% ${s.vs_yesterday_pct >= 0 ? "ahead of" : "behind"} yesterday at this time.` : "",
            s.projection ? `Today is heading for about ${money(s.projection)}.` : ""].join(" ").trim();
  }
  if (has(["city", "cities", "top city", "kahan se"])) {
    const cs = s.cities || [];
    if (!cs.length) return "No city has ordered yet today.";
    const line = cs.slice(0, 3).map(c => `${c.city} ${c.orders}`).join(", ");
    return `Most orders today are from ${cs[0].city} with ${cs[0].orders} order${cs[0].orders === 1 ? "" : "s"}. Top cities: ${line}.`;
  }
  if (has(["cancel", "refund", "failed", "failure"])) {
    const rj = s.rejected || { cancelled: { orders: 0 }, refunded: { orders: 0 }, failed: { orders: 0 } };
    const bad = rj.cancelled.orders + rj.refunded.orders + rj.failed.orders;
    if (!bad) return "No order was cancelled, refunded or failed today.";
    return `${bad} order${bad === 1 ? "" : "s"} did not go through today: ${rj.cancelled.orders} cancelled, ${rj.refunded.orders} refunded, ${rj.failed.orders} failed. Meta may still count some of these as purchases.`;
  }
  if (has(["cod", "cash on delivery", "prepaid", "online payment"])) {
    const p = s.payment;
    if (!p) return "No orders yet today.";
    return `Today: ${p.cod.orders} order${p.cod.orders === 1 ? "" : "s"} on cash on delivery for ${money(p.cod.revenue)}, and ${p.prepaid.orders} prepaid or online for ${money(p.prepaid.revenue)}.`;
  }
  if (has(["pending", "processing", "pipeline", "to pack", "packed", "on hold", "on-hold"])) {
    const st = s.statuses;
    if (!st) return "No orders yet today.";
    return `Today: ${st.processing.orders} processing, ${st.pending.orders} pending, ${st["on-hold"].orders} on hold, ${st.completed.orders} completed, and ${st.cancelled.orders + st.refunded.orders + st.failed.orders} that did not go through.`;
  }
  if (has(["recent", "latest", "last order", "city", "cities", "customer"])) {
    if (!recent.length) return "No orders yet today.";
    const o = recent[0];
    return `The latest order was ${money(o.amount)}${o.city ? " from " + o.city : ""} at ${o.at}.` +
      (s.customer_details ? ` ${s.new_customers} of today's ${s.orders} orders are from new customers.` : "");
  }
  return `Sales today are ${money(s.revenue)} from ${s.orders} orders, about ${money(s.aov)} per order.` +
    (s.vs_yesterday_pct !== null ? ` That's ${Math.abs(s.vs_yesterday_pct)}% ${s.vs_yesterday_pct >= 0 ? "ahead of" : "behind"} yesterday.` : "") +
    (s.spend ? ` Ad spend is ${money(s.spend)}, a real return of ${s.roas_real.toFixed(2)} times.` : "");
}
