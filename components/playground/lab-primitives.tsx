"use client";

import { RotateCcw } from "lucide-react";

import { CopyButton } from "@/components/docs/copy-button";
import { cn } from "@/registry/lib/utils";

/** Three-zone lab body: control rail (left), stage (right/top), code strip (bottom). */
export function LabBody({
  controls,
  stage,
  code,
}: {
  controls: React.ReactNode;
  stage: React.ReactNode;
  code: React.ReactNode;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <div className="border-hairline bg-surface-1 h-fit rounded-3 border p-4 lg:sticky lg:top-20">
        <p className="text-label text-ink-3 mb-4">CONTROL RAIL</p>
        <div className="space-y-5">{controls}</div>
      </div>
      <div className="min-w-0 space-y-5">
        {stage}
        {code}
      </div>
    </div>
  );
}

/** The specimen stage a lab experiment runs on. */
export function LabStage({
  children,
  onReplay,
  label = "STAGE",
  className,
  minHeight = 320,
}: {
  children: React.ReactNode;
  onReplay?: () => void;
  label?: string;
  className?: string;
  minHeight?: number;
}) {
  return (
    <div className="border-hairline bg-surface-1 relative overflow-hidden rounded-3 border">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="text-label text-ink-3 select-none">{label}</span>
        {onReplay ? (
          <button
            type="button"
            onClick={onReplay}
            className="text-ink-3 hover:text-ink flex items-center gap-1.5 font-mono text-[11px] tracking-wide uppercase transition-colors"
          >
            <RotateCcw aria-hidden className="size-3" />
            Replay
          </button>
        ) : null}
      </div>
      <div
        className={cn("flex items-center justify-center p-8", className)}
        style={{ minHeight }}
      >
        {children}
      </div>
    </div>
  );
}

/** A labeled slider row for the control rail (native range, lab-styled). */
export function LabSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-ink text-sm font-medium">{label}</span>
        <span className="text-ink-2 font-mono text-xs tabular-nums">
          {format(value)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-cobalt-bright mt-2 block w-full"
      />
      {hint ? <span className="text-ink-3 mt-1 block text-xs">{hint}</span> : null}
    </label>
  );
}

/** Chip-set selector for presets and modes. */
export function LabChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="text-ink text-sm font-medium">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={option === value}
            className={cn(
              "rounded-1 border px-2 py-0.5 font-mono text-xs transition-colors",
              option === value
                ? "border-cobalt text-cobalt-bright bg-cobalt-wash"
                : "border-hairline text-ink-2 hover:text-ink",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Live code strip: a mono template whose interpolated values render
 * highlighted. The string passed to CopyButton is exactly what's shown.
 */
export function LiveCode({
  code,
  values,
}: {
  /** Full code string (used for copy). */
  code: string;
  /** Substrings to highlight (current parameter values). */
  values?: string[];
}) {
  const highlighted = values?.length
    ? code.split(new RegExp(`(${values.map(escapeRegExp).join("|")})`, "g"))
    : [code];

  return (
    <figure className="border-hairline bg-surface-1 overflow-hidden rounded-3 border">
      <figcaption className="border-hairline flex h-10 items-center justify-between border-b pr-1.5 pl-4">
        <span className="text-label text-ink-3">LIVE CODE · MIRRORS THE STAGE</span>
        <CopyButton value={code} />
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        {highlighted.map((part, i) =>
          values?.includes(part) ? (
            <span key={i} className="text-cobalt-bright font-semibold">
              {part}
            </span>
          ) : (
            <span key={i} className="text-ink-2">
              {part}
            </span>
          ),
        )}
      </pre>
    </figure>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
