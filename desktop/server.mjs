// Shop Board, desktop edition.
//
// Runs the SAME board the Cloudflare version serves (same five designs, same
// snapshot shape, same /api/state, /api/health and /api/ask), on the owner's
// own PC, with no hosting account needed. Data comes straight from the
// WooCommerce REST API, exactly like functions/_woo.js on Cloudflare.
//
// How it runs:
//   - As plain Node:  node server.mjs            (needs Node.js 18 or newer)
//   - As the packaged exe: double-click ShopBoard.exe (Node.js is inside it)
//
// Settings live in board.env (or .env) NEXT TO the exe / this file, never in
// chat. If BOARD_KEY is missing, one is generated and saved to board.env, and
// the printed link carries it, so the board link stays private.
// The board listens on all network interfaces, so the same link also opens on
// a phone or TV on the same WiFi: http://<this-PC-ip>:<PORT>/?k=<BOARD_KEY>

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { onRequestGet as stateGet } from "../functions/api/state.js";
import { onRequestGet as healthGet } from "../functions/api/health.js";
import { onRequestPost as askPost } from "../functions/api/ask.js";
import { onRequestGet as customersGet } from "../functions/api/customers.js";

const major = Number(process.versions.node.split(".")[0] || 0);
if (major < 18) {
  console.error("Shop Board needs Node.js 18 or newer. Install Node.js 20 LTS from https://nodejs.org, then run this again.");
  process.exit(1);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IS_PKG = Boolean(process.pkg);
const BASE_DIR = IS_PKG ? path.dirname(process.execPath) : HERE;

// --------------------------------------------------------------------- env --

function parseEnvText(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function loadEnv() {
  let fileUsed = null;
  let fileEnv = {};
  for (const name of ["board.env", ".env"]) {
    const p = path.join(BASE_DIR, name);
    try {
      if (fs.existsSync(p)) { fileUsed = p; fileEnv = parseEnvText(fs.readFileSync(p, "utf8")); break; }
    } catch { /* keep looking */ }
  }
  return { env: { ...fileEnv, ...process.env }, fileUsed };
}

let { env, fileUsed } = loadEnv();

if (!env.BOARD_KEY) {
  env.BOARD_KEY = crypto.randomBytes(12).toString("hex");
  const target = fileUsed || path.join(BASE_DIR, "board.env");
  try {
    const prev = fileUsed ? fs.readFileSync(target, "utf8") : "";
    const head = prev ? "" : "# Shop Board desktop settings. Fill in the WooCommerce read-only key, then restart the board.\n# Never paste these values in chat. Type them into this file on your own PC.\n";
    fs.appendFileSync(target, `${head}BOARD_KEY=${env.BOARD_KEY}\n`);
    fileUsed = target;
  } catch { /* read-only folder: the key lives only for this run */ }
}

const WC_CONNECTED = Boolean(env.WC_URL && env.WC_KEY && env.WC_SECRET);
const PORT = Number(env.PORT || 8080);
const DESIGNS = ["classic", "meta", "apple", "studio", "swiss"];

// --------------------------------------------------------------- statics ---

function findPublicDir() {
  const candidates = [
    path.join(BASE_DIR, "public"),
    path.join(HERE, "..", "public"),
    path.join(process.cwd(), "public"),
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(path.join(c, "classic.html"))) return c; } catch { /* next */ }
  }
  return candidates[1];
}
const PUBLIC_DIR = findPublicDir();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".apk": "application/vnd.android.package-archive",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".txt": "text/plain; charset=utf-8",
};

function pickDesign(url, cookieHeader) {
  const q = url.searchParams.get("design");
  const m = (cookieHeader || "").match(/(?:^|;\s*)design=([a-z]+)/);
  return [q, env.BOARD_DESIGN, m && m[1], "classic"].find((d) => DESIGNS.includes(d));
}

// -------------------------------------------------------------- handlers ---

// The Cloudflare handlers are plain Web-standard code (Request in, Response
// out), so the desktop server calls them directly with a real Request object.
// No logic is duplicated here.


