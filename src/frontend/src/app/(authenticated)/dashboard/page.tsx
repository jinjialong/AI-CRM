'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { Customer, Lead } from '@/types';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<{ items: Lead[] }>('/leads'),
      api.get<{ items: Lead[] }>('/leads/public-pool'),
      api.get<{ items: Customer[] }>('/customers'),
    ]).then(([privateLeads, publicLeads, customerResult]) => {
      setLeads([...privateLeads.items, ...publicLeads.items]);
      setCustomers(customerResult.items);
    });
  }, []);

  const activeLeads = leads.filter((item) => item.status === '跟进中').length;
  const publicPoolCount = leads.filter((item) => item.is_public).length;
  const convertedCount = leads.filter((item) => item.status === '已转客户').length;

  return (
    <div>
      <PageHeader
        title="数据概览"
        description="第一期先聚焦线索、公共线索池和客户主链路，右侧对话区用于演示智能助手。"
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <StatCard label="全部线索" value={String(leads.length)} hint="包含公共线索池" color="#1677ff" />
        <StatCard label="跟进中线索" value={String(activeLeads)} hint="当前重点推进" color="#fa8c16" />
        <StatCard label="公共线索池" value={String(publicPoolCount)} hint="待领取或待分配" color="#722ed1" />
        <StatCard label="客户总数" value={String(customers.length)} hint="已沉淀客户资产" color="#52c41a" />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr',
          gap: 20,
          marginBottom: 20,
        }}
      >
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>第一期主链路</div>
          <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
            {[
              ['1', '手工创建线索', '销售录入线索，补齐基础信息并进入个人线索列表。'],
              ['2', '公共池流转', '线索支持退回公共池、自由领取和经理分配。'],
              ['3', '持续跟进', '在线索详情页记录电话、微信、面谈等跟进内容。'],
              ['4', '转成客户', '满足条件后发起转客户，并保留历史跟进记录。'],
              ['5', '客户经营', '继续沉淀联系人、拜访记录和沟通纪要。'],
            ].map(([step, title, desc]) => (
              <div
                key={step}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr',
                  gap: 12,
                  padding: 14,
                  borderRadius: 10,
                  background: '#fafcff',
                  border: '1px solid var(--border-soft)',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#e6f7ff',
                    color: '#0958d9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                  }}
                >
                  {step}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    {desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20, background: 'var(--orange-soft)', borderColor: '#ffd8bf' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#ad4e00' }}>当前演示重点</div>
          <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
            <div style={{ padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #ffe7ba' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>智能助手直接参与业务动作</div>
              <div style={{ marginTop: 6, fontSize: 13, color: '#7c2d12', lineHeight: 1.7 }}>
                可以直接创建线索、查询数据和发起转客户，转客户必须二次确认。
              </div>
            </div>
            <div style={{ padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #ffe7ba' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>公共线索池双模式流转</div>
              <div style={{ marginTop: 6, fontSize: 13, color: '#7c2d12', lineHeight: 1.7 }}>
                同时支持销售自由领取和销售经理分配，方便演示不同角色视角。
              </div>
            </div>
            <div style={{ padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #ffe7ba' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>客户沉淀后继续经营</div>
              <div style={{ marginTop: 6, fontSize: 13, color: '#7c2d12', lineHeight: 1.7 }}>
                客户模块不仅看基础信息，也要能继续维护联系人、拜访记录和沟通纪要。
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
