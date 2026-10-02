"use client";

import * as React from "react";

import { Search } from "lucide-react";
import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import {
  decodeTweaks,
  defaultsOf,
  encodeTweaks,
  type TweakSchema,
} from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";

import { fillGrid, useGridColumns } from "./grid-fill";
import { GroupGlyph } from "./group-glyph";
import { RoomProvider, type Room } from "./room";
import { useSoundPref } from "./sound-pref";
import { SoundSwitch } from "./sound-switch";
import { StageDialog } from "./stage-dialog";
import { TactileCard, type TactileItem } from "./tactile-card";
import { Segmented } from "./tweak-controls";
import type { TweakState } from "./tweak-panel";
import { useTactileModule } from "./use-tactile-module";

type Sort = "newest" | "az";

/** Builds the page URL for a state, keeping only what differs from the default. */
function urlFor(
  param: string,
  state: {
    group: string;
    sort: Sort;
    open: string | null;
    tweaks: string;
  },
): string {
  const params = new URLSearchParams();
  if (state.group !== "all") params.set(param, state.group);
  if (state.sort !== "newest") params.set("sort", state.sort);
  if (state.open) params.set("b", state.open);
  if (state.open && state.tweaks) params.set("t", state.tweaks);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}

/**
 * A room's gallery: every piece live in its card, filtered by its group (a
 * verb on Tactile, a set on Atelier), and opened on the stage for tweaking.
 * The filter, the sort, the open piece and its tweaks all live in the URL, so
 * any view can be shared and the back button closes the stage.
 */
export function RoomGallery({
  room,
  items,
}: {
  room: Room;
  items: TactileItem[];
}) {
  return (
    <RoomProvider room={room}>
      <Gallery room={room} items={items} />
    </RoomProvider>
  );
}

/**
 * Which ends of a scrolling row hide more of it — measured from the row
 * itself (its size, its chips' sizes once the fonts land, its scroll), not
 * guessed from a breakpoint.
 */
function useScrollEdges(ref: React.RefObject<HTMLElement | null>) {
  const [edges, setEdges] = React.useState({ start: false, end: false });
  React.useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const measure = () => {
      const start = row.scrollLeft > 1;
      const end = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
      setEdges((was) =>
        was.start === start && was.end === end ? was : { start, end },
      );
    };
    // A ResizeObserver reports every box once as it starts watching, so
    // this also takes the first measure.
    const sizes = new ResizeObserver(measure);
    sizes.observe(row);
    for (const chip of Array.from(row.children)) sizes.observe(chip);
    row.addEventListener("scroll", measure, { passive: true });
    return () => {
      sizes.disconnect();
      row.removeEventListener("scroll", measure);
    };
  }, [ref]);
  return edges;
}

/** A 2rem fade at each end of a row that has more beyond it. */
function edgeFade({ start, end }: { start: boolean; end: boolean }) {
  if (!start && !end) return undefined;
  const from = start ? "transparent, black 2rem" : "black";
  const to = end ? "black calc(100% - 2rem), transparent" : "black";
  return `linear-gradient(to right, ${from}, ${to})`;
}

