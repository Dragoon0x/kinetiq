import { cn } from "@/registry/lib/utils";

/** The Kinetiq mark: a specimen tile with a spring-displaced K baseline. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="border-hairline-strong bg-surface-1 text-cobalt-bright flex size-6 items-center justify-center rounded-1 border font-mono text-[13px] font-bold"
      >
        K
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Kinetiq</span>
    </span>
  );
}
