import type { AnimationRole, AppearanceDef, EquipSlot, Socket } from '@rpg/game-data';
import {
  type AbstractMesh,
  type AnimationGroup,
  type AssetContainer,
  Color3,
  type Material,
  type Mesh,
  MeshBuilder,
  type Node,
  type Scene,
  StandardMaterial,
  TransformNode,
} from './babylon';
import { createPlaceholderMesh } from './placeholder';

export type BaseRole = Extract<AnimationRole, 'idle' | 'run' | 'death'>;
export type OneShotRole = Extract<AnimationRole, 'attack' | 'cast' | 'hit'>;

/** Equipment to show, by slot, resolved to appearances by the caller. */
export type GearAppearances = Partial<Record<EquipSlot, AppearanceDef>>;

/** Slots that have a visible attachment in M2 (others are stats-only for now). */
const VISIBLE_SLOTS: EquipSlot[] = ['main_hand', 'off_hand', 'artifact', 'head', 'back'];

/** What an EntityView drives, whether it is a real model or a primitive. */
export interface Visual {
  readonly root: TransformNode;
  readonly shadowCasters: AbstractMesh[];
  setBase(role: BaseRole): void;
  oneShot(role: OneShotRole): void;
  setGear(gear: GearAppearances): void;
  update(dt: number): void;
  reset(): void;
  dispose(): void;
}

/** Shared gear-attachment logic: one mesh per slot, rebuilt only when the appearance changes. */
class GearAttachments {
  private readonly attached = new Map<EquipSlot, { appearanceId: string; mesh: Mesh }>();
  private floatTime = 0;

  constructor(
    private readonly scene: Scene,
    private readonly name: string,
    private readonly socketNode: (socket: Socket) => TransformNode | null,
    private readonly builtIn: AppearanceDef['builtIn'],
    private readonly setBuiltInVisible: (slot: EquipSlot, visible: boolean) => void,
  ) {}

  apply(gear: GearAppearances): void {
    for (const slot of VISIBLE_SLOTS) {
      const want = gear[slot];
      const builtIn = this.builtIn[slot];
      const useBuiltIn = !!builtIn && (!want || want.id === builtIn.appearanceId);
      if (builtIn) this.setBuiltInVisible(slot, useBuiltIn);
      const current = this.attached.get(slot);
      const target = useBuiltIn ? undefined : want;
      if (current?.appearanceId === target?.id) continue;
      current?.mesh.dispose();
      this.attached.delete(slot);
      if (!target?.attach) continue;
      const parent = this.socketNode(target.attach.socket);
      if (!parent) continue;
      const mesh = createPlaceholderMesh(this.scene, target, `${this.name}_${slot}`);
      mesh.parent = parent;
      // Sockets inside scaled rigs: keep equipment in world metres.
      parent.computeWorldMatrix(true);
      const s = parent.absoluteScaling.x || 1;
      mesh.scaling.setAll(1 / s);
      const [px, py, pz] = target.attach.position;
      const [rx, ry, rz] = target.attach.rotation;
      mesh.position.set(px / s, py / s, pz / s);
      mesh.rotation.set(rx, ry, rz);
      this.attached.set(slot, { appearanceId: target.id, mesh });
    }
  }

  /** Artifacts (flying swords) hover and bob next to the owner. */
  update(dt: number): void {
    this.floatTime += dt;
    const artifact = this.attached.get('artifact');
    if (artifact) artifact.mesh.rotation.y = this.floatTime * 2;
  }

  dispose(): void {
    for (const a of this.attached.values()) a.mesh.dispose();
    this.attached.clear();
  }
}

/** Primitive with procedural motion: bob when running, lunge on attack, flash on hit, fall on death. */
export class PlaceholderVisual implements Visual {
  readonly root: TransformNode;
  readonly shadowCasters: AbstractMesh[];
  private readonly body: Mesh;
  private readonly flashMat: StandardMaterial;
  private readonly baseMat: Material;
  private readonly gear: GearAttachments;
  private readonly sockets = new Map<Socket, TransformNode>();
  private base: BaseRole = 'idle';
  private time = 0;
  private attackT = 0;
  private castT = 0;
  private hitT = 0;
  private deathT = 0;

