'use client';

import { FormEvent, useState } from 'react';

import { api, ApiError } from '@/lib/api';

export function FollowUpForm({
  target,
  targetId,
  methods,
  onSuccess,
}: {
  target: 'lead' | 'customer';
  targetId: number;
  methods: string[];
  onSuccess: () => void;
}) {
  const [method, setMethod] = useState(methods[0] || '电话');
  const [content, setContent] = useState('');
  const [nextFollowUpTime, setNextFollowUpTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const url =
        target === 'lead'
          ? `/leads/${targetId}/followups`
          : `/customers/${targetId}/followups`;
      await api.post(url, {
        method,
        content,
        next_follow_up_time: nextFollowUpTime || null,
      });
      setContent('');
      setNextFollowUpTime('');
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存跟进失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 220px', gap: 12 }}>
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          {methods.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <textarea
          rows={4}
          placeholder="填写本次跟进内容"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="datetime-local"
            value={nextFollowUpTime}
            onChange={(e) => setNextFollowUpTime(e.target.value)}
          />
          <button className="primary-btn" type="submit" disabled={submitting}>
            {submitting ? '保存中...' : '保存跟进'}
          </button>
        </div>
      </div>
      {error ? (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            background: '#fff1f0',
            color: '#cf1322',
            border: '1px solid #ffc1c2',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}
    </form>
  );
}

