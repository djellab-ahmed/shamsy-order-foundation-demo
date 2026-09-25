-- Hold product and approval rows stable while validating and inserting every financial fact.
create or replace function public.create_shamsy_order(
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
    select price_usd_cents into v_price from public.products where organization_id = p_org and id = v_product and active for share;
    if v_line_key is null or v_price is null or v_qty is null or v_qty not between 1 and 9999 or v_discount is null or v_discount < 0 then raise exception 'Invalid order line'; end if;
    v_line_subtotal := v_price * v_qty;
    if v_discount > v_line_subtotal then raise exception 'Discount exceeds line value'; end if;
    if v_discount * 100 > v_line_subtotal * 5 then
      select * into v_approval from public.discount_approvals where organization_id = p_org and order_idempotency_key = p_order_key and line_key = v_line_key
        and product_id = v_product and quantity = v_qty and unit_price_usd_cents = v_price and discount_usd_cents = v_discount for share;
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
