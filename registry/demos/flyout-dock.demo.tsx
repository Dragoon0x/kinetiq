"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { defaultFlyoutSections, FlyoutDock } from "@/registry/ui/flyout-dock";

export const tweaks = defineTweaks({
  flyoutWidth: {
    kind: "range",
    label: "Flyout",
    default: 208,
    min: 168,
    max: 248,
    step: 8,
    unit: "px",
  },
  intentDelay: {
    kind: "range",
    label: "Intent",
    default: 140,
    min: 0,
    max: 400,
    step: 20,
    unit: "ms",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const PIN_AFTER_MS = 1100;
const UNPIN_AFTER_MS = 2400;

/**
 * Coldbrook's café admin: Menu, Stores and Staff, an empty Suppliers section
 * and Reports still loading. The Menu flyout is out beside the Drinks page;
 * once the gallery card has been seen it pins the flyout, so the column
 * docks and the page makes room, then floats it again.
 */
export function FlyoutDockDemo({
  chrome = true,
  // The frame is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [page, setPage] = React.useState("drinks");
  const [open, setOpen] = React.useState<string | null>("menu");
  const [pinned, setPinned] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);

  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && !once.current) {
        timer = window.setTimeout(() => {
          once.current = true;
          setOpen((o) => o ?? "menu");
          setPinned(true);
          // Hold the docked column, then float it again: the card rests on
          // the flyout, whose width is the tweak.
          timer = window.setTimeout(() => setPinned(false), UNPIN_AFTER_MS);
        }, PIN_AFTER_MS);
      }
    });
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [chrome]);

  const frame = (
    <FlyoutDock
      page={page}
      onNavigate={(id) => {
        setPage(id);
        const label = defaultFlyoutSections
          .flatMap((s) => s.pages)
          .find((p) => p.id === id)?.label;
        setNote(label ? `opened ${label}` : null);
      }}
      open={open}
      onOpenChange={setOpen}
      pinned={pinned}
      onPin={(id) => {
        setPinned(true);
        setNote(`pinned ${id}`);
      }}
      onUnpin={() => {
        setPinned(false);
        setNote("unpinned");
      }}
      onRetry={() => setNote("retry")}
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

  const openLabel =
    defaultFlyoutSections.find((s) => s.id === open)?.label ?? "Closed";
  const pageLabel =
    defaultFlyoutSections.flatMap((s) => s.pages).find((p) => p.id === page)
      ?.label ?? "";

  return (
    <div ref={ref} className="flex w-full max-w-2xl flex-col gap-4">
      {frame}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setPage("drinks");
            setOpen("menu");
            setPinned(false);
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
        <span className="text-signal">
          {`${openLabel} · ${pageLabel} · ${pinned ? "pinned" : "flyout"}`}
        </span>
        {note ? ` · last: ${note}` : ""}
      </p>
    </div>
  );
}
