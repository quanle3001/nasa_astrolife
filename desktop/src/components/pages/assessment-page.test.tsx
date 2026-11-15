import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssessmentPage } from "@/components/pages/assessment-page";
import type { AppConfig, AssessmentBundle } from "@/types/backend";

const config: AppConfig = {
  missions: { leo: "Low Earth Orbit", lunar: "Lunar Mission", mars: "Mars / Deep Space" },
  symptoms: {},
  condition_titles: { oxygenation: "Oxygenation concern" },
  history_path: "/tmp/astrotip-test.sqlite3",
  disclaimer: "Educational prototype",
};

const urgent: AssessmentBundle = {
  assessment_id: "assessment-1",
  checkin: {
    mission: "mars", heart_rate: 72, spo2: 87.5, signal_quality: "good", sleep_hours: null,
    symptoms: [], exercise_completed: null, notes: "", input_source: "manual",
  },
  assessment: {
    level: "urgent",
    summary: "Urgent review is required.",
    findings: [{
      condition_id: "oxygenation", level: "urgent", reason: "The reported oxygen estimate is very low.",
      actions: ["Follow the mission emergency procedure now."], source_ids: [],
    }],
    data_notes: [], created_at: "2026-11-14T00:00:00Z", catalog_reviewed_on: "2026-01-01",
  },
};

describe("AssessmentPage", () => {
  it("renders urgent action language without delaying it behind animation", () => {
    render(<AssessmentPage config={config} bundle={urgent} saved={false} saving={false} onSave={async () => undefined} onEdit={() => undefined} />);

    expect(screen.getByText("ACT NOW")).toBeVisible();
    expect(screen.getAllByText("Follow the mission emergency procedure now.")[0]).toBeVisible();
    expect(screen.getByText("Oxygenation concern")).toBeInTheDocument();
  });
});
