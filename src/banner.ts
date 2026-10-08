// The PHAS logo: "ANSI Shadow" block letters drawn as SVG instead of text, so the
// double-line shadow joins cleanly in any browser and font. Next to it, a pixel server rack.

const ART = `
██████╗ ██╗  ██╗ █████╗ ███████╗
██╔══██╗██║  ██║██╔══██╗██╔════╝
██████╔╝███████║███████║███████╗
██╔═══╝ ██╔══██║██╔══██║╚════██║
██║     ██║  ██║██║  ██║███████║
╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝`;

// One character cell is 10×20 units, like a monospace glyph.
const CW = 10;
const CH = 20;
// Double lines sit around the cell centre.
const X1 = 3.5;
const X2 = 6.5;
const Y1 = 8.5;
const Y2 = 11.5;

/** Box-drawing characters as stroke paths, relative to the cell's top-left corner. */
const strokes: Record<string, (x: number, y: number) => string> = {
  "═": (x, y) => `M${x} ${y + Y1}h${CW}M${x} ${y + Y2}h${CW}`,
  "║": (x, y) => `M${x + X1} ${y}v${CH}M${x + X2} ${y}v${CH}`,
  "╗": (x, y) =>
    `M${x} ${y + Y1}H${x + X2}V${y + CH}M${x} ${y + Y2}H${x + X1}V${y + CH}`,
  "╔": (x, y) =>
    `M${x + CW} ${y + Y1}H${x + X1}V${y + CH}M${x + CW} ${y + Y2}H${x + X2}V${y + CH}`,
  "╝": (x, y) => `M${x} ${y + Y2}H${x + X2}V${y}M${x} ${y + Y1}H${x + X1}V${y}`,
  "╚": (x, y) =>
    `M${x + CW} ${y + Y2}H${x + X1}V${y}M${x + CW} ${y + Y1}H${x + X2}V${y}`,
};

// Pixel server rack, 5 units per pixel. 'o' marks the status LEDs, which blink. 13 pixels wide, so it
// spans the "[ ok ]" column of the boot lines; 20 tall, the height of the solid letters.
const RACK = `
.###########.
#...........#
#.#.#...o.o.#
#...........#
.###########.
.............
.###########.
#...........#
#.#.#...o.o.#
#...........#
.###########.
.............
.###########.
#...........#
#.#.#...o.o.#
#...........#
.###########.
.....###.....
.....###.....
..#########..`;
const PX = 5;

const rows = (art: string) => art.split("\n").filter(Boolean);

function letters(ox: number) {
  let fill = "";
  let lines = "";
  rows(ART).forEach((row, r) => {
    const y = r * CH;
    for (const m of row.matchAll(/█+/g))
      fill += `M${ox + m.index! * CW} ${y}h${m[0].length * CW}v${CH}h-${m[0].length * CW}z`;
    [...row].forEach((ch, c) => (lines += strokes[ch]?.(ox + c * CW, y) ?? ""));
  });
  return { fill, lines };
}

function rack(oy: number) {
  let body = "";
  const leds: string[] = [];
  rows(RACK).forEach((row, r) => {
    const y = oy + r * PX;
    for (const m of row.matchAll(/#+/g))
      body += `M${m.index! * PX} ${y}h${m[0].length * PX}v${PX}h-${m[0].length * PX}z`;
    for (const m of row.matchAll(/o/g))
      leds.push(
        `<rect class="led" x="${m.index! * PX}" y="${y}" width="${PX}" height="${PX}"/>`,
      );
  });
  return { body, leds: leds.join("") };
}

// The letters start where the boot lines' text does, after "[ ok ] ".
const TEXT_X = 83;
const WIDTH = TEXT_X + 32 * CW;
const HEIGHT = 6 * CH;

export function bannerSvg(): string {
  const { fill, lines } = letters(TEXT_X);
  // Top-aligned with the letters: the rack and the solid blocks share their top and bottom edges.
  const { body, leds } = rack(0);
  return `<svg class="banner" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="PHAS">
  <path class="rack" d="${body}"/>${leds}
  <path class="blocks" d="${fill}"/>
  <path class="shadow" d="${lines}"/>
</svg>`;
}

export function banner(): SVGSVGElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = bannerSvg();
  return tpl.content.firstElementChild as SVGSVGElement;
}
