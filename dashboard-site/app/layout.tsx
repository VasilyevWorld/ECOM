import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ecom — дашборды собственника',
  description: 'Публичные дашборды результата и здоровья бизнеса Ecom с автоматическим обновлением данных.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
