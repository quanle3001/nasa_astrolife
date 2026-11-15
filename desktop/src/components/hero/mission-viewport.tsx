import { AnimatePresence, motion } from "motion/react";
import { useCalmMotion } from "@/lib/motion-preference";
import { Activity, HeartPulse, Sparkles, Waves } from "lucide-react";
import { ProximityGrid } from "@/components/spaceui/proximity-grid";
import { MISSIONS } from "@/lib/missions";
import { formatAge, formatClock, isStale, useNow } from "@/lib/freshness";
import { cn } from "@/lib/utils";
import type { MissionId } from "@/types/backend";

export interface ViewportTelemetry {
  connected: boolean;
  connecting: boolean;
  heartRate: number | null;
  spo2: number | null;
  lastUpdate?: number | null;
  lastUsableAt?: number | null;
}

/**
 * The original telemetry hero's floating motion (gentle 4.8s bob and tilt,
 * staggered per card). Transform-only, so it never shifts layout; disabled
 * under reduced motion.
 */
function floatAnimation(reduced: boolean | null, delay: number, amount = 9) {
  return reduced ? undefined : {
    y: [0, -amount, 0], rotate: [0, 1.5, 0],
    transition: { duration: 4.8, delay, repeat: Infinity, ease: "easeInOut" as const },
  };
}

function TelemetryCard({ className, icon, label, value, unit, float, stale = false }: {
  className: string; icon: React.ReactNode; label: string; value: number | null; unit: string;
  float: ReturnType<typeof floatAnimation>; stale?: boolean;
}) {
  return (
    <motion.div className={cn("viewport-card", stale && "is-stale", className)} animate={float} title={stale ? "This value is older than 10 seconds" : undefined}>
      <span className="viewport-card-icon">{icon}</span>
      <span>
        <small>{label}</small>
        {value == null
          ? <strong className="is-empty">No reading</strong>
          : <strong>{value} <em>{unit}</em></strong>}
      </span>
    </motion.div>
  );
}

/**
 * Hero visual: the selected mission's cached NASA photograph inside a framed
 * viewport, with compositor-only orbital tracks and live sensor values.
 * Values come straight from the sensor state; nothing is simulated.
 */
export function MissionViewport({ mission, telemetry }: { mission: MissionId; telemetry: ViewportTelemetry }) {
  const reduced = useCalmMotion();
  const media = MISSIONS[mission];
  const now = useNow(telemetry.connected);
  const valuesStale = telemetry.connected && isStale(telemetry.lastUsableAt, now);
  const linkStale = telemetry.connected && isStale(telemetry.lastUpdate, now);
  const linkDetail = telemetry.connecting ? "Opening serial port"
    : !telemetry.connected ? "Not connected"
    : telemetry.lastUpdate == null ? "Waiting for data"
    : linkStale ? `No new data · ${formatAge(telemetry.lastUpdate, now)}`
    : `Updated ${formatClock(telemetry.lastUpdate)}`;
  return (
    <ProximityGrid className="mission-viewport" data-mission={mission} style={{ "--accent": media.color } as React.CSSProperties}>
      <div className="viewport-orbit viewport-orbit-a" aria-hidden="true"><span className="viewport-orbit-spin"><i /></span></div>
      <div className="viewport-orbit viewport-orbit-b" aria-hidden="true"><span className="viewport-orbit-spin"><i /></span></div>

      <figure className="viewport-frame">
        <AnimatePresence initial={false}>
          {media.image_url && (
            <motion.div
              key={mission}
              className="viewport-media"
              initial={reduced ? false : { opacity: 0, scale: 1.06, filter: "blur(6px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
              <img src={media.image_url} alt={`${media.title}: ${media.description}`} className="viewport-image" style={{ objectPosition: media.focus }} draggable={false} />
            </motion.div>
          )}
        </AnimatePresence>
        <span className="viewport-scan" aria-hidden="true" />
        <span className="hud-brackets" aria-hidden="true"><i /><i /><i /><i /></span>
        <div className="viewport-hud" aria-hidden="true">
          <span><b className="viewport-hud-dot" /> Mission view <span className="viewport-hud-id">{media.nasa_id}</span></span>
        </div>
        <span className="viewport-scrim" aria-hidden="true" />
        <figcaption className="viewport-caption">
          <strong>{media.title}</strong>
          <small>{media.classification} · {media.credit}</small>
        </figcaption>
      </figure>

      <TelemetryCard className="viewport-card-heart" icon={<HeartPulse className="size-4" />} label="Heart rate" value={telemetry.heartRate} unit="bpm" stale={valuesStale} float={floatAnimation(reduced, 0)} />
      <TelemetryCard className="viewport-card-oxygen" icon={<Waves className="size-4" />} label="Estimated SpO₂" value={telemetry.spo2} unit="%" stale={valuesStale} float={floatAnimation(reduced, .8, 7)} />
      <span className="viewport-satellite viewport-satellite-one" aria-hidden="true"><Activity className="size-4" /></span>
      <span className="viewport-satellite viewport-satellite-two" aria-hidden="true"><Sparkles className="size-3.5" /></span>
      <motion.div className="viewport-card viewport-card-link" animate={floatAnimation(reduced, 1.4, 6)}>
        <span className={cn("live-pulse", telemetry.connected && !linkStale && "is-live", (telemetry.connecting || linkStale) && "is-connecting")} />
        <span>
          <small>Sensor link</small>
          <strong className="viewport-link-state" role="status">{telemetry.connected ? (linkStale ? "Stalled" : "Online") : telemetry.connecting ? "Linking" : "Standby"}</strong>
          <span className={cn("viewport-link-detail", linkStale && "is-warning")}>{linkDetail}</span>
        </span>
      </motion.div>
    </ProximityGrid>
  );
}
