// A thin WebSocket client for the game server, on the same host as the page (/ws). It measures the round
// trip (a ping each second), which the games use to show your own moves ahead of the server, and when a
// connection that was working drops (a tunnel, Wi-Fi to 4G), it dials again on its own for a few seconds:
// the games then rejoin with their resume token and carry on.
import type { ClientMessage, ServerMessage } from "./protocol.ts";

export interface Net {
  send(msg: ClientMessage): void;
  close(): void;
  /** Round trip to the server in ms: the median of the last few pings; 0 until the first answer. */
  rtt(): number;
}

/** Waits between reconnection attempts: about 15 seconds in all, the time the server keeps your seat. */
const RETRY_MS = [300, 800, 1500, 2500, 4000, 6000];

export function connect(handlers: {
  /** Connected: on the first time and again after each reconnection. */
  open(): void;
  message(msg: ServerMessage): void;
  /** The connection dropped and is being dialled again. */
  reconnecting?(): void;
  /** Gone for good: `opened` tells "never reached the server" apart from "dropped and did not come back". */
  close(opened: boolean): void;
}): Net {
  let ws: WebSocket;
  let closedByUs = false;
  let opened = false;
  let attempt = 0;
  let pinger: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const samples: number[] = [];

  const send = (msg: ClientMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const ping = () => send({ t: "ping", n: performance.now() });

  function dial() {
    ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
    );
    ws.addEventListener("open", () => {
      opened = true;
      attempt = 0;
      ping();
      pinger = setInterval(ping, 1000);
      handlers.open();
    });
    ws.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse(e.data as string) as ServerMessage;
        if (msg.t === "pong") {
          samples.push(performance.now() - msg.n);
          if (samples.length > 7) samples.shift();
          return;
        }
        handlers.message(msg);
      } catch (error) {
        console.error(error);
      }
    });
    ws.addEventListener("close", () => {
      clearInterval(pinger);
      if (closedByUs) return;
      if (opened && attempt < RETRY_MS.length) {
        handlers.reconnecting?.();
        retry = setTimeout(dial, RETRY_MS[attempt++]);
        return;
      }
      handlers.close(opened);
    });
  }
  dial();

  return {
    send,
    close() {
      closedByUs = true;
      clearInterval(pinger);
      clearTimeout(retry);
      ws.close();
    },
    rtt() {
      if (!samples.length) return 0;
      const sorted = [...samples].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    },
  };
}

/** The round trip as a short label and a colour: grey when fine, yellow when slow, red when bad. */
export function pingLabel(rtt: number): { text: string; color: string } {
  return {
    text: rtt ? `${Math.round(rtt)} ms` : "",
    color: rtt > 250 ? "#e5534b" : rtt > 150 ? "#e8c547" : "#8b8f96",
  };
}
