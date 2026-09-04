"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Command } from "cmdk";
import { ArrowRight, Check, Copy, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  getPackageManager,
  getServerPackageManager,
  installCommand,
  subscribePackageManager,
} from "@/lib/package-manager";
import type { SearchDoc, SearchSection } from "@/lib/search-doc";
import { SECTION_CODES, SECTION_LABELS, SECTION_ORDER } from "@/lib/search-doc";
import type { MatchField, SearchHit } from "@/lib/search-rank";
import { rankDocs } from "@/lib/search-rank";
import { cn } from "@/registry/lib/utils";

const RECENTS_KEY = "kinetiq-deck-recents";
const RECENTS_EVENT = "kinetiq-deck-recents-change";
const NO_RECENTS: string[] = [];
const RESULT_LIMIT = 40;

/** Sections whose items are installable from the registry. */
const INSTALLABLE: ReadonlySet<SearchSection> = new Set([
  "component",
  "block",
  "page",
  "template",
]);

/** Where the deck sends a reader who has not typed anything yet. */
const STARTING_POINTS = [
  { href: "/components", label: "Components", hint: "The instrument index" },
  { href: "/blocks", label: "Blocks", hint: "Assembled sections" },
  { href: "/explore", label: "Explore", hint: "The whole catalog, live" },
  { href: "/guides", label: "Guides", hint: "The field manuals" },
];

const FIELD_LABEL: Record<MatchField, string> = {
  serial: "serial",
  prop: "prop",
  keyword: "keyword",
  category: "category",
  title: "title",
  tagline: "",
  body: "",
};

// ── the index, fetched once and shared by every mount ────────────────────

let headPromise: Promise<SearchDoc[]> | null = null;
let bodyPromise: Promise<string[]> | null = null;

function fetchJson<T>(url: string, reset: () => void): Promise<T> {
  return fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.json() as Promise<T>;
    })
    .catch((error: unknown) => {
      // Let a later open try again rather than caching the failure.
      reset();
      throw error;
    });
}

/** Names, serials, keywords, props, categories — enough to search at once. */
function loadHead(): Promise<SearchDoc[]> {
  headPromise ??= fetchJson<SearchDoc[]>("/search-index.json", () => {
    headPromise = null;
  });
  return headPromise;
}

/** Descriptions and prop docs, aligned to the head by position. */
function loadBodies(): Promise<string[]> {
  bodyPromise ??= fetchJson<string[]>("/search-body.json", () => {
    bodyPromise = null;
  });
  return bodyPromise;
}

// ── recents, as an external store over localStorage ──────────────────────

let recentsCache: { raw: string; value: string[] } | null = null;

function getRecentsSnapshot(): string[] {
  let raw = "[]";
  try {
    raw = localStorage.getItem(RECENTS_KEY) ?? "[]";
  } catch {
    return NO_RECENTS;
  }
  if (!recentsCache || recentsCache.raw !== raw) {
    let value: string[] = [];
    try {
      const parsed: unknown = JSON.parse(raw);
      value = Array.isArray(parsed)
        ? parsed.filter((href): href is string => typeof href === "string")
        : [];
    } catch {
      value = [];
    }
    recentsCache = { raw, value };
  }
  return recentsCache.value;
}

function getRecentsServerSnapshot(): string[] {
  return NO_RECENTS;
}

function subscribeRecents(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(RECENTS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(RECENTS_EVENT, onChange);
  };
}

/**
 * The site's ⌘K search, over every record in the library: titles, serials,
 * categories, keywords, prop names, prop docs, and descriptions. Matching
 * and ranking are ours (see lib/search-rank) — cmdk keeps the listbox
 * semantics and arrow-key selection while we decide what is in the list and
 * in what order, so only the top matches are ever in the DOM.
 *
 * Enter opens the match; ⌘/Ctrl+Enter copies its install command without
 * leaving the page.
 */
