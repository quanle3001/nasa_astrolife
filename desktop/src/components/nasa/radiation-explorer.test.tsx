import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import catalog from "../../../../software/resources/nasa_sources.json";
import hrrEvidence from "../../../../software/resources/hrr_evidence.json";
import missionContext from "../../../../software/resources/mission_context.json";
import instrumentNotes from "../../../../software/resources/radlab_instruments.json";
import registry from "../../../../software/resources/question_registry.json";
import type { BackendEvent } from "@/types/backend";
import type { Knowledge } from "@/types/flow";
import type { RadLabResult } from "@/types/nasa";

let listener: ((event: BackendEvent) => void) | null = null;
const getRadLab = vi.fn();
vi.mock("@/lib/api", () => ({ api: {
  getRadLab: (refresh?: boolean) => getRadLab(refresh), openNasaSource: vi.fn(() => Promise.resolve(true)),
  onBackendEvent: (callback: (event: BackendEvent) => void) => { listener = callback; return () => { listener = null; }; },
} }));
vi.mock("uplot", () => ({ default: class { static paths = {}; setSize = vi.fn(); destroy = vi.fn(); } }));
vi.mock("uplot/dist/uPlot.min.css", () => ({}));
const { RadiationExplorer } = await import("@/components/nasa/radiation-explorer");

const knowledge = { catalog, mission_context: missionContext, registry, hrr_evidence: hrrEvidence } as unknown as Knowledge;
const series = (values: number[]) => ({ timestamps: values.map((_value, index) => `2023-01-01T0${index}:00:00`), values });
const instrumentAnalysis = (environment: "leo" | "lunar" | "mars" | null, fields: object = {}) => ({
  count: 2, mean: 4.1, median: 4.74, minimum: 2.5, maximum: 510.4, standard_deviation: 1.2, percentile_95: 203.45,
  maximum_at: "2023-01-01T14:41:01", first_timestamp: "2023-01-01T00:00:00", last_timestamp: "2023-01-01T01:00:00",
  cadence_minutes: 60, expected_count: 24, coverage_percent: 8.3, gap_count: 0, longest_gap_minutes: 0, gaps: [],
  zero_count: 0, excursion_threshold: 14.22, excursion_count: 0, excursion_episodes: 0, excursions: [],
  hourly_mean: [2.5, 4.7, ...Array(22).fill(null)], hours_without_data: Array.from({ length: 22 }, (_value, index) => index + 2),
  highest_hour: 1, lowest_hour: 0, first_half_mean: 3.6, second_half_mean: null, environment, observations: ["2 readings."], ...fields,
});
const result = (fields: Partial<RadLabResult> = {}): RadLabResult => ({
  available: true, origin: "bundled_snapshot", error: null,
  dataset: {
    provider: "NASA Open Science Data Repository (OSDR) · RadLab", api_url: "https://visualization.osdr.nasa.gov/radlab/api/",
    documentation_url: "https://visualization.osdr.nasa.gov/radlab/gui/data-api/", request_url: "https://visualization.osdr.nasa.gov/radlab/api/?query=x&columns+=absorbed_dose_rate",
    measurement: "absorbed_dose_rate", unit: null, unit_note: "RadLab's API response carries no unit field, so the unit is not stated here.",
    window_start: "2023-01-01", window_end: "2023-01-02", timestamp_note: "Timestamps are shown exactly as published by RadLab.",
    retrieved_at: "2026-11-15T08:41:40+00:00", response_sha256: "a".repeat(64), data_sha256: "b04bdf6ce30e" + "0".repeat(52), row_count: 6,
    limitations: [], instruments: { BPD: series([9, 10]), "CRaTER-D1D2": series([8, 9]), DosTel1: series([2.5, 4.7]), "MSL-RAD-Surface": series([6.2, 6.6]) },
  },
  summary: Object.fromEntries(["BPD", "CRaTER-D1D2", "DosTel1", "MSL-RAD-Surface"].map((id) => [id, { count: 2, minimum: 2.5, maximum: 510.4, median: 4.74, first_timestamp: "2023-01-01T00:00:00", last_timestamp: "2023-01-01T01:00:00" }])),
  analysis: {
    provenance: {
      algorithm_version: "radlab-descriptive-1.1", libraries: { pandas: "3.1.1", numpy: "2.5.4" },
      dataset_request_url: "https://visualization.osdr.nasa.gov/radlab/api/?query=x&columns+=absorbed_dose_rate", dataset_retrieved_at: "2026-11-15T08:41:40+00:00",
      dataset_sha256: "b04bdf6ce30e" + "0".repeat(52), measurement: "absorbed_dose_rate", unit: null, instruments: ["BPD", "CRaTER-D1D2", "DosTel1", "MSL-RAD-Surface"],
      pipeline_version: "radlab-pipeline-1.1", transformation_steps: ["Validated 6 rows from the API response with the RadLabReading model.", "No exact duplicate rows found."],
    },
    method: { gap_rule: "g", excursion_rule: "e", statistics: "Mean, median and range of the published values.", limits: "Descriptive only." },
    instruments: {
      BPD: instrumentAnalysis(null, { zero_count: 6 }),
      "CRaTER-D1D2": instrumentAnalysis("lunar"),
      DosTel1: instrumentAnalysis("leo", { excursion_count: 106, excursion_episodes: 5, excursions: [{ start: "2023-01-01T14:30:00", end: "2023-01-01T14:50:00", readings: 12, peak: 510.4, peak_at: "2023-01-01T14:41:01" }],
        gap_count: 1, longest_gap_minutes: 45, gaps: [{ start: "2023-01-01T03:10:00", end: "2023-01-01T03:55:00", minutes: 45 }] }),
      "MSL-RAD-Surface": instrumentAnalysis("mars"),
    },
    by_environment: { leo: ["DosTel1"], lunar: ["CRaTER-D1D2"], mars: ["MSL-RAD-Surface"] },
    undescribed: ["BPD"],
  },
  instrument_notes: instrumentNotes as unknown as RadLabResult["instrument_notes"],
  ...fields,
});

