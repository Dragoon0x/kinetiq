"use client";

import { useId, useRef, useState } from "react";

import { m } from "motion/react";

import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DocTab = {
  label: string;
  content: React.ReactNode;
};

/**
 * Accessible segmented tabs for docs pages (Preview / Usage / Code).
 * Roving tabindex, arrow-key navigation, and a shared-layout indicator
 * that travels on `snap`.
 */
export function DocTabs({
  tabs,
  className,
}: {
  tabs: DocTab[];
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (index: number) => {
    const clamped = (index + tabs.length) % tabs.length;
    setActive(clamped);
    tabRefs.current[clamped]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusTab(active + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusTab(active - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(tabs.length - 1);
        break;
    }
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label="Documentation sections"
        onKeyDown={onKeyDown}
        className="border-hairline bg-surface-1 inline-flex items-center gap-1 rounded-2 border p-1"
      >
        {tabs.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.label}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${index}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${index}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              className={cn(
                "relative rounded-1 px-3 py-1 text-sm font-medium transition-colors",
                selected ? "text-ink" : "text-ink-3 hover:text-ink-2",
              )}
            >
              {selected && (
                <m.span
                  layoutId={`${baseId}-indicator`}
                  transition={springs.snap}
                  className="bg-surface-2 border-hairline-strong absolute inset-0 rounded-1 border"
                  aria-hidden
                />
              )}
              <span className="relative">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.label}
          role="tabpanel"
          id={`${baseId}-panel-${index}`}
          aria-labelledby={`${baseId}-tab-${index}`}
          hidden={index !== active}
          className="mt-4 focus-visible:outline-none"
        >
          {index === active ? tab.content : null}
        </div>
      ))}
    </div>
  );
}
