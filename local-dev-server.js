const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const transcribeHandler = require("./api/transcribe.js");
const tryOnHandler = require("./api/try-on.js");
const chatHandler = require("./api/chat.js");
const ttsHandler = require("./api/tts.js");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8000);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp"
};

loadLocalEnv();

function loadLocalEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 12 * 1024 * 1024) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request body must be JSON."));
      }
    });
    request.on("error", reject);
  });
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  let pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  if (pathname.startsWith("/product/")) pathname = "/product.html";
  if (pathname === "/marketplace") pathname = "/marketplace.html";
  if (pathname === "/interventions") pathname = "/interventions.html";
  const filePath = path.resolve(ROOT, `.${pathname}`);

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(contents);
  });
}

http
  .createServer(async (request, response) => {
    if (request.url?.startsWith("/api/chat")) {
      try {
        request.body = await readRequestBody(request);
        await chatHandler(request, response);
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Bad request" }));
      }
      return;
    }

    if (request.url?.startsWith("/api/tts")) {
      try {
        request.body = await readRequestBody(request);
        await ttsHandler(request, response);
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Bad request" }));
      }
      return;
    }

    if (request.url?.startsWith("/api/try-on")) {
      try {
        request.body = await readRequestBody(request);
        await tryOnHandler(request, response);
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Bad request" }));
      }
      return;
    }

    if (request.url?.startsWith("/api/transcribe")) {
      try {
        request.body = await readRequestBody(request);
        await transcribeHandler(request, response);
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Bad request" }));
      }
      return;
    }

    serveStatic(request, response);
  })
  .listen(PORT, () => {
    console.log(`Cursor Commerce dev server running at http://localhost:${PORT}`);
    console.log(`Chat/TTS API ${process.env.OPENAI_API_KEY ? "has" : "is missing"} OPENAI_API_KEY`);
    console.log(`Try-on API ${process.env.GEMINI_API_KEY ? "has" : "is missing"} GEMINI_API_KEY`);
  });
