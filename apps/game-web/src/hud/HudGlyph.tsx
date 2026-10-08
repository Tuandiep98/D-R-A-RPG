import type { ReactNode } from 'react';

export type HudGlyphName =
  | 'blade'
  | 'gun'
  | 'bolt'
  | 'arc'
  | 'field'
  | 'pierce'
  | 'judgement'
  | 'leap'
  | 'shield'
  | 'skills'
  | 'pack'
  | 'character'
  | 'cultivation'
  | 'settings'
  | 'menu'
  | 'target'
  | 'fullscreen'
  | 'close'
  | 'swap'
  | 'reload'
  | 'potion'
  | 'ranking'
  | 'social'
  | 'map'
  | 'lock';

/**
 * Chunky filled silhouettes in the style of the Kenney Fantasy UI sample
 * (sword / book / crown): solid shapes, evenodd cut-outs for detail, soft
 * corners from a thin same-colour stroke. 24×24, drawn with currentColor so
 * slot states (selected = dark on white) recolour them.
 * `cut` = evenodd path with holes; `line` = thick rounded stroke for the few
 * glyphs that read better as lines (close, reload, menu).
 */
const cut = (d: string) => <path d={d} fillRule="evenodd" />;
const line = (d: string) => (
  <path d={d} fill="none" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
);

