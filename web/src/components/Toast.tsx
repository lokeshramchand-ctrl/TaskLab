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
        .toast { position: fixed; left: 50%; bottom: calc(var(--player-h) + 40px); transform: translateX(-50%); z-index: 90; background: #ffffff; color: #000000; padding: 12px 20px; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 8px 24px rgba(0, 0, 0, .5); }
        @media (max-width: 900px) { .toast { bottom: calc(var(--player-h) + 118px); } }
      `}</style>
    </div>
  );
}
