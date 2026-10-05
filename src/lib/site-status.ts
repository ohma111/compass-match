import 'server-only';
import { cache } from 'react';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './env';

export { APPEAL_PAGE, maintenanceNotice } from './site-status-shared';
export type { SiteStatus } from './site-status-shared';
import type { SiteStatus } from './site-status-shared';

/** メンテナンスの状態 (1リクエストで1回だけ取得)。取れなければ null (通常どおり表示する) */
export const getSiteStatus = cache(async (): Promise<SiteStatus | null> => {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('site_status');
    if (error || !data) return null;
    return data as SiteStatus;
  } catch {
    return null;
  }
});
