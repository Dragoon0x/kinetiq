"use client";

import * as React from "react";

import {
  FreshnessTag,
  formatFreshDate,
  type FreshSource,
} from "@/registry/ui/freshness-tag";

/** Gaugeworks Reasoner's sources on Coldbrook Bank's research desk. */
const SOURCES: FreshSource[] = (
  [
    [
      "letter",
      "Basinworks quarterly letter",
      "basinworks.example",
      "2026-06-02",
    ],
    ["notes", "Coldbrook yard notes", "coldbrook.example", "2026-09-07"],
    ["rota", "Fieldline rota export", "fieldline.example", "2026-08-30"],
    ["fares", "Waylight fare table", "waylight.example", "2026-03-14"],
  ] as const
).map(([id, title, site, fetchedAt]) => ({ id, title, site, fetchedAt }));

/** The desk's clock is fixed, so the demo reads the same on every visit. */
const START = "2026-09-09";
const STALE_AFTER = 30;
const FETCH_MS = 1200;
const DAY_MS = 86_400_000;

const addDays = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);

const button =
  "flex h-8 items-center rounded-2 border border-hairline bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function FreshnessTagDemo() {
  const [sources, setSources] = React.useState(SOURCES);
  const [now, setNow] = React.useState(START);
  const [fetching, setFetching] = React.useState<string[]>([]);
  const [event, setEvent] = React.useState<string | null>(null);

  // A hidden tab pauses the fetch; a stamp should not land unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (fetching.length === 0 || !visible) return;
    const timers = fetching.map((id) =>
      window.setTimeout(() => {
        setSources((prev) =>
          prev.map((s) => (s.id === id ? { ...s, fetchedAt: now } : s)),
        );
        setFetching((prev) => prev.filter((other) => other !== id));
        setEvent(`Stamped ${formatFreshDate(now)}`);
      }, FETCH_MS),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [fetching, visible, now]);

  const stale = sources.filter(
    (s) => (Date.parse(now) - Date.parse(s.fetchedAt)) / DAY_MS >= STALE_AFTER,
  ).length;
  const busy = sources.find((s) => s.id === fetching[0]);
  const head = busy
    ? `Fetching ${busy.title}`
    : (event ?? formatFreshDate(now));
  const statusText = `${head} · ${stale} stale of ${sources.length}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <FreshnessTag
        label="Sources for Gaugeworks Reasoner"
        sources={sources}
        now={now}
        staleAfterDays={STALE_AFTER}
        fetching={fetching}
        onRefetch={(id) => {
          setFetching((prev) => (prev.includes(id) ? prev : [...prev, id]));
          setEvent(null);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const next = addDays(now, 7);
            setNow(next);
            setEvent(`Advanced to ${formatFreshDate(next)}`);
          }}
          className={button}
        >
          Advance a week
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {statusText}
      </p>
    </div>
  );
}
