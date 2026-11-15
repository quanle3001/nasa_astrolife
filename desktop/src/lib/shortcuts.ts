import type { PageId } from "@/components/app-shell";

/**
 * Keyboard shortcuts (Impeccable critique: no accelerators for power users).
 * ⌘/Ctrl + 1–4 switch pages, ⌘/Ctrl + Enter submits the check-in,
 * ⌘/Ctrl + S saves the current assessment, "?" opens the reference.
 * None of these collide with Electron's default menu bindings.
 */
export type ShortcutAction =
  | { type: "page"; page: PageId }
  | { type: "submit-checkin" }
  | { type: "save-assessment" }
  | { type: "help" };

export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** Visible modifier label. */
export const MOD = IS_MAC ? "⌘" : "Ctrl";
/** Modifier name for aria-keyshortcuts. */
export const ARIA_MOD = IS_MAC ? "Meta" : "Control";

export const PAGE_ORDER: PageId[] = ["sensor", "checkin", "assessment", "history"];

type KeyInput = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Map a key event to an action. `typing` is true when focus is in a text field. */
export function matchShortcut(event: KeyInput, typing: boolean, mac = IS_MAC): ShortcutAction | null {
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (mod && !event.altKey && !event.shiftKey) {
    const index = ["1", "2", "3", "4"].indexOf(event.key);
    if (index >= 0) return { type: "page", page: PAGE_ORDER[index] };
    if (event.key === "Enter") return { type: "submit-checkin" };
    if (event.key.toLowerCase() === "s") return { type: "save-assessment" };
  }
  // A bare "?" types a character in fields, so it only opens help outside them.
  if (event.key === "?" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) return { type: "help" };
  return null;
}

export const SHORTCUT_GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Navigate",
    items: [
      { keys: [MOD, "1"], label: "Telemetry" },
      { keys: [MOD, "2"], label: "Check-in" },
      { keys: [MOD, "3"], label: "Assessment" },
      { keys: [MOD, "4"], label: "History" },
    ],
  },
  {
    title: "Act",
    items: [
      { keys: [MOD, "Enter"], label: "Review health priorities (on Check-in)" },
      { keys: [MOD, "S"], label: "Save assessment to history" },
      { keys: ["?"], label: "Show this list" },
      { keys: ["Esc"], label: "Close a dialog" },
    ],
  },
];