export function CommandDeck() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchSection | null>(null);
  const [docs, setDocs] = useState<SearchDoc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<number | null>(null);
  const warmed = useRef(false);

  const recents = useSyncExternalStore(
    subscribeRecents,
    getRecentsSnapshot,
    getRecentsServerSnapshot,
  );
  const pm = useSyncExternalStore(
    subscribePackageManager,
    getPackageManager,
    getServerPackageManager,
  );

  /**
   * Pull the index in the background; the deck opens either way. The head
   * lands first and is immediately searchable, then the bodies merge in and
   * the same query starts reaching descriptions and prop docs too.
   */
  const warm = useCallback(() => {
    if (warmed.current) return;
    warmed.current = true;
    loadHead().then(
      (head) => {
        setDocs(head);
        loadBodies().then(
          (bodies) => {
            setDocs(
              head.map((doc, index) => {
                const body = bodies[index];
                return body ? { ...doc, b: body } : doc;
              }),
            );
          },
          () => {
            // Names still search; only the prose is missing.
          },
        );
      },
      () => setFailed(true),
    );
  }, []);

  // Fetch on first idle so the first ⌘K already has its index in hand.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const idle = window.requestIdleCallback?.bind(window);
    if (idle) {
      const handle = idle(() => warm(), { timeout: 4000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(timer);
  }, [warm]);

  useEffect(
    () => () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const openDeck = useCallback(() => {
    setQuery("");
    setScope(null);
    setCopied(null);
    setOpen(true);
    warm();
  }, [warm]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) setOpen(false);
        else openDeck();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, openDeck]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      // Recents key on the record's own route: a prop match navigates to
      // "…#props", and storing that would never resolve back to a record.
      const route = href.split("#")[0] ?? href;
      try {
        const next = [
          route,
          ...getRecentsSnapshot().filter((entry) => entry !== route),
        ].slice(0, 5);
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(RECENTS_EVENT));
      } catch {
        // Recents are a nicety; navigation still happens.
      }
      router.push(href as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  /** Copies the install command, or the URL for anything not installable. */
  const copyFor = useCallback(
    (doc: SearchDoc) => {
      const value =
        doc.g && INSTALLABLE.has(SECTION_CODES[doc.s])
          ? installCommand(doc.g, pm)
          : `${window.location.origin}${doc.h}`;
      void navigator.clipboard?.writeText(value).then(() => {
        setCopied(doc.h);
        if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopied(null), 1600);
      });
    },
    [pm],
  );

  /**
   * One pass over the whole library per keystroke. The chips need a tally of
   * every match, not just the shown page, so the scope is applied here
   * afterwards rather than inside the ranker — otherwise the same ~750
   * records would be scored twice for every letter typed.
   */
  const { matches, counts, totalMatches } = useMemo(() => {
    if (!docs || !query.trim()) {
      return { matches: [], counts: null, totalMatches: 0 };
    }
    const all = rankDocs(docs, query, { limit: Number.MAX_SAFE_INTEGER });
    const tally = new Map<SearchSection, number>();
    for (const hit of all) {
      tally.set(hit.section, (tally.get(hit.section) ?? 0) + 1);
    }
    return { matches: all, counts: tally, totalMatches: all.length };
  }, [docs, query]);

  const hits = useMemo(
    () =>
      (scope ? matches.filter((hit) => hit.section === scope) : matches).slice(
        0,
        RESULT_LIMIT,
      ),
    [matches, scope],
  );

  const grouped = useMemo(() => {
    const bySection = new Map<SearchSection, SearchHit[]>();
    for (const hit of hits) {
      const list = bySection.get(hit.section) ?? [];
      list.push(hit);
      bySection.set(hit.section, list);
    }
    return SECTION_ORDER.filter((section) => bySection.has(section)).map(
      (section) => ({ section, hits: bySection.get(section) ?? [] }),
    );
  }, [hits]);

  const recentDocs = useMemo(() => {
    if (!docs) return [];
    return recents
      .map((href) => docs.find((doc) => doc.h === href))
      .filter((doc): doc is SearchDoc => Boolean(doc));
  }, [docs, recents]);

  const showingQuery = query.trim().length > 0;

  /**
   * Re-ranking — a keystroke, a scope change — retires whatever was
   * selected, and cmdk tracks selection by value, so a stale one would leave
   * the list with no highlight and Enter with nothing to open. Rather than
   * writing state back after each render, the selection is derived: the
   * reader's choice while it still exists in the list, otherwise the top row.
   */
  const values = useMemo(() => {
    if (showingQuery) return hits.map((hit) => hit.doc.h);
    return [
      ...recentDocs.map((doc) => `recent:${doc.h}`),
      ...STARTING_POINTS.map((point) => `jump:${point.href}`),
    ];
  }, [showingQuery, hits, recentDocs]);

  const active = values.includes(selected) ? selected : (values[0] ?? "");

  const selectedHit = useMemo(
    () => hits.find((hit) => hit.doc.h === active),
    [hits, active],
  );

  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter") return;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      if (selectedHit) copyFor(selectedHit.doc);
      return;
    }
    // Open from React state rather than leaving it to cmdk, which reads the
    // selection back out of the DOM: the bodies merging mid-query re-renders
    // the list, and an Enter landing in that gap would otherwise do nothing.
    if (selectedHit) {
      event.preventDefault();
      go(hrefFor(selectedHit));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDeck}
        onPointerEnter={warm}
        onFocus={warm}
        className="flex h-8 items-center gap-2 rounded-2 border border-hairline px-2.5 text-sm text-ink-3 transition-colors hover:border-hairline-strong hover:text-ink-2"
        aria-label="Search (Command K)"
      >
        <Search aria-hidden className="size-3.5" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded-1 bg-surface-1 px-1 py-0.5 font-mono text-[10px] text-ink-3 sm:inline">
          ⌘K
        </kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search Kinetiq"
        shouldFilter={false}
        value={active}
        onValueChange={setSelected}
        onKeyDown={onListKeyDown}
        // The scrim is the dialog's own overlay, not a child of the panel: a
        // negative-z child paints over its parent's background, which left
        // the whole palette dimmed by its own backdrop.
        overlayClassName="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        contentClassName="fixed top-[10%] left-1/2 z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2"
        className="flex max-h-[min(560px,80vh)] flex-col overflow-hidden rounded-4 border border-hairline-strong bg-surface-1 shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-hairline px-4">
          <Search aria-hidden className="size-4 shrink-0 text-ink-3" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search the library — names, props, serials, anything…"
            className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
          <kbd className="rounded-1 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
            ESC
          </kbd>
        </div>

        {counts && counts.size > 1 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-hairline px-3 py-2">
            <ScopeChip
              label="All"
              count={totalMatches}
              active={scope === null}
              onClick={() => setScope(null)}
            />
            {SECTION_ORDER.filter((section) => counts.get(section)).map(
              (section) => (
                <ScopeChip
                  key={section}
                  label={SECTION_LABELS[section]}
                  count={counts.get(section) ?? 0}
                  active={scope === section}
                  onClick={() =>
                    setScope((current) =>
                      current === section ? null : section,
                    )
                  }
                />
              ),
            )}
          </div>
        ) : null}

        <Command.List className="flex-1 overflow-y-auto overscroll-contain p-2">
          {showingQuery && docs && hits.length === 0 ? (
            // A plain node, not Command.Empty: with our own filtering cmdk
            // has no count of its own to decide emptiness from.
            <p className="px-3 py-10 text-center text-sm text-ink-3">
              Nothing matches{" "}
              <span className="font-mono text-ink-2">{query.trim()}</span>.
              <span className="mt-1 block text-xs">
                Names, props, serials, categories and descriptions are all
                searchable.
              </span>
            </p>
          ) : null}

          {showingQuery && !docs && !failed ? (
            <p className="px-3 py-10 text-center font-mono text-xs tracking-wide text-ink-3 uppercase">
              Loading the index…
            </p>
          ) : null}

          {failed ? (
            <p className="px-3 py-10 text-center text-sm text-ink-3">
              The search index could not be loaded.
            </p>
          ) : null}

          {!showingQuery && recentDocs.length > 0 ? (
            <Group heading="Recent">
              {recentDocs.map((doc) => (
                <DeckItem
                  key={`recent-${doc.h}`}
                  // Recents and Jump-to can name the same route; cmdk keys
                  // its selection by value, so they get distinct ones.
                  value={`recent:${doc.h}`}
                  doc={doc}
                  ranges={[]}
                  reason={null}
                  copied={copied === doc.h}
                  onSelect={go}
                  onCopy={copyFor}
                />
              ))}
            </Group>
          ) : null}

          {!showingQuery ? (
            <Group heading="Jump to">
              {STARTING_POINTS.map((point) => (
                <Command.Item
                  key={point.href}
                  value={`jump:${point.href}`}
                  onSelect={() => go(point.href)}
                  className="group flex cursor-pointer items-center justify-between gap-3 rounded-2 px-3 py-2 data-[selected=true]:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      {point.label}
                    </span>
                    <span className="block truncate text-xs text-ink-3">
                      {point.hint}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="size-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-data-[selected=true]:opacity-100"
                  />
                </Command.Item>
              ))}
            </Group>
          ) : null}

          {grouped.map(({ section, hits: sectionHits }) => (
            <Group key={section} heading={SECTION_LABELS[section]}>
              {sectionHits.map((hit) => (
                <DeckItem
                  key={hit.doc.h}
                  doc={hit.doc}
                  href={hrefFor(hit)}
                  ranges={hit.ranges}
                  reason={hit.reason}
                  copied={copied === hit.doc.h}
                  onSelect={go}
                  onCopy={copyFor}
                />
              ))}
            </Group>
          ))}
        </Command.List>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-3 py-2 text-[11px] text-ink-3">
          <span className="flex items-center gap-2.5">
            <Hint keys="↑↓" label="navigate" />
            <Hint keys="↵" label="open" />
            <Hint keys="⌘↵" label="copy install" />
          </span>
          {docs ? (
            <span className="font-mono tabular-nums">
              {showingQuery
                ? `${scope ? (counts?.get(scope) ?? 0) : totalMatches} of ${docs.length}`
                : `${docs.length} records`}
            </span>
          ) : null}
        </div>
      </Command.Dialog>
    </>
  );
}

