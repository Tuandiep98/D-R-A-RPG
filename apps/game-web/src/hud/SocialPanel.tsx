import { useCallback, useEffect, useState } from "react";
import { realmName } from "../content";
import {
  acceptFriend,
  addFriend,
  createGuild,
  fetchSocial,
  joinGuild,
  leaveGuild,
  removeFriend,
  type SocialState,
} from "../online";
import { useUiStore } from "../store";

/** Friends and guild (online only, via the API). */
export function SocialPanel() {
  const close = useUiStore((s) => s.closePanel);
  const characterId = useUiStore((s) => s.characterId);
  const [data, setData] = useState<SocialState | null>(null);
  const [friendName, setFriendName] = useState("");
  const [guildName, setGuildName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!characterId) return;
    setData(await fetchSocial(characterId));
  }, [characterId]);
  useEffect(() => {
    void reload().catch((e: Error) => setMsg(e.message));
  }, [reload]);

  const act = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  if (!characterId) {
    return (
      <div
        className="panel panel-small"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <strong>Bạn bè & Bang hội</strong>
          <button type="button" onClick={close}>
            ✕
          </button>
        </div>
        <span className="muted">Cần đăng nhập tài khoản (chế độ online).</span>
      </div>
    );
  }

  return (
    <div
      className="panel panel-small"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="panel-head">
        <strong>Bạn bè & Bang hội</strong>
        <button type="button" onClick={close}>
          ✕
        </button>
      </div>
      <strong className="small">Bạn bè</strong>
      <div className="npc-list">
        {data?.friends.length === 0 && (
          <span className="muted small">Chưa có bạn bè</span>
        )}
        {data?.friends.map((f) => (
          <div key={f.id} className="npc-row">
            <span>
              {f.name} <span className="muted small">{realmName(f.realm)}</span>
              {f.status === "incoming" && (
                <span className="small reward"> · muốn kết bạn</span>
              )}
              {f.status === "outgoing" && (
                <span className="small muted"> · đã gửi lời mời</span>
              )}
            </span>
            <span>
              {f.status === "incoming" && (
                <button
                  type="button"
                  onClick={() =>
                    void act(() => acceptFriend(characterId, f.id))
                  }
                >
                  Đồng ý
                </button>
              )}
              <button
                type="button"
                onClick={() => void act(() => removeFriend(characterId, f.id))}
              >
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
      <form
        className="row-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() => addFriend(characterId, friendName)).then(() =>
            setFriendName(""),
          );
        }}
      >
        <input
          placeholder="Tên nhân vật"
          value={friendName}
          onChange={(e) => setFriendName(e.target.value)}
        />
        <button type="submit" disabled={friendName.trim().length < 2}>
          Kết bạn
        </button>
      </form>

      <strong className="small">Bang hội</strong>
      {data?.guild ? (
        <div className="npc-list">
          <div className="npc-row">
            <strong>{data.guild.name}</strong>
            <button
              type="button"
              onClick={() => void act(() => leaveGuild(characterId))}
            >
              Rời bang
            </button>
          </div>
          {data.guild.members.map((m) => (
            <div key={m.id} className="small">
              {m.rank === "leader" ? "★ " : ""}
              {m.name} · {realmName(m.realm)}
            </div>
          ))}
        </div>
      ) : (
        <form
          className="row-form"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <input
            placeholder="Tên bang"
            value={guildName}
            onChange={(e) => setGuildName(e.target.value)}
          />
          <button
            type="button"
            disabled={guildName.trim().length < 3}
            onClick={() => void act(() => joinGuild(characterId, guildName))}
          >
            Gia nhập
          </button>
          <button
            type="button"
            disabled={guildName.trim().length < 3}
            onClick={() => void act(() => createGuild(characterId, guildName))}
          >
            Lập bang
          </button>
        </form>
      )}
      {msg && <span className="small missing">{msg}</span>}
    </div>
  );
}