const glyphs: Record<HudGlyphName, ReactNode> = {
  // Folded scroll map with a route pin.
  map: cut(
    'M1.5 4.5 8 2l8 2.5L22.5 2v17.5L16 22l-8-2.5L1.5 22ZM8.8 5.2v11.9l6.4 2V7.2ZM12 9.6a2 2 0 1 0 .01 0Z',
  ),
  lock: cut(
    'M6 10V7.5a6 6 0 0 1 12 0V10h1.5v12.5h-15V10Zm3 0h6V7.5a3 3 0 0 0-6 0Zm3 3.6a1.8 1.8 0 0 0-.9 3.4v2.4h1.8V17a1.8 1.8 0 0 0-.9-3.4Z',
  ),
  blade: (
    <g transform="translate(12 12) rotate(45) scale(1.15) translate(-12 -12)">
      <path d="M12 .8 14.2 3.6V14H9.8V3.6Z" />
      <rect x="6.2" y="13.6" width="11.6" height="3" rx="1.2" />
      <rect x="10.6" y="16" width="2.8" height="4.4" />
      <circle cx="12" cy="21.4" r="2" />
    </g>
  ),
  gun: cut(
    'M2.5 7.5h15l2-1.5h2v6h-4l-1 2h-4.5l-1.5-1.5H9.5L8 21H3.5L5 12.5H2.5ZM10 13l-.6 2.2h3.2l.9-2.2Z',
  ),
  bolt: <path d="M14.5 1 4 13.5h6.6L8.8 23 20 9.8h-6.6Z" />,
  arc: (
    <>
      <path d="M3 20.5C3 10.5 9.5 3.5 21 3c-6.8 2.8-10.6 8.6-11 17.5Z" />
      <path d="m18 13 1.2 2.8L22 17l-2.8 1.2L18 21l-1.2-2.8L14 17l2.8-1.2Z" />
    </>
  ),
  field: cut(
    'M12 1.5 21.1 6.8V17.2L12 22.5 2.9 17.2V6.8ZM12 6.6 7.3 9.3v5.4l4.7 2.7 4.7-2.7V9.3ZM12 10l1.8 1v2l-1.8 1-1.8-1v-2Z',
  ),
  pierce: (
    <>
      <path d="M1.5 10.3h12.8V6.4L22.5 12l-8.2 5.6v-3.9H1.5Z" />
      <path d="M2 4.5h5.5L10 10H4.5ZM2 19.5h5.5L10 14H4.5Z" />
    </>
  ),
  judgement: cut('M12 1 20.5 10 12 23 3.5 10ZM13.4 4.8 8.2 12.4h3.4l-1 5.8 5.2-7.6h-3.4Z'),
  leap: (
    <>
      <path d="M12 2 21 10.5h-5.4L12 7.1 8.4 10.5H3Z" />
      <path d="M12 10.5 21 19h-5.4L12 15.6 8.4 19H3Z" />
      <rect x="5" y="20" width="14" height="2.6" rx="1.3" />
    </>
  ),
  shield: (
    <>
      {cut(
        'M12 1.5 20.5 4.8V11c0 6-3.6 9.8-8.5 11.5C7.1 20.8 3.5 17 3.5 11V4.8ZM12 4.3 6 6.6V11c0 4.5 2.5 7.4 6 8.8 3.5-1.4 6-4.3 6-8.8V6.6Z',
      )}
      <path d="M12 6.6 8 8.2V11c0 3.2 1.6 5.4 4 6.6Z" />
    </>
  ),
  skills: (
    <>
      <path d="M1.8 4.5c3.6-1.2 7-.8 9.2 1.4v14.3C8.6 18.4 5.4 18 1.8 19Z" />
      <path d="M22.2 4.5c-3.6-1.2-7-.8-9.2 1.4v14.3c2.4-1.8 5.6-2.2 9.2-1.2Z" />
      <path d="M1 20.3c3.8-1 7.6-.6 11 1.9 3.4-2.5 7.2-2.9 11-1.9v1.8c-3.6-.8-7.2-.2-11 2-3.8-2.2-7.4-2.8-11-2Z" />
    </>
  ),
  pack: (
    <>
      <path d="M7.5 2h9L14.6 6H9.4Z" />
      {cut(
        'M9.6 7h4.8c4.4 2 7.1 6 7.1 10.2 0 3.1-2.1 5.3-5.3 5.3H7.8c-3.2 0-5.3-2.2-5.3-5.3C2.5 13 5.2 9 9.6 7ZM6 13v2.4h12V13Z',
      )}
    </>
  ),
  character: (
    <>
      <circle cx="12" cy="7.2" r="5.2" />
      <path d="M2.5 22.5c.4-5.6 4.2-8.6 9.5-8.6s9.1 3 9.5 8.6Z" />
    </>
  ),
  cultivation: (
    <>
      <path d="M12 1.8c3.6 3.4 4.6 8 0 14.6-4.6-6.6-3.6-11.2 0-14.6Z" />
      <path d="M1.5 8.4c5.4-.4 8.8 2.7 10 8.4C5.9 17 2.6 14.1 1.5 8.4Z" />
      <path d="M22.5 8.4c-5.4-.4-8.8 2.7-10 8.4 5.6.2 8.9-2.7 10-8.4Z" />
      <path d="M3.5 18.2h17c-1.2 2.8-4.4 4.3-8.5 4.3s-7.3-1.5-8.5-4.3Z" />
    </>
  ),
  settings: cut(
    'M22.4 9.9 22.4 14.1 19.4 14.6 19 15.4 20.8 17.9 17.9 20.8 15.4 19 14.6 19.4 14.1 22.4 9.9 22.4 9.4 19.4 8.6 19 6.1 20.8 3.2 17.9 5 15.4 4.6 14.6 1.6 14.1 1.6 9.9 4.6 9.4 5 8.6 3.2 6.1 6.1 3.2 8.6 5 9.4 4.6 9.9 1.6 14.1 1.6 14.6 4.6 15.4 5 17.9 3.2 20.8 6.1 19 8.6 19.4 9.4ZM12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z',
  ),
  menu: line('M4 5.5h16M4 12h16M4 18.5h16'),
  target: (
    <>
      {cut(
        'M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Zm0 3.2a6.3 6.3 0 1 0 0 12.6 6.3 6.3 0 0 0 0-12.6Z',
      )}
      <circle cx="12" cy="12" r="2.4" />
      <path d="M10.6 0h2.8v5h-2.8ZM10.6 19h2.8v5h-2.8ZM0 10.6h5v2.8H0ZM19 10.6h5v2.8h-5Z" />
    </>
  ),
  fullscreen: (
    <path d="M2 2h8v3.2H5.2V10H2ZM22 2h-8v3.2h4.8V10H22ZM2 22h8v-3.2H5.2V14H2ZM22 22h-8v-3.2h4.8V14H22Z" />
  ),
  close: line('M5 5 19 19M19 5 5 19'),
  swap: <path d="M2 6.2h14.5V2.5L22 8l-5.5 5.5V9.8H2ZM22 17.8H7.5v3.7L2 16l5.5-5.5v3.7H22Z" />,
  reload: (
    <>
      {line('M19.5 13.5A7.6 7.6 0 1 1 15.6 5.4')}
      <path d="M13 1.5h9v9Z" />
    </>
  ),
  potion: cut(
    'M8.5 1.5h7v2.8h-1.2V8l5 7.4c2 3.3.2 7.1-3.7 7.1H8.4c-3.9 0-5.7-3.8-3.7-7.1l5-7.4V4.3H8.5ZM7 16.2c-.8 1.6.1 3.3 1.9 3.3h2.2c-1.6-.5-2.8-1.8-3.4-3.3Z',
  ),
  ranking: cut(
    'M2 6.5 7.3 11 12 3l4.7 8L22 6.5 19.8 19H4.2ZM12 11.6a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM4 20.2h16v2.6H4Z',
  ),
  social: (
    <>
      <circle cx="8.5" cy="7.5" r="4" />
      <path d="M1 21.5c.3-5 3.2-7.6 7.5-7.6s7.2 2.6 7.5 7.6Z" />
      <circle cx="17.2" cy="8.6" r="3.1" />
      <path d="M17.6 13.4c3.4.2 5.2 2.5 5.4 6.1h-5.1c-.2-2.4-1-4.4-2.4-5.6.6-.3 1.3-.5 2.1-.5Z" />
    </>
  ),
};

export function HudGlyph({ name, className = '' }: { name: HudGlyphName; className?: string }) {
  return (
    <svg
      className={`hud-glyph ${className}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="0.8"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyphs[name]}
    </svg>
  );
}

export function skillGlyph(skillId: string): HudGlyphName | null {
  if (!skillId.startsWith('skill_thunder_')) return null;
  if (skillId.includes('step')) return 'bolt';
  if (skillId.includes('leap')) return 'leap';
  if (skillId.includes('arc')) return 'arc';
  if (skillId.includes('field')) return 'field';
  if (skillId.includes('pierce')) return 'pierce';
  if (skillId.includes('judgement')) return 'judgement';
  if (skillId.includes('execution')) return 'blade';
  return 'bolt';
}
