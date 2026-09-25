-- Shamsy Operations concept: one tenant-ready order and finance slice.
create extension if not exists pgcrypto;
create type public.shamsy_role as enum ('owner','marketing','sales_adviser','warehouse');
create type public.discount_state as enum ('normal','sand','red','approved');

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organization_members (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id), role public.shamsy_role not null,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id,user_id)
);
create table public.settings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null unique references public.organizations(id),
  minimum_rate_sdg_per_usd bigint not null default 8000 check (minimum_rate_sdg_per_usd >= 8000),
  current_rate_sdg_per_usd bigint not null default 8200 check (current_rate_sdg_per_usd >= minimum_rate_sdg_per_usd),
  updated_at timestamptz not null default now()
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  name text not null, city text not null, assigned_adviser_id uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id,id)
);
create table public.products (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  sku text not null, name text not null, description text not null default '',
  price_usd_cents bigint not null check (price_usd_cents > 0), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id,id), unique (organization_id,sku)
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  customer_id uuid not null, created_by uuid not null references auth.users(id),
  idempotency_key uuid not null, status text not null default 'saved' check (status in ('saved','void')),
  exchange_rate_sdg_per_usd bigint not null check (exchange_rate_sdg_per_usd >= 8000),
  subtotal_usd_cents bigint not null check (subtotal_usd_cents >= 0),
  discount_usd_cents bigint not null check (discount_usd_cents >= 0),
  total_usd_cents bigint not null check (total_usd_cents >= 0),
  total_sdg bigint not null check (total_sdg >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id,id), unique (organization_id,idempotency_key),
  foreign key (organization_id,customer_id) references public.customers(organization_id,id)
);
create table public.order_lines (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  order_id uuid not null, product_id uuid not null, quantity integer not null check (quantity between 1 and 9999),
  unit_price_usd_cents bigint not null check (unit_price_usd_cents >= 0),
  discount_usd_cents bigint not null check (discount_usd_cents >= 0),
  line_total_usd_cents bigint not null check (line_total_usd_cents >= 0),
  discount_percentage_basis_points integer not null check (discount_percentage_basis_points between 0 and 10000),
  discount_status public.discount_state not null,
  owner_approved_at timestamptz, owner_approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (organization_id,order_id) references public.orders(organization_id,id),
  foreign key (organization_id,product_id) references public.products(organization_id,id)
);
create table public.discount_approvals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  order_idempotency_key uuid not null, line_key uuid not null,
  product_id uuid not null, quantity integer not null check (quantity between 1 and 9999),
  unit_price_usd_cents bigint not null, discount_usd_cents bigint not null,
  approved_at timestamptz not null default now(), approved_by uuid not null references auth.users(id),
  note text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id,order_idempotency_key,line_key),
  foreign key (organization_id,product_id) references public.products(organization_id,id)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  order_id uuid, actor_id uuid references auth.users(id),
  event_type text not null, details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (organization_id,order_id) references public.orders(organization_id,id)
);
create index on public.organization_members(user_id,organization_id) where active;
create index on public.orders(organization_id,created_at desc);
create index on public.order_lines(organization_id,order_id);
create index on public.audit_events(organization_id,order_id,created_at);

-- SECURITY DEFINER helper avoids recursive membership RLS. Never takes a user ID from a caller.
create function public.shamsy_member_role(p_org uuid) returns public.shamsy_role
language sql stable security definer set search_path = '' as $$
  select role from public.organization_members where organization_id = p_org and user_id = auth.uid() and active limit 1
