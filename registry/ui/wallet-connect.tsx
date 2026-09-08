"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WalletConnectStatus = "idle" | "pending" | "connected" | "rejected";

export type WalletConnectProps = {
  ref?: React.Ref<HTMLElement>;
  /** Controlled state of the handshake. */
  status?: WalletConnectStatus;
  /** Initial state for uncontrolled usage. @default "idle" */
  defaultStatus?: WalletConnectStatus;
  /** Fires from the press that changed the state. */
  onStatusChange?: (status: WalletConnectStatus) => void;
  /** Who is asking. Its node draws the initials. */
  appName: string;
  /** Who is being asked. Its node draws a wallet. */
  walletName: string;
  /** Shown abbreviated under the stage once connected. */
  address?: string;
  /** Fires from the connect press, before the host has answered. */
  onRequest?: () => void;
  /** Fires from the cancel press while pending. */
  onCancel?: () => void;
  /** Fires from the disconnect press while connected. */
  onDisconnect?: () => void;
  /** Visible heading. @default "Connect a wallet" */
  label?: React.ReactNode;
  className?: string;
};

/** How far apart the rail holds the nodes in each state, as a share of the stage. */
const RAIL: Record<WalletConnectStatus, string> = {
  idle: "100%",
  pending: "72%",
  connected: "60%",
  rejected: "100%",
};

/** The link finishes drawing before the tick lands, so the seal reads as the last beat. */
const SEAL_DELAY = 0.26;

/** Two letters, so a one-word name still reads as a mark rather than a letter. */
const initialsOf = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const mark =
    words.length === 1
      ? words[0]!.slice(0, 2)
      : `${words[0]!.charAt(0)}${words[1]!.charAt(0)}`;
  return mark.toUpperCase();
};

const abbreviate = (value: string) =>
  value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;

function Node({
  kind,
  name,
  breathing,
  motionSafe,
}: {
  kind: "app" | "wallet";
  name: string;
  breathing: boolean;
  motionSafe: boolean;
}) {
  return (
    <span className="flex w-16 shrink-0 flex-col items-center gap-1.5">
      <motion.span
        className="grid size-12 place-items-center rounded-3 border border-hairline-strong bg-surface-1 text-ink-2"
        animate={{ scale: breathing ? 1.05 : 1 }}
        transition={
          breathing
            ? {
                duration: 1.1,
                ease: easings.move,
                repeat: Infinity,
                repeatType: "reverse",
              }
            : motionSafe
              ? springs.glide
              : { duration: 0 }
        }
      >
        {kind === "app" ? (
          <span className="font-mono text-[13px] font-semibold text-foreground">
            {initialsOf(name)}
          </span>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6"
          >
            <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H17a2 2 0 0 1 2 2v1" />
            <rect x="4" y="8.5" width="16" height="9.5" rx="2.2" />
            <circle
              cx="15.6"
              cy="13.2"
              r="1.1"
              fill="currentColor"
              stroke="none"
            />
          </svg>
        )}
      </motion.span>
      <span className="w-full truncate text-center text-[10px] text-ink-3">
        {name}
      </span>
    </span>
  );
}

/**
 * The handshake, drawn. Two procedural nodes sit at the ends of a rail; asking
 * to connect narrows that rail from the full stage to a share of it on
 * `glide`, so the nodes approach without either of them owning a pixel
 * measurement — the rail is the only thing that knows how wide the stage is,
 * which is why the choreography survives a phone. While the request is out the
 * wallet node breathes on a slow reversing tween.
 *
 * Approval draws the link across on `glide` and, delayed behind it, lands a
 * tick in a disc at the join on `flick` — a tick is a confirmation, and
 * confirmations flick. Refusal snaps the nodes back apart on `snap` while the
 * link falls away on the exit ease: a rejection separates, it never bounces.
 *
 * The stage is decoration; a `role="status"` line beneath it carries the state
 * in words, so the outcome is never colour alone, and the card's one control is
 * a real button whose label follows the state — Connect, Cancel, Disconnect,
 * Try again. Under reduced motion the nodes hold one position, the link swaps
 * from dashed to solid, and the tick appears complete.
 */
