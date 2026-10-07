import type { Accessor, Animation, Document, Node } from '@gltf-transform/core';

/**
 * Derived animation clips baked at build time (SOURCE.json `derivedClips`):
 *
 * - `reverse`: plays the source backwards (KayKit only swings its right hand
 *   left → right; reversed, Slice_Horizontal becomes a right → left slash).
 * - `mirror`: swaps `.l` / `.r` joints and reflects motion across the body's
 *   YZ plane (Punch_A with the right hand → the same punch with the left).
 *   Correct for rigs whose left/right rest frames mirror each other, which
 *   KayKit's do; verify new rigs with the FK check in derive-clips.test.ts.
 *
 * Only LINEAR / STEP samplers are supported (KayKit exports LINEAR).
 */
export interface DerivedClip {
  name: string;
  from: string;
  reverse?: boolean;
  mirror?: boolean;
  /** Seconds cut from the start (after reversing), e.g. a reversed clip's idle tail. */
  trimStart?: number;
}

const SIDE = /\.(l|r)$/;
const otherSide = (name: string) =>
  SIDE.test(name) ? name.replace(SIDE, (_, s: string) => (s === 'l' ? '.r' : '.l')) : name;

export function deriveClips(doc: Document, clips: readonly DerivedClip[]): string[] {
  const root = doc.getRoot();
  const problems: string[] = [];
  const nodes = new Map<string, Node>(root.listNodes().map((n) => [n.getName(), n]));
  const buffer = root.listBuffers()[0] ?? doc.createBuffer('derived_buffer');
  for (const clip of clips) {
    const source = root.listAnimations().find((a) => a.getName() === clip.from);
    if (!source) {
      problems.push(`derived clip ${clip.name}: source "${clip.from}" not in the model`);
      continue;
    }
    problems.push(...derive(doc, source, clip, nodes, buffer));
  }
  return problems;
}

function derive(
  doc: Document,
  source: Animation,
  clip: DerivedClip,
  nodes: Map<string, Node>,
  buffer: ReturnType<Document['createBuffer']>,
): string[] {
  const problems: string[] = [];
  const out = doc.createAnimation(clip.name);
  let duration = 0;
  for (const s of source.listSamplers()) {
    const t = s.getInput()?.getArray();
    if (t && t.length > 0) duration = Math.max(duration, t[t.length - 1] as number);
  }
  for (const ch of source.listChannels()) {
    const sampler = ch.getSampler();
    const node = ch.getTargetNode();
    const path = ch.getTargetPath();
    const input = sampler?.getInput();
    const output = sampler?.getOutput();
    if (!sampler || !node || !path || !input || !output) continue;
    if (sampler.getInterpolation() === 'CUBICSPLINE') {
      problems.push(`derived clip ${clip.name}: CUBICSPLINE channel skipped`);
      continue;
    }
    const target = clip.mirror ? nodes.get(otherSide(node.getName())) : node;
    if (!target) {
      problems.push(`derived clip ${clip.name}: no mirror joint for ${node.getName()}`);
      continue;
    }
    const times = Array.from(input.getArray() as ArrayLike<number>);
    const k = output.getElementSize();
    const values = Array.from(output.getArray() as ArrayLike<number>);
    if (clip.mirror) mirrorValues(values, k, path);
    let outTimes = times;
    let outValues = values;
    if (clip.reverse) {
      outTimes = times.map((t) => duration - t).reverse();
      outValues = [];
      for (let i = times.length - 1; i >= 0; i--) outValues.push(...values.slice(i * k, i * k + k));
    }
    if (clip.trimStart) [outTimes, outValues] = trim(outTimes, outValues, k, clip.trimStart, path);
    const newSampler = doc
      .createAnimationSampler()
      .setInput(accessor(doc, buffer, input, outTimes))
      .setOutput(accessor(doc, buffer, output, outValues))
      .setInterpolation(sampler.getInterpolation());
    out.addSampler(newSampler);
    out.addChannel(
      doc.createAnimationChannel().setTargetNode(target).setTargetPath(path).setSampler(newSampler),
    );
  }
  return problems;
}

/** Drops keys before `start` (keeping an interpolated key at it) and shifts time to 0. */
function trim(
  times: number[],
  values: number[],
  k: number,
  start: number,
  path: string,
): [number[], number[]] {
  const first = times.findIndex((t) => t >= start);
  if (first <= 0) return [times.map((t) => Math.max(0, t - start)), values];
  const a = times[first - 1] as number;
  const b = times[first] as number;
  const f = b > a ? (start - a) / (b - a) : 0;
  const va = values.slice((first - 1) * k, first * k);
  const vb = values.slice(first * k, first * k + k);
  let v = va.map((x, i) => x + ((vb[i] as number) - x) * f);
  if (path === 'rotation') {
    const len = Math.hypot(...v);
    v = v.map((x) => x / len);
  }
  const outTimes = [0, ...times.slice(first).map((t) => t - start)];
  const outValues = [...v, ...values.slice(first * k)];
  if (outTimes[1] === 0) {
    outTimes.shift();
    outValues.splice(0, k);
  }
  return [outTimes, outValues];
}

/** Reflection across X: translations negate x, rotations keep x/w and negate y/z. */
function mirrorValues(values: number[], k: number, path: string): void {
  for (let i = 0; i < values.length; i += k) {
    if (path === 'translation') values[i] = -(values[i] as number);
    else if (path === 'rotation') {
      values[i + 1] = -(values[i + 1] as number);
      values[i + 2] = -(values[i + 2] as number);
    }
  }
}

function accessor(
  doc: Document,
  buffer: ReturnType<Document['createBuffer']>,
  like: Accessor,
  data: number[],
): Accessor {
  return doc
    .createAccessor()
    .setType(like.getType())
    .setArray(new Float32Array(data))
    .setBuffer(buffer);
}
