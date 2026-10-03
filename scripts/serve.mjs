import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const port = 4173;
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
const server = http.createServer(async (req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD"].includes(req.method ?? "") || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? "")) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", `http://127.0.0.1:${port}`).pathname);
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end("Forbidden"); return; }
    const data = await readFile(file);
    res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream");
    res.writeHead(200); res.end(req.method === "HEAD" ? undefined : data);
  } catch { res.writeHead(404); res.end("Not found. Run npm run build first."); }
});
server.listen(port, "127.0.0.1", () => console.log(`PrivatePoll local wallet console: http://127.0.0.1:${port}/\nLocalhost only. No background transactions. Ctrl+C stops the server.`));
server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
