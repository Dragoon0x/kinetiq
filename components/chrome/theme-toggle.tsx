"use client";

import { useCallback } from "react";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/chrome/theme-provider";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";

/**
 * Flips the theme inside a View Transition when available: a clip-path
 * circle expands from the toggle. Firefox (and reduced motion) get an
 * instant swap with the identical end state.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const motionSafe = useMotionSafe();

  const onToggle = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const next = theme === "dark" ? "light" : "dark";

      if (!motionSafe || !document.startViewTransition) {
        setTheme(next);
        return;
      }

      const { clientX, clientY } = event;
      // Keyboard "clicks" report (0,0); expand from the button instead.
      let x = clientX;
      let y = clientY;
      if (x === 0 && y === 0) {
        const rect = event.currentTarget.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      }

      const transition = document.startViewTransition(() => setTheme(next));
      transition.ready
        .then(() => {
          const radius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y),
          );
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${radius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 480,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              pseudoElement: "::view-transition-new(root)",
            },
          );
        })
        .catch(() => {
          // Transition was skipped (rapid toggling); the theme still applied.
        });
    },
    [motionSafe, setTheme, theme],
  );

  return (
    <button
      type="button"
      onClick={onToggle}
      className={className}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      data-theme-toggle=""
    >
      {theme === "dark" ? (
        <Sun aria-hidden className="size-4" />
      ) : (
        <Moon aria-hidden className="size-4" />
      )}
    </button>
  );
}
