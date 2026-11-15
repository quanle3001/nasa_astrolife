import { ExternalLink, Microscope } from "lucide-react";
import { api } from "@/lib/api";
import type { OsdrStudies, OsdrStudy } from "@/types/flow";

/** A date-only value is a UTC calendar date and is shown as that date, not shifted into local time. */
const day = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", ...(iso.length === 10 ? { timeZone: "UTC" } : {}) });
};

/**
 * One open space-biology study from NASA's OSDR Biological Data API.
 *
 * It is study metadata about animals or cells. The card says so before
 * anything else, so it cannot be read as human data or as a result about the
 * astronaut, and it shows where and when the record was retrieved.
 */
export function OsdrStudyCard({ study, limitations }: { study: OsdrStudy; limitations: string }) {
  const facts: [string, string][] = [
    ["Organism", study.organism === "Mus musculus" ? "Mus musculus (mouse)" : study.organism],
    ["Sample", study.material],
    ["Study factor", study.factors.join(", ")],
    ["Flight", [study.flight_program, study.mission_name, study.mission_start && study.mission_end ? `${study.mission_start} to ${study.mission_end}` : ""].filter(Boolean).join(" · ")],
    ["Measured", study.measurement_types.join(", ")],
  ];
  return (
    <article className="osdr-study" aria-label={`NASA space-biology study ${study.accession}`}>
      <p className="osdr-kind"><Microscope className="size-3.5" aria-hidden="true" /> Animal study · not human data · not a measurement of you</p>
      <h4 className="osdr-title">{study.title}</h4>
      <p className="osdr-why">{study.relevance}</p>
      <dl className="osdr-facts">
        {facts.filter(([, value]) => value).map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}
      </dl>
      <p className="osdr-source">
        <button type="button" onClick={() => void api.openNasaSource(study.study_url).catch(() => undefined)} title={study.study_url}><ExternalLink className="size-3" aria-hidden="true" />Open {study.accession} in NASA OSDR</button>
        <span>Record retrieved {day(study.provenance.retrieved_at)} from the OSDR Biological Data API{study.released ? ` · released ${day(study.released)}` : ""}</span>
      </p>
      <p className="limit-line"><strong>Limit:</strong> {limitations}</p>
    </article>
  );
}

/** The studies related to any of the given health topics. */
export function studiesFor(studies: OsdrStudies | undefined, conditionIds: string[]): OsdrStudy[] {
  return studies?.studies.filter((study) => study.condition_ids.some((id) => conditionIds.includes(id))) ?? [];
}
