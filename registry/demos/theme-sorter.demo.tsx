"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultThemeSorterItems,
  defaultThemeSorterThemes,
  ThemeSorter,
  type FeedbackItem,
  type FeedbackTheme,
} from "@/registry/ui/theme-sorter";

export const tweaks = defineTweaks({
  bucketStyle: {
    kind: "choice",
    label: "Buckets",
    default: "tray",
    options: ["tray", "jar", "row"],
    names: { tray: "Tray", jar: "Jar", row: "Row" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  sentimentPalette: {
    kind: "choice",
    label: "Sentiment",
    default: "signal",
    options: ["signal", "duo", "mono"],
    names: { signal: "Signal", duo: "Duo", mono: "Mono" },
  },
});

const leaderOf = (items: FeedbackItem[], themes: FeedbackTheme[]) => {
  const counts = new Map<string, number>();
  for (const i of items) {
    if (i.themeId) counts.set(i.themeId, (counts.get(i.themeId) ?? 0) + 1);
  }
  let best: FeedbackTheme | undefined;
  for (const t of themes) {
    if (!best || (counts.get(t.id) ?? 0) > (counts.get(best.id) ?? 0)) best = t;
  }
  return { leader: best, counts };
};

/**
 * Coldbrook's product team sorting this week's feedback: nine quotes from
 * Coldbrook and Basinworks customers wait in the inbox. Two more pricing
 * quotes put Pricing ahead of Onboarding. "Fail next tag" makes the next
 * tag fail, so the card can be seen coming back.
 */
export function ThemeSorterDemo({
  chrome = true,
  // The inbox is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const items = React.useRef<FeedbackItem[]>(defaultThemeSorterItems);
  const themes = React.useRef<FeedbackTheme[]>(defaultThemeSorterThemes);
  const [line, setLine] = React.useState("9 in inbox · 5 themes");
  const [failNext, setFailNext] = React.useState(false);
  const failRef = React.useRef(failNext);
  const timers = React.useRef(new Set<number>());
  React.useEffect(() => {
    failRef.current = failNext;
  }, [failNext]);
  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    items.current = defaultThemeSorterItems;
    themes.current = defaultThemeSorterThemes;
    setLine("9 in inbox · 5 themes");
    setRound((r) => r + 1);
  };

  const surface = (
    <ThemeSorter
      key={round}
      onItemsChange={(next) => {
        const before = leaderOf(items.current, themes.current).leader;
        items.current = next;
        const { leader, counts } = leaderOf(next, themes.current);
        const waiting = next.filter((i) => !i.themeId && !i.archived).length;
        if (leader && before && leader.id !== before.id) {
          setLine(
            `${leader.name.toLowerCase()} now leads · ${counts.get(leader.id) ?? 0}`,
          );
        } else if (waiting === 0) {
          setLine("inbox zero");
        }
      }}
      onThemesChange={(next) => {
        themes.current = next;
      }}
      onTag={(itemId, themeId) => {
        const theme = themes.current.find((t) => t.id === themeId);
        const count = items.current.filter((i) => i.themeId === themeId).length;
        const fail = failRef.current;
        setFailNext(false);
        setLine(`tagged · ${theme?.name.toLowerCase() ?? themeId} · ${count}`);
        if (!fail) return;
        return new Promise((_, reject) => {
          const t = window.setTimeout(() => {
            timers.current.delete(t);
            setLine("tag failed · returned to inbox");
            reject(new Error(`could not tag ${itemId}`));
          }, 700);
          timers.current.add(t);
        });
      }}
      onCreateTheme={(theme) =>
        setLine(`theme created · ${theme.name.toLowerCase()}`)
      }
      onArchive={() => setLine("archived")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={cn(
            button,
            failNext && "border-danger/40 text-danger hover:text-danger",
          )}
        >
          Fail next tag
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
