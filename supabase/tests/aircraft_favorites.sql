begin;
insert into auth.users (id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
declare saved text;
begin
  insert into public.aircraft_favorites (user_id, aircraft_hex, registration) values (auth.uid(), 'abc123', 'PT-ABC') returning aircraft_hex into saved;
  assert saved = 'abc123', 'Owner insert must persist a row';
  begin
    insert into public.aircraft_favorites (user_id, aircraft_hex) values ('22222222-2222-4222-8222-222222222222', 'def456');
    raise exception 'Cross-user insertion was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.aircraft_favorites (user_id, aircraft_hex) values (auth.uid(), 'abc123');
    raise exception 'Duplicate favorite was allowed';
  exception when unique_violation then null;
  end;
  begin
    insert into public.aircraft_favorites (user_id, aircraft_hex) values (auth.uid(), 'invalid');
    raise exception 'Invalid hex was allowed';
  exception when check_violation then null;
  end;
  begin
    update public.aircraft_favorites set user_id = '22222222-2222-4222-8222-222222222222';
    raise exception 'Ownership transfer was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
declare affected integer;
begin
  assert (select count(*) from public.aircraft_favorites) = 0, 'Another user can read private favorites';
  delete from public.aircraft_favorites where aircraft_hex = 'abc123';
  get diagnostics affected = row_count;
  assert affected = 0, 'Another user can delete private favorites';
  insert into public.aircraft_favorites (user_id, aircraft_hex) values (auth.uid(), 'abc123');
  assert (select count(*) from public.aircraft_favorites) = 1, 'Each user can favorite the same aircraft';
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
declare removed text;
begin
  assert (select registration from public.aircraft_favorites where aircraft_hex = 'abc123') = 'PT-ABC', 'Other user changed owner data';
  delete from public.aircraft_favorites where aircraft_hex = 'abc123' returning aircraft_hex into removed;
  assert removed = 'abc123', 'Owner must be able to remove a favorite';
end $$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform * from public.aircraft_favorites;
    raise exception 'Anonymous read was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.aircraft_favorites (user_id, aircraft_hex) values ('11111111-1111-4111-8111-111111111111', 'abc123');
    raise exception 'Anonymous insert was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.aircraft_favorites;
    raise exception 'Anonymous delete was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.aircraft_favorites set registration = 'OTHER';
    raise exception 'Anonymous update was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
delete from auth.users where id = '22222222-2222-4222-8222-222222222222';
do $$ begin
  assert (select count(*) from public.aircraft_favorites) = 0, 'Account deletion must remove favorites';
end $$;
rollback;
