// A thin WebSocket client for the game server, on the same host as the page (/ws). It also measures the
// round trip (a ping each second), which the games use to show your own moves ahead of the server.
import type { ClientMessage, ServerMessage } from "./protocol.ts";

export interface Net {
  send(msg: ClientMessage): void;
  close(): void;
  /** Round trip to the server in ms: the median of the last few pings; 0 until the first answer. */
  rtt(): number;
}

export function connect(handlers: {
  open(): void;
  message(msg: ServerMessage): void;
  close(opened: boolean): void;
}): Net {
  const ws = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
  );
  let closedByUs = false;
  let opened = false;
  const samples: number[] = [];
  let pinger: ReturnType<typeof setInterval> | undefined;
  const send = (msg: ClientMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const ping = () => send({ t: "ping", n: performance.now() });

  ws.addEventListener("open", () => {
    opened = true;
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
  // `opened` tells "never reached the server" apart from "the connection dropped".
  ws.addEventListener("close", () => {
    clearInterval(pinger);
    if (!closedByUs) handlers.close(opened);
  });
  return {
    send,
    close() {
      closedByUs = true;
      clearInterval(pinger);
      ws.close();
    },
    rtt() {
      if (!samples.length) return 0;
      const sorted = [...samples].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    },
  };
}
