import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'buildR — ATS resume optimization',
  description: 'Agentic ATS resume optimization with claim-level verification',
};

const nav = [
  { href: '/', label: 'Dashboard' },
  { href: '/profiles/new', label: 'New Profile' },
  { href: '/jds/new', label: 'New JD' },
  { href: '/runs', label: 'Runs' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen">
          <aside className="w-56 shrink-0 border-r border-[var(--border)] p-4">
            <div className="mb-6">
              <div className="text-lg font-bold tracking-tight">buildR</div>
              <div className="text-xs text-[var(--muted)]">ATS resume optimizer</div>
            </div>
            <nav className="flex flex-col gap-1 text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-[var(--foreground)] hover:bg-[var(--card)]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1 overflow-x-hidden p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