  constructor(
    scene: Scene,
    private readonly appearance: AppearanceDef,
    name: string,
  ) {
    this.root = new TransformNode(`${name}_visual`, scene);
    this.body = createPlaceholderMesh(scene, appearance, `${name}_body`);
    this.body.parent = this.root;
    this.baseMat = this.body.material as Material;
    if (appearance.tint) {
      const tinted = (this.baseMat as StandardMaterial).clone(`${name}_tint`);
      tinted.emissiveColor = Color3.FromHexString(appearance.tint).scale(
        appearance.kind === 'portal' ? 0.9 : 0.45,
      );
      if (appearance.kind === 'portal') {
        // A glowing, see-through gate rather than a solid pillar.
        tinted.alpha = 0.45;
        tinted.disableLighting = true;
        tinted.backFaceCulling = false;
      }
      this.body.material = tinted;
      this.baseMat = tinted;
    }
    this.flashMat = new StandardMaterial(`${name}_flash`, scene);
    this.flashMat.diffuseColor = Color3.White();
    this.flashMat.emissiveColor = new Color3(0.9, 0.3, 0.3);

    const { height, radius } = appearance.placeholder;
    if (
      appearance.kind === 'character' ||
      appearance.kind === 'monster' ||
      appearance.kind === 'npc'
    ) {
      // Small nose so facing is readable before real models exist.
      const nose = MeshBuilder.CreateBox(`${name}_nose`, { size: radius * 0.45 }, scene);
      nose.position.set(0, height * 0.7, radius * 0.95);
      nose.material = this.baseMat;
      nose.isPickable = false;
      nose.parent = this.body;
    }
    const socket = (s: Socket, x: number, y: number, z: number) => {
      const n = new TransformNode(`${name}_${s}`, scene);
      n.parent = this.body;
      n.position.set(x, y, z);
      this.sockets.set(s, n);
    };
    socket('hand_r', radius * 1.05, height * 0.5, radius * 0.3);
    socket('hand_l', -radius * 1.05, height * 0.5, radius * 0.3);
    socket('head', 0, height * 0.98, 0);
    socket('back', 0, height * 0.6, -radius);
    socket('artifact', radius * 1.4, height * 1.05, -radius * 0.4);
    this.gear = new GearAttachments(
      scene,
      name,
      (s) => this.sockets.get(s) ?? null,
      {},
      () => {},
    );
    this.shadowCasters = [this.body];
  }

  setBase(role: BaseRole): void {
    if (role === this.base) return;
    this.base = role;
    if (role === 'death') this.deathT = 0;
  }

  oneShot(role: OneShotRole): void {
    if (this.base === 'death') return;
    if (role === 'attack') this.attackT = 0.35;
    else if (role === 'cast') this.castT = 0.5;
    else this.hitT = 0.15;
  }

  setGear(gear: GearAppearances): void {
    this.gear.apply(gear);
  }

  update(dt: number): void {
    this.time += dt;
    this.attackT = Math.max(0, this.attackT - dt);
    this.castT = Math.max(0, this.castT - dt);
    this.hitT = Math.max(0, this.hitT - dt);
    const b = this.body;

    if (this.base === 'death') {
      this.deathT = Math.min(1, this.deathT + dt * 3);
      b.rotation.x = (-Math.PI / 2) * this.deathT;
      b.position.y = 0;
      b.position.z = 0;
    } else {
      b.rotation.x = 0;
      const castLift = this.castT > 0 ? Math.sin((1 - this.castT / 0.5) * Math.PI) * 0.25 : 0;
      b.position.y =
        (this.base === 'run' ? Math.abs(Math.sin(this.time * 14)) * 0.12 : 0) + castLift;
      // Lunge forward then back over the attack window.
      b.position.z = this.attackT > 0 ? Math.sin((1 - this.attackT / 0.35) * Math.PI) * 0.35 : 0;
    }
    if (this.appearance.kind === 'loot' || this.appearance.kind === 'portal') {
      b.rotation.y = this.time * (this.appearance.kind === 'portal' ? 0.6 : 1.8);
      b.position.y = this.appearance.kind === 'loot' ? 0.15 + Math.sin(this.time * 3) * 0.08 : 0;
    }
    b.material = this.hitT > 0 ? this.flashMat : this.baseMat;
    this.gear.update(dt);
  }

  reset(): void {
    this.base = 'idle';
    this.attackT = this.castT = this.hitT = this.deathT = 0;
    this.update(0);
  }

  dispose(): void {
    this.gear.dispose();
    this.flashMat.dispose();
    this.root.dispose();
  }
}

