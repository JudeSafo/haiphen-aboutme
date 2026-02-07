export default {
  async fetch(req: Request): Promise<Response> {
    return new Response(JSON.stringify({ ok: true, service: "haiphen-causal" }), {
      headers: { "content-type": "application/json" },
    });
  },
};
