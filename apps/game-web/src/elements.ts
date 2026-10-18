import type { Expression } from '@rpg/game-data';
import type { Element } from '@rpg/game-protocol';
export const ELEMENTS: { id: Element; name: string; hint: string }[] = [
  { id: 'kim', name: 'Kim', hint: 'Khắc Mộc · vệt bạc, đòn chính xác' },
  { id: 'moc', name: 'Mộc', hint: 'Khắc Thổ · sinh khí hoặc biểu hiện Lôi' },
  { id: 'thuy', name: 'Thủy', hint: 'Khắc Hỏa · nước và băng' },
  { id: 'hoa', name: 'Hỏa', hint: 'Khắc Kim · lửa và nhiệt' },
  { id: 'tho', name: 'Thổ', hint: 'Khắc Thủy · đá và địa chấn' },
];
export const elementName = (id?: Element | null): string =>
  ELEMENTS.find((e) => e.id === id)?.name ?? 'Chưa chọn hành';

/** Offline bản mệnh choices (`?element=`, Cài đặt → Ngũ hành debug). */
export const DEBUG_ELEMENTS: Record<
  string,
  { label: string; element: Element; expression: Expression }
> = {
  kim: { label: 'Kim', element: 'kim', expression: 'base' },
  moc: { label: 'Mộc', element: 'moc', expression: 'base' },
  loi: { label: 'Lôi', element: 'moc', expression: 'thunder' },
  thuy: { label: 'Thủy', element: 'thuy', expression: 'base' },
  bang: { label: 'Băng', element: 'thuy', expression: 'ice' },
  hoa: { label: 'Hỏa', element: 'hoa', expression: 'base' },
  tho: { label: 'Thổ', element: 'tho', expression: 'base' },
};

/** The debug key for an element + expression (character defaults, current pick). */
export function debugElementKey(element: Element, expression: Expression): string {
  return (
    Object.entries(DEBUG_ELEMENTS).find(
      ([, v]) => v.element === element && v.expression === expression,
    )?.[0] ?? element
  );
}
