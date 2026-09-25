-- Fictional seed tenant. Add a real auth.users account and organization_members row after provisioning.
insert into public.organizations(id,name) values ('00000000-0000-4000-8000-000000000001','Shamsy concept demo');
insert into public.settings(organization_id,minimum_rate_sdg_per_usd,current_rate_sdg_per_usd)
values ('00000000-0000-4000-8000-000000000001',8000,8200);
insert into public.customers(id,organization_id,name,city) values
('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','Ahmed Trading','Khartoum'),
('22222222-2222-4222-8222-222222222222','00000000-0000-4000-8000-000000000001','Nile Solar','Omdurman'),
('33333333-3333-4333-8333-333333333333','00000000-0000-4000-8000-000000000001','Dongola Power','Dongola');
insert into public.products(id,organization_id,sku,name,description,price_usd_cents) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-4000-8000-000000000001','SPF-6000-ES-PLUS','SPF 6000 ES Plus','6 kW inverter',51500),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','00000000-0000-4000-8000-000000000001','SPE-12000-ES','SPE 12000 ES','12 kW inverter',97500),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','00000000-0000-4000-8000-000000000001','HOPE-5.0L-B1','Hope 5.0L-B1','5 kWh battery',81000),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','00000000-0000-4000-8000-000000000001','HOPE-16.0LM-A1','Hope 16.0LM-A1','16 kWh battery',207000);
