/** Inspect real player clip poses around authored skill impact; this is an art audit, not a combat test. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { loadContentFromDir } from '../../packages/game-data/src/node';

const content = loadContentFromDir(resolve('game-data'));
const kits = process.argv[3] === 'kits';
const combos = process.argv[3] === 'combos';
const magic = process.argv[3] === 'magic';
const kitSkills = new Set(
  ['player_phap', 'player_the', 'player_tran', 'player_anh', 'player_thu'].flatMap(
    (id) => content.characters.get(id)?.prototypeSkills ?? [],
  ),
);
const out = resolve(
  'reports/skill-animation-poses',
  ...(kits ? ['kits'] : combos ? ['combos'] : magic ? ['magic'] : []),
);
mkdirSync(out, { recursive: true });
const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5175');
url.searchParams.set('debug', '');
url.searchParams.set('webgl', '');
url.searchParams.set('quality', 'low');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results: unknown[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const loadProfile = async (profile: string) => {
    url.searchParams.set('char', profile);
    await page.goto(url.toString());
    await page.waitForFunction(
      () => {
        // biome-ignore lint/suspicious/noExplicitAny: inspection of private debug objects only.
        const view = (window as any).__rpg?.view;
        return view?.views.get(view.join.playerId)?.visual?.clips?.size > 0;
      },
      null,
      { timeout: 60_000 },
    );
  };
  const entries: {
    id: string;
    profile: string;
    anim: { cast: string; castSpeed: number };
    impact: number;
  }[] = [];
  for (const skill of content.skills.values()) {
    if (
      combos ||
      magic ||
      !(kits ? kitSkills.has(skill.id) : skill.id.startsWith('skill_thunder_'))
    )
      continue;
    // Lôi Bộ is an alias for shared roll, whose duration/clip are authoritative.
    const resolved =
      skill.id === 'skill_thunder_step' ? (content.skills.get('skill_roll') ?? skill) : skill;
    const anim = resolved.anim;
    if (!anim?.cast) throw new Error(`Missing clip ${resolved.id}`);
    const windup = resolved.mobility
      ? resolved.duration
      : (resolved.timeline?.windup ?? resolved.castTime);
    const dash = !resolved.mobility && resolved.effects.some((effect) => effect.type === 'dash');
    const impact =
      Math.round(windup * 20) / 20 +
      (dash ? Math.round((resolved.timeline?.active ?? 0) * 20) / 20 : 0);
    const profile = kits
      ? [...content.characters.values()].find((character) =>
          character.prototypeSkills.includes(skill.id),
        )?.id
      : 'player_default';
    if (!profile) throw new Error(`Missing kit profile for ${skill.id}`);
    entries.push({ id: skill.id, profile, anim, impact });
  }
  if (combos)
    for (const combo of content.combos.values())
      for (const step of combo.steps)
        for (const variant of step.variants)
          if (variant.projectileSkillId)
            entries.push({
              id: `${combo.id}_${variant.id}`,
              profile:
                [...content.characters.values()].find((character) =>
                  Object.values(character.combos).includes(combo.id),
                )?.id ?? 'player_default',
              anim: { cast: variant.clip, castSpeed: variant.animSpeed },
              impact: Math.max(1, Math.round(variant.windup * 20)) / 20,
            });
  if (magic)
    for (const impact of [0.2, 0.4, 0.6])
      entries.push({
        id: `magic_${impact.toFixed(1)}`,
        profile: 'player_phap',
        anim: { cast: 'Ranged_Magic_Shoot', castSpeed: 1 },
        impact,
      });
  let loadedProfile = '';
  for (const { id, profile, anim, impact } of entries) {
    if (profile !== loadedProfile) {
      await loadProfile(profile);
      loadedProfile = profile;
    }
    for (const offset of [-0.1, 0, 0.1]) {
      const elapsed = Math.max(0, impact + offset);
      const sample = await page.evaluate(
        ({ clip, speed, elapsed, label }) => {
          // biome-ignore lint/suspicious/noExplicitAny: private runtime introspection, never shipped to the game.
          const view = (window as any).__rpg.view;
          const actor = view.views.get(view.join.playerId);
          const group = actor.visual.clips.get(clip);
          if (!group) throw new Error(`Missing runtime clip ${clip}`);
          // Paused groups retain animatables; stop them too before the next sample.
          for (const previous of actor.visual.allGroups) previous.stop(true);
          actor.playClip(clip, speed, 'cast');
          const fps = group.targetedAnimations[0]?.animation.framePerSecond;
          if (!fps) throw new Error(`Missing animation frame rate ${clip}`);
          const frame = Math.min(group.to, group.from + elapsed * speed * fps);
          group.pause();
          group.goToFrame(frame);
          // Apply the exact authored pose after animation evaluation, without
          // transient blend-in from the previous sample's pose.
          if (view.__poseObserver)
            view.scene.onAfterAnimationsObservable.remove(view.__poseObserver);
          view.__poseObserver = view.scene.onAfterAnimationsObservable.add(() => {
            for (const track of group.targetedAnimations) {
              const value = track.animation.evaluate(frame);
              const path = track.animation.targetProperty.split('.');
              let target = track.target;
              for (const key of path.slice(0, -1)) target = target[key];
              target[path.at(-1)] = value?.clone ? value.clone() : value;
            }
          });
          const camera = view.rig.camera;
          camera.lowerRadiusLimit = 0.5;
          view.rig.opts.minRadius = 0.5;
          camera.radius = 3.6;
          camera.alpha = Math.PI / 2;
          camera.beta = 1.3;
          camera.targetScreenOffset.y = 0.45;
          let badge = document.getElementById('pose-audit');
          if (!badge) {
            badge = document.createElement('div');
            badge.id = 'pose-audit';
            badge.style.cssText =
              'position:fixed;top:130px;left:10px;z-index:9999;background:#000d;color:white;padding:10px;font:14px monospace;pointer-events:none';
            document.body.appendChild(badge);
          }
          badge.textContent = `${label} | ${clip} | time ${elapsed.toFixed(2)}s | frame ${frame.toFixed(1)}`;
          return {
            frame,
            fps,
            from: group.from,
            to: group.to,
            clipSeconds: actor.visual.clipSeconds(clip),
          };
        },
        {
          clip: anim.cast,
          speed: anim.castSpeed,
          elapsed,
          label: `${id} impact ${impact.toFixed(2)}s`,
        },
      );
      // Let a render frame apply the paused pose and skin matrices.
      await page.waitForTimeout(100);
      const suffix = offset < 0 ? 'before' : offset > 0 ? 'after' : 'impact';
      const file = `${id}_${suffix}.png`;
      await page.screenshot({ path: resolve(out, file) });
      results.push({
        skillId: id,
        profile,
        clip: anim.cast,
        speed: anim.castSpeed,
        impact,
        elapsed,
        file,
        ...sample,
      });
    }
  }
  writeFileSync(resolve(out, 'poses.json'), JSON.stringify(results, null, 2));
  console.log(`Saved ${results.length} real clip poses to ${out}`);
} finally {
  await browser.close();
}
