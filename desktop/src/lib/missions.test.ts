import { describe, expect, it } from "vitest";
import manifest from "../../../software/assets/nasa/media_manifest.json";
import { MISSION_IDS, MISSIONS } from "@/lib/missions";

describe("mission media", () => {
  it("keeps the three mission identifiers in order", () => {
    expect(MISSION_IDS).toEqual(["leo", "lunar", "mars"]);
  });

  it("derives NASA provenance from the offline manifest and resolves every still", () => {
    for (const id of MISSION_IDS) {
      const media = MISSIONS[id];
      const asset = manifest.assets.find((item) => item.mission === id)!;
      expect(media.nasa_id).toBe(asset.nasa_id);
      expect(media.source_url).toBe(asset.source_url);
      expect(media.source_url.startsWith("https://images.nasa.gov/details/")).toBe(true);
      expect(media.credit.startsWith("NASA")).toBe(true);
      expect(media.image_url).toBeTruthy();
    }
  });

  it("labels preview clips honestly as footage or visualization", () => {
    expect(MISSIONS.leo.video).toBeNull();
    expect(MISSIONS.lunar.video?.is_footage).toBe(false);
    expect(MISSIONS.lunar.video?.classification).toMatch(/visualization/i);
    expect(MISSIONS.mars.video?.is_footage).toBe(true);
    for (const id of ["lunar", "mars"] as const) {
      expect(MISSIONS[id].video?.src).toBeTruthy();
      expect(MISSIONS[id].video?.source_url.startsWith("https://images.nasa.gov/details/")).toBe(true);
    }
  });
});
