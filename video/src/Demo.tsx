// phas.dev in about 30 seconds, for the README: the terminal, the resume, the themes, the games, the hidden
// commands and the phone, each a real screenshot of the site (scripts/capture.ts) in a window that eases
// in, with a caption typed out like a command.
import { loadFont } from "@remotion/fonts";
import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const FONT = "Geist Mono";
loadFont({
  family: FONT,
  url: staticFile("fonts/geist-mono.woff2"),
  weight: "100 900",
});

const BG = "#0b0c0d";
const FG = "#dcd9d2";
const MUTED = "#8e8a83";
const ACCENT = "#f0a43a";

/** Scenes in order: how long each lasts (frames at 30 fps). */
const SCENES: { frames: number; render: () => ReactNode }[] = [
  { frames: 130, render: () => <Intro /> },
  {
    frames: 150,
    render: () => (
      <Shot
        src="01-home"
        caption="boot, banner and an icon menu. Or just type help."
      />
    ),
  },
  {
    frames: 160,
    render: () => (
      <Shot
        src="02-experience"
        caption="the resume, as commands: experience, projects, stack."
        pan
      />
    ),
  },
  {
    frames: 140,
    render: () => (
      <Shot
        src="05-resume"
        caption="one click to a clean resume that prints as a PDF."
        pan
      />
    ),
  },
  { frames: 225, render: () => <Themes /> },
  { frames: 270, render: () => <Games /> },
  {
    frames: 140,
    render: () => (
      <Shot
        src="04-easter-eggs"
        caption="and a few hidden commands. Happy hunting."
      />
    ),
  },
  { frames: 150, render: () => <Phone /> },
  { frames: 160, render: () => <Outro /> },
];
export const DEMO_FRAMES = SCENES.reduce((n, s) => n + s.frames, 0);

export const Demo = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, color: FG }}>
      {SCENES.map((scene, i) => {
        const start = from;
        from += scene.frames;
        return (
          <Sequence key={i} from={start} durationInFrames={scene.frames}>
            <Fade frames={scene.frames}>{scene.render()}</Fade>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** Each scene fades in and out over a third of a second. */
const Fade = ({
  frames,
  children,
}: {
  frames: number;
  children: ReactNode;
}) => {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [0, 16, frames - 16, frames], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

/** A line typed out character by character, with a blinking cursor. */
const Typed = ({
  text,
  start = 0,
  speed = 0.9,
  size = 26,
  color = FG,
  prompt = true,
}: {
  text: string;
  start?: number;
  speed?: number;
  size?: number;
  color?: string;
  prompt?: boolean;
}) => {
  const f = useCurrentFrame();
  const shown = text.slice(0, Math.max(0, Math.floor((f - start) * speed)));
  const cursor = Math.floor(f / 15) % 2 === 0;
  return (
    <div style={{ fontSize: size, color, whiteSpace: "pre" }}>
      {prompt && <span style={{ color: MUTED }}>guest@phas.dev:~$ </span>}
      {shown}
      <span
        style={{
          display: "inline-block",
          width: size * 0.55,
          height: size * 1.05,
          marginLeft: 2,
          verticalAlign: "-0.2em",
          background: cursor ? ACCENT : "transparent",
        }}
      />
    </div>
  );
};

/** A browser-ish window around a screenshot; it eases in and drifts slowly closer (or pans down). */
const Window = ({
  src,
  width,
  pan = false,
  children,
}: {
  src: string;
  width: number;
  pan?: boolean;
  children?: ReactNode;
}) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame: f, fps, config: { damping: 18, mass: 0.7 } });
  const zoom = interpolate(f, [0, durationInFrames], [1, 1.04]);
  const scroll = pan
    ? interpolate(f, [15, durationInFrames - 10], [0, -14], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      })
    : 0;
  return (
    <div
      style={{
        width,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #2a2d31",
        boxShadow: "0 30px 80px rgba(0,0,0,.6)",
        transform: `translateY(${(1 - enter) * 40}px) scale(${zoom})`,
        opacity: enter,
        background: "#111214",
      }}
    >
      <div
        style={{
          height: 30,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          background: "#17191c",
          borderBottom: "1px solid #2a2d31",
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span
            key={c}
            style={{ width: 11, height: 11, borderRadius: 6, background: c }}
          />
        ))}
        <span style={{ marginLeft: 12, color: MUTED, fontSize: 14 }}>
          phas.dev
        </span>
      </div>
      <div style={{ overflow: "hidden", aspectRatio: "16 / 9" }}>
        <Img
          src={staticFile(`shots/${src}.png`)}
          style={{
            width: "100%",
            display: "block",
            transform: `translateY(${scroll}%)`,
          }}
        />
      </div>
      {children}
    </div>
  );
};

