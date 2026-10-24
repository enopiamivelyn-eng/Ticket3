// Server routes use the private server-side names. The NEXT_PUBLIC aliases are
// supported for Vercel projects that expose the same public URL/anon key to the
// browser for Realtime. Never put a service-role key in either variable.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function supabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY (or their NEXT_PUBLIC_ equivalents) in the Vercel project, then redeploy.');
  }
  return { url: SUPABASE_URL.replace(/\/$/, ''), anonKey: SUPABASE_ANON_KEY };
}

export async function supabaseAuth<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload.msg || payload.message || payload.error_description || payload.error;
    throw Object.assign(new Error(error || 'Supabase authentication failed'), { status: response.status });
  }
  return payload as T;
}

export interface SupabaseUser {
  id: string;
  email: string;
  user_metadata?: { name?: string; phone?: string; [key: string]: unknown };
  app_metadata?: { role?: string };
  created_at?: string;
}

export async function getSupabaseUser(accessToken: string) {
  return supabaseAuth<SupabaseUser>('user', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function writeLoginLog(user: SupabaseUser, accessToken: string) {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/user_login_logs`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: user.id,
      email: user.email,
      name: user.user_metadata?.name || null,
      phone: user.user_metadata?.phone || null,
    }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Object.assign(new Error('Could not record login event in Supabase.'), {
      status: response.status,
      code: error.code,
    });
  }
}
