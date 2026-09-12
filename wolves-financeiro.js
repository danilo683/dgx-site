/**
 * Wolves — Financeiro
 * Script simples (sem módulos ES) para bater com o padrão do personal.html,
 * que usa um único <script> inline, sem type="module".
 *
 * Lê a "Planilha Geral Wolves 2026" via GViz, abas Extrato e Atletas.
 *
 * CONFIRME:
 * 1. SHEET_ID — copiado da skill de conciliação que você já usa.
 * 2. Nomes exatos das abas (TAB_EXTRATO / TAB_ATLETAS) batem com o Sheets real.
 * 3. Planilha compartilhada como "qualquer pessoa com o link pode visualizar".
 *
 * Expõe window.renderWolvesFinanceiro(containerEl), chamada pelo showPage()
 * do personal.html quando a página #wolves é aberta — mesmo padrão de
 * renderInicio(), renderInvestments() etc.
 */
(function () {
  const SHEET_ID = '1MIw1J9ZrGJJ1Fd5mM1jGV8mcF9wcP3YUtZhiGbJqvyY';
  const TAB_EXTRATO = 'Extrato';
  const TAB_ATLETAS = 'Atletas';

  function gvizUrl(sheetName) {
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  }

  async function fetchGvizSheet(sheetName) {
    const res = await fetch(gvizUrl(sheetName));
    const text = await res.text();
    const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonStr);
    const cols = data.table.cols.map((c) => c.label || c.id);
    const rows = data.table.rows.map((r) => r.c.map((cell) => (cell ? cell.v : null)));
    return { cols, rows };
  }

  function colIndex(cols, label) {
    const idx = cols.findIndex((c) => (c || '').toString().trim().toLowerCase() === label.toLowerCase());
    if (idx === -1) console.warn(`[wolves-financeiro] coluna "${label}" não encontrada em`, cols);
    return idx;
  }

  function parseValorBR(v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    return parseFloat(v.toString().replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
  }

  function fmtBRL(v) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  async function carregarResumoWolves() {
    const [extrato, atletas] = await Promise.all([
      fetchGvizSheet(TAB_EXTRATO),
      fetchGvizSheet(TAB_ATLETAS),
    ]);

    const idxSaldoExtrato = colIndex(extrato.cols, 'Saldo');
    const idxData = colIndex(extrato.cols, 'Data');
    let saldoAtual = 0;
    for (let i = extrato.rows.length - 1; i >= 0; i--) {
      const row = extrato.rows[i];
      if (row[idxData] && row[idxSaldoExtrato] != null) {
        saldoAtual = parseValorBR(row[idxSaldoExtrato]);
        break;
      }
    }

    const idxConciliado = colIndex(extrato.cols, 'Conciliado');
    const idxValor = colIndex(extrato.cols, 'Valor');
    const naoConciliados = extrato.rows
      .filter((row) => row[idxData] && (row[idxConciliado] || '').toString().trim().toLowerCase() !== 'sim')
      .map((row) => ({ valor: parseValorBR(row[idxValor]) }));

    const entradasPendentes = naoConciliados.filter((i) => i.valor > 0);
    const saidasPendentes = naoConciliados.filter((i) => i.valor < 0);

    const idxNome = colIndex(atletas.cols, 'Nome');
    const idxTipo = colIndex(atletas.cols, 'Tipo');
    const idxSaldoAtleta = colIndex(atletas.cols, 'Saldo');

    const inadimplentes = atletas.rows
      .filter((row) => row[idxNome] && parseValorBR(row[idxSaldoAtleta]) < 0)
      .map((row) => ({ nome: row[idxNome], tipo: row[idxTipo], saldo: parseValorBR(row[idxSaldoAtleta]) }))
      .sort((a, b) => a.saldo - b.saldo);

    const totalDevido = inadimplentes.reduce((sum, i) => sum + Math.abs(i.saldo), 0);

    return { saldoAtual, entradasPendentes, saidasPendentes, inadimplentes, totalDevido };
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  window.renderWolvesFinanceiro = async function (containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = '<div class="ini-empty">Carregando dados financeiros do Wolves…</div>';
    try {
      const resumo = await carregarResumoWolves();

      const inadHtml = resumo.inadimplentes
        .slice(0, 10)
        .map(
          (i) => `
        <div class="ini-item">
          <span class="ini-dot" style="--c:#ef4444"></span>
          <span class="ini-name">${esc(i.nome)}${i.tipo ? ' · ' + esc(i.tipo) : ''}</span>
          <span class="ini-when overdue">${fmtBRL(i.saldo)}</span>
        </div>`
        )
        .join('');

      containerEl.innerHTML = `
        <div class="rp-cards">
          <div class="rp-card">
            <div class="rp-label">Saldo em caixa</div>
            <div class="rp-value ${resumo.saldoAtual >= 0 ? 'pos' : 'neg'}">${fmtBRL(resumo.saldoAtual)}</div>
          </div>
          <div class="rp-card">
            <div class="rp-label">Inadimplentes</div>
            <div class="rp-value">${resumo.inadimplentes.length}</div>
          </div>
          <div class="rp-card">
            <div class="rp-label">Total em aberto</div>
            <div class="rp-value neg">${fmtBRL(resumo.totalDevido)}</div>
          </div>
          <div class="rp-card">
            <div class="rp-label">Não conciliados</div>
            <div class="rp-value">${resumo.entradasPendentes.length + resumo.saidasPendentes.length}</div>
          </div>
        </div>

        <div class="ini-card" style="margin-top:18px;">
          <div class="ini-card-head"><h3>Maiores devedores</h3></div>
          ${inadHtml || '<div class="ini-empty">Ninguém devendo 🎉</div>'}
        </div>
      `;
    } catch (err) {
      console.error('[wolves-financeiro] erro ao carregar', err);
      containerEl.innerHTML =
        '<div class="ini-empty">Não foi possível carregar os dados do Wolves. Verifique se a planilha está compartilhada publicamente e se os nomes das abas (Extrato/Atletas) conferem.</div>';
    }
  };
})();
