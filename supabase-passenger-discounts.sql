-- Passenger discount ID verification. Run once in Supabase SQL Editor.
-- ID files stay in a private bucket; no public URLs are stored in the database.

alter table public."Booking"
  add column if not exists "passengerCategory" text not null default 'regular',
  add column if not exists "baseFare" double precision not null default 0,
  add column if not exists "discountRate" double precision not null default 0,
  add column if not exists "discountAmount" double precision not null default 0,
  add column if not exists "discountVerificationId" text;

update public."Booking" b
set "baseFare" = b."totalAmount"
where b."baseFare" = 0;

create table if not exists public."DiscountVerification" (
  id text primary key default gen_random_uuid()::text,
  "userId" text not null,
  "passengerCategory" text not null check ("passengerCategory" in ('student', 'pwd', 'senior_citizen')),
  "idFilePath" text not null,
  "verificationStatus" text not null default 'pending' check ("verificationStatus" in ('pending', 'verified', 'rejected')),
  "adminRemarks" text,
  "reviewedBy" text,
  "submittedAt" timestamptz not null default now(),
  "reviewedAt" timestamptz,
  "updatedAt" timestamptz not null default now()
);

do $$ begin
  alter table public."Booking"
    add constraint "Booking_discountVerificationId_fkey"
    foreign key ("discountVerificationId") references public."DiscountVerification"(id) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists "DiscountVerification_userId_submittedAt_idx"
  on public."DiscountVerification" ("userId", "submittedAt" desc);
create index if not exists "DiscountVerification_status_submittedAt_idx"
  on public."DiscountVerification" ("verificationStatus", "submittedAt" desc);
create index if not exists "Booking_discountVerificationId_idx"
  on public."Booking" ("discountVerificationId");

alter table public."DiscountVerification" enable row level security;
revoke all on public."DiscountVerification" from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('passenger-discount-ids', 'passenger-discount-ids', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png'];

drop policy if exists "discount ids upload own" on storage.objects;
create policy "discount ids upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'passenger-discount-ids'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "discount ids view own or admin" on storage.objects;
create policy "discount ids view own or admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'passenger-discount-ids'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    )
  );

drop policy if exists "discount ids replace own" on storage.objects;
create policy "discount ids replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'passenger-discount-ids' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'passenger-discount-ids' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "discount ids delete own or admin" on storage.objects;
create policy "discount ids delete own or admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'passenger-discount-ids'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    )
  );
