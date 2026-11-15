import { motion } from "motion/react";
import { PlayCircle, RotateCcw, Rocket } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useCalmMotion } from "@/lib/motion-preference";

/**
 * First screen of the guided journey. `visual` is the decorative scene (the
 * NASA astronaut model when 3D is available); it never carries information.
 */
export function WelcomePage({ onBegin, onResume, resumeLabel, visual }: {
  onBegin: () => void; onResume?: () => void; resumeLabel?: string; visual?: ReactNode;
}) {
  const reduced = useCalmMotion();
  return (
    <div className="welcome-page">
      <motion.div className="welcome-copy" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        <div className="welcome-pill"><Rocket className="size-3.5" /> NASA Space Apps 2026 · Astronaut health self-assessment</div>
        <h1 className="welcome-title">ASTROLIFE</h1>
        <p className="welcome-tagline"><span>Your Mission.</span> <span>Your Health.</span> <span className="gradient-text">Your Next Step.</span></p>
        <p className="welcome-lead">Choose your mission, see the NASA hazards that matter most for it, answer a short adaptive check-in, measure your pulse and oxygen, and leave with clear next steps.</p>
        <div className="hero-actions">
          <Button variant="primary" size="lg" onClick={onBegin}><PlayCircle className="size-4" /> Begin Mission Assessment</Button>
          {onResume && <Button size="lg" onClick={onResume}><RotateCcw className="size-4" /> {resumeLabel ?? "Resume Previous Mission"}</Button>}
        </div>
        <p className="welcome-note">Everything stays on this computer. AstroLife is an educational prototype, not a diagnosis or a certified medical device.</p>
      </motion.div>
      <div className="welcome-visual" aria-hidden="true">{visual}</div>
    </div>
  );
}
