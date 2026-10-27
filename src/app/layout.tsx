import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'buildR — ATS resume optimization',
  description: 'Agentic ATS resume optimization with claim-level verification',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
          <Link href="/" className="text-lg font-bold tracking-tight">
            buildR<span className="text-[var(--success)]">.</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-[var(--muted)]">
            <Link href="/" className="hover:text-[var(--foreground)]">
              My resumes
            </Link>
            <Link href="/runs" className="hover:text-[var(--foreground)]">
              Verification logs
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-[1400px] p-6 md:p-8">{children}</main>
      </body>
    </html>
  );
}
