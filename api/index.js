import fs from "fs";
import path from "path";
import { getEnv } from "./_env.js";

const DESIGNS = ["classic", "meta", "apple", "studio", "swiss"];

export default async function handler(req, res) {
  const env = getEnv();
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const url = new URL(req.url, `${proto}://${host}`);

  const cookie = (req.headers.cookie || "").match(/(?:^|;\s*)design=([a-z]+)/);
  const designParam = url.searchParams.get("design");
  const pick = [designParam, env.BOARD_DESIGN, cookie && cookie[1], "classic"]
    .find(d => DESIGNS.includes(d));

  if (!pick) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Not Found");
  }

  const filePath = path.join(process.cwd(), "public", `${pick}.html`);
  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Not Found");
  }

  const html = fs.readFileSync(filePath, "utf8");
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (designParam && DESIGNS.includes(designParam)) {
    res.setHeader("Set-Cookie", `design=${designParam}; Path=/; Max-Age=31536000; SameSite=Lax`);
  }

  return res.end(html);
}
