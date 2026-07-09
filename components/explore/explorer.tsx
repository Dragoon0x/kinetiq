"use client";

import { Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useTheme, type Theme } from "@/components/chrome/theme-provider";
import { LazyPlate } from "@/components/explore/lazy-plate";
import { CATEGORIES, type CategorySlug } from "@/content/categories";
import {
  SPATIAL_COLLECTIONS,
  type CollectionSlug,
} from "@/content/collections";
import { cn } from "@/registry/lib/utils";

export type ExploreItem = {
  slug: string;
  title: string;
  tagline: string;
  serial: string;
  label: string;
  category: CategorySlug;
  /** Wing collection, for spatial instruments only. */
  collection: CollectionSlug | null;
  keywords: string[];
};

const isCategorySlug = (value: string | null): value is CategorySlug =>
  value !== null && CATEGORIES.some((c) => c.slug === value);

export function Explorer({ items }: { items: ExploreItem[] }) {
  const params = useSearchParams();
  const initialCategory = params.get("category");
  const { theme } = useTheme();

  const presentCategories = useMemo(() => {
    const present = new Set(items.map((i) => i.category));
    return CATEGORIES.filter((c) => present.has(c.slug));
  }, [items]);

  const [selected, setSelected] = useState<Set<CategorySlug>>(() =>
    isCategorySlug(initialCategory)
      ? new Set([initialCategory])
      : new Set<CategorySlug>(),
  );
  const [collections, setCollections] = useState<Set<CollectionSlug>>(
    () => new Set<CollectionSlug>(),
  );
  const [query, setQuery] = useState("");
  const [compact, setCompact] = useState(false);
  const [override, setOverride] = useState<Theme | null>(null);
  const previewTheme = override ?? theme;

  const presentCollections = useMemo(() => {
    const present = new Set(items.map((i) => i.collection));
    return SPATIAL_COLLECTIONS.filter((c) => present.has(c.slug));
  }, [items]);
  const spatialActive = selected.has("spatial");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (selected.size > 0 && !selected.has(item.category)) return false;
      if (
        spatialActive &&
        collections.size > 0 &&
        item.category === "spatial" &&
        (item.collection === null || !collections.has(item.collection))
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.tagline.toLowerCase().includes(q) ||
        item.slug.includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [items, selected, spatialActive, collections, query]);

  const toggleCategory = (slug: CategorySlug) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
        // Leaving the wing retires its sub-filter too.
        if (slug === "spatial") setCollections(new Set());
      } else {
        next.add(slug);
      }
      return next;
    });

  const toggleCollection = (slug: CollectionSlug) =>
    setCollections((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const clearFilters = () => {
    setSelected(new Set());
    setCollections(new Set());
    setQuery("");
  };

  const hasFilters =
    selected.size > 0 || collections.size > 0 || query.trim().length > 0;
  const minHeight = compact ? 220 : 300;

  return (
    <div>
      {/* controls — follow the site theme */}
      <div className="border-hairline bg-surface-0/80 sticky top-14 z-10 -mx-2 border-b px-2 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-52 flex-1">
            <Search
              aria-hidden
              className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name, keyword…"
              aria-label="Filter specimens"
              className="border-hairline bg-surface-1 focus-visible:border-cobalt-bright focus-visible:ring-cobalt-bright/30 h-9 w-full rounded-2 border pr-3 pl-9 text-sm transition-colors outline-none focus-visible:ring-2"
            />
          </div>

          <Segmented
            label="Density"
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
            value={compact ? "compact" : "comfortable"}
            onChange={(value) => setCompact(value === "compact")}
          />

          <Segmented
            label="Preview theme"
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
            value={previewTheme}
            onChange={(value) => setOverride(value as Theme)}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {presentCategories.map((category) => {
            const on = selected.has(category.slug);
            return (
              <button
                key={category.slug}
                type="button"
                aria-pressed={on}
                onClick={() => toggleCategory(category.slug)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  on
                    ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                    : "border-hairline text-ink-2 hover:text-ink hover:border-hairline-strong",
                )}
              >
                {category.label}
              </button>
            );
          })}
          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-ink-3 hover:text-ink inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm transition-colors"
            >
              <X className="size-3.5" aria-hidden />
              Clear
            </button>
          ) : null}
        </div>

        {spatialActive && presentCollections.length > 0 ? (
          <div
            aria-label="Spatial collections"
            role="group"
            className="mt-2 flex flex-wrap items-center gap-1.5"
          >
            <span aria-hidden className="text-label text-ink-3 px-1">
              WING
            </span>
            {presentCollections.map((collection) => {
              const on = collections.has(collection.slug);
              return (
                <button
                  key={collection.slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCollection(collection.slug)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    on
                      ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                      : "border-hairline text-ink-3 hover:text-ink hover:border-hairline-strong",
                  )}
                >
                  {collection.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <p aria-live="polite" className="text-label text-ink-3 mt-3">
          {filtered.length} of {items.length} specimens
        </p>
      </div>

      {/* preview grid — scoped to the chosen preview theme */}
      <div
        className={cn(
          previewTheme,
          "bg-surface-0 mt-6 rounded-4 p-3 sm:p-5",
        )}
      >
        {filtered.length > 0 ? (
          <ul
            className={cn(
              "grid gap-4",
              compact
                ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                : "sm:grid-cols-2 xl:grid-cols-3",
            )}
          >
            {filtered.map((item) => (
              <li key={item.slug} className="min-w-0">
                <LazyPlate
                  slug={item.slug}
                  serial={item.serial}
                  label={item.label}
                  tagline={item.tagline}
                  minHeight={minHeight}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <p className="text-ink-2 text-sm">
              No specimens match those filters.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="text-cobalt-bright text-sm hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="border-hairline bg-surface-1 inline-flex rounded-2 border p-0.5"
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-[calc(var(--radius-2)-2px)] px-2.5 py-1 text-xs transition-colors",
              on
                ? "bg-surface-2 text-ink font-medium"
                : "text-ink-3 hover:text-ink-2",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
