import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SRC_COOKIE, sanitizeSrc } from '@/lib/src-param';
import { isAuthCookie, persistentCookieOptions } from '@/lib/auth-cookies';

// 1) Supabaseのセッションを更新する (getClaims) (期限切れのアクセストークンをリフレッシュし、Set-Cookie で返す)
// 2) v4: セッション cookie をサーバーの Set-Cookie で書き直して400日に延ばす (Safari ITP の7日制限への対策)
// 3) ?src= (流入元) を30日間cookieに保存する (最初の流入元を優先して上書きしない)
export async function proxy(request: NextRequest) {
  // 4) 画面側 (メンテナンス・BAN の画面を出さないページの判定) にパスを渡す
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set('x-pathname', request.nextUrl.pathname);
    return NextResponse.next({ request: { headers } });
  };
  let response = next();
  const refreshed = new Set<string>();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = next();
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
            refreshed.add(name);
          }
        },
      },
    });
    // getClaims: アクセストークンが期限切れなら更新し、署名は手元で検証する (Auth への通信は更新時だけ)
    await supabase.auth.getClaims();
  }

  // ページの表示 (GET) のときだけ書き直す。POST (Server Action のログアウト等) では、
  // そちらの Set-Cookie (削除) を上書きしないよう何もしない。
  if (request.method === 'GET') {
    const secure = process.env.NODE_ENV === 'production';
    for (const c of request.cookies.getAll()) {
      if (!isAuthCookie(c.name) || refreshed.has(c.name) || !c.value) continue;
      response.cookies.set(c.name, c.value, persistentCookieOptions(secure));
    }
  }

  const src = sanitizeSrc(request.nextUrl.searchParams.get('src'));
  if (src && !request.cookies.get(SRC_COOKIE)) {
    response.cookies.set(SRC_COOKIE, src, {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js).*)'],
};
