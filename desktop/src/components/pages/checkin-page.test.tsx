import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CheckinPage } from "@/components/pages/checkin-page";
import type { AppConfig } from "@/types/backend";

const config: AppConfig = {
  missions: { leo: "Low Earth Orbit", lunar: "Lunar Mission", mars: "Mars / Deep Space" },
  symptoms: { severe_breathlessness: "Severe breathlessness", vision_changes: "New vision changes" },
  condition_titles: {},
  history_path: "/tmp/astrotip-test.sqlite3",
  disclaimer: "Educational prototype",
};

describe("CheckinPage", () => {
  it("sends one structured check-in to the Python assessment callback", async () => {
    const onAssess = vi.fn().mockResolvedValue(undefined);
    render(<CheckinPage config={config} mission="leo" setMission={() => undefined} onAssess={onAssess} busy={false} />);

    fireEvent.change(screen.getByLabelText("Heart rate (bpm)"), { target: { value: "72" } });
    fireEvent.click(screen.getByLabelText("New vision changes"));
    fireEvent.click(screen.getByRole("button", { name: /Review health priorities/i }));

    await waitFor(() => expect(onAssess).toHaveBeenCalledOnce());
    expect(onAssess).toHaveBeenCalledWith(expect.objectContaining({
      mission: "leo",
      heart_rate: 72,
      spo2: null,
      symptoms: ["vision_changes"],
      input_source: "manual",
    }));
  });
});
