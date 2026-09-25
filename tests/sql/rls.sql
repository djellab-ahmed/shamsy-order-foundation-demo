\set ON_ERROR_STOP on
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on all tables in schema public to authenticated;
insert into auth.users(id) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),('ffffffff-ffff-4fff-8fff-ffffffffffff'),('99999999-9999-4999-8999-999999999999');
insert into public.organizations(id,name) values ('00000000-0000-4000-8000-000000000002','Other tenant');
insert into public.organization_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','owner'),
('00000000-0000-4000-8000-000000000001','ffffffff-ffff-4fff-8fff-ffffffffffff','sales_adviser'),
('00000000-0000-4000-8000-000000000002','99999999-9999-4999-8999-999999999999','owner');
set role authenticated;
set request.jwt.claim.sub = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
do $$ begin
  if (select count(*) from public.organizations) <> 1 then raise exception 'Tenant isolation failed'; end if;
  if (select count(*) from public.customers) <> 3 then raise exception 'Customer isolation failed'; end if;
  begin
    perform public.create_shamsy_order('00000000-0000-4000-8000-000000000002','55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',8200,'[]'::jsonb);
    raise exception 'Cross-tenant RPC bypassed';
  exception when insufficient_privilege then
    if sqlerrm <> 'Sales role required' then raise; end if;
  end;
  begin
    perform public.approve_order_discount('00000000-0000-4000-8000-000000000002','55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111112','dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,15000,'');
    raise exception 'Cross-tenant approval bypassed';
  exception when insufficient_privilege then
    if sqlerrm <> 'Owner role required' then raise; end if;
  end;
  begin
    perform public.create_shamsy_order('00000000-0000-4000-8000-000000000001','66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111',7900,
      '[{"line_key":"11111111-1111-4111-8111-111111111110","product_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","quantity":4,"discount_usd_cents":4000}]'::jsonb);
    raise exception 'Below-minimum rate bypassed';
  exception when others then
    if sqlerrm <> 'Exchange rate below minimum or invalid' then raise; end if;
  end;
  begin
    perform public.create_shamsy_order('00000000-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',8200,
      '[{"line_key":"11111111-1111-4111-8111-111111111112","product_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","quantity":1,"discount_usd_cents":15000}]'::jsonb);
    raise exception 'Unapproved discount bypassed';
  exception when insufficient_privilege then
    if sqlerrm not like 'Owner approval is required%' then raise; end if;
  end;
  begin
    perform public.approve_order_discount('00000000-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111112','dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,15000,'');
    raise exception 'Adviser approved';
  exception when insufficient_privilege then
    if sqlerrm <> 'Owner role required' then raise; end if;
  end;
end $$;
set request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
select public.approve_order_discount('00000000-0000-4000-8000-000000000001','77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111114','dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,15000,'Price invalidation test');
update public.products set price_usd_cents=210000 where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
update public.products set price_usd_cents=207000 where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
set request.jwt.claim.sub = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
do $$ begin
  begin
    perform public.create_shamsy_order('00000000-0000-4000-8000-000000000001','77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111',8200,
      '[{"line_key":"11111111-1111-4111-8111-111111111114","product_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","quantity":1,"discount_usd_cents":15000}]'::jsonb);
    raise exception 'Price change did not revoke approval';
  exception when insufficient_privilege then
    if sqlerrm not like 'Owner approval is required%' then raise; end if;
  end;
  if exists (select 1 from public.orders where idempotency_key='77777777-7777-4777-8777-777777777777') then raise exception 'Revoked approval persisted an order'; end if;
end $$;
set request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
select public.approve_order_discount('00000000-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111112','dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,15000,'Worked example');
select public.approve_order_discount('00000000-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111113','dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,30000,'Quantity binding test');
set request.jwt.claim.sub = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
do $$ begin
  if (select count(*) from public.discount_approvals) <> 0 then raise exception 'Adviser can enumerate owner approvals'; end if;
  begin
    perform public.create_shamsy_order('00000000-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',8200,
      '[{"line_key":"11111111-1111-4111-8111-111111111112","product_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","quantity":1,"discount_usd_cents":16000}]'::jsonb);
    raise exception 'Changed approved discount bypassed';
  exception when insufficient_privilege then
    if sqlerrm not like 'Owner approval is required%' then raise; end if;
  end;
  begin
    perform public.create_shamsy_order('00000000-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',8200,
      '[{"line_key":"11111111-1111-4111-8111-111111111113","product_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","quantity":2,"discount_usd_cents":30000}]'::jsonb);
    raise exception 'Changed approved quantity bypassed';
  exception when insufficient_privilege then
    if sqlerrm not like 'Owner approval is required%' then raise; end if;
  end;
  begin
    perform public.create_shamsy_order('00000000-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',8200,
      '[{"line_key":"11111111-1111-4111-8111-111111111112","product_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","quantity":1,"discount_usd_cents":15000}]'::jsonb);
    raise exception 'Changed approved product bypassed';
  exception when insufficient_privilege then
    if sqlerrm not like 'Owner approval is required%' then raise; end if;
  end;
  if exists (select 1 from public.orders where idempotency_key='44444444-4444-4444-8444-444444444444') then raise exception 'Rejected request persisted an order'; end if;
end $$;
select public.create_shamsy_order('00000000-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',8200,
  '[{"line_key":"11111111-1111-4111-8111-111111111110","product_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","quantity":4,"discount_usd_cents":4000,"unit_price_usd_cents":1,"total_usd_cents":0},{"line_key":"11111111-1111-4111-8111-111111111111","product_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","quantity":2,"discount_usd_cents":7000},{"line_key":"11111111-1111-4111-8111-111111111112","product_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","quantity":1,"discount_usd_cents":15000}]'::jsonb);
-- Same key must return the same order, regardless of a lost response and retry.
select public.create_shamsy_order('00000000-0000-4000-8000-000000000001','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',8200,'[]'::jsonb);
reset role;
update public.settings set current_rate_sdg_per_usd = 9000 where organization_id = '00000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
do $$ begin
  if (select count(*) from public.orders) <> 1 then raise exception 'Idempotency failed'; end if;
  if not exists(select 1 from public.orders where exchange_rate_sdg_per_usd=8200 and total_usd_cents=549000 and total_sdg=45018000) then raise exception 'Historical facts failed'; end if;
  if not exists(select 1 from public.order_lines where product_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and unit_price_usd_cents=51500 and line_total_usd_cents=202000) then raise exception 'Client price forgery affected saved line'; end if;
  if (select current_rate_sdg_per_usd from public.settings where organization_id='00000000-0000-4000-8000-000000000001') <> 9000 then raise exception 'Current rate failed'; end if;
  begin
    insert into public.orders(organization_id,customer_id,created_by,idempotency_key,exchange_rate_sdg_per_usd,subtotal_usd_cents,discount_usd_cents,total_usd_cents,total_sdg)
    values('00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',auth.uid(),gen_random_uuid(),8200,0,0,0,0);
    raise exception 'Direct insert bypassed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.discount_approvals(organization_id,order_idempotency_key,line_key,product_id,quantity,unit_price_usd_cents,discount_usd_cents,approved_by)
    values('00000000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid(),'dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,207000,15000,auth.uid());
    raise exception 'Direct approval insert bypassed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.order_lines set discount_usd_cents=0 where product_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    raise exception 'Historical line update bypassed';
  exception when insufficient_privilege then null;
  end;
  update public.products set price_usd_cents=1 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if (select price_usd_cents from public.products where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 51500 then raise exception 'Adviser changed catalogue price'; end if;
end $$;
select public.create_shamsy_order('00000000-0000-4000-8000-000000000001','88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111',8200,
  '[{"line_key":"11111111-1111-4111-8111-111111111115","product_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","quantity":4,"discount_usd_cents":4000},{"line_key":"11111111-1111-4111-8111-111111111116","product_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","quantity":2,"discount_usd_cents":7000}]'::jsonb);
do $$ begin
  if not exists (select 1 from public.orders where idempotency_key='88888888-8888-4888-8888-888888888888' and total_usd_cents=357000 and total_sdg=29274000) then raise exception 'Two-line adviser order failed'; end if;
end $$;
