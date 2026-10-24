import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateRequest, isAdmin } from '@/lib/auth/middleware';
import { supabaseConfig } from '@/lib/supabase';
import { getAccessToken } from '@/lib/discount-storage';

export async function GET(request: NextRequest) {
  const { user, error } = await authenticateRequest(request);
  if (error || !user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const category = searchParams.get('category') || '';
    const records = await prisma.discountVerification.findMany({
      where: { ...(status ? { verificationStatus: status } : {}), ...(category ? { passengerCategory: category } : {}) },
      orderBy: { submittedAt: 'desc' },
      take: 200,
      select: { id: true, userId: true, passengerCategory: true, verificationStatus: true, adminRemarks: true, submittedAt: true, reviewedAt: true, reviewedBy: true },
    });
    const ids = [...new Set(records.map((record) => record.userId))];
    const profiles = new Map<string, { email: string; name: string }>();
    if (ids.length) {
      const { url, anonKey } = supabaseConfig();
      const query = new URLSearchParams({ select: 'id,email,name', id: `in.(${ids.join(',')})` });
      const response = await fetch(`${url}/rest/v1/auth_profiles?${query}`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${getAccessToken(request)}` },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Could not load passenger profile details. Check the admin auth_profiles policy.');
      const rows = await response.json() as Array<{ id: string; email: string; name: string }>;
      for (const row of rows) profiles.set(row.id, { email: row.email || '', name: row.name || '' });
    }
    const counts = await prisma.discountVerification.groupBy({ by: ['verificationStatus'], _count: { _all: true } });
    return NextResponse.json({
      applications: records.map((record) => ({ ...record, passengerName: profiles.get(record.userId)?.name || '', passengerEmail: profiles.get(record.userId)?.email || '' })),
      counts: Object.fromEntries(counts.map((row) => [row.verificationStatus, row._count._all])),
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (cause) {
    console.error('Admin discount list failed:', cause instanceof Error ? cause.message : 'Unknown error');
    return NextResponse.json({ error: 'Could not load discount applications. Apply supabase-passenger-discounts.sql and confirm the admin profile policy.' }, { status: 503 });
  }
}
