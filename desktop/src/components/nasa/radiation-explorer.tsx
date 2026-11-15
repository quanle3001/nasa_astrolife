import { CloudDownload, Radiation } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EvidenceReports, ProvenanceBadge, SourceList } from "@/components/flow/common";
import { SeriesChart } from "@/components/nasa/series-chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MissionId } from "@/types/backend";
import type { Knowledge } from "@/types/flow";
import type { RadLabOrigin, RadLabResult } from "@/types/nasa";

const ORIGIN_TEXT: Record<RadLabOrigin, string> = {
  live: "Retrieved from NASA just now",
  retrieved_on_this_computer: "Offline copy · retrieved from NASA on this computer",
  bundled_snapshot: "Offline copy included with AstroLife",
  none: "No verified dataset available",
};
const ENVIRONMENT_TEXT: Record<MissionId, string> = { leo: "Low Earth orbit", lunar: "Lunar", mars: "Mars" };
const when = (iso: string) => { const date = new Date(iso); return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(); };
const number = (value: number) => (Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2));
/** Time of day from a published timestamp, as given. */
const clock = (timestamp: string) => timestamp.slice(11, 16);
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

/**
 * Radiation Explorer: real dose-rate readings from the NASA OSDR RadLab API.
 *
 * It shows one instrument at a time, starting with the one that matches the
 * astronaut's mission, and always says where the data came from, when it was
 * retrieved and what it is not: it is historical instrument data, never the
 * astronaut's own exposure.
 */
