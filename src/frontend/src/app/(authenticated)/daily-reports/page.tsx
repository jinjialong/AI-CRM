'use client';

import { FormEvent, useEffect, useState } from 'react';

import { ModalShell } from '@/components/common/modal-shell';
import { PageHeader } from '@/components/common/page-header';
import { api, ApiError } from '@/lib/api';

type DailyReportItem = {
  id: number;
  user_id: number;
  user_name: string | null;
  report_date: string;
  today_work: string;
  progress_result: string;
  issues: string;
  tomorrow_plan: string;
  created_at: string;
  updated_at: string;
};

type DailyReportFormState = {
  report_date: string;
  today_work: string;
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function buildForm(item?: DailyReportItem | null): DailyReportFormState {
  return {
    report_date: item?.report_date || todayString(),
    today_work: item?.today_work || '',
  };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

export default function DailyReportsPage() {
  const [items, setItems] = useState<DailyReportItem[]>([]);
  const [message, setMessage] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DailyReportItem | null>(null);
  const [form, setForm] = useState<DailyReportFormState>(buildForm());
  const [submitting, setSubmitting] = useState(false);
  const [deletingDate, setDeletingDate] = useState('');

  const loadData = async () => {
    try {
      const result = await api.get<{ items: DailyReportItem[] }>('/reports/me');
      setItems(result.items);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '加载日报失败');
    }
  };

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditingItem(null);
    setForm(buildForm());
    setMessage('');
    setOpenModal(true);
  };

  const openEdit = (item: DailyReportItem) => {
    setEditingItem(item);
    setForm(buildForm(item));
    setMessage('');
    setOpenModal(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      await api.put(`/reports/me/${form.report_date}`, {
        today_work: form.today_work.trim(),
        progress_result: '',
        issues: '',
        tomorrow_plan: '',
      });
      setOpenModal(false);
      setEditingItem(null);
      setForm(buildForm());
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '保存日报失败');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteItem = async (item: DailyReportItem) => {
    const confirmed = window.confirm(`确认删除 ${item.report_date} 的日报吗？`);
    if (!confirmed) return;
    setDeletingDate(item.report_date);
    setMessage('');
    try {
      await api.delete(`/reports/me/${item.report_date}`);
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : '删除日报失败');
    } finally {
      setDeletingDate('');
    }
  };

  return (
    <div>
      <PageHeader
        title="我的日报"
        description="用列表管理日报，支持新建、编辑和删除。"
        actions={
          <button className="primary-btn" onClick={openCreate}>
            新建日报
          </button>
        }
      />

      {message ? (
        <div className="card" style={{ padding: 16, marginBottom: 16, color: '#cf1322' }}>
          {message}
        </div>
      ) : null}

      <div className="card table-wrap" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>提交人</th>
              <th>日报日期</th>
              <th>创建时间</th>
              <th>工作内容</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((item) => (
                <tr key={item.id}>
                  <td>{item.user_name || '-'}</td>
                  <td>{item.report_date}</td>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td style={{ maxWidth: 520, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {item.today_work || '-'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        type="button"
                        style={{ color: '#0958d9', background: 'transparent', border: 'none', fontWeight: 600 }}
                        onClick={() => openEdit(item)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        style={{ color: '#cf1322', background: 'transparent', border: 'none', fontWeight: 600 }}
                        onClick={() => deleteItem(item)}
                        disabled={deletingDate === item.report_date}
                      >
                        {deletingDate === item.report_date ? '删除中...' : '删除'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ padding: 20, color: 'var(--text-muted)' }}>
                  暂无日报
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ModalShell
        open={openModal}
        title={editingItem ? '编辑日报' : '新建日报'}
        onClose={() => {
          setOpenModal(false);
          setEditingItem(null);
          setForm(buildForm());
        }}
        maxWidth={680}
      >
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>日报日期</div>
            <input
              type="date"
              value={form.report_date}
              onChange={(e) => setForm((prev) => ({ ...prev, report_date: e.target.value }))}
              required
            />
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>今日工作</div>
            <textarea
              rows={8}
              placeholder="填写今天的工作内容"
              value={form.today_work}
              onChange={(e) => setForm((prev) => ({ ...prev, today_work: e.target.value }))}
              required
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                setOpenModal(false);
                setEditingItem(null);
                setForm(buildForm());
              }}
            >
              取消
            </button>
            <button className="primary-btn" type="submit" disabled={submitting}>
              {submitting ? '保存中...' : '保存日报'}
            </button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
