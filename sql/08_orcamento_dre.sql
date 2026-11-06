-- DRE Orçado (Hawks): uma linha por filial × ano × mês × conta.
-- codigo: RB, DESC, TROC, IMP, CMV, PC (linhas do topo) ou o código do Plano de Contas DRE 2026 (7.1, 12.2.1, 13, 14.3.5...).
-- Valores com o mesmo sinal do DRE realizado (despesas negativas). Subtotais não são gravados: são calculados na tela.
create table if not exists public.orcamento_dre (
  id bigint generated always as identity primary key,
  cliente_id text not null,                 -- hawks_mt | hawks_mg | hawks_rj | hawks_es
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  codigo text not null,
  valor numeric(16,2) not null default 0,
  cenario text,                             -- cenário usado ao gerar (informativo)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orcamento_dre_uk unique (cliente_id, ano, mes, codigo)
);
create index if not exists orcamento_dre_idx on public.orcamento_dre (cliente_id, ano, mes);
alter table public.orcamento_dre enable row level security;
drop policy if exists orcamento_dre_acesso on public.orcamento_dre;
create policy orcamento_dre_acesso on public.orcamento_dre for all to authenticated using (true) with check (true);
notify pgrst, 'reload schema';
