// Pixel-art icon set drawn for phas.dev. Each icon is a bitmap ('#' = pixel) that is turned
// into a single SVG path on a 16×16 grid, so icons stay crisp, inherit `currentColor` and are
// easy to tweak by editing the drawing below.

const bitmaps = {
  about: `
    .....####.....
    ....#....#....
    ....#....#....
    ....#....#....
    .....####.....
    ..............
    ...########...
    ..#........#..
    .#..........#.
    .#..........#.
    .############.`,

  experience: `
    .....####.....
    ....#....#....
    .############.
    .#..........#.
    .#..........#.
    .#####..#####.
    .#....##....#.
    .#..........#.
    .#..........#.
    .############.`,

  projects: `
    .#####........
    .#....#######.
    .#..........#.
    .############.
    .#..........#.
    .#..........#.
    .#..........#.
    .#..........#.
    .############.`,

  stack: `
    ....######....
    ....#....#....
    ....######....
    ..............
    ..##########..
    ..#........#..
    ..##########..
    ..............
    ############
    #..........#
    ############`,

  contact: `
    ############
    ##........##
    #.#......#.#
    #..#....#..#
    #...#..#...#
    #....##....#
    #..........#
    #..........#
    ############`,

  help: `
    ############
    #..........#
    #...####...#
    #..#....#..#
    #.......#..#
    #......#...#
    #.....#....#
    #..........#
    #.....#....#
    #..........#
    ############`,

  cv: `
    ########...
    #......##..
    #......#.#.
    #......####
    #.........#
    #..#####..#
    #.........#
    #..#####..#
    #.........#
    #..###....#
    #.........#
    ###########`,

  education: `
    ......##......
    ....##..##....
    ..##......##..
    ##..........##
    ..##......##.#
    ....##..##...#
    ..#...##...#.#
    ..#........#.#
    ..#........#..
    ...########...`,

  lang: `
    ....######....
    ..##..##..##..
    ..#..#..#..#..
    .#..#....#..#.
    .############.
    .#..#....#..#.
    .#..#....#..#.
    .############.
    .#..#....#..#.
    ..#..#..#..#..
    ..##..##..##..
    ....######....`,

  sun: `
    .......#.......
    .#.....#.....#.
    ..#.........#..
    .....#####.....
    ....#.....#....
    ....#.....#....
    ##..#.....#..##
    ....#.....#....
    ....#.....#....
    .....#####.....
    ..#.........#..
    .#.....#.....#.
    .......#.......`,

  moon: `
    ...##.......
    ..##........
    .#.#........
    #..#........
    #..#........
    #...#.......
    #...#.......
    #....#......
    #.....######
    .#........#.
    ..#......#..
    ...######...`,

  simple: `
    ############
    #..........#
    ############
    #..........#
    #.######...#
    #..........#
    #.########.#
    #..........#
    #.#####....#
    #..........#
    ############`,

  terminal: `
    ############
    #..........#
    #.#........#
    #..#.......#
    #...#......#
    #..#.......#
    #.#..####..#
    #..........#
    ############`,

  email: `
    ############
    ##........##
    #.#......#.#
    #..#....#..#
    #...#..#...#
    #....##....#
    #..........#
    #..........#
    ############`,

  github: `
    ....######....
    ..##########..
    .############.
    .##.######.##.
    ###..####..###
    ##..........##
    #............#
    #............#
    ##..........##
    ###........###
    .#.###....###.
    .##..#...####.
    ..###....###..
    ....##..##....`,

  linkedin: `
    .############.
    ##############
    ###.##########
    ##############
    ###.##...#####
    ###.##.##.####
    ###.##.##.####
    ###.##.##.####
    ###.##.##.####
    ###.##.##.####
    ##############
    .############.`,

  game: `
    .############.
    #............#
    #..#......#..#
    #.###....#.#.#
    #..#......#..#
    #............#
    #...######...#
    .###......###.`,
} as const;

export type IconName = keyof typeof bitmaps;
export const iconNames = Object.keys(bitmaps) as IconName[];

const GRID = 16;

/** Turns a bitmap into one path: each horizontal run of pixels becomes a 1px-tall rectangle. */
function toPath(bitmap: string): string {
  const rows = bitmap
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  const width = Math.max(...rows.map((r) => r.length));
  const ox = Math.floor((GRID - width) / 2);
  const oy = Math.floor((GRID - rows.length) / 2);
  let d = "";
  rows.forEach((row, y) => {
    for (const m of row.matchAll(/#+/g))
      d += `M${ox + m.index!} ${oy + y}h${m[0].length}v1h-${m[0].length}z`;
  });
  return d;
}

const paths = Object.fromEntries(
  iconNames.map((n) => [n, toPath(bitmaps[n])]),
) as Record<IconName, string>;

const attrs = (size: number) =>
  `viewBox="0 0 ${GRID} ${GRID}" width="${size}" height="${size}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false"`;

/** SVG markup, for the static HTML rendered at build time. */
export const iconSvg = (name: IconName, size = 16) =>
  `<svg class="icon icon-${name}" ${attrs(size)}><path d="${paths[name]}"/></svg>`;

/** SVG element, for the terminal at runtime. */
export function icon(name: IconName, size = 16): SVGSVGElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = iconSvg(name, size);
  return tpl.content.firstElementChild as SVGSVGElement;
}
