import { json, authorised } from "../_lib.js";
import { snapshot } from "../_woo.js";

export async function onRequestGet({ request, env }) {
  if (!authorised(request, env)) return json({ error: "This board link is missing its key." }, 401);
  try {
    const url = new URL(request.url);
    const targetDate = url.searchParams.get("date") || null;
    const raw = await snapshot(env, targetDate);
    const s = { ...raw };
    delete s._hist;
    // The full orders-today list is only for the ops page (?full=1). The TV
    // board polls without it and stays light.
    if (!url.searchParams.get("full")) delete s.orders_today;
    return json(s);
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}