/** Where a hit leads: its page, or the props table when a prop matched. */
function hrefFor(hit: SearchHit): string {
  return hit.reason?.field === "prop" ? `${hit.doc.h}#props` : hit.doc.h;
}

function Group({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Group
      heading={heading}
      className="text-ink-3 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-label"
    >
      {children}
    </Command.Group>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="rounded-1 bg-surface-2 px-1 py-0.5 font-mono text-[10px] text-ink-3">
        {keys}
      </kbd>
      {label}
    </span>
  );
}

function ScopeChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-1 border px-2 py-0.5 text-xs transition-colors",
        active
          ? "border-hairline-strong bg-surface-2 text-ink"
          : "border-transparent text-ink-3 hover:bg-surface-2 hover:text-ink-2",
      )}
    >
      {label}
      {count === null ? null : (
        <span className="ml-1.5 font-mono text-[10px] text-ink-3 tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

/** The title with every matched range marked, so a hit shows its own reason. */
function Highlighted({
  text,
  ranges,
}: {
  text: string;
  ranges: [number, number][];
}) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark
        key={`${start}-${end}`}
        className="bg-transparent font-semibold text-cobalt-bright"
      >
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

function DeckItem({
  doc,
  href,
  value,
  ranges,
  reason,
  copied,
  onSelect,
  onCopy,
}: {
  doc: SearchDoc;
  /** Where Enter goes — the record's page, or a section within it. */
  href?: string;
  value?: string;
  ranges: [number, number][];
  reason: SearchHit["reason"];
  copied: boolean;
  onSelect: (href: string) => void;
  onCopy: (doc: SearchDoc) => void;
}) {
  // A title match is already visible in the highlight, and a tagline match
  // shows itself, so the second line names a field only when it is one the
  // reader could not otherwise see.
  const label = reason ? FIELD_LABEL[reason.field] : "";
  const showReason = Boolean(reason) && reason!.field !== "title";

  return (
    <Command.Item
      value={value ?? doc.h}
      onSelect={() => onSelect(href ?? doc.h)}
      className="group flex cursor-pointer items-center gap-3 rounded-2 px-3 py-2 data-[selected=true]:bg-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-ink">
            <Highlighted text={doc.t} ranges={ranges} />
          </span>
          {doc.n ? (
            <span className="shrink-0 font-mono text-[10px] text-ink-3">
              {doc.n}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-ink-3">
          {showReason && reason ? (
            <>
              {label ? <span className="text-ink-2">{label} </span> : null}
              <span className={label ? "font-mono" : undefined}>
                {reason.text}
              </span>
            </>
          ) : (
            doc.d
          )}
        </span>
      </span>

      {/* Pointer affordance only — the keyboard path is ⌘↵, named in the
          footer, so this stays out of the option's accessible name. */}
      <span
        aria-hidden
        title="Copy install command"
        onClick={(event) => {
          event.stopPropagation();
          onCopy(doc);
        }}
        className="shrink-0 rounded-1 p-1 text-ink-3 opacity-0 transition-opacity group-data-[selected=true]:opacity-100 hover:text-ink"
      >
        {copied ? (
          <Check className="size-3.5 text-success" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </span>
      <ArrowRight
        aria-hidden
        className="size-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-data-[selected=true]:opacity-100"
      />
    </Command.Item>
  );
}
