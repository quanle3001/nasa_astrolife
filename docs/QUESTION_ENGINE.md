# Question engine

The check-in asks one question at a time and adapts to the mission and to the
answers already given. It is deterministic: the same mission profile and the
same answers always produce the same questions in the same order.

It only decides **what to ask**. It never scores an answer. Scoring is done by
the Python rules after submission.

## Files

| File | Role |
|---|---|
| `software/resources/question_registry.json` | The questions (version `2026.11.1`) |
| `software/astrotip/questionnaire/registry.py` | Validation and eligibility in Python |
| `software/astrotip/questionnaire/session.py` | Answers → check-in for the rules |
| `desktop/src/questions/engine.ts` | The same eligibility rules in TypeScript |
| `desktop/src/questions/questionnaire-machine.ts` | XState machine holding answers and position |
| `software/resources/question_vectors.json` | Shared test cases run by both implementations |

## What is in the registry

27 questions in 8 topics.

| Topic | Questions | Notes |
|---|---|---|
| Safety screen | 9 | Required, same for every mission, shown together on one screen |
| Sleep and fatigue | 4 | Two follow-ups appear after "Poorly" |
| Mood and teamwork | 3 | One follow-up |
| Balance and vision | 4 | Two follow-ups after dizziness |
| Heart and circulation | 1 | |
| Strength and exercise | 3 | |
| After your EVA | 1 | Only when the mission context says there was a recent EVA; required |
| Illness and nutrition | 2 | |

Input types: 21 yes/no, 4 single choice, 1 three-point scale, 1 number.
Six questions have a `show_if` condition.

Every question maps only to observation keys and fields the rules already
understood. **No question adds a clinical cut-off.**

## One question

```json
{
  "id": "sleep.hours",
  "domain": "sleep",
  "parent": "sleep.quality",
  "text": "About how many hours did you sleep in the last 24 hours?",
  "input": "number",
  "required": false,
  "allow_skip": true,
  "validation": { "min": 0, "max": 24, "unit": "hours" },
  "show_if": { "answer": { "question": "sleep.quality", "in": ["poorly"] } },
  "maps_to": { "field": "sleep_hours" },
  "evidence_ids": ["sleep"]
}
```

| Field | Meaning |
|---|---|
| `input` | `boolean`, `choice`, `scale` or `number` |
| `required` | The check-in cannot be submitted without an answer |
| `allow_unsure`, `allow_skip` | Whether "Not sure" and "Skip" are offered |
| `show_if` | Condition on an earlier answer or on the mission profile; may be nested with `all` and `any` |
| `parent` | The question this one follows up |
| `maps_to` | Symptom keys or a check-in field for the rules; a question with only `note_label` adds context to the record and triggers no rule |
| `urgent` | A "yes" interrupts with the emergency guidance from the rules |
| `evidence_ids` | NASA catalog topics or sources shown with the question |

## Order

1. The safety screen is always first.
2. Topics promoted by the mission context come next (for example "After your
   EVA" when a recent EVA was recorded).
3. The remaining topics follow the hazard order of the mission, taken from
   `mission_context.json`. On a Mars profile, topics tied to radiation, distance
   and isolation come before those tied to gravity.

The hazards page shows this plan before the check-in starts, with the reason
the first topic is first.

## Changing an earlier answer

Going back and changing an answer re-evaluates every `show_if`. Follow-up
answers whose question no longer applies are removed in the same step, and the
screen says which ones were removed. They are not sent to the rules.

## "Not sure" and "Skip"

Both are stored. Neither counts as "no". In the findings they appear as
"not assessed", and an unanswered topic is never described as healthy.

## Why this question

Each question card says why it is shown: its topic's NASA hazards, the NASA
source, and for a follow-up the earlier answer that caused it ("Asked because
you answered 'Poorly' to the previous question").

## Two implementations, one behaviour

The interface needs the rules to react instantly. The backend needs them to
refuse a submission that skips a required question or includes an answer to a
question that should not exist. Both read the same registry and both run the
cases in `question_vectors.json`, so they cannot drift apart unnoticed.

`session.submit` validates answers with the Python implementation before it
looks at the measurement.

## Adding a question

1. Add it to `question_registry.json`. Map it only to an existing symptom key
   or check-in field, or give it a `note_label`.
2. Run both test suites. Registry validation rejects unknown topics and symptom
   keys, conditions that refer to a later question, choice questions with fewer
   than two options, questions without a resolvable source, and a safety screen
   that does not cover every urgent observation in the rules.
3. If behaviour changes, review and regenerate the affected cases in
   `question_vectors.json`, and raise the registry `version`.
