'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/lib/auth-context';

const baseNavItems = [
  { label: '数据概览', href: '/dashboard' },
  { label: '我的线索', href: '/leads' },
  { label: '公共线索池', href: '/public-pool' },
  { label: '我的客户', href: '/customers' },
  { label: '我的日报', href: '/daily-reports' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  if (!user) return null;

  const navItems = [
    ...baseNavItems,
    ...(user.role === '销售经理' || user.role === '系统管理员'
      ? [
          { label: '团队日报', href: '/team/reports' },
          { label: '团队概览', href: '/team/overview' },
          { label: '团队线索', href: '/team/leads' },
        ]
      : []),
  ];

  return (
    <aside
      style={{
        width: 220,
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        background: 'var(--bg-sidebar)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '22px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800 }}>智能原生客户关系管理</div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
          第一期演示版本
        </div>
      </div>
      <nav style={{ flex: 1, padding: '10px 8px' }}>
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href}>
              <div
                style={{
                  padding: '12px 16px',
                  marginBottom: 6,
                  borderRadius: 10,
                  background: active ? 'var(--bg-sidebar-active)' : 'transparent',
                  fontSize: 14,
                  fontWeight: active ? 700 : 500,
                  transition: 'transform 0.18s ease, background 0.18s ease',
                }}
              >
                {item.label}
              </div>
            </Link>
          );
        })}
        {user.role === '系统管理员' ? (
          <Link href="/admin">
            <div
              style={{
                padding: '12px 16px',
                marginTop: 10,
                borderRadius: 10,
                background: pathname === '/admin' || pathname.startsWith('/admin/') ? 'var(--bg-sidebar-active)' : 'rgba(255,255,255,0.04)',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              系统管理
            </div>
          </Link>
        ) : null}
      </nav>
      <div
        style={{
          padding: 16,
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700 }}>{user.name}</div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
          {user.role}
        </div>
        <button
          onClick={logout}
          style={{
            marginTop: 14,
            width: '100%',
            height: 38,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'transparent',
            color: '#fff',
          }}
        >
          退出登录
        </button>
      </div>
    </aside>
  );
}
