import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByText(/NASA does not endorse AstroTip/i)).toBeInTheDocument();
  });
});
