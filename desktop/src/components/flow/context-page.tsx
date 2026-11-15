import { useState } from "react";
import { FlowPage } from "@/components/flow/common";
import { cn } from "@/lib/utils";
import type { MissionContext, MissionProfile } from "@/types/flow";

const MAX_DAY = 2000;

function YesNo({ legend, hint, value, onChange }: { legend: string; hint: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <fieldset className="context-field">
      <legend>{legend}</legend>
      <p>{hint}</p>
      <div className="choice-row" role="radiogroup" aria-label={legend}>
        {[true, false].map((option) => (
          <button key={String(option)} type="button" role="radio" aria-checked={value === option} className={cn("choice-chip", value === option && "is-selected")} onClick={() => onChange(option)}>{option ? "Yes" : "No"}</button>
        ))}
      </div>
    </fieldset>
  );
}

/** Step 3: the few mission facts that change what is asked first. */
export function ContextPage({ profile, context, onChange, onBack, onNext, busy, error }: {
  profile: MissionProfile; context: MissionContext; onChange: (profile: MissionProfile) => void;
  onBack: () => void; onNext: () => void; busy: boolean; error: string;
}) {
  const mission = context.missions[profile.environment];
  const [dayText, setDayText] = useState(profile.mission_day?.toString() ?? "");
  const dayNumber = Number(dayText);
  const dayError = dayText.trim() !== "" && (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > MAX_DAY)
    ? `Enter a whole number from 1 to ${MAX_DAY}, or leave it blank.` : "";
  const setDay = (text: string) => {
    setDayText(text);
    const value = Number(text);
    onChange({ ...profile, mission_day: text.trim() !== "" && Number.isInteger(value) && value >= 1 && value <= MAX_DAY ? value : null });
  };
  return (
    <FlowPage
      eyebrow="Step 2 · Mission context" title={`Tell us about your ${mission.title} mission`}
      lead="Only what changes the check-in. These answers are saved on this computer and are not used to estimate any health risk."
      onBack={onBack} onNext={onNext} nextDisabled={Boolean(dayError)} busy={busy}
    >
      <div className="context-grid">
        <fieldset className="context-field">
          <legend>Mission phase</legend>
          <p>Where you are in the mission right now.</p>
          <div className="choice-row" role="radiogroup" aria-label="Mission phase">
            {context.phases.filter((phase) => mission.phases.includes(phase.id)).map((phase) => (
              <button key={phase.id} type="button" role="radio" aria-checked={profile.phase === phase.id} className={cn("choice-chip", profile.phase === phase.id && "is-selected")} onClick={() => onChange({ ...profile, phase: phase.id })}>{phase.title}</button>
            ))}
          </div>
        </fieldset>
        <div className="context-field">
          <label htmlFor="mission-day">Mission day <span className="text-space-subtle">· optional</span></label>
          <p>Shown on your dashboard. It does not change any result.</p>
          <input id="mission-day" className="control max-w-40" inputMode="numeric" value={dayText} onChange={(event) => setDay(event.target.value)} placeholder="e.g. 120" aria-invalid={dayError ? true : undefined} aria-describedby={dayError ? "mission-day-error" : undefined} />
          {dayError && <small id="mission-day-error" className="field-error">{dayError}</small>}
        </div>
        <YesNo legend="EVA or pressure change in the last 24 hours?" hint="If yes, the check-in asks about new symptoms since the EVA." value={profile.eva_recent} onChange={(value) => onChange({ ...profile, eva_recent: value })} />
        <YesNo legend="Recent gravity transition?" hint="Launch, landing, docking or arrival on a surface. If yes, balance questions come first." value={profile.gravity_transition_recent} onChange={(value) => onChange({ ...profile, gravity_transition_recent: value })} />
      </div>
      {error && <div role="alert" className="flow-error">{error}</div>}
    </FlowPage>
  );
}
