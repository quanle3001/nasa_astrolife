import { Bounds, Html, Line, OrbitControls, useBounds, useGLTF } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { ANATOMY_BY_KEY, ATTRIBUTION, SYSTEM_LABELS, type AnatomySex, type AnatomyStructure, type AnatomySystem } from "open-anatomy-3d";
import femaleModelUrl from "open-anatomy-3d/models/anatomy-female.glb?url";
import maleModelUrl from "open-anatomy-3d/models/anatomy-male.glb?url";
import { RotateCcw } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Box3, Color, Mesh, MeshStandardMaterial, Vector3, type Object3D } from "three";
import { COMPASS_REGIONS, regionForStructure, type RegionSummary } from "@/components/compass/regions";
import { cn } from "@/lib/utils";

/**
 * Interactive 3D anatomy for the Health Compass, built on the open-anatomy-3d
 * models (BodyParts3D, Human Reference Atlas, MakeHuman; CC BY 4.0). The models
 * are bundled with the app, so the viewer works offline.
 *
 * It is an educational navigation aid: selecting a structure opens the NASA
 * research and the astronaut's own observations for its body system. Colour
 * marks "selected" or "has a prompt to review"; it never marks disease.
 */

const MODEL_URLS: Record<AnatomySex, string> = { male: maleModelUrl, female: femaleModelUrl };
/**
 * Layers that can be switched on and off. Joints are catalog hotspots without
 * meshes. The skin surface is deliberately not offered: the source models are
 * unclothed, and this is a health-education view shown to mixed audiences.
 */
const LAYERS: AnatomySystem[] = ["skeleton", "muscles", "organs", "vessels", "nerves"];
const DEFAULT_LAYERS: Record<AnatomySystem, boolean> = { skin: false, skeleton: true, muscles: false, organs: true, vessels: false, nerves: false, joints: false };

/** Never rendered: the unclothed skin surface and reproductive structures (no AstroLife health topic uses them). */
const isExcluded = (structure: AnatomyStructure) => structure.system === "skin" || structure.category === "Reproductive";
/** Space kept around a selected region when the camera flies to it, in metres. */
const FOCUS_PADDING = 0.17;
const HOVER = new Color("#bfeaff");
const SELECTED = new Color("#46d9e8");
const PROMPT = new Color("#f5c67b");
const NONE = new Color("#000000");

/** Distance of a guide label from the body's centre line, in metres (model units). */
const PIN_OFFSET = 0.5;

interface Part { mesh: Mesh; structure: AnatomyStructure; regionId: string | null }
interface Pin { regionId: string; label: string; anchor: Vector3; labelAt: Vector3 }

function structureOf(object: Object3D | null): AnatomyStructure | null {
  for (let current = object; current; current = current.parent) {
    if (ANATOMY_BY_KEY[current.name]) return ANATOMY_BY_KEY[current.name];
  }
  return null;
}

