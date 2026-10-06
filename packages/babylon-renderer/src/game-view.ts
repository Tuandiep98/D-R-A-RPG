import { AssetLibrary, type LoadProgress } from '@rpg/asset-runtime';
import {
  type AppearanceDef,
  type ContentBundle,
  type EquipSlot,
  type MonsterTier,
  realmLadder,
} from '@rpg/game-data';
import type {
  ChatMessage,
  EntityId,
  EntitySnapshot,
  Intent,
  JoinInfo,
  NoticeCode,
  PlayerState,
  SimEvent,
} from '@rpg/game-protocol';
import {
  type GameAction,
  GamepadAdapter,
  InputManager,
  MouseKeyboardAdapter,
  TouchAdapter,
} from '@rpg/input';
import type { SimHost } from '@rpg/sim-host';
import {
  type AbstractEngine,
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  Matrix,
  Scene,
  SceneInstrumentation,
  ShadowGenerator,
  Vector3,
} from './babylon';
import { CameraRig } from './camera-rig';
import { DamageTextPool, MoveMarker, SelectionRing } from './effects';
import { createEngine, type EngineKind } from './engine';
import { EntityView, EntityViewPool, type PickMetadata } from './entity-view';
import { EnvironmentView } from './environment';
import { QualityManager, type QualityMode, type QualityPreset } from './quality';
import { type InterpolatedEntity, SnapshotBuffer } from './snapshot-buffer';
import { ImpactPool, LootBeams, ProjectilePool, RARITY_COLORS, TelegraphPool } from './vfx';
import type { GearAppearances } from './visuals';

const TICK_RATE = 20;
const UI_INTERVAL_MS = 100;
/** Auto-target and interaction search radii (tech plan §25 "nearest target"). */
const AUTO_TARGET_RANGE = 14;
const INTERACT_SEARCH = 6;

export interface UnitFrame {
  id: EntityId;
  kind: EntitySnapshot['kind'];
  name: string;
  /** Realm rank and display name ('' for loot/portals/NPCs). No character level. */
  realm: number;
  realmName: string;
  tier: MonsterTier | null;
  hp: number;
  maxHp: number;
  alive: boolean;
  cast: { name: string; progress: number } | null;
}

export interface SkillSlot {
  skillId: string;
  name: string;
  icon: string;
  description: string;
  cooldown: number;
  remaining: number;
  mpCost: number;
  usable: boolean;
}

export interface ItemView {
  instanceId: string;
  itemId: string;
  name: string;
  icon: string;
  rarity: string;
  rarityColor: string;
  kind: 'equipment' | 'consumable' | 'material';
  slot: EquipSlot | null;
  /** Required realm name, null when any realm may use it. */
  realmName: string | null;
  count: number;
  equipped: boolean;
  description: string;
  bonus: string;
  enhance: number;
}

export interface UiState {
  mapName: string;
  zoneName: string | null;
  player:
    | (UnitFrame & {
        mp: number;
        maxMp: number;
        cultivation: CultivationView;
        gold: number;
        inSafeZone: boolean;
        stats: PlayerState['stats'];
      })
    | null;
  target: UnitFrame | null;
  boss: UnitFrame | null;
  skills: SkillSlot[];
  potion: {
    instanceId: string;
    icon: string;
    count: number;
    remaining: number;
  } | null;
  inventory: ItemView[];
  inventoryCapacity: number;
  equipment: Partial<Record<EquipSlot, ItemView>>;
  interact: { label: string } | null;
  quests: QuestView[];
  questsDone: string[];
  party: PlayerState['party'];
}

export interface CultivationView {
  realmId: string;
  realmName: string;
  mechName: string;
  nextRealmName: string | null;
  nodes: string[];
  meridianLoad: number;
  meridianCapacity: number;
  bodyLoad: number;
  bodyCapacity: number;
  /** Server-computed; 0 when no breakthrough exists from this realm. */
  breakthroughChance: number;
  /** Seconds of breakthrough backlash left. */
  backlash: number;
}

export interface QuestView {
  questId: string;
  name: string;
  status: 'active' | 'ready' | 'done';
  objectives: { text: string; current: number; required: number }[];
}

export interface Notice {
  text: string;
  tone: 'info' | 'good' | 'warn' | 'boss';
  color?: string;
}

export interface DebugStats {
  engine: EngineKind;
  fps: number;
  tick: number;
  entities: number;
  drawCalls: number;
  activeMeshes: number;
  quality: string;
  chunks: string;
  envInstances: number;
  assets: LoadProgress;
}

export interface GameViewOptions {
  canvas: HTMLCanvasElement;
  host: SimHost;
  content: ContentBundle;
  manifestUrl: string;
  forceWebGL?: boolean;
  quality?: QualityMode;
  onUi?: (ui: UiState) => void;
  onNotice?: (notice: Notice) => void;
  onDebug?: (stats: DebugStats) => void;
  onAction?: (action: GameAction) => void;
  onNpcOpen?: (npc: { npcEntityId: EntityId; npcId: string }) => void;
  onChat?: (message: ChatMessage) => void;
  onPartyInvite?: (invite: { fromId: EntityId; fromName: string }) => void;
  onToggleDebug?: (scene: Scene) => void;
}

