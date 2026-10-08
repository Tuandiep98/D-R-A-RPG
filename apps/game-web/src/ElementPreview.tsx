import { elementColor } from '@rpg/babylon-renderer';
import type { Element, Expression } from '@rpg/game-data';
import { type CSSProperties, useState } from 'react';
import { sharedContent } from './content';
import { elementName } from './elements';
import { HudGlyph } from './hud/HudGlyph';

const actions = [
  { id: 'basic', name: 'Đánh thường' },
  { id: 'roll', name: 'Lộn' },
  { id: 'blink', name: 'Tốc biến' },
  { id: 'jump', name: 'Nhảy' },
] as const;
export function ElementPreview({
  element,
  expression,
}: {
  element: Element;
  expression: Expression;
}) {
  const [action, setAction] = useState<(typeof actions)[number]['id']>('basic');
  const [weapon, setWeapon] = useState<'blade' | 'gun'>('blade');
  const [replay, setReplay] = useState(0);
  const skill = [...sharedContent().skills.values()].find((s) => s.mobility === action);
  const note =
    action === 'basic'
      ? 'Vệt kiếm và đạn cùng mang bản mệnh. Đòn định hướng có thể hụt.'
      : action === 'roll'
        ? 'Né trong cửa sổ lộn; vẫn bị tường chặn.'
        : action === 'blink'
          ? 'Dịch chuyển ngắn, không xuyên tường và không có cửa sổ miễn sát thương.'
          : 'Chỉ né đòn thấp trong cửa sổ nhảy, không né mọi đòn đánh.';
  return (
    <section
      className="element-preview"
      aria-label="Xem trước bản mệnh"
      style={{ '--preview-color': elementColor(element, expression) } as CSSProperties}
    >
      <div className="preview-heading">
        <strong>
          {elementName(element)}
          {expression === 'thunder' ? ' · Lôi' : expression === 'ice' ? ' · Băng' : ''}
        </strong>
        <span>Minh họa biểu hiện</span>
      </div>
      <fieldset className="preview-weapons" aria-label="Vũ khí xem trước">
        {(['blade', 'gun'] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={weapon === id}
            onClick={() => {
              setWeapon(id);
              setReplay((v) => v + 1);
            }}
          >
            <HudGlyph name={id} />
            {id === 'blade' ? 'Kiếm' : 'Súng'}
          </button>
        ))}
      </fieldset>
      <div
        key={`${element}:${expression}:${weapon}:${action}:${replay}`}
        className={`preview-arena preview-${action} preview-${weapon}`}
        aria-hidden="true"
      >
        <span className="preview-track" />
        <span className="preview-actor">
          <HudGlyph name="character" />
        </span>
        <span className="preview-effect">
          <HudGlyph name={weapon === 'blade' ? 'arc' : 'pierce'} />
        </span>
        <span className="preview-target">
          <HudGlyph name="target" />
        </span>
      </div>
      <fieldset className="preview-actions" aria-label="Động tác xem trước">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={action === a.id}
            onClick={() => {
              setAction(a.id);
              setReplay((v) => v + 1);
            }}
          >
            {a.name}
          </button>
        ))}
      </fieldset>
      <p className="preview-note" aria-live="polite">
        {note}
        {skill ? ` Hồi ${skill.cooldown} giây.` : ''}
      </p>
    </section>
  );
}
