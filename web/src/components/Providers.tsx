'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Sidebar, Topbar, MobileTabs } from './Nav';
import { PlayerBar } from './PlayerBar';
import { FullPlayer } from './FullPlayer';
import { TrackMenuHost } from './Menu';
import { ToastHost } from './Toast';
import { AuthGate } from './AuthGate';
import { ConnectHost } from './Devices';
import { useSettings } from '@/player/settings';

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  const mini = useSettings((s) => s.sideMini);

  return (
    <QueryClientProvider client={qc}>
      <AuthGate>
        <div className="app" style={mini ? ({ ['--side-w' as string]: '72px' } as React.CSSProperties) : undefined}>
          <Sidebar />
          <div className="col">
            <Topbar />
            <main className="content">{children}</main>
          </div>
          <PlayerBar />
          <MobileTabs />
        </div>
        <ConnectHost />
        <FullPlayer />
        <TrackMenuHost />
        <ToastHost />
      </AuthGate>
      <style jsx>{`
        .col { min-width: 0; display: flex; flex-direction: column; }
      `}</style>
    </QueryClientProvider>
  );
}
