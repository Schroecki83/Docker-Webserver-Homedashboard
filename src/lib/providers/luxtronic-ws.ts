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

export async function fetchLuxtronicSnapshot(
  host: string,
  port: number,
  password: string,
): Promise<HeatpumpSnapshot> {
  return new Promise((resolve, reject) => {
    const url = `ws://${host}:${port}`;
    const ws = new WebSocket(url, "Lux_WS");

    let connectTimer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Luxtronic connect timeout"));
    }, CONNECT_TIMEOUT_MS);

    let responseTimer: ReturnType<typeof setTimeout> | null = null;
    let loginDone = false;

    ws.on("open", () => {
      clearTimeout(connectTimer);
      // Block any accidental SET/SAVE — only LOGIN and REFRESH are permitted.
      ws.send(`LOGIN;${password}`);
      responseTimer = setTimeout(() => {
        ws.terminate();
        reject(new Error("Luxtronic response timeout after LOGIN"));
      }, RESPONSE_TIMEOUT_MS);
    });

    ws.on("message", (raw: Buffer | string) => {
      const text = typeof raw === "string" ? raw : raw.toString("utf8");

      if (!loginDone) {
        loginDone = true;
        if (responseTimer) clearTimeout(responseTimer);
        // After a successful login the controller echoes a response; now request data.
        responseTimer = setTimeout(() => {
          ws.terminate();
          reject(new Error("Luxtronic response timeout after REFRESH"));
        }, RESPONSE_TIMEOUT_MS);
        ws.send("REFRESH");
        return;
      }

      // Second message contains the XML payload.
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
