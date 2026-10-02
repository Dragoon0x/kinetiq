"use client";

import * as React from "react";

import { ShoppingBag } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CartDrawer,
  defaultCartItems,
  type CartLine,
} from "@/registry/ui/cart-drawer";

export const tweaks = defineTweaks({
  threshold: {
    kind: "range",
    label: "Free over",
    default: 60,
    min: 40,
    max: 120,
    step: 10,
    unit: "€",
  },
  swipe: {
    kind: "choice",
    label: "Swipe",
    default: "reveal",
    options: ["reveal", "full", "off"],
    names: { reveal: "Reveal", full: "Full", off: "Off" },
  },
  totals: {
    kind: "choice",
    label: "Totals",
    default: "roll",
    options: ["roll", "count", "fade"],
    names: { roll: "Roll", count: "Count", fade: "Fade" },
  },
});

const SHELF: { line: Omit<CartLine, "quantity">; tint: string }[] = [
  {
    tint: "oklch(0.62 0.13 42)",
    line: {
      id: "field-mug-ember-12",
      name: "Field Mug",
      variant: "Ember · 12 oz",
      price: 32,
      max: 6,
      art: { kind: "mug", tint: "oklch(0.62 0.13 42)" },
    },
  },
  {
    tint: "oklch(0.74 0.06 70)",
    line: {
      id: "house-beans",
      name: "Coldbrook House Beans",
      variant: "250 g · whole bean",
      price: 9.5,
      compareAt: 10.5,
      art: { kind: "beans", tint: "oklch(0.5 0.035 248)" },
    },
  },
  {
    tint: "oklch(0.5 0.035 248)",
    line: {
      id: "field-tumbler",
      name: "Field Tumbler",
      variant: "Slate · 8 oz",
      price: 18,
      art: { kind: "tumbler", tint: "oklch(0.5 0.035 248)" },
    },
  },
];

const money = (n: number) => `€${n.toFixed(2)}`;

/**
 * The Fernworks shop with the bag pulled open over it: two Field goods in
 * the bag, a little short of free delivery. Checkout answers after 700 ms.
 */
export function CartDrawerDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [items, setItems] = React.useState<CartLine[]>(defaultCartItems);
  const [open, setOpen] = React.useState(true);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const threshold = values.threshold ?? 60;

  const count = items.reduce((a, l) => a + l.quantity, 0);
  const sub =
    Math.round(items.reduce((a, l) => a + l.price * l.quantity, 0) * 100) / 100;
  const away = Math.max(0, threshold - sub);

  const page = (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-foreground">Fernworks</p>
          <p className="text-[12px] text-ink-3">
            Field goods for slow mornings
          </p>
        </div>
        <button
          type="button"
          aria-label={`Bag, ${count} ${count === 1 ? "item" : "items"}`}
          onClick={() => setOpen(true)}
          className="relative inline-flex size-9 items-center justify-center rounded-full border border-hairline text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <ShoppingBag aria-hidden className="size-4" />
          {count > 0 ? (
            <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] text-primary-foreground tabular-nums">
              {count}
            </span>
          ) : null}
        </button>
      </div>
      <ul className="grid grid-cols-2 gap-3 @min-[40rem]/cd:grid-cols-3">
        {SHELF.map(({ line: p, tint }) => (
          <li
            key={p.id}
            className="flex flex-col gap-2 rounded-3 border border-hairline bg-card p-2"
          >
            <span
              aria-hidden
              className="block aspect-square rounded-2"
              style={{ background: tint }}
            />
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-medium text-foreground">
                {p.name}
              </span>
              <span className="block text-[11px] text-ink-3 tabular-nums">
                {money(p.price)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                setItems((list) => {
                  const at = list.find((l) => l.id === p.id);
                  if (at) {
                    return list.map((l) =>
                      l.id === p.id
                        ? {
                            ...l,
                            quantity: Math.min(l.max ?? 10, l.quantity + 1),
                          }
                        : l,
                    );
                  }
                  return [{ ...p, quantity: 1 }, ...list];
                });
                setNote(`${p.name.toLowerCase()} added`);
                setOpen(true);
              }}
              className="inline-flex h-8 items-center justify-center rounded-full border border-hairline-strong text-[12px] text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Add to bag
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const drawer = (
    <CartDrawer
      key={round}
      items={items}
      onItemsChange={(next) => {
        setItems(next);
        setNote(null);
      }}
      open={open}
      onOpenChange={setOpen}
      onRemove={(line) =>
        setNote(`${line.name.toLowerCase()} removed · undo for 6 s`)
      }
      onSaveForLater={(line) =>
        setNote(`${line.name.toLowerCase()} saved for later`)
      }
      onCheckout={() =>
        new Promise<void>((resolve) => {
          setNote("opening checkout");
          window.setTimeout(() => {
            setNote("checkout open · waylight pay");
            resolve();
          }, 700);
        })
      }
      sound={sound}
      className={chrome ? "h-[560px]" : "h-[588px]"}
      {...values}
    >
      {page}
    </CartDrawer>
  );

  if (!chrome) return <div className="w-full">{drawer}</div>;

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4">
      {drawer}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">
                {count} {count === 1 ? "item" : "items"} · {money(sub)}
              </span>{" "}
              ·{" "}
              {items.length === 0
                ? "bag empty"
                : away > 0
                  ? `${money(away)} away from free delivery`
                  : "free delivery"}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setItems(defaultCartItems);
            setOpen(true);
            setNote(null);
            setRound((r) => r + 1);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