describe("RadiationExplorer", () => {
  beforeEach(() => { getRadLab.mockReset(); listener = null; });

  it("shows real NASA data with its provenance and says it is not the astronaut's exposure", async () => {
    getRadLab.mockResolvedValue(result());
    render(<RadiationExplorer knowledge={knowledge} mission="mars" />);
    expect(await screen.findByRole("radio", { name: /RAD · Curiosity rover/ })).toBeChecked();
    expect(screen.getByText("Historical research measurement")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("This is not a measurement of you.");
    expect(screen.getByRole("note")).toHaveTextContent("not live telemetry");
    const provenance = screen.getByLabelText("Data provenance");
    expect(provenance).toHaveTextContent("NASA Open Science Data Repository (OSDR) · RadLab");
    expect(provenance).toHaveTextContent("Offline copy included with AstroLife");
    expect(provenance).toHaveTextContent("2023-01-01 to 2023-01-02");
    expect(provenance).toHaveTextContent("b04bdf6ce30e… verified");
    expect(screen.getByText(/Request: https:\/\/visualization\.osdr\.nasa\.gov\/radlab\/api\//)).toBeInTheDocument();
    expect(screen.getAllByText(/unit not stated by the API/).length).toBeGreaterThan(0);
    expect(getRadLab).toHaveBeenCalledWith(undefined);
  });

  it("starts on the instrument for the astronaut's mission and lets them compare others", async () => {
    getRadLab.mockResolvedValue(result());
    const { unmount } = render(<RadiationExplorer knowledge={knowledge} mission="leo" />);
    expect(await screen.findByRole("radio", { name: /DOSTEL 1 · International Space Station/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /CRaTER · Lunar Reconnaissance Orbiter/ }));
    expect(screen.getByRole("heading", { name: "CRaTER · Lunar Reconnaissance Orbiter" })).toBeInTheDocument();
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(5);
    expect(rows[2]).toHaveTextContent("CRaTER-D1D2");
    // An instrument AstroLife cannot describe is shown by id, without an invented description.
    fireEvent.click(screen.getByRole("radio", { name: /BPD/ }));
    expect(screen.getByText(/AstroLife has no verified description for it/)).toBeInTheDocument();
    unmount();
  });

  it("shows the backend's computed analysis: statistics, pauses, irregular readings and change through the day", async () => {
    getRadLab.mockResolvedValue(result());
    render(<RadiationExplorer knowledge={knowledge} mission="leo" />);
    const panel = await screen.findByLabelText("Analysis of the retrieved readings");
    expect(panel).toHaveTextContent("Mean4.10");
    expect(panel).toHaveTextContent("95th percentile203");
    expect(panel).toHaveTextContent("Usual interval60 min");
    expect(panel).toHaveTextContent("1 pause: 03:10 to 03:55 (45 min).");
    expect(panel).toHaveTextContent("106 readings above three times the median (14.22), in 5 episodes: 14:30 to 14:50, peak 510.");
    expect(panel).toHaveTextContent("The dataset does not state the cause.");
    expect(panel).toHaveTextContent("No readings in 22 hours of the day.");
    expect(panel).toHaveTextContent("Highest hourly mean in the hour starting 01:00");
    expect(panel).toHaveTextContent("Descriptive only.");
    const method = within(panel).getByText("How this was computed").closest("details")!;
    expect(method).toHaveTextContent("radlab-descriptive-1.1 · pandas 3.1.1, numpy 2.5.4");
    expect(method).toHaveTextContent("Retrieve, validate, clean, analyze, store, explain · radlab-pipeline-1.1");
    expect(method).toHaveTextContent("Validated 6 rows from the API response with the RadLabReading model.");
    expect(method).toHaveTextContent("DosTel1 (RadLab id) · unit not stated by the API");
    fireEvent.click(screen.getByRole("radio", { name: /BPD/ }));
    expect(screen.getByLabelText("Analysis of the retrieved readings")).toHaveTextContent("6 readings are exactly zero");
    // The radiation hazard is connected to what crews do about it, from NASA sources.
    expect(screen.getByLabelText("What this means for a crew")).toHaveTextContent("Risk of Radiation Carcinogenesis");
  });

  it("offers only the mission's own instruments as mission data and explains when there are none", async () => {
    getRadLab.mockResolvedValue(result());
    const { unmount } = render(<RadiationExplorer knowledge={knowledge} mission="lunar" />);
    const own = await screen.findByRole("radiogroup", { name: "Instruments in your mission environment" });
    expect(within(own).getAllByRole("radio")).toHaveLength(1);
    expect(within(own).getByRole("radio", { name: /CRaTER/ })).toBeChecked();
    expect(within(screen.getByRole("radiogroup", { name: "Instruments in other environments" })).getAllByRole("radio")).toHaveLength(3);
    unmount();
    const none = result();
    none.analysis!.by_environment.mars = [];
    getRadLab.mockResolvedValue(none);
    render(<RadiationExplorer knowledge={knowledge} mission="mars" />);
    expect(await screen.findByText(/no instrument in this dataset for your mission environment/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Analysis of the retrieved readings")).not.toBeInTheDocument();
  });

  it("retrieves again from NASA on request and labels the result as live", async () => {
    getRadLab.mockImplementation((refresh?: boolean) => Promise.resolve(refresh ? { refreshing: true } : result()));
    render(<RadiationExplorer knowledge={knowledge} mission="lunar" />);
    await screen.findByLabelText("Data provenance");
    fireEvent.click(screen.getByRole("button", { name: /Retrieve again from NASA/ }));
    expect(await screen.findByRole("button", { name: /Retrieving from NASA/ })).toBeDisabled();
    expect(getRadLab).toHaveBeenLastCalledWith(true);
    act(() => listener?.({ event: "nasa.radlab.updated", payload: result({ origin: "live" }) as unknown as BackendEvent["payload"] }));
    expect(screen.getByLabelText("Data provenance")).toHaveTextContent("Retrieved from NASA just now");
    expect(screen.getByRole("button", { name: /Retrieve again from NASA/ })).toBeEnabled();
  });

  it("keeps the verified cache and gives the reason when NASA cannot be reached", async () => {
    getRadLab.mockResolvedValue(result({ error: "NASA RadLab could not be reached: offline" }));
    render(<RadiationExplorer knowledge={knowledge} mission="mars" />);
    expect(await screen.findByText(/latest retrieval from NASA did not succeed/)).toHaveTextContent("could not be reached: offline");
    expect(screen.getByLabelText("Data provenance")).toHaveTextContent("Offline copy included with AstroLife");
  });

  it("shows an honest unavailable state instead of substitute data", async () => {
    getRadLab.mockResolvedValue(result({ available: false, origin: "none", dataset: null, summary: {}, analysis: null, error: "No verified NASA radiation dataset is available offline." }));
    render(<RadiationExplorer knowledge={knowledge} mission="mars" />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("NASA radiation data is unavailable.");
    expect(alert).toHaveTextContent("No substitute data is shown.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Data provenance")).not.toBeInTheDocument();
  });
});
