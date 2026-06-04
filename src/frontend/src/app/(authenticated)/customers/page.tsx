'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { FilterCard } from '@/components/common/filter-card';
import { Customer } from '@/types';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const loadData = async () => {
    const result = await api.get<{ items: Customer[] }>(`/customers?search=${encodeURIComponent(appliedSearch)}`);
    setCustomers(result.items);
  };

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
  }, [appliedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setAppliedSearch(search);
  };

  const handleReset = () => {
    setSearch('');
    setAppliedSearch('');
  };

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
            gridTemplateColumns: '320px auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <input
            placeholder="按客户名称、联系人或手机号搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="primary-btn" onClick={handleSearch}>
                搜索
              </button>
              <button className="secondary-btn" onClick={handleReset}>
                重置
              </button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              共 {customers.length} 位客户
            </div>
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
            {customers.map((customer) => (
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
