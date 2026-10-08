// The public Snake arena: one grid for everyone online, simulated here and sent to every player each tick.
// Snakes move together; a head on a wall or on any body (its own included) dies, and two heads meeting
// both die. A dead snake turns into food and respawns after a short wait. While fewer than three people
// are playing, a couple of bots join so the arena never feels empty; they leave as people arrive.
import {
  ARENA_COLS,
  ARENA_ROWS,
  ARENA_TICK_MS,
  DIR_STEP,
  type ArenaState,
  type Dir,
  type ServerMessage,
} from "../src/games/protocol.ts";

type P = { x: number; y: number };

interface Player {
  id: number;
  name: string;
  bot: boolean;
  body: P[];
  dir: Dir;
  turns: Dir[];
  alive: boolean;
  respawnAt: number;
  score: number;
  /** Cells still to grow by (a super grain grows the snake by three). */
  grow: number;
  send?: (msg: ServerMessage) => void;
}

const START_LENGTH = 4;
const RESPAWN_MS = 1500;
const MAX_HUMANS = 24;
const SUPER_CHANCE = 0.1;
const SUPER_MS = 6000;
const SUPER_POINTS = 5;
const BOT_NAMES = ["bit", "byte"];

const key = (p: P) => p.y * ARENA_COLS + p.x;
const inBounds = (p: P) =>
  p.x >= 0 && p.y >= 0 && p.x < ARENA_COLS && p.y < ARENA_ROWS;
const opposite = (a: Dir, b: Dir) => (a + 2) % 4 === b;
const stepFrom = (p: P, d: Dir): P => ({
  x: p.x + DIR_STEP[d][0],
  y: p.y + DIR_STEP[d][1],
});

