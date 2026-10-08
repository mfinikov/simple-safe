import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import '@/components/lime/styles.css';
import './accent.css';
import {LimePortalProvider} from '@/lib/lime/portal';

export const metadata: Metadata = {
  title: 'Simple Safe',
  description: 'A locked box for your crypto on the Sepolia test network. Only your wallet can take money out.',
};

// Follow the device: Lime's dark theme is switched with data-theme, set before the first paint.
// The circuit board reads a "dark" class instead, so set both.
const theme = `const dark = matchMedia('(prefers-color-scheme: dark)').matches; document.body.dataset.theme = dark ? 'dark' : 'light'; document.body.classList.toggle('dark', dark)`;

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <body className="lime m-0 min-h-dvh bg-page text-fg" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{__html: theme}}/>
        <LimePortalProvider>{children}</LimePortalProvider>
      </body>
    </html>
  );
}
