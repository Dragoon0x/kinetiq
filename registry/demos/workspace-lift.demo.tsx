"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultLiftWorkspaces,
  WorkspaceLift,
  type LiftWorkspace,
} from "@/registry/ui/workspace-lift";

export const tweaks = defineTweaks({
  liftDirection: {
    kind: "choice",
    label: "Lift",
    default: "auto",
    options: ["auto", "up", "down"],
    names: { auto: "By strip", up: "Rise", down: "Drop" },
  },
  stripWidth: {
    kind: "range",
    label: "Strip",
    default: 56,
    min: 48,
    max: 72,
    step: 4,
    unit: "px",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const FIRST = defaultLiftWorkspaces[0]?.id ?? "";
const SECOND = defaultLiftWorkspaces[1]?.id ?? FIRST;
const LOAD_MS = 900;

/**
 * Four invented workspaces: Coldbrook support, Basinworks finance (its
 * first visit loads, so the car arrives as a skeleton and fills in),
 * Fernworks design and Waylight, which this person cannot open. The gallery
 * card rides once from Coldbrook down to Basinworks when it is seen; reading
 * a page clears its unread count.
 */
export function WorkspaceLiftDemo({
  chrome = true,
  // The frame is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [workspace, setWorkspace] = React.useState(FIRST);
  const [loaded, setLoaded] = React.useState(false);
  const [read, setRead] = React.useState<Record<string, boolean>>({});
  const [page, setPage] = React.useState<Record<string, string>>({});
  const [note, setNote] = React.useState<string | null>(null);
  const [lastDir, setLastDir] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);
  const timers = React.useRef<number[]>([]);
  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  const go = (id: string) => {
    const from = defaultLiftWorkspaces.findIndex((w) => w.id === workspace);
    const to = defaultLiftWorkspaces.findIndex((w) => w.id === id);
    const lift = values.liftDirection ?? "auto";
    setLastDir(
      lift === "up" || (lift === "auto" && to > from)
        ? "from below"
        : "from above",
    );
    setWorkspace(id);
    if (id === SECOND && !loaded) {
      timers.current.push(window.setTimeout(() => setLoaded(true), LOAD_MS));
    }
  };
  // Timers and the observer call the latest `go`, never one from an older render.
  const goRef = React.useRef(go);
  React.useEffect(() => {
    goRef.current = go;
  });

  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && !once.current) {
        timer = window.setTimeout(() => {
          once.current = true;
          goRef.current(SECOND);
        }, 1000);
      }
    });
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [chrome]);

  // Data the host owns: Basinworks loads on its first visit, and a page
  // that has been read has no unread count left.
  const workspaces = React.useMemo<LiftWorkspace[]>(
    () =>
      defaultLiftWorkspaces.map((w) => ({
        ...w,
        status: w.id === SECOND && !loaded ? "loading" : w.status,
        nav: w.nav.map((g) => ({
          ...g,
          items: g.items.map((it) =>
            read[`${w.id}/${it.id}`] ? { ...it, unread: 0 } : it,
          ),
        })),
      })),
    [loaded, read],
  );

  const frame = (
    <WorkspaceLift
      workspaces={workspaces}
      workspace={workspace}
      onSwitchWorkspace={(id) => {
        setNote(null);
        go(id);
      }}
      onNavigate={(wsId, pageId) => {
        setPage((p) => ({ ...p, [wsId]: pageId }));
        setRead((r) => ({ ...r, [`${wsId}/${pageId}`]: true }));
      }}
      onAddWorkspace={() => setNote("add workspace")}
      onRequestAccess={() => setNote("access requested")}
      frameHeight={chrome ? 500 : 520}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full max-w-3xl">
        {frame}
      </div>
    );
  }

  const ws = workspaces.find((w) => w.id === workspace);
  const items = ws ? ws.nav.flatMap((g) => g.items) : [];
  const current =
    items.find((it) => it.id === page[workspace]) ?? items[0] ?? null;
  const unread = items.reduce((s, it) => s + (it.unread ?? 0), 0);

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {frame}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current = [];
            setLoaded(false);
            setRead({});
            setPage({});
            setNote(null);
            setLastDir(null);
            setWorkspace(FIRST);
            timers.current.push(
              window.setTimeout(() => goRef.current(SECOND), 650),
            );
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {`${ws?.name ?? ""} · ${ws?.status === "locked" ? "no access" : ws?.status === "loading" ? "loading" : (current?.label ?? "")}`}
        </span>
        {` · ${unread} unread${lastDir ? ` · arrived ${lastDir}` : ""}${note ? ` · ${note}` : ""}`}
      </p>
    </div>
  );
}
