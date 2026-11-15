import { ShieldCheck } from "lucide-react";
import { FlowPage } from "@/components/flow/common";
import { cn } from "@/lib/utils";
import type { Answers, Question } from "@/types/flow";

/**
 * Step 5: what the check-in collects, then the universal safety screen.
 * The same items are shown for every mission and none can be skipped: the
 * astronaut either ticks what applies or confirms that nothing does.
 */
export function SafetyPage({ questions, answers, onChange, onBack, onNext, busy, error, aside }: {
  questions: Question[]; answers: Answers; onChange: (answers: Answers) => void;
  onBack: () => void; onNext: () => void; busy: boolean; error: string; aside?: React.ReactNode;
}) {
  const complete = questions.every((question) => answers[question.id] === "yes" || answers[question.id] === "no");
  const anyYes = questions.some((question) => answers[question.id] === "yes");
  const noneConfirmed = complete && !anyYes;
  const toggle = (id: string) => {
    // Ticking one item answers the screen: unticked items are an explicit "no" from this point on.
    const next: Answers = { ...answers };
    for (const question of questions) next[question.id] = next[question.id] === "yes" ? "yes" : "no";
    next[id] = answers[id] === "yes" ? "no" : "yes";
    onChange(next);
  };
  const confirmNone = () => onChange({ ...answers, ...Object.fromEntries(questions.map((question) => [question.id, "no"])) });
  const clear = () => { const next = { ...answers }; for (const question of questions) delete next[question.id]; onChange(next); };
  return (
    <FlowPage title="First: is anything urgent right now?"
      lead="These questions are the same on every mission and come before everything else. If one applies, you will see what to do immediately."
      onBack={onBack} onNext={onNext} nextDisabled={!complete} busy={busy} nextLabel={anyYes ? "Show what to do now" : "Continue to check-in"}
      aside={<>{!complete && <span className="flow-hint">Tick what applies, or tick "None of these"</span>}{aside}</>}
    >
      <fieldset className="safety-list">
        <legend>Tick anything that applies to you right now</legend>
        {questions.map((question) => (
          <label key={question.id} className={cn("check-tile", answers[question.id] === "yes" && "is-urgent")}>
            <input type="checkbox" checked={answers[question.id] === "yes"} onChange={() => toggle(question.id)} />
            <span>{question.text}</span>
          </label>
        ))}
      </fieldset>
      <label className={cn("check-tile none-tile", noneConfirmed && "is-confirmed")}>
        <input type="checkbox" checked={noneConfirmed} onChange={() => (noneConfirmed ? clear() : confirmNone())} />
        <span>None of these apply to me right now</span>
      </label>
      <div className="collect-note">
        <ShieldCheck className="size-5 shrink-0 text-space-cyan" aria-hidden="true" />
        <div>
          <strong>What this check-in records</strong>
          <p>Your answers, a pulse and oxygen reading from your sensor, the resulting prompts and your follow-up actions. They are stored only on this computer, unencrypted, so you can resume and review them. Skipped or unsure answers are kept as "not assessed", never as "no".</p>
        </div>
      </div>
      {error && <div role="alert" className="flow-error">{error}</div>}
    </FlowPage>
  );
}
