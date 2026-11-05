-- Projeção de DFC (3 anos) — Hawks (MT, MG, RJ, ES) + visão consolidada.
-- Uma linha por filial × cenário × mês. cliente_id segue a convenção do dash: 'hawks_' + chave da filial.
-- Meses com realizado = true são o histórico; realizado = false é a projeção.

-- ───────────────────────────── proj_dfc ─────────────────────────────
create table if not exists public.proj_dfc (
  id bigint generated always as identity primary key,
  cliente_id text not null,                       -- hawks_mt | hawks_mg | hawks_rj | hawks_es
  cenario text not null check (cenario in ('base','conservador','otimista','livre')),
  competencia date not null,                      -- sempre o dia 1 do mês
  realizado boolean not null default false,
  caixa_pre numeric(16,2),                        -- opcional (caixa antes de aporte/antecipação)
  versao text,                                    -- rótulo da carga (ex.: 'Out/26')
  -- vendas e compras (base de competência)
  vendas numeric(16,2) not null default 0,
  compras numeric(16,2) not null default 0,
  -- fluxo operacional
  ent_clientes numeric(16,2) not null default 0,
  juros_multas numeric(16,2) not null default 0,
  pgto_truss numeric(16,2) not null default 0,
  pgto_nao_truss numeric(16,2) not null default 0,
  pgto_pessoal numeric(16,2) not null default 0,
  pgto_prolabore numeric(16,2) not null default 0,
  pgto_mkt numeric(16,2) not null default 0,
  pgto_comissoes numeric(16,2) not null default 0,
  pgto_logistica numeric(16,2) not null default 0,
  pgto_ocupacao numeric(16,2) not null default 0,
  pgto_gerais numeric(16,2) not null default 0,
  pgto_terceiros numeric(16,2) not null default 0,
  pgto_impostos numeric(16,2) not null default 0,
  caixa_operacional numeric(16,2) not null default 0,
  -- investimento e financiamento
  sai_invest numeric(16,2) not null default 0,
  pgto_financ numeric(16,2) not null default 0,
  antecipacao numeric(16,2) not null default 0,
  encargos_antec numeric(16,2) not null default 0,
  aporte numeric(16,2) not null default 0,
  outros_financ numeric(16,2) not null default 0,
  -- saldos
  caixa_inicial numeric(16,2) not null default 0,
  caixa_final numeric(16,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proj_dfc_uk unique (cliente_id, cenario, competencia),
  constraint proj_dfc_mes_ck check (competencia = date_trunc('month', competencia)::date)
);
create index if not exists proj_dfc_cliente_idx on public.proj_dfc (cliente_id, cenario, competencia);

-- ─────────────────────────── proj_premissas ───────────────────────────
create table if not exists public.proj_premissas (
  id bigint generated always as identity primary key,
  cliente_id text not null,
  cenario text not null check (cenario in ('base','conservador','otimista','livre')),
  grupo text not null,                            -- ex.: 'Vendas', 'Recebimentos', 'Financiamento e caixa mínimo'
  chave text not null,                            -- ex.: 'g', 'inad', 'rz', 'cxm' (cxm = caixa mínimo)
  rotulo text not null,
  valor_num numeric(18,6),
  valor_txt text,
  formato text,                                   -- 'pct' | 'pct2' | 'brl' | vazio (texto)
  fonte text,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proj_premissas_uk unique (cliente_id, cenario, chave)
);
create index if not exists proj_premissas_cliente_idx on public.proj_premissas (cliente_id, cenario, ordem);

-- ───────────────────────────── acesso (RLS) ─────────────────────────────
-- Mesma regra das demais tabelas do dash (leitura e escrita para usuários logados).
alter table public.proj_dfc enable row level security;
drop policy if exists proj_dfc_acesso on public.proj_dfc;
create policy proj_dfc_acesso on public.proj_dfc for all to authenticated using (true) with check (true);

alter table public.proj_premissas enable row level security;
drop policy if exists proj_premissas_acesso on public.proj_premissas;
create policy proj_premissas_acesso on public.proj_premissas for all to authenticated using (true) with check (true);

-- ───────────────────── consolidado das filiais (somente leitura) ─────────────────────
-- Soma as filiais por cenário e mês, com o mesmo formato de proj_dfc (cliente_id = 'hawks_consolidado'),
-- então a tela consulta a view com a mesma query, trocando só o nome e o cliente_id.
-- realizado só é true quando TODAS as filiais do mês estão realizadas. n_filiais mostra quantas entraram na soma.
create or replace view public.proj_dfc_consolidado
with (security_invoker = true) as
select
  'hawks_consolidado'::text as cliente_id,
  cenario,
  competencia,
  bool_and(realizado) as realizado,
  sum(caixa_pre) as caixa_pre,
  max(versao) as versao,
  sum(vendas) as vendas,
  sum(compras) as compras,
  sum(ent_clientes) as ent_clientes,
  sum(juros_multas) as juros_multas,
  sum(pgto_truss) as pgto_truss,
  sum(pgto_nao_truss) as pgto_nao_truss,
  sum(pgto_pessoal) as pgto_pessoal,
  sum(pgto_prolabore) as pgto_prolabore,
  sum(pgto_mkt) as pgto_mkt,
  sum(pgto_comissoes) as pgto_comissoes,
  sum(pgto_logistica) as pgto_logistica,
  sum(pgto_ocupacao) as pgto_ocupacao,
  sum(pgto_gerais) as pgto_gerais,
  sum(pgto_terceiros) as pgto_terceiros,
  sum(pgto_impostos) as pgto_impostos,
  sum(caixa_operacional) as caixa_operacional,
  sum(sai_invest) as sai_invest,
  sum(pgto_financ) as pgto_financ,
  sum(antecipacao) as antecipacao,
  sum(encargos_antec) as encargos_antec,
  sum(aporte) as aporte,
  sum(outros_financ) as outros_financ,
  sum(caixa_inicial) as caixa_inicial,
  sum(caixa_final) as caixa_final,
  count(*)::int as n_filiais
from public.proj_dfc
where cliente_id in ('hawks_mt','hawks_mg','hawks_rj','hawks_es')
group by cenario, competencia;

grant select on public.proj_dfc_consolidado to authenticated;

-- Atualiza o cache do PostgREST para as tabelas aparecerem na API imediatamente.
notify pgrst, 'reload schema';
