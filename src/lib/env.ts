// 環境変数は必要になった時点で読む (ビルド時に存在しなくても良いように)。

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(
      `環境変数 ${name} が設定されていません。.env.example を参考に .env.local (ローカル) または Vercel の Environment Variables に設定してください。`,
    );
    this.name = 'MissingEnvError';
  }
}

export function getSupabaseEnv(): { url: string; anonKey: string } {
  // NEXT_PUBLIC_ はビルド時に埋め込まれるため、直接参照する必要がある
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new MissingEnvError('NEXT_PUBLIC_SUPABASE_URL');
  if (!anonKey) throw new MissingEnvError('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function parseBoolFlag(v: string | undefined): boolean {
  return v === '1' || v?.toLowerCase() === 'true';
}

export function parseIntSetting(v: string | undefined, fallback: number): number {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const features = {
  /** 「今から遊べる」機能 (初期OFF) */
  get availableNow(): boolean {
    return parseBoolFlag(process.env.NEXT_PUBLIC_FEATURE_AVAILABLE_NOW);
  },
  /** 人数を表示し始める閾値 */
  get nowListMinUsers(): number {
    return parseIntSetting(process.env.NOW_LIST_MIN_USERS, 30);
  },
};

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000';
}
