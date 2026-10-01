"use client";

import * as React from "react";

export type Box = { x: number; y: number; w: number; h: number };

/**
 * Where an element sits in its world, in untransformed layout pixels —
 * offsets summed up to the world root, so camera transforms never touch the
 * measurement. Read once after mount (a world's layout does not move), which
 * keeps every camera move a pure function of film time.
 */
export function useWorldBox(
  world: React.RefObject<HTMLElement | null>,
  target: React.RefObject<HTMLElement | null>,
): Box | null {
  const [box, setBox] = React.useState<Box | null>(null);
  React.useLayoutEffect(() => {
    const root = world.current;
    let el: HTMLElement | null = target.current;
    if (!root || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = 0;
    let y = 0;
    while (el && el !== root) {
      x += el.offsetLeft;
      y += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    // Measured once on mount: the world's layout is fixed for the shot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBox({ x, y, w, h });
  }, [world, target]);
  return box;
}

/** An element's box in its world, by the same offset sum. */
export function boxIn(root: HTMLElement, element: HTMLElement): Box {
  let el: HTMLElement | null = element;
  let x = 0;
  let y = 0;
  while (el && el !== root) {
    x += el.offsetLeft;
    y += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }
  return { x, y, w: element.offsetWidth, h: element.offsetHeight };
}

/**
 * Boxes of several elements inside a world, found by selector after mount —
 * for parts of a live component the film cannot hold a ref to.
 */
export function useWorldBoxes(
  world: React.RefObject<HTMLElement | null>,
  selectors: Record<string, string>,
): Record<string, Box> {
  const [boxes, setBoxes] = React.useState<Record<string, Box>>({});
  const key = JSON.stringify(selectors);
  React.useLayoutEffect(() => {
    const root = world.current;
    if (!root) return;
    const next: Record<string, Box> = {};
    for (const [name, selector] of Object.entries(
      JSON.parse(key) as Record<string, string>,
    )) {
      const element = root.querySelector<HTMLElement>(selector);
      if (element) next[name] = boxIn(root, element);
    }
    // Measured once on mount, like useWorldBox.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoxes(next);
  }, [world, key]);
  return boxes;
}