function Model({ url, layers, selected, highlighted, hoveredKey, showPins, onPick, onPickRegion, onHover, onHoverPin }: {
  url: string; layers: Record<AnatomySystem, boolean>; selected: string; highlighted: Set<string>; hoveredKey: string | null; showPins: boolean;
  onPick: (structure: AnatomyStructure) => void; onPickRegion: (regionId: string) => void; onHover: (structure: AnatomyStructure | null) => void;
  onHoverPin: (regionId: string | null) => void;
}) {
  const bounds = useBounds();
  const overview = useRef(true);
  // The third argument enables the meshopt decoder the models are compressed with.
  const { scene } = useGLTF(url, false, true);
  const invalidate = useThree((state) => state.invalidate);
  const parts = useMemo(() => {
    const list: Part[] = [];
    scene.traverse((object) => {
      // GLTFLoader makes node names unique ("skin" inside the "skin" group becomes
      // "skin_1"), so a mesh is identified by walking up to the first catalog key.
      const structure = object instanceof Mesh ? structureOf(object) : null;
      if (!(object instanceof Mesh) || !structure) return;
      if (isExcluded(structure)) {
        // Hidden for good, and removed from picking and from the camera's framing.
        object.visible = false;
        object.raycast = () => undefined;
        return;
      }
      // The models ship without materials; each structure gets its catalog colour.
      object.material = new MeshStandardMaterial({ color: structure.color, roughness: 0.62, metalness: 0.04 });
      list.push({ mesh: object, structure, regionId: regionForStructure(structure)?.id ?? null });
    });
    return list;
  }, [scene]);

  // Guide pins: one labelled, clickable pointer per health region, anchored to a real structure.
  const pins = useMemo(() => {
    const result: Pin[] = [];
    for (const region of COMPASS_REGIONS) {
      const part = region.pin && parts.find((item) => item.structure.key === region.pin?.structure);
      if (!region.pin || !part) continue;
      const anchor = new Box3().setFromObject(part.mesh).getCenter(new Vector3());
      result.push({ regionId: region.id, label: region.pin.label, anchor, labelAt: new Vector3(region.pin.side * PIN_OFFSET, anchor.y, anchor.z) });
    }
    return result;
  }, [parts]);

  useEffect(() => {
    // When the selected region has visible structures, everything else fades so
    // the selection can be seen through what surrounds it (the heart behind the ribs).
    const focus = parts.some((part) => part.regionId === selected && layers[part.structure.system]);
    for (const { mesh, structure, regionId } of parts) {
      mesh.visible = layers[structure.system];
      const material = mesh.material as MeshStandardMaterial;
      const isSelected = regionId === selected;
      const hasPrompt = regionId !== null && highlighted.has(regionId);
      const isHovered = structure.key === hoveredKey;
      const faded = focus && !isSelected && !isHovered;
      material.emissive.copy(isHovered ? HOVER : isSelected ? SELECTED : hasPrompt ? PROMPT : NONE);
      material.emissiveIntensity = isHovered ? 0.45 : isSelected ? 0.7 : hasPrompt ? 0.3 : 0;
      // Recompiling a material is only needed when it switches between opaque and see-through.
      if (material.transparent !== faded) { material.transparent = faded; material.needsUpdate = true; }
      material.opacity = faded ? 0.5 : 1;
      material.depthWrite = !faded;
    }
    invalidate();
  }, [parts, layers, selected, highlighted, hoveredKey, invalidate]);

  // Fly the camera to the selected region. The first view is the whole body, so the
  // astronaut sees where everything is before anything zooms.
  useEffect(() => {
    if (overview.current) { overview.current = false; return; }
    const box = new Box3();
    for (const part of parts) if (part.regionId === selected && layers[part.structure.system]) box.expandByObject(part.mesh);
    if (box.isEmpty()) bounds.refresh().fit();
    else bounds.refresh(box.expandByScalar(FOCUS_PADDING)).fit();
    invalidate();
    // Zoom follows the selection and the layers that show it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, layers, parts]);

  return (
    <>
      <primitive
        object={scene}
        onClick={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); const structure = structureOf(event.object); if (structure) onPick(structure); }}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onHover(structureOf(event.object)); }}
        onPointerOut={() => onHover(null)}
      />
      {showPins && pins.map((pin) => (
        <group key={pin.regionId}>
          <Line points={[pin.anchor, pin.labelAt]} color={pin.regionId === selected ? "#46d9e8" : "#8fa6c4"} lineWidth={1} transparent opacity={0.75} />
          <Html position={pin.labelAt} center zIndexRange={[15, 0]}>
            <button type="button" className={cn("anatomy-pin", pin.regionId === selected && "is-selected", highlighted.has(pin.regionId) && "has-prompt")} aria-pressed={pin.regionId === selected} onClick={() => onPickRegion(pin.regionId)} onPointerEnter={() => onHoverPin(pin.regionId)} onPointerLeave={() => onHoverPin(null)} onFocus={() => onHoverPin(pin.regionId)} onBlur={() => onHoverPin(null)}>
              {pin.label}{highlighted.has(pin.regionId) && <span className="sr-only"> · has a prompt to review</span>}
            </button>
          </Html>
        </group>
      ))}
    </>
  );
}

