import { motion } from "motion/react";
import { PlayCircle, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useCalmMotion } from "@/lib/motion-preference";

/**
 * First screen of the guided journey. `visual` is the decorative scene (the
 * NASA astronaut model when 3D is available); it never carries information.
 */
export function WelcomePage({ onBegin, onResume, onDashboard, resumeLabel, visual, credit }: {
  onBegin: () => void; onResume?: () => void; resumeLabel?: string; visual?: ReactNode;
  /** Set once a mission and a check-in exist: the intro then leads to the dashboard. */
  onDashboard?: () => void;
  /** Credit line for the decorative scene behind the page. */
  credit?: string;
}) {
  const reduced = useCalmMotion();
  return (
    <div className="welcome-page">
      <motion.div className="welcome-copy" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        <h1 className="welcome-title">ASTROLIFE</h1>
        <p className="welcome-tagline"><span>Your Mission.</span> <span>Your Health.</span> <strong>Your Next Step.</strong></p>
        <p className="welcome-lead">Choose your mission, see the NASA hazards that matter most for it, answer a short adaptive check-in, measure your pulse and oxygen, and leave with clear next steps.</p>
        <div className="hero-actions">
          {onDashboard
            ? <Button variant="primary" size="lg" onClick={onDashboard}><PlayCircle className="size-4" /> Open Mission Dashboard</Button>
            : <Button variant="primary" size="lg" onClick={onBegin}><PlayCircle className="size-4" /> Begin Mission Assessment</Button>}
          {onResume && <Button size="lg" onClick={onResume}><RotateCcw className="size-4" /> {resumeLabel ?? "Resume Previous Mission"}</Button>}
        </div>
        <p className="welcome-note">Built for the NASA Space Apps Challenge 2026. Everything stays on this computer. AstroLife is an educational prototype, not a diagnosis or a certified medical device.</p>
        {credit && <p className="welcome-note welcome-credit">{credit}</p>}
      </motion.div>
      <div className="welcome-visual" aria-hidden="true">{visual}</div>
    </div>
  );
}
