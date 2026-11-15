/**
 * Body regions of the Health Compass and the NASA catalog conditions shown
 * for each. The grouping is AstroLife's editorial choice for navigation; it
 * is not an anatomical or clinical claim. A highlighted region means "you
 * have a prompt to review here", never "this structure is diseased".
 */
export interface CompassRegion {
  id: string;
  title: string;
  /** Short description of what is shown for this region. */
  about: string;
  conditionIds: string[];
  /** Which recorded measurement belongs to this region, if any. */
  measurement?: "heart_rate" | "spo2";
}

export const COMPASS_REGIONS: CompassRegion[] = [
  { id: "brain", title: "Brain and behavior", about: "Sleep, fatigue, mood and teamwork.", conditionIds: ["sleep", "behavioral"] },
  { id: "eyes", title: "Eyes", about: "Vision changes and spaceflight-associated neuro-ocular syndrome.", conditionIds: ["sans"] },
  { id: "inner_ear", title: "Inner ear and balance", about: "Dizziness, motion sickness and sensorimotor adaptation.", conditionIds: ["vestibular"] },
  { id: "heart", title: "Heart and circulation", about: "Cardiovascular adaptation; your recorded pulse appears here.", conditionIds: ["cardiovascular"], measurement: "heart_rate" },
  { id: "lungs", title: "Lungs and oxygen", about: "Oxygenation; your recorded SpO₂ estimate appears here.", conditionIds: ["hypoxia"], measurement: "spo2" },
  { id: "digestive", title: "Nutrition", about: "Food and fluid intake.", conditionIds: ["nutrition"] },
  { id: "immune", title: "Immune system", about: "Infection concerns and immune changes.", conditionIds: ["immune"] },
  { id: "muscles", title: "Muscles and fitness", about: "Strength, exercise and aerobic capacity.", conditionIds: ["fitness"] },
  { id: "skeleton", title: "Bones", about: "Bone changes and fracture risk.", conditionIds: ["bone"] },
  { id: "whole_body", title: "Whole body and mission", about: "Radiation, EVA and medical readiness affect the whole body.", conditionIds: ["radiation", "eva", "medical_support"] },
];

export const regionForCondition = (conditionId: string) => COMPASS_REGIONS.find((region) => region.conditionIds.includes(conditionId));

/** The fields of an anatomy-catalog structure that decide its compass region. */
export interface StructureLike { key: string; system: string; category: string }

/**
 * Compass region for a structure of the 3D anatomy catalog, or null when
 * AstroLife has no health topic for it (for example the kidneys). The mapping
 * only groups structures for navigation; it says nothing about their state.
 */
export function regionForStructure(structure: StructureLike): CompassRegion | null {
  const id =
    ["brain", "brainstem", "cerebellum"].includes(structure.key) ? "brain"
      : structure.key.startsWith("eye_") ? "eyes"
        : structure.category === "Cardiovascular" ? "heart"
          : structure.category === "Respiratory" ? "lungs"
            : structure.category === "Digestive" ? "digestive"
              : structure.category === "Immune / Lymphatic" ? "immune"
                : structure.system === "skin" ? "whole_body"
                  : structure.category === "Musculoskeletal" && structure.system === "muscles" ? "muscles"
                    : structure.category === "Musculoskeletal" && (structure.system === "skeleton" || structure.system === "joints") ? "skeleton"
                      : null;
  return COMPASS_REGIONS.find((region) => region.id === id) ?? null;
}
