import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import NavLinks from '@/components/NavLinks';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Kargo Hiring',
  description: 'Rank, understand and answer every PM and Senior PM application. The system recommends; you decide.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-50 font-sans text-zinc-900">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-sm font-bold text-white">K</span>
              <div className="leading-tight">
                <div className="whitespace-nowrap text-sm font-semibold">Kargo Hiring</div>
                <div className="hidden text-xs text-zinc-500 sm:block">Product Manager · Senior Product Manager</div>
              </div>
            </div>
            <NavLinks />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
