-- Google accounts are created by Supabase Auth in auth.users on first sign-in.
create table public.aircraft_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  aircraft_hex text not null check (aircraft_hex ~ '^[a-f0-9]{6}$'),
  registration text not null default '' check (char_length(registration) <= 16),
  aircraft_type text not null default '' check (char_length(aircraft_type) <= 16),
  created_at timestamptz not null default now(),
  primary key (user_id, aircraft_hex)
);

alter table public.aircraft_favorites enable row level security;
revoke all on public.aircraft_favorites from anon, authenticated;
grant select, insert, delete on public.aircraft_favorites to authenticated;
grant all on public.aircraft_favorites to service_role;

create policy "Users read their own favorites"
on public.aircraft_favorites for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users add their own favorites"
on public.aircraft_favorites for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users delete their own favorites"
on public.aircraft_favorites for delete to authenticated
using ((select auth.uid()) = user_id);
