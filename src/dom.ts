import { icon, type IconName } from "./icons.ts";

export type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | undefined> | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs)
    for (const [k, v] of Object.entries(attrs))
      if (v != null) el.setAttribute(k, v);
  for (const c of children) if (c != null && c !== false) el.append(c);
  return el;
}

/** A clickable command. Clicks are handled by a delegated listener on the terminal. */
export const cmd = (command: string, label = command, iconName?: IconName) =>
  h(
    "button",
    {
      type: "button",
      class: iconName ? "cmd has-icon" : "cmd",
      "data-cmd": command,
    },
    iconName && icon(iconName),
    iconName ? h("span", null, label) : label,
  );

export const link = (
  url: string,
  label = url.replace(/^https?:\/\/(www\.)?/, ""),
) =>
  h(
    "a",
    {
      href: url,
      target: url.startsWith("mailto:") ? undefined : "_blank",
      rel: "noopener",
    },
    label,
  );

/** Interleaves nodes with a separator, e.g. a list of commands separated by spaces. */
export const join = (nodes: Child[], sep: Child = " ") =>
  nodes.flatMap((n, i) => (i ? [sep, n] : [n]));
