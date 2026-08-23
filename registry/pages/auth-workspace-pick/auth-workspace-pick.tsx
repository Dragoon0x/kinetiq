"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

import { StatusPip } from "@/registry/ui/status-pip";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Workspace = {
  id: string;
  name: string;
  /** Your role here, in the system's own words. */
  role: string;
  /** How many yards this workspace holds. */
  yards: number;
  /** Live when something is running in it right now. */
  live?: boolean;
};

export type AuthWorkspacePickProps = {
  wordmark?: string;
  headline?: string;
  copy?: string;
  /** Who is signed in, so a wrong account is obvious before anything else. */
  signedInAs?: string;
  workspaces?: Workspace[];
  onPick?: (id: string) => void;
  /** The path for someone whose workspace is not listed. */
  missingLine?: string;
  switchAccountHref?: string;
  className?: string;
};

const DEFAULT_WORKSPACES: Workspace[] = [
  {
    id: "w1",
    name: "North Basin Terminal",
    role: "Yard owner",
    yards: 4,
    live: true,
  },
  { id: "w2", name: "Fieldline North", role: "Operations", yards: 9 },
  { id: "w3", name: "Halyard Works", role: "Read only", yards: 1 },
];

/**
 * The workspace picker, which exists because "you are in more than one
 * organisation" is a normal state that most products treat as an edge case.
 * Each row carries the role you hold there, so it is obvious before clicking
 * which one lets you actually do the thing you signed in to do — and the
 * account you are signed in as is stated at the top, because the commonest
 * cause of an empty list is the wrong account.
 */
export function AuthWorkspacePick({
  wordmark = "WAYLIGHT",
  headline = "Which one today?",
  copy = "You are in three. Your role differs in each, so it is printed beside the name.",
  signedInAs = "m.aldana@northbasin.example",
  workspaces = DEFAULT_WORKSPACES,
  onPick,
  missingLine = "Expecting one that is not here? It is almost always the wrong account — check the address above first, then ask that workspace's owner to invite this one.",
  switchAccountHref = "/sign-in",
  className,
}: AuthWorkspacePickProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(workspaces.length);

  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface-0 px-6 py-16",
        className,
      )}
    >
      <div className="w-full max-w-md">
        <p className="font-mono text-[11px] tracking-[0.18em] text-ink-3">
          {wordmark}
        </p>
        <h1
          id={headingId}
          className="mt-6 text-3xl font-semibold tracking-tight text-ink"
        >
          {headline}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{copy}</p>

        <p className="mt-4 text-xs text-ink-3">
          Signed in as{" "}
          <span className="font-mono text-ink-2">{signedInAs}</span>
          {" · "}
          <a
            href={switchAccountHref}
            className="underline underline-offset-4 transition-colors hover:text-ink"
          >
            not you?
          </a>
        </p>

        <ul className="mt-8 flex flex-col gap-2">
          {workspaces.map((workspace, index) => (
            <motion.li
              key={workspace.id}
              initial={{ opacity: motionSafe ? 0 : 1 }}
              animate={{ opacity: 1 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
            >
              <button
                type="button"
                onClick={() => onPick?.(workspace.id)}
                className="group flex w-full min-w-0 items-center gap-4 rounded-4 border border-hairline p-4 text-left transition-colors hover:border-hairline-strong hover:bg-surface-1"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-ink">
                      {workspace.name}
                    </span>
                    {workspace.live && (
                      <StatusPip
                        status="online"
                        label="running"
                        pulse={motionSafe}
                      />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-ink-3">
                    {workspace.role} · {workspace.yards}{" "}
                    {workspace.yards === 1 ? "yard" : "yards"}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-primary"
                />
              </button>
            </motion.li>
          ))}
        </ul>

        <p className="mt-8 border-t border-hairline pt-6 text-xs leading-relaxed text-ink-3">
          {missingLine}
        </p>
      </div>
    </main>
  );
}
