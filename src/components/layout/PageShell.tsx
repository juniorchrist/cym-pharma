import React from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { FloatingActions } from './FloatingActions';
import { CartDrawer } from '../cart/CartDrawer';
import { BottomNav } from './BottomNav';

interface PageShellProps {
  children: React.ReactNode;
  hideFooter?: boolean;
}

export const PageShell: React.FC<PageShellProps> = ({ children, hideFooter = false }) => {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)]">
      <Navbar />
      <CartDrawer />
      <main className="flex-1 w-full pb-[72px] lg:pb-0">
        {children}
      </main>
      {!hideFooter && <Footer />}
      <FloatingActions />
      <BottomNav />
    </div>
  );
};

