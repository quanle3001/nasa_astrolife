import { motion, useReducedMotion } from "motion/react";
import { ExternalLink, Maximize2, Orbit } from "lucide-react";
import { useState } from "react";
import { BorderBeam } from "@/components/effects/border-beam";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { MISSIONS, type MissionMedia } from "@/lib/missions";
import { cn } from "@/lib/utils";
import type { MissionId } from "@/types/backend";

interface MissionSelectorProps {
  value: MissionId;
  onChange: (mission: MissionId) => void;
  compact?: boolean;
}

function MissionCard({ media, selected, onSelect, onPreview }: {
  media: MissionMedia; selected: boolean; onSelect: () => void; onPreview: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="group relative min-w-0 overflow-hidden rounded-2xl"
      whileHover={reduced ? undefined : { y: -6, scale: 1.015 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        onDoubleClick={onPreview}
        className={cn(
          "mission-card relative block h-52 w-full overflow-hidden rounded-2xl border text-left outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300",
          selected ? "border-cyan-300/80 shadow-[0_18px_50px_rgba(32,170,205,.2)]" : "border-white/12 hover:border-white/30",
        )}
      >
        <img src={media.image_url} alt="" className="absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-105" draggable={false} />
        <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,8,18,.22),rgba(4,8,18,.38)_42%,rgba(4,8,18,.96))]" />
        <span className="absolute inset-x-4 top-4 flex items-center justify-between text-[10px] font-bold tracking-[.16em] text-white/75">
          <span>{selected ? "● ACTIVE MISSION" : media.eyebrow}</span>
          <Orbit className="size-4 opacity-70 transition group-hover:rotate-90" />
        </span>
        <span className="absolute inset-x-4 bottom-4">
          <span className="block text-lg font-semibold text-white">{media.title}</span>
          <span className="mt-1 block text-xs text-slate-300">{media.short}</span>
        </span>
      </button>
      <Button
        type="button" variant="ghost" size="icon" onClick={onPreview}
        className="absolute bottom-3 right-3 z-10 size-8 translate-y-1 border border-white/10 bg-black/30 opacity-0 backdrop-blur transition group-hover:translate-y-0 group-hover:opacity-100 focus:opacity-100"
        aria-label={`Expand ${media.title} NASA media`}
      ><Maximize2 className="size-3.5" /></Button>
      {selected && <BorderBeam duration={8} />}
    </motion.div>
  );
}

export function MissionSelector({ value, onChange, compact = false }: MissionSelectorProps) {
  const [preview, setPreview] = useState<MissionMedia | null>(null);
  return (
    <section aria-labelledby="mission-context-title">
      {!compact && (
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="telemetry-label">Mission environment</p>
            <h2 id="mission-context-title" className="mt-1 text-lg font-semibold text-white">Choose operational context</h2>
          </div>
          <p className="hidden text-right text-[11px] text-slate-500 xl:block">Decorative theme only · Health rules remain unchanged</p>
        </div>
      )}
      <div role="radiogroup" aria-label="Mission context" className="grid gap-3 md:grid-cols-3">
        {(Object.keys(MISSIONS) as MissionId[]).map((mission) => (
          <MissionCard key={mission} media={MISSIONS[mission]} selected={value === mission} onSelect={() => onChange(mission)} onPreview={() => setPreview(MISSIONS[mission])} />
        ))}
      </div>
      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        {preview && (
          <DialogContent>
            <div className="grid gap-6 lg:grid-cols-[1.45fr_.8fr]">
              <div className="relative min-h-80 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <img src={preview.image_url} alt={preview.title} className="absolute inset-0 size-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#040814]/75 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[10px] font-semibold tracking-widest text-white/80 backdrop-blur">{preview.classification.toUpperCase()}</div>
              </div>
              <div className="flex flex-col py-3">
                <p className="telemetry-label">NASA mission media</p>
                <DialogTitle className="mt-3 text-3xl font-semibold text-white">{preview.title}</DialogTitle>
                <DialogDescription className="mt-4 text-sm leading-7 text-slate-300">{preview.description}</DialogDescription>
                <dl className="mt-6 space-y-3 border-y border-white/10 py-5 text-xs">
                  <div className="flex justify-between gap-5"><dt className="text-slate-500">NASA asset</dt><dd className="font-mono text-slate-200">{preview.nasa_id}</dd></div>
                  <div className="flex justify-between gap-5"><dt className="text-slate-500">Credit</dt><dd className="text-slate-200">{preview.credit}</dd></div>
                  <div className="flex justify-between gap-5"><dt className="text-slate-500">Captured</dt><dd className="text-slate-200">{preview.date_created.slice(0, 10)}</dd></div>
                </dl>
                <p className="mt-5 text-xs leading-5 text-slate-500">Decorative mission context. NASA does not endorse AstroTip.</p>
                <Button variant="primary" className="mt-auto" onClick={() => window.astrotip?.openNasaSource(preview.source_url)}>
                  Open NASA source <ExternalLink className="size-4" />
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}
