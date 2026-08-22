"use client";

import * as React from "react";

import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BenchMember = {
  id: string;
  name: string;
  role: string;
  /** One working line — what they actually tend. */
  tends: string;
  link?: { label: string; href: string };
};

export type TeamBenchRosterProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  members?: BenchMember[];
  className?: string;
};

const DEFAULT_MEMBERS: BenchMember[] = [
  { id: "m1", name: "Mara Aldana", role: "Founder", tends: "The calibration set and the last word on feel", link: { label: "Notes", href: "#notes-aldana" } },
  { id: "m2", name: "Tomas Brekke", role: "Engineering", tends: "The run ledger and everything it promises", link: { label: "Notes", href: "#notes-brekke" } },
  { id: "m3", name: "Suki Okonkwo", role: "Design", tends: "Every surface a hand actually touches", link: { label: "Notes", href: "#notes-okonkwo" } },
  { id: "m4", name: "Lior Ferro", role: "Field", tends: "Yards, visits, and the notebook of what broke", link: { label: "Notes", href: "#notes-ferro" } },
  { id: "m5", name: "Ada Reyes", role: "Support", tends: "The four-hour promise and the people behind it", link: { label: "Notes", href: "#notes-reyes" } },
  { id: "m6", name: "Piotr Iyer", role: "Research", tends: "The bench after this one", link: { label: "Notes", href: "#notes-iyer" } },
];

/** Deterministic initials plate — the house answer to the headshot grid. */
function InitialsPlate({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className="border-hairline bg-surface-0 text-ink-2 rounded-2 flex size-11 shrink-0 items-center justify-center border font-mono text-sm tracking-[0.08em]"
    >
      {initials}
    </span>
  );
}

/**
 * The team as a bench roster: initials plates instead of headshots, a role,
 * and — the line that matters — what each person actually tends. Cards arrive
 * on the cascade and lift under the pointer on the house shadow. A roster
 * that says what everyone owns tells a truer story than a wall of faces.
 */
export function TeamBenchRoster({
  eyebrow = "Fieldline · the bench",
  headline = "Six people, six things tended.",
  copy = "Small on purpose. Everyone on this page answers for something you can point at.",
  members = DEFAULT_MEMBERS,
  className,
}: TeamBenchRosterProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(members.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member, index) => (
            <motion.li
              key={member.id}
              initial={{
                opacity: motionSafe ? 0 : 1,
                y: motionSafe ? distances.shift : 0,
              }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              whileHover={motionSafe ? { y: -3 } : undefined}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
              className="border-hairline bg-surface-1 rounded-4 border p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <InitialsPlate name={member.name} />
                  <div>
                    <p className="text-ink font-medium">{member.name}</p>
                    <p className="text-ink-3 mt-0.5 font-mono text-[10px] tracking-[0.08em] uppercase">
                      {member.role}
                    </p>
                  </div>
                </div>
                {member.link && (
                  <a
                    href={member.link.href}
                    className="text-ink-3 hover:text-ink inline-flex items-center gap-1 text-xs transition-colors"
                  >
                    {member.link.label}
                    <ArrowUpRight className="size-3" aria-hidden />
                  </a>
                )}
              </div>
              <p className="text-ink-2 border-hairline mt-4 border-t pt-3 text-sm leading-relaxed">
                {member.tends}
              </p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