/** Systems that hold at least one structure of the given compass region. */
function layersForRegion(regionId: string): AnatomySystem[] {
  const systems = new Set<AnatomySystem>();
  for (const structure of Object.values(ANATOMY_BY_KEY)) {
    if (structure.system !== "joints" && !isExcluded(structure) && regionForStructure(structure)?.id === regionId) systems.add(structure.system);
  }
  return [...systems];
}

/**
 * Floating card that follows the cursor over the model. It gives the short
 * version (what this is, what was recorded, whether there is a prompt) so the
 * astronaut can explore by hovering and open the full panel only when wanted.
 */
function HoverCard({ label, summary }: { label: string; summary: RegionSummary | null }) {
  return (
    <>
      <strong>{label}</strong>
      {summary ? (
        <>
          <span className="hover-card-region">{summary.title}</span>
          {summary.measurement && <span>{summary.measurement}{summary.simulated ? " · simulated, not a measurement" : ""}</span>}
          {summary.prompt
            ? <span className="hover-card-prompt">Prompt to review{summary.promptCount > 1 ? ` (${summary.promptCount})` : ""}: {summary.prompt}</span>
            : <span>No prompt from your latest check-in. Not examined, not ruled out.</span>}
          <span className="hover-card-risks">NASA research: {summary.risks.join(" · ")}</span>
          <em>Select to open the details</em>
        </>
      ) : <span>No AstroLife health topic is linked to this structure.</span>}
    </>
  );
}

