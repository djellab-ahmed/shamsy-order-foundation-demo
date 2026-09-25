-- A catalogue price edit invalidates pending approvals even if the price is later restored.
-- Saved order lines retain their price and approval snapshots independently.
create function public.invalidate_approvals_on_price_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.discount_approvals
  where organization_id = old.organization_id and product_id = old.id;
  get diagnostics v_count = row_count;
  insert into public.audit_events (organization_id, actor_id, event_type, details)
  values (old.organization_id, auth.uid(), 'product_price_changed',
    jsonb_build_object('product_id', old.id, 'old_price_usd_cents', old.price_usd_cents,
      'new_price_usd_cents', new.price_usd_cents, 'invalidated_approvals', v_count));
  return new;
end $$;
create trigger product_price_invalidates_approvals
after update of price_usd_cents on public.products
for each row when (old.price_usd_cents is distinct from new.price_usd_cents)
execute function public.invalidate_approvals_on_price_change();
