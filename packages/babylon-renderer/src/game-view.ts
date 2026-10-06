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
} from '@babylonjs/core';
import { AssetLibrary } from '@rpg/asset-runtime';
import type { ContentBundle } from '@rpg/game-data';
import type { EntityId, JoinInfo, SimEvent } from '@rpg/game-protocol';
import { type GameAction, InputManager, MouseKeyboardAdapter, TouchAdapter } from '@rpg/input';
import type { SimHost } from '@rpg/sim-host';
import { CameraRig } from './camera-rig';
import { DamageTextPool, MoveMarker, SelectionRing } from './effects';
import { createEngine, type EngineKind } from './engine';
import { EntityView, EntityViewPool, type PickMetadata } from './entity-view';
import { type BuiltEnvironment, buildEnvironment } from './environment';
import { type InterpolatedEntity, SnapshotBuffer } from './snapshot-buffer';

export interface UnitFrame {
  id: EntityId;
  name: string;
  level: number | null;
  hp: number;
  maxHp: number;
  alive: boolean;
}

export interface UiState {
  player: UnitFrame | null;
  target: UnitFrame | null;
}

export interface DebugStats {
  engine: EngineKind;
  fps: number;
  tick: number;
  entities: number;
  drawCalls: number;
  activeMeshes: number;
}

export interface GameViewOptions {
  canvas: HTMLCanvasElement;
  host: SimHost;
  content: ContentBundle;
  manifestUrl: string;
  forceWebGL?: boolean;
  onUi?: (ui: UiState) => void;
  onDebug?: (stats: DebugStats) => void;
  onToggleDebug?: (scene: Scene) => void;
}

const UI_INTERVAL_MS = 100;

/**
 * Client-side game: renders host snapshots, turns input into intents.
 * Holds no gameplay authority — every outcome comes from the SimHost.
 */
export class GameView {
  private readonly buffer = new SnapshotBuffer(100);
  private readonly views = new Map<EntityId, EntityView>();
  private readonly sampled = new Map<EntityId, InterpolatedEntity>();
  private readonly unsubscribe: (() => void)[] = [];
  private selectedId: EntityId | null = null;
  private lastUi = '';
  private lastUiAt = 0;
  private time = 0;
  private cameraSnapped = false;
  private environment: BuiltEnvironment | null = null;

  private constructor(
    private readonly opts: GameViewOptions,
    private readonly engine: AbstractEngine,
    private readonly engineKind: EngineKind,
    readonly scene: Scene,
    private readonly rig: CameraRig,
    private readonly assets: AssetLibrary,
    private readonly pool: EntityViewPool,
    private readonly input: InputManager,
    private readonly selection: SelectionRing,
    private readonly marker: MoveMarker,
    private readonly damage: DamageTextPool,
    private readonly instrumentation: SceneInstrumentation,
    private readonly join: JoinInfo,
  ) {}