$$;
revoke all on function public.shamsy_member_role(uuid) from public;
grant execute on function public.shamsy_member_role(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.settings enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.discount_approvals enable row level security;
alter table public.audit_events enable row level security;

create policy org_read on public.organizations for select to authenticated using (public.shamsy_member_role(id) is not null);
create policy profile_self on public.profiles for select to authenticated using (id = auth.uid());
create policy profile_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy members_read on public.organization_members for select to authenticated using (public.shamsy_member_role(organization_id) is not null);
create policy members_owner_write on public.organization_members for all to authenticated using (public.shamsy_member_role(organization_id) = 'owner') with check (public.shamsy_member_role(organization_id) = 'owner');
create policy settings_read on public.settings for select to authenticated using (public.shamsy_member_role(organization_id) is not null);
create policy settings_owner_update on public.settings for update to authenticated using (public.shamsy_member_role(organization_id) = 'owner') with check (public.shamsy_member_role(organization_id) = 'owner');
create policy customers_read on public.customers for select to authenticated using (
  public.shamsy_member_role(organization_id) in ('owner','marketing','warehouse') or
  (public.shamsy_member_role(organization_id) = 'sales_adviser' and (assigned_adviser_id is null or assigned_adviser_id = auth.uid()))
);
create policy customers_owner_write on public.customers for all to authenticated using (public.shamsy_member_role(organization_id) = 'owner') with check (public.shamsy_member_role(organization_id) = 'owner');
create policy products_read on public.products for select to authenticated using (public.shamsy_member_role(organization_id) is not null);
create policy products_owner_write on public.products for all to authenticated using (public.shamsy_member_role(organization_id) = 'owner') with check (public.shamsy_member_role(organization_id) = 'owner');
create policy orders_read on public.orders for select to authenticated using (public.shamsy_member_role(organization_id) = 'owner' or (public.shamsy_member_role(organization_id) = 'sales_adviser' and created_by = auth.uid()));
create policy lines_read on public.order_lines for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and o.organization_id = organization_id));
create policy approvals_read on public.discount_approvals for select to authenticated using (public.shamsy_member_role(organization_id) = 'owner');
create policy audit_read on public.audit_events for select to authenticated using (public.shamsy_member_role(organization_id) = 'owner' or exists (select 1 from public.orders o where o.id = order_id and o.organization_id = organization_id and o.created_by = auth.uid()));

-- No direct authenticated INSERT/UPDATE/DELETE grants on financial tables. Writes go through functions.
revoke insert,update,delete on public.orders,public.order_lines,public.discount_approvals,public.audit_events from authenticated;

