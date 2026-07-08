"use client";

import { Gauge } from "lucide-react";

import { useMotionTest } from "@/components/providers";
import { cn } from "@/registry/lib/utils";

/**
 * Site-wide reduced-motion test: forces every demo on the site into its
 * reduced pathway so the fallbacks can be inspected, not just trusted.
 */
export function MotionTestSwitch({ className }: { className?: string }) {
  const { testingReducedMotion, setTestingReducedMotion } = useMotionTest();

  return (
    <button
      type="button"
      onClick={() => setTestingReducedMotion(!testingReducedMotion)}
      aria-pressed={testingReducedMotion}
      title="Test reduced motion"
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-2 border px-2 font-mono text-[10px] tracking-wide uppercase transition-colors",
        testingReducedMotion
          ? "border-cobalt text-cobalt-bright bg-cobalt-wash"
          : "border-hairline text-ink-3 hover:text-ink-2 hover:border-hairline-strong",
        className,
      )}
    >
      <Gauge aria-hidden className="size-3.5" />
      <span className="hidden md:inline">
        {testingReducedMotion ? "RM · ON" : "RM · TEST"}
      </span>
    </button>
  );
}
