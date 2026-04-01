import { DurableObject } from "cloudflare:workers";

// Thin Durable Object shell — stores call analysis results.
// Kept minimal (~30 lines) for the 4th Cloudflare product checkmark.
export class CallSession extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/store" && request.method === "POST") {
      const data = await request.json();
      await this.ctx.storage.put("result", data);
      await this.ctx.storage.put("timestamp", new Date().toISOString());
      return new Response("stored", { status: 200 });
    }

    if (url.pathname === "/result" && request.method === "GET") {
      const result = await this.ctx.storage.get("result");
      const timestamp = await this.ctx.storage.get("timestamp");
      if (!result) {
        return new Response("not found", { status: 404 });
      }
      return Response.json({ result, timestamp });
    }

    return new Response("not found", { status: 404 });
  }
}
