-- Vendas parciais do mês corrente (demanda corrente da Sugestão de Pedido).
-- Uma linha por filial × mês × SKU, já líquida de devolução. Não alimenta Vendas, Margem nem DRE.
-- Reimportar o mesmo mês substitui as linhas. Quando o mês entra na fato_vendas, o portal ignora este.
create table if not exists public.ped_vendas_parcial (
  id bigint generated always as identity primary key,
  cliente_id text not null,                 -- hawks_mt | hawks_mg | hawks_rj | hawks_es
  mes text not null,                        -- 'AAAA-MM'
  sku text not null,
  produto text,
  grupo text,
  qtd numeric(14,3) not null default 0,     -- vendas − devoluções de venda, em unidades
  data_corte date,                          -- maior data de venda do arquivo
  arquivo text,
  created_at timestamptz not null default now(),
  constraint ped_vendas_parcial_uk unique (cliente_id, mes, sku)
);
create index if not exists ped_vendas_parcial_idx on public.ped_vendas_parcial (cliente_id, mes);
alter table public.ped_vendas_parcial enable row level security;
drop policy if exists ped_vendas_parcial_acesso on public.ped_vendas_parcial;
create policy ped_vendas_parcial_acesso on public.ped_vendas_parcial for all to authenticated using (true) with check (true);
notify pgrst, 'reload schema';
