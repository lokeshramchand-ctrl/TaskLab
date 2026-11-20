import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/Providers';
import { StyleRegistry } from '@/components/StyleRegistry';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'LoMu', template: '%s · LoMu' },
  description: 'LoMu — your music, everywhere.',
  applicationName: 'LoMu',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/favicon-48.png', sizes: '48x48' }, { url: '/icon-192.png', sizes: '192x192' }], apple: '/apple-icon.png' },
  appleWebApp: { capable: true, title: 'LoMu', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfb' },
    { media: '(prefers-color-scheme: dark)', color: '#090909' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <StyleRegistry>
          <Providers>{children}</Providers>
        </StyleRegistry>
      </body>
    </html>
  );
}