create function public.approve_order_discount(
  p_org uuid, p_order_key uuid, p_line_key uuid, p_product uuid,
  p_quantity integer, p_discount_usd_cents bigint, p_note text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_price bigint; v_id uuid;
begin
  if public.shamsy_member_role(p_org) is distinct from 'owner' then raise exception 'Owner role required' using errcode = '42501'; end if;
  if p_quantity not between 1 and 9999 or p_discount_usd_cents < 0 then raise exception 'Invalid quantity or discount'; end if;
  select price_usd_cents into v_price from public.products where organization_id = p_org and id = p_product and active;
  if v_price is null then raise exception 'Product unavailable'; end if;
  if p_discount_usd_cents > v_price * p_quantity or p_discount_usd_cents * 100 <= v_price * p_quantity * 5 then raise exception 'Not a restricted discount'; end if;
  insert into public.discount_approvals (organization_id,order_idempotency_key,line_key,product_id,quantity,unit_price_usd_cents,discount_usd_cents,approved_by,note)
  values (p_org,p_order_key,p_line_key,p_product,p_quantity,v_price,p_discount_usd_cents,auth.uid(),left(coalesce(p_note,''),240))
  on conflict (organization_id,order_idempotency_key,line_key) do update set
    product_id = excluded.product_id, quantity = excluded.quantity, unit_price_usd_cents = excluded.unit_price_usd_cents,
    discount_usd_cents = excluded.discount_usd_cents, approved_by = excluded.approved_by,
    approved_at = now(), note = excluded.note returning id into v_id;
  insert into public.audit_events (organization_id,actor_id,event_type,details)
  values (p_org,auth.uid(),'discount_approved',jsonb_build_object('order_key',p_order_key,'line_key',p_line_key,'discount_usd_cents',p_discount_usd_cents));
  return v_id;
end $$;
revoke all on function public.approve_order_discount(uuid,uuid,uuid,uuid,integer,bigint,text) from public;
grant execute on function public.approve_order_discount(uuid,uuid,uuid,uuid,integer,bigint,text) to authenticated;

create function public.create_shamsy_order(
  p_org uuid, p_order_key uuid, p_customer uuid, p_rate bigint, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_role public.shamsy_role; v_min bigint; v_order uuid; v_line jsonb;
  v_line_key uuid; v_product uuid; v_qty integer; v_price bigint; v_discount bigint;
  v_subtotal bigint := 0; v_discount_total bigint := 0; v_line_subtotal bigint; v_approval public.discount_approvals%rowtype;
  v_approved boolean; v_status public.discount_state; v_existing uuid;
begin
  v_role := public.shamsy_member_role(p_org);
  if v_role is null or v_role not in ('owner','sales_adviser') then raise exception 'Sales role required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text || p_order_key::text, 0));
  select id into v_existing from public.orders where organization_id = p_org and idempotency_key = p_order_key;
  if v_existing is not null then return v_existing; end if;
  select minimum_rate_sdg_per_usd into v_min from public.settings where organization_id = p_org;
  if v_min is null or p_rate < v_min or p_rate > 100000000 then raise exception 'Exchange rate below minimum or invalid'; end if;
  if not exists (select 1 from public.customers where organization_id = p_org and id = p_customer and
    (v_role = 'owner' or assigned_adviser_id is null or assigned_adviser_id = auth.uid())) then raise exception 'Customer unavailable'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 100 then raise exception 'Order needs 1 to 100 lines'; end if;
  if (select count(distinct value->>'line_key') from jsonb_array_elements(p_lines)) <> jsonb_array_length(p_lines) then raise exception 'Duplicate or missing line key'; end if;
  -- Validate every line and all approvals before inserting the order.
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_line_key := (v_line->>'line_key')::uuid; v_product := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::integer; v_discount := (v_line->>'discount_usd_cents')::bigint;
    select price_usd_cents into v_price from public.products where organization_id = p_org and id = v_product and active;
    if v_line_key is null or v_price is null or v_qty is null or v_qty not between 1 and 9999 or v_discount is null or v_discount < 0 then raise exception 'Invalid order line'; end if;
    v_line_subtotal := v_price * v_qty;
    if v_discount > v_line_subtotal then raise exception 'Discount exceeds line value'; end if;
    if v_discount * 100 > v_line_subtotal * 5 then
      select * into v_approval from public.discount_approvals where organization_id = p_org and order_idempotency_key = p_order_key and line_key = v_line_key
        and product_id = v_product and quantity = v_qty and unit_price_usd_cents = v_price and discount_usd_cents = v_discount;
      if not found then raise exception 'Owner approval is required for one line above the 5%% discount threshold.' using errcode = '42501'; end if;
    end if;
    v_subtotal := v_subtotal + v_line_subtotal; v_discount_total := v_discount_total + v_discount;
  end loop;
  insert into public.orders (organization_id,customer_id,created_by,idempotency_key,exchange_rate_sdg_per_usd,subtotal_usd_cents,discount_usd_cents,total_usd_cents,total_sdg)
  values (p_org,p_customer,auth.uid(),p_order_key,p_rate,v_subtotal,v_discount_total,v_subtotal-v_discount_total,((v_subtotal-v_discount_total)*p_rate+50)/100)
  returning id into v_order;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_line_key := (v_line->>'line_key')::uuid; v_product := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::integer; v_discount := (v_line->>'discount_usd_cents')::bigint;
    select price_usd_cents into v_price from public.products where organization_id = p_org and id = v_product;
    v_line_subtotal := v_price * v_qty; v_approved := false;
    if v_discount * 100 > v_line_subtotal * 5 then
      select * into v_approval from public.discount_approvals where organization_id = p_org and order_idempotency_key = p_order_key and line_key = v_line_key;
      v_approved := true; v_status := 'approved';
    elsif v_discount = 0 then v_status := 'normal';
    elsif v_discount * 100 <= v_line_subtotal * 3 then v_status := 'sand';
    else v_status := 'red'; end if;
    insert into public.order_lines (organization_id,order_id,product_id,quantity,unit_price_usd_cents,discount_usd_cents,line_total_usd_cents,discount_percentage_basis_points,discount_status,owner_approved_at,owner_approved_by)
    values (p_org,v_order,v_product,v_qty,v_price,v_discount,v_line_subtotal-v_discount,round(v_discount::numeric*10000/v_line_subtotal)::integer,v_status,
      case when v_approved then v_approval.approved_at end,case when v_approved then v_approval.approved_by end);
  end loop;
  insert into public.audit_events (organization_id,order_id,actor_id,event_type,details)
  values (p_org,v_order,auth.uid(),'order_created',jsonb_build_object('rate_snapshot',p_rate,'total_usd_cents',v_subtotal-v_discount_total,'total_sdg',((v_subtotal-v_discount_total)*p_rate+50)/100));
  return v_order;
end $$;
revoke all on function public.create_shamsy_order(uuid,uuid,uuid,bigint,jsonb) from public;
grant execute on function public.create_shamsy_order(uuid,uuid,uuid,bigint,jsonb) to authenticated;

-- Stored financial facts are append-only, even if a privileged application path is added later.
create function public.prevent_financial_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Historical financial facts are immutable'; end $$;
create trigger orders_immutable before update or delete on public.orders for each row execute function public.prevent_financial_mutation();
create trigger order_lines_immutable before update or delete on public.order_lines for each row execute function public.prevent_financial_mutation();

-- Explicit API grants keep the same behavior on projects with customized default privileges.
grant usage on schema public to authenticated;
grant select on public.organizations,public.profiles,public.organization_members,public.settings,public.customers,public.products,public.orders,public.order_lines,public.discount_approvals,public.audit_events to authenticated;
grant update on public.profiles,public.organization_members,public.settings,public.customers,public.products to authenticated;
grant insert,delete on public.organization_members,public.customers,public.products to authenticated;
