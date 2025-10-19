import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'OpenPayG Dashboard',
  description: 'Self-hosted Alchemy PAYG analytics dashboard'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
