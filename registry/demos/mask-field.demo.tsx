"use client";

import * as React from "react";

import { MaskField } from "@/registry/ui/mask-field";

const PHONE_MASK = "(###) ###-####";
const CARD_MASK = "#### #### #### ####";
const PHONE_SLOTS = 10;
const CARD_SLOTS = 16;

export function MaskFieldDemo() {
  const [phone, setPhone] = React.useState("");
  const [card, setCard] = React.useState("");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Waylight sign-in — paste a full number to watch every slot fill at once.
      </p>

      <MaskField
        label="Mobile number"
        mask={PHONE_MASK}
        value={phone}
        onValueChange={setPhone}
      />

      <MaskField
        label="Card number"
        mask={CARD_MASK}
        value={card}
        onValueChange={setCard}
      />

      <div
        role="status"
        className="flex flex-col gap-1 border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span>
          Phone {phone || "—"} · {PHONE_SLOTS - phone.length} slots left
        </span>
        <span>
          Card {card || "—"} · {CARD_SLOTS - card.length} slots left
        </span>
      </div>
    </div>
  );
}