/** Instantiated skinned model driven by AnimationGroups mapped through the appearance. */
export class ModelVisual implements Visual {
  readonly root: TransformNode;
  readonly shadowCasters: AbstractMesh[];
  private readonly groups = new Map<AnimationRole, AnimationGroup>();
  private readonly allGroups: AnimationGroup[];
  private readonly nodesByName = new Map<string, Node>();
  private readonly gear: GearAttachments;
  private base: BaseRole | null = null;
  private oneShotActive: OneShotRole | null = null;

  constructor(scene: Scene, container: AssetContainer, appearance: AppearanceDef, name: string) {
    this.root = new TransformNode(`${name}_visual`, scene);
    const entries = container.instantiateModelsToScene((n) => `${name}_${n}`, !!appearance.tint, {
      doNotInstantiate: true,
    });
    for (const node of entries.rootNodes) node.parent = this.root;
    this.root.scaling.setAll(appearance.scale);
    this.root.rotation.y = appearance.yawOffset;
    this.shadowCasters = this.root.getChildMeshes(false);
    for (const m of this.shadowCasters) m.isPickable = false;
    for (const n of this.root.getDescendants(false))
      this.nodesByName.set(stripPrefix(n.name, name), n);

    if (appearance.tint) {
      const tint = Color3.FromHexString(appearance.tint).scale(0.35);
      for (const m of this.shadowCasters) {
        const mat = m.material as (Material & { emissiveColor?: Color3 }) | null;
        if (mat && 'emissiveColor' in mat) mat.emissiveColor = tint;
      }
    }

    this.allGroups = entries.animationGroups;
    const byName = new Map(entries.animationGroups.map((g) => [stripPrefix(g.name, name), g]));
    for (const [role, clip] of Object.entries(appearance.animations)) {
      const g = byName.get(clip);
      if (g) this.groups.set(role as AnimationRole, g);
      else
        console.warn(`[anim] ${appearance.id}: clip "${clip}" for ${role} not found`, [
          ...byName.keys(),
        ]);
    }
    for (const g of this.allGroups) {
      g.stop();
      g.enableBlending = true;
      g.blendingSpeed = 0.12;
    }

    this.gear = new GearAttachments(
      scene,
      name,
      (socket) => {
        const bone = appearance.sockets[socket];
        const node = bone ? this.nodesByName.get(bone) : undefined;
        return node instanceof TransformNode ? node : null;
      },
      appearance.builtIn,
      (slot, visible) => {
        const part = appearance.builtIn[slot];
        const node = part ? this.nodesByName.get(part.node) : undefined;
        node?.setEnabled(visible);
      },
    );
    this.setBase('idle');
  }

  setBase(role: BaseRole): void {
    if (role === this.base) return;
    this.base = role;
    if (this.oneShotActive && role !== 'death') return; // resumes when the one-shot ends
    this.oneShotActive = null;
    this.playOnly(role, role !== 'death');
  }

  oneShot(role: OneShotRole): void {
    if (this.base === 'death') return;
    if (role === 'hit' && this.oneShotActive && this.oneShotActive !== 'hit') return;
    const g = this.groups.get(role) ?? (role === 'cast' ? this.groups.get('attack') : undefined);
    if (!g) return;
    this.oneShotActive = role;
    this.playGroup(g, false);
    g.onAnimationGroupEndObservable.addOnce(() => {
      if (this.oneShotActive !== role) return;
      this.oneShotActive = null;
      const base = this.base ?? 'idle';
      this.playOnly(base, base !== 'death');
    });
  }

  setGear(gear: GearAppearances): void {
    this.gear.apply(gear);
  }

  update(dt: number): void {
    this.gear.update(dt);
  }

  reset(): void {
    this.base = null;
    this.oneShotActive = null;
    this.setBase('idle');
  }

  dispose(): void {
    this.gear.dispose();
    for (const g of this.allGroups) g.dispose();
    this.root.dispose();
  }

  private playOnly(role: AnimationRole, loop: boolean): void {
    const g = this.groups.get(role);
    if (g) this.playGroup(g, loop);
    else for (const other of this.allGroups) if (other.isPlaying) other.stop();
  }

  private playGroup(g: AnimationGroup, loop: boolean): void {
    for (const other of this.allGroups) if (other !== g && other.isPlaying) other.stop();
    g.start(loop, 1, g.from, g.to);
  }
}

/** instantiateModelsToScene names clones through our name function; recover the original name. */
function stripPrefix(nodeName: string, prefix: string): string {
  return nodeName.startsWith(`${prefix}_`) ? nodeName.slice(prefix.length + 1) : nodeName;
}
