/**
 * Wolves — Financeiro
 * Script simples (sem módulos ES) para bater com o padrão do personal.html,
 * que usa um único <script> inline, sem type="module".
 *
 * Lê a "Planilha Geral Wolves 2026" via GViz, abas Extrato, Atletas e Log.
 *
 * CONFIRME:
 * 1. SHEET_ID — copiado da skill de conciliação que você já usa.
 * 2. Nomes exatos das abas (TAB_EXTRATO / TAB_ATLETAS / TAB_LOG) batem com o
 *    Sheets real. TAB_LOG é uma suposição ("Log") — ajuste se o nome real
 *    da aba com o histórico de execuções da conciliação for outro. Se essa
 *    aba não existir/tiver outro nome, o card carrega normal e só omite a
 *    linha "Última conciliação" (loga um aviso no console).
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
  const TAB_LOG = 'Log'; // <- confirme o nome real dessa aba

  function gvizUrl(sheetName) {
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  }

  /**
   * Retorna { cols, rows, rowsF }.
   * - rows: valores "crus" (v) — números como number, texto como string.
   * - rowsF: valores FORMATADOS (f) exatamente como aparecem na planilha —
   *   essencial para datas, que o GViz devolve em v como "Date(2026,0,5)"
   *   (mês 0-indexado) em vez de texto. Sempre usar rowsF para datas.
   */
  async function fetchGvizSheet(sheetName) {
    const res = await fetch(gvizUrl(sheetName));
    const text = await res.text();
    const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonStr);
    const cols = data.table.cols.map((c) => c.label || c.id);
    const rows = data.table.rows.map((r) => r.c.map((cell) => (cell ? cell.v : null)));
    const rowsF = data.table.rows.map((r) =>
      r.c.map((cell) => {
        if (!cell) return null;
        if (cell.f != null) return cell.f;
        // fallback: se vier como "Date(Y,M,D)" cru, converte pra DD/MM/AAAA
        if (typeof cell.v === 'string' && cell.v.startsWith('Date(')) {
          const m = cell.v.match(/Date\((\d+),(\d+),(\d+)/);
          if (m) {
            const [, y, mo, d] = m;
            return `${String(d).padStart(2, '0')}/${String(parseInt(mo, 10) + 1).padStart(2, '0')}/${y}`;
          }
        }
        return cell.v;
      })
    );
    return { cols, rows, rowsF };
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

  // Aceita "DD/MM/AAAA" ou "DD/MM/AAAA HH:mm:ss" (texto formatado) e devolve {ms, dataStr}
  function parseDataHoraBR(v) {
    if (!v) return null;
    const s = v.toString().trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    const [, d, mo, y, hh, mm, ss] = m;
    const year = y.length === 2 ? '20' + y : y;
    const ms = new Date(
      parseInt(year, 10),
      parseInt(mo, 10) - 1,
      parseInt(d, 10),
      hh ? parseInt(hh, 10) : 0,
      mm ? parseInt(mm, 10) : 0,
      ss ? parseInt(ss, 10) : 0
    ).getTime();
    return { ms, dataStr: s };
  }

  function monthKeyFromBR(dataStr) {
    const m = (dataStr || '').toString().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return null;
    const [, d, mo, y] = m;
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${mo.padStart(2, '0')}`;
  }

  const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  function monthLabel(key) {
    const [y, m] = key.split('-');
    return `${MESES_PT[parseInt(m, 10) - 1]}/${y.slice(2)}`;
  }

  async function carregarResumoWolves() {
    const [extrato, atletas] = await Promise.all([
      fetchGvizSheet(TAB_EXTRATO),
      fetchGvizSheet(TAB_ATLETAS),
    ]);

    const idxSaldoExtrato = colIndex(extrato.cols, 'Saldo');
    const idxData = colIndex(extrato.cols, 'Data');
    const idxConciliado = colIndex(extrato.cols, 'Conciliado');
    const idxValor = colIndex(extrato.cols, 'Valor');

    let saldoAtual = 0;
    const naoConciliados = [];
    const monthly = {}; // { 'YYYY-MM': { entradas, saidas, saldoFinal } }

    extrato.rows.forEach((row, i) => {
      const dataTexto = extrato.rowsF[i][idxData]; // sempre usar a versão formatada pra datas
      if (!dataTexto) return;

      const valor = parseValorBR(row[idxValor]);
      const saldo = row[idxSaldoExtrato] != null ? parseValorBR(row[idxSaldoExtrato]) : null;
      const conciliado = (row[idxConciliado] || '').toString().trim().toLowerCase() === 'sim';

      if (!conciliado) naoConciliados.push({ valor });
      if (saldo != null) saldoAtual = saldo; // última linha com saldo = saldo mais recente

      const key = monthKeyFromBR(dataTexto);
      if (key) {
        if (!monthly[key]) monthly[key] = { entradas: 0, saidas: 0, saldoFinal: null };
        if (valor > 0) monthly[key].entradas += valor;
        if (valor < 0) monthly[key].saidas += Math.abs(valor);
        if (saldo != null) monthly[key].saldoFinal = saldo; // vai sobrescrevendo, última do mês fica
      }
    });

    const entradasPendentes = naoConciliados.filter((i) => i.valor > 0);
    const saidasPendentes = naoConciliados.filter((i) => i.valor < 0);

    const monthlyArr = Object.keys(monthly)
      .sort()
      .map((key) => ({ key, label: monthLabel(key), ...monthly[key] }));

    const idxNome = colIndex(atletas.cols, 'Nome');
    const idxTipo = colIndex(atletas.cols, 'Tipo');
    const idxSaldoAtleta = colIndex(atletas.cols, 'Saldo');

    const inadimplentes = atletas.rows
      .filter((row) => row[idxNome] && parseValorBR(row[idxSaldoAtleta]) < 0)
      .map((row) => ({ nome: row[idxNome], tipo: row[idxTipo], saldo: parseValorBR(row[idxSaldoAtleta]) }))
      .sort((a, b) => a.saldo - b.saldo);

    const totalDevido = inadimplentes.reduce((sum, i) => sum + Math.abs(i.saldo), 0);

    // Última conciliação — aba de log separada; se não existir/der erro, apenas fica sem essa info
    let ultimaConciliacao = null;
    try {
      const log = await fetchGvizSheet(TAB_LOG);
      const idxLogData = colIndex(log.cols, 'Data');
      let best = null;
      log.rowsF.forEach((rowF) => {
        const parsed = parseDataHoraBR(rowF[idxLogData]);
        if (parsed && (!best || parsed.ms > best.ms)) best = parsed;
      });
      ultimaConciliacao = best ? best.dataStr : null;
    } catch (e) {
      console.warn('[wolves-financeiro] não consegui ler a aba de log (TAB_LOG). Ajuste o nome se necessário.', e);
    }

    return {
      saldoAtual,
      entradasPendentes,
      saidasPendentes,
      inadimplentes,
      totalDevido,
      monthlyArr,
      ultimaConciliacao,
    };
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function renderMonthlyChart(monthlyArr) {
    if (!monthlyArr.length) return '<div class="ini-empty">Ainda sem movimentações suficientes para o gráfico mensal.</div>';

    const maxVal = Math.max(...monthlyArr.map((m) => Math.max(m.entradas, m.saidas)), 1);

    const cols = monthlyArr
      .map((m) => {
        const hE = Math.max(2, Math.round((m.entradas / maxVal) * 150));
        const hS = Math.max(2, Math.round((m.saidas / maxVal) * 150));
        const saldoTxt = m.saldoFinal != null ? fmtBRL(m.saldoFinal) : '—';
        return `
        <div class="rp-bar-col">
          <span class="rp-bar-val" style="white-space:normal; text-align:center; line-height:1.2;">${saldoTxt}</span>
          <div style="display:flex; align-items:flex-end; gap:3px; height:150px;">
            <div class="rp-bar" style="height:${hE}px; max-width:16px; background:#4ade80;" title="Entradas ${m.label}: ${fmtBRL(m.entradas)}"></div>
            <div class="rp-bar" style="height:${hS}px; max-width:16px; background:#f87171;" title="Saídas ${m.label}: ${fmtBRL(m.saidas)}"></div>
          </div>
          <span class="rp-bar-label">${m.label}</span>
        </div>`;
      })
      .join('');

    return `
      <div class="rp-chart-wrap">
        <div style="display:flex; gap:14px; margin-bottom:10px; font-size:12px; color:var(--text2);">
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#4ade80;margin-right:5px;"></span>Entradas</span>
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#f87171;margin-right:5px;"></span>Saídas</span>
          <span style="margin-left:auto;">Número acima da coluna = saldo final do mês</span>
        </div>
        <div class="rp-chart">${cols}</div>
      </div>`;
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
        ${resumo.ultimaConciliacao ? `<p class="section-intro" style="margin-bottom:16px;">🕐 Última conciliação rodada em <strong style="color:var(--text);">${esc(resumo.ultimaConciliacao)}</strong></p>` : ''}

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

        <div class="area-summary-head" style="margin-top:32px;">
          <h3>Evolução mensal</h3>
          <span class="hint">entradas x saídas por mês, com saldo final indicado</span>
        </div>
        ${renderMonthlyChart(resumo.monthlyArr)}

        <div class="ini-card" style="margin-top:24px;">
          <div class="ini-card-head"><h3>Maiores devedores</h3></div>
          ${inadHtml || '<div class="ini-empty">Ninguém devendo 🎉</div>'}
        </div>
      `;
    } catch (err) {
      console.error('[wolves-financeiro] erro ao carregar', err);
      containerEl.innerHTML =
        '<div class="ini-empty">Não foi possível carregar os dados do Wolves. Verifique se a planilha está compartilhada publicamente e se os nomes das abas (Extrato/Atletas/Log) conferem.</div>';
    }
  };
})();