const NOTICE_TEXT: Record<NoticeCode, string> = {
  out_of_range: 'Mục tiêu ở quá xa',
  cooldown: 'Chưa hồi chiêu',
  no_mp: 'Không đủ nội lực',
  no_target: 'Chưa chọn mục tiêu',
  inventory_full: 'Túi đồ đã đầy',
  realm_too_low: 'Cảnh giới chưa đủ',
  not_owner: 'Vật phẩm thuộc về người khác',
  invalid: 'Không thể thực hiện',
  dead: 'Bạn đã gục ngã',
  safe_zone: 'Không thể chiến đấu trong vùng an toàn',
  too_far: 'Hãy lại gần hơn',
  not_enough_gold: 'Không đủ vàng',
  missing_materials: 'Thiếu nguyên liệu',
  quest_unavailable: 'Chưa thể nhận nhiệm vụ này',
  quest_incomplete: 'Nhiệm vụ chưa hoàn thành',
  max_level: 'Đã đạt cấp tối đa',
  not_sellable: 'Không thể bán vật phẩm này',
  party_full: 'Nhóm đã đủ người',
  already_in_party: 'Người này đã có nhóm',
  no_invite: 'Lời mời đã hết hạn',
  capacity_full: 'Kinh mạch / Body Load không đủ chỗ',
  requirements_unmet: 'Chưa đủ điều kiện',
  max_realm: 'Chưa thể đột phá cảnh giới tiếp theo',
  not_in_safe_zone: 'Chỉ đột phá được trong vùng an toàn',
  backlash: 'Đang bị phản phệ, chưa thể đột phá lại',
};

/**
 * Client-side game: renders host snapshots, turns input into intents.
 * Holds no gameplay authority — every outcome comes from the SimHost.
 */
export class GameView {
  private buffer = new SnapshotBuffer(100);
  private readonly views = new Map<EntityId, EntityView>();
  private readonly gearKeys = new Map<EntityId, string>();
  private readonly sampled = new Map<EntityId, InterpolatedEntity>();
  private readonly unsubscribe: (() => void)[] = [];
  private readonly gamepad = new GamepadAdapter();
  private selectedId: EntityId | null = null;
  private playerState: PlayerState | null = null;
  private lastUi = '';
  private lastUiAt = 0;
  private time = 0;
  private cameraSnapped = false;
  private environment: EnvironmentView | null = null;
  private join: JoinInfo;
  private loadingMap: Promise<void> | null = null;
  private assetProgress: LoadProgress = {
    loadedBytes: 0,
    totalBytes: 0,
    pending: 0,
  };
  /** Presentation delayed to match animation events (hit frames). */
  private readonly delayed: { at: number; run: () => void }[] = [];
  private readonly quality: QualityManager;
  private preset: QualityPreset;

  private constructor(
    private readonly opts: GameViewOptions,
    private readonly engine: AbstractEngine,
    private readonly engineKind: EngineKind,
    readonly scene: Scene,
    private readonly rig: CameraRig,
    private readonly sun: DirectionalLight,
    private readonly shadows: ShadowGenerator,
    private readonly assets: AssetLibrary,
    private readonly pool: EntityViewPool,
    private readonly input: InputManager,
    private readonly selection: SelectionRing,
    private readonly marker: MoveMarker,
    private readonly damage: DamageTextPool,
    private readonly telegraphs: TelegraphPool,
    private readonly impacts: ImpactPool,
    private readonly projectiles: ProjectilePool,
    private readonly lootBeams: LootBeams,
    private readonly instrumentation: SceneInstrumentation,
    join: JoinInfo,
  ) {
    this.join = join;
    this.preset = { level: 'high' } as QualityPreset;
    this.quality = new QualityManager(opts.quality ?? 'auto', (p) => this.applyQuality(p), 'high');
  }

  static async create(opts: GameViewOptions): Promise<GameView> {
    const { engine, kind } = await createEngine(opts.canvas, {
      forceWebGL: opts.forceWebGL,
    });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.55, 0.72, 0.85, 1);
    scene.ambientColor = new Color3(0.3, 0.3, 0.3);
    scene.skipPointerMovePicking = true;
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = new Color3(0.55, 0.72, 0.85);
    scene.fogStart = 45;
    scene.fogEnd = 95;

    const rig = new CameraRig(scene);
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.55;
    hemi.groundColor = new Color3(0.35, 0.33, 0.3);
    const sun = new DirectionalLight('sun', new Vector3(-0.45, -1, 0.35), scene);
    sun.position = new Vector3(20, 40, -20);
    sun.intensity = 1.1;
    const shadows = new ShadowGenerator(1024, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.bias = 0.002;

    const assets = new AssetLibrary(scene);
    await assets.loadManifest(opts.manifestUrl);

    const join = await opts.host.connect();
    const pool = new EntityViewPool(
      (appearance) => new EntityView(scene, appearance, assets, shadows),
    );
    const input = new InputManager(opts.canvas)
      .use(new MouseKeyboardAdapter())
      .use(new TouchAdapter());
    const instrumentation = new SceneInstrumentation(scene);
    instrumentation.captureFrameTime = false;

    const view = new GameView(
      opts,
      engine,
      kind,
      scene,
      rig,
      sun,
      shadows,
      assets,
      pool,
      input,
      new SelectionRing(scene),
      new MoveMarker(scene),
      new DamageTextPool(scene),
      new TelegraphPool(scene),
      new ImpactPool(scene),
      new ProjectilePool(scene),
      new LootBeams(scene),
      instrumentation,
      join,
    );
    input.use(view.gamepad);
    await view.loadMap(join.mapId);
    view.start();
    return view;
  }

