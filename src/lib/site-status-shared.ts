import { formatJstRange } from './time';

export interface SiteStatus {
  active: boolean;
  manual_on: boolean;
  starts_at: string | null;
  ends_at: string | null;
  message: string;
}

/** フィードバックのうち、BAN への異議申し立てを見分ける印 */
export const APPEAL_PAGE = 'appeal';

/** 予定のお知らせの文 (管理画面の入力欄の初期値) */
export function maintenanceNotice(startsAt: string, endsAt: string): string {
  return `${formatJstRange(startsAt, endsAt)} はメンテナンスのため、サイトをご利用いただけません。ご不便をおかけしますが、よろしくお願いいたします。`;
}
