import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';
import { Providers } from '@/components/Providers';
import { StyleRegistry } from '@/components/StyleRegistry';
import './globals.css';

// Figtree: an open-licence geometric sans that sits very close to Spotify's own (proprietary) Circular-based face.
const sans = Figtree({ subsets: ['latin'], variable: '--font-ui', display: 'swap', weight: ['300', '400', '500', '600', '700', '800', '900'] });

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
    { media: '(prefers-color-scheme: light)', color: '#ededed' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable} data-theme="dark" suppressHydrationWarning>
      <body>
        <StyleRegistry>
          <Providers>{children}</Providers>
        </StyleRegistry>
      </body>
    </html>
  );
}
