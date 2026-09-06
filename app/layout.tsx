import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Form — 3D Workshop',
  icons: { icon: '/favicon.svg' },
  description:
    'Create and refine functional 3D parts with an AI design assistant.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
