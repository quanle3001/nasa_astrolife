import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, ExternalLink, Film, Maximize2, Orbit, PlayCircle } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { BorderBeam } from "@/components/effects/border-beam";
import { FrostBlurred } from "@/components/spaceui/frost-blurred";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { playForeground, releaseForeground, usePreviewVideo } from "@/lib/media-playback";
import { MISSION_IDS, MISSIONS, type MissionMedia } from "@/lib/missions";
import { cn } from "@/lib/utils";
import type { MissionId } from "@/types/backend";

interface MissionSelectorProps {
  value: MissionId;
  onChange: (mission: MissionId) => void;
  compact?: boolean;
}

function mediaKind(media: MissionMedia) {
  if (!media.video) return null;
  return media.video.is_footage ? "Footage" : "Visualization";
}

function MissionCard({ media, selected, onSelect, onPreview, onKeyDown, buttonRef }: {
  media: MissionMedia; selected: boolean; onSelect: () => void; onPreview: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void; buttonRef: (node: HTMLButtonElement | null) => void;
}) {
  const reduced = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [engaged, setEngaged] = useState(false);
  const { failed, playing } = usePreviewVideo(videoRef, engaged && Boolean(media.video), media.video_segment);
  const kind = mediaKind(media);
  const track = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
  };

  return (
    <motion.div
      className="mission-tile group"
      data-selected={selected || undefined}
      style={{ "--accent": media.color } as React.CSSProperties}
      whileHover={reduced ? undefined : { y: -4 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      onPointerEnter={() => setEngaged(true)}
      onPointerLeave={() => setEngaged(false)}
      onFocus={() => setEngaged(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setEngaged(false); }}
    >
      <button
        ref={buttonRef}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-describedby={`mission-${media.mission}-credit`}
        tabIndex={selected ? 0 : -1}
        onClick={onSelect}
        onDoubleClick={onPreview}
        onKeyDown={onKeyDown}
        onPointerMove={track}
        className="mission-card"
      >
        {media.image_url
          ? <img src={media.image_url} alt="" className="mission-card-media" style={{ objectPosition: media.focus }} draggable={false} />
          : <span className="mission-card-media mission-card-fallback" aria-hidden="true"><Orbit className="size-8" /></span>}
        {media.video && !failed && (
          <video
            ref={videoRef}
            className={cn("mission-card-media mission-card-video", playing && "is-playing")}
            src={media.video.src}
            poster={media.image_url ?? undefined}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden="true"
            tabIndex={-1}
            style={{ scale: media.video_zoom }}
          />
        )}
        <span className="mission-card-shade" aria-hidden="true" />
        <FrostBlurred side="bottom" height="46%" tint={0.55} />
        <span className="mission-card-top">
          <span className={cn("mission-card-eyebrow", selected && "is-selected")}>
            {selected ? <><CheckCircle2 className="size-3.5" /> Active mission</> : media.eyebrow}
          </span>
          {kind && <span className="mission-card-kind" title={media.video?.classification}><Film className="size-3" /> {kind}</span>}
        </span>
        <span className="mission-card-body">
          <span className="mission-card-title">{media.title}</span>
          <span className="mission-card-short">{media.short}</span>
          <span id={`mission-${media.mission}-credit`} className="mission-card-credit">{media.credit} · {media.nasa_id}</span>
        </span>
      </button>
      <Button
        type="button" variant="ghost" size="icon" onClick={onPreview}
        className="mission-card-expand"
        aria-label={`Expand ${media.title} NASA media`}
      ><Maximize2 className="size-3.5" /></Button>
      {selected && <BorderBeam duration={9} />}
    </motion.div>
  );
}

function MediaPreview({ media }: { media: MissionMedia }) {
  const [showClip, setShowClip] = useState(false);
  const video = media.video;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.45fr_.8fr]">
      <div className="relative min-h-80 overflow-hidden rounded-2xl border border-space-border bg-space-black">
        {showClip && video ? (
          <video
            className="absolute inset-0 size-full object-cover"
            src={video.src}
            poster={media.image_url ?? undefined}
            controls
            muted
            playsInline
            onPlay={(event) => playForeground(event.currentTarget)}
            onPause={(event) => releaseForeground(event.currentTarget)}
            aria-label={`${video.title} (${video.classification})`}
          />
        ) : media.image_url ? (
          <img src={media.image_url} alt={media.asset_title} className="absolute inset-0 size-full object-cover" style={{ objectPosition: media.focus }} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-space-subtle"><Orbit className="size-10" /></div>
        )}
        <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[10px] font-semibold tracking-widest text-white/85 backdrop-blur">
          {(showClip && video ? video.classification : media.classification).toUpperCase()}
        </div>
      </div>
      <div className="flex flex-col py-3">
        <p className="telemetry-label">NASA mission media</p>
        <DialogTitle className="mt-3 text-3xl font-semibold text-space-white">{media.title}</DialogTitle>
        <DialogDescription className="mt-4 text-sm leading-7 text-space-silver">{media.description}</DialogDescription>
        <dl className="mt-6 space-y-3 border-y border-white/10 py-5 text-xs">
          <div className="flex justify-between gap-5"><dt className="text-space-subtle">NASA asset</dt><dd className="font-mono text-space-white">{media.nasa_id}</dd></div>
          <div className="flex justify-between gap-5"><dt className="text-space-subtle">Credit</dt><dd className="text-space-white">{media.credit}</dd></div>
          <div className="flex justify-between gap-5"><dt className="text-space-subtle">Captured</dt><dd className="text-space-white">{media.date_created.slice(0, 10)}</dd></div>
          {video && (
            <div className="flex justify-between gap-5"><dt className="text-space-subtle">Preview clip</dt><dd className="text-right text-space-white">{video.credit} · {video.classification}</dd></div>
          )}
        </dl>
        {video && (
          <Button className="mt-4" onClick={() => setShowClip((value) => !value)}>
            <PlayCircle className="size-4" /> {showClip ? "Show still image" : video.is_footage ? "Show NASA footage" : "Show NASA visualization"}
          </Button>
        )}
        <p className="mt-5 text-xs leading-5 text-space-subtle">Decorative mission context. NASA does not endorse AstroTip.</p>
        <Button variant="primary" className="mt-auto" onClick={() => window.astrotip?.openNasaSource(showClip && video ? video.source_url : media.source_url)}>
          Open NASA source <ExternalLink className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function MissionSelector({ value, onChange, compact = false }: MissionSelectorProps) {
  const [preview, setPreview] = useState<MissionMedia | null>(null);
  const buttons = useRef<Partial<Record<MissionId, HTMLButtonElement | null>>>({});

  // WAI-ARIA radio group: arrow keys move selection and focus together.
  const onKeyDown = (mission: MissionId) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = MISSION_IDS[(MISSION_IDS.indexOf(mission) + step + MISSION_IDS.length) % MISSION_IDS.length];
    onChange(next);
    buttons.current[next]?.focus();
  };

  return (
    <section aria-labelledby="mission-context-title">
      {!compact && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <p className="telemetry-label">Mission environment</p>
            <h2 id="mission-context-title" className="mt-1 text-lg font-semibold text-space-white">Choose operational context</h2>
          </div>
          <p className="pb-0.5 text-[11px] text-space-subtle">Decorative theme only · Health rules remain unchanged</p>
        </div>
      )}
      <div role="radiogroup" aria-label="Mission context" className="grid gap-3 md:grid-cols-3">
        {MISSION_IDS.map((mission) => (
          <MissionCard
            key={mission}
            media={MISSIONS[mission]}
            selected={value === mission}
            onSelect={() => onChange(mission)}
            onPreview={() => setPreview(MISSIONS[mission])}
            onKeyDown={onKeyDown(mission)}
            buttonRef={(node) => { buttons.current[mission] = node; }}
          />
        ))}
      </div>
      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        {preview && <DialogContent><MediaPreview key={preview.mission} media={preview} /></DialogContent>}
      </Dialog>
    </section>
  );
}
