"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { CartFly } from "@/registry/ui/cart-fly";

/** Procedural goods: a lit face, a shaded one. No assets. */
const swatch = (from: string, to: string): React.ReactNode => (
  <span
    className="block size-full"
    style={{ backgroundImage: `linear-gradient(140deg, ${from}, ${to})` }}
  />
);

const PRODUCTS = [
  {
    id: "lamp",
    name: "Waylight task lamp",
    price: "48.00",
    art: swatch("oklch(0.82 0.14 78)", "oklch(0.48 0.12 44)"),
  },
  {
    id: "planter",
    name: "Fernworks planter",
    price: "26.00",
    art: swatch("oklch(0.8 0.12 162)", "oklch(0.42 0.09 168)"),
  },
  {
    id: "flask",
    name: "Coldbrook flask",
    price: "34.00",
    art: swatch("oklch(0.76 0.07 232)", "oklch(0.4 0.07 244)"),
  },
];

export function CartFlyDemo() {
  const motionSafe = useMotionSafe();
  const cartRef = React.useRef<HTMLDivElement>(null);
  const bump = useMotionValue(1);
  const [count, setCount] = React.useState(0);

  const catchItem = () => {
    setCount((n) => n + 1);
    // Set high, settle on recoil: two visible bounces is the cart taking a
    // knock. Two keyframes, because a spring only ever honours two.
    if (motionSafe) animate(bump, [1.18, 1], springs.recoil);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
        <header className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks supply
          </span>
          <motion.div
            ref={cartRef}
            style={{ scale: bump }}
            className="flex h-8 items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-2 pr-2.5 pl-2"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="size-4 shrink-0 text-ink-2"
            >
              <path d="M1.5 2h1.8l1.6 7.4h6.9l1.7-5.4H4.2M5.6 12.4h.01M11.4 12.4h.01" />
            </svg>
            <span className="sr-only">In cart</span>
            <span className="relative flex h-4 w-5 items-center justify-center overflow-hidden">
              <motion.span
                key={count}
                initial={motionSafe ? { y: 10, opacity: 0 } : { opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={springs.snap}
                className="font-mono text-[11px] text-ink tabular-nums"
              >
                {count}
              </motion.span>
            </span>
          </motion.div>
        </header>

        <ul className="flex flex-col gap-2">
          {PRODUCTS.map((product) => (
            <li key={product.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {product.name}
                </p>
                <p className="font-mono text-[11px] text-ink-3 tabular-nums">
                  {product.price}
                </p>
              </div>
              <CartFly
                cartRef={cartRef}
                thumbnail={product.art}
                label="Add"
                onAdd={catchItem}
              />
            </li>
          ))}
        </ul>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Cart holds <span className="text-signal">{count}</span>
      </p>
    </div>
  );
}
