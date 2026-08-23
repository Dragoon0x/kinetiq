"use client";

import * as React from "react";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { TraceInput } from "@/registry/ui/trace-input";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type InviteRole = {
  id: string;
  label: string;
  /** Exactly what this role can and cannot do. */
  can: string;
  cannot: string;
};

export type PendingInvite = { id: string; email: string; roleId: string };

export type OnboardingInviteCrewProps = {
  wordmark?: string;
  headline?: string;
  copy?: string;
  roles?: InviteRole[];
  skipLabel?: string;
  skipHref?: string;
  onSend?: (invites: PendingInvite[]) => void;
  /** What the invitee actually receives. */
  whatTheyGetLine?: string;
  className?: string;
};

const DEFAULT_ROLES: InviteRole[] = [
  {
    id: "crew",
    label: "Crew",
    can: "Read the board at the gate and acknowledge their slots",
    cannot: "Change a plan or see any other yard",
  },
  {
    id: "lead",
    label: "Yard lead",
    can: "Cut, sign, and override boards for this yard",
    cannot: "Change billing or add other yards",
  },
  {
    id: "owner",
    label: "Owner",
    can: "Everything, including billing and inviting others",
    cannot: "Delete the record — nobody can",
  },
];

/**
 * Inviting the crew, with each role's powers stated in full before anyone is
 * added: what it can do, and — the half almost every invite screen omits —
 * what it cannot. Permissions are the thing people get wrong at setup and
 * discover months later, usually when someone could see something they should
 * not have.
 */
export function OnboardingInviteCrew({
  wordmark = "WAYLIGHT",
  headline = "Who else is on this yard?",
  copy = "Add as many as you like now, or none — you can invite people any time from settings.",
  roles = DEFAULT_ROLES,
  skipLabel = "Skip for now",
  skipHref = "/",
  onSend,
  whatTheyGetLine = "They get one email with a link. No account is created until they use it, and an unused invite expires in fourteen days.",
  className,
}: OnboardingInviteCrewProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();

  const [email, setEmail] = React.useState("");
  const [roleId, setRoleId] = React.useState(roles[0]?.id ?? "");
  const [invites, setInvites] = React.useState<PendingInvite[]>([]);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const role = roles.find((r) => r.id === roleId) ?? roles[0];

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    if (invites.some((i) => i.email.toLowerCase() === value.toLowerCase())) {
      setError("That address is already on the list.");
      return;
    }
    setError(null);
    setInvites((prev) => [
      ...prev,
      { id: `${value}-${prev.length}`, email: value, roleId },
    ]);
    setEmail("");
  };

  return (
    <main className={cn("min-h-screen bg-surface-0 px-6 py-16", className)}>
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-[11px] tracking-[0.18em] text-ink-3">
            {wordmark}
          </p>
          <a
            href={skipHref}
            className="text-xs text-ink-3 underline underline-offset-4 transition-colors hover:text-ink"
          >
            {skipLabel}
          </a>
        </div>

        <h1
          id={headingId}
          className="mt-8 text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
        >
          {headline}
        </h1>
        <p className="mt-3 leading-relaxed text-ink-2">{copy}</p>

        <form onSubmit={add} className="mt-8 flex flex-wrap items-start gap-2">
          <TraceInput
            label="Email"
            labelHidden
            type="email"
            placeholder="crew@yard.example"
            value={email}
            onChange={(event) => {
              setError(null);
              setEmail(event.target.value);
            }}
            error={error ?? undefined}
            className="min-w-0 flex-1"
            disabled={sent}
          />
          <PressureButton
            type="submit"
            variant="outline"
            className="h-11 shrink-0"
            disabled={sent}
          >
            Add
          </PressureButton>
        </form>

        {/* The role's powers are stated before anyone is added, not after. */}
        <fieldset className="mt-6" disabled={sent}>
          <legend className="text-label text-ink-3">As</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {roles.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === roleId}
                onClick={() => setRoleId(option.id)}
                className={cn(
                  "rounded-2 border px-3 py-1.5 text-sm transition-colors",
                  option.id === roleId
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-hairline text-ink-2 hover:border-hairline-strong hover:text-ink",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {role && (
            <dl className="mt-4 grid gap-3 rounded-4 border border-hairline bg-surface-1 p-4 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-label text-[var(--success,var(--primary))]">
                  Can
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink-2">
                  {role.can}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-label text-ink-3">Cannot</dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink-2">
                  {role.cannot}
                </dd>
              </div>
            </dl>
          )}
        </fieldset>

        {invites.length > 0 && (
          <ul className="mt-6 flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {invites.map((invite) => (
                <motion.li
                  key={invite.id}
                  layout={motionSafe}
                  initial={{
                    opacity: 0,
                    y: motionSafe ? -distances.nudge : 0,
                  }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    x: motionSafe ? -distances.shift : 0,
                    transition: exitFor(
                      motionSafe ? durations.base : durations.fast,
                    ),
                  }}
                  transition={
                    motionSafe
                      ? { duration: durations.base, ease: easings.enter }
                      : { duration: 0 }
                  }
                  className="flex min-w-0 items-center gap-3 rounded-2 border border-hairline px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {invite.email}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                    {roles.find((r) => r.id === invite.roleId)?.label}
                  </span>
                  {!sent && (
                    <button
                      type="button"
                      aria-label={`Remove ${invite.email}`}
                      onClick={() =>
                        setInvites((prev) =>
                          prev.filter((i) => i.id !== invite.id),
                        )
                      }
                      className="shrink-0 text-ink-3 transition-colors hover:text-ink"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-hairline pt-6">
          <PressureButton
            size="lg"
            disabled={invites.length === 0 || sent}
            onClick={() => {
              setSent(true);
              onSend?.(invites);
            }}
          >
            {sent ? "Invites sent" : "Send invites"}
          </PressureButton>
          {invites.length > 0 && !sent && (
            <p className="flex items-baseline gap-1.5 text-sm text-ink-3">
              <Readout value={invites.length} />
              <span>{invites.length === 1 ? "person" : "people"}</span>
            </p>
          )}
          {sent && <StatusSeal variant="success">on their way</StatusSeal>}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          {whatTheyGetLine}
        </p>
      </div>
    </main>
  );
}
