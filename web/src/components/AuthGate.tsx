'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/player/sync';

/** Blocks the app behind the owner login (or first-run account creation). */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, error, needsCode, refresh, submit } = useAuth();
  const [code, setCode] = useState('');
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (status === 'ready') return <>{children}</>;
  if (status === 'loading') return <div className="gate" />;
  const mode = status === 'setup' ? 'setup' : 'login';
  return (
    <div className="gate">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await submit(mode, u, p, code);
          setBusy(false);
        }}
      >
        <div className="mk"><span className="mark" /><b>LoMu</b></div>
        <h1>{mode === 'setup' ? 'Create your account' : 'Welcome back'}</h1>
        <p>{mode === 'setup' ? 'One account for you. It syncs this browser and your phone.' : 'Sign in to your LoMu.'}</p>
        <input autoFocus placeholder="Username" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} />
        <input
          type="password"
          placeholder={mode === 'setup' ? 'Password (8+ characters)' : 'Password'}
          autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
          value={p}
          onChange={(e) => setP(e.target.value)}
        />
        {mode === 'setup' && needsCode && <input placeholder="Setup code (from the server config)" value={code} onChange={(e) => setCode(e.target.value)} />}
        {error && <div className="err">{error}</div>}
        <button disabled={busy || !u || !p}>{mode === 'setup' ? 'Create account' : 'Sign in'}</button>
      </form>
      <style jsx>{`
        .gate { position: fixed; inset: 0; display: grid; place-items: center; background: var(--bg); padding: 24px; z-index: 100; }
        form { width: min(360px, 100%); display: flex; flex-direction: column; gap: 8px; padding: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--lift-hi); }
        .mk { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .mark { width: 24px; height: 24px; border-radius: 6px; background: linear-gradient(180deg, var(--signal-hi), var(--signal)); }
        .mk b { font-size: 14px; font-weight: 600; letter-spacing: -.005em; color: var(--ink); }
        h1 { font-size: 20px; font-weight: 500; line-height: 1.3; margin: 0; letter-spacing: -.01em; }
        p { color: var(--muted); margin: 0 0 8px; }
        input { height: 32px; padding: 0 10px; border-radius: 5px; font-size: 13px; border: 1px solid var(--border-2); background: var(--surface); color: var(--text); font: inherit; outline: none; transition: border-color .2s, box-shadow .2s; }
        input:focus { border-color: var(--signal); box-shadow: 0 0 0 2px var(--signal-soft); }
        button { height: 32px; border-radius: 5px; border: 0; background: var(--signal); color: #fff; font-size: 13px; font: inherit; font-weight: 500; cursor: pointer; margin-top: 4px; transition: transform .3s var(--spring); }
        button:active { transform: scale(.97); }
        button:disabled { opacity: .4; cursor: not-allowed; }
        .err { color: var(--red-t); font-size: 13px; background: var(--red-soft); padding: 8px 10px; border-radius: 5px; }
      `}</style>
    </div>
  );
}
