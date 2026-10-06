import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

/**
 * Staff tool (tech plan §40). Talks only to the API server; every action is
 * authorised server-side (RBAC + TOTP) and written to the audit log.
 * The access token lives in memory only: closing the tab logs out.
 */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
let token: string | null = null;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

interface CharacterSummary {
  id: string;
  accountId: string;
  name: string;
  /** Realm id — characters have no level (master plan §31). */
  realm: string;
  mapId: string;
}
interface CharacterDetail {
  character: CharacterSummary & {
    save: {
      gold: number;
      nodes: string[];
      inventory: { instanceId: string; itemId: string; count: number }[];
      equipment: Record<string, string>;
    };
    x: number | null;
    z: number | null;
  };
  ledger: {
    id: string;
    amount: number;
    balanceAfter: number;
    reason: string;
    createdAt: string;
  }[];
}
interface AuditEntry {
  id: string;
  actorAccountId: string | null;
  action: string;
  target: string | null;
  payload: unknown;
  createdAt: string;
}

function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      const res = await api<{ accessToken?: string; mfaRequired?: boolean }>('/auth/login', {
        username,
        password,
        ...(totp ? { totp } : {}),
      });
      if (res.mfaRequired) {
        setError('Nhập mã 6 số từ ứng dụng xác thực');
        return;
      }
      token = res.accessToken ?? null;
      // Staff without TOTP yet: start enrolment instead of entering the tool.
      try {
        await api('/admin/audit');
        onDone();
      } catch {
        setSetup(await api('/auth/mfa/setup', {}));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const enable = async () => {
    if (!setup) return;
    try {
      await api('/auth/mfa/enable', { secret: setup.secret, code: totp });
      setSetup(null);
      setTotp('');
      setError('Đã bật 2FA. Đăng nhập lại với mã mới.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="card narrow">
      <h1>Quản trị Thiên Cơ Kỷ</h1>
      {setup ? (
        <>
          <p>
            Thêm khoá này vào ứng dụng xác thực (Google Authenticator, 1Password…), rồi nhập mã:
          </p>
          <code className="secret">{setup.secret}</code>
          <a href={setup.uri}>Mở bằng ứng dụng xác thực</a>
          <input
            placeholder="Mã 6 số"
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            inputMode="numeric"
          />
          <button type="button" onClick={() => void enable()}>
            Bật 2FA
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            placeholder="Tên đăng nhập"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            placeholder="Mật khẩu"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <input
            placeholder="Mã 2FA (nếu đã bật)"
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          <button type="submit">Đăng nhập</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Character({ id, items }: { id: string; items: { id: string; name: string }[] }) {
  const [detail, setDetail] = useState<CharacterDetail | null>(null);
  const [itemId, setItemId] = useState('');
  const [count, setCount] = useState(1);
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(24);
  const [msg, setMsg] = useState<string | null>(null);
  const load = async () => setDetail(await api<CharacterDetail>(`/admin/characters/${id}`));
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the selection changes
  useEffect(() => {
    void load();
  }, [id]);
  if (!detail) return <div className="card">Đang tải…</div>;
  const c = detail.character;
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };
  return (
    <div className="card">
      <h2>
        {c.name} · {c.realm}
      </h2>
      <p className="muted">
        {c.mapId} ({c.x?.toFixed(1)}, {c.z?.toFixed(1)}) · vàng {c.save.gold} ·{' '}
        {c.save.nodes.length} node · tài khoản {c.accountId}
      </p>
      <h3>Túi đồ</h3>
      <table>
        <tbody>
          {c.save.inventory.map((i) => (
            <tr key={i.instanceId}>
              <td>{items.find((x) => x.id === i.itemId)?.name ?? i.itemId}</td>
              <td>×{i.count}</td>
              <td className="muted">
                {Object.entries(c.save.equipment).find(([, v]) => v === i.instanceId)?.[0] ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Tặng vật phẩm</h3>
      <p className="muted">
        Chỉ áp dụng khi nhân vật đang offline (game server sẽ ghi đè khi lưu nếu đang online).
      </p>
      <div className="row">
        <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">— chọn —</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={999}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <input
          placeholder="Lý do (bắt buộc)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          type="button"
          disabled={!itemId || reason.length < 3}
          onClick={() =>
            void act(
              () =>
                api(`/admin/characters/${id}/give-item`, {
                  itemId,
                  count,
                  reason,
                }),
              'Đã tặng',
            )
          }
        >
          Tặng
        </button>
      </div>
      <h3>Xử phạt tài khoản</h3>
      <div className="row">
        <input
          type="number"
          min={0}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          title="Số giờ (0 = gỡ)"
        />
        <button
          type="button"
          disabled={reason.length < 3}
          onClick={() =>
            void act(
              () =>
                api(`/admin/accounts/${c.accountId}/sanction`, {
                  kind: 'mute',
                  hours,
                  reason,
                }),
              'Đã cấm chat',
            )
          }
        >
          Cấm chat
        </button>
        <button
          type="button"
          className="danger"
          disabled={reason.length < 3}
          onClick={() =>
            void act(
              () =>
                api(`/admin/accounts/${c.accountId}/sanction`, {
                  kind: 'ban',
                  hours,
                  reason,
                }),
              'Đã khoá',
            )
          }
        >
          Khoá tài khoản
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      <h3>Sổ giao dịch vàng</h3>
      <table>
        <tbody>
          {detail.ledger.map((l) => (
            <tr key={l.id}>
              <td>{new Date(l.createdAt).toLocaleString('vi-VN')}</td>
              <td className={l.amount < 0 ? 'neg' : 'pos'}>
                {l.amount > 0 ? `+${l.amount}` : l.amount}
              </td>
              <td>{l.balanceAfter}</td>
              <td>{l.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tool() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CharacterSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    void api<{ items: { id: string; name: string }[] }>('/content/items').then((r) =>
      setItems(r.items),
    );
    void api<{ entries: AuditEntry[] }>('/admin/audit').then((r) => setAudit(r.entries));
  }, []);
  return (
    <div className="layout">
      <div className="card">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void api<{ characters: CharacterSummary[] }>(
              `/admin/characters?q=${encodeURIComponent(q)}`,
            ).then((r) => setResults(r.characters));
          }}
        >
          <input placeholder="Tìm nhân vật" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit">Tìm</button>
        </form>
        <ul className="list">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={selected === c.id ? 'active' : ''}
                onClick={() => setSelected(c.id)}
              >
                {c.name} · {c.realm} · {c.mapId}
              </button>
            </li>
          ))}
        </ul>
        <h3>Nhật ký thao tác</h3>
        <ul className="audit">
          {audit.slice(0, 40).map((a) => (
            <li key={a.id}>
              <span className="muted">{new Date(a.createdAt).toLocaleString('vi-VN')}</span>{' '}
              {a.action} {a.target ?? ''}
            </li>
          ))}
        </ul>
      </div>
      {selected ? (
        <Character id={selected} items={items} />
      ) : (
        <div className="card muted">Chọn một nhân vật</div>
      )}
    </div>
  );
}

function App() {
  const [ready, setReady] = useState(false);
  return ready ? <Tool /> : <Login onDone={() => setReady(true)} />;
}

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
