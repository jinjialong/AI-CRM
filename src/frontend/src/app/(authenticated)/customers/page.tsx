'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { api } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { FilterCard } from '@/components/common/filter-card';
import { Customer } from '@/types';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    const result = await api.get<{ items: Customer[] }>(`/customers?search=${encodeURIComponent(search)}`);
    setCustomers(result.items);
  };

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!search) return customers;
    return customers.filter(
      (item) =>
        item.customer_name.includes(search) ||
        item.contact_name.includes(search) ||
        item.phone.includes(search)
    );
  }, [customers, search]);

  return (
    <div>
      <PageHeader
        title="我的客户"
        description="客户由线索转化而来，沉淀联系人、拜访记录和沟通纪要。"
      />

      <FilterCard>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 160px auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <input
            placeholder="按客户名称、联系人或手机号搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="secondary-btn" onClick={loadData}>
            刷新
          </button>
          <div style={{ justifySelf: 'end', fontSize: 13, color: 'var(--text-muted)' }}>
            共 {filtered.length} 位客户
          </div>
        </div>
      </FilterCard>

      <div className="card table-wrap" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>编号</th>
              <th>客户名称</th>
              <th>主联系人</th>
              <th>手机号</th>
              <th>公司名称</th>
              <th>负责人</th>
              <th>来源线索</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.id}</td>
                <td>{customer.customer_name}</td>
                <td>{customer.contact_name}</td>
                <td>{customer.phone}</td>
                <td>{customer.company_name || '-'}</td>
                <td>{customer.owner_name || '-'}</td>
                <td>线索 #{customer.source_lead_id}</td>
                <td>
                  <Link href={`/customers/${customer.id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>
                    查看
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

