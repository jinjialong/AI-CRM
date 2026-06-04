'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth-context';
import { RightChatPanel } from '@/components/assistant/right-chat-panel';
import { Sidebar } from '@/components/layout/sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [assistantOpen, setAssistantOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user && pathname !== '/login') {
      router.replace('/login');
    }
  }, [loading, pathname, router, user]);

  useEffect(() => {
    const saved = window.localStorage.getItem('assistant_panel_open');
    if (saved === '0') {
      setAssistantOpen(false);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('assistant_panel_open', assistantOpen ? '1' : '0');
  }, [assistantOpen]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-canvas)',
        }}
      >
        <div className="card" style={{ padding: 24 }}>
          正在加载系统...
        </div>
      </div>
    );
  }

  if (!user && pathname !== '/login') {
    return null;
  }

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <div className="page-shell">
      <Sidebar />
      <main
        className="page-main"
        style={{
          marginRight: assistantOpen ? 420 : 0,
          transition: 'margin-right 0.18s ease',
        }}
      >
        {children}
      </main>
      <RightChatPanel open={assistantOpen} onOpenChange={setAssistantOpen} />
    </div>
  );
}
