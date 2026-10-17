"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { defaultSigilModes, SigilPalette } from "@/registry/ui/sigil-palette";

export const tweaks = defineTweaks({
  glyphStyle: {
    kind: "choice",
    label: "Glyph",
    default: "line",
    options: ["line", "tile", "keycap"],
    names: { line: "Line", tile: "Tile", keycap: "Keycap" },
  },
  tint: {
    kind: "range",
    label: "Tint",
    default: 12,
    min: 0,
    max: 30,
    step: 2,
    unit: "%",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

/** People load for a moment the first time their mode is opened. */
const LOAD_MS = 600;
const TOUR: [string, number][] = [
  ["people", 900],
  ["all", 2300],
  ["commands", 2900],
];

/**
 * The Coldbrook operations workspace. When it first comes into view it steps
 * into People, back out, and into Commands by itself, so the symbol can be
 * seen turning into each mode's icon; type @, >, # or / to do it yourself.
 */
export function SigilPaletteDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The palette is silent: the stage's sound switch has nothing to play here.
  void sound;
  const [run, setRun] = React.useState(0);
  const [mode, setMode] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState<string[]>([]);
  const [last, setLast] = React.useState<string | null>(null);
  const [inView, setInView] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [toured, setToured] = React.useState(false);
  const loaded = React.useRef(new Set<string>());
  const timers = React.useRef<number[]>([]);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { threshold: 0.4 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  const changeMode = React.useCallback((next: string) => {
    setMode(next);
    if (next === "people" && !loaded.current.has(next)) {
      loaded.current.add(next);
      setLoading((list) => [...list, next]);
      timers.current.push(
        window.setTimeout(
          () => setLoading((list) => list.filter((m) => m !== next)),
          LOAD_MS,
        ),
      );
    }
  }, []);

  // Once, on arrival, and never after a visitor has touched it.
  React.useEffect(() => {
    if (!inView || touched || toured) return;
    const ids = TOUR.map(([next, at], i) =>
      window.setTimeout(() => {
        setQuery("");
        changeMode(next);
        if (i === TOUR.length - 1) setToured(true);
      }, at),
    );
    return () => {
      for (const id of ids) window.clearTimeout(id);
    };
  }, [inView, touched, toured, changeMode]);

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    loaded.current.clear();
    setLoading([]);
    setMode("all");
    setQuery("");
    setLast(null);
    setRun((n) => n + 1);
  };

  const label =
    defaultSigilModes.find((m) => m.id === mode)?.label ?? "everything";

  return (
    <div
      ref={wrapRef}
      onPointerDownCapture={() => setTouched(true)}
      onKeyDownCapture={() => setTouched(true)}
      className="flex w-full max-w-[36rem] flex-col gap-4"
    >
      <SigilPalette
        key={run}
        mode={mode}
        onModeChange={(next) => {
          changeMode(next);
          setLast(null);
        }}
        query={query}
        onQueryChange={setQuery}
        loadingModes={loading}
        onSelect={(item) =>
          setLast(`opened ${item.mode === "projects" ? "#" : ""}${item.label}`)
        }
        onCreate={(m, q) => {
          const verb =
            defaultSigilModes.find((x) => x.id === m)?.createVerb ?? "create";
          setLast(`${verb.toLowerCase()} “${q}”`);
        }}
        {...values}
      />
      {chrome ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
                "hover:bg-surface-2 hover:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Reset
            </button>
          </div>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{`mode ${label}`}</span>
            {last
              ? ` · ${last}`
              : loading.length
                ? " · loading"
                : query
                  ? ` · “${query}”`
                  : ""}
          </p>
        </>
      ) : null}
    </div>
  );
}
