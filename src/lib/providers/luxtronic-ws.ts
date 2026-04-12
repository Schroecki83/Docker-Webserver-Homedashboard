/**
 * Luxtronic WebSocket adapter.
 * Protocol: ws://<host>:<port>  subprotocol "Lux_WS"
 * Handshake: send "LOGIN;<password>"
 * Polling:   send "REFRESH" to get current XML payload
 * Safety:    read-only — SET and SAVE commands are blocked.
 */
import { WebSocket } from "ws";
import type { HeatpumpSnapshot } from "@/lib/types";
import { parseLuxtronicXml } from "./luxtronic-parser";
import { log } from "@/lib/logger";

const CONNECT_TIMEOUT_MS = 8000;
const RESPONSE_TIMEOUT_MS = 10000;

export function extractTemperaturesNodeId(xml: string): string | null {
  const match = xml.match(/<item\s+id='([^']+)'\s*>\s*<name>Temperaturen<\/name>/i);
  return match?.[1] ?? null;
}

export async function fetchLuxtronicSnapshot(
  host: string,
  port: number,
  password: string,
): Promise<HeatpumpSnapshot> {
  return new Promise((resolve, reject) => {
    const url = `ws://${host}:${port}`;
    const ws = new WebSocket(url, "Lux_WS");

    const connectTimer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Luxtronic connect timeout"));
    }, CONNECT_TIMEOUT_MS);

    let responseTimer: ReturnType<typeof setTimeout> | null = null;
    let loginDone = false;

    const setResponseTimeout = (message: string) => {
      if (responseTimer) {
        clearTimeout(responseTimer);
      }
      responseTimer = setTimeout(() => {
        ws.terminate();
        reject(new Error(message));
      }, RESPONSE_TIMEOUT_MS);
    };

    ws.on("open", () => {
      clearTimeout(connectTimer);
      ws.send(`LOGIN;${password}`);
      setResponseTimeout("Luxtronic response timeout after LOGIN");
    });

    ws.on("message", (raw: Buffer | string) => {
      const text = typeof raw === "string" ? raw : raw.toString("utf8");

      if (!loginDone) {
        loginDone = true;

        if (text.includes("<Content")) {
          if (responseTimer) clearTimeout(responseTimer);
          ws.close();
          try {
            resolve(parseLuxtronicXml(text));
          } catch (err) {
            reject(err);
          }
          return;
        }

        const temperaturesNodeId = extractTemperaturesNodeId(text);
        if (!temperaturesNodeId) {
          setResponseTimeout("Luxtronic response timeout after REFRESH");
          ws.send("REFRESH");
          return;
        }

        setResponseTimeout("Luxtronic response timeout after GET Temperaturen");
        ws.send(`GET;${temperaturesNodeId}`);
        return;
      }

      if (responseTimer) clearTimeout(responseTimer);
      ws.close();

      try {
        const snapshot = parseLuxtronicXml(text);
        resolve(snapshot);
      } catch (err) {
        reject(err);
      }
    });

    ws.on("error", (err) => {
      clearTimeout(connectTimer);
      if (responseTimer) clearTimeout(responseTimer);
      log("error", "luxtronic.ws_error", { message: err.message });
      reject(err);
    });
  });
}
