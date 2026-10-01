import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Kargo Hiring',
  description: 'Internal CV screening for the Product Manager and Senior Product Manager roles',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-50 font-sans text-zinc-900">
        <nav className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3 text-sm">
            <span className="font-semibold">Kargo Hiring</span>
            <Link href="/" className="text-zinc-600 hover:text-zinc-900">Upload a CV</Link>
            <Link href="/dashboard" className="text-zinc-600 hover:text-zinc-900">Dashboard</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