  // ---- Commands used by the HUD (they only ever send intents) ----------

  castSkill(index: number): void {
    const slot = this.playerState?.skills[index];
    if (!slot) return;
    const skill = this.opts.content.skills.get(slot.skillId);
    if (!skill) return;
    if (skill.targeting === 'self') {
      this.opts.host.sendIntent({ type: 'CAST_SKILL', skillId: skill.id });
      return;
    }
    const target = this.currentOrNearestHostile();
    if (!target) {
      this.opts.onNotice?.({ text: NOTICE_TEXT.no_target, tone: 'warn' });
      return;
    }
    this.select(target.state.id);
    this.opts.host.sendIntent(
      skill.targeting === 'target'
        ? { type: 'CAST_SKILL', skillId: skill.id, targetId: target.state.id }
        : {
            type: 'CAST_SKILL',
            skillId: skill.id,
            targetId: target.state.id,
            point: { x: target.x, z: target.z },
          },
    );
  }

  /** Generic intent passthrough for HUD panels (NPC dialogs). Validated by the host. */
  send(intent: Intent): void {
    this.opts.host.sendIntent(intent);
  }

  sendChat(text: string): void {
    this.opts.host.sendChat(text);
  }

  useItem(instanceId: string): void {
    this.opts.host.sendIntent({ type: 'USE_ITEM', instanceId });
  }

  usePotion(): void {
    const potion = this.bestPotion();
    if (potion) this.useItem(potion.instanceId);
  }

  equip(instanceId: string): void {
    this.opts.host.sendIntent({ type: 'EQUIP', instanceId });
  }

  unequip(slot: EquipSlot): void {
    this.opts.host.sendIntent({ type: 'UNEQUIP', slot });
  }

  interact(): void {
    const near = this.nearestInteractable();
    if (!near) return;
    this.opts.host.sendIntent(
      near.state.kind === 'loot'
        ? { type: 'PICKUP', lootId: near.state.id }
        : { type: 'INTERACT', entityId: near.state.id },
    );
  }

  targetNext(): void {
    const me = this.sampled.get(this.join.playerId);
    if (!me) return;
    const hostiles = [...this.sampled.values()]
      .filter((e) => e.state.kind === 'monster' && e.state.action !== 'dead')
      .map((e) => ({ e, d: Math.hypot(e.x - me.x, e.z - me.z) }))
      .filter((h) => h.d <= 25)
      .sort((a, b) => a.d - b.d);
    if (hostiles.length === 0) return;
    const idx = hostiles.findIndex((h) => h.e.state.id === this.selectedId);
    const next = hostiles[(idx + 1) % hostiles.length];
    if (next) this.select(next.e.state.id);
  }

  setQuality(mode: QualityMode): void {
    this.quality.setMode(mode);
  }

  get qualityMode(): QualityMode {
    return this.quality.mode;
  }

  /** Dev/test helper: entity ids and canvas-space positions (CSS px) for automation. */
  debugEntities(): {
    id: EntityId;
    kind: string;
    defId: string;
    action: string;
    hp: number;
    wx: number;
    wz: number;
    x: number;
    y: number;
  }[] {
    const camera = this.rig.camera;
    const viewport = camera.viewport.toGlobal(
      this.engine.getRenderWidth(),
      this.engine.getRenderHeight(),
    );
    const scaling = this.engine.getHardwareScalingLevel();
    const out = [];
    for (const [id, e] of this.sampled) {
      const view = this.views.get(id);
      if (!view) continue;
      const world = view.root.position.add(new Vector3(0, view.height / 2, 0));
      const p = Vector3.Project(
        world,
        Matrix.IdentityReadOnly,
        this.scene.getTransformMatrix(),
        viewport,
      );
      out.push({
        id,
        kind: e.state.kind,
        defId: e.state.defId,
        action: e.state.action,
        hp: e.state.hp,
        wx: e.x,
        wz: e.z,
        x: p.x * scaling,
        y: p.y * scaling,
      });
    }
    return out;
  }

