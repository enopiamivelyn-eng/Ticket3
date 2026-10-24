import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateRequest } from '@/lib/auth/middleware';
import { createPrivateImageUrl, deletePrivateImage, getAccessToken, uploadPrivateImage } from '@/lib/discount-storage';

export const runtime = 'nodejs';
const categories = ['student', 'pwd', 'senior_citizen'] as const;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const { user, error } = await authenticateRequest(request);
  if (error || !user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  try {
    const [records, verified, pendingCount] = await Promise.all([
      prisma.discountVerification.findMany({
        where: { userId: user.userId },
        orderBy: { submittedAt: 'desc' },
        take: 10,
        select: { id: true, passengerCategory: true, verificationStatus: true, adminRemarks: true, submittedAt: true, reviewedAt: true, idFilePath: true },
      }),
      prisma.discountVerification.findMany({ where: { userId: user.userId, verificationStatus: 'verified' }, distinct: ['passengerCategory'], orderBy: { reviewedAt: 'desc' }, select: { id: true, passengerCategory: true } }),
      prisma.discountVerification.count({ where: { userId: user.userId, verificationStatus: 'pending' } }),
    ]);
    const token = getAccessToken(request);
    const includeImage = new URL(request.url).searchParams.get('includeImage') !== 'false';
    const latest = records[0] || null;
    const verification = latest ? {
      id: latest.id,
      passengerCategory: latest.passengerCategory,
      verificationStatus: latest.verificationStatus,
      adminRemarks: latest.adminRemarks,
      submittedAt: latest.submittedAt,
      reviewedAt: latest.reviewedAt,
      fileName: latest.idFilePath.split('/').pop(),
      ...(includeImage ? { imageUrl: await createPrivateImageUrl(latest.idFilePath, token) } : {}),
    } : null;
    return NextResponse.json({
      verification,
      verifiedCategories: verified.map((record) => record.passengerCategory),
      verifiedApplications: verified.map((record) => ({ id: record.id, passengerCategory: record.passengerCategory })),
      canSubmit: pendingCount === 0,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (cause) {
    console.error('Discount verification load failed:', cause instanceof Error ? cause.message : 'Unknown error');
    return NextResponse.json({ error: 'Could not load discount verification.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const { user, error } = await authenticateRequest(request);
  if (error || !user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role === 'admin') return NextResponse.json({ error: 'Admin accounts cannot submit passenger discount applications.' }, { status: 403 });

  let path = '';
  let uploaded = false;
  let saved = false;
  try {
    const form = await request.formData();
    const category = String(form.get('passengerCategory') || '');
    const file = form.get('idImage');
    if (!categories.includes(category as (typeof categories)[number])) return NextResponse.json({ error: 'Choose Student, PWD, or Senior Citizen.' }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a JPG or PNG image of your ID.' }, { status: 400 });
    if (file.size < 1 || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'The image must be smaller than 5 MB.' }, { status: 400 });
    const bytes = await file.arrayBuffer();
    const signature = new Uint8Array(bytes.slice(0, 8));
    const isPng = signature.length >= 8 && signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47 && signature[4] === 0x0d && signature[5] === 0x0a && signature[6] === 0x1a && signature[7] === 0x0a;
    const isJpeg = signature.length >= 3 && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
    const contentType = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : '';
    if (!contentType || file.type !== contentType) return NextResponse.json({ error: 'The file contents must be a valid JPG or PNG image.' }, { status: 400 });

    const prior = await prisma.discountVerification.findFirst({ where: { userId: user.userId }, orderBy: { submittedAt: 'desc' }, select: { verificationStatus: true, passengerCategory: true } });
    if (prior?.verificationStatus === 'pending') return NextResponse.json({ error: 'Your application is already pending review.' }, { status: 409 });
    if (prior?.verificationStatus === 'verified' && prior.passengerCategory === category) return NextResponse.json({ error: 'This category is already verified.' }, { status: 409 });

    path = `${user.userId}/${randomUUID()}.${contentType === 'image/png' ? 'png' : 'jpg'}`;
    await uploadPrivateImage(path, contentType, bytes, getAccessToken(request));
    uploaded = true;
    const imageUrl = await createPrivateImageUrl(path, getAccessToken(request));
    const verification = await prisma.discountVerification.create({
      data: { userId: user.userId, passengerCategory: category, idFilePath: path },
      select: { id: true, passengerCategory: true, verificationStatus: true, adminRemarks: true, submittedAt: true, reviewedAt: true, idFilePath: true },
    });
    saved = true;
    return NextResponse.json({ success: true, verification: { ...verification, fileName: path.split('/').pop(), imageUrl } }, { status: 201, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (cause) {
    if (uploaded && !saved && path) await deletePrivateImage(path, getAccessToken(request)).catch(() => undefined);
    console.error('Discount ID submission failed:', cause instanceof Error ? cause.message : 'Unknown error');
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Could not submit your ID for review.' }, { status: 503 });
  }
}
