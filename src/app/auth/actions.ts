'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/env';
import { safeNext } from '@/lib/safe-next';

const providerSchema = z.enum(['discord', 'x']);

export async function signInWithProvider(fd: FormData) {
  const provider = providerSchema.safeParse(fd.get('provider'));
  if (!provider.success) redirect('/login?error=provider');
  const next = safeNext(fd.get('next') as string | null);
  const h = await headers();
  const origin = h.get('origin') || siteUrl();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider.data,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: provider.data === 'discord' ? 'identify' : undefined,
    },
  });
  if (error || !data.url) redirect('/auth/error');
  redirect(data.url);
}