  dispose(): void {
    this.engine.stopRenderLoop();
    for (const off of this.unsubscribe) off();
    this.input.dispose();
    this.opts.host.dispose();
    this.environment?.dispose();
    for (const v of this.views.values()) v.dispose();
    this.pool.dispose();
    this.damage.dispose();
    this.lootBeams.dispose();
    void this.assets.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  // ---- Lifecycle --------------------------------------------------------

  private start(): void {
    const { host } = this.opts;
    this.unsubscribe.push(
      host.onSnapshot((s) => this.buffer.push(s, performance.now())),
      host.onEvents((events) => this.handleEvents(events)),
      host.onPlayerState((s) => {
        this.playerState = s;
      }),
      host.onJoin((j) => this.handleJoin(j)),
      host.onChat((m) => this.opts.onChat?.(m)),
      this.assets.onProgress((p) => {
        this.assetProgress = p;
      }),
      this.input.on((a) => this.handleAction(a)),
    );
    const onResize = () => this.engine.resize();
    window.addEventListener('resize', onResize);
    this.unsubscribe.push(() => window.removeEventListener('resize', onResize));
    this.engine.runRenderLoop(() => this.frame());
  }

  private handleJoin(join: JoinInfo): void {
    const mapChanged = join.mapId !== this.join.mapId;
    this.join = join;
    if (!mapChanged) return;
    for (const [id, view] of this.views) {
      this.lootBeams.detach(id);
      this.pool.release(view);
    }
    this.views.clear();
    this.gearKeys.clear();
    this.select(null);
    this.buffer = new SnapshotBuffer(100);
    this.cameraSnapped = false;
    this.loadingMap = this.loadMap(join.mapId).finally(() => {
      this.loadingMap = null;
    });
    const map = this.opts.content.maps.get(join.mapId);
    if (map) this.opts.onNotice?.({ text: map.name, tone: 'boss' });
  }

  private async loadMap(mapId: string): Promise<void> {
    const map = this.opts.content.maps.get(mapId);
    if (!map) throw new Error(`unknown map ${mapId}`);
    this.environment?.dispose();
    this.environment = null;
    const env = await EnvironmentView.build(this.scene, map, this.opts.content, this.assets);
    if (this.join.mapId !== mapId) {
      env.dispose();
      return;
    }
    this.environment = env;
    // Characters likely to appear soon: warm them up so they don't pop in as placeholders.
    void this.assets.preload(
      [...this.opts.content.appearances.values()]
        .filter((a) => a.kind === 'character' || a.kind === 'monster')
        .map((a) => a.modelAssetId ?? ''),
    );
  }

  private frame(): void {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.1);
    this.time += dt;
    const now = performance.now();
    this.gamepad.poll(dt);
    if (this.delayed.length > 0) {
      for (let i = this.delayed.length - 1; i >= 0; i--) {
        const d = this.delayed[i];
        if (d && d.at <= now) {
          this.delayed.splice(i, 1);
          d.run();
        }
      }
    }
    this.quality.sample(this.engine.getFps(), dt);
    this.buffer.sample(now, this.sampled);

    for (const [id, view] of this.views) {
      if (!this.sampled.has(id)) {
        this.lootBeams.detach(id);
        this.pool.release(view);
        this.views.delete(id);
        this.gearKeys.delete(id);
        if (this.selectedId === id) this.select(null);
      }
    }
    for (const [id, e] of this.sampled) {
      let view = this.views.get(id);
      if (!view) {
        const appearance = this.appearanceFor(e.state);
        if (!appearance) continue;
        view = this.pool.acquire(appearance, id);
        view.setCastShadows(this.shouldCastShadow(e.state));
        this.views.set(id, view);
        if (e.state.kind === 'loot') {
          const rarity = this.opts.content.items.get(e.state.defId)?.rarity ?? 'common';
          this.lootBeams.attach(id, view.root, rarity);
        }
      }
      view.setTransform(e.x, e.z, e.yaw);
      view.setAction(e.state.action);
      view.setHp(e.state.hp, e.state.maxHp);
      if (e.state.gear) {
        const key = JSON.stringify(e.state.gear);
        if (this.gearKeys.get(id) !== key) {
          this.gearKeys.set(id, key);
          view.setGear(this.gearAppearances(e.state.gear));
        }
      }
      view.update(dt);
    }

    const me = this.sampled.get(this.join.playerId);
    if (me) {
      this.rig.follow(me.x, me.z, dt, !this.cameraSnapped);
      this.cameraSnapped = true;
      if (this.environment && !this.loadingMap) {
        this.environment.setActiveChunks(
          this.environment.chunksAround(me.x, me.z, this.preset.chunkRadius),
        );
        this.environment.updateLod(me.x, me.z);
        this.environment.updateOcclusion(this.rig.camera.position, new Vector3(me.x, 1.1, me.z));
      }
    }
    this.selection.update(this.time);
    this.marker.update(dt);
    this.damage.update(dt);
    this.telegraphs.update(dt);
    this.impacts.update(dt);
    this.projectiles.update(dt);
    this.scene.render();
    this.publish(now);
  }

  private applyQuality(p: QualityPreset): void {
    this.preset = p;
    const dpr = Math.min(window.devicePixelRatio || 1, p.maxPixelRatio);
    this.engine.setHardwareScalingLevel(1 / (dpr * p.resolutionScale));
    this.sun.shadowEnabled = p.shadows !== 'off';
    this.shadows.getShadowMap()?.resize(p.shadowMapSize);
    this.impacts.capacity = p.vfxCap;
    this.projectiles.capacity = p.vfxCap;
    for (const [id, view] of this.views) {
      const e = this.sampled.get(id);
      if (e) view.setCastShadows(this.shouldCastShadow(e.state));
    }
  }

  private shouldCastShadow(e: EntitySnapshot): boolean {
    if (this.preset.shadows === 'off') return false;
    if (e.kind === 'loot' || e.kind === 'portal') return false;
    return this.preset.shadows === 'all' || e.id === this.join.playerId;
  }

  // ---- Input ------------------------------------------------------------

  private handleAction(action: GameAction): void {
    this.opts.onAction?.(action);
    switch (action.type) {
      case 'CAMERA_ROTATE':
        this.rig.rotate(action.dx, action.dy);
        break;
      case 'ZOOM':
        this.rig.zoom(action.delta);
        break;
      case 'STOP':
        this.opts.host.sendIntent({ type: 'STOP' });
        break;
      case 'SKILL':
        this.castSkill(action.index);
        break;
      case 'INTERACT':
        this.interact();
        break;
      case 'TARGET_NEXT':
        this.targetNext();
        break;
      case 'USE_POTION':
        this.usePotion();
        break;
      case 'TOGGLE_DEBUG':
        this.opts.onToggleDebug?.(this.scene);
        break;
      case 'SELECT':
        this.handleSelect(action.x, action.y);
        break;
      case 'TOGGLE_PANEL':
        break;
    }
  }

