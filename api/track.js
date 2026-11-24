import { onRequestPost, onRequestOptions } from "../functions/api/track.js";
import { forward } from "./_handler.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return forward(req, res, onRequestOptions);
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Method Not Allowed" }));
  }
  return forward(req, res, onRequestPost);
}
