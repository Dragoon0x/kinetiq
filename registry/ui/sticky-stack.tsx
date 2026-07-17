import * as React from "react";

import { cn } from "@/registry/lib/utils";

export type StackSection = {
  id: string;
  title: React.ReactNode;
  node: React.ReactNode;
};

export type StickyStackProps = {
  sections: StackSection[];
  /** Header height in px; each header sticks this much lower than the last. */
  headerHeight?: number;
  /** Viewport height in px. @default 320 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * Scroll a run of sections and their headers stack up at the top instead of one
 * replacing the next. Each header sticks a header-height lower than the one
 * before, so they pile into a legible ledger of where you are; when a section
 * finally scrolls past, its header releases and peels away with it, uncovering
 * the one beneath.
 *
 * This is pure sticky positioning — no scroll listeners, no transforms, nothing
 * to run each frame — so it is inert under reduced motion and costs nothing on a
 * long list. The scroll region is a labelled, keyboard-focusable landmark.
 */
export function StickyStack({
  sections,
  headerHeight = 44,
  height = 320,
  className,
  "aria-label": ariaLabel = "Sections",
}: StickyStackProps) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      style={{ height }}
      className={cn(
        "border-hairline bg-surface-0 focus-visible:ring-cobalt-bright/40 w-full overflow-y-auto rounded-3 border outline-none focus-visible:ring-2",
        className,
      )}
    >
      {sections.map((section, index) => (
        <section key={section.id}>
          <h3
            className="bg-surface-1/95 border-hairline text-ink flex items-center border-b px-4 text-sm font-semibold backdrop-blur-sm"
            style={{
              position: "sticky",
              top: index * headerHeight,
              height: headerHeight,
              zIndex: index + 1,
            }}
          >
            {section.title}
          </h3>
          <div className="text-ink-2 px-4 py-4 text-sm">{section.node}</div>
        </section>
      ))}
    </div>
  );
}
