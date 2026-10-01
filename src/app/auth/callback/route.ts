import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safe-next';

// Discord ログインの戻り先 (PKCE)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const profile = await supabase.from('profiles').select('id').eq('id', data.user.id).maybeSingle();
      // 取得エラーは「プロフィールなし」と区別する (登録済みの人を初回登録へ戻さない)
      if (profile.error) return NextResponse.redirect(`${origin}${next}`);
      if (!profile.data) {
        return NextResponse.redirect(`${origin}/welcome?next=${encodeURIComponent(next)}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/auth/error`);
}
