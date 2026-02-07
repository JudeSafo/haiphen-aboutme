export class TelemetryStreamDO {
  private sockets: Set<WebSocket>;

  constructor(_state: DurableObjectState) {
    this.sockets = new Set();
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.headers.get("upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sockets.add(server);

      const cleanup = () => this.sockets.delete(server);
      server.addEventListener("close", cleanup);
      server.addEventListener("error", cleanup);

      server.send(JSON.stringify({ type: "hello", ts: Date.now() }));
      return new Response(null, { status: 101, webSocket: client });
    }

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
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}
