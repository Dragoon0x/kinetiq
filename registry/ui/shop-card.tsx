"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ShopVariant = {
  id: string;
  label: string;
  /** Overrides the product price when this variant is chosen. */
  price?: number;
};

export type ShopProduct = {
  id: string;
  title: string;
  price: number;
  variants: ShopVariant[];
  /** Two procedural views: the resting picture and the one hover reveals. */
  art: [React.ReactNode, React.ReactNode];
};

export type ShopCardProps = {
  product: ShopProduct;
  /** Where the title goes. @default "#" */
  href?: string;
  /** Fires from the quick-add bar with the chosen variant. */
  onAdd?: (variantId: string) => void;
  /** Controlled wishlist state. */
  liked?: boolean;
  /** Initial wishlist state for uncontrolled usage. @default false */
  defaultLiked?: boolean;
  onLikedChange?: (liked: boolean) => void;
  /** Money formatter — the card never invents a currency. */
  format?: (value: number) => string;
  className?: string;
};

const HEART =
  "M8 13.7C8 13.7 2.4 10.2 2.4 6.5A3.1 3.1 0 0 1 8 4.7a3.1 3.1 0 0 1 5.6 1.8c0 3.7-5.6 7.2-5.6 7.2z";

/**
 * The price, rolling. It lives in a clipped cell with an invisible twin holding
 * the width, so a longer figure never shoves the title sideways mid-animation;
 * the outgoing figure leaves the way the money moved and the new one arrives
 * from the other side.
 */
