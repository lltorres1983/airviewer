create table public.home_radar (
  user_id uuid primary key references auth.users(id) on delete cascade,
  address text not null check (char_length(btrim(address)) between 1 and 300),
  latitude double precision not null check (latitude between -85 and 85),
  longitude double precision not null check (longitude between -180 and 180),
  radius_km integer not null default 20 check (radius_km in (5, 10, 20)),
  updated_at timestamptz not null default now()
);
alter table public.home_radar enable row level security;
revoke all on public.home_radar from anon, authenticated;
grant select, insert, update, delete on public.home_radar to authenticated;
grant all on public.home_radar to service_role;
create policy "Owners read home radar" on public.home_radar for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Owners create home radar" on public.home_radar for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Owners update home radar" on public.home_radar for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete home radar" on public.home_radar for delete to authenticated
using ((select auth.uid()) = user_id);
