import { getEnv } from "./_env.js";

async function readBody(req) {
  if (req.body) {
    if (typeof req.body === "string") return req.body;
    if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
    return JSON.stringify(req.body);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function forward(req, res, handlerFn) {
  try {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const fullUrl = `${proto}://${host}${req.url}`;

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val !== undefined) {
        if (Array.isArray(val)) val.forEach(v => headers.append(key, v));
        else headers.set(key, val);
      }
    }

    const init = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const bodyStr = await readBody(req);
      if (bodyStr) init.body = bodyStr;
    }

    const request = new Request(fullUrl, init);
    const env = getEnv();

    const response = await handlerFn({ request, env });

    res.statusCode = response.status;
    for (const [k, v] of response.headers.entries()) {
      res.setHeader(k, v);
    }

    const bodyText = await response.text();
    res.end(bodyText);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err.message || String(err) }));
  }
}
