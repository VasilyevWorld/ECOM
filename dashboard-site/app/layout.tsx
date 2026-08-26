import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Результат Ecom',
  description: 'Публичный дашборд ключевых показателей Ecom с автоматическим обновлением данных.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
