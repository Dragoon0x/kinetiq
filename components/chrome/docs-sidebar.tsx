"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

import { cn } from "@/registry/lib/utils";

export type SidebarItem = { href: string; label: string; serial?: string };

export type SidebarGroup = {
  /** Category label (or "Blocks"), rendered as the group heading. */
  heading: string;
  /** Landing page the heading links to. */
  href: string;
  items: SidebarItem[];
};

const groupId = (heading: string, scope: string) =>
  `nav-${scope}-${heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export function DocsSidebar({ groups }: { groups: SidebarGroup[] }) {
  const pathname = usePathname();
  const [browseOpen, setBrowseOpen] = useState(false);
  const browseId = useId();
  const [manualOpen, setManualOpen] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // The group holding the active route (a landing page or one of its items).
  const currentHeading = groups.find(
    (group) =>
      group.href === pathname ||
      group.items.some((item) => item.href === pathname),
  )?.heading;

  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (browseOpen) setBrowseOpen(false);
  }

  const toggle = (heading: string) =>
    setManualOpen((prev) => {
      const next = new Set(prev);
      if (next.has(heading)) next.delete(heading);
      else next.add(heading);
      return next;
    });

  const renderGroups = (scope: "rail" | "browse") => (
    <>
      {groups.map((group) => {
        const panelId = groupId(group.heading, scope);
        const open =
          group.heading === currentHeading || manualOpen.has(group.heading);
        const headingActive = pathname === group.href;
        return (
          <div key={group.heading} className="mb-3">
            <div className="flex items-center gap-1">
              <Link
                href={group.href}
                className={cn(
                  "flex min-w-0 flex-1 items-baseline gap-2 rounded-2 px-3 py-1 text-label transition-colors",
                  headingActive
                    ? "text-cobalt-bright"
                    : "text-ink-3 hover:text-ink-2",
                )}
              >
                <span className="truncate">{group.heading}</span>
                <span aria-hidden className="font-mono text-[10px] opacity-70">
                  {group.items.length}
                </span>
              </Link>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={`${open ? "Collapse" : "Expand"} ${group.heading}`}
                onClick={() => toggle(group.heading)}
                className="rounded-2 p-1 text-ink-3 transition-colors hover:bg-surface-1 hover:text-ink"
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-3.5 transition-transform duration-200",
                    open && "rotate-90",
                  )}
                />
              </button>
            </div>

            <ul id={panelId} hidden={!open} className="mt-1 space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-baseline justify-between gap-2 rounded-2 px-3 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-surface-1 font-medium text-ink"
                          : "text-ink-2 hover:text-ink",
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                      {item.serial ? (
                        <span
                          aria-hidden
                          className={cn(
                            "font-mono text-[10px] tracking-wide",
                            active ? "text-cobalt-bright" : "text-ink-3",
                          )}
                        >
                          {item.serial.split("-")[1]}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );

  return (
    <>
      {/* Below lg the rail is not laid out beside the content, so it becomes a
          disclosure above it. It used to be plain `hidden`, which meant that
          on a phone, once you were on a component page there was no route to
          any other component — the whole catalog was in the DOM and none of
          it reachable. */}
      <div className="border-b border-hairline py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setBrowseOpen((value) => !value)}
          aria-expanded={browseOpen}
          aria-controls={browseId}
          className="flex w-full items-center justify-between gap-2 rounded-2 px-1 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
        >
          Browse the catalog
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 transition-transform",
              browseOpen && "rotate-180",
            )}
          />
        </button>
        <div
          id={browseId}
          hidden={!browseOpen}
          className="max-h-[65vh] overflow-y-auto pt-2"
        >
          <nav aria-label="Catalog">{renderGroups("browse")}</nav>
        </div>
      </div>

      <nav
        aria-label="Catalog"
        className="sticky top-14 hidden max-h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto py-8 pr-6 lg:block"
      >
        {renderGroups("rail")}
      </nav>
    </>
  );
}
