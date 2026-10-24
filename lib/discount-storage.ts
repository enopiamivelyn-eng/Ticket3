import { supabaseConfig } from '@/lib/supabase';

export const DISCOUNT_ID_BUCKET = 'passenger-discount-ids';

export function getAccessToken(request: Request) {
  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    (request as Request & { cookies?: { get(name: string): { value: string } | undefined } }).cookies?.get('auth-token')?.value || '';
}

export async function createPrivateImageUrl(path: string, accessToken: string) {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}/storage/v1/object/sign/${DISCOUNT_ID_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 300 }),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.signedURL !== 'string') {
    throw new Error('Could not create a secure preview for this ID image. Check the private Storage bucket setup.');
  }
  return payload.signedURL.startsWith('http') ? payload.signedURL : `${url}/storage/v1${payload.signedURL}`;
}

export async function uploadPrivateImage(path: string, contentType: string, bytes: ArrayBuffer, accessToken: string) {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}/storage/v1/object/${DISCOUNT_ID_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
    body: bytes,
    cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || 'Could not upload the ID image. Check the private Storage bucket setup.');
  }
}

export async function deletePrivateImage(path: string, accessToken: string) {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}/storage/v1/object/${DISCOUNT_ID_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'DELETE',
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Could not remove the unlinked ID image.');
}
