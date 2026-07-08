"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { Command } from "cmdk";
import { ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import searchIndex from "@/.generated/search-index.json";
import { cn } from "@/registry/lib/utils";

type SearchEntry = {
  section: string;
  title: string;
  tagline: string;
  keywords: string[];
  href: string;
};

const ENTRIES = searchIndex as SearchEntry[];
const RECENTS_KEY = "kinetiq-deck-recents";
const RECENTS_EVENT = "kinetiq-deck-recents-change";
const SECTION_ORDER = ["Components", "Blocks", "Playground", "Guides", "Pages"];
const NO_RECENTS: string[] = [];

/** localStorage-backed recents as an external store (cached snapshot). */
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
        ? parsed.filter((h): h is string => typeof h === "string")
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
 * The site's ⌘K search. Groups the build-time index by section, keeps the
 * last five destinations as RECENT, and hands navigation to the router.
 */
export function CommandDeck() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const recents = useSyncExternalStore(
    subscribeRecents,
    getRecentsSnapshot,
    getRecentsServerSnapshot,
  );

  const openDeck = useCallback(() => {
    setQuery("");
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) {
          setOpen(false);
        } else {
          openDeck();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, openDeck]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      try {
        const next = [
          href,
          ...getRecentsSnapshot().filter((h) => h !== href),
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

  const sections = useMemo(() => {
    const grouped = new Map<string, SearchEntry[]>();
    for (const entry of ENTRIES) {
      const list = grouped.get(entry.section) ?? [];
      list.push(entry);
      grouped.set(entry.section, list);
    }
    return SECTION_ORDER.filter((s) => grouped.has(s)).map((s) => ({
      section: s,
      entries: grouped.get(s) ?? [],
    }));
  }, []);

  const recentEntries = useMemo(
    () =>
      recents
        .map((href) => ENTRIES.find((e) => e.href === href))
        .filter((e): e is SearchEntry => Boolean(e)),
    [recents],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-hairline text-ink-3 hover:text-ink-2 hover:border-hairline-strong flex h-8 items-center gap-2 rounded-2 border px-2.5 text-sm transition-colors"
        aria-label="Search (Command K)"
      >
        <Search aria-hidden className="size-3.5" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="bg-surface-1 text-ink-3 hidden rounded-1 px-1 py-0.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search Kinetiq"
        className={cn(
          "border-hairline-strong bg-surface-1 fixed top-[18%] left-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-4 border shadow-2xl",
        )}
      >
        <div
          aria-hidden
          className="fixed inset-0 -z-10 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
        <div className="border-hairline flex items-center gap-2.5 border-b px-4">
          <Search aria-hidden className="text-ink-3 size-4 shrink-0" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search instruments, benches, pages…"
            className="text-ink placeholder:text-ink-3 h-12 w-full bg-transparent text-sm outline-none"
          />
          <kbd className="bg-surface-2 text-ink-3 rounded-1 px-1.5 py-0.5 font-mono text-[10px]">
            ESC
          </kbd>
        </div>
        <Command.List className="max-h-[320px] overflow-y-auto p-2">
          <Command.Empty className="text-ink-3 px-3 py-8 text-center font-mono text-xs tracking-wide uppercase">
            No matching specimens
          </Command.Empty>

          {query === "" && recentEntries.length > 0 ? (
            <Command.Group
              heading="Recent"
              className="text-ink-3 [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5"
            >
              {recentEntries.map((entry) => (
                <DeckItem
                  key={`recent-${entry.href}`}
                  entry={entry}
                  onSelect={go}
                />
              ))}
            </Command.Group>
          ) : null}

          {sections.map(({ section, entries }) => (
            <Command.Group
              key={section}
              heading={section}
              className="text-ink-3 [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5"
            >
              {entries.map((entry) => (
                <DeckItem key={entry.href} entry={entry} onSelect={go} />
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
    </>
  );
}

function DeckItem({
  entry,
  onSelect,
}: {
  entry: SearchEntry;
  onSelect: (href: string) => void;
}) {
  return (
    <Command.Item
      value={`${entry.title} ${entry.tagline} ${entry.keywords.join(" ")}`}
      onSelect={() => onSelect(entry.href)}
      className="data-[selected=true]:bg-surface-2 group flex cursor-pointer items-center justify-between gap-3 rounded-2 px-3 py-2"
    >
      <span className="min-w-0">
        <span className="text-ink block truncate text-sm font-medium">
          {entry.title}
        </span>
        <span className="text-ink-3 block truncate text-xs">
          {entry.tagline}
        </span>
      </span>
      <ArrowRight
        aria-hidden
        className="text-ink-3 size-3.5 shrink-0 opacity-0 transition-opacity group-data-[selected=true]:opacity-100"
      />
    </Command.Item>
  );
}
