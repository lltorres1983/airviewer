begin;
insert into auth.users (id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.home_radar(user_id, address, latitude, longitude) values (auth.uid(), 'Local de teste', -23.5, -46.6);
do $$ begin
  assert (select count(*) from public.home_radar) = 1, 'Owner can save a home';
  update public.home_radar set radius_km = 10 where user_id = auth.uid();
  assert (select radius_km from public.home_radar) = 10, 'Owner can update a home';
  begin
    update public.home_radar set user_id = '22222222-2222-4222-8222-222222222222';
    raise exception 'Ownership transfer allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.home_radar(user_id, address, latitude, longitude) values ('22222222-2222-4222-8222-222222222222', 'Invalid owner', 0, 0);
    raise exception 'Cross-user insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.home_radar set latitude = 91;
    raise exception 'Invalid latitude accepted';
  exception when check_violation then null; end;
  begin
    update public.home_radar set longitude = 'NaN';
    raise exception 'Invalid longitude accepted';
  exception when check_violation then null; end;
  begin
    update public.home_radar set address = '  ';
    raise exception 'Empty address accepted';
  exception when check_violation then null; end;
  begin
    update public.home_radar set radius_km = 100;
    raise exception 'Invalid radius accepted';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$ declare affected integer; begin
  assert (select count(*) from public.home_radar) = 0, 'Home leaked to another user';
  update public.home_radar set address = 'Changed';
  get diagnostics affected = row_count;
  assert affected = 0, 'Other user updated home';
  delete from public.home_radar;
  get diagnostics affected = row_count;
  assert affected = 0, 'Other user deleted home';
end $$;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform * from public.home_radar;
    raise exception 'Anonymous home read allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.home_radar(user_id, address, latitude, longitude) values ('22222222-2222-4222-8222-222222222222', 'Anon', 0, 0);
    raise exception 'Anonymous home write allowed';
  exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
delete from public.home_radar where user_id = auth.uid();
do $$ begin assert (select count(*) from public.home_radar) = 0, 'Owner cannot delete home'; end $$;
insert into public.home_radar(user_id, address, latitude, longitude) values (auth.uid(), 'Cascade', 0, 0);
reset role;
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
do $$ begin assert (select count(*) from public.home_radar) = 0, 'Account deletion retained home'; end $$;
rollback;
