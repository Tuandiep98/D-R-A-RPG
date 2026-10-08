import type { SkillSlot } from '@rpg/babylon-renderer';
import { z } from 'zod';
import { create } from 'zustand';

export type SkillPosition =
  | 'desktop-1'
  | 'desktop-2'
  | 'desktop-3'
  | 'desktop-4'
  | 'touch-1'
  | 'touch-2'
  | 'touch-3'
  | 'touch-utility';

export const DESKTOP_POSITIONS: readonly SkillPosition[] = [
  'desktop-1',
  'desktop-2',
  'desktop-3',
  'desktop-4',
];
export const TOUCH_POSITIONS: readonly SkillPosition[] = [
  'touch-1',
  'touch-2',
  'touch-3',
  'touch-utility',
];

const STORAGE_KEY = 'rpg.skill-loadout.v2';
const LEGACY_KEY = 'rpg.skill-loadout.v1';
type Assignments = Partial<Record<SkillPosition, string | null>>;
const AssignmentsSchema = z.partialRecord(
  z.enum([
    'desktop-1',
    'desktop-2',
    'desktop-3',
    'desktop-4',
    'touch-1',
    'touch-2',
    'touch-3',
    'touch-utility',
  ]),
  z.string().max(100).nullable(),
);
const EnvelopeSchema = z.object({
  version: z.literal(2),
  legacyOwner: z.string().nullable(),
  characters: z.record(z.string(), AssignmentsSchema),
});
interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
function readEnvelope(storage: PreferenceStorage): z.infer<typeof EnvelopeSchema> {
  try {
    return EnvelopeSchema.parse(JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return { version: 2, legacyOwner: null, characters: {} };
  }
}

/** Claim the old global preference once; all subsequent writes are character scoped. */
export function readCharacterLoadout(storage: PreferenceStorage, identity: string): Assignments {
  const envelope = readEnvelope(storage);
  if (Object.hasOwn(envelope.characters, identity)) return envelope.characters[identity] ?? {};
  let assignments: Assignments = {};
  if (envelope.legacyOwner === null) {
    try {
      assignments = AssignmentsSchema.parse(JSON.parse(storage.getItem(LEGACY_KEY) ?? '{}'));
      for (const position of [...DESKTOP_POSITIONS, ...TOUCH_POSITIONS]) {
        if (assignments[position] === 'skill_thunder_step') assignments[position] = 'skill_roll';
      }
    } catch {
      assignments = {};
    }
    envelope.legacyOwner = identity;
  }
  envelope.characters[identity] = assignments;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    /* Session preference still works. */
  }
  return assignments;
}

export function writeCharacterLoadout(
  storage: PreferenceStorage,
  identity: string,
  assignments: Assignments,
): void {
  const envelope = readEnvelope(storage);
  envelope.legacyOwner ??= identity;
  envelope.characters[identity] = AssignmentsSchema.parse(assignments);
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

export function allowedInPosition(slot: SkillSlot, position: SkillPosition): boolean {
  if (
    slot.skillId === 'skill_thunder_step' ||
    ['skill_roll', 'skill_blink', 'skill_jump'].includes(slot.skillId)
  )
    return false;
  if (position === 'touch-utility') return slot.barRole === 'utility';
  if (position.startsWith('touch-')) return slot.barRole === 'primary';
  return true;
}

/** Resolve saved skill IDs against currently learned skills, filling untouched slots in order. */
export function resolveLoadout(
  skills: readonly SkillSlot[],
  assignments: Assignments,
  mode: 'desktop' | 'touch',
): (SkillSlot | null)[] {
  const positions = mode === 'desktop' ? DESKTOP_POSITIONS : TOUCH_POSITIONS;
  const chosen = new Set<string>();
  const reserved = new Set<string>();
  for (const position of positions) {
    const id = assignments[position];
    if (id && skills.some((skill) => skill.skillId === id && allowedInPosition(skill, position)))
      reserved.add(id);
  }
  return positions.map((position) => {
    const id = assignments[position];
    if (id === null) return null;
    const saved = skills.find(
      (skill) => skill.skillId === id && allowedInPosition(skill, position),
    );
    if (saved && !chosen.has(saved.skillId)) {
      chosen.add(saved.skillId);
      return saved;
    }
    const fallback = skills.find(
      (skill) =>
        allowedInPosition(skill, position) &&
        !chosen.has(skill.skillId) &&
        !reserved.has(skill.skillId),
    );
    if (fallback) chosen.add(fallback.skillId);
    return fallback ?? null;
  });
}

interface SkillLoadoutStore {
  identity: string | null;
  activate(identity: string): void;
  assignments: Assignments;
  assign(position: SkillPosition, skillId: string | null): void;
}

export const useSkillLoadout = create<SkillLoadoutStore>((set) => ({
  identity: null,
  assignments: {},
  activate: (identity) => {
    let assignments: Assignments = {};
    try {
      assignments = readCharacterLoadout(localStorage, identity);
    } catch {
      /* No browser storage. */
    }
    set({ identity, assignments });
  },
  assign: (position, skillId) =>
    set((state) => {
      const next = { ...state.assignments, [position]: skillId };
      if (skillId) {
        const group = position.startsWith('desktop-') ? DESKTOP_POSITIONS : TOUCH_POSITIONS;
        for (const other of group)
          if (other !== position && next[other] === skillId) next[other] = null;
      }
      try {
        if (state.identity) writeCharacterLoadout(localStorage, state.identity, next);
      } catch {
        // Storage may be unavailable; keep the assignment for this session.
      }
      return { assignments: next };
    }),
}));
