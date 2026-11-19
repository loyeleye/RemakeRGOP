// Lanternfall on Cloudflare: static assets plus one Durable Object per room code.
// The object keeps its WebSockets open (no hibernation) so its 600 ms clock keeps running
// while anyone is connected.

import { Room, newRoomCode, normalizeCode } from "../src/server/room.js";

export interface Env {
  ASSETS: Fetcher;
  ROOMS: DurableObjectNamespace;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/rooms" && req.method === "POST") {
      return Response.json({ code: newRoomCode() });
    }
    if (url.pathname === "/ws") {
      const code = normalizeCode(url.searchParams.get("room") ?? "");
      if (!code) return new Response("bad room code", { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};

export class RoomObject implements DurableObject {
  private room: Room | null = null;

  constructor(private state: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const code = normalizeCode(new URL(req.url).searchParams.get("room") ?? "") ?? "XXXX";
    this.room ??= new Room(code);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    const conn = this.room.connect((m) => {
      try {
        server.send(JSON.stringify(m));
      } catch {
        /* socket already closed */
      }
    });
    server.addEventListener("message", (e) => conn.message(typeof e.data === "string" ? e.data : ""));
    const close = () => conn.close();
    server.addEventListener("close", close);
    server.addEventListener("error", close);
    return new Response(null, { status: 101, webSocket: client });
  }
}
