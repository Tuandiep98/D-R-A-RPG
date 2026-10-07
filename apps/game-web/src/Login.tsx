import type { Element } from '@rpg/game-protocol';
import { useEffect, useState } from 'react';
import { realmName } from './content';
import { ELEMENTS, elementName } from './elements';
import {
  type CharacterSummary,
  chooseLegacyElement,
  createCharacter,
  type GameSession,
  listCharacters,
  login,
  refresh,
  register,
  startSession,
} from './online';

export interface OnlineChoice {
  characterId: string;
  session: GameSession;
}

/** Login → character select → play. Only shown in online mode (`?online`). */
export function Login({ onPlay }: { onPlay: (choice: OnlineChoice) => void }) {
  const [stage, setStage] = useState<'login' | 'characters'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [element, setElement] = useState<Element>('moc');
  const [expression, setExpression] = useState<'base' | 'thunder' | 'ice'>('thunder');
  const [newName, setNewName] = useState('');
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const loadCharacters = async () => {
    setCharacters((await listCharacters()).characters);
    setStage('characters');
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    void refresh().then(async (ok) => {
      if (ok) await loadCharacters();
    });
  }, []);

  return (
    <div className="login" onPointerDown={(e) => e.stopPropagation()}>
      <h1>Thiên Cơ Kỷ</h1>
      {stage === 'login' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await login(username, password);
              await loadCharacters();
            });
          }}
        >
          <input
            placeholder="Tên đăng nhập"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            placeholder="Mật khẩu (≥ 8 ký tự)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button type="submit" disabled={busy}>
            Đăng nhập
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await register(username, password);
                await login(username, password);
                await loadCharacters();
              })
            }
          >
            Tạo tài khoản
          </button>
        </form>
      ) : (
        <div className="chars">
          <label>
            Ngũ hành bản mệnh
            <select
              value={element}
              disabled={busy}
              onChange={(e) => {
                setElement(e.target.value as Element);
                setExpression('base');
              }}
            >
              {ELEMENTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          {element === 'moc' && (
            <label>
              Biểu hiện
              <select
                value={expression}
                disabled={busy}
                onChange={(e) => setExpression(e.target.value as 'base' | 'thunder')}
              >
                <option value="base">Sinh khí</option>
                <option value="thunder">Lôi</option>
              </select>
            </label>
          )}
          <p>
            {ELEMENTS.find((e) => e.id === element)?.hint}. Bản mệnh khóa đến late game, dùng cho cả
            kiếm và súng.
          </p>
          {characters.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!c.element) await chooseLegacyElement(c.id, element, expression);
                  onPlay({ characterId: c.id, session: await startSession(c.id) });
                })
              }
            >
              <strong>{c.name}</strong> · {realmName(c.realm)} · {elementName(c.element)}
              {!c.element ? ' (gắn hành đang chọn khi vào game)' : ''}
            </button>
          ))}
          {characters.length < 4 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await createCharacter(newName, element, expression);
                  setNewName('');
                  await loadCharacters();
                });
              }}
            >
              <input
                placeholder="Tên nhân vật mới"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button type="submit" disabled={busy || newName.trim().length < 2}>
                Tạo nhân vật
              </button>
            </form>
          )}
        </div>
      )}
      {error && <div className="login-error">{error}</div>}
    </div>
  );
}
