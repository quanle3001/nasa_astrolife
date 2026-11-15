import type { MissionId } from "@/types/backend";
import leoImage from "../../../software/assets/nasa/images/leo.jpg";
import lunarImage from "../../../software/assets/nasa/images/lunar.jpg";
import marsImage from "../../../software/assets/nasa/images/mars.jpg";

export interface MissionMedia {
  mission: MissionId;
  nasa_id: string;
  title: string;
  classification: string;
  credit: string;
  date_created: string;
  description: string;
  local_path: string;
  image_url: string;
  source_url: string;
  eyebrow: string;
  short: string;
  color: string;
  /** CSS object-position that keeps the subject in frame when cropped. */
  focus: string;
}

export const MISSIONS: Record<MissionId, MissionMedia> = {
  leo: {
    mission: "leo", nasa_id: "iss058e005282", title: "Low Earth Orbit",
    classification: "Photograph", credit: "NASA / JSC", date_created: "2019-01-18T00:00:00Z",
    description: "The International Space Station's solar arrays frame Earth's illuminated limb and aurora from orbit.",
    local_path: "images/leo.jpg", image_url: leoImage, source_url: "https://images.nasa.gov/details/iss058e005282",
    eyebrow: "ORBITAL OPERATIONS", short: "Earth limb · ISS context", color: "#48d5e9", focus: "50% 62%",
  },
  lunar: {
    mission: "lunar", nasa_id: "as17-134-20473", title: "Lunar Mission",
    classification: "Photograph · historical Apollo reference", credit: "NASA / JSC", date_created: "1972-12-13T00:00:00Z",
    description: "Earth appears above the Apollo 17 lunar roving vehicle during surface operations at Taurus-Littrow.",
    local_path: "images/lunar.jpg", image_url: lunarImage, source_url: "https://images.nasa.gov/details/as17-134-20473",
    eyebrow: "SURFACE OPERATIONS", short: "Apollo surface reference", color: "#b9d8f2", focus: "38% 42%",
  },
  mars: {
    mission: "mars", nasa_id: "PIA24264", title: "Mars / Deep Space",
    classification: "Rover panorama mosaic", credit: "NASA / JPL", date_created: "2021-02-24T00:00:00Z",
    description: "Perseverance's first Mastcam-Z 360-degree panorama, assembled from 142 images captured in Jezero Crater.",
    local_path: "images/mars.jpg", image_url: marsImage, source_url: "https://images.nasa.gov/details/PIA24264",
    eyebrow: "EXPEDITION OPERATIONS", short: "Jezero Crater · Perseverance", color: "#e5a16c", focus: "62% 55%",
  },
};
