/**
 * Wolves — Financeiro
 * Script simples (sem módulos ES) para bater com o padrão do personal.html.
 *
 * Lê a "Planilha Geral Wolves 2026" via GViz, abas Extrato, Atletas,
 * Participação e ConciliacaoLog.
 * Usa Chart.js para o gráfico mensal (carregado via CDN abaixo se ainda não
 * estiver presente na página).
 *
 * CONFIRME:
 * 1. SHEET_ID — copiado da skill de conciliação que você já usa.
 * 2. Nomes exatos das abas (TAB_EXTRATO / TAB_ATLETAS / TAB_PARTICIPACAO / TAB_LOG).
 * 3. Planilha compartilhada como "qualquer pessoa com o link pode visualizar".
 */
(function () {
  const SHEET_ID = '1MIw1J9ZrGJJ1Fd5mM1jGV8mcF9wcP3YUtZhiGbJqvyY';
  const TAB_EXTRATO = 'Extrato';
  const TAB_ATLETAS = 'Atletas';
  const TAB_PARTICIPACAO = 'Participação';
  const TAB_LOG = 'ConciliacaoLog';

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
    const rowsF = data.table.rows.map((r) =>
      r.c.map((cell) => {
        if (!cell) return null;
        if (cell.f != null) return cell.f;
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

  // Cache simples pra não buscar Atletas/Participação de novo toda vez que o
  // usuário troca de jogador no seletor.
  let _atletasCache = null;
  let _participacaoCache = null;
  async function getAtletas() {
    if (!_atletasCache) _atletasCache = await fetchGvizSheet(TAB_ATLETAS);
    return _atletasCache;
  }
  async function getParticipacao() {
    if (!_participacaoCache) _participacaoCache = await fetchGvizSheet(TAB_PARTICIPACAO);
    return _participacaoCache;
  }

  function colIndex(cols, label) {
    const idx = cols.findIndex((c) => (c || '').toString().trim().toLowerCase() === label.toLowerCase());
    if (idx === -1) console.warn(`[wolves-financeiro] coluna "${label}" não encontrada em`, cols);
    return idx;
  }

  function parseValorBR(v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    let s = v.toString().trim();
    if (!s) return 0;
    if (s.includes(',')) {
      // Formato BR: "R$ 1.234,56" — ponto é milhar, vírgula é decimal
      s = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    } else {
      // Formato cru de export bancário: "15.00", "-18.12" — ponto já é decimal
      s = s.replace(/[^\d.-]/g, '');
    }
    return parseFloat(s) || 0;
  }

  function fmtBRL(v) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function parseDataHoraBR(v) {
    if (!v) return null;
    const s = v.toString().trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    const [, d, mo, y, hh, mm, ss] = m;
    const year = y.length === 2 ? '20' + y : y;
    const ms = new Date(
      parseInt(year, 10), parseInt(mo, 10) - 1, parseInt(d, 10),
      hh ? parseInt(hh, 10) : 0, mm ? parseInt(mm, 10) : 0, ss ? parseInt(ss, 10) : 0
    ).getTime();
    return { ms, dataStr: s };
  }

  function monthKeyFromBR(dataStr) {
    const m = (dataStr || '').toString().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return null;
    const [, , mo, y] = m;
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${mo.padStart(2, '0')}`;
  }

  const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  function monthLabel(key) {
    const [y, m] = key.split('-');
    return `${MESES_PT[parseInt(m, 10) - 1]}/${y.slice(2)}`;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  async function carregarResumoWolves() {
    const [extrato, atletas] = await Promise.all([
      fetchGvizSheet(TAB_EXTRATO),
      getAtletas(),
    ]);

    const idxSaldoExtrato = colIndex(extrato.cols, 'Saldo');
    const idxData = colIndex(extrato.cols, 'Data');
    const idxConciliado = colIndex(extrato.cols, 'Conciliado');
    const idxValor = colIndex(extrato.cols, 'Valor');

    let saldoAtual = 0;
    const naoConciliados = [];
    const monthly = {};

    extrato.rows.forEach((row, i) => {
      const dataTexto = extrato.rowsF[i][idxData];
      if (!dataTexto) return;

      const valor = parseValorBR(row[idxValor]);
      const saldo = row[idxSaldoExtrato] != null ? parseValorBR(row[idxSaldoExtrato]) : null;
      const conciliado = (row[idxConciliado] || '').toString().trim().toLowerCase() === 'sim';

      if (!conciliado) naoConciliados.push({ valor });
      if (saldo != null) saldoAtual = saldo;

      const key = monthKeyFromBR(dataTexto);
      if (key) {
        if (!monthly[key]) monthly[key] = { entradas: 0, saidas: 0, saldoFinal: null };
        if (valor > 0) monthly[key].entradas += valor;
        if (valor < 0) monthly[key].saidas += Math.abs(valor);
        if (saldo != null) monthly[key].saldoFinal = saldo;
      }
    });

    const entradasPendentes = naoConciliados.filter((i) => i.valor > 0);
    const saidasPendentes = naoConciliados.filter((i) => i.valor < 0);

    const monthlyArr = Object.keys(monthly).sort().map((key) => ({ key, label: monthLabel(key), ...monthly[key] }));

    const idxNome = colIndex(atletas.cols, 'Nome');
    const idxTipo = colIndex(atletas.cols, 'Tipo');
    const idxSaldoAtleta = colIndex(atletas.cols, 'Saldo');

    const inadimplentes = atletas.rows
      .filter((row) => row[idxNome] && parseValorBR(row[idxSaldoAtleta]) < 0)
      .map((row) => ({ nome: row[idxNome], tipo: row[idxTipo], saldo: parseValorBR(row[idxSaldoAtleta]) }))
      .sort((a, b) => a.saldo - b.saldo);

    const totalDevido = inadimplentes.reduce((sum, i) => sum + Math.abs(i.saldo), 0);

    const jogadoresList = atletas.rows
      .filter((row) => row[idxNome])
      .map((row) => ({ nome: row[idxNome], tipo: row[idxTipo] }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

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
      console.warn('[wolves-financeiro] não consegui ler a aba de log (TAB_LOG).', e);
    }

    return {
      saldoAtual, entradasPendentes, saidasPendentes, inadimplentes, totalDevido,
      monthlyArr, ultimaConciliacao, jogadoresList,
    };
  }

  function ensureChartJs() {
    return new Promise((resolve, reject) => {
      if (window.Chart) return resolve();
      const existing = document.querySelector('script[data-wolves-chartjs]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
      script.dataset.wolvesChartjs = 'true';
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  let chartInstance = null;
  async function renderMonthlyChart(monthlyArr) {
    const wrap = document.getElementById('wolves-chart-wrap');
    if (!wrap) return;

    if (!monthlyArr.length) {
      wrap.innerHTML = '<div class="ini-empty">Ainda sem movimentações suficientes para o gráfico mensal.</div>';
      return;
    }

    wrap.innerHTML = '<canvas id="wolves-monthly-canvas" height="90"></canvas>';

    try {
      await ensureChartJs();
    } catch (e) {
      wrap.innerHTML = '<div class="ini-empty">Não foi possível carregar a biblioteca do gráfico (Chart.js via CDN).</div>';
      return;
    }

    const ctx = document.getElementById('wolves-monthly-canvas').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue('--text2').trim() || '#9c93bd';
    const gridColor = 'rgba(255,255,255,.06)';

    function fmtAxisK(v) {
      const abs = Math.abs(v);
      if (abs >= 1000) {
        const k = abs / 1000;
        return 'R$ ' + (k % 1 === 0 ? k : k.toFixed(1)) + 'K';
      }
      return 'R$ ' + abs;
    }

    chartInstance = new Chart(ctx, {
      data: {
        labels: monthlyArr.map((m) => m.label),
        datasets: [
          {
            type: 'bar',
            label: 'Entradas',
            data: monthlyArr.map((m) => m.entradas),
            backgroundColor: '#4ade80',
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            type: 'bar',
            label: 'Saídas',
            data: monthlyArr.map((m) => -m.saidas), // negativo pra desenhar pra baixo (gráfico espelhado)
            backgroundColor: '#f87171',
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Saldo final do mês',
            data: monthlyArr.map((m) => m.saldoFinal),
            borderColor: '#a78bfa',
            backgroundColor: '#a78bfa',
            pointRadius: 4,
            pointBackgroundColor: '#a78bfa',
            tension: 0.3,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: textColor, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${fmtBRL(Math.abs(item.parsed.y))}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: textColor },
            grid: { color: gridColor },
          },
          y: {
            position: 'left',
            ticks: { color: textColor, callback: fmtAxisK },
            grid: { color: gridColor },
            title: { display: true, text: 'Entradas / Saídas', color: textColor },
          },
          y1: {
            position: 'right',
            ticks: { color: textColor, callback: fmtAxisK },
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Saldo final', color: textColor },
          },
        },
      },
    });
  }

  // ── Extrato do jogador ──
  async function renderPlayerExtrato(nome) {
    const resultEl = document.getElementById('wolves-player-result');
    if (!resultEl) return;
    if (!nome) {
      resultEl.innerHTML = '';
      return;
    }
    resultEl.innerHTML = '<div class="ini-empty">Carregando extrato…</div>';

    try {
      const [atletasSheet, participacaoSheet] = await Promise.all([getAtletas(), getParticipacao()]);

      const idxNome = colIndex(atletasSheet.cols, 'Nome');
      const idxTipo = colIndex(atletasSheet.cols, 'Tipo');
      const idxGolsA = colIndex(atletasSheet.cols, 'Gols');
      const idxAssistA = colIndex(atletasSheet.cols, 'Assistencias');

      const nomeAlvo = nome.trim().toLowerCase();
      const atletaRow = atletasSheet.rows.find(
        (row) => (row[idxNome] || '').toString().trim().toLowerCase() === nomeAlvo
      );
      if (!atletaRow) {
        resultEl.innerHTML = '<div class="ini-empty">Jogador não encontrado na aba Atletas.</div>';
        return;
      }

      const idxDataJogo = colIndex(participacaoSheet.cols, 'Data_Jogo');
      const idxAtletaP = colIndex(participacaoSheet.cols, 'Atleta');
      const idxPresente = colIndex(participacaoSheet.cols, 'Presente?');
      const idxGolsP = colIndex(participacaoSheet.cols, 'Gols');
      const idxAssistP = colIndex(participacaoSheet.cols, 'Assistencias');
      const idxValorDevidoP = colIndex(participacaoSheet.cols, 'Valor_Devido');
      const idxValorPagoP = colIndex(participacaoSheet.cols, 'Valor_Pago');
      const idxDataPagamento = colIndex(participacaoSheet.cols, 'Data_Pagamento');

      const jogos = [];
      participacaoSheet.rows.forEach((row, i) => {
        const atletaNome = (row[idxAtletaP] || '').toString().trim().toLowerCase();
        if (atletaNome !== nomeAlvo) return;
        jogos.push({
          dataJogo: participacaoSheet.rowsF[i][idxDataJogo],
          presente: (row[idxPresente] || '').toString().trim().toLowerCase() === 'sim',
          gols: row[idxGolsP] || 0,
          assistencias: row[idxAssistP] || 0,
          valorDevido: parseValorBR(row[idxValorDevidoP]),
          valorPago: parseValorBR(row[idxValorPagoP]),
          dataPagamento: participacaoSheet.rowsF[i][idxDataPagamento] || '',
        });
      });

      jogos.sort((a, b) => {
        const da = parseDataHoraBR(a.dataJogo);
        const db = parseDataHoraBR(b.dataJogo);
        return (da ? da.ms : 0) - (db ? db.ms : 0);
      });

      const totalDevido = jogos.reduce((s, j) => s + j.valorDevido, 0);
      const totalPago = jogos.reduce((s, j) => s + j.valorPago, 0);
      const saldo = totalPago - totalDevido;
      const jogosPresente = jogos.filter((j) => j.presente).length;

      const tipo = atletaRow[idxTipo] || '';
      const golsTotais = atletaRow[idxGolsA] || 0;
      const assistTotais = atletaRow[idxAssistA] || 0;

      const linhasHtml = jogos
        .map(
          (j) => `
        <tr>
          <td style="padding:6px 8px; color:var(--text2); font-size:12.5px; white-space:nowrap;">${esc(j.dataJogo || '—')}</td>
          <td style="padding:6px 8px; text-align:center;">${j.presente ? '✅' : '—'}</td>
          <td style="padding:6px 8px; text-align:center;">${j.gols || 0}</td>
          <td style="padding:6px 8px; text-align:center;">${j.assistencias || 0}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap;">${fmtBRL(j.valorDevido)}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap; color:${j.valorPago >= j.valorDevido ? '#4ade80' : '#f87171'};">${fmtBRL(j.valorPago)}</td>
          <td style="padding:6px 8px; color:var(--text2); font-size:12.5px; white-space:nowrap;">${esc(j.dataPagamento || '—')}</td>
        </tr>`
        )
        .join('');

      resultEl.innerHTML = `
        <div class="rp-cards" style="margin-bottom:18px;">
          <div class="rp-card">
            <div class="rp-label">Jogos (presente)</div>
            <div class="rp-value">${jogosPresente} / ${jogos.length}</div>
          </div>
          <div class="rp-card">
            <div class="rp-label">Gols · Assistências</div>
            <div class="rp-value">${golsTotais} · ${assistTotais}</div>
          </div>
          <div class="rp-card">
            <div class="rp-label">Total devido</div>
            <div class="rp-value neg">${fmtBRL(totalDevido)}</div>
          </div>
          <div class="rp-card">
            <div class="rp-label">Saldo</div>
            <div class="rp-value ${saldo >= 0 ? 'pos' : 'neg'}">${fmtBRL(saldo)}</div>
          </div>
        </div>

        ${
          saldo < 0
            ? `<p class="section-intro" style="margin-bottom:14px;">💬 <strong style="color:var(--text);">${esc(nome)}</strong>${tipo ? ' (' + esc(tipo) + ')' : ''} está devendo <strong style="color:#f87171;">${fmtBRL(Math.abs(saldo))}</strong> no total.</p>`
            : `<p class="section-intro" style="margin-bottom:14px;">✅ <strong style="color:var(--text);">${esc(nome)}</strong> está em dia.</p>`
        }

        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:13.5px;">
            <thead>
              <tr style="border-bottom:1px solid var(--border); color:var(--text2); font-size:11px; text-transform:uppercase; letter-spacing:.5px;">
                <th style="padding:6px 8px; text-align:left;">Jogo</th>
                <th style="padding:6px 8px;">Presente</th>
                <th style="padding:6px 8px;">Gols</th>
                <th style="padding:6px 8px;">Assist.</th>
                <th style="padding:6px 8px; text-align:right;">Devido</th>
                <th style="padding:6px 8px; text-align:right;">Pago</th>
                <th style="padding:6px 8px; text-align:left;">Pago em</th>
              </tr>
            </thead>
            <tbody>${linhasHtml || '<tr><td colspan="7" style="padding:10px; color:var(--text2);">Nenhuma participação registrada.</td></tr>'}</tbody>
          </table>
        </div>
      `;
    } catch (err) {
      console.error('[wolves-financeiro] erro ao montar extrato do jogador', err);
      resultEl.innerHTML = '<div class="ini-empty">Não foi possível montar o extrato desse jogador.</div>';
    }
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

      const jogadoresOptions = resumo.jogadoresList
        .map((j) => `<option value="${esc(j.nome)}">${esc(j.nome)}${j.tipo ? ' · ' + esc(j.tipo) : ''}</option>`)
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
          <span class="hint">entradas e saídas em barra, saldo final em linha</span>
        </div>
        <div class="rp-chart-wrap" id="wolves-chart-wrap"></div>

        <div class="area-summary-head" style="margin-top:32px;">
          <h3>Extrato do jogador</h3>
          <span class="hint">participações, gols, assistências e financeiro por atleta</span>
        </div>
        <div class="ini-card">
          <select id="wolves-player-select" style="width:100%; max-width:320px; font-family:var(--body); font-size:14px; background:var(--bg2); color:var(--text); border:1px solid var(--border); border-radius:9px; padding:9px 12px; color-scheme:dark;">
            <option value="">Selecione um jogador…</option>
            ${jogadoresOptions}
          </select>
          <div id="wolves-player-result" style="margin-top:16px;"></div>
        </div>

        <div class="ini-card" style="margin-top:24px;">
          <div class="ini-card-head"><h3>Maiores devedores</h3></div>
          ${inadHtml || '<div class="ini-empty">Ninguém devendo 🎉</div>'}
        </div>
      `;

      const selectEl = document.getElementById('wolves-player-select');
      if (selectEl) {
        selectEl.addEventListener('change', (ev) => renderPlayerExtrato(ev.target.value));
      }

      await renderMonthlyChart(resumo.monthlyArr);
    } catch (err) {
      console.error('[wolves-financeiro] erro ao carregar', err);
      containerEl.innerHTML =
        '<div class="ini-empty">Não foi possível carregar os dados do Wolves. Verifique se a planilha está compartilhada publicamente e se os nomes das abas (Extrato/Atletas/Participação/ConciliacaoLog) conferem.</div>';
    }
  };
})();
