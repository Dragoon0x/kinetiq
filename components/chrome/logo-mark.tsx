import { LOGO_PATH, LOGO_VIEWBOX } from "@/lib/logo";
import { cn } from "@/registry/lib/utils";

/**
 * The Kinetiq mark in the current text colour — ink on either theme. Size it
 * by height (`h-…`); the width follows the mark's own proportions.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox={LOGO_VIEWBOX}
      fill="currentColor"
      className={cn("block h-[1em] w-auto shrink-0", className)}
    >
      <path d={LOGO_PATH} />
    </svg>
  );
}
