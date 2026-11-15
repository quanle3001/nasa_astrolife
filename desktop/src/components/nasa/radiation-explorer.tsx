import { CloudDownload, Radiation } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ProvenanceBadge, SourceList } from "@/components/flow/common";
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
  const ids = useMemo(() => (dataset ? Object.keys(dataset.instruments) : []), [dataset]);
  const active = instrument && ids.includes(instrument) ? instrument : notes && ids.includes(notes.preferred[mission]) ? notes.preferred[mission] : ids[0] ?? null;
  const series = active && dataset ? dataset.instruments[active] : null;
  const hours = useMemo(() => {
    if (!series || !dataset) return [];
    const start = Date.parse(`${dataset.window_start}T00:00:00Z`);
    // Published timestamps carry no zone; they are read as given to place them within the day.
    return series.timestamps.map((timestamp) => (Date.parse(`${timestamp}Z`) - start) / 3_600_000);
  }, [series, dataset]);
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

      {dataset && notes && active && series && (
        <>
          {result?.error && <p className="flow-notice mt-4" role="status">The latest retrieval from NASA did not succeed ({result.error}) The verified offline copy is shown instead.</p>}
          <div className="radlab-instruments" role="radiogroup" aria-label="Instrument">
            {ids.map((id) => {
              const note = notes.instruments[id];
              return (
                <button key={id} type="button" role="radio" aria-checked={active === id} className={cn("radlab-instrument", active === id && "is-selected")} onClick={() => setInstrument(id)}>
                  <strong>{note?.label ?? id}</strong>
                  <small>{note ? ENVIRONMENT_TEXT[note.environment] : "Instrument id from RadLab"}{note && note.environment === mission ? " · your mission environment" : ""}</small>
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <h3 className="text-base font-semibold text-white">{notes.instruments[active]?.label ?? active}</h3>
            <p className="mt-1 max-w-[68ch] text-sm text-space-muted">{notes.instruments[active]?.description ?? "RadLab publishes this instrument by id. AstroLife has no verified description for it."}</p>
            <p className="mt-2 text-xs text-space-subtle">{dataset.measurement.replaceAll("_", " ")} · {unit ? `unit: ${unit}` : "unit not stated by the API"} · {series.values.length} readings on {dataset.window_start}</p>
          </div>
          <div className="mt-3"><SeriesChart hours={hours} values={series.values} label={`${notes.instruments[active]?.label ?? active}, ${dataset.measurement.replaceAll("_", " ")}`} /></div>

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
