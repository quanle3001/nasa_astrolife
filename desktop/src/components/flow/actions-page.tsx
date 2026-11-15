import { CheckCircle2, Circle, RotateCcw } from "lucide-react";
import { FlowPage, LEVEL_LABELS, ProvenanceBadge, SourceList } from "@/components/flow/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PriorityLevel } from "@/types/backend";
import type { FollowupAction, Knowledge } from "@/types/flow";

const ORDER: Record<PriorityLevel, number> = { urgent: 0, review: 1, watch: 2, info: 3 };

/** One follow-up action with the observation that led to it and its evidence. */
export function ActionItem({ action, knowledge, conditionTitles, onToggle, busy }: {
  action: FollowupAction; knowledge: Knowledge; conditionTitles: Record<string, string>;
  onToggle: (action: FollowupAction) => void; busy?: boolean;
}) {
  const condition = knowledge.catalog.conditions.find((item) => item.id === action.condition_id);
  const done = action.status === "done";
  return (
    <li className={cn("action-item", done && "is-done")}>
      <button type="button" className="action-toggle" role="checkbox" aria-checked={done} disabled={busy} onClick={() => onToggle(action)} aria-label={`${done ? "Reopen" : "Mark done"}: ${action.text}`}>
        {done ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("priority-badge", `priority-${action.level}`)}>{LEVEL_LABELS[action.level]}</span>
          <span className="text-xs text-space-subtle">{conditionTitles[action.condition_id] ?? action.condition_id}</span>
          {done && action.completed_at && <span className="text-xs text-space-subtle">Done {new Date(action.completed_at).toLocaleString()}</span>}
        </div>
        <p className="action-text">{action.text}</p>
        <p className="action-observation"><strong>Because:</strong> {action.observation}</p>
        {condition && <SourceList ids={condition.source_ids.slice(0, 2)} sources={knowledge.catalog.sources} />}
      </div>
    </li>
  );
}

/**
 * Step 10: follow-up actions created from the rule-based prompts of a check-in.
 * Actions are things to do or discuss; NASA research summaries stay on the
 * findings and compass pages.
 */
export function ActionsPage({ actions, knowledge, conditionTitles, onToggle, onReassess, onBack, onNext, busyId, error }: {
  actions: FollowupAction[]; knowledge: Knowledge; conditionTitles: Record<string, string>;
  onToggle: (action: FollowupAction) => void; onReassess: () => void; onBack?: () => void; onNext: () => void;
  busyId?: number | null; error?: string;
}) {
  const sorted = [...actions].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || ORDER[a.level] - ORDER[b.level] || b.id - a.id);
  const open = actions.filter((action) => action.status === "open").length;
  return (
    <FlowPage title="Your next steps"
      lead={actions.length ? `${open} open · ${actions.length - open} done. Mark an action done when you have completed or discussed it.` : "No follow-up action was created from your check-ins."}
      onBack={onBack} onNext={onNext} nextLabel="Go to mission dashboard"
      aside={<Button onClick={onReassess}><RotateCcw className="size-4" /> Reassess now</Button>}
    >
      <div className="flex flex-wrap items-center gap-2"><ProvenanceBadge kind="rule" /><span className="text-xs text-space-subtle">Actions come from AstroLife's rule-based prompts. They are not prescriptions; follow your mission medical procedures.</span></div>
      {sorted.length > 0 ? (
        <ul className="action-list">
          {sorted.map((action) => <ActionItem key={action.id} action={action} knowledge={knowledge} conditionTitles={conditionTitles} onToggle={onToggle} busy={busyId === action.id} />)}
        </ul>
      ) : <p className="empty-line">Nothing to follow up. An empty list is not a health clearance: report any new concern at any time.</p>}
      {error && <div role="alert" className="flow-error">{error}</div>}
    </FlowPage>
  );
}