/** The common scene: a screenshot in its window, the caption typed under it. */
const Shot = ({
  src,
  caption,
  pan,
}: {
  src: string;
  caption: string;
  pan?: boolean;
}) => (
  <AbsoluteFill
    style={{
      alignItems: "center",
      justifyContent: "center",
      gap: 28,
      padding: 40,
    }}
  >
    <Window src={src} width={980} pan={pan} />
    <Typed text={caption} start={22} size={24} />
  </AbsoluteFill>
);

const Intro = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - 40, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", gap: 26 }}
    >
      <Typed text="whoami" start={8} speed={0.3} size={30} />
      <div
        style={{
          fontSize: 120,
          fontWeight: 700,
          letterSpacing: -4,
          transform: `scale(${0.85 + 0.15 * pop})`,
          opacity: pop,
        }}
      >
        phas<span style={{ color: ACCENT }}>.dev</span>
      </div>
      <div
        style={{
          fontSize: 30,
          color: MUTED,
          opacity: interpolate(f, [65, 85], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        a developer portfolio you can type into
      </div>
    </AbsoluteFill>
  );
};

/** Three themes, one after another, with the command that switches them. */
const Themes = () => {
  const f = useCurrentFrame();
  const shots = [
    "06-theme-1-dracula",
    "06-theme-2-gruvbox",
    "06-theme-3-matrix",
  ];
  const names = ["dracula", "gruvbox", "matrix"];
  const i = Math.min(2, Math.floor(f / 75));
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: 40,
      }}
    >
      <div style={{ position: "relative", width: 980 }}>
        {shots.map((s, k) => (
          <div
            key={s}
            style={{
              position: k ? "absolute" : "relative",
              inset: 0,
              opacity: interpolate(f - k * 75, [-12, 0], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <Window src={s} width={980} />
          </div>
        ))}
      </div>
      <Typed
        key={i}
        text={`theme ${names[i]}`}
        start={i * 75 + 8}
        speed={0.6}
        size={26}
      />
    </AbsoluteFill>
  );
};

/** The four games, appearing one by one in a grid. */
const Games = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const games: [string, string][] = [
    ["07-snake-online", "Snake · online arena"],
    ["08-invaders-coop", "Space Invaders · co-op"],
    ["09-pong", "Pong · 1v1 or vs the computer"],
    ["10-tetris-versus", "Tetris · versus"],
  ];
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        padding: 30,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          width: 900,
        }}
      >
        {games.map(([src, label], k) => {
          const s = spring({ frame: f - k * 28, fps, config: { damping: 18 } });
          return (
            <div
              key={src}
              style={{ opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}
            >
              <div
                style={{
                  borderRadius: 10,
                  overflow: "hidden",
                  border: "1px solid #2a2d31",
                  aspectRatio: "16 / 9",
                }}
              >
                <Img
                  src={staticFile(`shots/${src}.png`)}
                  style={{ width: "100%", display: "block" }}
                />
              </div>
              <div style={{ marginTop: 5, fontSize: 16, color: ACCENT }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
      <Typed
        text="four games, all with an online mode and client-side prediction."
        start={130}
        size={20}
      />
    </AbsoluteFill>
  );
};

/** The site on a phone, sliding up beside its caption. */
const Phone = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 18 } });
  return (
    <AbsoluteFill
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 70,
      }}
    >
      <div
        style={{
          width: 300,
          height: 620,
          borderRadius: 44,
          border: "10px solid #1d1f22",
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,.6)",
          transform: `translateY(${(1 - s) * 80}px)`,
          opacity: s,
        }}
      >
        <Img
          src={staticFile("shots/11-mobile.png")}
          style={{ width: "100%", display: "block" }}
        />
      </div>
      <div style={{ width: 460 }}>
        <Typed text="works on a phone, too." start={20} size={30} />
        <div
          style={{
            marginTop: 18,
            fontSize: 20,
            color: MUTED,
            lineHeight: 1.5,
            opacity: interpolate(f, [60, 80], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          tap the icons, swipe in the games,
          <br />
          and Back closes what you opened.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Outro = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f, fps, config: { damping: 14 } });
  const stack =
    "TypeScript · Vite · Node 24 · WebSockets · Railway · Cloudflare";
  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", gap: 24 }}
    >
      <div
        style={{
          fontSize: 110,
          fontWeight: 700,
          letterSpacing: -4,
          transform: `scale(${0.9 + 0.1 * pop})`,
          opacity: pop,
        }}
      >
        phas<span style={{ color: ACCENT }}>.dev</span>
      </div>
      <Typed text="help" start={30} speed={0.3} size={30} />
      <div
        style={{
          fontSize: 18,
          color: MUTED,
          opacity: interpolate(f, [70, 90], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {stack}
      </div>
    </AbsoluteFill>
  );
};
