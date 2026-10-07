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
