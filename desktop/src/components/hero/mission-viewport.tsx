import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HeartPulse, Waves } from "lucide-react";
import { FrostBlurred } from "@/components/spaceui/frost-blurred";
import { ProximityGrid } from "@/components/spaceui/proximity-grid";
import { MISSIONS } from "@/lib/missions";
import { cn } from "@/lib/utils";
import type { MissionId } from "@/types/backend";

export interface ViewportTelemetry {
  connected: boolean;
  connecting: boolean;
  heartRate: number | null;
  spo2: number | null;
}

function TelemetryCard({ className, icon, label, value, unit }: { className: string; icon: React.ReactNode; label: string; value: number | null; unit: string }) {
  return (
    <div className={cn("viewport-card", className)}>
      <span className="viewport-card-icon">{icon}</span>
      <span>
        <small>{label}</small>
        <strong>{value ?? "—"} <em>{unit}</em></strong>
      </span>
    </div>
  );
}

/**
 * Hero visual: the selected mission's cached NASA photograph inside a framed
 * viewport, with compositor-only orbital tracks and live sensor values.
 * Values come straight from the sensor state; nothing is simulated.
 */
export function MissionViewport({ mission, telemetry }: { mission: MissionId; telemetry: ViewportTelemetry }) {
  const reduced = useReducedMotion();
  const media = MISSIONS[mission];
  return (
    <ProximityGrid className="mission-viewport" data-mission={mission}>
      <div className="viewport-orbit viewport-orbit-a" aria-hidden="true"><span className="viewport-orbit-spin"><i /></span></div>
      <div className="viewport-orbit viewport-orbit-b" aria-hidden="true"><span className="viewport-orbit-spin"><i /></span></div>

      <figure className="viewport-frame">
        <AnimatePresence initial={false}>
          <motion.img
            key={mission}
            src={media.image_url}
            alt={`${media.title}: ${media.description}`}
            className="viewport-image"
            style={{ objectPosition: media.focus }}
            initial={reduced ? false : { opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
            draggable={false}
          />
        </AnimatePresence>
        <FrostBlurred side="bottom" height="38%" tint={0.6} />
        <figcaption className="viewport-caption">
          <span className="telemetry-label">{media.eyebrow}</span>
          <strong>{media.title}</strong>
          <small>NASA · {media.nasa_id} · {media.classification}</small>
        </figcaption>
      </figure>

      <TelemetryCard className="viewport-card-heart" icon={<HeartPulse className="size-4" />} label="Heart rate" value={telemetry.heartRate} unit="bpm" />
      <TelemetryCard className="viewport-card-oxygen" icon={<Waves className="size-4" />} label="Estimated SpO₂" value={telemetry.spo2} unit="%" />
      <div className="viewport-card viewport-card-link">
        <span className={cn("live-pulse", telemetry.connected && "is-live", telemetry.connecting && "is-connecting")} />
        <span><small>Sensor link</small><strong className="viewport-link-state">{telemetry.connected ? "Online" : telemetry.connecting ? "Linking" : "Standby"}</strong></span>
      </div>
    </ProximityGrid>
  );
}
