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
  | 'social';

const glyphs: Record<HudGlyphName, ReactNode> = {
  blade: <path d="m5 19 3-3m1-1 9-11 2 2-9 11-3 1 1-3Zm-3-4 4 4m-2 3 2-2" />,
  gun: <path d="M3 9h15l3 3-3 3h-4l-2 5H8l1-5H3V9Zm5 0V6h6v3m-1 6h-3" />,
  bolt: <path d="M14 2 5 13h6l-1 9 9-12h-6l1-8Z" />,
  arc: <path d="M3 16c2-6 6-9 11-9m-9 12c3-4 7-6 13-6M15 3l-2 5 5-1m2 5-5 1 3 4" />,
  field: (
    <>
      <path d="m12 3 8 5v8l-8 5-8-5V8l8-5Z" />
      <path d="m12 7 4 3v4l-4 3-4-3v-4l4-3Zm0-4v4m8 1-4 2m4 6-4-2m-4 7v-4m-8-1 4-2M4 8l4 2" />
    </>
  ),
  pierce: (
    <>
      <path d="M3 12h15m-6-6 7 6-7 6M6 7l3 5-3 5" />
      <path d="M3 5h4M3 19h4" />
    </>
  ),
  judgement: (
    <>
      <path d="m12 2 7 8-7 12-7-12 7-8Z" />
      <path d="m13 5-5 8h4l-1 6 5-8h-4l1-6Z" />
    </>
  ),
  leap: (
    <>
      <path d="M4 18h5l4-4 6 4M4 11l5-4 3 3 5-6" />
      <path d="M17 3v5h4" />
    </>
  ),
  shield: <path d="m12 2 8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6l8-4Zm0 4v12m-5-8h10" />,
  skills: (
    <>
      <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z" />
      <path d="M12 7v10M7 12h10" />
    </>
  ),
  pack: (
    <>
      <path d="M7 7V5a5 5 0 0 1 10 0v2m-12 0h14l2 14H3L5 7Z" />
      <path d="M9 7v4m6-4v4m-5 5h4" />
    </>
  ),
  character: (
    <>
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm-9 9c1-5 4-7 9-7s8 2 9 7H3Z" />
    </>
  ),
  cultivation: (
    <>
      <path d="m12 2 8 10-8 10L4 12 12 2Z" />
      <path d="M12 6v12M8 12h8" />
    </>
  ),
  settings: (
    <>
      <path d="m12 2 2 2 3-.5.8 3 2.7 1.5-1 3 1 3-2.7 1.5-.8 3-3-.5-2 2-2-2-3 .5-.8-3L3.5 14l1-3-1-3L6.2 6.5l.8-3 3 .5 2-2Z" />
      <circle cx="12" cy="11" r="3" />
    </>
  ),
  menu: (
    <>
      <path d="M3 5h18M3 12h18M3 19h18" />
      <path d="m5 3 2 2-2 2m12 10 2 2-2 2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v5m0 12v5M1 12h5m12 0h5" />
    </>
  ),
  fullscreen: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />,
  close: <path d="M4 4 20 20M20 4 4 20" />,
  swap: <path d="M4 7h16l-4-4m4 4-4 4M20 17H4l4-4m-4 4 4 4" />,
  reload: (
    <>
      <path d="M20 9a8 8 0 1 0 .5 5M20 4v5h-5" />
      <path d="M11 7v5l3 2" />
    </>
  ),
  potion: (
    <>
      <path d="M9 2h6m-5 0v6l-5 8a4 4 0 0 0 3.5 6h7a4 4 0 0 0 3.5-6l-5-8V2" />
      <path d="M7 16h10" />
    </>
  ),
  ranking: (
    <>
      <path d="M6 3h12v7a6 6 0 0 1-12 0V3Zm0 2H3v3a4 4 0 0 0 4 4m11-7h3v3a4 4 0 0 1-4 4m-5 4v4m-5 0h10" />
    </>
  ),
  social: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2" />
      <path d="M3 20c0-4 2-6 6-6s6 2 6 6H3Zm13-6c3 0 5 2 5 6h-4" />
    </>
  ),
};

export function HudGlyph({ name, className = '' }: { name: HudGlyphName; className?: string }) {
  return (
    <svg
      className={`hud-glyph ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
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
