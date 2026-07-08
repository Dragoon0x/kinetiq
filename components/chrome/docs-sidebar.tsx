"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/registry/lib/utils";

export type SidebarSection = {
  heading: string;
  items: { href: string; label: string; serial?: string }[];
};

export function DocsSidebar({ sections }: { sections: SidebarSection[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Catalog"
      className="sticky top-14 hidden max-h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto py-8 pr-6 lg:block"
    >
      {sections.map((section) => (
        <div key={section.heading} className="mb-8">
          <p className="text-label text-ink-3 px-3">{section.heading}</p>
          <ul className="mt-2 space-y-0.5">
            {section.items.map((item) => {
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
      ))}
    </nav>
  );
}
