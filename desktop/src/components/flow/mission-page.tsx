import { MissionSelector } from "@/components/mission-selector";
import { FlowPage } from "@/components/flow/common";
import { MISSIONS } from "@/lib/missions";
import type { MissionId } from "@/types/backend";

/** Step 2: cinematic mission selection, reusing the NASA media cards. */
export function MissionPage({ mission, onChange, onBack, onNext }: {
  mission: MissionId; onChange: (mission: MissionId) => void; onBack: () => void; onNext: () => void;
}) {
  return (
    <FlowPage wide title="Choose your mission"
      lead="Your mission decides which NASA hazards and health topics AstroLife explains and asks about first. It does not change how your answers or measurements are assessed."
      onBack={onBack} onNext={onNext} nextLabel={`Continue with ${MISSIONS[mission].title}`}
    >
      <MissionSelector value={mission} onChange={onChange} />
    </FlowPage>
  );
}
