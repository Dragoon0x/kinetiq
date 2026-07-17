"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Crumb = {
  id: string;
  label: React.ReactNode;
  href?: string;
};

export type BreadcrumbTrailProps = {
  ref?: React.Ref<HTMLElement>;
  items: Crumb[];
  /** Total crumbs shown before the middle collapses into an ellipsis. @default 4 */
  maxVisible?: number;
  /** Accessible name for the nav landmark. @default "Breadcrumb" */
  label?: string;
  /** Called with the crumb on activation; prevents default navigation when set. */
  onNavigate?: (crumb: Crumb) => void;
  className?: string;
};

const ELLIPSIS = "…";

function Separator({ motionSafe, index }: { motionSafe: boolean; index: number }) {
  return (
    <motion.svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 14 14"
      className="text-ink-3 mx-0.5 shrink-0"
      initial={motionSafe ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{
        delay: motionSafe ? index * cascade(6) : 0,
        duration: durations.fast,
      }}
    >
      <motion.path
        d="M5 3 9 7 5 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{
          delay: motionSafe ? index * cascade(6) : 0,
          duration: durations.base,
          ease: easings.enter,
        }}
      />
    </motion.svg>
  );
}

/**
 * A breadcrumb whose separators draw themselves in as a connected trail. When
 * the path outgrows its width the middle folds into an ellipsis that expands the
 * hidden crumbs back in on click. The last crumb is marked as the current page.
 * Under reduced motion the trail and any reveal appear without drawing.
 */
export function BreadcrumbTrail({
  ref,
  items,
  maxVisible = 4,
  label = "Breadcrumb",
  onNavigate,
  className,
}: BreadcrumbTrailProps) {
  const motionSafe = useMotionSafe();
  const [expanded, setExpanded] = React.useState(false);

  const collapsed = !expanded && items.length > maxVisible;
  const tailCount = Math.max(1, maxVisible - 2);
  const hidden = collapsed ? items.slice(1, items.length - tailCount) : [];

  const renderCrumb = (crumb: Crumb, index: number, isLast: boolean) => {
    const content = (
      <motion.span
        initial={motionSafe ? { opacity: 0, y: 4 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: motionSafe ? index * cascade(6) : 0,
          duration: durations.base,
          ease: easings.enter,
        }}
        className="inline-flex"
      >
        {isLast ? (
          <span
            aria-current="page"
            className="text-ink truncate font-medium"
          >
            {crumb.label}
          </span>
        ) : crumb.href || onNavigate ? (
          <a
            href={crumb.href ?? "#"}
            onClick={(event) => {
              if (onNavigate) {
                event.preventDefault();
                onNavigate(crumb);
              }
            }}
            className="text-ink-2 hover:text-ink focus-visible:ring-cobalt-bright/50 truncate rounded-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            {crumb.label}
          </a>
        ) : (
          <span className="text-ink-2 truncate">{crumb.label}</span>
        )}
      </motion.span>
    );
    return content;
  };

  return (
    <nav ref={ref} aria-label={label} className={cn("min-w-0", className)}>
      <ol className="text-ink-2 flex flex-wrap items-center gap-y-1 text-sm">
        {items.map((crumb, index) => {
          const isLast = index === items.length - 1;
          const isFirst = index === 0;

          if (collapsed && index > 0 && index < items.length - tailCount) {
            // Render the ellipsis once, in place of the first hidden crumb.
            if (index === 1) {
              return (
                <li key="ellipsis" className="flex min-w-0 items-center">
                  <Separator motionSafe={motionSafe} index={index} />
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    aria-label={`Show ${hidden.length} hidden ${
                      hidden.length === 1 ? "crumb" : "crumbs"
                    }`}
                    className="text-ink-3 hover:text-ink hover:bg-surface-2 focus-visible:ring-cobalt-bright/50 rounded-1 px-1.5 leading-none transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {ELLIPSIS}
                  </button>
                </li>
              );
            }
            return null;
          }

          return (
            <li key={crumb.id} className="flex min-w-0 items-center">
              {!isFirst && <Separator motionSafe={motionSafe} index={index} />}
              {renderCrumb(crumb, index, isLast)}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
