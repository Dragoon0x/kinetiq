"use client";

import * as React from "react";

type Watch = (visible: boolean) => void;

/** One shared observer per margin, however many cards are watching. */
const observers = new Map<
  string,
  { io: IntersectionObserver; watches: Map<Element, Watch> }
>();

function watch(node: Element, margin: string, fn: Watch): () => void {
  let entry = observers.get(margin);
  if (!entry) {
    const watches = new Map<Element, Watch>();
    const io = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          watches.get(record.target)?.(record.isIntersecting);
        }
      },
      { rootMargin: margin },
    );
    entry = { io, watches };
    observers.set(margin, entry);
  }
  entry.watches.set(node, fn);
  entry.io.observe(node);
  const current = entry;
  return () => {
    current.watches.delete(node);
    current.io.unobserve(node);
  };
}

/**
 * Whether a card's live demo should exist: it mounts once the card comes
 * within `near` of the viewport and unmounts once it drifts beyond `far`.
 * The gap between the two is hysteresis — a card scrolled a little away and
 * back keeps its demo, and its state, rather than rebuilding it.
 */
export function useMountWindow(
  node: Element | null,
  near = "600px 0px",
  far = "1800px 0px",
): boolean {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    if (!node || typeof IntersectionObserver === "undefined") return;
    const stopNear = watch(node, near, (visible) => {
      if (visible) setMounted(true);
    });
    const stopFar = watch(node, far, (visible) => {
      if (!visible) setMounted(false);
    });
    return () => {
      stopNear();
      stopFar();
    };
  }, [node, near, far]);

  return mounted;
}
