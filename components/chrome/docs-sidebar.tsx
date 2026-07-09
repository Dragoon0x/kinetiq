"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cn } from "@/registry/lib/utils";

export type SidebarItem = { href: string; label: string; serial?: string };

export type SidebarGroup = {
  /** Category label (or "Blocks"), rendered as the group heading. */
  heading: string;
  /** Landing page the heading links to. */
  href: string;
  items: SidebarItem[];
};

const groupId = (heading: string) =>
  `nav-${heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export function DocsSidebar({ groups }: { groups: SidebarGroup[] }) {
  const pathname = usePathname();
  const [manualOpen, setManualOpen] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // The group holding the active route (a landing page or one of its items).
  const currentHeading = groups.find(
    (group) =>
      group.href === pathname ||
      group.items.some((item) => item.href === pathname),
  )?.heading;

  const toggle = (heading: string) =>
    setManualOpen((prev) => {
      const next = new Set(prev);
      if (next.has(heading)) next.delete(heading);
      else next.add(heading);
      return next;
    });

  return (
    <nav
      aria-label="Catalog"
      className="sticky top-14 hidden max-h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto py-8 pr-6 lg:block"
    >
      {groups.map((group) => {
        const panelId = groupId(group.heading);
        const open = group.heading === currentHeading || manualOpen.has(group.heading);
        const headingActive = pathname === group.href;
        return (
          <div key={group.heading} className="mb-3">
            <div className="flex items-center gap-1">
              <Link
                href={group.href}
                className={cn(
                  "text-label flex min-w-0 flex-1 items-baseline gap-2 rounded-2 px-3 py-1 transition-colors",
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
                className="text-ink-3 hover:text-ink hover:bg-surface-1 rounded-2 p-1 transition-colors"
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
                          ? "bg-surface-1 text-ink font-medium"
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
    </nav>
  );
}
