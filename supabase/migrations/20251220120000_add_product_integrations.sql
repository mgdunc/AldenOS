create table if not exists public.product_integrations (
    id uuid not null default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete cascade,
    integration_id uuid not null references public.integrations(id) on delete cascade,
    external_product_id text,
    external_variant_id text,
    external_inventory_item_id text,
    last_synced_at timestamptz default now(),
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    primary key (id),
    unique (product_id, integration_id)
);

alter table public.product_integrations enable row level security;
create policy "Enable all access for authenticated users" on public.product_integrations for all using (true);
