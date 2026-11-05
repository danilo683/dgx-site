-- Endividamento bancário (Fnyx e DGX Beauty). Uma linha por contrato; cliente_id separa os clientes.
create table if not exists public.endividamento (
  id bigint generated always as identity primary key,
  cliente_id text not null,
  contrato text,
  instituicao text,
  tipo text,
  data_contratacao date,
  valor_contratado numeric(14,2),
  total_parcelas integer,
  valor_parcela numeric(14,2),
  carencia_meses integer,
  parcelas_pagas integer,
  taxa_am numeric(7,4),
  saldo_devedor numeric(14,2),
  garantias text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists endividamento_cliente_idx on public.endividamento (cliente_id, data_contratacao, id);
alter table public.endividamento enable row level security;
-- Mesma regra de acesso das demais tabelas do dash (leitura e escrita para usuários logados).
drop policy if exists endividamento_acesso on public.endividamento;
create policy endividamento_acesso on public.endividamento for all to authenticated using (true) with check (true);
