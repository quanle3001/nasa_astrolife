# NASA guidance catalog

Reviewed against NASA's public pages on **2026-11-14**. This is a curated, offline educational catalog; it is not raw patient data, a trained model, or a live NASA feed. No NASA endorsement or clinical validation of AstroTip is implied.

## Sources and scope

The user-supplied [hazards overview](https://www.nasa.gov/hrp/hazards/), [risk overview](https://www.nasa.gov/hrp/risks/), and [research overview](https://www.nasa.gov/hrp/ongoing-hrp-research/) define the coverage. Individual risk pages linked from those overviews support the condition summaries and countermeasure context. All URLs, titles, and stable internal source IDs are stored in `nasa_sources.json`. Separate [MedlinePlus](https://medlineplus.gov/lab-tests/pulse-oximetry/) and [FDA](https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters) references support general pulse-oximetry guidance and limitations; they are not NASA flight standards.

[MedlinePlus emergency-recognition guidance](https://medlineplus.gov/ency/article/001927.htm) supports symptom-based escalation prompts. These general emergency signs are separate from NASA's descriptions of long-term spaceflight risks.

The catalog covers all five hazards and groups the 17 entries visible in the risk overview into 13 app topics:

| App topic | NASA risk coverage |
| --- | --- |
| `hypoxia` | Hypoxia |
| `cardiovascular` | Cardiovascular adaptations |
| `fitness` | Reduced cardiorespiratory and musculoskeletal fitness |
| `bone` | Spaceflight-induced bone changes |
| `sans` | Spaceflight associated neuro-ocular syndrome |
| `vestibular` | Altered sensorimotor and vestibular function |
| `sleep` | Inadequate sleep and irregular schedules |
| `behavioral` | Behavioral changes / psychiatric disorders; inadequate teamwork |
| `immune` | Altered immune responses; host-microorganism interactions |
| `nutrition` | Inadequate food and nutrition |
| `eva` | Decompression sickness; spacewalk injury / compromised performance |
| `radiation` | Radiation-induced cancers, with related radiation effects discussed on that page |
| `medical_support` | Inadequate systems operations support; injury from dynamic loads; distance-from-Earth context |

These groups, their order, and hazard mappings are AstroTip's editorial organization, not an official NASA ranking or a claim that these are the entire Human Research Roadmap. NASA's overview explains that risk changes with mission destination. A normal fingertip reading must never suppress prevention topics or imply that unmeasured risks have been excluded.

The current check-in uses destination for broad planning reminders but does not calculate how risk changes with mission duration, phase, exposure history, or individual medical background. Longer-duration concerns are described in the catalog; they are not quantitative predictions.

## Evidence labels

- **Operational countermeasure:** a practice described by NASA as used, such as prescribed exercise or planned lighting and rest. It is not a cure or an individualized prescription.
- **Mission protocol:** a conservative app prompt to use the trained crew's approved procedures or clinical review. The linked NASA source provides its rationale; the wording is not an official NASA procedure.
- **Research:** the separate `research` list records investigation or unresolved questions. A research study is not a proven treatment. In particular, the catalog does not recommend self-prescribing supplements, medicines, cuffs, or pressure changes.

Suggested monitoring fields and sensor limitations describe AstroTip's intended scope. They do not assert validation of the MAX30102 for astronaut diagnosis. SpO2 and pulse cannot assess radiation exposure, bone density, SANS, blood clots, decompression sickness, immunity, or mental health. Unknown or missing measurements are not normal results. Clinical alarm limits are not supplied by these NASA overview pages and must not be attributed to them.

## Schema and maintenance

`schema_version` is 1. `sources` and `hazards` are arrays with unique `id` values. Every condition has `id`, `title`, `hazard_ids`, `why_it_matters`, `priority_rationale`, `monitoring`, `limitations`, `countermeasures`, `research`, and `source_ids`. Each countermeasure includes `text`, `evidence`, and `source_ids`; each research item includes `text` and `source_ids`. All references resolve to the top-level arrays.

Hazard IDs are `radiation`, `isolation`, `distance`, `gravity`, and `environment`. Condition IDs are application contracts and should remain stable when wording changes. Review linked primary sources before updating content, advance `reviewed_on`, and preserve the distinction between deployed practices and investigations. NASA may update or move articles; content requires human review rather than automatic medical recommendation generation.