  private handleSelect(x: number, y: number): void {
    const entityHit = this.scene.pick(
      x,
      y,
      (m) => !!(m.metadata as PickMetadata | null)?.entityId && m.isPickable && m.isEnabled(),
    );
    const hitId = (entityHit?.pickedMesh?.metadata as PickMetadata | null)?.entityId;
    if (hitId && hitId !== this.join.playerId) {
      const target = this.sampled.get(hitId);
      switch (target?.state.kind) {
        case 'monster':
          this.select(hitId);
          this.opts.host.sendIntent({ type: 'ATTACK_TARGET', targetId: hitId });
          return;
        case 'loot':
          this.opts.host.sendIntent({ type: 'PICKUP', lootId: hitId });
          return;
        case 'portal':
        case 'npc':
          this.opts.host.sendIntent({ type: 'INTERACT', entityId: hitId });
          return;
        default:
          this.select(hitId);
          return;
      }
    }
    const groundHit = this.scene.pick(
      x,
      y,
      (m) => (m.metadata as { ground?: boolean } | null)?.ground === true,
    );
    const p = groundHit?.pickedPoint;
    if (p) {
      this.marker.show(p.x, p.z);
      this.opts.host.sendIntent({
        type: 'MOVE_TO',
        target: { x: p.x, z: p.z },
      });
    }
  }

  private select(id: EntityId | null): void {
    this.selectedId = id;
    const view = id !== null ? this.views.get(id) : undefined;
    this.selection.attach(view?.root ?? null, view?.radius);
  }

