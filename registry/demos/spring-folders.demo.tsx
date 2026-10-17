"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSpringDocs,
  defaultSpringFolders,
  SpringFolders,
  type SpringFolder,
  type SpringFoldersHandle,
} from "@/registry/ui/spring-folders";

export const tweaks = defineTweaks({
  springDelay: {
    kind: "range",
    label: "Spring",
    default: 700,
    min: 300,
    max: 1200,
    step: 100,
    unit: "ms",
  },
  ringStyle: {
    kind: "choice",
    label: "Ring",
    default: "circle",
    options: ["circle", "outline", "fill"],
    names: { circle: "Circle", outline: "Outline", fill: "Fill" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const HINT_AFTER_MS = 1000;

const nameOf = (list: SpringFolder[], id: string): string | null => {
  for (const f of list) {
    if (f.id === id) return f.name;
    const inner = f.children ? nameOf(f.children, id) : null;
    if (inner) return inner;
  }
  return null;
};

/**
 * The Basinworks contract archive with five unfiled documents. Signed
 * takes PDFs only, Templates only Word documents, and Archive 2024 is
 * read-only. The gallery card shows the gesture once by itself: the MSA
 * glides over Harbour Freight, the ring closes and it springs open.
 */
export function SpringFoldersDemo({
  chrome = true,
  // The archive is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const api = React.useRef<SpringFoldersHandle | null>(null);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);
  const [run, setRun] = React.useState(0);
  const [left, setLeft] = React.useState(defaultSpringDocs.length);
  const [note, setNote] = React.useState<string | null>(null);

  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && !once.current) {
        timer = window.setTimeout(() => {
          once.current = true;
          api.current?.hint("msa", "harbour");
        }, HINT_AFTER_MS);
      }
    });
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [chrome]);

  // The ring only shows mid-gesture, so a new ring or delay plays one.
  const feel = `${values.ringStyle ?? "circle"}:${values.springDelay ?? 700}`;
  const shownFeel = React.useRef(feel);
  React.useEffect(() => {
    if (shownFeel.current === feel) return;
    shownFeel.current = feel;
    const t = window.setTimeout(() => api.current?.hint(), 250);
    return () => window.clearTimeout(t);
  }, [feel]);

  const frame = (
    <SpringFolders
      key={run}
      ref={api}
      onDrop={(ids, folderId) => {
        setLeft((n) => n - ids.length);
        setNote(
          `filed ${ids.length} in ${nameOf(defaultSpringFolders, folderId) ?? "a new folder"}`,
        );
      }}
      onOpen={(id, via) => {
        if (via === "spring")
          setNote(
            `${nameOf(defaultSpringFolders, id) ?? "folder"} sprang open`,
          );
      }}
      onCreateFolder={() => setNote("new folder")}
      frameHeight={520}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full max-w-2xl">
        {frame}
      </div>
    );
  }

  return (
    <div ref={ref} className="flex w-full max-w-2xl flex-col gap-4">
      {frame}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRun((r) => r + 1);
            setLeft(defaultSpringDocs.length);
            setNote(null);
          }}
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
        <span className="text-signal">{`${left} unfiled`}</span>
        {note ? ` · ${note}` : " · drag a card onto a folder, or press m"}
      </p>
    </div>
  );
}
