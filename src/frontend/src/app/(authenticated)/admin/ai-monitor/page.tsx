'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AiMonitorIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/ai-monitor/token');
  }, [router]);

  return null;
}
