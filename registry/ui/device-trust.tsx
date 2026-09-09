"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DeviceTrustDevice = {
  name: string;
  platform: string;
  location: string;
  /** A static string — the card keeps no clock. */
  lastSeen: string;
  kind: "laptop" | "phone";
};

export type DeviceTrustProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled trust. */
  trusted?: boolean;
  /** Initial trust for uncontrolled usage. @default false */
  defaultTrusted?: boolean;
  /** Fires from the Revoke press with `false`; granting goes through `onTrust`. */
  onTrustedChange?: (trusted: boolean) => void;
  /** Fires from the Trust press; the host approves and sets `trusted`. */
  onTrust?: () => void;
  /** The host is approving: the button turns its ring and is busy. @default false */
  pending?: boolean;
  device: DeviceTrustDevice;
  /** How long a trusted device is remembered. @default 30 */
  days?: number;
  /** Visible heading. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** The seal's resting tilt: a stamp never lands square. */
const TILT = -8;

function DeviceGlyph({ kind }: { kind: DeviceTrustDevice["kind"] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
    >
      {kind === "laptop" ? (
        <>
          <rect x="4" y="5" width="16" height="11" rx="1.5" />
          <path d="M2 19h20" />
        </>
      ) : (
        <>
          <rect x="7" y="3" width="10" height="18" rx="2" />
          <path d="M11 17.5h2" />
        </>
      )}
    </svg>
  );
}

/** The seal: a ring of type around a tick, procedural so it scales. */
function Seal({ id, motionSafe }: { id: string; motionSafe: boolean }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden
      className="block size-full text-primary"
    >
      <circle
        cx="24"
        cy="24"
        r="23"
        className="fill-surface-0"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="24"
        cy="24"
        r="15.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.75"
        strokeDasharray="1.5 1.5"
      />
      <path
        id={id}
        d="M24 5.5a18.5 18.5 0 1 1 0 37a18.5 18.5 0 1 1 0-37"
        fill="none"
      />
      <text
        fontSize="5.4"
        fontWeight="700"
        letterSpacing="1.2"
        fill="currentColor"
        className="font-mono"
      >
        <textPath href={`#${id}`} startOffset="0">
          TRUSTED · DEVICE · TRUSTED · DEVICE ·
        </textPath>
      </text>
      <motion.path
        d="M17 24.5 21.5 29 31 19"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={
          motionSafe ? { ...springs.flick, delay: 0.16 } : { duration: 0 }
        }
      />
    </svg>
  );
}

/**
 * A card for one signed-in device with a single control that grants or
 * revokes trust. Approval stamps a round seal onto the card: it lands from 1.6×
 * and a tilt on `recoil`, the two bounces of a stamp on paper, while an impact
 * ring spreads from under it and fades, and its tick draws on `flick`. Hovering
 * or focusing Revoke lifts the seal's edge on `glide` — the corner catching, so
 * the peel is previewed before it is taken — and revoking peels it away: the
 * seal rotates off its left edge on the exit ease with perspective and fades.
 * Nothing bounces on the way out.
 *
 * The button is the only control; while the host is `pending` it turns a ring
 * at a constant rate and is busy. Trust changes are announced once. Under
 * reduced motion the seal appears at rest with its tick drawn, the ring holds
 * still beside the word, the lift is skipped and revoking fades the seal out.
 */
