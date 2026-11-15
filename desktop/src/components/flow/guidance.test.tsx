import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IndicatorStatus } from "@/types/backend";

vi.mock("@/lib/api", () => ({ api: { openNasaSource: vi.fn(() => Promise.resolve(true)) } }));
const { CareSteps, IndicatorStatusList } = await import("@/components/flow/guidance");

const indicator = (fields: Partial<IndicatorStatus>): IndicatorStatus => ({
  id: "heart_rate", label: "Heart rate", value: 72, unit: "bpm", status: "in_reference",
  reference: "60 to 100 bpm at rest", text: "Inside the general adult resting reference of 60 to 100 bpm.", source_ids: [], ...fields,
});

describe("CareSteps", () => {
  it("keeps the astronaut's own steps apart from the steps that involve the crew", () => {
    render(<CareSteps finding={{ self_care: ["Avoid caffeine in the afternoon and evening."], actions: ["If short sleep continues, review it with the crew lead."] }} />);
    expect(within(screen.getByRole("region", { name: "What you can do now" })).getByText(/Avoid caffeine/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "When to involve the crew" })).getByText(/crew lead/)).toBeInTheDocument();
  });

  it("shows only the crew step for an urgent prompt and nothing when there is no guidance", () => {
    const { rerender, container } = render(<CareSteps finding={{ self_care: [], actions: ["Contact the crew medical officer now."] }} />);
    expect(screen.queryByRole("region", { name: "What you can do now" })).not.toBeInTheDocument();
    expect(screen.getByText(/Contact the crew medical officer now/)).toBeInTheDocument();
    rerender(<CareSteps finding={{ actions: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("IndicatorStatusList", () => {
  it("labels each status in words, so colour is never the only signal", () => {
    render(<IndicatorStatusList indicators={[
      indicator({}),
      indicator({ id: "spo2", label: "Estimated blood oxygen (SpO2)", value: 91, unit: "%", status: "review", text: "At or below 92%, the general reference for contacting a clinician." }),
    ]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveClass("is-in_reference");
    expect(items[0]).toHaveTextContent("In the general reference");
    expect(items[0]).toHaveTextContent("72");
    expect(items[1]).toHaveClass("is-review");
    expect(items[1]).toHaveTextContent("Contact a clinician");
    expect(items[1]).toHaveTextContent(/general reference for contacting a clinician/);
  });

  it("covers the outside-reference and urgent states and renders nothing without a measurement", () => {
    const { rerender, container } = render(<IndicatorStatusList indicators={[indicator({ value: 112, status: "outside_reference" }), indicator({ id: "spo2", value: 86, unit: "%", status: "urgent" })]} />);
    expect(screen.getByText(/Outside the general reference · recheck/)).toBeInTheDocument();
    expect(screen.getByText("Act now")).toBeInTheDocument();
    rerender(<IndicatorStatusList indicators={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<IndicatorStatusList indicators={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
