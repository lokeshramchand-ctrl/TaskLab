'use client';
import { create } from 'zustand';

const useToast = create<{ msg: string | null; key: number }>(() => ({ msg: null, key: 0 }));
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string) {
  clearTimeout(timer);
  useToast.setState((s) => ({ msg, key: s.key + 1 }));
  timer = setTimeout(() => useToast.setState({ msg: null }), 2200);
}

export function ToastHost() {
  const { msg, key } = useToast();
  if (!msg) return null;
  return (
    <div key={key} className="toast fade-in" role="status">
      {msg}
      <style jsx>{`
        .toast { position: fixed; left: 50%; bottom: calc(var(--player-h) + 40px); transform: translateX(-50%); z-index: 90; background: var(--surface); color: var(--text); border: 1px solid var(--border-2); padding: 8px 14px; border-radius: 6px; font-weight: 400; font-size: 13px; box-shadow: var(--lift-hi); }
        @media (max-width: 900px) { .toast { bottom: calc(var(--player-h) + 118px); } }
      `}</style>
    </div>
  );
}
