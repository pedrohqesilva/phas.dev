// A thin WebSocket client for the game server, on the same host as the page (/ws).
import type { ClientMessage, ServerMessage } from "./protocol.ts";

export interface Net {
  send(msg: ClientMessage): void;
  close(): void;
}

export function connect(handlers: {
  open(): void;
  message(msg: ServerMessage): void;
  close(): void;
}): Net {
  const ws = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
  );
  let closedByUs = false;
  ws.addEventListener("open", () => handlers.open());
  ws.addEventListener("message", (e) => {
    try {
      handlers.message(JSON.parse(e.data as string) as ServerMessage);
    } catch (error) {
      console.error(error);
    }
  });
  ws.addEventListener("close", () => !closedByUs && handlers.close());
  return {
    send(msg) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close() {
      closedByUs = true;
      ws.close();
    },
  };
}
