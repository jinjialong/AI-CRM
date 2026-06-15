'use client';

import { useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { api, ApiError } from '@/lib/api';
import { AssistantDraftAction, AssistantGlobalSearchData, AssistantResponse, Customer, Lead } from '@/types';

type Message = {
  id: string;
  side: 'user' | 'assistant';
  text: string;
};

export function RightChatPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      side: 'assistant',
      text: '你可以让我创建线索、查询线索、查看公共线索池、查询客户，或者发起转客户。',
    },
  ]);
  const [result, setResult] = useState<AssistantResponse | null>(null);
  const [draftAction, setDraftAction] = useState<AssistantDraftAction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leadCreationSessionId, setLeadCreationSessionId] = useState<number | null>(null);

  const currentLeadId = (() => {
    const match = pathname?.match(/^\/leads\/(\d+)$/);
    return match ? Number(match[1]) : null;
  })();

  const openLeadFromResult = (lead: Lead) => {
    if (lead.is_public) {
      router.push('/public-pool');
      return;
    }
    router.push(`/leads/${lead.id}`);
  };

  const renderStructuredResult = (response: AssistantResponse) => {
    const leads = Array.isArray(response.data?.leads) ? (response.data.leads as Lead[]) : [];
    const customers = Array.isArray(response.data?.customers) ? (response.data.customers as Customer[]) : [];
    const publicPoolLeads = Array.isArray(response.data?.public_pool_leads)
      ? (response.data.public_pool_leads as Lead[])
      : [];
    const lead = response.data?.lead as Lead | undefined;
    const customer = response.data?.customer as Customer | undefined;
    const filters =
      response.data?.filters && typeof response.data.filters === 'object'
        ? (response.data.filters as Record<string, unknown>)
        : undefined;

    if (response.result_kind === 'global_search') {
      const globalData = response.data as Partial<AssistantGlobalSearchData>;
      const counts = globalData.counts || {
        customers: customers.length,
        leads: leads.length,
        public_pool_leads: publicPoolLeads.length,
      };
      const renderEmpty = (text: string) => (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0 8px' }}>{text}</div>
      );
      return (
        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          <ResultFilters filters={filters} />
          <div style={{ display: 'grid', gap: 12 }}>
            <GlobalSearchSection title="客户" count={counts.customers || 0}>
              {customers.length
                ? customers.map((item) => (
                    <ResultSummaryCard
                      key={`customer-${item.id}`}
                      title={item.customer_name}
                      lines={[
                        `客户 #${item.id} · ${item.owner_name || '未分配负责人'}`,
                        `${item.contact_name || '未填联系人'} / ${item.phone || '未填手机号'}`,
                        item.company_name || '未填公司名',
                      ]}
                      actionLabel="查看客户"
                      onAction={() => router.push(`/customers/${item.id}`)}
                    />
                  ))
                : renderEmpty('没有匹配客户')}
            </GlobalSearchSection>
            <GlobalSearchSection title="我的线索" count={counts.leads || 0}>
              {leads.length
                ? leads.map((item) => (
                    <ResultSummaryCard
                      key={`lead-${item.id}`}
                      title={item.company_name}
                      lines={[
                        `线索 #${item.id} · ${item.region || '未填大区'} · ${item.status}`,
                        `${item.primary_contact_name || '未填联系人'} / ${item.primary_contact_phone || '未填手机号'}`,
                      ]}
                      actionLabel="查看线索"
                      onAction={() => router.push(`/leads/${item.id}`)}
                    />
                  ))
                : renderEmpty('没有匹配线索')}
            </GlobalSearchSection>
            <GlobalSearchSection title="公共池" count={counts.public_pool_leads || 0}>
              {publicPoolLeads.length
                ? publicPoolLeads.map((item) => (
                    <ResultSummaryCard
                      key={`public-lead-${item.id}`}
                      title={item.company_name}
                      lines={[
                        `线索 #${item.id} · ${item.region || '未填大区'} · ${item.status}`,
                        `${item.primary_contact_name || '未填联系人'} / ${item.primary_contact_phone || '未填手机号'}`,
                      ]}
                      actionLabel="前往公共池"
                      onAction={() => router.push('/public-pool')}
                    />
                  ))
                : renderEmpty('没有匹配公共池线索')}
            </GlobalSearchSection>
          </div>
        </div>
      );
    }

    if (response.result_kind === 'lead_list' && leads.length) {
      return (
        <div style={{ marginTop: 12 }}>
          <ResultFilters filters={filters} />
          <div style={{ display: 'grid', gap: 10 }}>
            {leads.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: '#fff',
                  border: '1px solid var(--border-soft)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-strong)' }}>{item.company_name}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      线索 #{item.id} · {item.region || '未填大区'} · {item.status}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      {item.primary_contact_name || '未填联系人'} / {item.primary_contact_phone || '未填手机号'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ whiteSpace: 'nowrap', padding: '8px 10px' }}
                    onClick={() => openLeadFromResult(item)}
                  >
                    {item.is_public ? '前往公共池' : '查看线索'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (response.result_kind === 'customer_list' && customers.length) {
      return (
        <div style={{ marginTop: 12 }}>
          <ResultFilters filters={filters} />
          <div style={{ display: 'grid', gap: 10 }}>
            {customers.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: '#fff',
                  border: '1px solid var(--border-soft)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-strong)' }}>{item.customer_name}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      客户 #{item.id} · {item.owner_name || '未分配负责人'}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      {item.contact_name || '未填联系人'} / {item.phone || '未填手机号'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ whiteSpace: 'nowrap', padding: '8px 10px' }}
                    onClick={() => router.push(`/customers/${item.id}`)}
                  >
                    查看客户
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (response.result_kind === 'lead_created' && lead?.id) {
      return (
        <ResultSummaryCard
          title={lead.company_name}
          lines={[
            `线索 #${lead.id}`,
            `${lead.primary_contact_name || '未填联系人'} / ${lead.primary_contact_phone || '未填手机号'}`,
            `${lead.region || '未填大区'} · ${lead.status}`,
          ]}
          actionLabel="查看线索"
          onAction={() => router.push(`/leads/${lead.id}`)}
        />
      );
    }

    if (response.result_kind === 'customer_created' && customer?.id) {
      return (
        <ResultSummaryCard
          title={customer.customer_name}
          lines={[
            `客户 #${customer.id}`,
            `${customer.contact_name || '未填联系人'} / ${customer.phone || '未填手机号'}`,
            customer.company_name || '未填公司名',
          ]}
          actionLabel="查看客户"
          onAction={() => router.push(`/customers/${customer.id}`)}
        />
      );
    }

    return null;
  };

  const structuredResult = result ? renderStructuredResult(result) : null;

  const sendMessage = async () => {
    if (!input.trim() || submitting) return;
    const currentText = input.trim();
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), side: 'user', text: currentText }]);
    setInput('');
    setSubmitting(true);
    try {
      const response = await api.post<AssistantResponse>('/assistant/message', {
        message: currentText,
        session_id: leadCreationSessionId,
        context: {
          lead_id: currentLeadId,
        },
      });
      if (typeof response.data?.session_id === 'number') {
        setLeadCreationSessionId(response.data.session_id);
      } else if (response.result_kind === 'lead_created' || response.result_kind === 'customer_created') {
        setLeadCreationSessionId(null);
      }
      setResult(response);
      setDraftAction((response.data?.draft_action as AssistantDraftAction | undefined) || null);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), side: 'assistant', text: response.message }]);
      if (response.result_kind === 'lead_created' || response.result_kind === 'customer_created') {
        window.dispatchEvent(new Event('ai-crm-refresh'));
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '助手执行失败';
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), side: 'assistant', text: message }]);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDraftAction = async () => {
    if (!draftAction || submitting) return;
    setSubmitting(true);
    try {
      const response = await api.post<AssistantResponse>('/assistant/message', {
        confirm_action: draftAction,
      });
      setResult(response);
      setDraftAction(null);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), side: 'assistant', text: response.message }]);
      window.dispatchEvent(new Event('ai-crm-refresh'));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '确认执行失败';
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), side: 'assistant', text: message }]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicateAction = async (action: { kind: string; label: string; payload: Record<string, unknown> }) => {
    if (action.kind === 'view_duplicate_lead') {
      const leadId = Number(action.payload.lead_id || 0);
      if (leadId) {
        router.push(`/leads/${leadId}`);
      }
      return;
    }
    if (action.kind === 'discard_creation') {
      const sessionId = Number(action.payload.session_id || 0);
      if (sessionId) {
        await api.post('/skills/lead-creation/discard', { session_id: sessionId });
      }
      setLeadCreationSessionId(null);
      const response: AssistantResponse = {
        message: '已放弃本次线索创建。',
        result_kind: 'message',
        data: { status: 'discarded', session_id: sessionId },
      };
      setResult(response);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), side: 'assistant', text: response.message },
      ]);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        title="打开智能助手"
        style={{
          position: 'fixed',
          right: 22,
          bottom: 22,
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(180deg, #1890ff 0%, #1677ff 100%)',
          color: '#fff',
          boxShadow: '0 16px 32px rgba(24, 144, 255, 0.28)',
          zIndex: 50,
          fontSize: 22,
        }}
      >
        机
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        background: '#fff',
        borderLeft: '1px solid var(--border-soft)',
        boxShadow: '-12px 0 30px rgba(15, 23, 42, 0.08)',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 18px',
          background: 'linear-gradient(180deg, #1890ff 0%, #1677ff 100%)',
          color: '#fff',
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>AI 助手</div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.92 }}>
            全局右侧协作面板
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.28)',
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            fontSize: 18,
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            padding: 18,
            borderBottom: '1px solid var(--border-soft)',
            background: '#fff',
          }}
        >
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: '#eef4ff',
              border: '1px solid #c7d9ff',
              color: '#1d39c4',
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            新手提示：你可以直接让我创建线索、查看公共线索池、查询客户，或者发起转客户。
          </div>
          {draftAction ? (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 12,
                background: 'var(--orange-soft)',
                border: '1px solid #ffd8bf',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ad4e00' }}>待确认动作</div>
              <div style={{ marginTop: 8, fontSize: 13, color: '#7c2d12', lineHeight: 1.7 }}>
                当前动作：{draftAction.kind}
              </div>
              <button className="primary-btn" style={{ marginTop: 12 }} onClick={confirmDraftAction} disabled={submitting}>
                确认执行
              </button>
            </div>
          ) : null}
          {result ? (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 12,
                background: '#fafcff',
                border: '1px solid var(--border-soft)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>最新结构化结果</div>
              {structuredResult}
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>查看原始结果</summary>
                <pre
                  style={{
                    marginTop: 10,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 12,
                    lineHeight: 1.7,
                    color: 'var(--text-normal)',
                    maxHeight: 140,
                    overflowY: 'auto',
                  }}
                >
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </details>
              {Array.isArray(result.data?.available_actions) && result.data.available_actions.length ? (
                <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {result.data.available_actions.map((action: { kind: string; label: string; payload: Record<string, unknown> }) => (
                    <button
                      key={action.kind}
                      type="button"
                      className={action.kind === 'discard_creation' ? 'secondary-btn' : 'primary-btn'}
                      style={{ padding: '8px 12px' }}
                      onClick={() => handleDuplicateAction(action)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          style={{
            flex: 1,
            padding: 16,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            background: '#f8fafc',
          }}
        >
          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                alignSelf: message.side === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                background: message.side === 'user' ? '#1890ff' : '#fff',
                color: message.side === 'user' ? '#fff' : 'var(--text-normal)',
                border: message.side === 'user' ? 'none' : '1px solid var(--border-soft)',
                borderRadius: 12,
                padding: '12px 14px',
                boxShadow: message.side === 'user' ? '0 8px 20px rgba(24, 144, 255, 0.18)' : 'none',
                fontSize: 14,
                lineHeight: 1.7,
              }}
            >
              {message.text}
            </div>
          ))}
        </div>

        <div
          style={{
            padding: 14,
            borderTop: '1px solid var(--border-soft)',
            display: 'flex',
            gap: 10,
            background: '#fff',
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="例如：帮我创建线索，公司名称华北科技，联系人张三，手机号13800000011"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                sendMessage();
              }
            }}
          />
          <button className="primary-btn" onClick={sendMessage} disabled={submitting}>
            发送
          </button>
        </div>
      </div>
    </div>
  );
}

function GlobalSearchSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        padding: 12,
        borderRadius: 14,
        background: '#f8fafc',
        border: '1px solid var(--border-soft)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-strong)' }}>{title}</div>
        <div
          style={{
            minWidth: 28,
            height: 24,
            padding: '0 8px',
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#eef4ff',
            color: '#1d39c4',
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {count}
        </div>
      </div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </section>
  );
}

function ResultFilters({ filters }: { filters?: Record<string, unknown> }) {
  const activeFilters = Object.entries(filters || {}).filter(([, value]) => Boolean(String(value || '').trim()));
  if (!activeFilters.length) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 10 }}>
      {activeFilters.map(([key, value]) => (
        <span
          key={key}
          style={{
            padding: '4px 8px',
            borderRadius: 999,
            background: '#eef4ff',
            border: '1px solid #c7d9ff',
            color: '#1d39c4',
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          {key}: {String(value)}
        </span>
      ))}
    </div>
  );
}

function ResultSummaryCard({
  title,
  lines,
  actionLabel,
  onAction,
}: {
  title: string;
  lines: string[];
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        background: '#fff',
        border: '1px solid var(--border-soft)',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-strong)' }}>{title}</div>
      <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
        {lines.map((line) => (
          <div key={line} style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {line}
          </div>
        ))}
      </div>
      <button type="button" className="secondary-btn" style={{ marginTop: 12 }} onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
