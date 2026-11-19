// Local / self-hosted server: serves dist/ and runs rooms in memory.
//   npm start            -> http://localhost:8787
// Rooms live at ws://host/ws?room=CODE. POST /api/rooms makes a new code.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { WebSocketServer } from "ws";
import { Room, newRoomCode, normalizeCode } from "./room.js";

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = join(import.meta.dirname, "../../dist");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

const rooms = new Map<string, Room>();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (req.method === "POST" && url.pathname === "/api/rooms") {
    let code = newRoomCode();
    while (rooms.has(code)) code = newRoomCode();
    rooms.set(code, new Room(code));
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ code }));
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path === "/" || !extname(path)) path = "/index.html";
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws, req) => {
  const code = normalizeCode(new URL(req.url ?? "", "http://x").searchParams.get("room") ?? "");
  if (!code) return ws.close(1008, "bad room code");
  let room = rooms.get(code);
  if (!room) {
    room = new Room(code);
    rooms.set(code, room);
  }
  const conn = room.connect((m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)));
  ws.on("message", (d) => conn.message(d.toString()));
  ws.on("close", () => {
    conn.close();
    if (room.empty) setTimeout(() => room.empty && rooms.get(code) === room && rooms.delete(code), 60_000);
  });
});

server.listen(PORT, () => console.log(`Lanternfall on http://localhost:${PORT}`));
