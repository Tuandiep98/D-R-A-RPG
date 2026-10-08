import type { AssetLibrary } from '@rpg/asset-runtime';
import type { AnimationRole, AppearanceDef, EquipSlot, Socket } from '@rpg/game-data';
import {
  type AbstractMesh,
  type Animation,
  type AnimationGroup,
  AnimationGroupMask,
  type AssetContainer,
  Color3,
  type Material,
  type Mesh,
  MeshBuilder,
  type Node,
  type Observer,
  Quaternion,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
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
  /** Plays a named clip once; `fallback` role when the model lacks it. */
  oneShotClip(clip: string, speed: number, fallback?: OneShotRole): void;
  /** Stops an authoritative attack/cast that was canceled; keeps hit/death reactions. */
  cancelAction(): void;
  /** Hit-stop: holds the current pose for `seconds` (cosmetic, client only). */
  freeze(seconds: number): void;
  /**
   * Upper-body clip over the base loop (shooting, aiming, reloading — D-033):
   * the legs keep walking. `from`/`to` are clip seconds. A newer overlay or
   * endOverlay() replaces it; `onEnd` runs when a non-looping one finishes.
   */
  overlay(clip: string, speed: number, opts?: OverlayOptions): boolean;
  /** Drops the upper-body clip; the base loop blends back in. */
  endOverlay(): void;
  /** Length of a clip in seconds (0 when the model lacks it). */
  clipSeconds(clip: string): number;
  /** Node to hang effects on: a socket, or `weapon_tip` (main-hand blade tip / muzzle, else right hand). */
  anchor(name: Socket | 'weapon_tip'): TransformNode | null;
  setGear(gear: GearAppearances): void;
  update(dt: number): void;
  reset(): void;
  dispose(): void;
}

export interface OverlayOptions {
  loop?: boolean;
  from?: number;
  to?: number;
  onEnd?: () => void;
}

/**
 * Shared gear-attachment logic: one holder per slot, rebuilt only when the
 * appearance changes. The placeholder shows at once and is swapped for the
 * real model (appearance.modelAssetId) when it has loaded.
 */
class GearAttachments {
  private readonly attached = new Map<
    EquipSlot,
    {
      appearanceId: string;
      mesh: TransformNode;
      length: number;
      tipAt: readonly [number, number, number] | null;
      tip?: TransformNode;
    }
  >();
  private floatTime = 0;

