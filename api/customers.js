import { onRequestGet } from "../functions/api/customers.js";
import { forward } from "./_handler.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Method Not Allowed" }));
  }
  return forward(req, res, onRequestGet);
}
