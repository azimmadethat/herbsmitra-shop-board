import { json, authorised } from "../_lib.js";
import { customersSplit } from "../_woo.js";

export async function onRequestGet({ request, env }) {
  if (!authorised(request, env)) return json({ error: "This board link is missing its key." }, 401);
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") || null;
    const startDate = url.searchParams.get("start_date") || url.searchParams.get("from") || date;
    const endDate = url.searchParams.get("end_date") || url.searchParams.get("to") || null;
    const res = await customersSplit(env, startDate, endDate);
    return json(res);
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}
