'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { AuditLog, ConfigItem, UserInfo } from '@/types';

export default function AdminPage() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [config, setConfig] = useState<ConfigItem[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const loadData = async () => {
    const [userResult, configResult, logResult] = await Promise.all([
      api.get<{ items: UserInfo[] }>('/admin/users'),
      api.get<{ items: ConfigItem[] }>('/admin/config'),
      api.get<{ items: AuditLog[] }>('/admin/logs'),
    ]);
    setUsers(userResult.items);
    setConfig(configResult.items);
    setLogs(logResult.items);
  };

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHeader
        title="系统管理"
        description="第一期只保留最必要的用户、配置和操作日志能力。"
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '0.9fr 1.1fr',
          gap: 20,
          marginBottom: 20,
        }}
      >
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>用户列表</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {users.map((user) => (
              <div
                key={user.id}
                style={{
                  border: '1px solid var(--border-soft)',
                  borderRadius: 10,
                  padding: 14,
                  background: '#fafcff',
                }}
              >
                <div style={{ fontWeight: 700 }}>{user.name}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                  账号：{user.login} / 角色：{user.role}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>基础配置</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {config.map((item) => (
              <div
                key={item.id}
                style={{
                  border: '1px solid var(--border-soft)',
                  borderRadius: 10,
                  padding: 14,
                  background: '#fff',
                }}
              >
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{item.key}</div>
                <div style={{ marginTop: 8, fontWeight: 700, color: 'var(--text-strong)' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card table-wrap" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 18px 0', fontSize: 16, fontWeight: 700 }}>操作日志</div>
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>时间</th>
              <th>操作人</th>
              <th>角色</th>
              <th>动作</th>
              <th>目标</th>
              <th>来源</th>
              <th>结果</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.created_at).toLocaleString('zh-CN')}</td>
                <td>{log.actor_name}</td>
                <td>{log.actor_role}</td>
                <td>{log.action}</td>
                <td>
                  {log.target_type} #{log.target_id}
                </td>
                <td>{log.source}</td>
                <td>{log.result}</td>
                <td>{log.details || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
