'use client';

import { FormEvent, useEffect, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { Lead, UserInfo } from '@/types';

type ContactFormValue = {
  name: string;
  job_title: string;
  phone: string;
  wechat: string;
  is_primary: boolean;
};

type LeadFormValues = {
  company_name: string;
  organization_code: string;
  region: string;
  source: string;
  owner_id: string;
  notes: string;
  contacts: ContactFormValue[];
};

const sourceOptions = ['转介绍', '自然流量', 'KOC/SEM', '外呼'];
const regionOptions = ['华北', '华东', '华南', '华中', '西南', '西北', '东北'];

const createEmptyContact = (isPrimary = false): ContactFormValue => ({
  name: '',
  job_title: '',
  phone: '',
  wechat: '',
  is_primary: isPrimary,
});

const initialValues: LeadFormValues = {
  company_name: '',
  organization_code: '',
  region: '',
  source: '自然流量',
  owner_id: '0',
  notes: '',
  contacts: [createEmptyContact(true)],
};

export function LeadFormModal({
  open,
  onClose,
  onSuccess,
  users,
  lead,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  users: UserInfo[];
  lead?: Lead | null;
}) {
  const [values, setValues] = useState<LeadFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (lead) {
      const contacts = lead.contacts.length
        ? lead.contacts.map((item, index) => ({
            name: item.name,
            job_title: item.job_title,
            phone: item.phone,
            wechat: item.wechat,
            is_primary: item.is_primary || index === 0,
          }))
        : [createEmptyContact(true)];
      setValues({
        company_name: lead.company_name,
        organization_code: lead.organization_code,
        region: lead.region,
        source: lead.source,
        owner_id: String(lead.owner_id ?? 0),
        notes: lead.notes,
        contacts,
      });
      setError('');
      return;
    }
    setValues({
      ...initialValues,
      owner_id: '0',
    });
    setError('');
  }, [lead, open]);

  if (!open) return null;

  const setPrimaryContact = (index: number) => {
    setValues((prev) => ({
      ...prev,
      contacts: prev.contacts.map((item, currentIndex) => ({
        ...item,
        is_primary: currentIndex === index,
      })),
    }));
  };

  const updateContact = (index: number, field: keyof ContactFormValue, value: string | boolean) => {
    setValues((prev) => ({
      ...prev,
      contacts: prev.contacts.map((item, currentIndex) =>
        currentIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      ),
    }));
  };

  const addContact = () => {
    setValues((prev) => ({
      ...prev,
      contacts: [...prev.contacts, createEmptyContact(false)],
    }));
  };

  const removeContact = (index: number) => {
    setValues((prev) => {
      const nextContacts = prev.contacts.filter((_, currentIndex) => currentIndex !== index);
      if (!nextContacts.length) {
        return {
          ...prev,
          contacts: [createEmptyContact(true)],
        };
      }
      if (!nextContacts.some((item) => item.is_primary)) {
        nextContacts[0].is_primary = true;
      }
      return {
        ...prev,
        contacts: [...nextContacts],
      };
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const contacts = values.contacts
        .map((item, index) => ({
          ...item,
          name: item.name.trim(),
          job_title: item.job_title.trim(),
          phone: item.phone.trim(),
          wechat: item.wechat.trim(),
          is_primary: item.is_primary || index === 0,
        }))
        .filter((item) => item.name || item.phone);

      if (!contacts.length) {
        throw new Error('至少需要填写一组联系人');
      }
      if (!contacts[0].name || !contacts[0].phone) {
        throw new Error('主联系人必须填写姓名和手机号');
      }

      const payload = {
        company_name: values.company_name.trim(),
        organization_code: values.organization_code.trim(),
        region: values.region.trim(),
        source: values.source,
        owner_id: Number(values.owner_id) || null,
        notes: values.notes.trim(),
        contacts,
      };
      if (lead) {
        await api.patch(`/leads/${lead.id}`, payload);
      } else {
        await api.post('/leads', payload);
      }
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('保存线索失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="card"
        style={{
          width: '100%',
          maxWidth: 980,
          padding: 24,
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>
              {lead ? '编辑线索' : '新建线索'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '1px solid var(--border-soft)',
              background: '#fff',
              color: 'var(--text-muted)',
              fontSize: 20,
              lineHeight: '40px',
              textAlign: 'center',
              boxShadow: '0 6px 14px rgba(15, 23, 42, 0.06)',
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            marginTop: 22,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 16,
          }}
        >
          <Field label="公司名称" required>
            <input
              value={values.company_name}
              onChange={(e) => setValues((prev) => ({ ...prev, company_name: e.target.value }))}
              required
            />
          </Field>
          <Field label="组织机构代码">
            <input
              value={values.organization_code}
              onChange={(e) => setValues((prev) => ({ ...prev, organization_code: e.target.value }))}
            />
          </Field>
          <Field label="大区">
            <select
              value={values.region}
              onChange={(e) => setValues((prev) => ({ ...prev, region: e.target.value }))}
            >
              <option value="">请选择大区</option>
              {regionOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Field label="来源">
            <select
              value={values.source}
              onChange={(e) => setValues((prev) => ({ ...prev, source: e.target.value }))}
            >
              {sourceOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Field label="负责人">
            <select
              value={values.owner_id}
              onChange={(e) => setValues((prev) => ({ ...prev, owner_id: e.target.value }))}
            >
              <option value="0">暂不指定负责人</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}（{user.role}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="备注">
            <textarea
              rows={4}
              value={values.notes}
              onChange={(e) => setValues((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </Field>
        </div>

        <div
          style={{
            marginTop: 24,
            padding: 18,
            borderRadius: 12,
            background: '#fafcff',
            border: '1px solid var(--border-soft)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)' }}>联系人</div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                支持添加多组联系人，首组默认为主联系人。
              </div>
            </div>
            <button type="button" className="secondary-btn" onClick={addContact}>
              添加联系人
            </button>
          </div>

          <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
            {values.contacts.map((contact, index) => (
              <div
                key={`${index}-${contact.name}-${contact.phone}`}
                style={{
                  border: '1px solid var(--border-soft)',
                  borderRadius: 10,
                  background: '#fff',
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>
                    联系人 {index + 1}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                      <input
                        type="radio"
                        name="primary-contact"
                        checked={contact.is_primary}
                        onChange={() => setPrimaryContact(index)}
                      />
                      设为主联系人
                    </label>
                    {values.contacts.length > 1 ? (
                      <button
                        type="button"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#cf1322',
                          fontWeight: 700,
                        }}
                        onClick={() => removeContact(index)}
                      >
                        删除
                      </button>
                    ) : null}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 14,
                  }}
                >
                  <Field label="姓名" required={index === 0}>
                    <input
                      value={contact.name}
                      onChange={(e) => updateContact(index, 'name', e.target.value)}
                      required={index === 0}
                    />
                  </Field>
                  <Field label="职务">
                    <input
                      value={contact.job_title}
                      onChange={(e) => updateContact(index, 'job_title', e.target.value)}
                    />
                  </Field>
                  <Field label="手机号" required={index === 0}>
                    <input
                      value={contact.phone}
                      onChange={(e) => updateContact(index, 'phone', e.target.value)}
                      required={index === 0}
                    />
                  </Field>
                  <Field label="微信号">
                    <input
                      value={contact.wechat}
                      onChange={(e) => updateContact(index, 'wechat', e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <div
            style={{
              marginTop: 16,
              padding: '12px 14px',
              borderRadius: 8,
              background: '#fff1f0',
              border: '1px solid #ffc1c2',
              color: '#cf1322',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button type="button" className="secondary-btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary-btn" disabled={submitting}>
            {submitting ? '保存中...' : '保存线索'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-normal)' }}>
        {required ? (
          <>
            <span style={{ color: '#cf1322', marginRight: 4 }}>*</span>
            {label}
          </>
        ) : (
          label
        )}
      </span>
      {children}
    </label>
  );
}
