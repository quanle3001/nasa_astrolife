import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, CornerDownRight, HelpCircle, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import { ProvenanceBadge, SourceList } from "@/components/flow/common";
import { Button } from "@/components/ui/button";
import { useCalmMotion } from "@/lib/motion-preference";
import { cn } from "@/lib/utils";
import { answerError, SKIPPED, UNSURE, type QuestionnaireView } from "@/questions/engine";
import type { AnswerValue, Knowledge, Question } from "@/types/flow";

function answerLabel(question: Question, value: AnswerValue | undefined): string {
  if (value === undefined) return "";
  if (value === UNSURE) return "Not sure";
  if (value === SKIPPED) return "Skipped";
  if (question.input === "boolean") return value === "yes" ? "Yes" : "No";
  if (question.input === "number") return `${value} ${question.validation?.unit ?? ""}`.trim();
  return question.options?.find((option) => option.value === value)?.label ?? String(value);
}

function NumberAnswer({ question, value, onAnswer }: { question: Question; value: AnswerValue | undefined; onAnswer: (value: AnswerValue) => void }) {
  const [text, setText] = useState(typeof value === "number" ? String(value) : "");
  const number = Number(text);
  const error = text.trim() === "" ? "" : answerError(question, number);
  return (
    <form className="number-answer" onSubmit={(event) => { event.preventDefault(); if (text.trim() !== "" && !error) onAnswer(number); }}>
      <label htmlFor={`answer-${question.id}`} className="sr-only">{question.text}</label>
      <input id={`answer-${question.id}`} className="control" inputMode="decimal" autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder={question.validation ? `${question.validation.min}–${question.validation.max}` : ""} aria-invalid={error ? true : undefined} aria-describedby={error ? `answer-${question.id}-error` : undefined} />
      <span className="text-sm text-space-muted">{question.validation?.unit}</span>
      <Button type="submit" variant="primary" disabled={text.trim() === "" || Boolean(error)}>Confirm</Button>
      {error && <small id={`answer-${question.id}-error`} className="field-error basis-full">{error}</small>}
    </form>
  );
}

/**
 * Step 6: one focused question at a time.
 *
 * Moving to a new health topic replaces the whole stage (full transition);
 * moving within a topic only swaps the floating question card. Follow-ups are
 * marked as such. The list of questions comes from the engine and changes as
 * answers change; this component only presents it.
 */
