import { useEffect, useState } from "react";
import { realmName } from "./content";
import {
  type CharacterSummary,
  createCharacter,
  type GameSession,
  listCharacters,
  login,
  refresh,
  register,
  startSession,
} from "./online";

export interface OnlineChoice {
  characterId: string;
  session: GameSession;
}

/** Login → character select → play. Only shown in online mode (`?online`). */
export function Login({ onPlay }: { onPlay: (choice: OnlineChoice) => void }) {
  const [stage, setStage] = useState<"login" | "characters">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newName, setNewName] = useState("");
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
    setStage("characters");
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
      {stage === "login" ? (
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
          {characters.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  onPlay({
                    characterId: c.id,
                    session: await startSession(c.id),
                  }),
                )
              }
            >
              <strong>{c.name}</strong> · {realmName(c.realm)}
            </button>
          ))}
          {characters.length < 4 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await createCharacter(newName);
                  setNewName("");
                  await loadCharacters();
                });
              }}
            >
              <input
                placeholder="Tên nhân vật mới"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button
                type="submit"
                disabled={busy || newName.trim().length < 2}
              >
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