export function createArena() {
  const players = new Map<number, Player>();
  let nextId = 1;
  let food: P[] = [];
  let superFood: { p: P; until: number } | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const humans = () => [...players.values()].filter((p) => !p.bot);

  function occupied(): Set<number> {
    const cells = new Set<number>();
    for (const p of players.values()) for (const c of p.body) cells.add(key(c));
    return cells;
  }

  function freeCell(): P {
    const taken = occupied();
    for (const f of food) taken.add(key(f));
    for (let tries = 0; tries < 400; tries++) {
      const p = {
        x: Math.floor(Math.random() * ARENA_COLS),
        y: Math.floor(Math.random() * ARENA_ROWS),
      };
      if (!taken.has(key(p))) return p;
    }
    return { x: 0, y: 0 };
  }

  /** A start with room ahead and no other head close by. */
  function spawn(player: Player, now: number) {
    const taken = occupied();
    const heads = [...players.values()]
      .filter((p) => p.alive && p.body.length)
      .map((p) => p.body[0]);
    for (let tries = 0; tries < 300; tries++) {
      const dir = Math.floor(Math.random() * 4) as Dir;
      const head = {
        x: 6 + Math.floor(Math.random() * (ARENA_COLS - 12)),
        y: 6 + Math.floor(Math.random() * (ARENA_ROWS - 12)),
      };
      const back = ((dir + 2) % 4) as Dir;
      const body = [head];
      for (let i = 1; i < START_LENGTH; i++)
        body.push(stepFrom(body[i - 1], back));
      // Clear cells under the body and a few ahead, and nobody's head within 6 cells.
      let ahead = head;
      const clear = [...body];
      for (let i = 0; i < 5; i++) clear.push((ahead = stepFrom(ahead, dir)));
      if (!clear.every((c) => inBounds(c) && !taken.has(key(c)))) continue;
      if (
        heads.some((h) => Math.abs(h.x - head.x) + Math.abs(h.y - head.y) < 6)
      )
        continue;
      Object.assign(player, {
        body,
        dir,
        turns: [],
        alive: true,
        score: 0,
        grow: 0,
        respawnAt: now,
      });
      return;
    }
    player.respawnAt = now + 500;
  }

  function kill(player: Player, now: number) {
    // The body becomes food, every other cell, so a big snake feeds the arena.
    player.body.forEach(
      (c, i) => i % 2 === 0 && inBounds(c) && food.length < 400 && food.push(c),
    );
    player.body = [];
    player.alive = false;
    player.respawnAt = now + RESPAWN_MS;
  }

  /** Bots: of the safe turns, the one that gets closer to food, with enough free room behind it. */
  function steerBot(bot: Player, taken: Set<number>) {
    const head = bot.body[0];
    const room = (from: P) => {
      // Flood fill up to 40 cells: a turn into a pocket smaller than the snake is a trap.
      const seen = new Set<number>([key(from)]);
      const queue = [from];
      while (queue.length && seen.size < 40) {
        const c = queue.shift()!;
        for (const d of [0, 1, 2, 3] as Dir[]) {
          const n = stepFrom(c, d);
          if (inBounds(n) && !taken.has(key(n)) && !seen.has(key(n))) {
            seen.add(key(n));
            queue.push(n);
          }
        }
      }
      return seen.size;
    };
    const target = [...food, ...(superFood ? [superFood.p] : [])].sort(
      (a, b) =>
        Math.abs(a.x - head.x) +
        Math.abs(a.y - head.y) -
        (Math.abs(b.x - head.x) + Math.abs(b.y - head.y)),
    )[0];
    let best: Dir = bot.dir;
    let bestScore = -Infinity;
    for (const d of [0, 1, 2, 3] as Dir[]) {
      if (opposite(d, bot.dir)) continue;
      const n = stepFrom(head, d);
      if (!inBounds(n) || taken.has(key(n))) continue;
      const space = room(n);
      const dist = target
        ? Math.abs(target.x - n.x) + Math.abs(target.y - n.y)
        : 0;
      const score =
        (space < Math.min(40, bot.body.length + 4) ? -1000 : 0) -
        dist +
        Math.random() * 1.5;
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    bot.dir = best;
  }

  function tick() {
    const now = Date.now();
    for (const p of players.values())
      if (!p.alive && now >= p.respawnAt) spawn(p, now);
    if (superFood && now > superFood.until) superFood = null;

    const living = [...players.values()].filter((p) => p.alive);
    const takenBefore = occupied();
    for (const p of living) {
      if (p.bot) steerBot(p, takenBefore);
      else {
        const next = p.turns.shift();
        if (next !== undefined && !opposite(next, p.dir)) p.dir = next;
      }
    }

    // Move everyone at once; eating grows the snake (its tail stays this tick).
    const foodKeys = new Map(food.map((f, i) => [key(f), i]));
    const eaten = new Set<number>();
    for (const p of living) {
      const head = stepFrom(p.body[0], p.dir);
      const fi = foodKeys.get(key(head));
      if (fi !== undefined && !eaten.has(fi)) {
        eaten.add(fi);
        p.score += 1;
        p.grow += 1;
        if (!superFood && Math.random() < SUPER_CHANCE)
          superFood = { p: freeCell(), until: now + SUPER_MS };
      } else if (superFood && key(head) === key(superFood.p)) {
        superFood = null;
        p.score += SUPER_POINTS;
        p.grow += 3;
      }
      p.body.unshift(head);
      if (p.grow > 0) p.grow--;
      else p.body.pop();
    }
    if (eaten.size) food = food.filter((_, i) => !eaten.has(i));

    // Collisions, after everyone moved: a head on a wall or on any occupied cell other than itself dies.
    const count = new Map<number, number>();
    for (const p of living)
      for (const c of p.body) count.set(key(c), (count.get(key(c)) ?? 0) + 1);
    const dead = living.filter(
      (p) => !inBounds(p.body[0]) || (count.get(key(p.body[0])) ?? 0) > 1,
    );
    for (const p of dead) kill(p, now);

    // Keep enough food around: more players, more food.
    const target = 10 + players.size * 3;
    while (food.length < target) food.push(freeCell());

    broadcast(now);
  }

  function snapshot(now: number): ArenaState {
    const list = [...players.values()];
    return {
      snakes: list.map((p) => ({
        id: p.id,
        name: p.name,
        bot: p.bot,
        body: p.body.flatMap((c) => [c.x, c.y]),
        alive: p.alive,
        score: p.score,
      })),
      food: food.flatMap((f) => [f.x, f.y]),
      superFood: superFood
        ? [superFood.p.x, superFood.p.y, Math.max(0, superFood.until - now)]
        : null,
      top: list
        .filter((p) => p.alive)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((p) => [p.name, p.score] as [string, number]),
      online: humans().length,
    };
  }

  function broadcast(now: number) {
    const msg: ServerMessage = { t: "arena.state", state: snapshot(now) };
    for (const p of players.values()) p.send?.(msg);
  }

  /** Bots fill in while fewer than three people play; none run when the arena is empty. */
  function balanceBots() {
    const people = humans().length;
    const wanted =
      people === 0 ? 0 : Math.max(0, Math.min(BOT_NAMES.length, 3 - people));
    const bots = [...players.values()].filter((p) => p.bot);
    for (const bot of bots.slice(wanted)) players.delete(bot.id);
    for (let i = bots.length; i < wanted; i++) {
      const bot: Player = {
        id: nextId++,
        name: BOT_NAMES[i],
        bot: true,
        body: [],
        dir: 1,
        turns: [],
        alive: false,
        respawnAt: 0,
        score: 0,
        grow: 0,
      };
      players.set(bot.id, bot);
    }
    if (people && !timer) timer = setInterval(tick, ARENA_TICK_MS);
    if (!people && timer) {
      clearInterval(timer);
      timer = null;
      food = [];
      superFood = null;
    }
  }

  return {
    /** Adds a player; null when the arena is full. */
    join(name: string, send: (msg: ServerMessage) => void): number | null {
      if (humans().length >= MAX_HUMANS) return null;
      const taken = new Set([...players.values()].map((p) => p.name));
      let unique = name;
      for (let n = 2; taken.has(unique); n++) unique = `${name}${n}`;
      const player: Player = {
        id: nextId++,
        name: unique,
        bot: false,
        body: [],
        dir: 1,
        turns: [],
        alive: false,
        respawnAt: 0,
        score: 0,
        grow: 0,
        send,
      };
      players.set(player.id, player);
      send({ t: "arena.welcome", you: player.id, name: unique });
      balanceBots();
      return player.id;
    },
    turn(id: number, dir: Dir) {
      const p = players.get(id);
      // Up to two queued turns, so a quick double tap (down, then left) is not lost between ticks.
      if (p && p.turns.length < 2) p.turns.push(dir);
    },
    leave(id: number) {
      if (!players.delete(id)) return;
      balanceBots();
    },
  };
}
