"use client";

import { useSyncExternalStore } from "react";

const KEY = "kinetiq-tactile-sound";
const EVENT = "kinetiq-tactile-sound-change";

const read = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
};

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
};

/** Off on the server and on first paint: nothing is audible until asked for. */
const getServerSnapshot = (): boolean => false;

export function setSoundPref(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Storage refused (private mode); the choice still applies this session.
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * The visitor's Tactile sound choice: off by default, remembered across
 * visits, shared by every card and the stage, and synced across tabs.
 */
export function useSoundPref(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, getServerSnapshot);
  return [on, setSoundPref];
}
