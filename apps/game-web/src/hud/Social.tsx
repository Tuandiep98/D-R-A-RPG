import { useEffect, useRef, useState } from 'react';
import { realmName } from '../content';
import { effectiveScheme, useControls } from '../controls';
import { game } from '../game';
import { fetchLeaderboard } from '../online';
import { useUiStore } from '../store';

const NO_QUESTS: never[] = [];

/** Active quests with objective counters (right side). */
export function QuestTracker() {
  // Stable fallback: a fresh [] per call would make Zustand re-render forever.
  const quests = useUiStore((s) => s.ui?.quests ?? NO_QUESTS);
  if (quests.length === 0) return null;
  return (
    <div className="quest-tracker">
      {quests.slice(0, 4).map((q) => (
        <div key={q.questId} className={`quest ${q.status === 'ready' ? 'quest-ready' : ''}`}>
          <strong>{q.name}</strong>
          {q.status === 'ready' ? (
            <div className="small">✔ Quay về trả nhiệm vụ</div>
          ) : (
            q.objectives.map((o) => (
              <div key={o.text} className="small">
                {o.text} {Math.min(o.current, o.required)}/{o.required}
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

/** Map chat. Enter focuses the input; the host enforces length, rate and mutes. */
export function ChatBox() {
  const messages = useUiStore((s) => s.chat);
  const touch = useControls((s) => effectiveScheme(s) === 'touch');
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && document.activeElement !== input.current) {
        // Focus synchronously so keys typed right after Enter are not lost.
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  });

  return (
    <div className={`chat ${open ? 'chat-open' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
      {touch && !open && (
        <button
          type="button"
          className="chat-toggle"
          onClick={() => {
            setOpen(true);
            requestAnimationFrame(() => input.current?.focus());
          }}
        >
          Chat{messages.length > 0 ? ` · ${messages.length}` : ''}
        </button>
      )}
      <div className="chat-list" ref={list}>
        {messages.slice(-30).map((m) => (
          <div
            key={`${m.at}-${m.fromId}-${m.text}`}
            className={m.channel === 'system' ? 'chat-system' : ''}
          >
            <strong>{m.fromName}:</strong> {m.text}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) game()?.sendChat(text.trim());
          setText('');
          input.current?.blur();
          setOpen(false);
        }}
      >
        <input
          ref={input}
          value={text}
          maxLength={140}
          placeholder="Enter để chat…"
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') input.current?.blur();
            e.stopPropagation();
          }}
        />
      </form>
    </div>
  );
}

/** Online only: top characters from the API. */
export function LeaderboardPanel() {
  const close = useUiStore((s) => s.closePanel);
  const [rows, setRows] = useState<{ name: string; realm: string; nodes: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchLeaderboard()
      .then((r) => setRows(r.leaderboard))
      .catch((e: Error) => setError(e.message));
  }, []);
  return (
    <div className="panel panel-small" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-head">
        <strong>Bảng xếp hạng</strong>
        <button type="button" onClick={close}>
          ✕
        </button>
      </div>
      {error && <span className="muted">{error}</span>}
      {!rows && !error && <span className="muted">Đang tải…</span>}
      <ol className="leaderboard">
        {rows?.map((r) => (
          <li key={r.name}>
            <span>{r.name}</span>
            <span className="muted">
              {realmName(r.realm)} · {r.nodes} node
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