export default function AnatomyViewer({ selected, highlighted, onSelect, calm, regionInfo }: {
  selected: string; highlighted: Set<string>; onSelect: (regionId: string) => void;
  /** True when motion is paused or reduced: the camera stops easing. */
  calm?: boolean;
  /** Short facts per region for the hover card. */
  regionInfo?: Record<string, RegionSummary>;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  /** Keep the card next to the cursor without re-rendering on every move. */
  const follow = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = card.current;
    if (!element) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    // Flip to the other side of the cursor near the right and bottom edges.
    const left = x > rect.width - 280 ? x - 268 : x + 18;
    const top = y > rect.height - 190 ? y - 170 : y + 18;
    element.style.transform = `translate3d(${Math.max(8, left)}px, ${Math.max(8, top)}px, 0)`;
  };
  const [sex, setSex] = useState<AnatomySex>("male");
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [hovered, setHovered] = useState<AnatomyStructure | null>(null);
  const [picked, setPicked] = useState<AnatomyStructure | null>(null);
  const [showPins, setShowPins] = useState(true);
  const [view, setView] = useState(0);
  // A slow turn shows the model is three-dimensional; it stops at the first interaction.
  const [spinning, setSpinning] = useState(!calm);
  const controls = useRef<{ reset: () => void } | null>(null);
  // "Pause motion" can be switched on while the model is turning.
  useEffect(() => { if (calm) setSpinning(false); }, [calm]);

  // Selecting a region (here or from the list) reveals the layer it lives in.
  useEffect(() => {
    const needed = layersForRegion(selected);
    if (needed.length) setLayers((current) => (needed.some((system) => current[system]) ? current : { ...current, [needed[0]]: true }));
  }, [selected]);

  const pick = (structure: AnatomyStructure) => {
    setPicked(structure);
    const region = regionForStructure(structure);
    if (region) onSelect(region.id);
  };
  const shown = hovered ?? picked;
  const shownRegion = shown ? regionForStructure(shown) : null;
  const hoverRegion = hovered ? regionForStructure(hovered) : hoveredPin ? COMPASS_REGIONS.find((region) => region.id === hoveredPin) ?? null : null;
  const hoverLabel = hovered?.label ?? hoverRegion?.pin?.label ?? null;

  return (
    <div className="anatomy-viewer">
      <ol className="anatomy-guide" aria-label="How to use the 3D model">
        <li><strong>Hover, then pick.</strong> Hovering a part shows a short summary; select it or a label for details.</li>
        <li><strong>Read the panel.</strong> Your observations, AstroLife's prompts and NASA research appear beside it.</li>
        <li><strong>Look around.</strong> The view zooms to your selection. Drag to rotate, scroll to zoom, Reset view to step back.</li>
      </ol>
      <div className="anatomy-canvas" style={{ cursor: hovered ? "pointer" : "grab" }} onPointerMove={follow} onPointerLeave={() => setHoveredPin(null)}>
        <div ref={card} className={cn("hover-card", hoverLabel && "is-visible")} role="status" aria-live="polite">
          {hoverLabel && <HoverCard label={hoverLabel} summary={hoverRegion ? regionInfo?.[hoverRegion.id] ?? null : null} />}
        </div>
        <Canvas frameloop={spinning ? "always" : "demand"} dpr={[1, 1.75]} camera={{ fov: 32, position: [0, 1, 4.2] }} role="group" aria-label="3D anatomical model with selectable region labels. Drag to rotate, scroll to zoom. The same regions are listed as buttons below.">
          <ambientLight intensity={1.15} />
          <hemisphereLight args={["#e6f4ff", "#1a2740", 1.2]} />
          <directionalLight position={[2.5, 4, 3.5]} intensity={2.2} />
          <directionalLight position={[-3, 2, -2.5]} intensity={0.9} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.02} maxDuration={calm ? 0 : 0.9} key={`${sex}-${view}`}>
              <Model url={MODEL_URLS[sex]} layers={layers} selected={selected} highlighted={highlighted} hoveredKey={hovered?.key ?? null} showPins={showPins} onPick={(structure) => { setSpinning(false); pick(structure); }} onPickRegion={(regionId) => { setSpinning(false); setPicked(null); onSelect(regionId); }} onHover={setHovered} onHoverPin={setHoveredPin} />
            </Bounds>
          </Suspense>
          <OrbitControls ref={controls as never} makeDefault enablePan={false} enableDamping={!calm} minDistance={0.25} maxDistance={7} autoRotate={spinning} autoRotateSpeed={0.9} onStart={() => setSpinning(false)} />
        </Canvas>
        <p className="anatomy-readout" aria-live="polite">
          {shown
            ? <><strong>{shown.label}</strong> · {shown.category}{shownRegion ? ` · ${shownRegion.title}` : " · no AstroLife health topic is linked to this structure"}</>
            : "Select a label or a structure to see its health information"}
        </p>
        <button type="button" className="anatomy-reset" onClick={() => { controls.current?.reset(); setView((value) => value + 1); }}><RotateCcw className="size-3.5" aria-hidden="true" /> Reset view</button>
      </div>
      <div className="anatomy-controls">
        <fieldset className="anatomy-layers">
          <legend>Layers</legend>
          {LAYERS.map((system) => (
            <label key={system} className={cn("layer-chip", layers[system] && "is-on")}>
              <input type="checkbox" checked={layers[system]} onChange={() => setLayers((current) => ({ ...current, [system]: !current[system] }))} />
              {SYSTEM_LABELS[system]}
            </label>
          ))}
        </fieldset>
        <label className={cn("layer-chip", showPins && "is-on")}>
          <input type="checkbox" checked={showPins} onChange={() => setShowPins((value) => !value)} />
          Guide labels
        </label>
        <div className="anatomy-model" role="radiogroup" aria-label="Body model">
          {(["male", "female"] as const).map((option) => (
            <button key={option} type="button" role="radio" aria-checked={sex === option} className={cn("layer-chip", sex === option && "is-on")} onClick={() => { setSex(option); setPicked(null); }}>{option === "male" ? "Male model" : "Female model"}</button>
          ))}
        </div>
      </div>
      <p className="anatomy-credit">{ATTRIBUTION} Educational reference model, not a scan of you.</p>
    </div>
  );
}

/** Regions that have no structure in the 3D models and are reachable from the list only. */
export const REGIONS_WITHOUT_MESH = COMPASS_REGIONS.filter((region) => layersForRegion(region.id).length === 0).map((region) => region.id);