export function WalletConnect({
  ref,
  status,
  defaultStatus = "idle",
  onStatusChange,
  appName,
  walletName,
  address,
  onRequest,
  onCancel,
  onDisconnect,
  label = "Connect a wallet",
  className,
}: WalletConnectProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const [uncontrolled, setUncontrolled] =
    React.useState<WalletConnectStatus>(defaultStatus);
  const isControlled = status !== undefined;
  const current = isControlled ? status : uncontrolled;

  const go = (next: WalletConnectStatus) => {
    if (!isControlled) setUncontrolled(next);
    onStatusChange?.(next);
  };

  const press = () => {
    if (current === "pending") {
      go("idle");
      onCancel?.();
      return;
    }
    if (current === "connected") {
      go("idle");
      onDisconnect?.();
      return;
    }
    go("pending");
    onRequest?.();
  };

  const connected = current === "connected";
  const rejected = current === "rejected";
  const pending = current === "pending";

  const actionLabel = pending
    ? "Cancel request"
    : connected
      ? "Disconnect"
      : rejected
        ? "Try again"
        : "Connect";

  const line = pending
    ? `Waiting for approval on ${walletName}`
    : connected
      ? address
        ? `Connected as ${abbreviate(address)}`
        : `Connected to ${walletName}`
      : rejected
        ? "Request rejected"
        : "Not connected";

  const spoken = connected && address ? `Connected as ${address}` : line;

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <section
      ref={ref}
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2">
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors",
              connected
                ? "bg-success"
                : rejected
                  ? "bg-danger"
                  : pending
                    ? "bg-warn"
                    : "bg-ink-3",
            )}
          />
          <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
            {current}
          </span>
        </span>
      </div>

      <div
        aria-hidden
        className="relative flex h-28 items-center overflow-hidden rounded-2 border border-hairline bg-surface-0 px-3"
      >
        {/* Auto margins keep the rail centred while its width animates, so the
            nodes close on the middle without measuring the stage in pixels. */}
        <motion.div
          className="mx-auto flex w-full items-center"
          initial={false}
          animate={{ width: motionSafe ? RAIL[current] : RAIL.pending }}
          transition={
            motionSafe
              ? rejected
                ? springs.snap
                : springs.glide
              : { duration: 0 }
          }
        >
          <Node
            kind="app"
            name={appName}
            breathing={false}
            motionSafe={motionSafe}
          />

          <span className="relative mx-2 h-8 min-w-0 flex-1">
            <span
              className={cn(
                "absolute inset-x-0 top-1/2 border-t border-dashed transition-colors",
                rejected ? "border-danger" : "border-hairline-strong",
              )}
            />
            {/* The link is a bar that grows from the app's side: origin-left
                scaleX is the draw, and it needs no path maths to stay inside
                a stage of any width. */}
            <motion.span
              className="absolute inset-x-0 top-1/2 -mt-px h-0.5 origin-left rounded-full bg-cobalt-bright"
              initial={false}
              animate={{ scaleX: connected ? 1 : 0 }}
              transition={
                motionSafe
                  ? connected
                    ? springs.glide
                    : { duration: durations.fast, ease: easings.exit }
                  : { duration: 0 }
              }
            />
            <AnimatePresence>
              {connected ? (
                <motion.span
                  key="seal"
                  className="absolute top-1/2 left-1/2 grid size-6 place-items-center rounded-full border border-success bg-surface-0 text-success"
                  // Centring lives in the transform motion already owns; a
                  // Tailwind -translate class here would be wiped by it.
                  style={{ x: "-50%", y: "-50%" }}
                  initial={motionSafe ? { scale: 0 } : { opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? { ...springs.flick, delay: SEAL_DELAY }
                      : { duration: durations.fast }
                  }
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5"
                  >
                    <motion.path
                      d="M3.5 8.5 6.5 11.5 12.5 4.5"
                      initial={{ pathLength: motionSafe ? 0 : 1 }}
                      animate={{ pathLength: 1 }}
                      transition={
                        motionSafe
                          ? { ...springs.flick, delay: SEAL_DELAY + 0.06 }
                          : { duration: 0 }
                      }
                    />
                  </svg>
                </motion.span>
              ) : null}
            </AnimatePresence>
          </span>

          <Node
            kind="wallet"
            name={walletName}
            breathing={pending && motionSafe}
            motionSafe={motionSafe}
          />
        </motion.div>
      </div>

      <p aria-hidden className="flex h-5 items-center text-[11px] text-ink-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={line}
            className={cn(
              "min-w-0 truncate font-mono",
              connected
                ? "text-success"
                : rejected
                  ? "text-danger"
                  : "text-ink-3",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
          >
            {line}
          </motion.span>
        </AnimatePresence>
      </p>

      {/* The visible line is abbreviated for the eye; the spoken one carries
          the whole address, so nothing has to be reconstructed from an
          ellipsis. */}
      <span role="status" className="sr-only">
        {spoken}
      </span>

      <button
        type="button"
        onClick={press}
        className={cn(
          "flex h-9 items-center justify-center rounded-2 border text-xs font-medium transition-colors outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          connected || pending
            ? "border-input bg-surface-1 text-foreground hover:bg-accent"
            : "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {actionLabel}
      </button>
    </section>
  );
}
