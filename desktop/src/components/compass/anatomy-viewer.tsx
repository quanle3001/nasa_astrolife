import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { ANATOMY_BY_KEY, ATTRIBUTION, SYSTEM_LABELS, type AnatomySex, type AnatomyStructure, type AnatomySystem } from "open-anatomy-3d";
import femaleModelUrl from "open-anatomy-3d/models/anatomy-female.glb?url";
import maleModelUrl from "open-anatomy-3d/models/anatomy-male.glb?url";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Color, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { COMPASS_REGIONS, regionForStructure } from "@/components/compass/regions";
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
const SELECTED = new Color("#46d9e8");
const PROMPT = new Color("#f5c67b");
const NONE = new Color("#000000");

interface Part { mesh: Mesh; structure: AnatomyStructure; regionId: string | null }

function structureOf(object: Object3D | null): AnatomyStructure | null {
  for (let current = object; current; current = current.parent) {
    if (ANATOMY_BY_KEY[current.name]) return ANATOMY_BY_KEY[current.name];
  }
  return null;
}

function Model({ url, layers, selected, highlighted, onPick, onHover }: {
  url: string; layers: Record<AnatomySystem, boolean>; selected: string; highlighted: Set<string>;
  onPick: (structure: AnatomyStructure) => void; onHover: (structure: AnatomyStructure | null) => void;
}) {
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

  useEffect(() => {
    // When the selected region has visible structures, everything else fades so
    // the selection can be seen through what surrounds it (the heart behind the ribs).
    const focus = parts.some((part) => part.regionId === selected && layers[part.structure.system]);
    for (const { mesh, structure, regionId } of parts) {
      mesh.visible = layers[structure.system];
      const material = mesh.material as MeshStandardMaterial;
      const isSelected = regionId === selected;
      const hasPrompt = regionId !== null && highlighted.has(regionId);
      const faded = focus && !isSelected;
      material.emissive.copy(isSelected ? SELECTED : hasPrompt ? PROMPT : NONE);
      material.emissiveIntensity = isSelected ? 0.6 : hasPrompt ? 0.3 : 0;
      material.transparent = faded;
      material.opacity = faded ? 0.32 : 1;
      material.depthWrite = !faded;
      material.needsUpdate = true;
    }
    invalidate();
  }, [parts, layers, selected, highlighted, invalidate]);

  return (
    <primitive
      object={scene}
      onClick={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); const structure = structureOf(event.object); if (structure) onPick(structure); }}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onHover(structureOf(event.object)); }}
      onPointerOut={() => onHover(null)}
    />
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

export default function AnatomyViewer({ selected, highlighted, onSelect, calm }: {
  selected: string; highlighted: Set<string>; onSelect: (regionId: string) => void;
  /** True when motion is paused or reduced: the camera stops easing. */
  calm?: boolean;
}) {
  const [sex, setSex] = useState<AnatomySex>("male");
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [hovered, setHovered] = useState<AnatomyStructure | null>(null);
  const [picked, setPicked] = useState<AnatomyStructure | null>(null);

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

  return (
    <div className="anatomy-viewer">
      <div className="anatomy-canvas" style={{ cursor: hovered ? "pointer" : "grab" }}>
        <Canvas frameloop="demand" dpr={[1, 1.75]} camera={{ fov: 32, position: [0, 1, 4.2] }} role="img" aria-label="3D anatomical model. Drag to rotate, scroll to zoom, select a structure to see its health information. The same regions are listed as buttons below.">
          <ambientLight intensity={0.75} />
          <hemisphereLight args={["#cfe9ff", "#0b1424", 0.9]} />
          <directionalLight position={[2.5, 4, 3.5]} intensity={1.5} />
          <directionalLight position={[-3, 2, -2.5]} intensity={0.55} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.08} key={sex}>
              <Model url={MODEL_URLS[sex]} layers={layers} selected={selected} highlighted={highlighted} onPick={pick} onHover={setHovered} />
            </Bounds>
          </Suspense>
          <OrbitControls makeDefault enablePan={false} enableDamping={!calm} minDistance={0.6} maxDistance={7} />
        </Canvas>
        <p className="anatomy-readout" aria-live="polite">
          {shown
            ? <><strong>{shown.label}</strong> · {shown.category}{shownRegion ? ` · ${shownRegion.title}` : " · no AstroLife health topic is linked to this structure"}</>
            : "Drag to rotate · scroll to zoom · select a structure"}
        </p>
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