function Gallery({ room, items }: { room: Room; items: TactileItem[] }) {
  const motionSafe = useMotionSafe();
  const searchParams = useSearchParams();
  const [sound, setSound] = useSoundPref();

  const [group, setGroup] = React.useState<string>(() => {
    const g = searchParams.get(room.param);
    return g && room.groups.some((r) => r.slug === g) ? g : "all";
  });
  const [sort, setSort] = React.useState<Sort>(() =>
    searchParams.get("sort") === "az" ? "az" : "newest",
  );
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<{
    slug: string;
    origin: HTMLElement | null;
    pushed: boolean;
  } | null>(() => {
    const b = searchParams.get("b");
    return b && items.some((i) => i.name === b)
      ? { slug: b, origin: null, pushed: false }
      : null;
  });
  // The stage keeps showing its component while it plays its way out.
  const [shown, setShown] = React.useState<string | null>(open?.slug ?? null);
  if (open && shown !== open.slug) setShown(open.slug);
  const [overrides, setOverrides] = React.useState<Record<string, TweakState>>(
    {},
  );
  // A deep link's tweaks can only be read once that component's schema is in.
  const [pendingTweaks, setPendingTweaks] = React.useState<{
    slug: string;
    raw: string;
  } | null>(() => {
    const b = searchParams.get("b");
    const t = searchParams.get("t");
    return b && t ? { slug: b, raw: t } : null;
  });

  const openModule = useTactileModule(shown ?? "", shown !== null);
  const schema: TweakSchema = openModule?.tweaks ?? {};
  if (pendingTweaks && openModule && shown === pendingTweaks.slug) {
    setOverrides((prev) => ({
      ...prev,
      [pendingTweaks.slug]: decodeTweaks(
        schema,
        pendingTweaks.raw,
      ) as TweakState,
    }));
    setPendingTweaks(null);
  }

  const counts = React.useMemo(() => {
    const byGroup = new Map<string, number>();
    for (const item of items) {
      byGroup.set(item.group, (byGroup.get(item.group) ?? 0) + 1);
    }
    return byGroup;
  }, [items]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = items.filter(
      (item) =>
        (group === "all" || item.group === group) &&
        (needle === "" ||
          `${item.title} ${item.tagline} ${item.groupLabel} ${item.name}`
            .toLowerCase()
            .includes(needle)),
    );
    return sort === "az"
      ? [...list].sort((a, b) => a.title.localeCompare(b.title))
      : [...list].sort((a, b) =>
          b.serial.localeCompare(a.serial, undefined, { numeric: true }),
        );
  }, [items, query, sort, group]);

  // Grow a few cards so the filtered wall has no empty cells at this width.
  const columns = useGridColumns();
  const fills = React.useMemo(
    () =>
      fillGrid(
        filtered.map((item) => item.aspect),
        columns,
      ),
    [filtered, columns],
  );

  const shownItem = items.find((i) => i.name === shown) ?? null;
  const values: TweakState = {
    ...(defaultsOf(schema) as TweakState),
    ...(shown ? overrides[shown] : undefined),
  };
  const encoded = shown
    ? encodeTweaks(schema, (overrides[shown] ?? {}) as never)
    : "";

  // Keep the address bar in step with the view, without adding history —
  // only opening the stage does that, so Back closes it.
  React.useEffect(() => {
    const url = urlFor(room.param, {
      group,
      sort,
      open: open?.slug ?? null,
      tweaks: encoded,
    });
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [room.param, group, sort, open?.slug, encoded]);

  React.useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const b = params.get("b");
      if (b && items.some((i) => i.name === b)) {
        setOpen((current) =>
          current?.slug === b
            ? current
            : { slug: b, origin: null, pushed: false },
        );
      } else {
        setOpen(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [items]);

  // Stable, so the memoised cards never re-render just because the gallery
  // did; it reads the current filter from a ref at the moment it is used.
  const view = React.useRef({ group, sort });
  React.useEffect(() => {
    view.current = { group, sort };
  });
  const openItem = React.useCallback(
    (item: TactileItem, origin: HTMLElement) => {
      window.history.pushState(
        { ...window.history.state, [room.id]: item.name },
        "",
        urlFor(room.param, { ...view.current, open: item.name, tweaks: "" }),
      );
      setOpen({ slug: item.name, origin, pushed: true });
    },
    [room.id, room.param],
  );

  const requestClose = () => {
    if (open?.pushed && window.history.state?.[room.id]) {
      window.history.back();
    } else {
      setOpen(null);
    }
  };

  const navigate = (delta: number) => {
    if (!shown || filtered.length === 0) return;
    const at = filtered.findIndex((i) => i.name === shown);
    const next = filtered[(at + delta + filtered.length) % filtered.length];
    if (!next || next.name === shown) return;
    setOpen((current) => (current ? { ...current, slug: next.name } : current));
  };

  const chips: { slug: string; label: string; count: number }[] = [
    { slug: "all", label: "All", count: items.length },
    ...room.groups
      .filter((g) => (counts.get(g.slug) ?? 0) > 0)
      .map((g) => ({
        slug: g.slug,
        label: g.label,
        count: counts.get(g.slug) ?? 0,
      })),
  ];
  const chipRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const chipRow = React.useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(chipRow);
  const fade = edgeFade(edges);

  // A chip chosen off the end of a scrolling row (a deep link, a narrow
  // window) slides into view, so the wall never filters by a hidden chip.
  React.useEffect(() => {
    const row = chipRow.current;
    const chip = chipRefs.current.get(group);
    if (!row || !chip) return;
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const by =
      c.left < r.left + 32
        ? c.left - r.left - 32
        : c.right > r.right - 32
          ? c.right - r.right + 32
          : 0;
    if (by !== 0) {
      row.scrollBy({ left: by, behavior: motionSafe ? "smooth" : "auto" });
    }
  }, [group, motionSafe]);

  const onChipKey = (event: React.KeyboardEvent, index: number) => {
    const delta =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = chips[(index + delta + chips.length) % chips.length];
    if (!next) return;
    setGroup(next.slug);
    chipRefs.current.get(next.slug)?.focus();
  };

  const position = {
    index: Math.max(
      0,
      filtered.findIndex((i) => i.name === shown),
    ),
    count: filtered.length,
  };

  return (
    <div>
      <div className="sticky top-14 z-30 border-y border-hairline bg-surface-0/85 backdrop-blur-md">
        {/* One row from xl, where ten short groups, search, sort and sound
            fit side by side; below it — and always, for a room whose group
            names run long — the groups get a full-width row of their own.
            Wherever the row still scrolls, it fades at the end that hides
            more chips. */}
        <div
          className={cn(
            "mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6",
            !room.chipsOwnRow && "xl:flex-row xl:items-center",
          )}
        >
          <div
            ref={chipRow}
            role="radiogroup"
            aria-label={room.filterLabel}
            className="-mx-1 flex min-w-0 flex-1 [scrollbar-width:none] gap-0.5 overflow-x-auto px-1 py-0.5"
            style={
              fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined
            }
          >
            {chips.map((chip, index) => {
              const active = chip.slug === group;
              return (
                <button
                  key={chip.slug}
                  ref={(node) => {
                    if (node) chipRefs.current.set(chip.slug, node);
                    else chipRefs.current.delete(chip.slug);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${chip.label}, ${chip.count} ${chip.count === 1 ? "component" : "components"}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setGroup(chip.slug)}
                  onKeyDown={(event) => onChipKey(event, index)}
                  className={cn(
                    "relative inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    active ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId={`${room.id}-group-chip`}
                      aria-hidden
                      className="absolute inset-0 rounded-full border border-hairline-strong bg-surface-2"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  {chip.slug !== "all" ? (
                    <GroupGlyph
                      group={chip.slug}
                      className="relative size-3.5 shrink-0"
                    />
                  ) : null}
                  <span className="relative">{chip.label}</span>
                  <span
                    aria-hidden
                    className="relative font-mono text-[10px] text-ink-3 tabular-nums"
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <label
              className={cn(
                "relative flex h-9 min-w-0 flex-1 items-center lg:max-w-sm",
                !room.chipsOwnRow && "xl:w-40 xl:flex-none",
              )}
            >
              <span className="sr-only">{`Search ${room.name}`}</span>
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="h-9 w-full rounded-2 border border-hairline bg-surface-1 pr-2 pl-8 text-xs text-foreground outline-none placeholder:text-ink-3 focus-visible:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              />
            </label>
            <div className="shrink-0 lg:ml-auto">
              <Segmented
                label="Sort"
                options={[
                  { value: "newest", label: "New" },
                  { value: "az", label: "A–Z" },
                ]}
                value={sort}
                onChange={(next) => setSort(next as Sort)}
              />
            </div>
            <SoundSwitch on={sound} onChange={setSound} />
          </div>
        </div>
      </div>

      <p role="status" className="sr-only">
        {`${filtered.length} ${filtered.length === 1 ? "component" : "components"} shown.`}
      </p>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        {filtered.length > 0 ? (
          <div className="grid [grid-auto-flow:dense] auto-rows-[340px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((item, index) => (
              <TactileCard
                key={item.name}
                item={item}
                sound={sound}
                onOpen={openItem}
                fillCols={fills[index]?.[0]}
                fillRows={fills[index]?.[1]}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-4 border border-dashed border-hairline-strong px-6 py-16 text-center">
            <p className="text-sm text-foreground">
              {items.length === 0
                ? "The first pieces are still on the bench."
                : "Nothing answers to that."}
            </p>
            {items.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setGroup("all");
                }}
                className="text-xs text-cobalt-bright hover:text-foreground"
              >
                Show everything
              </button>
            ) : null}
          </div>
        )}
      </div>

      {shownItem ? (
        <StageDialog
          key="stage"
          item={shownItem}
          closing={open === null}
          origin={open?.origin ?? null}
          position={position}
          sound={sound}
          onSound={setSound}
          values={values}
          onTweak={(key, value) =>
            setOverrides((prev) => ({
              ...prev,
              [shownItem.name]: { ...prev[shownItem.name], [key]: value },
            }))
          }
          onReset={() =>
            setOverrides((prev) => ({ ...prev, [shownItem.name]: {} }))
          }
          shareUrl={
            typeof window === "undefined"
              ? ""
              : `${window.location.origin}${room.path}?b=${shownItem.name}${encoded ? `&t=${encoded}` : ""}`
          }
          onNavigate={navigate}
          onRequestClose={requestClose}
          onExited={() => setShown(null)}
        />
      ) : null}
    </div>
  );
}
