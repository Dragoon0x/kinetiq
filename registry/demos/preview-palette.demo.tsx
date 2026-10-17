"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultPreviewPaletteItems,
  defaultPreviewPaletteRecent,
  PreviewPalette,
  type PreviewPaletteItem,
} from "@/registry/ui/preview-palette";

export const tweaks = defineTweaks({
  previewWidth: {
    kind: "range",
    label: "Preview",
    default: 50,
    min: 40,
    max: 60,
    step: 5,
    unit: "%",
  },
  listDensity: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

/** How long a file's preview takes to arrive the first time it is shown. */
const LOAD_MS = 700;
const FIRST = defaultPreviewPaletteRecent[0] ?? "release-checklist";
const BY_ID = new Map(
  defaultPreviewPaletteItems.map((item) => [item.id, item]),
);

type Said =
  | { kind: "preview"; item: PreviewPaletteItem | null }
  | { kind: "open"; item: PreviewPaletteItem }
  | { kind: "beside"; item: PreviewPaletteItem }
  | { kind: "create"; query: string };

/**
 * The Fernworks wiki's search. When it first comes into view it flips down
 * two results and back by itself, so the strip is seen moving; the first time
 * a file is highlighted its preview takes a moment to load.
 */
export function PreviewPaletteDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The palette is silent: the stage's sound switch has nothing to play here.
  void sound;
  const [run, setRun] = React.useState(0);
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState<string>(FIRST);
  const [pending, setPending] = React.useState<string[]>([]);
  const [said, setSaid] = React.useState<Said>({
    kind: "preview",
    item: BY_ID.get(FIRST) ?? null,
  });
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

  const highlight = React.useCallback((item: PreviewPaletteItem | null) => {
    setHighlighted(item?.id ?? "create");
    setSaid({ kind: "preview", item });
    if (item?.kind === "file" && !loaded.current.has(item.id)) {
      loaded.current.add(item.id);
      setPending((list) => [...list, item.id]);
      timers.current.push(
        window.setTimeout(
          () => setPending((list) => list.filter((id) => id !== item.id)),
          LOAD_MS,
        ),
      );
    }
  }, []);

  // A short tour once on arrival, and never after a visitor has touched it.
  React.useEffect(() => {
    if (!inView || touched || toured) return;
    const steps = [
      defaultPreviewPaletteRecent[1],
      defaultPreviewPaletteRecent[2],
      defaultPreviewPaletteRecent[1],
      FIRST,
    ];
    const ids: number[] = [];
    steps.forEach((id, i) => {
      ids.push(
        window.setTimeout(
          () => {
            const item = id ? BY_ID.get(id) : undefined;
            if (item) highlight(item);
            if (i === steps.length - 1) setToured(true);
          },
          700 + i * 650,
        ),
      );
    });
    return () => {
      for (const t of ids) window.clearTimeout(t);
    };
  }, [inView, touched, toured, highlight]);

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    loaded.current.clear();
    setPending([]);
    setQuery("");
    setHighlighted(FIRST);
    setSaid({ kind: "preview", item: BY_ID.get(FIRST) ?? null });
    setRun((n) => n + 1);
  };

  const palette = (
    <PreviewPalette
      key={run}
      query={query}
      onQueryChange={setQuery}
      highlighted={highlighted}
      onHighlight={highlight}
      onSelect={(item) => setSaid({ kind: "open", item })}
      onOpenBeside={(item) => setSaid({ kind: "beside", item })}
      onCreate={(q) => setSaid({ kind: "create", query: q })}
      pendingIds={pending}
      {...values}
    />
  );

  const line =
    said.kind === "preview"
      ? said.item
        ? `previewing ${said.item.title}`
        : `create page “${query.trim()}”`
      : said.kind === "open"
        ? `opened ${said.item.title}`
        : said.kind === "beside"
          ? `opened ${said.item.title} beside`
          : `created page “${said.query}”`;
  const kind =
    said.kind === "create" || (said.kind === "preview" && !said.item)
      ? "draft"
      : (said.item?.kind ?? "page");

  return (
    <div
      ref={wrapRef}
      onPointerDownCapture={() => setTouched(true)}
      onKeyDownCapture={() => setTouched(true)}
      className="flex w-full max-w-[46rem] flex-col gap-4"
    >
      {palette}
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
            <span className="text-signal">{line}</span>
            {` · ${kind}`}
          </p>
        </>
      ) : null}
    </div>
  );
}
