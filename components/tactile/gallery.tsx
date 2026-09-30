"use client";

import * as React from "react";

import { Search } from "lucide-react";
import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";

import { TACTILE_VERBS, type TactileVerb } from "@/content/tactile";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import {
  decodeTweaks,
  defaultsOf,
  encodeTweaks,
  type TweakSchema,
} from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";

import { useSoundPref } from "./sound-pref";
import { SoundSwitch } from "./sound-switch";
import { StageDialog } from "./stage-dialog";
import { TactileCard, type TactileItem } from "./tactile-card";
import { Segmented } from "./tweak-controls";
import type { TweakState } from "./tweak-panel";
import { useTactileModule } from "./use-tactile-module";
import { VerbGlyph } from "./verb-glyph";

type VerbFilter = "all" | TactileVerb;
type Sort = "newest" | "az";

const isVerb = (value: string | null): value is TactileVerb =>
  TACTILE_VERBS.some((v) => v.slug === value);

/** Builds the page URL for a state, keeping only what differs from the default. */
function urlFor(state: {
  verb: VerbFilter;
  sort: Sort;
  open: string | null;
  tweaks: string;
}): string {
  const params = new URLSearchParams();
  if (state.verb !== "all") params.set("verb", state.verb);
  if (state.sort !== "newest") params.set("sort", state.sort);
  if (state.open) params.set("b", state.open);
  if (state.open && state.tweaks) params.set("t", state.tweaks);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}

/**
 * The Tactile gallery: every component live in its card, filtered by the verb
 * it answers to, and opened on the stage for tweaking. The filter, the sort,
 * the open component and its tweaks all live in the URL, so any view can be
 * shared and the back button closes the stage.
 */
export function TactileGallery({ items }: { items: TactileItem[] }) {
  const motionSafe = useMotionSafe();
  const searchParams = useSearchParams();
  const [sound, setSound] = useSoundPref();

  const [verb, setVerb] = React.useState<VerbFilter>(() => {
    const v = searchParams.get("verb");
    return isVerb(v) ? v : "all";
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
    const byVerb = new Map<TactileVerb, number>();
    for (const item of items) {
      byVerb.set(item.verb, (byVerb.get(item.verb) ?? 0) + 1);
    }
    return byVerb;
  }, [items]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = items.filter(
      (item) =>
        (verb === "all" || item.verb === verb) &&
        (needle === "" ||
          `${item.title} ${item.tagline} ${item.verbLabel} ${item.name}`
            .toLowerCase()
            .includes(needle)),
    );
    return sort === "az"
      ? [...list].sort((a, b) => a.title.localeCompare(b.title))
      : [...list].sort((a, b) =>
          b.serial.localeCompare(a.serial, undefined, { numeric: true }),
        );
  }, [items, query, sort, verb]);

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
    const url = urlFor({
      verb,
      sort,
      open: open?.slug ?? null,
      tweaks: encoded,
    });
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [verb, sort, open?.slug, encoded]);

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

  const openItem = (item: TactileItem, origin: HTMLElement) => {
    window.history.pushState(
      { ...window.history.state, tactile: item.name },
      "",
      urlFor({ verb, sort, open: item.name, tweaks: "" }),
    );
    setOpen({ slug: item.name, origin, pushed: true });
  };

  const requestClose = () => {
    if (open?.pushed && window.history.state?.tactile) {
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

  const chips: { slug: VerbFilter; label: string; count: number }[] = [
    { slug: "all", label: "All", count: items.length },
    ...TACTILE_VERBS.filter((v) => (counts.get(v.slug) ?? 0) > 0).map((v) => ({
      slug: v.slug as VerbFilter,
      label: v.label,
      count: counts.get(v.slug) ?? 0,
    })),
  ];
  const chipRefs = React.useRef(new Map<VerbFilter, HTMLButtonElement>());

  const onChipKey = (event: React.KeyboardEvent, index: number) => {
    const delta =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = chips[(index + delta + chips.length) % chips.length];
    if (!next) return;
    setVerb(next.slug);
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
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center">
          <div
            role="radiogroup"
            aria-label="Filter by what you do"
            className="-mx-1 flex min-w-0 flex-1 [scrollbar-width:none] gap-1 overflow-x-auto px-1 py-0.5"
          >
            {chips.map((chip, index) => {
              const active = chip.slug === verb;
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
                  onClick={() => setVerb(chip.slug)}
                  onKeyDown={(event) => onChipKey(event, index)}
                  className={cn(
                    "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="tactile-verb-chip"
                      aria-hidden
                      className="absolute inset-0 rounded-full border border-hairline-strong bg-surface-2"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  {chip.slug !== "all" ? (
                    <VerbGlyph
                      verb={chip.slug}
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
            <label className="relative flex h-9 min-w-0 flex-1 items-center lg:w-52 lg:flex-none">
              <span className="sr-only">Search Tactile</span>
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="h-9 w-full rounded-2 border border-hairline bg-surface-1 pr-2 pl-8 text-xs text-foreground outline-none placeholder:text-ink-3 focus-visible:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
            <div className="w-36 shrink-0">
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
            {filtered.map((item) => (
              <TactileCard
                key={item.name}
                item={item}
                sound={sound}
                onOpen={openItem}
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
                  setVerb("all");
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
              : `${window.location.origin}/tactile?b=${shownItem.name}${encoded ? `&t=${encoded}` : ""}`
          }
          onNavigate={navigate}
          onRequestClose={requestClose}
          onExited={() => setShown(null)}
        />
      ) : null}
    </div>
  );
}
