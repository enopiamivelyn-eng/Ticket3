import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUser, supabaseConfig } from '@/lib/supabase';

function sessionToken(request: NextRequest) {
  return request.cookies.get('auth-token')?.value || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
}

async function restRequest<T>(path: string, token: string, init: RequestInit = {}) {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.message || 'Notification request failed.'), { status: response.status, code: payload.code });
  return payload as T;
}

function logNotificationsError(error: unknown) {
  const value = error as {
    name?: unknown;
    message?: unknown;
    status?: unknown;
    code?: unknown;
    cause?: unknown;
  } | null;
  const cause = value?.cause as { name?: unknown; message?: unknown; code?: unknown } | undefined;

  console.error('[supabase:notifications]', {
    name: typeof value?.name === 'string' ? value.name : typeof error,
    status: typeof value?.status === 'number' ? value.status : 'none',
    code: typeof value?.code === 'string' ? value.code : 'none',
    message: typeof value?.message === 'string' ? value.message : String(error ?? 'Unknown error'),
    cause: cause ? {
      name: typeof cause.name === 'string' ? cause.name : 'unknown',
      code: typeof cause.code === 'string' ? cause.code : 'none',
      message: typeof cause.message === 'string' ? cause.message : 'none',
    } : undefined,
  });
}

interface NotificationRow {
  id: number;
  actor_id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export async function GET(request: NextRequest) {
  const token = sessionToken(request);
  if (!token) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  try {
    await getSupabaseUser(token);
    const notifications = await restRequest<NotificationRow[]>(
      'bus_ticket_notifications?select=id,actor_id,title,body,created_at,read_at&order=created_at.desc&limit=20',
      token,
    );
    const unreadRows = await restRequest<Array<{ id: number }>>(
      'bus_ticket_notifications?select=id&read_at=is.null',
      token,
    );
    return NextResponse.json({ notifications, unreadCount: unreadRows.length });
  } catch (error) {
    logNotificationsError(error);
    const status = (error as { status?: number }).status;
    const code = (error as { code?: string }).code;
    if (code === 'PGRST205') {
      return NextResponse.json({ error: 'Notifications are not installed yet. Re-run ticket/supabase-auth-migration.sql or run ticket/supabase-notifications.sql in the Supabase SQL Editor.' }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load notifications.' }, { status: status === 401 ? 401 : 503 });
  }
}

export async function PATCH(request: NextRequest) {
  const token = sessionToken(request);
  if (!token) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  try {
    await getSupabaseUser(token);
    await restRequest('bus_ticket_notifications?read_at=is.null', token, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ read_at: new Date().toISOString() }),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    logNotificationsError(error);
    const status = (error as { status?: number }).status;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update notifications.' }, { status: status === 401 ? 401 : 503 });
  }
}
