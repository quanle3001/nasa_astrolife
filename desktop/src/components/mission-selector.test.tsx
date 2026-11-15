import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MissionSelector } from "@/components/mission-selector";

describe("MissionSelector", () => {
  it("presents the exact three mission contexts and changes the shared mission", () => {
    const onChange = vi.fn();
    render(<MissionSelector value="leo" onChange={onChange} />);

    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /Low Earth Orbit/i })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: /Mars \/ Deep Space/i }));
    expect(onChange).toHaveBeenCalledWith("mars");
  });

  it("exposes NASA provenance in the expanded media view", () => {
    render(<MissionSelector value="leo" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /Expand Low Earth Orbit NASA media/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("iss058e005282")).toBeInTheDocument();
    expect(screen.getByText("NASA / JSC")).toBeInTheDocument();
    expect(screen.getByText(/NASA does not endorse AstroLife/i)).toBeInTheDocument();
  });

  it("supports arrow-key selection with a single tab stop", () => {
    const onChange = vi.fn();
    render(<MissionSelector value="lunar" onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(radios[1], { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("mars");
    fireEvent.keyDown(radios[1], { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("leo");
  });

  it("marks the active mission in text and labels clip types", () => {
    render(<MissionSelector value="mars" onChange={() => undefined} />);
    expect(screen.getByRole("radio", { name: /Active mission/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Visualization")).toBeInTheDocument();
    expect(screen.getByText("Footage")).toBeInTheDocument();
    expect(screen.getByText(/NASA \/ JPL · PIA24264/)).toBeInTheDocument();
  });

  it("returns focus to the expand button when the media dialog closes", async () => {
    render(<MissionSelector value="leo" onChange={() => undefined} />);
    const expand = screen.getByRole("button", { name: /Expand Lunar Mission NASA media/i });
    expand.focus();
    fireEvent.click(expand);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(expand).toHaveFocus();
  });
});
