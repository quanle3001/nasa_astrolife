import { describe, expect, it } from "vitest";
import { isTypingTarget, matchShortcut } from "@/lib/shortcuts";

const key = (k: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) =>
  ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });

describe("matchShortcut", () => {
  it("maps ⌘1–4 to pages on macOS and Ctrl+1–4 elsewhere", () => {
    expect(matchShortcut(key("1", { metaKey: true }), false, true)).toEqual({ type: "page", page: "sensor" });
    expect(matchShortcut(key("4", { metaKey: true }), false, true)).toEqual({ type: "page", page: "history" });
    expect(matchShortcut(key("2", { ctrlKey: true }), false, false)).toEqual({ type: "page", page: "checkin" });
    expect(matchShortcut(key("2", { ctrlKey: true }), false, true)).toBeNull();
    expect(matchShortcut(key("5", { metaKey: true }), false, true)).toBeNull();
  });

  it("submits and saves with the modifier, even while typing", () => {
    expect(matchShortcut(key("Enter", { metaKey: true }), true, true)).toEqual({ type: "submit-checkin" });
    expect(matchShortcut(key("s", { metaKey: true }), true, true)).toEqual({ type: "save-assessment" });
    expect(matchShortcut(key("S", { ctrlKey: true }), false, false)).toEqual({ type: "save-assessment" });
  });

  it("opens help with ? only outside text fields and ignores extra modifiers", () => {
    expect(matchShortcut(key("?", { shiftKey: true }), false, true)).toEqual({ type: "help" });
    expect(matchShortcut(key("?", { shiftKey: true }), true, true)).toBeNull();
    expect(matchShortcut(key("1", { metaKey: true, shiftKey: true }), false, true)).toBeNull();
    expect(matchShortcut(key("Enter"), false, true)).toBeNull();
  });

  it("treats inputs, textareas, selects and contenteditable as typing targets", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