async function runHandler(handler, req, bodyBuf) {
  const full = `http://127.0.0.1:${PORT}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    const key = k.toLowerCase();
    if (["host", "connection", "content-length"].includes(key)) continue;
    if (v !== undefined) headers.set(key, String(v));
  }
  const init = { method: req.method, headers };
  if (bodyBuf && bodyBuf.length) init.body = bodyBuf;
  const request = new Request(full, init);
  const res = await handler({ request, env });
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), text: await res.text() };
}

function send(res, status, headers, body) {
  res.writeHead(status, { "Cache-Control": "no-store", ...headers });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    const pathname = url.pathname;

    if (pathname === "/favicon.ico") { send(res, 204, {}, ""); return; }

    if (pathname === "/api/state" && req.method === "GET") {
      if (!WC_CONNECTED) {
        sendJson(res, 502, { error: "WooCommerce is not connected yet. Open board.env next to ShopBoard.exe and add WC_URL, WC_KEY and WC_SECRET from the read-only key in WordPress (WooCommerce, Settings, Advanced, REST API), then restart the board." });
        return;
      }
      const out = await runHandler(stateGet, req, null);
      send(res, out.status, { "Content-Type": "application/json; charset=utf-8" }, out.text);
      return;
    }

    if (pathname === "/api/health" && req.method === "GET") {
      const out = await runHandler(healthGet, req, null);
      send(res, out.status, { "Content-Type": "application/json; charset=utf-8" }, out.text);
      return;
    }

    if (pathname === "/api/ask" && req.method === "POST") {
      const body = await readBody(req);
      const out = await runHandler(askPost, req, body);
      send(res, out.status, { "Content-Type": "application/json; charset=utf-8" }, out.text);
      return;
    }

    if (pathname === "/api/customers" && req.method === "GET") {
      if (!WC_CONNECTED) {
        sendJson(res, 502, { error: "WooCommerce is not connected yet." });
        return;
      }
      const out = await runHandler(customersGet, req, null);
      send(res, out.status, { "Content-Type": "application/json; charset=utf-8" }, out.text);
      return;
    }

    if (pathname === "/api/state" || pathname === "/api/health" || pathname === "/api/ask" || pathname === "/api/customers") {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    // Static files and the design pages.
    let file = null;
    if (pathname === "/") {
      const design = pickDesign(url, req.headers.cookie || "");
      file = path.join(PUBLIC_DIR, `${design}.html`);
      const body = await fs.promises.readFile(file);
      const headers = { "Content-Type": MIME[".html"] };
      if (url.searchParams.get("design") && DESIGNS.includes(url.searchParams.get("design"))) {
        headers["Set-Cookie"] = `design=${url.searchParams.get("design")}; Path=/; Max-Age=31536000`;
      }
      send(res, 200, headers, body);
      return;
    }
    const clean = decodeURIComponent(pathname).replace(/^\/+/, "");
    if (!clean.includes("..")) {
      const candidate = path.join(PUBLIC_DIR, clean);
      try {
        const stat = await fs.promises.stat(candidate);
        if (stat.isFile()) {
          file = candidate;
          send(res, 200, { "Content-Type": MIME[path.extname(candidate).toLowerCase()] || "application/octet-stream" },
            await fs.promises.readFile(candidate));
          return;
        }
      } catch { /* fall through to 404 */ }
    }
    send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found.");
  } catch (e) {
    sendJson(res, 500, { error: String((e && e.message) || e) });
  }
});

// ------------------------------------------------------------------ start --

// When double-clicked, the console window closes with the process, so a
// startup error would only flash past. On a fatal error, print it and wait
// for a keypress, so the message can actually be read.
function pauseAndExit(code) {
  try {
    if (process.stdin.isTTY) {
      console.log("");
      console.log("Press Enter to close this window.");
      process.stdin.resume();
      process.stdin.once("data", () => process.exit(code));
      return;
    }
  } catch { /* fall through to an immediate exit */ }
  process.exit(code);
}

server.on("error", (err) => {
  console.log("");
  console.log("Shop Board could not start: " + (err && err.message ? err.message : err));
  if (err && err.code === "EADDRINUSE") {
    console.log(`Port ${PORT} is already in use. The board may already be running, try opening http://localhost:${PORT}/?k=${env.BOARD_KEY} in your browser.`);
    console.log("Otherwise add a line PORT=8081 to board.env and run the board again.");
  }
  pauseAndExit(1);
});
process.on("uncaughtException", (err) => {
  console.log("");
  console.log("Shop Board stopped with an error: " + (err && err.stack ? err.stack : err));
  pauseAndExit(1);
});
process.on("unhandledRejection", (reason) => {
  console.log("");
  console.log("Shop Board stopped with an error: " + reason);
  pauseAndExit(1);
});

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === "IPv4" && !n.internal) return n.address;
    }
  }
  return null;
}

function openBrowser(target) {
  if (env.BOARD_NO_OPEN === "1") return;
  try {
    const args = process.platform === "win32" ? ["cmd", ["/c", "start", "", target]]
      : process.platform === "darwin" ? ["open", [target]]
      : ["xdg-open", [target]];
    const child = spawn(args[0], args[1], { detached: true, stdio: "ignore" });
    child.unref();
  } catch { /* opening the browser is a nicety, never fatal */ }
}

server.listen(PORT, "0.0.0.0", () => {
  const key = env.BOARD_KEY;
  const local = `http://localhost:${PORT}/?k=${key}`;
  const lan = lanIp();
  console.log("");
  console.log("  Shop Board is running.");
  console.log(`  Open on this PC: ${local}`);
  if (lan) console.log(`  Open on phone or TV (same WiFi): http://${lan}:${PORT}/?k=${key}`);
  console.log(`  Designs: ${DESIGNS.map((d) => `?design=${d}`).join("  ")}`);
  console.log(`  Health check: http://localhost:${PORT}/api/health?k=${key}`);
  if (!WC_CONNECTED) {
    console.log("");
    console.log("  WooCommerce is NOT connected yet. Add the read-only key to");
    console.log(`  ${path.join(BASE_DIR, "board.env")} (WC_URL, WC_KEY, WC_SECRET), then restart.`);
    console.log("  WordPress: WooCommerce, Settings, Advanced, REST API, Add key, Read.");
  }
  console.log("");
  openBrowser(local);
});

process.on("SIGINT", () => { console.log(""); console.log("Shop Board stopped."); process.exit(0); });
