// The browser side of the leaderboards (server/scores.ts): a run ticket when a solo game opens, the score
// at the end of each round (with a nickname), and the boards for the `ranking` command.
export type Game = "snake" | "snake-easy" | "invaders" | "tetris";

export interface Entry {
  name: string;
  score: number;
  at: string;
}

const post = async (path: string, body: unknown) => {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
};

/**
 * A run for `game`: asks the server for its ticket right away, and sends each round's score with it.
 * `submit` resolves to the places reached (null where the score did not make the board), or null when
 * there is no nickname, no score or no server.
 */
export function startRun(game: Game, name: string) {
  const ticket: Promise<string | null> = name
    ? post("/api/run", { game })
        .then((r) => String(r.run))
        .catch(() => null)
    : Promise.resolve(null);
  return {
    async submit(
      score: number,
    ): Promise<{ today: number | null; all: number | null } | null> {
      const run = await ticket;
      if (!run || score <= 0) return null;
      try {
        return await post("/api/scores", { game, run, name, score });
      } catch {
        return null;
      }
    },
  };
}

/** Today's and the all-time top ten for `game`; null if the server cannot be reached. */
export async function board(
  game: Game,
): Promise<{ today: Entry[]; all: Entry[] } | null> {
  try {
    const res = await fetch(`/api/scores?game=${game}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** The nickname last used, remembered between visits. */
export const savedNick = {
  get(): string {
    try {
      return localStorage.getItem("nick") ?? "";
    } catch {
      return "";
    }
  },
  set(nick: string) {
    try {
      if (nick) localStorage.setItem("nick", nick);
    } catch {}
  },
};
