"use client";

import * as React from "react";

import { Pause, Play, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRota,
  defaultRotaNow,
  defaultRotaWeekStart,
  PagerRota,
  rotaSegments,
  type Rota,
} from "@/registry/ui/pager-rota";

export const tweaks = defineTweaks({
  dialStyle: {
    kind: "choice",
    label: "Dial",
    default: "rings",
    options: ["rings", "solid", "line"],
    names: { rings: "Rings", solid: "Solid", line: "Line" },
  },
  layerCount: {
    kind: "range",
    label: "Layers",
    default: 3,
    min: 1,
    max: 3,
    step: 1,
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--danger)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--danger)": "Coral",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;
/** The demo's clock: an hour of rota every 2.4 seconds. */
const TICK_MS = 2400;

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const stamp = (ms: number) => {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/**
 * The Gaugeworks platform team's week of 12 October. A simulated clock moves
 * the hand an hour every 2.4 seconds, but only while the rota is on screen
 * and the page is visible; pause it to work through the week by hand.
 */
export function PagerRotaDemo({
  chrome = true,
  // The rota is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [rota, setRota] = React.useState<Rota>(defaultRota);
  const [now, setNow] = React.useState(defaultRotaNow);
  const [playing, setPlaying] = React.useState(true);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);
  const ref = React.useRef<HTMLDivElement | null>(null);

  // The clock only runs while someone can see it.
  React.useEffect(() => {
    const node = ref.current;
    if (!node || !playing) return;
    let visible = false;
    let timer = 0;
    const tick = () => {
      setNote(null);
      setNow((n) => {
        const next = n + HOUR;
        return next >= defaultRotaWeekStart + WEEK
          ? defaultRotaWeekStart
          : next;
      });
    };
    const sync = () => {
      window.clearInterval(timer);
      timer = 0;
      if (visible && !document.hidden)
        timer = window.setInterval(tick, TICK_MS);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      sync();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.clearInterval(timer);
    };
  }, [playing, run]);

  const view = (
    <PagerRota
      key={run}
      rota={rota}
      onRotaChange={setRota}
      now={now}
      onOverride={(o) => {
        const who =
          rota.people.find((p) => p.id === o.person)?.name ?? o.person;
        setNote(
          `override · ${who} · ${stamp(o.start)}–${stamp(o.end).slice(4)}`,
        );
      }}
      onSwap={(a) => {
        const who =
          rota.people.find((p) => p.id === a.person)?.name ?? a.person;
        setNote(`swapped · ${who} takes ${stamp(a.start)}`);
      }}
      onPage={(person) => setNote(`paged ${person.name}`)}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full">
        {view}
      </div>
    );
  }

  const primary = rota.layers[0];
  const segs = primary
    ? rotaSegments(primary, rota.overrides, defaultRotaWeekStart)
    : [];
  const current = segs.find((s) => s.start <= now && now < s.end);
  const who = current?.person
    ? (rota.people.find((p) => p.id === current.person)?.name ?? "")
    : "nobody";
  const gaps = rota.layers
    .slice(0, values.layerCount ?? 3)
    .flatMap((l) => rotaSegments(l, rota.overrides, defaultRotaWeekStart))
    .filter((s) => s.kind === "gap").length;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {view}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={!playing}
          onClick={() => setPlaying((p) => !p)}
          className={button}
        >
          {playing ? (
            <Pause aria-hidden className="size-3.5" />
          ) : (
            <Play aria-hidden className="size-3.5" />
          )}
          {playing ? "Pause clock" : "Play clock"}
        </button>
        <button
          type="button"
          onClick={() =>
            setNow((n) =>
              n + HOUR >= defaultRotaWeekStart + WEEK
                ? defaultRotaWeekStart
                : n + HOUR,
            )
          }
          className={button}
        >
          Advance an hour
        </button>
        <button
          type="button"
          onClick={() => {
            setRota(defaultRota);
            setNow(defaultRotaNow);
            setNote(null);
            setPlaying(true);
            setRun((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <span className="text-signal">{note}</span>
        ) : (
          <>
            <span className="text-signal">{stamp(now)}</span> · {who}
            {current ? ` · until ${stamp(current.end)}` : ""} ·{" "}
            {gaps === 1 ? "1 gap" : `${gaps} gaps`}
          </>
        )}
      </p>
    </div>
  );
}
