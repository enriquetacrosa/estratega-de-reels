// Estratega de Reels — servidor para Render.
// Sirve la página (index.html) y hace de puente con Gemini,
// para que la clave de la IA quede guardada en el servidor y no en la página.
// No necesita instalar nada: solo Node 18 o más nuevo.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const BASE = process.env.GEMINI_BASE || "https://generativelanguage.googleapis.com/v1beta";
const MAX_BODY = 18 * 1024 * 1024; // texto + capturas
const PAGE = fs.readFileSync(path.join(__dirname, "index.html"));

// Límite simple para que nadie gaste toda la cuota gratis: 20 pedidos por hora por persona.
const hits = new Map();
function tooMany(ip){
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  list.push(now); hits.set(ip, list);
  return list.length > 20;
}

function sendJSON(res, status, obj){
  res.writeHead(status, {"Content-Type": "application/json; charset=utf-8"});
  res.end(JSON.stringify(obj));
}

function readBody(req){
  return new Promise((ok, bad) => {
    let size = 0; const parts = [];
    req.on("data", c => { size += c.length; if (size > MAX_BODY){ bad(new Error("too_large")); req.destroy(); } else parts.push(c); });
    req.on("end", () => ok(Buffer.concat(parts).toString("utf8")));
    req.on("error", bad);
  });
}

function errorCode(status, msg){
  msg = String(msg || "").toLowerCase();
  if (status === 429) return "rate_limited";
  if (msg.includes("api key") || msg.includes("api_key")) return "bad_key";
  if (status === 404) return "model_not_found";
  if (status === 413 || msg.includes("token")) return "prompt_too_large";
  if (status === 400 && msg.includes("image")) return "image_rejected";
  return "upstream_error";
}

async function generate(req, res){
  if (!KEY) return sendJSON(res, 503, {error: "no_key"});
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (tooMany(ip)) return sendJSON(res, 429, {error: "rate_limited"});

  let body;
  try{ body = JSON.parse(await readBody(req)); }
  catch(e){ return sendJSON(res, e.message === "too_large" ? 413 : 400, {error: e.message === "too_large" ? "prompt_too_large" : "upstream_error"}); }

  const turns = Array.isArray(body.turns) ? body.turns : [];
  if (!turns.length) return sendJSON(res, 400, {error: "empty_completion"});
  const contents = turns.map(t => ({role: t.role === "assistant" ? "model" : "user", parts: [{text: String(t.content || "")}]}));
  // Las capturas de estadísticas van junto al último mensaje de la tienda.
  const images = Array.isArray(body.images) ? body.images.slice(0, 5) : [];
  for (const im of images){
    if (im && im.data && /^image\/(png|jpeg|webp)$/.test(im.mimeType)) contents[contents.length - 1].parts.push({inline_data: {mime_type: im.mimeType, data: im.data}});
  }

  const ctl = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ctl.abort(); });

  let up;
  try{
    up = await fetch(`${BASE}/models/${encodeURIComponent(MODEL)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: {"Content-Type": "application/json", "x-goog-api-key": KEY},
      body: JSON.stringify({contents, generationConfig: {temperature: 0.9, maxOutputTokens: 32768}}),
      signal: ctl.signal
    });
  }catch(e){ return sendJSON(res, 502, {error: "session_expired"}); }

  if (!up.ok){
    let msg = ""; try{ msg = (await up.json()).error.message; }catch(e){}
    console.error("Gemini", up.status, msg);
    return sendJSON(res, up.status === 429 ? 429 : 502, {error: errorCode(up.status, msg)});
  }

  // Le pasamos el texto a la página a medida que se escribe: una línea JSON por pedazo.
  res.writeHead(200, {"Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no"});
  const send = (o) => res.write(JSON.stringify(o) + "\n");
  let finish = "", blocked = false, got = false;
  try{
    const reader = up.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;){
      const {value, done} = await reader.read();
      if (done) break;
      buf += dec.decode(value, {stream: true});
      let i;
      while ((i = buf.indexOf("\n")) >= 0){
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        let ev; try{ ev = JSON.parse(line.slice(5)); }catch(e){ continue; }
        if (ev.promptFeedback && ev.promptFeedback.blockReason) blocked = true;
        const c = ev.candidates && ev.candidates[0];
        if (!c) continue;
        const text = (c.content && c.content.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join("");
        if (text){ got = true; send({t: text}); }
        if (c.finishReason) finish = c.finishReason;
      }
    }
    if (blocked || (!got && /SAFETY|PROHIBITED|BLOCKLIST/.test(finish))) send({error: "refused"});
    else if (!got) send({error: "empty_completion"});
    else send({done: true, truncated: finish === "MAX_TOKENS"});
  }catch(e){
    if (!ctl.signal.aborted) send({error: "upstream_error"});
  }
  res.end();
}

http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (req.method === "POST" && url === "/api/generate") return generate(req, res).catch(e => { console.error(e); if (!res.headersSent) sendJSON(res, 500, {error: "upstream_error"}); else res.end(); });
  if (req.method === "GET" && url === "/api/health") return sendJSON(res, 200, {ok: true, hasKey: !!KEY, model: MODEL});
  if (req.method === "GET" && (url === "/" || url === "/index.html")){
    res.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});
    return res.end(PAGE);
  }
  res.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"}); res.end("No encontrado");
}).listen(PORT, () => console.log(`Estratega de Reels en el puerto ${PORT} (modelo ${MODEL}, clave ${KEY ? "cargada" : "FALTA"})`));
