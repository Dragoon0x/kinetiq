"use client";

import * as React from "react";

import { Check, ChevronLeft, ChevronsUpDown, Plus, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RailItem = {
  id: string;
  label: string;
  /** Small trailing detail — a count, a state. */
  hint?: string;
};

export type RailQuota = {
  used: number;
  limit: number;
  label: string;
};

export type RailWorkspace = {
  id: string;
  label: string;
  /** Small trailing detail — printed in mono beside the active label. */
  hint?: string;
};

export type WorkbenchRailProps = {
  /** The workspace named at the head. */
  workspace?: string;
  primary?: RailItem[];
  /** The running conversations, under their own heading. */
  threads?: RailItem[];
  threadsHeading?: string;
  activeId?: string;
  onSelect?: (id: string) => void;
  newLabel?: string;
  onNew?: () => void;
  /** The honest seat meter, e.g. 3 of 10 invites used. */
  quota?: RailQuota;
  /** The footer action. */
  footerLabel?: string;
  onFooter?: () => void;
  defaultCollapsed?: boolean;
  /**
   * Renders a filter field above the primary items that narrows both the
   * primary items and the threads by a case-insensitive label match.
   */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** When given, the workspace label becomes a switcher among these entries. */
  workspaces?: RailWorkspace[];
  /** Controlled current workspace id; defaults to the first entry. */
  workspaceId?: string;
  onWorkspaceChange?: (id: string) => void;
  className?: string;
};

const DEFAULT_PRIMARY: RailItem[] = [
  { id: "home", label: "Home" },
  { id: "boards", label: "Boards", hint: "4" },
  { id: "exports", label: "Exports" },
];

const DEFAULT_THREADS: RailItem[] = [
  { id: "t1", label: "Crane 2 hold, this morning" },
  { id: "t2", label: "Reorder list for the stores" },
  { id: "t3", label: "Crew B rest window" },
  { id: "t4", label: "Draft the handover note" },
];

/**
 * The workspace rail: primary destinations, then the running conversations,
 * with one gliding highlight that travels to whatever the pointer is over —
 * a single shared element, so the hover reads as one light moving rather
 * than many lighting up. The invite quota is a printed fraction, not a
 * paywall surprise, and the whole rail folds to a spine when the work needs
 * the width back.
 *
 * Selection is carried by state and an aria-current mark; the travelling
 * highlight is hover only. Reduced motion: the highlight appears in place
 * and the fold swaps instantly. Under reduced motion, search filtering also
 * swaps instantly instead of tweening and the workspace label skips its slide.
 */
export function WorkbenchRail({
  workspace = "North Basin Ops",
  primary = DEFAULT_PRIMARY,
  threads = DEFAULT_THREADS,
  threadsHeading = "Chats",
  activeId: activeProp,
  onSelect,
  newLabel = "New chat",
  onNew,
  quota = { used: 3, limit: 10, label: "invites used" },
  footerLabel = "Upgrade",
  onFooter,
  defaultCollapsed = false,
  searchable = false,
  searchPlaceholder = "Filter",
  workspaces,
  workspaceId: workspaceIdProp,
  onWorkspaceChange,
  className,
}: WorkbenchRailProps) {
  const motionSafe = useMotionSafe();
  const highlightId = React.useId();
  const switcherMenuId = React.useId();
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const [ownActive, setOwnActive] = React.useState(
    activeProp ?? primary[0]?.id ?? "",
  );
  const active = activeProp ?? ownActive;
  const [hovered, setHovered] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);

  const [ownWorkspaceId, setOwnWorkspaceId] = React.useState(
    workspaceIdProp ?? workspaces?.[0]?.id ?? "",
  );
  const currentWorkspaceId = workspaceIdProp ?? ownWorkspaceId;
  const currentWorkspace =
    workspaces?.find((item) => item.id === currentWorkspaceId) ??
    workspaces?.[0];
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const [switcherActive, setSwitcherActive] = React.useState(0);
  const switcherRef = React.useRef<HTMLDivElement>(null);
  const switcherTriggerRef = React.useRef<HTMLButtonElement>(null);
  const switcherItemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const pick = (id: string) => {
    if (activeProp === undefined) setOwnActive(id);
    onSelect?.(id);
  };

  const pickWorkspace = (id: string) => {
    if (workspaceIdProp === undefined) setOwnWorkspaceId(id);
    onWorkspaceChange?.(id);
  };

  const trimmedQuery = query.trim().toLowerCase();
  const filteredPrimary = trimmedQuery
    ? primary.filter((item) => item.label.toLowerCase().includes(trimmedQuery))
    : primary;
  const filteredThreads = trimmedQuery
    ? threads.filter((item) => item.label.toLowerCase().includes(trimmedQuery))
    : threads;
  const noMatches =
    trimmedQuery.length > 0 &&
    filteredPrimary.length === 0 &&
    filteredThreads.length === 0;

  const expandForSearch = () => {
    setCollapsed(false);
    // The field doesn't exist until the fold-open commits, so wait a frame.
    window.requestAnimationFrame(() => searchRef.current?.focus());
  };

  const focusSwitcherIndex = (index: number) => {
    setSwitcherActive(index);
    switcherItemRefs.current[index]?.focus();
  };

  const onSwitcherKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const list = workspaces ?? [];
    if (list.length === 0) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusSwitcherIndex((switcherActive + 1) % list.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusSwitcherIndex((switcherActive - 1 + list.length) % list.length);
        break;
      case "Enter": {
        event.preventDefault();
        const target = list[switcherActive];
        if (target) {
          pickWorkspace(target.id);
          setSwitcherOpen(false);
          switcherTriggerRef.current?.focus();
        }
        break;
      }
      case "Escape":
        event.preventDefault();
        setSwitcherOpen(false);
        switcherTriggerRef.current?.focus();
        break;
      case "Tab":
        setSwitcherOpen(false);
        break;
      default:
        break;
    }
  };

  // Outside-click dismissal while the switcher is open.
  React.useEffect(() => {
    if (!switcherOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!switcherRef.current?.contains(event.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [switcherOpen]);

  // On open, aim focus at the current workspace's row once the panel has
  // committed. The state write lives in the rAF callback, not the effect
  // body, so it never cascades synchronously through the render.
  React.useEffect(() => {
    if (!switcherOpen || !workspaces) return;
    const index = workspaces.findIndex(
      (item) => item.id === currentWorkspaceId,
    );
    const target = index === -1 ? 0 : index;
    const frame = window.requestAnimationFrame(() => {
      setSwitcherActive(target);
      switcherItemRefs.current[target]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [switcherOpen, workspaces, currentWorkspaceId]);

  const renderItem = (item: RailItem) => {
    const current = item.id === active;
    return (
      <motion.li
        key={item.id}
        layout={motionSafe}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{
          opacity: 0,
          transition: { duration: motionSafe ? durations.fast : 0 },
        }}
        transition={
          motionSafe
            ? { ...springs.glide, opacity: { duration: durations.fast } }
            : { duration: 0 }
        }
        className="relative"
      >
        {hovered === item.id && (
          <motion.span
            layoutId={motionSafe ? highlightId : undefined}
            aria-hidden
            className="absolute inset-0 rounded-2 bg-surface-2"
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        )}
        <button
          type="button"
          aria-current={current ? "true" : undefined}
          onClick={() => pick(item.id)}
          onMouseEnter={() => setHovered(item.id)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(item.id)}
          onBlur={() => setHovered(null)}
          className={cn(
            "relative z-10 flex w-full min-w-0 items-baseline gap-2 rounded-2 px-2.5 py-1.5 text-left text-sm transition-colors",
            current ? "font-medium text-ink" : "text-ink-2",
          )}
        >
          {current && (
            <span
              aria-hidden
              className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
            />
          )}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.hint && (
            <span className="shrink-0 font-mono text-[10px] text-ink-3">
              {item.hint}
            </span>
          )}
        </button>
      </motion.li>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-4 border border-hairline bg-surface-1",
        collapsed ? "w-12 items-center py-3" : "w-60 p-3",
        className,
      )}
    >
      {collapsed ? (
        <>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand the rail"
            aria-expanded={false}
            className="rounded-2 p-1.5 text-ink-3 transition-colors hover:text-ink"
          >
            <ChevronLeft aria-hidden className="size-4 rotate-180" />
          </button>
          {searchable && (
            <button
              type="button"
              onClick={expandForSearch}
              aria-label={searchPlaceholder}
              className="mt-2 rounded-2 p-1.5 text-ink-3 transition-colors hover:text-ink"
            >
              <Search aria-hidden className="size-4" />
            </button>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            {workspaces && workspaces.length > 0 ? (
              <div ref={switcherRef} className="relative min-w-0 flex-1">
                <button
                  ref={switcherTriggerRef}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={switcherOpen}
                  aria-controls={switcherOpen ? switcherMenuId : undefined}
                  onClick={() => setSwitcherOpen((value) => !value)}
                  className="flex min-w-0 items-center gap-1.5 rounded-2 py-0.5 text-left transition-colors hover:text-ink"
                >
                  <span className="relative block h-5 min-w-0 flex-1 overflow-hidden">
                    <AnimatePresence initial={false}>
                      <motion.span
                        key={currentWorkspaceId}
                        initial={motionSafe ? { y: -6, opacity: 0 } : false}
                        animate={{ y: 0, opacity: 1 }}
                        exit={
                          motionSafe
                            ? {
                                y: 6,
                                opacity: 0,
                                transition: exitFor(durations.fast),
                              }
                            : { opacity: 0, transition: { duration: 0 } }
                        }
                        transition={
                          motionSafe
                            ? {
                                ...springs.snap,
                                opacity: {
                                  duration: durations.fast,
                                  ease: easings.enter,
                                },
                              }
                            : { duration: 0 }
                        }
                        className="block truncate text-sm font-semibold text-ink"
                      >
                        {currentWorkspace?.label ?? workspace}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  {currentWorkspace?.hint && (
                    <span className="shrink-0 font-mono text-[10px] text-ink-3">
                      {currentWorkspace.hint}
                    </span>
                  )}
                  <ChevronsUpDown
                    aria-hidden
                    className="size-3.5 shrink-0 text-ink-3"
                  />
                </button>

                <AnimatePresence>
                  {switcherOpen && (
                    <motion.div
                      id={switcherMenuId}
                      role="menu"
                      aria-label="Switch workspace"
                      aria-orientation="vertical"
                      tabIndex={-1}
                      onKeyDown={onSwitcherKeyDown}
                      initial={
                        motionSafe
                          ? { opacity: 0, scale: 0.96, y: -4 }
                          : { opacity: 0 }
                      }
                      animate={
                        motionSafe
                          ? {
                              opacity: 1,
                              scale: 1,
                              y: 0,
                              transition: {
                                scale: springs.snap,
                                y: springs.snap,
                                opacity: {
                                  duration: durations.fast,
                                  ease: easings.enter,
                                },
                              },
                            }
                          : {
                              opacity: 1,
                              transition: { duration: durations.fast },
                            }
                      }
                      exit={{
                        opacity: 0,
                        scale: motionSafe ? 0.97 : 1,
                        transition: exitFor(durations.fast),
                      }}
                      className="absolute top-full left-0 z-20 mt-1.5 min-w-[10rem] rounded-3 border border-hairline bg-surface-1 p-1 shadow-raised"
                    >
                      {workspaces.map((item, index) => (
                        <button
                          key={item.id}
                          ref={(node) => {
                            switcherItemRefs.current[index] = node;
                          }}
                          type="button"
                          role="menuitemradio"
                          aria-checked={item.id === currentWorkspaceId}
                          tabIndex={switcherActive === index ? 0 : -1}
                          data-active={switcherActive === index}
                          onClick={() => {
                            pickWorkspace(item.id);
                            setSwitcherOpen(false);
                            switcherTriggerRef.current?.focus();
                          }}
                          onMouseEnter={() => setSwitcherActive(index)}
                          className={cn(
                            "flex w-full items-baseline justify-between gap-2 rounded-2 px-2.5 py-1.5 text-left text-sm transition-colors",
                            "hover:bg-surface-2 focus-visible:outline-none data-[active=true]:bg-surface-2",
                            item.id === currentWorkspaceId
                              ? "text-ink"
                              : "text-ink-2",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {item.label}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {item.hint && (
                              <span className="font-mono text-[10px] text-ink-3">
                                {item.hint}
                              </span>
                            )}
                            {item.id === currentWorkspaceId && (
                              <Check
                                aria-hidden
                                className="size-3.5 text-primary"
                              />
                            )}
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <p className="min-w-0 truncate text-sm font-semibold text-ink">
                {workspace}
              </p>
            )}
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse the rail"
              aria-expanded={true}
              className="shrink-0 rounded-2 p-1 text-ink-3 transition-colors hover:text-ink"
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onNew}
            className="mt-3 flex items-center gap-1.5 rounded-2 border border-dashed border-hairline px-2.5 py-1.5 text-sm text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink"
          >
            <Plus aria-hidden className="size-3.5" />
            {newLabel}
          </button>

          {searchable && (
            <div className="relative mt-3">
              {/* TraceInput carries a visible label and a fixed 44px
                  focus-drawn frame — heavier than this rail's ~32px items —
                  and it doesn't forward a ref, which the collapsed-to-glyph
                  focus handoff above needs. A plain input styled with the
                  rail's own tokens fits the density and stays reachable. */}
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3"
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setQuery("");
                  }
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full rounded-2 border border-hairline bg-surface-0 py-1.5 pr-2.5 pl-8 text-sm text-ink transition-colors placeholder:text-ink-3 focus-visible:border-hairline-strong"
              />
            </div>
          )}

          <nav aria-label="Workspace" className="mt-3">
            <ul
              className="flex flex-col gap-0.5"
              onMouseLeave={() => setHovered(null)}
            >
              <AnimatePresence initial={false}>
                {filteredPrimary.map(renderItem)}
              </AnimatePresence>
            </ul>
          </nav>

          <nav aria-label={threadsHeading} className="mt-4 min-h-0 flex-1">
            <p className="px-1 text-label text-ink-3">{threadsHeading}</p>
            <ul
              className="mt-1.5 flex flex-col gap-0.5 overflow-y-auto"
              onMouseLeave={() => setHovered(null)}
            >
              <AnimatePresence initial={false}>
                {filteredThreads.map(renderItem)}
              </AnimatePresence>
            </ul>
            {noMatches && (
              <p className="mt-2 px-1 font-mono text-[11px] text-ink-3">
                nothing matches
              </p>
            )}
          </nav>

          <div className="mt-4 border-t border-hairline pt-3">
            {quota && (
              <p className="flex items-baseline justify-between px-1">
                <span className="flex items-baseline gap-1 font-mono text-[11px] text-ink-3">
                  <Readout value={quota.used} size="sm" />
                  <span className="opacity-70">/ {quota.limit}</span>
                </span>
                <span className="text-label text-ink-3">{quota.label}</span>
              </p>
            )}
            <AnimatePresence>
              {quota && quota.used >= quota.limit && (
                <motion.p
                  initial={{ opacity: motionSafe ? 0 : 1 }}
                  animate={{ opacity: 1 }}
                  exit={{
                    opacity: 0,
                    transition: { duration: durations.fast },
                  }}
                  className="mt-1 px-1 text-[11px] text-ink-3"
                >
                  Every seat is taken.
                </motion.p>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={onFooter}
              className="mt-2.5 w-full rounded-2 bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              {footerLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