  private currentOrNearestHostile(): InterpolatedEntity | null {
    const sel = this.selectedId !== null ? this.sampled.get(this.selectedId) : undefined;
    if (sel?.state.kind === 'monster' && sel.state.action !== 'dead') return sel;
    const me = this.sampled.get(this.join.playerId);
    if (!me) return null;
    let best: InterpolatedEntity | null = null;
    let bestD = AUTO_TARGET_RANGE;
    for (const e of this.sampled.values()) {
      if (e.state.kind !== 'monster' || e.state.action === 'dead') continue;
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  private nearestInteractable(): InterpolatedEntity | null {
    const me = this.sampled.get(this.join.playerId);
    if (!me) return null;
    let best: InterpolatedEntity | null = null;
    let bestD = INTERACT_SEARCH;
    for (const e of this.sampled.values()) {
      if (e.state.kind !== 'loot' && e.state.kind !== 'portal' && e.state.kind !== 'npc') continue;
      if (
        e.state.kind === 'loot' &&
        e.state.ownerId !== null &&
        e.state.ownerId !== this.join.playerId
      )
        continue;
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  private bestPotion() {
    const inv = this.playerState?.inventory ?? [];
    return inv
      .map((i) => ({ i, def: this.opts.content.items.get(i.itemId) }))
      .filter((x) => x.def?.kind === 'consumable')
      .sort((a, b) => (a.def?.heal ?? 0) - (b.def?.heal ?? 0))[0]?.i;
  }

  // ---- Events -> presentation -----------------------------------------

  private handleEvents(events: SimEvent[]): void {
    const tick = this.buffer.latest?.tick ?? 0;
    const mine = (id: EntityId) => id === this.join.playerId;
    for (const ev of events) {
      switch (ev.type) {
        case 'ATTACK':
          this.views.get(ev.sourceId)?.play('attack');
          break;
        case 'DAMAGE': {
          const view = this.views.get(ev.targetId);
          if (!view) break;
          // Auto-attacks: show the number on the clip's hit frame (appearance.hitDelay).
          const hitDelay = ev.skillId ? 0 : (this.views.get(ev.sourceId)?.appearance.hitDelay ?? 0);
          const delayedReplay = ev.skillId === '__delayed';
          if (hitDelay > 0) {
            this.delayed.push({
              at: performance.now() + hitDelay * 1000,
              run: () => this.handleEvents([{ ...ev, skillId: '__delayed' }]),
            });
            break;
          }
          view.play('hit');
          const color = mine(ev.targetId)
            ? '#ff5a4f'
            : ev.crit
              ? '#ffd23f'
              : ev.skillId && !delayedReplay
                ? '#8fe3ff'
                : '#ffffff';
          this.floatText(view, ev.crit ? `${ev.amount}!` : `${ev.amount}`, color);
          break;
        }
        case 'HEAL': {
          const view = this.views.get(ev.targetId);
          if (view && ev.amount > 0) this.floatText(view, `+${ev.amount}`, '#6dff8a');
          break;
        }
        case 'CAST_START': {
          this.views.get(ev.sourceId)?.play('cast');
          if (ev.telegraph && ev.point && ev.radius > 0) {
            const seconds = Math.max(0.1, (ev.endTick - tick) / TICK_RATE);
            this.telegraphs.show(`${ev.sourceId}`, ev.point.x, ev.point.z, ev.radius, seconds);
          }
          break;
        }
        case 'SKILL_IMPACT': {
          this.telegraphs.clear(`${ev.sourceId}`);
          const skill = this.opts.content.skills.get(ev.skillId);
          const vfx = skill?.vfx ?? 'slash';
          const src = this.views.get(ev.sourceId);
          const tgt = ev.targetId !== null ? this.views.get(ev.targetId) : undefined;
          if (vfx === 'projectile' && src && tgt) {
            this.projectiles.fire(
              src.root.position.add(new Vector3(0, src.height * 0.6, 0)),
              tgt.root.position.add(new Vector3(0, tgt.height * 0.5, 0)),
              vfx,
            );
          } else if (ev.radius > 0) this.impacts.spawn(ev.point.x, ev.point.z, ev.radius, vfx);
          else if (tgt) this.impacts.spawn(tgt.root.position.x, tgt.root.position.z, 0.8, vfx);
          else if (src && vfx === 'heal')
            this.impacts.spawn(src.root.position.x, src.root.position.z, 1.2, vfx);
          break;
        }
        case 'DEATH':
          if (ev.id === this.selectedId) this.select(null);
          this.telegraphs.clear(`${ev.id}`);
          break;
        case 'BREAKTHROUGH': {
          const view = this.views.get(ev.id);
          const realm = realmLadder(this.opts.content)[ev.realm];
          if (view) {
            this.floatText(
              view,
              ev.success ? `${realm?.name ?? ''}!` : 'Phản phệ!',
              ev.success ? '#ffd23f' : '#ff6b6b',
            );
            this.impacts.spawn(
              view.root.position.x,
              view.root.position.z,
              ev.success ? 4 : 1.5,
              'level',
            );
          }
          if (mine(ev.id))
            this.opts.onNotice?.(
              ev.success
                ? {
                    text: `Đột phá thành công — ${realm?.name ?? ''}!`,
                    tone: 'boss',
                  }
                : {
                    text: 'Đột phá thất bại — phản phệ, công lực suy giảm tạm thời',
                    tone: 'warn',
                  },
            );
          break;
        }
        case 'NODE_OPENED':
          if (mine(ev.ownerId)) {
            const node = this.opts.content.cultivation.get(ev.nodeId);
            this.opts.onNotice?.({
              text: `Khai mở: ${node?.name ?? ev.nodeId}`,
              tone: 'good',
            });
          }
          break;
        case 'ITEM_GAINED':
          if (mine(ev.ownerId)) {
            const item = this.opts.content.items.get(ev.itemId);
            this.opts.onNotice?.({
              text: `Nhận ${item?.name ?? ev.itemId}${ev.count > 1 ? ` ×${ev.count}` : ''}`,
              tone: 'good',
              color: RARITY_COLORS[item?.rarity ?? 'common'],
            });
          }
          break;
        case 'GOLD':
          if (mine(ev.ownerId))
            this.opts.onNotice?.({
              text: `+${ev.amount} vàng`,
              tone: 'good',
              color: '#ffd23f',
            });
          break;
        case 'NOTICE':
          if (mine(ev.ownerId)) this.opts.onNotice?.({ text: NOTICE_TEXT[ev.code], tone: 'warn' });
          break;
        case 'PARTY_INVITE':
          if (mine(ev.ownerId))
            this.opts.onPartyInvite?.({
              fromId: ev.fromId,
              fromName: ev.fromName,
            });
          break;
        case 'NPC_OPEN':
          if (mine(ev.ownerId))
            this.opts.onNpcOpen?.({
              npcEntityId: ev.npcEntityId,
              npcId: ev.npcId,
            });
          break;
        case 'QUEST':
          if (mine(ev.ownerId)) {
            const q = this.opts.content.quests.get(ev.questId);
            const text = {
              active: 'Nhận nhiệm vụ',
              ready: 'Hoàn thành mục tiêu',
              done: 'Đã trả nhiệm vụ',
            }[ev.status];
            this.opts.onNotice?.({
              text: `${text}: ${q?.name ?? ev.questId}`,
              tone: ev.status === 'active' ? 'info' : 'good',
            });
          }
          break;
        case 'UPGRADE_RESULT':
          if (mine(ev.ownerId)) {
            this.opts.onNotice?.(
              ev.success
                ? {
                    text: `Cường hoá thành công: +${ev.level}`,
                    tone: 'good',
                    color: '#ffd23f',
                  }
                : {
                    text: `Cường hoá thất bại (giữ +${ev.level})`,
                    tone: 'warn',
                  },
            );
          }
          break;
        case 'PHASE': {
          const e = this.sampled.get(ev.id);
          const def = e ? this.opts.content.monsters.get(e.state.defId) : undefined;
          this.opts.onNotice?.({
            text: `${def?.name ?? 'Boss'} — ${ev.name || `Giai đoạn ${ev.phase + 1}`}`,
            tone: 'boss',
          });
          break;
        }
        default:
          break;
      }
    }
  }

  private floatText(view: EntityView, text: string, color: string): void {
    const pos = view.root.position.clone();
    pos.y += view.height + 0.3;
    this.damage.spawn(pos, text, color);
  }

  // ---- Lookups ----------------------------------------------------------

  private appearanceFor(e: EntitySnapshot): AppearanceDef | undefined {
    const c = this.opts.content;
    switch (e.kind) {
      case 'player': {
        const def = c.characters.get(e.defId);
        return def ? c.appearances.get(def.appearanceId) : undefined;
      }
      case 'monster': {
        const def = c.monsters.get(e.defId);
        return def ? c.appearances.get(def.appearanceId) : undefined;
      }
      case 'loot':
        return c.appearances.get('loot_bag');
      case 'portal':
        return c.appearances.get('portal_gate');
      case 'npc': {
        const def = c.npcs.get(e.defId);
        return def ? c.appearances.get(def.appearanceId) : undefined;
      }
    }
  }

  private gearAppearances(gear: Partial<Record<EquipSlot, string>>): GearAppearances {
    const out: GearAppearances = {};
    for (const [slot, itemId] of Object.entries(gear)) {
      const item = this.opts.content.items.get(itemId);
      const app = item?.appearanceId
        ? this.opts.content.appearances.get(item.appearanceId)
        : undefined;
      if (app) out[slot as EquipSlot] = app;
    }
    return out;
  }

  private unitFrame(id: EntityId | null, tick: number): UnitFrame | null {
    if (id === null) return null;
    const e = this.buffer.latest?.entities.find((x) => x.id === id);
    if (!e) return null;
    const c = this.opts.content;
    const monster = e.kind === 'monster' ? c.monsters.get(e.defId) : undefined;
    let name: string;
    if (e.kind === 'player') name = e.name ?? c.characters.get(e.defId)?.name ?? e.defId;
    else if (e.kind === 'loot') name = c.items.get(e.defId)?.name ?? e.defId;
    else if (e.kind === 'npc') name = c.npcs.get(e.defId)?.name ?? e.defId;
    else if (e.kind === 'portal')
      name = c.maps.get(this.join.mapId)?.portals.find((p) => p.id === e.defId)?.name ?? 'Cổng';
    else name = monster?.name ?? e.defId;
    const cast = e.cast
      ? {
          name: c.skills.get(e.cast.skillId)?.name ?? '',
          progress:
            e.cast.endTick > e.cast.startTick
              ? Math.min(
                  1,
                  Math.max(0, (tick - e.cast.startTick) / (e.cast.endTick - e.cast.startTick)),
                )
              : 1,
        }
      : null;
    return {
      id,
      kind: e.kind,
      name,
      realm: e.realm,
      realmName:
        e.kind === 'player' || e.kind === 'monster' ? (realmLadder(c)[e.realm]?.name ?? '') : '',
      tier: monster?.tier ?? null,
      hp: e.hp,
      maxHp: e.maxHp,
      alive: e.action !== 'dead',
      cast,
    };
  }

  private itemView(
    instanceId: string,
    itemId: string,
    count: number,
    equipped: boolean,
    enhance = 0,
  ): ItemView {
    const def = this.opts.content.items.get(itemId);
    const b = def?.bonus;
    const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
    const parts = b
      ? [
          b.attack && `Công ${sign(b.attack)}`,
          b.defense && `Thủ ${sign(b.defense)}`,
          b.hp && `HP ${sign(b.hp)}`,
          b.mp && `MP ${sign(b.mp)}`,
          b.critChance && `Bạo kích ${(b.critChance * 100).toFixed(0)}%`,
          b.speed && `Tốc độ ${sign(b.speed)}`,
        ].filter(Boolean)
      : def?.heal
        ? [`Hồi ${(def.heal * 100).toFixed(0)}% HP`]
        : [];
    const rarity = def?.rarity ?? 'common';
    return {
      instanceId,
      itemId,
      name: def?.name ?? itemId,
      icon: def?.icon ?? '◆',
      rarity,
      rarityColor: RARITY_COLORS[rarity] ?? '#fff',
      kind: def?.kind ?? 'material',
      slot: (def?.slot as EquipSlot | undefined) ?? null,
      realmName: def?.realm ? (this.opts.content.realms.get(def.realm)?.name ?? def.realm) : null,
      count,
      equipped,
      description: def?.description ?? '',
      bonus: parts.join(' · '),
      enhance,
    };
  }

  private cultivationView(ps: PlayerState, tick: number): CultivationView {
    const ladder = realmLadder(this.opts.content);
    const rank = Math.max(
      0,
      ladder.findIndex((r) => r.id === ps.realm),
    );
    const realm = ladder[rank];
    const next = ladder[rank + 1];
    return {
      realmId: ps.realm,
      realmName: realm?.name ?? ps.realm,
      mechName: realm?.mechName ?? '',
      nextRealmName: next?.breakthrough ? next.name : null,
      nodes: ps.nodes,
      meridianLoad: ps.meridianLoad,
      meridianCapacity: realm?.meridianCapacity ?? 0,
      bodyLoad: ps.bodyLoad,
      bodyCapacity: realm?.bodyLoad ?? 0,
      breakthroughChance: ps.breakthroughChance,
      backlash: Math.max(0, (ps.backlashUntilTick - tick) / TICK_RATE),
    };
  }

  /** UI and debug overlays update at 10 Hz, never per frame (CLAUDE.md rule 7). */
  private publish(now: number): void {
    if (now - this.lastUiAt < UI_INTERVAL_MS) return;
    this.lastUiAt = now;
    const tick = this.buffer.latest?.tick ?? 0;
    const c = this.opts.content;
    const ps = this.playerState;
    const map = c.maps.get(this.join.mapId);
    const meFrame = this.unitFrame(this.join.playerId, tick);
    const me = this.sampled.get(this.join.playerId);
    const zone =
      me && map
        ? (map.zones.find((z) => Math.hypot(me.x - z.center.x, me.z - z.center.z) <= z.radius)
            ?.name ?? null)
        : null;

    const equippedIds = new Set(Object.values(ps?.equipment ?? {}));
    const inventory = (ps?.inventory ?? []).map((i) =>
      this.itemView(i.instanceId, i.itemId, i.count, equippedIds.has(i.instanceId), i.enhance ?? 0),
    );
    const equipment: UiState['equipment'] = {};
    for (const [slot, instanceId] of Object.entries(ps?.equipment ?? {})) {
      const v = inventory.find((i) => i.instanceId === instanceId);
      if (v) equipment[slot as EquipSlot] = v;
    }
    const potion = this.bestPotion();
    const potionDef = potion ? c.items.get(potion.itemId) : undefined;

    // Boss frame: the nearest living boss/elite that is fighting someone.
    let boss: UnitFrame | null = null;
    if (me) {
      let bestD = 30;
      for (const e of this.sampled.values()) {
        if (e.state.kind !== 'monster' || e.state.action === 'dead' || e.state.targetId === null)
          continue;
        const tier = c.monsters.get(e.state.defId)?.tier;
        if (tier !== 'boss' && tier !== 'world_boss' && tier !== 'elite') continue;
        const d = Math.hypot(e.x - me.x, e.z - me.z);
        if (d < bestD) {
          bestD = d;
          boss = this.unitFrame(e.state.id, tick);
        }
      }
    }

    const interactTarget = this.nearestInteractable();
    let interactLabel: string | null = null;
    if (interactTarget?.state.kind === 'loot')
      interactLabel = `Nhặt ${c.items.get(interactTarget.state.defId)?.name ?? ''}`;
    else if (interactTarget?.state.kind === 'npc')
      interactLabel = `Nói chuyện: ${c.npcs.get(interactTarget.state.defId)?.name ?? ''}`;
    else if (interactTarget)
      interactLabel = `Vào ${this.unitFrame(interactTarget.state.id, tick)?.name ?? 'cổng'}`;

    const ui: UiState = {
      mapName: map?.name ?? this.join.mapId,
      zoneName: zone,
      player:
        meFrame && ps
          ? {
              ...meFrame,
              mp: ps.mp,
              maxMp: ps.maxMp,
              cultivation: this.cultivationView(ps, tick),
              gold: ps.gold,
              inSafeZone: ps.inSafeZone,
              stats: ps.stats,
            }
          : null,
      target: this.unitFrame(this.selectedId, tick),
      boss: boss && boss.id !== this.selectedId ? boss : null,
      skills: (ps?.skills ?? []).map((s) => {
        const def = c.skills.get(s.skillId);
        const remaining = Math.max(0, (s.readyAtTick - tick) / TICK_RATE);
        return {
          skillId: s.skillId,
          name: def?.name ?? s.skillId,
          icon: def?.icon ?? '?',
          description: def?.description ?? '',
          cooldown: def?.cooldown ?? 1,
          remaining: Math.round(remaining * 10) / 10,
          mpCost: def?.mpCost ?? 0,
          usable: remaining <= 0 && (ps?.mp ?? 0) >= (def?.mpCost ?? 0),
        };
      }),
      potion:
        potion && potionDef
          ? {
              instanceId: potion.instanceId,
              icon: potionDef.icon,
              count: inventory
                .filter((i) => i.itemId === potion.itemId)
                .reduce((n, i) => n + i.count, 0),
              remaining: Math.max(0, Math.round(((ps?.itemReadyAtTick ?? 0) - tick) / 2) / 10),
            }
          : null,
      inventory,
      inventoryCapacity: ps?.inventoryCapacity ?? 0,
      equipment,
      interact: interactLabel ? { label: interactLabel } : null,
      questsDone: (ps?.quests ?? []).filter((q) => q.status === 'done').map((q) => q.questId),
      party: ps?.party ?? null,
      quests: (ps?.quests ?? [])
        .filter((q) => q.status !== 'done')
        .map((q) => {
          const def = c.quests.get(q.questId);
          return {
            questId: q.questId,
            name: def?.name ?? q.questId,
            status: q.status,
            objectives: (def?.objectives ?? []).map((o, i) => {
              const current = q.progress[i] ?? 0;
              if (o.type === 'kill')
                return {
                  text: `Hạ ${c.monsters.get(o.monsterId)?.name ?? o.monsterId}`,
                  current,
                  required: o.count,
                };
              if (o.type === 'collect')
                return {
                  text: `Thu ${c.items.get(o.itemId)?.name ?? o.itemId}`,
                  current,
                  required: o.count,
                };
              return {
                text: `Gặp ${c.npcs.get(o.npcId)?.name ?? o.npcId}`,
                current,
                required: 1,
              };
            }),
          };
        }),
    };
    const key = JSON.stringify(ui);
    if (key !== this.lastUi) {
      this.lastUi = key;
      this.opts.onUi?.(ui);
    }
    const envStats = this.environment?.stats;
    this.opts.onDebug?.({
      engine: this.engineKind,
      fps: Math.round(this.engine.getFps()),
      tick,
      entities: this.views.size,
      drawCalls: this.instrumentation.drawCallsCounter.current,
      activeMeshes: this.scene.getActiveMeshes().length,
      quality: `${this.quality.mode}${this.quality.mode === 'auto' ? `→${this.preset.level}` : ''}`,
      chunks: envStats ? `${envStats.activeChunks}/${envStats.totalChunks}` : '-',
      envInstances: envStats?.instances ?? 0,
      assets: this.assetProgress,
    });
  }
}
