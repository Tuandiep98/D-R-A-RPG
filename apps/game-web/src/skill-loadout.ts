import type { SkillSlot } from "@rpg/babylon-renderer";
import { create } from "zustand";

export type SkillPosition =
  | "desktop-1"
  | "desktop-2"
  | "desktop-3"
  | "desktop-4"
  | "touch-1"
  | "touch-2"
  | "touch-3"
  | "touch-utility";

export const DESKTOP_POSITIONS: readonly SkillPosition[] = [
  "desktop-1",
  "desktop-2",
  "desktop-3",
  "desktop-4",
];
export const TOUCH_POSITIONS: readonly SkillPosition[] = [
  "touch-1",
  "touch-2",
  "touch-3",
  "touch-utility",
];

const STORAGE_KEY = "rpg.skill-loadout.v1";
type Assignments = Partial<Record<SkillPosition, string | null>>;

function readAssignments(): Assignments {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const saved = raw as Record<string, unknown>;
    const assignments: Assignments = {};
    for (const position of [...DESKTOP_POSITIONS, ...TOUCH_POSITIONS]) {
      const value = saved[position];
      if (typeof value === "string" || value === null)
        assignments[position] = value;
    }
    return assignments;
  } catch {
    return {};
  }
}

export function allowedInPosition(
  slot: SkillSlot,
  position: SkillPosition,
): boolean {
  if (position === "touch-utility") return slot.barRole === "utility";
  if (position.startsWith("touch-")) return slot.barRole === "primary";
  return true;
}

/** Resolve saved skill IDs against currently learned skills, filling untouched slots in order. */
export function resolveLoadout(
  skills: readonly SkillSlot[],
  assignments: Assignments,
  mode: "desktop" | "touch",
): (SkillSlot | null)[] {
  const positions = mode === "desktop" ? DESKTOP_POSITIONS : TOUCH_POSITIONS;
  const chosen = new Set<string>();
  const reserved = new Set<string>();
  for (const position of positions) {
    const id = assignments[position];
    if (
      id &&
      skills.some(
        (skill) => skill.skillId === id && allowedInPosition(skill, position),
      )
    )
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
  assignments: Assignments;
  assign(position: SkillPosition, skillId: string | null): void;
}

export const useSkillLoadout = create<SkillLoadoutStore>((set) => ({
  assignments: readAssignments(),
  assign: (position, skillId) =>
    set((state) => {
      const next = { ...state.assignments, [position]: skillId };
      if (skillId) {
        const group = position.startsWith("desktop-")
          ? DESKTOP_POSITIONS
          : TOUCH_POSITIONS;
        for (const other of group)
          if (other !== position && next[other] === skillId) next[other] = null;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage may be unavailable; keep the assignment for this session.
      }
      return { assignments: next };
    }),
}));
