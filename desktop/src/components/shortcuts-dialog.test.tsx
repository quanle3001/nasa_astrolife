import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";

describe("ShortcutsDialog", () => {
  it("lists every shortcut by action", () => {
    render(<ShortcutsDialog open onOpenChange={() => undefined} />);
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    for (const label of ["Telemetry", "Check-in", "Assessment", "History", "Save assessment to history", "Close a dialog"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
