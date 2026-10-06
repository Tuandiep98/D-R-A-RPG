import {
  type AbstractMesh,
  type AnimationGroup,
  type AssetContainer,
  Color3,
  type Mesh,
  MeshBuilder,
  type Scene,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core';
import type { AnimationRole, AppearanceDef } from '@rpg/game-data';
import { createPlaceholderMesh } from './placeholder';

export type BaseRole = Extract<AnimationRole, 'idle' | 'run' | 'death'>;
export type OneShotRole = Extract<AnimationRole, 'attack' | 'hit'>;

/** What an EntityView drives, whether it is a real model or a primitive. */
export interface Visual {
  readonly root: TransformNode;
  readonly shadowCasters: AbstractMesh[];
  setBase(role: BaseRole): void;
  oneShot(role: OneShotRole): void;
  update(dt: number): void;
  reset(): void;
  dispose(): void;
}

/** Primitive with procedural motion: bob when running, lunge on attack, flash on hit, fall on death. */
export class PlaceholderVisual implements Visual {
  readonly root: TransformNode;
  readonly shadowCasters: AbstractMesh[];
  private readonly body: Mesh;
  private readonly flashMat: StandardMaterial;
  private readonly baseMat: StandardMaterial;
  private base: BaseRole = 'idle';
  private time = 0;
  private attackT = 0;
  private hitT = 0;
  private deathT = 0;

  constructor(scene: Scene, appearance: AppearanceDef, name: string) {
    this.root = new TransformNode(`${name}_visual`, scene);
    this.body = createPlaceholderMesh(scene, appearance, `${name}_body`);
    this.body.parent = this.root;
    this.baseMat = this.body.material as StandardMaterial;
    this.flashMat = new StandardMaterial(`${name}_flash`, scene);
    this.flashMat.diffuseColor = Color3.White();
    this.flashMat.emissiveColor = new Color3(0.9, 0.3, 0.3);

    // Small nose so facing is readable before real models exist.
    const { height, radius } = appearance.placeholder;
    const nose = MeshBuilder.CreateBox(`${name}_nose`, { size: radius * 0.45 }, scene);
    nose.position.set(0, height * 0.7, radius * 0.95);
    nose.material = this.baseMat;
    nose.isPickable = false;
    nose.parent = this.body;
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
    else this.hitT = 0.15;
  }

  update(dt: number): void {
    this.time += dt;
    this.attackT = Math.max(0, this.attackT - dt);
    this.hitT = Math.max(0, this.hitT - dt);
    const b = this.body;

    if (this.base === 'death') {
      this.deathT = Math.min(1, this.deathT + dt * 3);
      b.rotation.x = (-Math.PI / 2) * this.deathT;
      b.position.y = 0;
      b.position.z = 0;
    } else {
      b.rotation.x = 0;
      b.position.y = this.base === 'run' ? Math.abs(Math.sin(this.time * 14)) * 0.12 : 0;
      // Lunge forward then back over the attack window.
      b.position.z = this.attackT > 0 ? Math.sin((1 - this.attackT / 0.35) * Math.PI) * 0.35 : 0;
    }
    b.material = this.hitT > 0 ? this.flashMat : this.baseMat;
  }

  reset(): void {
    this.base = 'idle';
    this.attackT = this.hitT = this.deathT = 0;
    this.update(0);
  }

  dispose(): void {
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
  private base: BaseRole | null = null;
  private oneShotActive: OneShotRole | null = null;

  constructor(scene: Scene, container: AssetContainer, appearance: AppearanceDef, name: string) {
    this.root = new TransformNode(`${name}_visual`, scene);
    const entries = container.instantiateModelsToScene((n) => `${name}_${n}`, false, {
      doNotInstantiate: true,
    });
    for (const node of entries.rootNodes) node.parent = this.root;
    this.root.scaling.setAll(appearance.scale);
    this.root.rotation.y = appearance.yawOffset;
    this.shadowCasters = this.root.getChildMeshes(false);
    for (const m of this.shadowCasters) m.isPickable = false;

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
    if (role === 'hit' && this.oneShotActive === 'attack') return;
    const g = this.groups.get(role);
    if (!g) return;
    this.oneShotActive = role;
    this.playOnly(role, false);
    g.onAnimationGroupEndObservable.addOnce(() => {
      if (this.oneShotActive !== role) return;
      this.oneShotActive = null;
      const base = this.base ?? 'idle';
      this.playOnly(base, base !== 'death');
    });
  }

  update(): void {}

  reset(): void {
    this.base = null;
    this.oneShotActive = null;
    this.setBase('idle');
  }

  dispose(): void {
    for (const g of this.allGroups) g.dispose();
    this.root.dispose();
  }

  private playOnly(role: AnimationRole, loop: boolean): void {
    const g = this.groups.get(role);
    for (const other of this.allGroups) if (other !== g && other.isPlaying) other.stop();
    if (g) g.start(loop, 1, g.from, g.to);
  }
}

/** instantiateModelsToScene names clones through our name function; recover the clip name. */
function stripPrefix(groupName: string, prefix: string): string {
  return groupName.startsWith(`${prefix}_`) ? groupName.slice(prefix.length + 1) : groupName;
}
