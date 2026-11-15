import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import catalog from "../../../../software/resources/nasa_sources.json";
import hrrEvidence from "../../../../software/resources/hrr_evidence.json";
import missionContext from "../../../../software/resources/mission_context.json";
import cached from "../../../../software/resources/nasa_cache/osdr_OSD-104.json";
import mapping from "../../../../software/resources/osdr_studies.json";
import registry from "../../../../software/resources/question_registry.json";
import type { Knowledge, OsdrStudies } from "@/types/flow";

const openNasaSource = vi.fn((_url: string) => Promise.resolve(true));
vi.mock("@/lib/api", () => ({ api: { openNasaSource: (url: string) => openNasaSource(url) } }));

const { CompassPage } = await import("@/components/compass/compass-page");
const { OsdrStudyCard, studiesFor } = await import("@/components/nasa/osdr-study");
const { NasaPage } = await import("@/components/pages/nasa-page");

// The same shape the backend builds: the verified NASA record plus the curated reason it is shown.
const entry = mapping.studies[0];
const studies: OsdrStudies = {
  version: mapping.version, note: mapping.note, limitations: mapping.limitations, api_docs: cached.api_docs, unavailable: [],
  studies: [{ ...cached.study, condition_ids: entry.condition_ids, relevance: entry.relevance,
    provenance: { source: cached.source, api_docs: cached.api_docs, request_url: cached.request_url, retrieved_at: cached.retrieved_at, sha256: cached.sha256, pipeline_version: cached.pipeline_version } }],
};
const knowledge = { catalog, mission_context: missionContext, registry, hrr_evidence: hrrEvidence, osdr_studies: studies } as unknown as Knowledge;

describe("NASA OSDR study", () => {
  it("is labelled as an animal study before anything else and shows where the record came from", () => {
    render(<OsdrStudyCard study={studies.studies[0]} limitations={studies.limitations} />);
    expect(screen.getByText(/Animal study · not human data · not a measurement of you/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Mouse soleus muscle/ })).toBeInTheDocument();
    expect(screen.getByText("Mus musculus (mouse)")).toBeInTheDocument();
    expect(screen.getByText("Soleus-both sides")).toBeInTheDocument();
    expect(screen.getByText(/SpaceX-4 · 9\/21\/14 to 10\/25\/14/)).toBeInTheDocument();
    expect(screen.getByText(/Record retrieved .* from the OSDR Biological Data API · released .*28, 2017/)).toBeInTheDocument();
    expect(screen.getByText(/no AstroLife rule uses them/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Open OSD-104 in NASA OSDR/ }));
    expect(openNasaSource).toHaveBeenCalledWith("https://osdr.nasa.gov/bio/repo/data/studies/OSD-104");
  });

  it("is offered only for the health topic it relates to", () => {
    expect(studiesFor(studies, ["fitness"]).map((study) => study.accession)).toEqual(["OSD-104"]);
    expect(studiesFor(studies, ["sleep", "bone"])).toEqual([]);
    expect(studiesFor(undefined, ["fitness"])).toEqual([]);
  });

  it("appears in the Compass under Muscles and fitness, inside the NASA research section", () => {
    render(<CompassPage result={null} actions={[]} knowledge={knowledge} conditionTitles={{}} onToggleAction={() => undefined} onNext={() => undefined} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^Muscles and fitness/ })[0]);
    expect(screen.queryByText(/Animal study/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show NASA research and sources/ }));
    expect(screen.getByRole("article", { name: "NASA space-biology study OSD-104" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /^Bones/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Show NASA research and sources/ }));
    expect(screen.queryByRole("article", { name: /OSD-104/ })).not.toBeInTheDocument();
  });

  it("is listed on the NASA data page with its health topic, and a missing record is reported, not filled in", () => {
    const { rerender } = render(<NasaPage knowledge={knowledge} profile={null} />);
    expect(screen.getByText("Related health topic · Muscle loss and reduced fitness")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "NASA space-biology study OSD-104" })).toBeInTheDocument();
    const missing = { ...knowledge, osdr_studies: { ...studies, studies: [], unavailable: [{ accession: "OSD-104", reason: "No cached NASA study record for OSD-104." }] } } as Knowledge;
    rerender(<NasaPage knowledge={missing} profile={null} />);
    expect(screen.queryByRole("article", { name: /OSD-104/ })).not.toBeInTheDocument();
    expect(screen.getByText(/OSD-104 is not shown: No cached NASA study record/)).toBeInTheDocument();
  });
});