  constructor(
    private readonly scene: Scene,
    private readonly name: string,
    private readonly socketNode: (socket: Socket) => TransformNode | null,
    private readonly builtIn: AppearanceDef['builtIn'],
    private readonly setBuiltInVisible: (slot: EquipSlot, visible: boolean) => void,
    private readonly assets: AssetLibrary | null = null,
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
      const mesh = new TransformNode(`${this.name}_${slot}`, this.scene);
      mesh.parent = parent;
      const placeholder = createPlaceholderMesh(this.scene, target, `${this.name}_${slot}_ph`);
      placeholder.parent = mesh;
      this.loadModel(mesh, placeholder, target);
      // Sockets inside scaled rigs: keep equipment in world metres.
      parent.computeWorldMatrix(true);
      const s = parent.absoluteScaling.x || 1;
      mesh.scaling.setAll(1 / s);
      const [px, py, pz] = target.attach.position;
      const [rx, ry, rz] = target.attach.rotation;
      mesh.position.set(px / s, py / s, pz / s);
      mesh.rotation.set(rx, ry, rz);
      this.attached.set(slot, {
        appearanceId: target.id,
        mesh,
        length: target.placeholder.height,
        tipAt: target.tip ?? null,
      });
    }
  }

  private loadModel(holder: TransformNode, placeholder: Mesh, target: AppearanceDef): void {
    const assets = this.assets;
    if (!assets?.has(target.modelAssetId)) return;
    void assets.loadContainer(target.modelAssetId).then((container) => {
      if (!container || holder.isDisposed()) return;
      const entries = container.instantiateModelsToScene((n) => `${holder.name}_${n}`, false);
      const model = new TransformNode(`${holder.name}_model`, this.scene);
      for (const node of entries.rootNodes) node.parent = model;
      for (const m of model.getChildMeshes(false)) m.isPickable = false;
      for (const g of entries.animationGroups) g.dispose();
      model.scaling.setAll(target.scale);
      model.rotation.y = target.yawOffset;
      model.parent = holder;
      placeholder.dispose();
    });
  }

  /**
   * Tip of the main-hand weapon for swing trails and muzzle flashes: the
   * appearance's `tip`, else near the end of a KayKit blade (holders are in
   * world metres and blades run along +Y). Null when bare-handed.
   */
  weaponTip(): TransformNode | null {
    const main = this.attached.get('main_hand');
    if (!main) return null;
    if (!main.tip) {
      main.tip = new TransformNode(`${main.mesh.name}_tip`, this.scene);
      main.tip.parent = main.mesh;
      if (main.tipAt) main.tip.position.set(main.tipAt[0], main.tipAt[1], main.tipAt[2]);
      else main.tip.position.y = main.length * 0.85;
    }
    return main.tip;
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
    assets: AssetLibrary | null = null,
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
      assets,
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

  oneShotClip(_clip: string, _speed: number, fallback: OneShotRole = 'attack'): void {
    this.oneShot(fallback);
  }

  freeze(_seconds: number): void {}

  cancelAction(): void {
    this.attackT = 0;
    this.castT = 0;
  }

  overlay(_clip: string, _speed: number, opts?: OverlayOptions): boolean {
    // Primitives have no arms: a tiny lunge reads as recoil.
    if (!opts?.loop) this.attackT = Math.max(this.attackT, 0.12);
    return false;
  }

  endOverlay(): void {}

  clipSeconds(_clip: string): number {
    return 0;
  }

  anchor(name: Socket | 'weapon_tip'): TransformNode | null {
    if (name === 'weapon_tip') return this.gear.weaponTip() ?? this.sockets.get('hand_r') ?? null;
    return this.sockets.get(name) ?? null;
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
  private readonly clips = new Map<string, AnimationGroup>();
  private readonly nodesByName = new Map<string, Node>();
  private readonly gear: GearAttachments;
  private base: BaseRole | null = null;
  private oneShotActive: OneShotRole | null = null;
  /** Bumped on every play; end callbacks of older plays are ignored. */
  private playToken = 0;
  private current: AnimationGroup | null = null;
  private currentSpeed = 1;
  private firstFrameObserver: Observer<Scene> | null = null;
  private frozen = 0;
  /** Upper-body overlay (D-033) and the mask that keeps it off the legs. */
  private overlayGroup: AnimationGroup | null = null;
  private overlayToken = 0;
  /**
   * End of a one-shot overlay, timed here: masked-out animatables stay paused,
   * so the group's own end observable never fires.
   */
  private overlayEnd: { left: number; onEnd?: () => void } | null = null;
  /**
   * Aim clips turn `root` + `hips` too, but those bones belong to the walk.
   * After the animations run, the yaw they would have added is put back on the
   * spine so the weapon points where the clip intended (D-033).
   */
  private upperYaw: {
    group: AnimationGroup;
    root: Animation | undefined;
    hips: Animation | undefined;
  } | null = null;
  private upperYawObserver: Observer<Scene> | null = null;
  private readonly scene: Scene;
  private readonly upperMask: AnimationGroupMask | null;

  constructor(
    scene: Scene,
    container: AssetContainer,
    private readonly appearance: AppearanceDef,
    name: string,
    assets: AssetLibrary | null = null,
  ) {
    this.scene = scene;
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
      // Recolour by multiplying the base colour, part-way toward the tint so
      // the texture's shading survives. (An emissive tint washed the models
      // out: it adds the same light everywhere, lit side or not.)
      const tint = Color3.Lerp(Color3.White(), Color3.FromHexString(appearance.tint), 0.65);
      for (const m of this.shadowCasters) {
        const mat = m.material as
          | (Material & { albedoColor?: Color3; diffuseColor?: Color3 })
          | null;
        if (mat?.albedoColor) mat.albedoColor = tint;
        else if (mat?.diffuseColor) mat.diffuseColor = tint;
      }
    }

    this.allGroups = entries.animationGroups;
    const byName = new Map(entries.animationGroups.map((g) => [stripPrefix(g.name, name), g]));
    for (const [clip, group] of byName) this.clips.set(clip, group);
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
    // Upper body = the spine and everything under it (chest, head, arms, hand slots).
    const spine = this.nodesByName.get('spine');
    this.upperMask = spine
      ? new AnimationGroupMask([spine.name, ...spine.getDescendants(false).map((n) => n.name)])
      : null;

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
      assets,
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
    this.playOneShot(g, role, 1);
  }

  oneShotClip(clip: string, speed: number, fallback: OneShotRole = 'attack'): void {
    const g = this.clips.get(clip);
    if (!g) {
      this.oneShot(fallback);
      return;
    }
    if (this.base === 'death') return;
    this.playOneShot(g, fallback, speed);
  }

  overlay(clip: string, speed: number, opts: OverlayOptions = {}): boolean {
    const g = this.clips.get(clip);
    if (!g || !this.upperMask || this.base === 'death') return false;
    const prev = this.overlayGroup;
    if (prev && prev !== g) this.clearOverlayGroup(prev);
    if (g === this.current) return false; // already playing full-body
    if (g.isPlaying) g.stop(true);
    // Drawn after the base loop (playOrder), so it wins on the bones it owns.
    g.mask = this.upperMask;
    g.playOrder = 1;
    const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 60;
    const from = opts.from !== undefined ? Math.min(g.to, g.from + opts.from * fps) : g.from;
    const to = opts.to !== undefined ? Math.min(g.to, g.from + opts.to * fps) : g.to;
    this.overlayToken++;
    this.overlayGroup = g;
    g.start(opts.loop === true, speed, from, Math.max(from, to));
    this.trackUpperYaw(g);
    this.overlayEnd = opts.loop
      ? null
      : {
          left: Math.max(0, to - from) / fps / Math.max(0.01, speed),
          onEnd: opts.onEnd,
        };
    return true;
  }

  endOverlay(): void {
    const g = this.overlayGroup;
    this.overlayEnd = null;
    if (!g) return;
    this.overlayToken++;
    this.clearOverlayGroup(g);
    this.reblendBase();
  }

  clipSeconds(clip: string): number {
    const g = this.clips.get(clip);
    if (!g) return 0;
    const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 60;
    return (g.to - g.from) / fps;
  }

  freeze(seconds: number): void {
    if (!this.current || this.base === 'death') return;
    // Incoming melee hit-stop must not delay an authoritative skill/mobility cue.
    if (this.oneShotActive === 'cast') return;
    this.frozen = Math.max(this.frozen, seconds);
    this.current.speedRatio = this.currentSpeed * 0.04;
  }

  anchor(name: Socket | 'weapon_tip'): TransformNode | null {
    if (name === 'weapon_tip') return this.gear.weaponTip() ?? this.anchor('hand_r');
    const bone = this.appearance.sockets[name];
    const node = bone ? this.nodesByName.get(bone) : undefined;
    return node instanceof TransformNode ? node : null;
  }

  setGear(gear: GearAppearances): void {
    this.gear.apply(gear);
  }

  update(dt: number): void {
    if (this.frozen > 0) {
      this.frozen -= dt;
      if (this.frozen <= 0 && this.current) this.current.speedRatio = this.currentSpeed;
    }
    const end = this.overlayEnd;
    if (end) {
      end.left -= dt;
      if (end.left <= 0) {
        this.overlayEnd = null;
        const token = this.overlayToken;
        end.onEnd?.();
        // Nothing followed it: hand the arms back to the base loop.
        if (token === this.overlayToken) this.endOverlay();
      }
    }
    this.gear.update(dt);
  }

  reset(): void {
    this.base = null;
    this.oneShotActive = null;
    this.frozen = 0;
    if (this.overlayGroup) this.clearOverlayGroup(this.overlayGroup);
    this.setBase('idle');
  }

  dispose(): void {
    this.firstFrameObserver?.remove();
    this.firstFrameObserver = null;
    this.upperYawObserver?.remove();
    this.upperYawObserver = null;
    this.gear.dispose();
    for (const g of this.allGroups) g.dispose();
    this.root.dispose();
  }

  private trackUpperYaw(g: AnimationGroup): void {
    const rotationOf = (bone: string) => {
      const node = this.nodesByName.get(bone);
      return g.targetedAnimations.find(
        (t) => t.target === node && t.animation.targetProperty === 'rotationQuaternion',
      )?.animation;
    };
    const root = rotationOf('root');
    const hips = rotationOf('hips');
    this.upperYaw = root || hips ? { group: g, root, hips } : null;
    if (this.upperYaw && !this.upperYawObserver)
      this.upperYawObserver = this.scene.onAfterAnimationsObservable.add(() => this.fixUpperYaw());
  }

  /** Runs after the scene's animations: twist the spine by the clip's missing root+hips yaw. */
  private fixUpperYaw(): void {
    const fix = this.upperYaw;
    const g = this.overlayGroup;
    if (!fix || !g || fix.group !== g) return;
    const spine = this.nodesByName.get('spine');
    const hips = this.nodesByName.get('hips');
    const root = this.nodesByName.get('root');
    if (!(spine instanceof TransformNode) || !(hips instanceof TransformNode)) return;
    const live = g.animatables.find((a) => !a.paused);
    if (!live || !spine.rotationQuaternion) return;
    const frame = live.masterFrame;
    const rootNow = root instanceof TransformNode ? root.rotationQuaternion : null;
    const clip = chainYaw(
      fix.root ? (fix.root.evaluate(frame) as Quaternion) : rootNow,
      fix.hips ? (fix.hips.evaluate(frame) as Quaternion) : hips.rotationQuaternion,
    );
    let delta = clip - chainYaw(rootNow, hips.rotationQuaternion);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) < 0.005) return;
    // World up in the hips' frame (the spine's parent space).
    const inv = hips.computeWorldMatrix(true).clone().invert();
    const axis = Vector3.TransformNormal(Vector3.Up(), inv).normalize();
    spine.rotationQuaternion = Quaternion.RotationAxis(axis, delta).multiply(
      spine.rotationQuaternion,
    );
  }

  private playOnly(role: AnimationRole, loop: boolean): void {
    if (role === 'death' && this.overlayGroup) this.clearOverlayGroup(this.overlayGroup);
    const g = this.groups.get(role);
    if (g) this.playGroup(g, loop);
    else
      for (const other of this.allGroups)
        if (other.isPlaying && other !== this.overlayGroup) other.stop();
  }

  private clearOverlayGroup(g: AnimationGroup): void {
    if (this.overlayGroup === g) {
      this.overlayGroup = null;
      this.overlayEnd = null;
      this.upperYaw = null;
    }
    g.stop(true);
    g.mask = null;
    g.playOrder = 0;
  }

  /**
   * Restarts the base clip at its current frame so its blending eases the
   * arms back from the overlay pose instead of snapping (D-033).
   */
  private reblendBase(): void {
    const g = this.current;
    if (!g?.isPlaying) return;
    const frame = g.getCurrentFrame();
    const loop = g.loopAnimation;
    g.stop(true);
    g.start(loop, this.currentSpeed, g.from, g.to);
    g.goToFrame(frame);
  }

  /**
   * One-shot clip, then back to the base loop. Only the latest play may end
   * the one-shot: AnimationGroup.stop() fires the end observable too, so a
   * chained swing stopping the previous clip used to cut itself to idle.
   */
  private playOneShot(g: AnimationGroup, role: OneShotRole, speed: number): void {
    this.oneShotActive = role;
    this.playGroup(g, false, speed);
    const token = this.playToken;
    g.onAnimationGroupEndObservable.addOnce(() => {
      if (token !== this.playToken || this.oneShotActive !== role) return;
      this.oneShotActive = null;
      const base = this.base ?? 'idle';
      this.playOnly(base, base !== 'death');
    });
  }

  cancelAction(): void {
    if (this.oneShotActive !== 'attack' && this.oneShotActive !== 'cast') return;
    this.oneShotActive = null;
    this.frozen = 0;
    const base = this.base ?? 'idle';
    this.playOnly(base, base !== 'death');
  }

  private playGroup(g: AnimationGroup, loop: boolean, speed = 1): void {
    const startedAt = performance.now();
    this.playToken++;
    this.firstFrameObserver?.remove();
    this.firstFrameObserver = null;
    // A clip asked for full-body stops being an upper-body overlay.
    if (g === this.overlayGroup) this.clearOverlayGroup(g);
    // skipOnAnimationEnd: stopping for a new clip is not the old clip ending.
    for (const other of this.allGroups)
      if (other !== g && other !== this.overlayGroup && other.isPlaying) other.stop(true);
    if (g.isPlaying) g.stop(true);
    this.frozen = 0;
    this.current = g;
    this.currentSpeed = speed;
    g.start(loop, speed, g.from, g.to);
    if (!loop) {
      const token = this.playToken;
      const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 60;
      // Babylon initializes an animatable's clock on its first render, which can
      // lose the event-to-render interval (especially on the first attack).
      // Align once before that render, then let normal playback/hit-stop advance it.
      this.firstFrameObserver = this.scene.onBeforeAnimationsObservable.addOnce(() => {
        this.firstFrameObserver = null;
        if (token !== this.playToken || this.current !== g || !g.isPlaying) return;
        const elapsed = (performance.now() - startedAt) / 1000;
        g.goToFrame(Math.min(g.to, g.from + elapsed * speed * fps));
      });
    }
  }
}

const FORWARD = new Vector3(0, 0, 1);
const tmpDir = new Vector3();

/** Heading of hips-forward after the hips and root rotations (radians, atan2(x, z)). */
function chainYaw(root: Quaternion | null, hips: Quaternion | null): number {
  tmpDir.copyFrom(FORWARD);
  if (hips) tmpDir.applyRotationQuaternionInPlace(hips);
  if (root) tmpDir.applyRotationQuaternionInPlace(root);
  return Math.atan2(tmpDir.x, tmpDir.z);
}

/** instantiateModelsToScene names clones through our name function; recover the original name. */
function stripPrefix(nodeName: string, prefix: string): string {
  return nodeName.startsWith(`${prefix}_`) ? nodeName.slice(prefix.length + 1) : nodeName;
}
