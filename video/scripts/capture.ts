// Captures the real site, in English, for the video: run the production server locally
// (`PORT=8093 node server/index.ts` after `pnpm build` at the root), then `node scripts/capture.ts`.
// Screenshots land in public/shots. Needs Google Chrome installed (macOS path below, or CHROME=…).
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const BASE = process.env.BASE ?? "http://localhost:8093";
const OUT = join(import.meta.dirname, "..", "public", "shots");
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9341;
const profile = join(tmpdir(), "phas-capture");
rmSync(profile, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let target: { webSocketDebuggerUrl: string } | undefined;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(
      (t: { type: string }) => t.type === "page",
    );
  } catch {}
}
const cdp = new WebSocket(target!.webSocketDebuggerUrl);
await new Promise((r) => cdp.on("open", r));
let id = 0;
const waiting = new Map<number, (v: any) => void>();
cdp.on("message", (d: Buffer) => {
  const m = JSON.parse(String(d));
  if (m.id && waiting.has(m.id)) waiting.get(m.id)!(m);
});
const call = (method: string, params: object = {}) =>
  new Promise<any>((r) => {
    const n = ++id;
    waiting.set(n, r);
    cdp.send(JSON.stringify({ id: n, method, params }));
  });
const ev = async (expression: string) =>
  (
    await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
  ).result?.result?.value;
const size = (width: number, height: number, mobile = false) =>
  call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1.5,
    mobile,
  });
const go = async (path: string, wait = 3500) => {
  await call("Page.navigate", { url: BASE + path });
  await sleep(wait);
};
const shot = async (name: string) => {
  const s = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(s.result.data, "base64"));
  console.log("✓", name);
};
const tap = (k: string) =>
  ev(
    `dispatchEvent(new KeyboardEvent('keydown', { key: '${k}' })); dispatchEvent(new KeyboardEvent('keyup', { key: '${k}' })); 1`,
  );
const hold = (k: string, down: boolean) =>
  ev(
    `dispatchEvent(new KeyboardEvent('${down ? "keydown" : "keyup"}', { key: '${k}' })); 1`,
  );
const type = async (c: string, wait = 2500) => {
  await ev(
    `(() => { const i = document.getElementById('cmd'); i.value = ${JSON.stringify(c)}; i.form.requestSubmit(); return 1; })()`,
  );
  await sleep(wait);
};
/** Scrolls the terminal so the last command typed is at the top (its output below it). */
const toLastCommand = () =>
  ev(
    `(() => { const e = [...document.querySelectorAll('.echo')].at(-1); e?.closest('.block')?.scrollIntoView({ block: 'start' }); return 1; })()`,
  );
/** A second player for the online modes: a plain WebSocket client. */
const partner = async () => {
  const ws = new WebSocket(BASE.replace("http", "ws") + "/ws", {
    headers: { Origin: BASE },
  });
  await new Promise((r) => ws.on("open", r));
  const log: any[] = [];
  ws.on("message", (d: Buffer) => log.push(JSON.parse(String(d))));
  return {
    ws,
    log,
    send: (m: object) => ws.send(JSON.stringify(m)),
    last: (t: string) => [...log].reverse().find((m) => m.t === t),
  };
};

await call("Runtime.enable");
await size(1280, 720);
await go("/en", 300);
await ev(
  `localStorage.setItem('lang', 'en'); localStorage.setItem('theme', 'dark'); 1`,
);

// The terminal.
await go("/en", 5000);
await shot("01-home");
await type("experience", 7000);
await toLastCommand();
await sleep(300);
await shot("02-experience");
await type("clear", 500);
await type("projects", 7000);
await toLastCommand();
await sleep(300);
await shot("03-projects");
await type("clear", 500);
await type("neofetch", 2500);
await type("cowsay hire me, I write tests", 2500);
await shot("04-easter-eggs");
await go("/resume", 2500);
await shot("05-resume");

// Themes.
for (const [i, theme] of ["dracula", "gruvbox", "matrix"].entries()) {
  await go("/en", 4000);
  await type(`theme ${theme}`, theme === "matrix" ? 3500 : 1200);
  await type("help", 3500);
  await shot(`06-theme-${i + 1}-${theme}`);
}
await go("/en", 300);
await ev(`localStorage.setItem('theme', 'dark'); 1`);

// Games.
// Snake: wait until the snake is alive and has moved a bit (a fresh spawn has room ahead), then shoot.
await go("/en?q=games%20snake%20online%20phas", 4000);
await tap("x");
await sleep(2600);
await shot("07-snake-online");

const coop = await partner();
coop.send({ t: "coop.create" });
while (!coop.last("coop.room")) await sleep(20);
coop.send({ t: "coop.ready" });
let x = 60;
const coopMove = setInterval(() => {
  x = 60 + 40 * Math.sin(Date.now() / 600);
  coop.send({
    t: "coop.input",
    input: { x, fire: Math.floor(Date.now() / 700) % 3 === 0, rtt: 20 },
  });
}, 33);
await go(`/en#coop-${coop.last("coop.room").room}`, 4000);
await tap("x");
// A few aimed volleys while moving, not a held trigger (misses cost lives and flash a warning).
await hold("ArrowRight", true);
for (let i = 0; i < 4; i++) {
  await hold(" ", true);
  await sleep(120);
  await hold(" ", false);
  await sleep(450);
}
await hold("ArrowRight", false);
await shot("08-invaders-coop");
clearInterval(coopMove);
coop.ws.close();

await go("/en?q=pong%20cpu", 3500);
await tap("x");
await hold("ArrowDown", true);
await sleep(600);
await hold("ArrowDown", false);
await sleep(2200);
await shot("09-pong");

const vs = await partner();
vs.send({ t: "tetris.create" });
while (!vs.last("tetris.room")) await sleep(20);
vs.send({ t: "tetris.ready" });
await go(`/en#tetris-${vs.last("tetris.room").room}`, 4000);
await tap("x");
await sleep(800);
vs.send({
  t: "tetris.board",
  cells:
    "0".repeat(140) +
    "0333300550" +
    "1111110550" +
    "2222220222" +
    "6666666660" +
    "4444404444" +
    "7777707777",
  score: 1280,
  lines: 9,
});
for (const k of [
  "ArrowLeft",
  "ArrowLeft",
  "ArrowLeft",
  " ",
  "ArrowUp",
  " ",
  "ArrowRight",
  "ArrowRight",
  "ArrowRight",
  " ",
  "ArrowLeft",
  " ",
  "c",
  "ArrowRight",
  " ",
]) {
  await tap(k);
  await sleep(220);
}
vs.send({ t: "tetris.attack", lines: 2 });
await sleep(1500);
await shot("10-tetris-versus");
vs.ws.close();

// On a phone.
await size(390, 844, true);
await go("/en", 5000);
await shot("11-mobile");

chrome.kill();
process.exit(0);
