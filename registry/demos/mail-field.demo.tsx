"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MailField, type MailDomains } from "@/registry/ui/mail-field";

export const tweaks = defineTweaks({
  suggest: { kind: "toggle", label: "Suggest", default: true },
  stamp: { kind: "toggle", label: "Stamp", default: true },
  domains: {
    kind: "choice",
    label: "Domains",
    default: "common",
    options: ["common", "work"],
    names: { common: "Personal", work: "Work" },
  },
});

/** Slips of the hand, one of each kind, and the domain each one meant. */
const TYPOS: Record<MailDomains, { typed: string; meant: string }[]> = {
  common: [
    { typed: "fernmial.com", meant: "fernmail.com" },
    { typed: "fernmail.con", meant: "fernmail.com" },
    { typed: "fermail.com", meant: "fernmail.com" },
    { typed: "larkpostt.com", meant: "larkpost.com" },
  ],
  work: [
    { typed: "gaugewroks.io", meant: "gaugeworks.io" },
    { typed: "gaugeworks.ip", meant: "gaugeworks.io" },
    { typed: "basinwork.com", meant: "basinworks.com" },
    { typed: "fieldlinne.co", meant: "fieldline.co" },
  ],
};

const NAME = "ada.moss";

/**
 * Creating a Waylight account: the address arrives with a slipped domain,
 * and the field offers the fix.
 */
export function MailFieldDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const domains = values.domains ?? tweaks.domains.default;
  const first = TYPOS[domains][0];
  const [state, setState] = React.useState({
    domains,
    round: 0,
    email: `${NAME}@${first?.typed ?? ""}`,
    stamped: "",
  });
  // A new domain list starts over on its own first slip.
  if (state.domains !== domains) {
    setState({
      domains,
      round: 0,
      email: `${NAME}@${first?.typed ?? ""}`,
      stamped: "",
    });
  }
  const { email } = state;
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  const slip = TYPOS[domains].find((t) => t.typed === domain);
  const known = TYPOS[domains].some((t) => t.meant === domain);

  const status =
    state.stamped && state.stamped === email
      ? { lead: "stamped", rest: email }
      : slip && values.suggest !== false
        ? { lead: "typo spotted", rest: `${slip.typed} → ${slip.meant}` }
        : known
          ? { lead: "looks right", rest: "leave the field to stamp it" }
          : { lead: "checking as you type", rest: "waylight account" };

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <MailField
        label="Email"
        hint="We send the sign-in link here."
        value={email}
        onValueChange={(next) => setState((s) => ({ ...s, email: next }))}
        onStamp={(v) => setState((s) => ({ ...s, stamped: v }))}
        name="email"
        required
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 flex-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{status.lead}</span> · {status.rest}
          </p>
          <button
            type="button"
            onClick={() =>
              setState((s) => {
                const list = TYPOS[s.domains];
                const round = s.round + 1;
                const next = list[round % list.length] ?? list[0];
                return {
                  ...s,
                  round,
                  email: `${NAME}@${next?.typed ?? ""}`,
                };
              })
            }
            className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Try a typo
          </button>
        </div>
      ) : null}
    </div>
  );
}