export function QuestionsPage({ view, knowledge, index, onIndex, onAnswer, onBack, onDone, aside, notice, error }: {
  view: QuestionnaireView; knowledge: Knowledge; index: number; onIndex: (index: number) => void;
  onAnswer: (question: Question, value: AnswerValue) => void; onBack: () => void; onDone: () => void;
  aside?: React.ReactNode; notice?: string; error?: string;
}) {
  const reduced = useCalmMotion();
  const total = view.questions.length;
  const position = Math.min(index, total);
  const question = position < total ? view.questions[position] : null;
  const domain = question ? knowledge.registry.domains.find((item) => item.id === question.domain) : null;
  const parent = question?.parent ? knowledge.registry.questions.find((item) => item.id === question.parent) : null;
  const hazards = (domain?.hazard_ids ?? []).map((id) => knowledge.catalog.hazards.find((hazard) => hazard.id === id)?.title ?? id);
  const current = question ? view.answers[question.id] : undefined;
  // Keyboard: 1-9 pick an option, matching the numbers shown on the buttons.
  useEffect(() => {
    if (!question || question.input === "number") return undefined;
    const options = question.input === "boolean" ? [{ value: "yes" }, { value: "no" }] : question.options ?? [];
    const listener = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(event.target.tagName))) return;
      const choice = options[Number(event.key) - 1];
      if (choice) { event.preventDefault(); onAnswer(question, choice.value); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [question, onAnswer]);

  const options = !question ? [] : question.input === "boolean" ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] : question.options ?? [];
  const pop = reduced ? {} : { initial: { opacity: 0, y: 18, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -12, scale: 0.98 }, transition: { duration: 0.22 } };
  const stage = reduced ? {} : { initial: { opacity: 0, x: 40 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -40 }, transition: { duration: 0.3 } };

  return (
    <div className="flow-page question-page">
      <div className="question-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(position, total)} aria-label="Check-in progress">
        <span style={{ width: `${total ? (Math.min(position, total) / total) * 100 : 100}%` }} />
      </div>
      <p className="question-count">{question ? `Question ${position + 1} of ${total}` : `All ${total} questions seen`} · {view.answered} answered</p>
      {notice && <p className="flow-notice" role="status">{notice}</p>}
      <AnimatePresence mode="wait" initial={false}>
        {question && domain ? (
          <motion.section key={domain.id} className="question-stage" {...stage}>
            <header className="question-topic">
              <p className="telemetry-label">Health topic</p>
              <h1>{domain.title}</h1>
              {hazards.length > 0 && <p className="topic-hazards">Related NASA hazard{hazards.length > 1 ? "s" : ""}: {hazards.join(" · ")}</p>}
            </header>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={question.id} className={cn("question-card", parent && "is-followup")} {...pop}>
                {parent && <p className="followup-tag"><CornerDownRight className="size-3.5" aria-hidden="true" /> Follow-up to "{parent.text}"</p>}
                <h2 id="question-text">{question.text}</h2>
                {question.input === "number"
                  ? <NumberAnswer key={question.id} question={question} value={current} onAnswer={(value) => onAnswer(question, value)} />
                  : (
                    <div className={cn("answer-grid", question.input === "scale" && "is-scale")} role="radiogroup" aria-labelledby="question-text">
                      {options.map((option, optionIndex) => (
                        <button key={option.value} type="button" role="radio" aria-checked={current === option.value} className={cn("answer-button", current === option.value && "is-selected")} onClick={() => onAnswer(question, option.value)}>
                          <kbd className="kbd" aria-hidden="true">{optionIndex + 1}</kbd>{option.label}
                        </button>
                      ))}
                    </div>
                  )}
                <div className="question-secondary">
                  {question.allow_unsure && <Button variant="ghost" size="sm" onClick={() => onAnswer(question, UNSURE)} aria-pressed={current === UNSURE}><HelpCircle className="size-3.5" /> Not sure</Button>}
                  {question.allow_skip && <Button variant="ghost" size="sm" onClick={() => onAnswer(question, SKIPPED)} aria-pressed={current === SKIPPED}><SkipForward className="size-3.5" /> Skip</Button>}
                  {current !== undefined && <span className="text-xs text-space-subtle">Current answer: {answerLabel(question, current)}</span>}
                </div>
                <div className="question-evidence"><ProvenanceBadge kind="evidence" label="Why we ask · NASA source" /><SourceList ids={question.evidence_ids} sources={knowledge.catalog.sources} /></div>
              </motion.div>
            </AnimatePresence>
          </motion.section>
        ) : (
          <motion.section key="review" className="question-stage" {...stage}>
            <header className="question-topic"><p className="telemetry-label">Review</p><h1>Your answers</h1><p className="topic-hazards">Select an answer to change it. Unsure and skipped items stay "not assessed".</p></header>
            <ul className="answer-review">
              {view.questions.map((item, itemIndex) => (
                <li key={item.id}>
                  <button type="button" onClick={() => onIndex(itemIndex)}>
                    <span>{item.parent && <CornerDownRight className="mr-1 inline size-3" aria-hidden="true" />}{item.text}</span>
                    <strong className={cn(view.answers[item.id] === undefined && "text-space-subtle")}>{answerLabel(item, view.answers[item.id]) || "Not answered"}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </motion.section>
        )}
      </AnimatePresence>
      {error && <div role="alert" className="flow-error">{error}</div>}
      <div className="flow-controls">
        <Button variant="ghost" onClick={() => (position > 0 ? onIndex(position - 1) : onBack())}><ArrowLeft className="size-4" /> Back</Button>
        <div className="flex items-center gap-2">
          {aside}
          {question
            ? <Button onClick={() => onIndex(position + 1)} disabled={question.required && current === undefined}>{current === undefined ? "Leave unanswered" : "Next"}</Button>
            : <Button variant="primary" size="lg" onClick={onDone}>Continue to measurement</Button>}
        </div>
      </div>
    </div>
  );
}
