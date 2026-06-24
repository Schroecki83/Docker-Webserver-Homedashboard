import { buildSnapshot } from "@/lib/aggregate";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

// 1 hour: Open-Meteo free tier allows 10k requests/day (~7/min).
// Weather forecast doesn't change frequently; 1 hour balances freshness with minimal API calls.
const INTERVAL_MS = 3_600_000;

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = async () => {
        if (closed) return;
        try {
          const snapshot = await buildSnapshot();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log("error", "stream.snapshot_failed", { message });
          if (!closed) {
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`));
          }
        }
      };

      await send();
      const interval = setInterval(send, INTERVAL_MS);

      return () => {
        closed = true;
        clearInterval(interval);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
