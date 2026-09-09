"use client";

import * as React from "react";

import { RepaymentArc } from "@/registry/ui/repayment-arc";

const PRINCIPAL = 18000;
const APR = 7.4;
const COUNT = 36;
const OPENING = 14;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
/** The first instalment fell due in October; every one after is a month on. */
const FIRST_MONTH = 9;

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const RATE = APR / 1200;
const PAYMENT = (PRINCIPAL * RATE) / (1 - Math.pow(1 + RATE, -COUNT));

/** The amortisation schedule, seeded once: each instalment's split. */
const SCHEDULE = (() => {
  const rows: { principal: number; interest: number }[] = [];
  let balance = PRINCIPAL;
  for (let index = 0; index < COUNT; index += 1) {
    const interest = balance * RATE;
    const principal = PAYMENT - interest;
    balance -= principal;
    rows.push({ principal, interest });
  }
  return rows;
})();

const TOTAL = PAYMENT * COUNT;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function RepaymentArcDemo() {
  const [paid, setPaid] = React.useState(OPENING);

  const made = SCHEDULE.slice(0, paid);
  const paidPrincipal = made.reduce((sum, row) => sum + row.principal, 0);
  const paidInterest = made.reduce((sum, row) => sum + row.interest, 0);
  const settled = paid >= COUNT;
  const nextDue = settled
    ? "Settled"
    : `12 ${MONTHS[(FIRST_MONTH + paid) % 12]}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <RepaymentArc
        label="Coldbrook Bank vehicle loan"
        total={TOTAL}
        paidPrincipal={paidPrincipal}
        paidInterest={paidInterest}
        paidCount={paid}
        count={COUNT}
        nextDue={nextDue}
        nextAmount={settled ? 0 : PAYMENT}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={settled}
          onClick={() => setPaid((value) => Math.min(COUNT, value + 1))}
        >
          Make payment
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={paid === OPENING}
          onClick={() => setPaid(OPENING)}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Coldbrook Bank{" "}
        <span className="text-cobalt-bright tabular-nums">
          {paid} of {COUNT} paid | principal {MONEY.format(paidPrincipal)} ·
          interest {MONEY.format(paidInterest)} | next {nextDue}
        </span>
      </p>
    </div>
  );
}
