import type { KeyboardEvent } from "react";
import { COMPASS_REGIONS } from "@/components/compass/regions";
import { cn } from "@/lib/utils";

type Shape = { d: string } | { cx: number; cy: number; rx: number; ry: number };

/** Region shapes on a front-view figure, in the SVG's 240 x 520 coordinate space. */
const SHAPES: Record<string, Shape[]> = {
  brain: [{ d: "M94 44 C94 22 146 22 146 44 C148 58 140 64 120 64 C100 64 92 58 94 44 Z" }],
  eyes: [{ cx: 108, cy: 74, rx: 7, ry: 4.5 }, { cx: 132, cy: 74, rx: 7, ry: 4.5 }],
  inner_ear: [{ cx: 88, cy: 78, rx: 5, ry: 7 }, { cx: 152, cy: 78, rx: 5, ry: 7 }],
  immune: [{ d: "M112 132 h16 v16 q-8 8 -16 0 Z" }, { cx: 150, cy: 214, rx: 9, ry: 12 }],
  lungs: [
    { d: "M110 150 C92 150 84 178 84 214 C84 226 96 226 108 218 C112 200 112 170 110 150 Z" },
    { d: "M130 150 C148 150 156 178 156 214 C156 226 144 226 132 218 C128 200 128 170 130 150 Z" },
  ],
  heart: [{ d: "M122 176 C116 164 100 170 106 186 C110 198 122 206 126 210 C132 204 142 196 142 184 C142 170 128 166 122 176 Z" }],
  digestive: [{ d: "M94 236 C96 226 144 226 146 236 C152 262 148 292 138 300 C128 306 112 306 102 300 C92 292 88 262 94 236 Z" }],
  muscles: [
    { d: "M62 150 C54 176 52 204 56 228 L72 228 C72 204 74 178 80 154 Z" },
    { d: "M178 150 C186 176 188 204 184 228 L168 228 C168 204 166 178 160 154 Z" },
    { d: "M92 330 C86 366 88 398 94 420 L114 420 C116 394 116 362 114 330 Z" },
    { d: "M148 330 C154 366 152 398 146 420 L126 420 C124 394 124 362 126 330 Z" },
  ],
  skeleton: [
    { d: "M117 108 h6 v200 h-6 Z" },
    { d: "M88 306 C100 298 140 298 152 306 C150 322 138 328 120 328 C102 328 90 322 88 306 Z" },
    { d: "M98 428 h10 v70 h-10 Z" }, { d: "M132 428 h10 v70 h-10 Z" },
  ],
};

/**
 * Schematic front-view body map. It is the Health Compass on hardware without
 * usable 3D and the always-available fallback. Regions are real buttons, so
 * the map works with a keyboard and a screen reader.
 */
export function BodyMap2D({ selected, highlighted, onSelect }: {
  selected: string; highlighted: Set<string>; onSelect: (regionId: string) => void;
}) {
  return (
    <div className="body-map">
      <svg viewBox="0 0 240 520" role="group" aria-label="Body map. Select a region to see what was recorded and the related NASA research.">
        <g className="body-outline" aria-hidden="true">
          <ellipse cx="120" cy="62" rx="34" ry="42" />
          <path d="M106 100 h28 v14 C160 118 180 126 186 146 C196 186 198 232 194 268 C192 282 176 282 176 268 C176 236 172 204 164 178 L164 300 C170 348 166 420 156 500 C154 512 128 512 128 500 L124 340 L116 340 L112 500 C112 512 86 512 84 500 C74 420 70 348 76 300 L76 178 C68 204 64 236 64 268 C64 282 48 282 46 268 C42 232 44 186 54 146 C60 126 80 118 106 114 Z" />
        </g>
        {COMPASS_REGIONS.filter((region) => SHAPES[region.id]).map((region) => {
          const prompt = highlighted.has(region.id);
          return (
            <g
              key={region.id}
              className={cn("body-region", selected === region.id && "is-selected", prompt && "is-highlighted")}
              role="button" tabIndex={0} aria-pressed={selected === region.id}
              aria-label={`${region.title}${prompt ? " · has a prompt to review" : ""}`}
              onClick={() => onSelect(region.id)}
              onKeyDown={(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(region.id); } }}
            >
              <title>{region.title}</title>
              {SHAPES[region.id].map((shape, index) => ("d" in shape ? <path key={index} d={shape.d} /> : <ellipse key={index} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />))}
            </g>
          );
        })}
      </svg>
      <button type="button" className={cn("whole-body-button", selected === "whole_body" && "is-selected", highlighted.has("whole_body") && "is-highlighted")} aria-pressed={selected === "whole_body"} onClick={() => onSelect("whole_body")}>
        Whole body and mission{highlighted.has("whole_body") ? " · prompt" : ""}
      </button>
    </div>
  );
}