  static async create(opts: GameViewOptions): Promise<GameView> {
    const { engine, kind } = await createEngine(opts.canvas, { forceWebGL: opts.forceWebGL });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.55, 0.72, 0.85, 1);
    scene.ambientColor = new Color3(0.3, 0.3, 0.3);
    scene.skipPointerMovePicking = true;

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
    const map = opts.content.maps.get(join.mapId);
    if (!map) throw new Error(`Host joined unknown map ${join.mapId}`);

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
      assets,
      pool,
      input,
      new SelectionRing(scene),
      new MoveMarker(scene),
      new DamageTextPool(scene),
      instrumentation,
      join,
    );
    view.environment = await buildEnvironment(scene, map, opts.content, assets);
    view.start();
    return view;
  }

  /** Dev/test helper: entity ids and canvas-space positions (CSS px) for automation. */
  debugEntities(): {
    id: EntityId;
    kind: string;
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
      const world = view.root.position.add(
        new Vector3(0, view.appearance.placeholder.height / 2, 0),
      );
      const p = Vector3.Project(
        world,
        Matrix.IdentityReadOnly,
        this.scene.getTransformMatrix(),
        viewport,
      );
      out.push({
        id,
        kind: e.state.kind,
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
    void this.assets.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  private start(): void {
    const { host } = this.opts;
    this.unsubscribe.push(
      host.onSnapshot((s) => this.buffer.push(s, performance.now())),
      host.onEvents((events) => this.handleEvents(events)),
      this.input.on((a) => this.handleAction(a)),
    );
    const onResize = () => this.engine.resize();
    window.addEventListener('resize', onResize);
    this.unsubscribe.push(() => window.removeEventListener('resize', onResize));

    this.engine.runRenderLoop(() => this.frame());
  }

  private frame(): void {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.1);
    this.time += dt;
    const now = performance.now();
    this.buffer.sample(now, this.sampled);

    // Sync views with the entity set.
    for (const [id, view] of this.views) {
      if (!this.sampled.has(id)) {
        this.pool.release(view);
        this.views.delete(id);
        if (this.selectedId === id) this.select(null);
      }
    }
    for (const [id, e] of this.sampled) {
      let view = this.views.get(id);
      if (!view) {
        const appearance = this.appearanceFor(e.state.kind, e.state.defId);
        if (!appearance) continue;
        view = this.pool.acquire(appearance, id);
        this.views.set(id, view);
      }
      view.setTransform(e.x, e.z, e.yaw);
      view.setAction(e.state.action);
      view.update(dt);
    }

    const me = this.sampled.get(this.join.playerId);
    if (me) {
      this.rig.follow(me.x, me.z, dt, !this.cameraSnapped);
      this.cameraSnapped = true;
    }
    this.selection.update(this.time);
    this.marker.update(dt);
    this.damage.update(dt);
    this.scene.render();
    this.publish(now);
  }

  private handleAction(action: GameAction): void {
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
      case 'TOGGLE_DEBUG':
        this.opts.onToggleDebug?.(this.scene);
        break;
      case 'SELECT':
        this.handleSelect(action.x, action.y);
        break;
    }
  }

  private handleSelect(x: number, y: number): void {
    const entityHit = this.scene.pick(
      x,
      y,
      (m) => !!(m.metadata as PickMetadata | null)?.entityId && m.isPickable,
    );
    const hitId = (entityHit?.pickedMesh?.metadata as PickMetadata | null)?.entityId;
    if (hitId && hitId !== this.join.playerId) {
      this.select(hitId);
      const target = this.sampled.get(hitId);
      if (target?.state.kind === 'monster')
        this.opts.host.sendIntent({ type: 'ATTACK_TARGET', targetId: hitId });
      return;
    }
    const groundHit = this.scene.pick(
      x,
      y,
      (m) => (m.metadata as { ground?: boolean } | null)?.ground === true,
    );
    const p = groundHit?.pickedPoint;
    if (p) {
      this.marker.show(p.x, p.z);
      this.opts.host.sendIntent({ type: 'MOVE_TO', target: { x: p.x, z: p.z } });
    }
  }

  private select(id: EntityId | null): void {
    this.selectedId = id;
    const view = id !== null ? this.views.get(id) : undefined;
    this.selection.attach(view?.root ?? null, view?.radius);
  }

  private handleEvents(events: SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'ATTACK':
          this.views.get(ev.sourceId)?.play('attack');
          break;
        case 'DAMAGE': {
          const view = this.views.get(ev.targetId);
          if (!view) break;
          view.play('hit');
          const color =
            ev.targetId === this.join.playerId ? '#ff5a4f' : ev.crit ? '#ffd23f' : '#ffffff';
          const pos = view.root.position.clone();
          pos.y += view.appearance.placeholder.height + 0.3;
          this.damage.spawn(pos, ev.crit ? `${ev.amount}!` : `${ev.amount}`, color);
          break;
        }
        case 'DEATH':
          if (ev.id === this.selectedId) this.select(null);
          break;
        default:
          break;
      }
    }
  }

  private appearanceFor(kind: 'player' | 'monster', defId: string) {
    const def =
      kind === 'player'
        ? this.opts.content.characters.get(defId)
        : this.opts.content.monsters.get(defId);
    return def ? this.opts.content.appearances.get(def.appearanceId) : undefined;
  }

  private unitFrame(id: EntityId | null): UnitFrame | null {
    if (id === null) return null;
    const e = this.buffer.latest?.entities.find((x) => x.id === id);
    if (!e) return null;
    const def =
      e.kind === 'player'
        ? this.opts.content.characters.get(e.defId)
        : this.opts.content.monsters.get(e.defId);
    return {
      id,
      name: def?.name ?? e.defId,
      level: def && 'level' in def ? def.level : null,
      hp: e.hp,
      maxHp: e.maxHp,
      alive: e.action !== 'dead',
    };
  }

  /** UI and debug overlays update at 10 Hz, never per frame (CLAUDE.md rule 7). */
  private publish(now: number): void {
    if (now - this.lastUiAt < UI_INTERVAL_MS) return;
    this.lastUiAt = now;
    const ui: UiState = {
      player: this.unitFrame(this.join.playerId),
      target: this.unitFrame(this.selectedId),
    };
    const key = JSON.stringify(ui);
    if (key !== this.lastUi) {
      this.lastUi = key;
      this.opts.onUi?.(ui);
    }
    this.opts.onDebug?.({
      engine: this.engineKind,
      fps: Math.round(this.engine.getFps()),
      tick: this.buffer.latest?.tick ?? 0,
      entities: this.views.size,
      drawCalls: this.instrumentation.drawCallsCounter.current,
      activeMeshes: this.scene.getActiveMeshes().length,
    });
  }
}
