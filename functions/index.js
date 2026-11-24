// Serves the chosen design at "/". Order of choice: ?design=, the remote's last pick (cookie),
// BOARD_DESIGN, then classic.
const DESIGNS = ["classic", "meta", "apple", "studio", "swiss"];

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const cookie = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)design=([a-z]+)/);
  const pick = [url.searchParams.get("design"), env.BOARD_DESIGN, cookie && cookie[1], "classic"]
    .find(d => DESIGNS.includes(d));
  const page = await env.ASSETS.fetch(new URL(`/${pick}`, url));
  return new Response(page.body, { status: page.status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