function Price({
  text,
  up,
  motionSafe,
}: {
  text: string;
  up: boolean;
  motionSafe: boolean;
}) {
  return (
    <span className="relative inline-block h-[1.3em] shrink-0 overflow-hidden text-right font-mono text-sm text-foreground tabular-nums">
      <span aria-hidden className="invisible">
        {text}
      </span>
      <span className="sr-only">{text}</span>
      <AnimatePresence initial={false}>
        <motion.span
          aria-hidden
          key={text}
          initial={
            motionSafe
              ? { y: up ? "100%" : "-100%", opacity: 0 }
              : { opacity: 0 }
          }
          animate={{ y: "0%", opacity: 1 }}
          exit={
            motionSafe
              ? {
                  y: up ? "-100%" : "100%",
                  opacity: 0,
                  transition: exitFor(durations.fast),
                }
              : { opacity: 0, transition: exitFor(durations.blink) }
          }
          transition={motionSafe ? springs.snap : { duration: durations.fast }}
          className="absolute inset-0 flex items-center justify-end"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * A product card that keeps its second thought below the fold. Hover or focus
 * inside cross-fades the picture to its alternate view and raises the quick-add
 * bar from under the frame on `glide` — ζ0.98, no overshoot, because a panel
 * arriving is a layout move rather than a landing. The bar's height is measured
 * by a ResizeObserver and used as its own hidden offset, so it costs no
 * reserved space and never leaves a gap when the variants wrap to two rows.
 *
 * The heart pops on two chained springs — out on `flick`, back on `recoil` —
 * because one spring interpolates exactly two keyframes and a `[1, 1.2, 1]`
 * array would silently drop the middle. Choosing a variant rolls the price.
 *
 * It is an `<article>` whose title is a real link, so the card is one landmark
 * with one destination; every control inside is a button, the heart carries
 * `aria-pressed`, and the variants are a radio group with a roving tabindex.
 * Tab alone raises the bar, so the keyboard never needs the hover. Under
 * reduced motion the bar fades in where it sits and nothing pops.
 */
export function ShopCard({
  product,
  href = "#",
  onAdd,
  liked,
  defaultLiked = false,
  onLikedChange,
  format = (value) => value.toFixed(2),
  className,
}: ShopCardProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;

  const [variantId, setVariantId] = React.useState(
    () => product.variants[0]?.id ?? "",
  );
  const variant =
    product.variants.find((option) => option.id === variantId) ??
    product.variants[0];
  const price = variant?.price ?? product.price;
  const priceText = format(price);

  const [uncontrolledLiked, setUncontrolledLiked] =
    React.useState(defaultLiked);
  const isLiked = liked ?? uncontrolledLiked;

  const [hovered, setHovered] = React.useState(false);
  const [focusWithin, setFocusWithin] = React.useState(false);
  const [added, setAdded] = React.useState(false);
  const open = hovered || focusWithin;

  /** Which way the money moved, decided beside the figure it directs. */
  const [rolled, setRolled] = React.useState({ price, up: true });
  let up = rolled.up;
  if (rolled.price !== price) {
    up = price >= rolled.price;
    setRolled({ price, up });
  }

  const barRef = React.useRef<HTMLDivElement | null>(null);
  const [barHeight, setBarHeight] = React.useState(0);

  React.useEffect(() => {
    const node = barRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // The observer's callback carries the measurement, so nothing is read (and
    // set) synchronously inside the effect body.
    const observer = new ResizeObserver(() => setBarHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 1400);
    return () => window.clearTimeout(timer);
  }, [added]);

  const heartScale = useMotionValue(1);
  const pop = React.useRef<AnimationPlaybackControls | null>(null);
  React.useEffect(() => () => pop.current?.stop(), []);

  const toggleLike = () => {
    const next = !isLiked;
    if (liked === undefined) setUncontrolledLiked(next);
    onLikedChange?.(next);
    if (!motionSafe) return;
    pop.current?.stop();
    const out = animate(heartScale, next ? 1.24 : 0.86, springs.flick);
    pop.current = out;
    out.then(() => {
      pop.current = animate(heartScale, 1, springs.recoil);
    });
  };

  const variantIndex = Math.max(
    0,
    product.variants.findIndex((option) => option.id === variant?.id),
  );

  const focusVariant = (index: number) => {
    const count = product.variants.length;
    if (count === 0) return;
    const option = product.variants[((index % count) + count) % count];
    if (!option) return;
    setVariantId(option.id);
    document.getElementById(`${uid}-variant-${option.id}`)?.focus();
  };

  const onVariantKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      focusVariant(index + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      focusVariant(index - 1);
    else if (event.key === "Home") focusVariant(0);
    else if (event.key === "End") focusVariant(product.variants.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <article
      aria-labelledby={titleId}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerCancel={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={() => setFocusWithin(false)}
      className={cn(
        "flex w-full min-w-0 flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div
        // Touch has no hover: a tap on the frame raises the bar the same way.
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") setHovered(true);
        }}
        className="relative aspect-square w-full overflow-hidden rounded-2 bg-surface-2"
      >
        <span aria-hidden className="absolute inset-0 block">
          {product.art[0]}
        </span>
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={{ duration: durations.base, ease: easings.enter }}
          className="absolute inset-0 block"
        >
          {product.art[1]}
        </motion.span>

        <button
          type="button"
          aria-pressed={isLiked}
          aria-label="Save to wishlist"
          onClick={toggleLike}
          className={cn(
            "absolute top-2 right-2 flex size-8 items-center justify-center rounded-full border border-hairline-strong bg-surface-0/85 backdrop-blur-[2px] transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            isLiked ? "text-danger" : "text-ink-2 hover:text-foreground",
          )}
        >
          <motion.svg
            viewBox="0 0 16 16"
            aria-hidden
            style={{ scale: heartScale, originX: 0.5, originY: 0.5 }}
            className="size-4 shrink-0"
          >
            <path
              d={HEART}
              fill={isLiked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </motion.svg>
        </button>

        <motion.div
          ref={barRef}
          initial={false}
          animate={
            motionSafe
              ? { y: open ? 0 : barHeight, opacity: 1 }
              : { y: 0, opacity: open ? 1 : 0 }
          }
          transition={motionSafe ? springs.glide : { duration: durations.fast }}
          style={{ pointerEvents: open ? "auto" : "none" }}
          className="absolute inset-x-0 bottom-0 flex flex-col gap-2 border-t border-hairline bg-surface-0/92 p-2 backdrop-blur-[3px]"
        >
          <div
            role="radiogroup"
            aria-label={`${product.title} options`}
            className="flex flex-wrap gap-1.5"
          >
            {product.variants.map((option, index) => {
              const checked = option.id === variant?.id;
              return (
                <button
                  key={option.id}
                  id={`${uid}-variant-${option.id}`}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={index === variantIndex ? 0 : -1}
                  onClick={() => setVariantId(option.id)}
                  onKeyDown={(event) => onVariantKeyDown(event, index)}
                  className={cn(
                    "flex h-7 min-w-0 items-center justify-center rounded-full border px-2.5 text-[11px] font-medium transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    checked
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-hairline-strong text-ink-2 hover:text-foreground",
                  )}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              setAdded(true);
              onAdd?.(variant?.id ?? "");
            }}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {added && (
              <motion.svg
                viewBox="0 0 16 16"
                aria-hidden
                initial={motionSafe ? { scale: 0.4, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
                style={{ originX: 0.5, originY: 0.5 }}
                className="size-3.5 shrink-0"
              >
                <path
                  d="M3.5 8.5 6.5 11.5 12.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </motion.svg>
            )}
            {added ? "Added" : "Quick add"}
          </button>
        </motion.div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* One line, deliberately: card grids stay on a shared baseline, and
              the full name is on the link's title for anything that clips. */}
          <h3
            id={titleId}
            className="truncate text-sm leading-snug font-medium"
          >
            <a
              href={href}
              title={product.title}
              className="text-foreground transition-colors outline-none hover:text-cobalt-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {product.title}
            </a>
          </h3>
          <p className="mt-0.5 truncate text-xs text-ink-3">
            {variant?.label ?? "One size"}
          </p>
        </div>
        <Price text={priceText} up={up} motionSafe={motionSafe} />
      </div>

      <span role="status" className="sr-only">
        {added ? `${product.title}, ${variant?.label ?? ""} added` : ""}
      </span>
    </article>
  );
}
