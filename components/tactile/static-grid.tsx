import Link from "next/link";

import { cn } from "@/registry/lib/utils";

import type { TactileItem } from "./tactile-card";
import { GroupGlyph } from "./group-glyph";

const SPAN = {
  square: "",
  wide: "sm:col-span-2",
  tall: "row-span-2",
  large: "row-span-2 sm:col-span-2",
} as const;

/**
 * The gallery as the server sends it: the same grid, the same card sizes,
 * each card naming its component and linking to its page. The live gallery
 * replaces it on the client without the layout moving, and a reader (or a
 * crawler) without JavaScript still has every component and its words.
 */
export function StaticGrid({ items }: { items: TactileItem[] }) {
  return (
    <div>
      <div className="h-[61px] border-y border-hairline bg-surface-0/85 lg:h-[59px]" />
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <ul className="grid [grid-auto-flow:dense] auto-rows-[340px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((item) => (
            <li
              key={item.name}
              className={cn(
                "flex flex-col overflow-clip rounded-4 border border-hairline bg-surface-1",
                SPAN[item.aspect],
              )}
            >
              <div className="flex h-11 items-center gap-2 px-4 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                <GroupGlyph group={item.group} className="size-3.5" />
                {item.groupLabel}
              </div>
              <div className="flex flex-1 items-center justify-center">
                <span
                  aria-hidden
                  className="flex size-14 items-center justify-center rounded-full border border-hairline text-ink-3"
                >
                  <GroupGlyph group={item.group} className="size-5" />
                </span>
              </div>
              <div className="px-4 pt-2 pb-4">
                <Link
                  href={`/components/${item.name}`}
                  className="text-sm font-medium text-foreground"
                >
                  {item.title}
                </Link>
                <p className="mt-0.5 truncate text-xs text-ink-3">
                  {item.tagline}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
