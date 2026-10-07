import type { Element } from '@rpg/game-protocol';
export const ELEMENT_COLOR: Record<Element, string> = {
  kim: '#e7edf4',
  moc: '#72d69b',
  thuy: '#75ceff',
  hoa: '#ff8750',
  tho: '#c8ac77',
};
export function elementColor(element?: Element | null, expression?: string): string {
  return expression === 'thunder'
    ? '#92dfff'
    : expression === 'ice'
      ? '#b4eaff'
      : element
        ? ELEMENT_COLOR[element]
        : '#e7edf4';
}
