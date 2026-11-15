import { cn } from "@/lib/utils";
import { COMPASS_REGIONS } from "@/components/compass/regions";

/** Hit areas of the schematic figure, in the SVG's 200 x 420 coordinate space. */
const SHAPES: Record<string, { kind: "circle"; cx: number; cy: number; r: number } | { kind: "path"; d: string }> = {
  brain: { kind: "path", d: "M78 30 a22 20 0 0 1 44 0 v6 h-44 z" },
  eyes: { kind: "path", d: "M82 40 h36 v10 h-36 z" },
  inner_ear: { kind: "circle", cx: 126, cy: 48, r: 7 },
  heart: { kind: "path", d: "M100 124 c-10 -14 -28 -2 -14 14 l14 14 l14 -14 c14 -16 -4 -28 -14 -14 z" },
  lungs: { kind: "path", d: "M72 98 q-10 22 -4 50 q10 6 20 -2 v-44 q-8 -8 -16 -4 z M128 98 q10 22 4 50 q-10 6 -20 -2 v-44 q8 -8 16 -4 z" },
  digestive: { kind: "path", d: "M82 162 h36 q8 18 0 36 h-36 q-8 -18 0 -36 z" },
  immune: { kind: "path", d: "M92 76 h16 v14 h-16 z" },
  muscles: { kind: "path", d: "M46 96 q-12 34 -8 78 h16 q-2 -42 8 -74 z M154 96 q12 34 8 78 h-16 q2 -42 -8 -74 z" },
  skeleton: { kind: "path", d: "M78 214 h18 l-2 150 h-18 z M122 214 h-18 l2 150 h18 z" },
};

/**
 * Schematic 2D body map. It is the Health Compass on hardware without usable
 * 3D and the always-available fallback. Regions are real buttons, so the map
 * works with a keyboard and a screen reader.
 */
export function BodyMap2D({ selected, highlighted, onSelect }: {
  selected: string; highlighted: Set<string>; onSelect: (regionId: string) => void;
}) {
  return (
    <div className="body-map">
      <svg viewBox="0 0 200 420" role="group" aria-label="Body map. Select a region to see what was recorded and the related NASA research.">
        <g className="body-outline" aria-hidden="true">
          <circle cx="100" cy="40" r="26" />
          <path d="M88 66 h24 v12 q34 4 44 22 q14 40 10 82 h-18 q0 -34 -8 -58 v82 q6 80 0 164 h-22 l-8 -150 h-20 l-8 150 h-22 q-6 -84 0 -164 v-82 q-8 24 -8 58 h-18 q-4 -42 10 -82 q10 -18 44 -22 z" />
        </g>
        {COMPASS_REGIONS.filter((region) => SHAPES[region.id]).map((region) => {
          const shape = SHAPES[region.id];
          const props = {
            className: cn("body-region", selected === region.id && "is-selected", highlighted.has(region.id) && "is-highlighted"),
            role: "button", tabIndex: 0, "aria-pressed": selected === region.id,
            "aria-label": `${region.title}${highlighted.has(region.id) ? " · has a prompt to review" : ""}`,
            onClick: () => onSelect(region.id),
            onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(region.id); } },
          };
          return shape.kind === "circle" ? <circle key={region.id} cx={shape.cx} cy={shape.cy} r={shape.r} {...props} /> : <path key={region.id} d={shape.d} {...props} />;
        })}
      </svg>
      <button type="button" className={cn("whole-body-button", selected === "whole_body" && "is-selected", highlighted.has("whole_body") && "is-highlighted")} aria-pressed={selected === "whole_body"} onClick={() => onSelect("whole_body")}>
        Whole body and mission{highlighted.has("whole_body") ? " · prompt" : ""}
      </button>
    </div>
  );
}