export function DeviceTrust({
  ref,
  trusted,
  defaultTrusted = false,
  onTrustedChange,
  onTrust,
  pending = false,
  device,
  days = 30,
  label,
  className,
  "aria-label": ariaLabel,
}: DeviceTrustProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const nameId = `${baseId}-name`;
  const ringId = `${baseId}-ring`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultTrusted);
  const isControlled = trusted !== undefined;
  const isTrusted = isControlled ? trusted : uncontrolled;
  const [lifted, setLifted] = React.useState(false);

  // Whether trust was ever taken away, so the announcement can say "revoked"
  // rather than nothing. Derived during render, never in an effect.
  const [history, setHistory] = React.useState({
    trusted: isTrusted,
    revoked: false,
  });
  if (history.trusted !== isTrusted) {
    setHistory({ trusted: isTrusted, revoked: !isTrusted });
  }

  const press = () => {
    if (pending) return;
    if (isTrusted) {
      if (!isControlled) setUncontrolled(false);
      setLifted(false);
      onTrustedChange?.(false);
    } else {
      onTrust?.();
    }
  };

  const footer = isTrusted
    ? `Remembered for ${days} days`
    : pending
      ? "Waiting for approval"
      : "Asks for a code every time";
  const announcement = pending
    ? "Approving"
    : isTrusted
      ? `Trusted for ${days} days`
      : history.revoked
        ? "Trust revoked"
        : "";
  const buttonLabel = pending
    ? "Approving"
    : isTrusted
      ? "Revoke trust"
      : "Trust this device";

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : nameId}
      aria-label={label ? undefined : ariaLabel}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      {label ? (
        <span id={labelId} className="text-sm font-semibold">
          {label}
        </span>
      ) : null}

      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2">
          <DeviceGlyph kind={device.kind} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={nameId} className="truncate text-sm font-medium">
            {device.name}
          </span>
          <span className="truncate text-xs text-ink-3">
            {device.platform} · {device.location}
          </span>
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Last seen {device.lastSeen}
          </span>
        </span>

        {/* The seal's place is drawn even while empty, so the stamp lands on
            a spot the eye already knows rather than pushing the row apart. */}
        <span
          aria-hidden
          className="relative size-12 shrink-0"
          style={{ perspective: 400 }}
        >
          <span
            className={cn(
              "absolute inset-1 rounded-full border border-dashed border-hairline-strong transition-opacity",
              isTrusted ? "opacity-0" : "opacity-100",
            )}
          />
          <AnimatePresence>
            {isTrusted ? (
              <React.Fragment key="seal">
                {motionSafe ? (
                  <motion.span
                    className="absolute inset-0 rounded-full border-2 border-primary"
                    initial={{ scale: 0.8, opacity: 0.6 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{
                      duration: durations.slow,
                      ease: easings.exit,
                      delay: 0.08,
                    }}
                  />
                ) : null}
                <motion.span
                  className="absolute inset-0 drop-shadow-sm"
                  style={{ originX: 0, originY: 0.5 }}
                  initial={
                    motionSafe
                      ? { scale: 1.6, rotate: -20, opacity: 0, rotateY: 0 }
                      : { opacity: 0 }
                  }
                  animate={
                    motionSafe
                      ? {
                          scale: 1,
                          rotate: TILT,
                          opacity: 1,
                          rotateY: lifted ? 18 : 0,
                          x: lifted ? 2 : 0,
                        }
                      : { opacity: 1, rotate: TILT }
                  }
                  exit={
                    motionSafe
                      ? {
                          rotateY: 80,
                          x: 10,
                          opacity: 0,
                          transition: {
                            duration: durations.slow,
                            ease: easings.exit,
                          },
                        }
                      : { opacity: 0, transition: exitFor() }
                  }
                  transition={
                    motionSafe
                      ? {
                          ...springs.recoil,
                          rotateY: springs.glide,
                          x: springs.glide,
                          opacity: { duration: durations.blink },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <Seal id={ringId} motionSafe={motionSafe} />
                </motion.span>
              </React.Fragment>
            ) : null}
          </AnimatePresence>
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <span className="grid min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={footer}
              className={cn(
                "col-start-1 row-start-1 truncate text-xs",
                isTrusted ? "text-success" : "text-ink-3",
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {footer}
            </motion.span>
          </AnimatePresence>
        </span>
        <button
          type="button"
          aria-busy={pending || undefined}
          aria-disabled={pending || undefined}
          onClick={press}
          onPointerEnter={() => setLifted(isTrusted)}
          onPointerLeave={() => setLifted(false)}
          onFocus={() => setLifted(isTrusted)}
          onBlur={() => setLifted(false)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-2 px-4 text-sm font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            pending
              ? "cursor-default bg-cobalt-wash text-foreground"
              : isTrusted
                ? "border border-hairline-strong bg-transparent text-foreground hover:bg-accent"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {pending ? (
            <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0">
              <circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.25"
                strokeWidth="2"
              />
              <motion.circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="0.28 0.72"
                style={{ originX: 0.5, originY: 0.5 }}
                animate={{ rotate: motionSafe ? 360 : 0 }}
                // A wait turns at a constant rate; reduced motion holds it still.
                transition={
                  motionSafe
                    ? { duration: 1, ease: easings.linear, repeat: Infinity }
                    : { duration: 0 }
                }
              />
            </svg>
          ) : null}
          {buttonLabel}
        </button>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
