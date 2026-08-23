"use client";

import * as React from "react";

import { motion } from "motion/react";

import { NewsletterBackIssues } from "@/registry/blocks/newsletter-back-issues/newsletter-back-issues";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Post = {
  id: string;
  title: string;
  standfirst: string;
  /** Pre-formatted date — the page never touches a clock. */
  date: string;
  readMinutes: number;
  topic: string;
  href: string;
  /** The one held at the top, set larger. */
  lead?: boolean;
};

export type BlogIndexProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  posts?: Post[];
  className?: string;
};

const DEFAULT_POSTS: Post[] = [
  {
    id: "p1",
    title: "We got tide modelling wrong for four months",
    standfirst:
      "A one-hour offset in a single timezone, four yards affected, and the review process that should have caught it in week one.",
    date: "18 February",
    readMinutes: 9,
    topic: "Post-mortem",
    href: "#p1",
    lead: true,
  },
  {
    id: "p2",
    title: "What a crane hold actually costs, measured across nine yards",
    standfirst:
      "We had a number in the pitch deck for two years. Here is what happened when we finally measured it.",
    date: "4 March",
    readMinutes: 6,
    topic: "Measurement",
    href: "#p2",
  },
  {
    id: "p3",
    title: "Why we stopped shipping a mobile app",
    standfirst:
      "Crews have phones. They also have gloves, glare, and no signal in a shed. The gate screen won.",
    date: "4 February",
    readMinutes: 5,
    topic: "Product",
    href: "#p3",
  },
  {
    id: "p4",
    title: "Reading a shift plan in the rain",
    standfirst:
      "A field note on type size, contrast, and why every confirmation dialog we shipped came back out.",
    date: "21 January",
    readMinutes: 4,
    topic: "Field note",
    href: "#p4",
  },
];

/**
 * The writing index, led by the post the company would rather not lead with.
 * A blog that opens on a launch announcement tells the reader it exists to
 * market; one that opens on a post-mortem tells them it exists to be read,
 * and the second is the only reason anyone subscribes.
 */
export function BlogIndex({
  eyebrow = "Waylight · writing",
  headline = "Mostly what we got wrong.",
  copy = "Post-mortems, measurements, and field notes from yards. Roughly every second Tuesday, and nothing is gated.",
  posts = DEFAULT_POSTS,
  className,
}: BlogIndexProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(posts.length);

  const lead = posts.find((post) => post.lead);
  const rest = posts.filter((post) => post !== lead);

  return (
    <main className={cn("min-h-screen bg-surface-0", className)}>
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-24">
        <p className="text-label text-ink-3">{eyebrow}</p>
        <h1
          id={headingId}
          className="mt-3 text-4xl font-semibold tracking-tight text-balance"
        >
          {headline}
        </h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-ink-2">{copy}</p>

        {lead && (
          <motion.article
            initial={{ opacity: motionSafe ? 0 : 1 }}
            animate={{ opacity: 1 }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
            className="mt-12 border-t border-hairline pt-8"
          >
            <p className="flex flex-wrap items-baseline gap-x-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              <span>{lead.topic}</span>
              <span>
                {lead.date} · {lead.readMinutes} min
              </span>
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
              <a
                href={lead.href}
                className="transition-colors hover:text-primary"
              >
                {lead.title}
              </a>
            </h2>
            <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-2">
              {lead.standfirst}
            </p>
          </motion.article>
        )}

        <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {rest.map((post, index) => (
            <motion.li
              key={post.id}
              initial={{ opacity: motionSafe ? 0 : 1 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
              className="min-w-0 border-t border-hairline pt-5"
            >
              <p className="flex flex-wrap items-baseline gap-x-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                <span>{post.topic}</span>
                <span>
                  {post.date} · {post.readMinutes} min
                </span>
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-balance">
                <a
                  href={post.href}
                  className="transition-colors hover:text-primary"
                >
                  {post.title}
                </a>
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                {post.standfirst}
              </p>
            </motion.li>
          ))}
        </ul>
      </div>

      <NewsletterBackIssues />
    </main>
  );
}
