/**
 * SignalFeedDO — Durable Object WebSocket hub for real-time signal feed.
 *
 * Clients connect via WebSocket upgrade (JWT auth via query param).
 * The snapshot POST handler broadcasts new data to all connected clients.
 */
export class SignalFeedDO {
  private state: DurableObjectState;
  private sockets: Set<WebSocket>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sockets = new Set();
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (req.headers.get("upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();
      this.sockets.add(server);

      server.addEventListener("close", () => this.sockets.delete(server));
      server.addEventListener("error", () => this.sockets.delete(server));

      server.send(JSON.stringify({ type: "hello", ts: Date.now() }));

      return new Response(null, { status: 101, webSocket: client });
    }

    // POST /broadcast — internal, sends payload to all connected sockets
    if (url.pathname.endsWith("/broadcast") && req.method === "POST") {
      const payload = await req.text();
      let sent = 0;
      for (const ws of this.sockets) {
        try {
          ws.send(payload);
          sent++;
        } catch {
          this.sockets.delete(ws);
        }
      }
      return new Response(JSON.stringify({ ok: true, sent }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  }
}
