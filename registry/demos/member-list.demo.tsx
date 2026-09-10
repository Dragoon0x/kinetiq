"use client";

import * as React from "react";

import {
  MemberList,
  type Member,
  type MemberStatus,
} from "@/registry/ui/member-list";

const TOMAS: Member = {
  id: "tomas",
  name: "Tomas Lindqvist",
  status: "busy",
  note: "on the yard call",
};

const ROOM: Member[] = [
  { id: "ines", name: "Ines Moreau", status: "online", note: "yard lead" },
  {
    id: "marta",
    name: "Marta Ferreira",
    status: "online",
    note: "on dock three",
  },
  TOMAS,
  { id: "rui", name: "Rui Baptista", status: "offline" },
  { id: "noor", name: "Noor Haddad", status: "offline" },
];

export function MemberListDemo() {
  const [members, setMembers] = React.useState<Member[]>(ROOM);
  const [line, setLine] = React.useState("nothing has changed");

  const setStatus = (id: string, status: MemberStatus) =>
    setMembers((prev) =>
      prev.map((member) => (member.id === id ? { ...member, status } : member)),
    );

  const rui = members.find((member) => member.id === "rui");
  const marta = members.find((member) => member.id === "marta");
  const tomasHere = members.some((member) => member.id === "tomas");
  const here = members.filter((member) => member.status !== "offline").length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MemberList
        label="Coldbrook dispatch"
        members={members}
        onSelect={(id) => {
          const picked = members.find((member) => member.id === id);
          setLine(picked ? `opened ${picked.name}` : "nothing has changed");
        }}
        onAnnounce={setLine}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setStatus("rui", rui?.status === "offline" ? "online" : "offline")
          }
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {rui?.status === "offline" ? "Rui comes online" : "Rui signs off"}
        </button>
        <button
          type="button"
          onClick={() =>
            setStatus("marta", marta?.status === "away" ? "online" : "away")
          }
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {marta?.status === "away" ? "Marta is back" : "Marta steps away"}
        </button>
        <button
          type="button"
          onClick={() =>
            setMembers((prev) =>
              tomasHere
                ? prev.filter((member) => member.id !== "tomas")
                : [...prev, TOMAS],
            )
          }
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {tomasHere ? "Tomas leaves" : "Tomas rejoins"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {here} in the room · <span className="text-signal">{line}</span>
      </p>
    </div>
  );
}
