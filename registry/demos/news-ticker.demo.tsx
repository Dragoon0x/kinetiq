"use client";

import * as React from "react";

import {
  NewsTicker,
  type TickerHeadline,
  type TickerTone,
} from "@/registry/ui/news-ticker";

/** The desk feed, one line each: id | headline | outlet | time | tone. */
const OPENING = [
  "h1|Basin 40 opens firmer as energy leads|Basin Wire|09:31|up",
  "h2|Fernwork guides above the desk's range|Fernline Desk|09:34|up",
  "h3|Coldbrook Bank holds its rate at the review|Coldbrook Notes|09:37|flat",
  "h4|Saltmoor Metals slips on a softer order book|Basin Wire|09:40|down",
];

/** The six that arrive behind the button, in order. */
const INCOMING = [
  "h5|Waylight Pay clears its first settlement window|Basin Wire|09:42|up",
  "h6|Gauge Systems trims its capacity plan|Fernline Desk|09:45|down",
  "h7|Hollowmere Oil steady after the inventory print|Coldbrook Notes|09:48|flat",
  "h8|Basin 40 extends the morning's gains|Basin Wire|09:51|up",
  "h9|Marrow Bio slides after the trial readout|Fernline Desk|09:54|down",
  "h10|Coldbrook Notes flags a quiet close ahead|Coldbrook Notes|09:57|flat",
];

const headlineOf = (row: string): TickerHeadline => {
  const [id = "", text = "", source = "", time = "", tone = "flat"] =
    row.split("|");
  return { id, text, source, time, tone: tone as TickerTone };
};

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function NewsTickerDemo() {
  const [generation, setGeneration] = React.useState(0);
  const [pushed, setPushed] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [held, setHeld] = React.useState(false);

  const headlines = React.useMemo(
    () => [...OPENING, ...INCOMING.slice(0, pushed)].map(headlineOf),
    [pushed],
  );
  const latest = headlines[headlines.length - 1];
  const state = !playing ? "stopped" : held ? "held" : "running";

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <NewsTicker
        key={generation}
        label="Basinworks Exchange desk feed"
        headlines={headlines}
        playing={playing}
        onPlayingChange={setPlaying}
        onPauseChange={setHeld}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={pushed >= INCOMING.length}
          onClick={() => setPushed((current) => current + 1)}
        >
          Push headline
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => setPlaying((current) => !current)}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={pushed === 0 && playing}
          onClick={() => {
            setGeneration((current) => current + 1);
            setPushed(0);
            setPlaying(true);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="tabular-nums">{headlines.length}</span> headlines ·{" "}
        <span className="text-signal">{state}</span>
        {latest ? (
          <>
            {" "}
            · latest <span className="tabular-nums">{latest.time}</span>{" "}
            <span className="text-cobalt-bright">{latest.source}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
