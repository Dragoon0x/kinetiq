"use client";

import * as React from "react";

import { useTheme } from "@/components/chrome/theme-provider";
import { cn } from "@/registry/lib/utils";

/**
 * Widths a section is judged at. "Fluid" hands the frame the full column and
 * lets it breathe; the fixed stops exist because Tailwind's responsive
 * classes answer to the window — an iframe is the only honest way to preview
 * a breakpoint without resizing the browser.
 */
const VIEWPORTS = [
  { id: "fluid", label: "Fluid", width: undefined },
  { id: "mobile", label: "360", width: 360 },
  { id: "tablet", label: "768", width: 768 },
  { id: "desktop", label: "1280", width: 1280 },
] as const;

type ViewportId = (typeof VIEWPORTS)[number]["id"];

const MIN_HEIGHT = 320;
const MAX_HEIGHT = 1400;

/**
 * The stage for full-width sections: a same-origin iframe onto the block's
 * bare preview route, with a viewport rail above it. The frame reports its
 * own rendered height and the stage fits it; theme changes re-key the frame,
 * whose pre-paint script re-reads the shared localStorage — no flash, no
 * message handshake.
 */
export function SectionFrame({
  slug,
  base = "blocks",
  serial,
  label,
}: {
  slug: string;
  /** Which bare preview route to frame: a section, or a whole page. */
  base?: "blocks" | "pages" | "templates";
  serial: string;
  label: string;
}) {
  const { theme } = useTheme();
  const [viewport, setViewport] = React.useState<ViewportId>("fluid");
  const [height, setHeight] = React.useState(MIN_HEIGHT);

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        source?: string;
        slug?: string;
        height?: number;
      };
      if (data?.source !== "kinetiq-preview" || data.slug !== slug) return;
      if (typeof data.height !== "number" || !Number.isFinite(data.height))
        return;
      setHeight(
        Math.round(Math.min(Math.max(data.height, MIN_HEIGHT), MAX_HEIGHT)),
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [slug]);

  const active = VIEWPORTS.find((v) => v.id === viewport) ?? VIEWPORTS[0];

  return (
    // data-specimen-stage: the interaction sweep drives every doc page's
    // stage; here that exercises the viewport rail. The section itself is
    // proven separately, at three widths, by sections.spec.ts.
    <figure
      data-specimen-stage=""
      className="overflow-hidden rounded-3 border border-hairline bg-surface-1"
    >
      <figcaption className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <span className="text-label text-ink-3">
          {serial} · {label}
        </span>
        <div
          role="group"
          aria-label="Preview viewport"
          className="flex overflow-hidden rounded-2 border border-hairline"
        >
          {VIEWPORTS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setViewport(option.id)}
              aria-pressed={option.id === viewport}
              className={cn(
                "px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
                option.id === viewport
                  ? "bg-surface-2 text-ink"
                  : "text-ink-3 hover:text-ink-2",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </figcaption>

      <div className="overflow-x-auto bg-surface-0">
        <iframe
          // Theme lives on <html> in the frame; re-mounting on toggle lets its
          // pre-paint script restamp from the shared localStorage.
          key={theme}
          src={`/preview/${base}/${slug}`}
          title={`${label} preview`}
          loading="lazy"
          style={{
            width: active.width ?? "100%",
            height,
            display: "block",
            margin: active.width ? "0 auto" : undefined,
            border: "0",
          }}
          className={cn(active.width && "border-x border-hairline")}
        />
      </div>
    </figure>
  );
}
