'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { api, ApiError } from '@/lib/api';
import { AssistantDraftAction, AssistantResponse } from '@/types';

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
