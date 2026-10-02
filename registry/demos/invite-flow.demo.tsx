"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultInviteRoles,
  InviteFlow,
  type Invitee,
} from "@/registry/ui/invite-flow";

export const tweaks = defineTweaks({
  chips: {
    kind: "choice",
    label: "Chips",
    default: "avatar",
    options: ["avatar", "email", "name"],
    names: { avatar: "Avatar", email: "Email", name: "Name" },
  },
  roles: {
    kind: "choice",
    label: "Roles",
    default: "chip",
    options: ["chip", "list", "single"],
    names: { chip: "In chip", list: "List", single: "One for all" },
  },
  send: {
    kind: "choice",
    label: "Send",
    default: "envelopes",
    options: ["envelopes", "batch", "fade"],
    names: { envelopes: "Envelopes", batch: "Batch", fade: "Fade" },
  },
});

const MEMBERS = ["ole@fernworks.io", "dana@fernworks.io"];
const SEATS = 4;
const START: Invitee[] = [
  { email: "ana.ruiz@fernworks.io", role: "member" },
  { email: "tomas@fernworks.io", role: "admin" },
];
const SAMPLE =
  "Priya Nair <priya.nair@fernworks.io>, ole@fernworks.io; jun.park@basinworks.io, priya at fernworks";

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;

/** How many of the list can go: well-formed, not members, within the seats. */
const countValid = (list: Invitee[]) => {
  let valid = 0;
  for (const e of list) {
    const email = e.email.trim().toLowerCase();
    if (!EMAIL.test(email) || MEMBERS.includes(email)) continue;
    if (valid < SEATS) valid += 1;
  }
  return valid;
};

const roleWord = (id: string, n: number) => {
  const label = (
    defaultInviteRoles.find((r) => r.id === id)?.label ?? id
  ).toLowerCase();
  return `${n} ${n === 1 ? label : `${label}s`}`;
};

/**
 * Inviting colleagues to the Fernworks workspace in Fieldline: two
 * addresses already in, four seats left, Ole and Dana already members.
 * Sending answers after 800 ms.
 */
export function InviteFlowDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [list, setList] = React.useState<Invitee[]>(START);
  const [note, setNote] = React.useState<string | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  const valid = countValid(list);
  const bad = list.length - valid;

  const flow = (
    <InviteFlow
      key={round}
      value={list}
      onValueChange={(next) => {
        if (next.length > list.length) {
          const added = next.length - list.length;
          const nextBad = next.length - countValid(next);
          setNote(
            `added ${added}${nextBad ? ` · ${nextBad} ${nextBad === 1 ? "needs" : "need"} fixing` : ""}`,
          );
        } else if (next.length > 0) {
          setNote(null);
        }
        setList(next);
      }}
      members={MEMBERS}
      seats={SEATS}
      onSend={(invites) =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          failRef.current = false;
          setFailNext(false);
          setNote(`sending ${invites.length}`);
          window.setTimeout(() => {
            if (fail) {
              setNote("send failed · try again");
              reject(
                new Error("Fieldline couldn't send the invites. Try again."),
              );
              return;
            }
            const roles = new Map<string, number>();
            for (const i of invites)
              roles.set(i.role, (roles.get(i.role) ?? 0) + 1);
            setNote(
              `${invites.length} ${invites.length === 1 ? "invite" : "invites"} sent · ${[
                ...roles.entries(),
              ]
                .map(([id, n]) => roleWord(id, n))
                .join(", ")}`,
            );
            resolve();
          }, 800);
        })
      }
      onDone={() => setNote(null)}
      sound={sound}
      className={chrome ? undefined : "max-h-[232px]"}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{flow}</div>;

  return (
    <div ref={boxRef} className="flex w-full max-w-3xl flex-col gap-4">
      {flow}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">{valid} to invite</span>
              {bad ? ` · ${bad} to fix` : ""} · {Math.max(0, SEATS - valid)}{" "}
              {SEATS - valid === 1 ? "seat" : "seats"} left
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              // A real paste into the field: the clipboard event the box listens for.
              const input = boxRef.current?.querySelector<HTMLInputElement>(
                "input[inputmode=email]",
              );
              if (!input) return;
              input.focus();
              const data = new DataTransfer();
              data.setData("text/plain", SAMPLE);
              input.dispatchEvent(
                new ClipboardEvent("paste", {
                  clipboardData: data,
                  bubbles: true,
                  cancelable: true,
                }),
              );
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Paste sample
          </button>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => {
              const next = !failRef.current;
              failRef.current = next;
              setFailNext(next);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger/50 aria-pressed:text-danger"
          >
            Fail next
          </button>
          <button
            type="button"
            onClick={() => {
              setList(START);
              setNote(null);
              failRef.current = false;
              setFailNext(false);
              setRound((r) => r + 1);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
