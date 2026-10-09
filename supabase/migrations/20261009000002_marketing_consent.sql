-- Marketing consent, kept as a log rather than a flag.
--
-- UK GDPR and PECR want two things here: consent that was freely given (so the
-- tickbox starts unticked and the app works the same either way), and proof
-- of it - who agreed, when, and to what wording. A boolean on profiles proves
-- nothing once it has been flipped twice, so every change is a new row and
-- the current state is the latest row per person.
--
-- Rows come from two places:
--   * sign-up: the tickbox travels in the sign-up metadata, and a trigger on
--     auth.users writes the first row. This has to happen in the database,
--     because with email confirmation on there is no session yet to write
--     with.
--   * Settings: set_marketing_consent(), which appends a row.
-- Users can't read or write the table directly.

create table if not exists public.marketing_consent_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  email      text not null,
  granted    boolean not null,
  wording    text not null,
  source     text not null check (source in ('signup', 'settings')),
  created_at timestamptz not null default now()
);

create index if not exists marketing_consent_log_user on public.marketing_consent_log (user_id, created_at desc);

alter table public.marketing_consent_log enable row level security;
revoke all on public.marketing_consent_log from anon, authenticated;

-- Sign-up. Never allowed to fail the sign-up itself: a person who can't create
-- an account because a consent row wouldn't write is worse than a missing row,
-- and a missing row means "no consent", which is the safe reading.
create or replace function public.log_signup_marketing_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data ? 'marketing_consent' then
    insert into public.marketing_consent_log (user_id, email, granted, wording, source)
    values (
      new.id,
      coalesce(new.email, ''),
      coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false),
      coalesce(new.raw_user_meta_data ->> 'marketing_consent_wording', ''),
      'signup'
    );
  end if;
  return new;
exception when others then
  raise warning 'marketing consent not logged for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_marketing_consent on auth.users;
create trigger on_auth_user_created_marketing_consent
  after insert on auth.users
  for each row execute function public.log_signup_marketing_consent();

-- Settings: the caller's current answer. False when they've never said.
create or replace function public.get_marketing_consent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select granted from public.marketing_consent_log
    where user_id = auth.uid()
    order by created_at desc, id desc
    limit 1
  ), false);
$$;

-- Settings: record a change. Only ever for the caller.
create or replace function public.set_marketing_consent(p_granted boolean, p_wording text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  insert into public.marketing_consent_log (user_id, email, granted, wording, source)
  select uid, coalesce(u.email, ''), p_granted, left(coalesce(p_wording, ''), 500), 'settings'
  from auth.users u where u.id = uid;
end;
$$;

revoke all on function public.log_signup_marketing_consent() from public, anon, authenticated;
revoke all on function public.get_marketing_consent() from public, anon;
revoke all on function public.set_marketing_consent(boolean, text) from public, anon;
grant execute on function public.get_marketing_consent() to authenticated;
grant execute on function public.set_marketing_consent(boolean, text) to authenticated;

-- Who you may email right now: everyone whose latest answer is yes, at their
-- current address. For Harrison to export from the SQL editor or table view;
-- not reachable through the API. The inner query takes the latest row per
-- person; the outer one keeps the yeses.
create or replace view public.marketing_optins as
select * from (
  select distinct on (l.user_id)
    l.user_id, u.email, l.granted, l.created_at as consented_at, l.wording
  from public.marketing_consent_log l
  join auth.users u on u.id = l.user_id
  order by l.user_id, l.created_at desc, l.id desc
) latest
where granted;

revoke all on public.marketing_optins from anon, authenticated;
