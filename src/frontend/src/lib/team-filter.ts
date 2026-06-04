'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { isManagerOrAdmin } from '@/lib/crm-options';
import { UserInfo } from '@/types';

export function useTeamScope(user: UserInfo | null, setError: (message: string) => void) {
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [members, setMembers] = useState<UserInfo[]>([]);

  const managers = useMemo(() => allUsers.filter((item) => item.role === '销售经理'), [allUsers]);
  const defaultManagerId = useMemo(() => {
    if (!user || !isManagerOrAdmin(user.role)) return '';
    if (user.role === '销售经理') return String(user.id);
    return managers.length ? String(managers[0].id) : '';
  }, [user, managers]);

  useEffect(() => {
    if (!user || !isManagerOrAdmin(user.role)) return;
    api
      .get<{ items: UserInfo[] }>('/admin/users')
      .then((result) => setAllUsers(result.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : '加载团队信息失败'));
  }, [user, setError]);

  const loadMembers = useCallback(
    async (managerId: string) => {
      if (!managerId) {
        setMembers([]);
        return;
      }
      try {
        const result = await api.get<{ items: UserInfo[] }>(`/team/members?manager_id=${encodeURIComponent(managerId)}`);
        setMembers(result.items);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '加载团队成员失败');
      }
    },
    [setError]
  );

  return {
    managers,
    members,
    defaultManagerId,
    loadMembers,
  };
}
