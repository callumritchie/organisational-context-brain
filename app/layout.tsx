import type { Metadata } from 'next';
import '@xyflow/react/dist/style.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Northstar Context — Organisational Context Brain',
  description: 'A permission-aware, provenance-rich organisational context service.',
  openGraph: {
    title: 'Northstar Context',
    description: 'Evidence, entities, relationships and permissions resolved into reusable organisational context.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
