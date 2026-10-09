import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from './supabase/public';
import { isSupabaseConfigured } from './env';

export { APPEAL_PAGE, maintenanceNotice } from './site-status-shared';
export type { SiteStatus } from './site-status-shared';
import type { SiteStatus } from './site-status-shared';

/** メンテナンスの状態は全員同じなので、30秒まとめて使う (毎回のページ表示で DB に問い合わせない) */
const siteStatusShared = unstable_cache(
  async (): Promise<SiteStatus | null> => {
    const { data, error } = await createPublicClient().rpc('site_status');
    if (error || !data) throw new Error('site_status');
    return data as SiteStatus;
  },
  ['site-status-v1'],
  { revalidate: 30 },
);

/** メンテナンスの状態 (1リクエストで1回だけ取得)。取れなければ null (通常どおり表示する) */
export const getSiteStatus = cache(async (): Promise<SiteStatus | null> => {
  if (!isSupabaseConfigured()) return null;
  try {
    return await siteStatusShared();
  } catch {
    return null;
  }
});
