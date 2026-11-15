import { ANATOMY_BY_KEY, ANATOMY_STRUCTURES, ATTRIBUTION } from "open-anatomy-3d";
import { describe, expect, it } from "vitest";
import catalog from "../../../../software/resources/nasa_sources.json";
import { COMPASS_REGIONS, regionForCondition, regionForStructure } from "@/components/compass/regions";

const region = (key: string) => regionForStructure(ANATOMY_BY_KEY[key])?.id ?? null;

describe("Health Compass regions", () => {
  it("places every NASA catalog condition in exactly one region", () => {
    const conditionIds = (catalog as { conditions: { id: string }[] }).conditions.map((condition) => condition.id);
    const mapped = COMPASS_REGIONS.flatMap((item) => item.conditionIds);
    expect([...mapped].sort()).toEqual([...conditionIds].sort());
    expect(new Set(mapped).size).toBe(mapped.length);
    for (const id of conditionIds) expect(regionForCondition(id)).toBeDefined();
  });

  it("maps anatomical structures of the 3D models to the right health region", () => {
    expect(region("heart")).toBe("heart");
    expect(region("aorta")).toBe("heart");
    expect(region("lung_l")).toBe("lungs");
    expect(region("diaphragm")).toBe("lungs");
    expect(region("brain")).toBe("brain");
    expect(region("eye_r")).toBe("eyes");
    expect(region("stomach")).toBe("digestive");
    expect(region("spleen")).toBe("immune");
    expect(region("quadriceps_l")).toBe("muscles");
    expect(region("femur_l")).toBe("skeleton");
    expect(region("knee_l")).toBe("skeleton");
    expect(region("skin")).toBe("whole_body");
  });

  it("links no health topic to structures AstroLife has no evidence for", () => {
    for (const key of ["kidney_l", "bladder", "pancreas", "prostate", "uterus", "tongue", "spinal_cord"]) expect(region(key), key).toBeNull();
  });

  it("reaches every region except the inner ear through at least one structure", () => {
    const reachable = new Set(ANATOMY_STRUCTURES.map((structure) => regionForStructure(structure)?.id).filter(Boolean));
    expect(COMPASS_REGIONS.map((item) => item.id).filter((id) => !reachable.has(id))).toEqual(["inner_ear"]);
  });

  it("carries the credit line the model licence requires", () => {
    expect(ATTRIBUTION).toContain("BodyParts3D");
    expect(ATTRIBUTION).toContain("CC BY 4.0");
  });
});
