-- Daily scan allowance, counted on the server.
--
-- /api/analyse claims a slot here before it calls Claude, using the caller's
-- own JWT. The table has no grants for anon or authenticated, so nobody can
-- read, reset or pad their count directly - the two functions below are the
-- only way in, and they only ever act on auth.uid().
--
-- Days run on UK time, so the allowance resets at midnight in Exeter rather
-- than at 1am half the year.

create table if not exists public.scan_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('scan', 'craving')),
  day        date not null default (now() at time zone 'Europe/London')::date,
  created_at timestamptz not null default now()
);

create index if not exists scan_usage_user_day on public.scan_usage (user_id, day, kind);

alter table public.scan_usage enable row level security;
revoke all on public.scan_usage from anon, authenticated;

-- Claims one slot. Returns how many are left today after this one, or null
-- when today's allowance was already used up.
--
-- There is deliberately no matching "give it back" function. Anything the API
-- can call with the user's JWT, the user can call too, straight at PostgREST -
-- so a refund function would be a reset button for the limit. A scan that
-- fails on our side still costs a slot; that's the price of not needing the
-- service-role key on Vercel. The advisory lock serialises one user's concurrent claims, so
-- firing five requests at once can't slip past the count.
create or replace function public.claim_scan(p_kind text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  today date := (now() at time zone 'Europe/London')::date;
  cap   int;
  used  int;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  cap := case p_kind when 'scan' then 3 when 'craving' then 10 end;
  if cap is null then
    raise exception 'unknown kind %', p_kind;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text || p_kind, 0));

  select count(*) into used
  from public.scan_usage
  where user_id = uid and day = today and kind = p_kind;

  if used >= cap then
    return null;
  end if;

  insert into public.scan_usage (user_id, kind, day)
  values (uid, p_kind, today);

  return cap - used - 1;
end;
$$;

revoke all on function public.claim_scan(text) from public, anon;
grant execute on function public.claim_scan(text) to authenticated;
