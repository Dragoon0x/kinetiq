"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  DealtFeed,
  defaultDealtFeedEntries,
  type DealtFeedEntry,
} from "@/registry/ui/dealt-feed";

export const tweaks = defineTweaks({
  dealSpeed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  spin: {
    kind: "range",
    label: "Spin",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/** Who signs up next: a seeded script, so every visit sees the same evening. */
const ARRIVALS: readonly Omit<DealtFeedEntry, "id" | "time">[] = [
  {
    name: "Ines Varga",
    detail: "Joined from the salt marsh notes",
    meta: "Team",
  },
  { name: "Callum Ashby", detail: "Invited by Mara Okafor", meta: "Solo" },
  { name: "Priya Lund", detail: "Gaugeworks hiking society", meta: "Pro" },
  { name: "Odile Marsh", detail: "Joined from the orchard maps", meta: "Team" },
  { name: "Kofi Strand", detail: "Waylight commuters", meta: "Solo" },
  { name: "Hana Ilves", detail: "Joined from the tide tables", meta: "Pro" },
  { name: "Rafe Corrin", detail: "Invited by Noor Haddad", meta: "Team" },
  { name: "Lumi Okoro", detail: "Coldbrook sea swimmers", meta: "Solo" },
];

const BASE_TOTAL = 123;
const EVERY = 2600;

/**
 * Fieldline sign-ups as they arrive: one every few seconds while the feed is
 * in view, each dealt onto the list from the deck.
 */
export function DealtFeedDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [entries, setEntries] = React.useState<DealtFeedEntry[]>(() => [
    ...defaultDealtFeedEntries,
  ]);
  const [count, setCount] = React.useState(0);
  const [last, setLast] = React.useState<DealtFeedEntry | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  // A new sign-up every few seconds, only while the feed is on screen.
  React.useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    let timer = 0;
    let visible = false;
    let n = 0;
    const tick = () => {
      timer = 0;
      if (!visible || document.hidden) return;
      const next = ARRIVALS[n % ARRIVALS.length];
      n += 1;
      if (next) {
        setEntries((all) =>
          [
            { ...next, id: `a${n}`, time: "now" },
            ...all.map((e) => (e.time === "now" ? { ...e, time: "1 min" } : e)),
          ].slice(0, 30),
        );
        setCount((c) => c + 1);
      }
      timer = window.setTimeout(tick, EVERY);
    };
    const watcher = new IntersectionObserver(
      (list) => {
        visible = list.some((e) => e.isIntersecting);
        if (visible && !timer) timer = window.setTimeout(tick, 900);
      },
      { threshold: 0.3 },
    );
    watcher.observe(node);
    const onVisibility = () => {
      if (!document.hidden && visible && !timer) {
        timer = window.setTimeout(tick, EVERY);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timer);
    };
  }, []);

  const feed = (
    <DealtFeed
      entries={entries}
      total={BASE_TOTAL + count}
      title="Fieldline sign-ups"
      onDeal={setLast}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={boxRef} className="w-full max-w-sm" style={{ height: 540 }}>
        {feed}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-3 self-center">
      <div ref={boxRef} className="w-full" style={{ height: 440 }}>
        {feed}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last ? (
          <>
            <span className="text-signal">dealt</span> · {last.name}
            {last.meta ? ` · ${last.meta}` : ""}
          </>
        ) : (
          <>
            <span className="text-signal">live</span> · hover to hold the deal
          </>
        )}
      </p>
    </div>
  );
}
