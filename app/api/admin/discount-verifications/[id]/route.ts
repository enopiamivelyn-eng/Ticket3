import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateRequest, isAdmin } from '@/lib/auth/middleware';
import { createPrivateImageUrl, getAccessToken } from '@/lib/discount-storage';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await authenticateRequest(request);
  if (error || !user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  try {
    const { id } = await params;
    const record = await prisma.discountVerification.findUnique({ where: { id } });
    if (!record) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    const imageUrl = await createPrivateImageUrl(record.idFilePath, getAccessToken(request));
    return NextResponse.json({ application: { id: record.id, userId: record.userId, passengerCategory: record.passengerCategory, verificationStatus: record.verificationStatus, adminRemarks: record.adminRemarks, submittedAt: record.submittedAt, reviewedAt: record.reviewedAt, imageUrl } }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (cause) {
    console.error('Admin discount image preview failed:', cause instanceof Error ? cause.message : 'Unknown error');
    return NextResponse.json({ error: 'Could not open this private ID image.' }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await authenticateRequest(request);
  if (error || !user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  try {
    const { id } = await params;
    const body = await request.json();
    const verificationStatus = body.verificationStatus;
    const adminRemarks = typeof body.adminRemarks === 'string' ? body.adminRemarks.trim() : '';
    if (!['verified', 'rejected'].includes(verificationStatus)) return NextResponse.json({ error: 'Choose Verified or Rejected.' }, { status: 400 });
    if (adminRemarks.length > 1000) return NextResponse.json({ error: 'Remarks must be 1,000 characters or fewer.' }, { status: 400 });
    if (verificationStatus === 'rejected' && !adminRemarks) return NextResponse.json({ error: 'Enter a reason before rejecting this application.' }, { status: 400 });
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.discountVerification.updateMany({
        where: { id, verificationStatus: 'pending' },
        data: { verificationStatus, adminRemarks: adminRemarks || null, reviewedBy: user.userId, reviewedAt: new Date() },
      });
      if (!changed.count) return null;
      return tx.discountVerification.findUnique({ where: { id }, select: { id: true, verificationStatus: true, adminRemarks: true, reviewedAt: true } });
    });
    if (!updated) return NextResponse.json({ error: 'This application was already reviewed. Refresh the list.' }, { status: 409 });
    return NextResponse.json({ success: true, application: updated });
  } catch (cause) {
    console.error('Admin discount review failed:', cause instanceof Error ? cause.message : 'Unknown error');
    return NextResponse.json({ error: 'Could not save the verification decision.' }, { status: 503 });
  }
}
