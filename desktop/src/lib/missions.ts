import type { MissionId } from "@/types/backend";
import manifest from "../../../software/assets/nasa/media_manifest.json";

/**
 * Mission media is derived from the offline NASA manifest
 * (software/assets/nasa/media_manifest.json), which is written by
 * software/scripts/fetch_nasa_media.py. Only presentation fields (title,
 * short label, accent color, crop focus, card summary) live here, so NASA IDs,
 * credits and source links have a single source of truth.
 *
 * Media files are resolved at build time. A manifest entry whose local file is
 * missing resolves to `null`, and the UI falls back to the still image (or a
 * plain panel) instead of rendering a broken element.
 */
const MEDIA_FILES = import.meta.glob("../../../software/assets/nasa/{images,videos}/*.{jpg,jpeg,png,mp4}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export function resolveNasaMedia(localPath: string | undefined | null): string | null {
  if (!localPath) return null;
  return MEDIA_FILES[`../../../software/assets/nasa/${localPath}`] ?? null;
}

interface ManifestVideo {
  nasa_id: string;
  title: string;
  classification: string;
  credit: string;
  date_created: string;
  local_path: string;
  source_url: string;
}

interface ManifestAsset {
  mission: string;
  nasa_id: string;
  title: string;
  classification: string;
  credit: string;
  date_created: string;
  local_path: string;
  source_url: string;
  video?: ManifestVideo;
}

export interface MissionVideo {
  nasa_id: string;
  title: string;
  classification: string;
  /** True only for real camera footage; visualizations and animations are false. */
  is_footage: boolean;
  credit: string;
  date_created: string;
  src: string;
  source_url: string;
}

export interface MissionMedia {
  mission: MissionId;
  nasa_id: string;
  title: string;
  asset_title: string;
  classification: string;
  credit: string;
  date_created: string;
  description: string;
  local_path: string;
  image_url: string | null;
  source_url: string;
  video: MissionVideo | null;
  short: string;
  color: string;
  /** CSS object-position that keeps the subject in frame when cropped. */
  focus: string;
  /** Extra zoom for the preview clip, used to crop letterbox bars burned into a NASA rendition. */
  video_zoom: number;
  /** Optional [start, end] seconds to loop, skipping intro/outro frames that do not suit a card. */
  video_segment: [number, number] | null;
}

const PRESENTATION: Record<MissionId, Pick<MissionMedia, "title" | "description" | "short" | "color" | "focus" | "video_zoom" | "video_segment">> = {
  leo: {
    title: "Low Earth Orbit",
    description: "The International Space Station's solar arrays frame Earth's illuminated limb and aurora from orbit.",
    short: "Earth limb · ISS context", color: "#48d5e9", focus: "50% 62%", video_zoom: 1, video_segment: null,
  },
  lunar: {
    title: "Lunar Mission",
    description: "Earth appears above the Apollo 17 lunar roving vehicle during surface operations at Taurus-Littrow.",
    short: "Apollo surface reference", color: "#b9d8f2", focus: "38% 42%", video_zoom: 1, video_segment: null,
  },
  mars: {
    title: "Mars / Deep Space",
    description: "Perseverance's first Mastcam-Z 360-degree panorama, assembled from 142 images captured in Jezero Crater.",
    short: "Jezero Crater · Perseverance", color: "#e5a16c", focus: "62% 55%",
    // The Perseverance clip opens and closes on the full mosaic with large black edges.
    video_zoom: 1.1, video_segment: [6, 24],
  },
};

const credit = (center: string) => (center.startsWith("NASA") ? center : `NASA / ${center}`);

function toVideo(video: ManifestVideo | undefined): MissionVideo | null {
  const src = resolveNasaMedia(video?.local_path);
  if (!video || !src) return null;
  return {
    nasa_id: video.nasa_id,
    title: video.title,
    classification: video.classification,
    is_footage: !/visuali[sz]ation|animation|concept|illustration|render/i.test(video.classification),
    credit: credit(video.credit),
    date_created: video.date_created,
    src,
    source_url: video.source_url,
  };
}

function build(): Record<MissionId, MissionMedia> {
  const assets = (manifest as { assets: ManifestAsset[] }).assets;
  const result = {} as Record<MissionId, MissionMedia>;
  for (const mission of Object.keys(PRESENTATION) as MissionId[]) {
    const asset = assets.find((item) => item.mission === mission);
    if (!asset) throw new Error(`NASA media manifest has no entry for mission "${mission}"`);
    result[mission] = {
      ...PRESENTATION[mission],
      mission,
      nasa_id: asset.nasa_id,
      asset_title: asset.title,
      classification: asset.classification,
      credit: credit(asset.credit),
      date_created: asset.date_created,
      local_path: asset.local_path,
      image_url: resolveNasaMedia(asset.local_path),
      source_url: asset.source_url,
      video: toVideo(asset.video),
    };
  }
  return result;
}

export const MISSIONS: Record<MissionId, MissionMedia> = build();
export const MISSION_IDS = Object.keys(MISSIONS) as MissionId[];
