"use client";

import * as React from "react";

import { Keyboard, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { defaultSimilarIdeas, SimilarIdeas } from "@/registry/ui/similar-ideas";

export const tweaks = defineTweaks({
  matchStyle: {
    kind: "choice",
    label: "Match",
    default: "bar",
    options: ["bar", "dots", "ring"],
    names: { bar: "Bar", dots: "Dots", ring: "Ring" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  statusPalette: {
    kind: "choice",
    label: "Status",
    default: "signal",
    options: ["signal", "cool", "mono"],
    names: { signal: "Signal", cool: "Cool", mono: "Mono" },
  },
});

const EXAMPLE = "export to csv on a schedule";

const titleOf = (id: string) =>
  defaultSimilarIdeas.find((i) => i.id === id)?.title.toLowerCase() ?? id;

/**
 * Coldbrook's public roadmap. Someone wants their reports sent as a CSV
 * every week; the panel finds that it is already planned, and their vote
 * carries their words onto it as a comment.
 */
export function SimilarIdeasDemo({
  chrome = true,
  // The panel is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [value, setValue] = React.useState("");
  const [line, setLine] = React.useState("empty field · 14 ideas");
  const timers = React.useRef(new Set<number>());

  const clear = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
  };
  React.useEffect(() => clear, []);

  const typeExample = () => {
    clear();
    setValue("");
    setLine("typing");
    for (let i = 1; i <= EXAMPLE.length; i++) {
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        setValue(EXAMPLE.slice(0, i));
      }, i * 55);
      timers.current.add(t);
    }
  };

  const reset = () => {
    clear();
    setValue("");
    setLine("empty field · 14 ideas");
    setRound((r) => r + 1);
  };

  const panel = (
    <SimilarIdeas
      key={round}
      value={value}
      onValueChange={(v) => {
        setValue(v);
        if (v.trim().length > 0 && v.trim().length < 3) setLine("typing");
        if (v.length === 0)
          setLine((l) => (l === "typing" ? "empty field · 14 ideas" : l));
      }}
      onMatches={(ids) =>
        setLine(
          ids.length === 0
            ? "no match · ready to post"
            : `${ids.length} similar idea${ids.length === 1 ? "" : "s"} · top: ${titleOf(ids[0] ?? "")}`,
        )
      }
      onVote={(id, voted, comment) =>
        setLine(
          voted
            ? `voted · ${titleOf(id)}${comment ? " · note added" : ""}`
            : `vote taken back · ${titleOf(id)}`,
        )
      }
      onFollow={(id, following) =>
        setLine(`${following ? "following" : "unfollowed"} · ${titleOf(id)}`)
      }
      onSubmitNew={() => setLine("posted · under review")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{panel}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {panel}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={typeExample} className={button}>
          <Keyboard aria-hidden className="size-3.5" />
          Type an example
        </button>
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line}</span>
      </p>
    </div>
  );
}