export function RadiationExplorer({ knowledge, mission }: { knowledge: Knowledge; mission: MissionId }) {
  const [result, setResult] = useState<RadLabResult | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [instrument, setInstrument] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.getRadLab().then((data) => { if (alive && "available" in data) setResult(data); }).catch((reason) => { if (alive) setLoadError(message(reason)); });
    const stop = api.onBackendEvent((event) => {
      if (event.event !== "nasa.radlab.updated") return;
      setResult(event.payload as unknown as RadLabResult);
      setRefreshing(false);
    });
    return () => { alive = false; stop(); };
  }, []);

  const refresh = async () => {
    setRefreshing(true); setLoadError("");
    try { await api.getRadLab(true); } catch (reason) { setLoadError(message(reason)); setRefreshing(false); }
  };

  const dataset = result?.dataset ?? null;
  const notes = result?.instrument_notes;
  const analysis = result?.analysis ?? null;
  const ids = useMemo(() => (dataset ? Object.keys(dataset.instruments) : []), [dataset]);
  // Only instruments of the astronaut's own mission environment are offered as mission data.
  const relevant = useMemo(() => (analysis ? analysis.by_environment[mission].filter((id) => ids.includes(id)) : []), [analysis, mission, ids]);
  const others = ids.filter((id) => !relevant.includes(id));
  const preferred = notes && relevant.includes(notes.preferred[mission]) ? notes.preferred[mission] : relevant[0];
  const active = instrument && ids.includes(instrument) ? instrument : preferred ?? null;
  const stats = active && analysis ? analysis.instruments[active] : null;
  const radiationRisk = knowledge.catalog.conditions.find((condition) => condition.id === "radiation");
  const series = active && dataset ? dataset.instruments[active] : null;
  const hours = useMemo(() => {
    if (!series || !dataset) return [];
    const start = Date.parse(`${dataset.window_start}T00:00:00Z`);
    // Published timestamps carry no zone; they are read as given to place them within the day.
    return series.timestamps.map((timestamp) => (Date.parse(`${timestamp}Z`) - start) / 3_600_000);
  }, [series, dataset]);
  const hourlyOverlay = useMemo(() => (stats ? { label: "Hourly mean", values: hours.map((hour) => stats.hourly_mean[Math.min(23, Math.max(0, Math.floor(hour)))]) } : undefined), [stats, hours]);
  const hazard = knowledge.mission_context.hazards.radiation;
  const unit = dataset?.unit ?? null;

  return (
    <Card className="p-5" data-testid="radiation-explorer">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="telemetry-label"><Radiation className="mr-1.5 inline size-3.5 text-space-cyan" aria-hidden="true" />Radiation Explorer · NASA OSDR RadLab</h2>
        <ProvenanceBadge kind="historical" />
      </div>
      <p className="mt-3 max-w-[68ch] text-sm leading-6 text-space-silver">{hazard.summary} {hazard.why_it_matters}</p>
      <SourceList ids={hazard.source_ids} sources={knowledge.catalog.sources} />
      <p className="not-yours" role="note"><strong>This is not a measurement of you.</strong> These are historical readings from instruments on past and current missions. They are not your exposure, not live telemetry and not a dose total. AstroLife does not measure radiation.</p>

      {!result && !loadError && <p className="empty-line mt-4" aria-busy="true">Loading the verified NASA dataset…</p>}
      {loadError && <div role="alert" className="flow-error mt-4">{loadError}</div>}
      {result && !result.available && (
        <div role="alert" className="flow-error mt-4">
          <strong>NASA radiation data is unavailable.</strong> {result.error} No substitute data is shown.
        </div>
      )}

      {dataset && notes && (
        <>
          {result?.error && <p className="flow-notice mt-4" role="status">The latest retrieval from NASA did not succeed ({result.error}) The verified offline copy is shown instead.</p>}
          <h3 className="radlab-group">Instruments in your mission environment · {ENVIRONMENT_TEXT[mission]}</h3>
          {relevant.length === 0 && <p className="flow-notice" role="status">RadLab has no instrument in this dataset for your mission environment, so no mission-specific radiation data is shown. Instruments from other environments are listed below for comparison only.</p>}
          <div className="radlab-instruments" role="radiogroup" aria-label="Instruments in your mission environment">
            {relevant.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={active === id} className={cn("radlab-instrument", active === id && "is-selected")} onClick={() => setInstrument(id)}>
                <strong>{notes.instruments[id]?.label ?? id}</strong>
                <small>{analysis?.instruments[id].count} readings · median {analysis ? number(analysis.instruments[id].median) : ""}</small>
              </button>
            ))}
          </div>
          <h3 className="radlab-group">Other environments · for comparison, not your mission</h3>
          <div className="radlab-instruments" role="radiogroup" aria-label="Instruments in other environments">
            {others.map((id) => {
              const note = notes.instruments[id];
              return (
                <button key={id} type="button" role="radio" aria-checked={active === id} className={cn("radlab-instrument is-other", active === id && "is-selected")} onClick={() => setInstrument(id)}>
                  <strong>{note?.label ?? id}</strong>
                  <small>{note ? ENVIRONMENT_TEXT[note.environment] : "Instrument id from RadLab"}</small>
                </button>
              );
            })}
          </div>
        </>
      )}

      {dataset && notes && active && series && (
        <>
          <div className="mt-4">
            <h3 className="text-base font-semibold text-white">{notes.instruments[active]?.label ?? active}</h3>
            <p className="mt-1 max-w-[68ch] text-sm text-space-muted">{notes.instruments[active]?.description ?? "RadLab publishes this instrument by id. AstroLife has no verified description for it."}</p>
            <p className="mt-2 text-xs text-space-subtle">{dataset.measurement.replaceAll("_", " ")} · {unit ? `unit: ${unit}` : "unit not stated by the API"} · {series.values.length} readings on {dataset.window_start}</p>
          </div>
          <div className="mt-3"><SeriesChart hours={hours} values={series.values} overlay={hourlyOverlay} label={`${notes.instruments[active]?.label ?? active}, ${dataset.measurement.replaceAll("_", " ")}`} /></div>

          {stats && analysis && (
            <section className="radlab-analysis" aria-label="Analysis of the retrieved readings">
              <h3>What AstroLife computed from these readings</h3>
              <dl className="fact-grid">
                <div><dt>Readings</dt><dd>{stats.count}</dd></div>
                <div><dt>Mean</dt><dd>{number(stats.mean)}</dd></div>
                <div><dt>Median</dt><dd>{number(stats.median)}</dd></div>
                <div><dt>Range</dt><dd>{number(stats.minimum)} to {number(stats.maximum)}</dd></div>
                <div><dt>Standard deviation</dt><dd>{number(stats.standard_deviation)}</dd></div>
                <div><dt>95th percentile</dt><dd>{number(stats.percentile_95)}</dd></div>
                <div><dt>Usual interval</dt><dd>{stats.cadence_minutes != null ? `${stats.cadence_minutes} min` : "Not enough readings"}</dd></div>
                <div><dt>Coverage of the day</dt><dd>{stats.coverage_percent != null ? `${stats.coverage_percent}%` : "Not available"}</dd></div>
              </dl>
              <h4>Missing and irregular readings</h4>
              <ul className="dot-list">
                <li>{stats.gap_count === 0 ? "No pause longer than three times the usual interval." : `${stats.gap_count} pause${stats.gap_count > 1 ? "s" : ""}: ${stats.gaps.map((gap) => `${clock(gap.start)} to ${clock(gap.end)} (${gap.minutes} min)`).join("; ")}.`}</li>
                <li>{stats.zero_count === 0 ? "No reading is exactly zero." : `${stats.zero_count} reading${stats.zero_count > 1 ? "s are" : " is"} exactly zero; the API does not say whether these are measurements or placeholders.`}</li>
                <li>{stats.excursion_count === 0 ? "No reading is more than three times this instrument's median." : `${stats.excursion_count} reading${stats.excursion_count > 1 ? "s" : ""} above three times the median (${number(stats.excursion_threshold)}), in ${stats.excursion_episodes} episode${stats.excursion_episodes > 1 ? "s" : ""}: ${stats.excursions.map((episode) => `${clock(episode.start)} to ${clock(episode.end)}, peak ${number(episode.peak)}`).join("; ")}. The dataset does not state the cause.`}</li>
                {stats.hours_without_data.length > 0 && <li>No readings in {stats.hours_without_data.length} hour{stats.hours_without_data.length > 1 ? "s" : ""} of the day.</li>}
              </ul>
              <h4>Change through the day</h4>
              <ul className="dot-list">
                {stats.highest_hour != null && stats.lowest_hour != null && <li>Highest hourly mean in the hour starting {String(stats.highest_hour).padStart(2, "0")}:00 ({number(stats.hourly_mean[stats.highest_hour] ?? 0)}); lowest in the hour starting {String(stats.lowest_hour).padStart(2, "0")}:00 ({number(stats.hourly_mean[stats.lowest_hour] ?? 0)}).</li>}
                {stats.first_half_mean != null && stats.second_half_mean != null && <li>Mean of the first half of the day {number(stats.first_half_mean)}, second half {number(stats.second_half_mean)}.</li>}
              </ul>
              <p className="flow-footnote">{analysis.method.statistics} {analysis.method.limits}</p>
            </section>
          )}

          {radiationRisk && (
            <section className="radlab-analysis" aria-label="What this means for a crew">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3>What crews do about radiation</h3><ProvenanceBadge kind="evidence" /></div>
              <ul className="dot-list">{radiationRisk.countermeasures.map((item) => <li key={item.text}>{item.text} <small className="text-space-subtle">({item.evidence})</small></li>)}</ul>
              <p className="limit-line"><strong>Limit:</strong> {radiationRisk.limitations}</p>
              <EvidenceReports reports={knowledge.hrr_evidence.conditions.radiation} />
            </section>
          )}

          <table className="trend-table mt-4">
            <caption className="sr-only">Range of {dataset.measurement.replaceAll("_", " ")} per instrument on {dataset.window_start}</caption>
            <thead><tr><th scope="col">Instrument (RadLab id)</th><th scope="col">Readings</th><th scope="col">Lowest</th><th scope="col">Median</th><th scope="col">Highest</th></tr></thead>
            <tbody>
              {ids.map((id) => (
                <tr key={id} className={cn(active === id && "is-current")}>
                  <th scope="row" className="text-left font-normal">{id}</th>
                  <td>{result.summary[id].count}</td><td>{number(result.summary[id].minimum)}</td><td>{number(result.summary[id].median)}</td><td>{number(result.summary[id].maximum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs leading-5 text-space-subtle">{dataset.unit_note} Instruments differ in location, shielding and method, so their values are not directly comparable. {notes.note}</p>

          <dl className="monitor-details" aria-label="Data provenance">
            <div><dt>Source</dt><dd>{dataset.provider}</dd></div>
            <div><dt>Shown copy</dt><dd>{ORIGIN_TEXT[result?.origin ?? "none"]}</dd></div>
            <div><dt>Retrieved from NASA</dt><dd>{when(dataset.retrieved_at)}</dd></div>
            <div><dt>Window</dt><dd>{dataset.window_start} to {dataset.window_end}</dd></div>
            <div><dt>Rows</dt><dd>{dataset.row_count.toLocaleString()} · {ids.length} instruments</dd></div>
            <div><dt>Integrity (SHA-256)</dt><dd title={dataset.data_sha256}>{dataset.data_sha256.slice(0, 12)}… verified</dd></div>
          </dl>
          <p className="mt-3 break-all text-xs text-space-subtle">Request: {dataset.request_url}</p>
          <p className="mt-1 text-xs text-space-subtle">{dataset.timestamp_note}</p>
        </>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => void refresh()} disabled={refreshing} aria-busy={refreshing || undefined}><CloudDownload className="size-4" /> {refreshing ? "Retrieving from NASA…" : "Retrieve again from NASA"}</Button>
        <button type="button" className="text-link" onClick={() => void api.openNasaSource("https://visualization.osdr.nasa.gov/radlab/gui/data-api/").catch(() => undefined)}>RadLab data API documentation</button>
      </div>
    </Card>
  );
}
