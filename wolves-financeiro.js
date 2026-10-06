/**
 * Wolves — Financeiro (v2)
 * Script simples (sem módulos ES) para bater com o padrão do personal.html.
 *
 * Lê a "Planilha Geral Wolves 2026" via GViz, abas Extrato, Atletas,
 * Participação, Calendário e ConciliacaoLog.
 *
 * Abas (menu horizontal): Resumo · Campeonato · Orçamento 2026 · Projeção 2027
 * · Reservas · Aproveitamento.
 *
 * Orçamento, Projeção 2027 e Reservas são digitados no site e ficam salvos no
 * navegador (localStorage, chave "dgx-wolves-v1").
 *
 * CAMPEONATO: a inadimplência do campeonato é separada da inadimplência da
 * pelada. Para isso o site procura na aba Participação uma coluna chamada
 * "Campeonato" (marque "Sim" nas linhas dos jogos de campeonato). Enquanto
 * essa coluna não existir/estiver vazia, usa as datas de CAMPEONATO_DATAS_FALLBACK.
 */
(function () {
  const SHEET_ID = '1MIw1J9ZrGJJ1Fd5mM1jGV8mcF9wcP3YUtZhiGbJqvyY';
  const TAB_EXTRATO = 'Extrato';
  const TAB_ATLETAS = 'Atletas';
  const TAB_PARTICIPACAO = 'Participação';
  const TAB_CALENDARIO = 'Calendário';
  const TAB_LOG = 'ConciliacaoLog';

  // Usado só enquanto a coluna "Campeonato" não existe na aba Participação:
  // os 2 últimos jogos (cobrança do campeonato).
  const CAMPEONATO_DATAS_FALLBACK = ['20/09/2026', '27/09/2026'];

  const COR_PELADA = '#f87171';
  const COR_CAMP = '#fbbf24';
  const COR_VERDE = '#4ade80';
  const COR_ROXO = '#a78bfa';

  const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  // ───────────────────────── helpers de dados ─────────────────────────
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

  function norm(s) {
    return (s == null ? '' : String(s))
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toLowerCase();
  }

  // Garante que o cabeçalho certo foi detectado (planilhas com linhas em branco no topo).
  async function fetchTable(sheetName, mustLabel) {
    const t = await fetchGvizSheet(sheetName);
    if (!mustLabel) return t;
    if (t.cols.some((c) => norm(c) === norm(mustLabel))) return t;
    for (let i = 0; i < Math.min(t.rowsF.length, 12); i++) {
      if (t.rowsF[i].some((v) => norm(v) === norm(mustLabel))) {
        return {
          cols: t.rowsF[i].map((v) => (v == null ? '' : String(v))),
          rows: t.rows.slice(i + 1),
          rowsF: t.rowsF.slice(i + 1),
        };
      }
    }
    return t;
  }

  function colIndex(cols, label, silent) {
    const idx = cols.findIndex((c) => norm(c) === norm(label));
    if (idx === -1 && !silent) console.warn(`[wolves-financeiro] coluna "${label}" não encontrada em`, cols);
    return idx;
  }

  function parseValorBR(v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    let s = v.toString().trim();
    if (!s) return 0;
    if (s.includes(',')) {
      s = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/[^\d.-]/g, '');
    }
    return parseFloat(s) || 0;
  }

  function fmtBRL(v) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function fmtPct(v) {
    return (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
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

  function normDateBR(s) {
    const m = (s || '').toString().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return '';
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`;
  }

  function monthKeyFromBR(dataStr) {
    const m = (dataStr || '').toString().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return null;
    const year = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${year}-${m[2].padStart(2, '0')}`;
  }

  function monthLabel(key) {
    const [y, m] = key.split('-');
    return `${MESES_PT[parseInt(m, 10) - 1]}/${y.slice(2)}`;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  // ───────────────────────── armazenamento local ─────────────────────────
  const STORE_KEY = 'dgx-wolves-v1';
  function defaultStore() {
    return {
      orc2026: { lines: [] },
      proj2027: { lines: [], saldoInicial: null },
      reservas: [],
    };
  }
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const d = defaultStore();
        return {
          orc2026: Object.assign(d.orc2026, s.orc2026 || {}),
          proj2027: Object.assign(d.proj2027, s.proj2027 || {}),
          reservas: Array.isArray(s.reservas) ? s.reservas : [],
        };
      }
    } catch (e) {
      console.warn('[wolves-financeiro] não consegui ler o localStorage', e);
    }
    return defaultStore();
  }
  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      console.warn('[wolves-financeiro] não consegui salvar no localStorage', e);
    }
  }
  let store = loadStore();

  // ───────────────────────── carga de dados ─────────────────────────
  let D = null; // dados carregados da planilha
  const ui = { tab: 'resumo', jogador: '' };

  async function carregarDados() {
    const [extrato, atletas, part, cal] = await Promise.all([
      fetchTable(TAB_EXTRATO, 'Valor'),
      fetchTable(TAB_ATLETAS, 'Nome'),
      fetchTable(TAB_PARTICIPACAO, 'Atleta'),
      fetchTable(TAB_CALENDARIO, 'Cartel').catch((e) => {
        console.warn('[wolves-financeiro] não consegui ler a aba Calendário', e);
        return null;
      }),
    ]);

    // ── Extrato: saldo REAL = saldo de abertura + soma dos valores ──
    // (a coluna Saldo da planilha fica em branco nas linhas ainda não conciliadas)
    const iData = colIndex(extrato.cols, 'Data');
    const iValor = colIndex(extrato.cols, 'Valor');
    const iSaldo = colIndex(extrato.cols, 'Saldo');
    const iConc = colIndex(extrato.cols, 'Conciliado');

    let cum = null;
    const monthly = {};
    const naoConciliados = [];
    extrato.rows.forEach((row, i) => {
      const dataTexto = extrato.rowsF[i][iData];
      if (!dataTexto) {
        // linha de abertura: sem data, só o saldo inicial
        if (cum === null && iSaldo >= 0 && row[iSaldo] != null) cum = parseValorBR(row[iSaldo]);
        return;
      }
      const valor = parseValorBR(row[iValor]);
      if (cum === null) cum = 0;
      cum += valor;
      const conc = (row[iConc] || '').toString().trim().toLowerCase() === 'sim';
      if (!conc) naoConciliados.push({ valor });
      const key = monthKeyFromBR(dataTexto);
      if (key) {
        if (!monthly[key]) monthly[key] = { entradas: 0, saidas: 0, saldoFinal: null };
        if (valor > 0) monthly[key].entradas += valor;
        if (valor < 0) monthly[key].saidas += Math.abs(valor);
        monthly[key].saldoFinal = cum;
      }
    });
    const saldoAtual = cum || 0;
    const monthlyArr = Object.keys(monthly).sort().map((key) => ({ key, label: monthLabel(key), ...monthly[key] }));

    // ── Atletas ──
    const aNome = colIndex(atletas.cols, 'Nome');
    const aTipo = colIndex(atletas.cols, 'Tipo');
    const aGols = colIndex(atletas.cols, 'Gols', true);
    const aAssist = colIndex(atletas.cols, 'Assistencias', true);
    const atletaInfo = {};
    atletas.rows.forEach((row) => {
      const n = row[aNome];
      if (!n) return;
      atletaInfo[norm(n)] = {
        nome: String(n).trim(),
        tipo: row[aTipo] || '',
        gols: aGols >= 0 ? row[aGols] || 0 : 0,
        assist: aAssist >= 0 ? row[aAssist] || 0 : 0,
      };
    });

    // ── Participação: separa pelada x campeonato ──
    const pData = colIndex(part.cols, 'Data_Jogo');
    const pAtleta = colIndex(part.cols, 'Atleta');
    const pPres = colIndex(part.cols, 'Presente?', true);
    const pGols = colIndex(part.cols, 'Gols', true);
    const pAssist = colIndex(part.cols, 'Assistencias', true);
    const pDev = colIndex(part.cols, 'Valor_Devido');
    const pPago = colIndex(part.cols, 'Valor_Pago');
    const pDataPag = colIndex(part.cols, 'Data_Pagamento', true);
    let pCamp = -1;
    ['Campeonato', 'Tipo_Cobranca', 'Tipo Cobrança', 'Cobrança'].some((l) => {
      pCamp = colIndex(part.cols, l, true);
      return pCamp >= 0;
    });
    const campTruthy = (v) => {
      const n = norm(v);
      return n !== '' && !['nao', 'n', '0', 'false', '-', 'pelada', 'mensalidade'].includes(n);
    };
    let colunaCampUsada = false;
    if (pCamp >= 0) colunaCampUsada = part.rows.some((row) => campTruthy(row[pCamp]));
    const fallbackSet = new Set(CAMPEONATO_DATAS_FALLBACK.map(normDateBR));

    const jogadores = {};
    const jogosMap = {};
    part.rows.forEach((row, i) => {
      const nome = row[pAtleta];
      const dataJogo = part.rowsF[i][pData];
      if (!nome || !dataJogo) return;
      const dStr = normDateBR(dataJogo);
      const camp = colunaCampUsada ? campTruthy(row[pCamp]) : fallbackSet.has(dStr);
      const devido = parseValorBR(row[pDev]);
      const pago = parseValorBR(row[pPago]);
      const k = norm(nome);
      if (!jogadores[k]) {
        const info = atletaInfo[k] || {};
        jogadores[k] = {
          nome: String(nome).trim(),
          tipo: info.tipo || '',
          gols: info.gols || 0,
          assist: info.assist || 0,
          pel: { dev: 0, pago: 0 },
          camp: { dev: 0, pago: 0 },
          jogos: [],
        };
      }
      const bucket = camp ? jogadores[k].camp : jogadores[k].pel;
      bucket.dev += devido;
      bucket.pago += pago;
      jogadores[k].jogos.push({
        dataJogo: dStr,
        presente: pPres >= 0 && (row[pPres] || '').toString().trim().toLowerCase() === 'sim',
        gols: pGols >= 0 ? row[pGols] || 0 : 0,
        assist: pAssist >= 0 ? row[pAssist] || 0 : 0,
        devido, pago, camp,
        dataPag: pDataPag >= 0 ? part.rowsF[i][pDataPag] || '' : '',
      });
      if (!jogosMap[dStr]) jogosMap[dStr] = { data: dStr, camp, devido: 0, pago: 0, presentes: 0 };
      jogosMap[dStr].devido += devido;
      jogosMap[dStr].pago += pago;
      if (pPres >= 0 && (row[pPres] || '').toString().trim().toLowerCase() === 'sim') jogosMap[dStr].presentes += 1;
    });

    const listaJog = Object.values(jogadores).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    listaJog.forEach((j) => {
      j.jogos.sort((a, b) => ((parseDataHoraBR(a.dataJogo) || {}).ms || 0) - ((parseDataHoraBR(b.dataJogo) || {}).ms || 0));
      j.pel.saldo = j.pel.pago - j.pel.dev;
      j.camp.saldo = j.camp.pago - j.camp.dev;
    });
    const jogosArr = Object.values(jogosMap).sort((a, b) => ((parseDataHoraBR(a.data) || {}).ms || 0) - ((parseDataHoraBR(b.data) || {}).ms || 0));

    const devedoresPel = listaJog.filter((j) => j.pel.saldo < -0.005);
    const devedoresCamp = listaJog.filter((j) => j.camp.saldo < -0.005);
    const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

    // ── Calendário → aproveitamento ──
    const calendario = [];
    if (cal) {
      const cData = colIndex(cal.cols, 'DATA', true);
      const cMand = colIndex(cal.cols, 'MANDANTE', true);
      const cAdv = colIndex(cal.cols, 'ADVERSARIO', true);
      const cReal = colIndex(cal.cols, 'Realizado', true);
      const cCartel = colIndex(cal.cols, 'Cartel', true);
      cal.rows.forEach((row, i) => {
        if (cData < 0 || cCartel < 0) return;
        const dataTxt = cal.rowsF[i][cData];
        if (!dataTxt) return;
        if (norm(row[cReal]) !== 'sim') return;
        const c = norm(row[cCartel]);
        if (!['vitoria', 'empate', 'derrota'].includes(c)) return;
        const g1 = parseFloat(row[cMand + 1]) || 0;
        const g2 = parseFloat(row[cMand + 2]) || 0;
        const wolvesMandante = norm(row[cMand]).includes('wolves');
        calendario.push({
          data: normDateBR(dataTxt),
          adversario: cAdv >= 0 ? row[cAdv] || '' : '',
          res: c,
          pro: wolvesMandante ? g1 : g2,
          contra: wolvesMandante ? g2 : g1,
          mandante: wolvesMandante,
        });
      });
      calendario.sort((a, b) => ((parseDataHoraBR(a.data) || {}).ms || 0) - ((parseDataHoraBR(b.data) || {}).ms || 0));
    }

    // ── Última conciliação ──
    let ultimaConciliacao = null;
    try {
      const log = await fetchTable(TAB_LOG, 'Data');
      const iLog = colIndex(log.cols, 'Data');
      let best = null;
      log.rowsF.forEach((rowF) => {
        const parsed = parseDataHoraBR(rowF[iLog]);
        if (parsed && (!best || parsed.ms > best.ms)) best = parsed;
      });
      ultimaConciliacao = best ? best.dataStr : null;
    } catch (e) {
      console.warn('[wolves-financeiro] não consegui ler a aba de log.', e);
    }

    return {
      saldoAtual,
      monthlyArr,
      monthlyMap: monthly,
      naoConciliados,
      jogadores: listaJog,
      jogos: jogosArr,
      colunaCampUsada,
      campColExiste: pCamp >= 0,
      devedoresPel,
      devedoresCamp,
      totalPelAberto: sum(devedoresPel, (j) => -j.pel.saldo),
      totalCampAberto: sum(devedoresCamp, (j) => -j.camp.saldo),
      totalCampDevido: sum(listaJog, (j) => j.camp.dev),
      totalCampPago: sum(listaJog, (j) => j.camp.pago),
      calendario,
      ultimaConciliacao,
    };
  }

  // ───────────────────────── gráficos ─────────────────────────
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

  const charts = {};
  function destroyCharts() {
    Object.keys(charts).forEach((k) => {
      try { charts[k].destroy(); } catch (e) { /* noop */ }
      delete charts[k];
    });
  }

  function chartTheme() {
    const styles = getComputedStyle(document.documentElement);
    return {
      text: styles.getPropertyValue('--text2').trim() || '#9c93bd',
      grid: 'rgba(255,255,255,.06)',
    };
  }

  function fmtAxisK(v) {
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1000) {
      const k = abs / 1000;
      return sign + 'R$ ' + (k % 1 === 0 ? k : k.toFixed(1)) + 'K';
    }
    return sign + 'R$ ' + abs;
  }

  async function drawChart(wrapId, canvasId, config, emptyMsg) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    if (emptyMsg) {
      wrap.innerHTML = `<div class="ini-empty">${esc(emptyMsg)}</div>`;
      return;
    }
    wrap.innerHTML = `<canvas id="${canvasId}" height="90"></canvas>`;
    try {
      await ensureChartJs();
    } catch (e) {
      wrap.innerHTML = '<div class="ini-empty">Não foi possível carregar a biblioteca do gráfico (Chart.js via CDN).</div>';
      return;
    }
    const el = document.getElementById(canvasId);
    if (!el) return;
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(el.getContext('2d'), config);
  }

  // Evolução mensal EMPILHADA: entradas (positivo) e saídas (negativo) na mesma barra, eixo único.
  function chartMensal(monthlyArr) {
    const t = chartTheme();
    return {
      data: {
        labels: monthlyArr.map((m) => m.label),
        datasets: [
          { type: 'bar', label: 'Entradas', data: monthlyArr.map((m) => m.entradas), backgroundColor: COR_VERDE, borderRadius: 4, stack: 'fluxo', order: 2 },
          { type: 'bar', label: 'Saídas', data: monthlyArr.map((m) => -m.saidas), backgroundColor: '#f87171', borderRadius: 4, stack: 'fluxo', order: 2 },
          {
            type: 'line', label: 'Saldo final do mês', data: monthlyArr.map((m) => m.saldoFinal),
            borderColor: COR_ROXO, backgroundColor: COR_ROXO, pointRadius: 4, tension: 0.3, order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: t.text, font: { size: 12 } } },
          tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${fmtBRL(Math.abs(item.parsed.y))}` } },
        },
        scales: {
          x: { stacked: true, ticks: { color: t.text }, grid: { color: t.grid } },
          y: { stacked: true, ticks: { color: t.text, callback: fmtAxisK }, grid: { color: t.grid } },
        },
      },
    };
  }

  // ───────────────────────── estilos ─────────────────────────
  function injectStyle() {
    if (document.getElementById('wolves-style')) return;
    const st = document.createElement('style');
    st.id = 'wolves-style';
    st.textContent = `
      .wv-tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--border);margin:0 0 22px}
      .wv-tab{background:none;border:0;color:var(--text2);padding:10px 14px;cursor:pointer;font-family:var(--body);font-size:14px;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
      .wv-tab:hover{color:var(--text)}
      .wv-tab.active{color:var(--text);border-bottom-color:${COR_ROXO};font-weight:600}
      .wv-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
      .wv-btn{font-family:var(--body);font-size:13px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:7px 12px;cursor:pointer}
      .wv-btn:hover{border-color:${COR_ROXO}}
      .wv-table{width:100%;border-collapse:collapse;font-size:13.5px}
      .wv-table th{padding:6px 8px;color:var(--text2);font-size:11px;text-transform:uppercase;letter-spacing:.5px;text-align:right;white-space:nowrap}
      .wv-table th:first-child,.wv-table td:first-child{text-align:left}
      .wv-table td{padding:6px 8px;text-align:right;white-space:nowrap;border-top:1px solid var(--border)}
      .wv-table tr.tot td{font-weight:600;border-top:1px solid var(--border)}
      .wv-table input{font-family:var(--body);font-size:13px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 6px;color-scheme:dark}
      .wv-table input.num{width:78px;text-align:right}
      .wv-table input.nome{width:170px;text-align:left}
      .wv-table select{font-family:var(--body);font-size:13px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px;color-scheme:dark}
      .wv-pos{color:${COR_VERDE}} .wv-neg{color:${COR_PELADA}} .wv-camp{color:${COR_CAMP}}
      .wv-badge{display:inline-block;font-size:11px;padding:2px 7px;border-radius:99px;border:1px solid currentColor}
      .wv-bar{height:8px;background:var(--bg2);border-radius:99px;overflow:hidden;margin-top:6px}
      .wv-bar>i{display:block;height:100%;background:${COR_ROXO};border-radius:99px}
      .wv-scroll{overflow-x:auto}
      .wv-note{color:var(--text2);font-size:12.5px;margin:8px 0 0}
      .wv-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
    `;
    document.head.appendChild(st);
  }

  function sectionHead(title, hint, mt) {
    return `<div class="area-summary-head" style="margin-top:${mt == null ? 32 : mt}px;"><h3>${title}</h3>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  }

  // ───────────────────────── aba: Resumo ─────────────────────────
  function tabResumo() {
    const campDevedores = D.devedoresCamp.length;
    const rows = D.jogadores
      .filter((j) => j.pel.saldo < -0.005 || j.camp.saldo < -0.005)
      .sort((a, b) => (a.pel.saldo + a.camp.saldo) - (b.pel.saldo + b.camp.saldo))
      .map((j) => {
        const pel = j.pel.saldo < -0.005 ? `<span class="wv-neg">${fmtBRL(j.pel.saldo)}</span>` : '<span style="color:var(--text2)">—</span>';
        const cp = j.camp.saldo < -0.005 ? `<span class="wv-camp">${fmtBRL(j.camp.saldo)}</span>` : '<span style="color:var(--text2)">—</span>';
        const tot = j.pel.saldo + j.camp.saldo;
        return `<tr><td>${esc(j.nome)}${j.tipo ? ` <span style="color:var(--text2);font-size:12px;">· ${esc(j.tipo)}</span>` : ''}</td><td>${pel}</td><td>${cp}</td><td class="${tot < 0 ? 'wv-neg' : 'wv-pos'}">${fmtBRL(tot)}</td></tr>`;
      })
      .join('');

    const opts = D.jogadores
      .map((j) => `<option value="${esc(j.nome)}"${j.nome === ui.jogador ? ' selected' : ''}>${esc(j.nome)}${j.tipo ? ' · ' + esc(j.tipo) : ''}</option>`)
      .join('');

    return `
      ${D.ultimaConciliacao ? `<p class="section-intro" style="margin-bottom:16px;">🕐 Última conciliação rodada em <strong style="color:var(--text);">${esc(D.ultimaConciliacao)}</strong></p>` : ''}
      <div class="rp-cards">
        <div class="rp-card"><div class="rp-label">Saldo em caixa</div><div class="rp-value ${D.saldoAtual >= 0 ? 'pos' : 'neg'}">${fmtBRL(D.saldoAtual)}</div></div>
        <div class="rp-card"><div class="rp-label" style="color:${COR_PELADA}">Pelada em aberto</div><div class="rp-value" style="color:${COR_PELADA}">${fmtBRL(D.totalPelAberto)}</div><div class="wv-note">${D.devedoresPel.length} inadimplente(s)</div></div>
        <div class="rp-card"><div class="rp-label" style="color:${COR_CAMP}">Campeonato em aberto</div><div class="rp-value" style="color:${COR_CAMP}">${fmtBRL(D.totalCampAberto)}</div><div class="wv-note">${campDevedores} inadimplente(s)</div></div>
        <div class="rp-card"><div class="rp-label">Não conciliados</div><div class="rp-value">${D.naoConciliados.length}</div></div>
      </div>

      ${sectionHead('Evolução mensal', 'entradas e saídas empilhadas na mesma barra, saldo final em linha')}
      <div class="rp-chart-wrap" id="wv-chart-mensal"></div>

      ${sectionHead('Extrato do jogador', 'participações, gols, assistências e financeiro por atleta (pelada e campeonato separados)')}
      <div class="ini-card">
        <select id="wv-player-select" style="width:100%; max-width:320px; font-family:var(--body); font-size:14px; background:var(--bg2); color:var(--text); border:1px solid var(--border); border-radius:9px; padding:9px 12px; color-scheme:dark;">
          <option value="">Selecione um jogador…</option>${opts}
        </select>
        <div id="wv-player-result" style="margin-top:16px;"></div>
      </div>

      ${sectionHead('Inadimplência por jogador', `<span class="wv-neg">■ pelada</span> &nbsp; <span class="wv-camp">■ campeonato</span>`)}
      <div class="ini-card wv-scroll">
        ${rows ? `<table class="wv-table"><thead><tr><th>Jogador</th><th>Pelada</th><th>Campeonato</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="ini-empty">Ninguém devendo 🎉</div>'}
      </div>
    `;
  }

  function renderPlayer(nome) {
    const el = document.getElementById('wv-player-result');
    if (!el) return;
    ui.jogador = nome || '';
    if (!nome) { el.innerHTML = ''; return; }
    const j = D.jogadores.find((x) => x.nome === nome);
    if (!j) { el.innerHTML = '<div class="ini-empty">Jogador não encontrado.</div>'; return; }
    const presentes = j.jogos.filter((x) => x.presente).length;
    const saldoTot = j.pel.saldo + j.camp.saldo;
    const linhas = j.jogos.map((g) => {
      const ok = g.pago >= g.devido;
      return `<tr style="${g.camp ? `box-shadow: inset 3px 0 0 ${COR_CAMP};` : ''}">
        <td style="padding-left:12px;">${esc(g.dataJogo || '—')}${g.camp ? ` <span class="wv-badge wv-camp">campeonato</span>` : ''}</td>
        <td style="text-align:center;">${g.presente ? '✅' : '—'}</td>
        <td style="text-align:center;">${g.gols || 0}</td>
        <td style="text-align:center;">${g.assist || 0}</td>
        <td>${fmtBRL(g.devido)}</td>
        <td style="color:${ok ? COR_VERDE : (g.camp ? COR_CAMP : COR_PELADA)};">${fmtBRL(g.pago)}</td>
        <td style="text-align:left;color:var(--text2);">${esc(g.dataPag || '—')}</td>
      </tr>`;
    }).join('');
    el.innerHTML = `
      <div class="rp-cards" style="margin-bottom:18px;">
        <div class="rp-card"><div class="rp-label">Jogos (presente)</div><div class="rp-value">${presentes} / ${j.jogos.length}</div></div>
        <div class="rp-card"><div class="rp-label">Gols · Assistências</div><div class="rp-value">${j.gols} · ${j.assist}</div></div>
        <div class="rp-card"><div class="rp-label" style="color:${COR_PELADA}">Pelada</div><div class="rp-value" style="color:${j.pel.saldo < -0.005 ? COR_PELADA : COR_VERDE}">${fmtBRL(j.pel.saldo)}</div></div>
        <div class="rp-card"><div class="rp-label" style="color:${COR_CAMP}">Campeonato</div><div class="rp-value" style="color:${j.camp.saldo < -0.005 ? COR_CAMP : COR_VERDE}">${fmtBRL(j.camp.saldo)}</div></div>
      </div>
      <p class="section-intro" style="margin-bottom:14px;">${saldoTot < -0.005
        ? `💬 <strong style="color:var(--text);">${esc(j.nome)}</strong>${j.tipo ? ' (' + esc(j.tipo) + ')' : ''} está devendo <strong class="wv-neg">${fmtBRL(-saldoTot)}</strong> no total${j.camp.saldo < -0.005 && j.pel.saldo < -0.005 ? ` — <span class="wv-neg">${fmtBRL(-j.pel.saldo)} pelada</span> + <span class="wv-camp">${fmtBRL(-j.camp.saldo)} campeonato</span>` : ''}.`
        : `✅ <strong style="color:var(--text);">${esc(j.nome)}</strong> está em dia.`}</p>
      <div class="wv-scroll"><table class="wv-table">
        <thead><tr><th>Jogo</th><th style="text-align:center;">Presente</th><th style="text-align:center;">Gols</th><th style="text-align:center;">Assist.</th><th>Devido</th><th>Pago</th><th style="text-align:left;">Pago em</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="7" style="color:var(--text2);">Nenhuma participação registrada.</td></tr>'}</tbody>
      </table></div>`;
  }

  async function afterResumo() {
    await drawChart('wv-chart-mensal', 'wv-cv-mensal', chartMensal(D.monthlyArr), D.monthlyArr.length ? null : 'Ainda sem movimentações suficientes para o gráfico mensal.');
    const sel = document.getElementById('wv-player-select');
    if (sel) sel.addEventListener('change', (ev) => renderPlayer(ev.target.value));
    if (ui.jogador) renderPlayer(ui.jogador);
  }

  // ───────────────────────── aba: Campeonato ─────────────────────────
  function tabCampeonato() {
    const jogosCamp = D.jogos.filter((g) => g.camp);
    const emAberto = D.totalCampAberto;
    const rows = D.jogadores
      .filter((j) => j.camp.dev > 0 || j.camp.pago > 0)
      .sort((a, b) => a.camp.saldo - b.camp.saldo)
      .map((j) => `<tr>
        <td>${esc(j.nome)}${j.tipo ? ` <span style="color:var(--text2);font-size:12px;">· ${esc(j.tipo)}</span>` : ''}</td>
        <td>${fmtBRL(j.camp.dev)}</td><td>${fmtBRL(j.camp.pago)}</td>
        <td class="${j.camp.saldo < -0.005 ? 'wv-camp' : 'wv-pos'}">${fmtBRL(j.camp.saldo)}</td></tr>`)
      .join('');
    const gamesRows = jogosCamp.map((g) => `<tr><td>${esc(g.data)}</td><td>${g.presentes}</td><td>${fmtBRL(g.devido)}</td><td>${fmtBRL(g.pago)}</td><td class="${g.pago - g.devido < -0.005 ? 'wv-camp' : 'wv-pos'}">${fmtBRL(g.pago - g.devido)}</td></tr>`).join('');
    const fonte = D.colunaCampUsada
      ? 'Identificado pela coluna <strong>Campeonato</strong> da aba Participação.'
      : `Ainda não há coluna <strong>Campeonato</strong> preenchida na aba Participação — usando as datas ${CAMPEONATO_DATAS_FALLBACK.map(esc).join(' e ')}. Crie a coluna "Campeonato" e marque "Sim" nas linhas desses jogos para o site passar a ler dela.`;
    return `
      <p class="section-intro">Cobrança do campeonato, separada da inadimplência da pelada.</p>
      <div class="rp-cards">
        <div class="rp-card"><div class="rp-label" style="color:${COR_CAMP}">Devido (campeonato)</div><div class="rp-value">${fmtBRL(D.totalCampDevido)}</div></div>
        <div class="rp-card"><div class="rp-label">Pago</div><div class="rp-value pos">${fmtBRL(D.totalCampPago)}</div></div>
        <div class="rp-card"><div class="rp-label" style="color:${COR_CAMP}">Em aberto</div><div class="rp-value" style="color:${COR_CAMP}">${fmtBRL(emAberto)}</div></div>
        <div class="rp-card"><div class="rp-label">Inadimplentes</div><div class="rp-value">${D.devedoresCamp.length}</div></div>
      </div>
      <p class="wv-note">${fonte}</p>

      ${sectionHead('Jogos do campeonato', '')}
      <div class="ini-card wv-scroll">
        ${gamesRows ? `<table class="wv-table"><thead><tr><th>Jogo</th><th>Presentes</th><th>Devido</th><th>Pago</th><th>Saldo</th></tr></thead><tbody>${gamesRows}</tbody></table>` : '<div class="ini-empty">Nenhum jogo de campeonato identificado.</div>'}
      </div>

      ${sectionHead('Por jogador', 'saldo do campeonato (negativo = devendo)')}
      <div class="ini-card wv-scroll">
        ${rows ? `<table class="wv-table"><thead><tr><th>Jogador</th><th>Devido</th><th>Pago</th><th>Saldo</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="ini-empty">Sem cobranças de campeonato.</div>'}
      </div>`;
  }

  // ───────────────────────── abas: Orçamento 2026 / Projeção 2027 ─────────────────────────
  function sumArr(a) { return a.reduce((s, x) => s + (parseFloat(x) || 0), 0); }

  function gridModel(key) { return key === 'orc2026' ? store.orc2026 : store.proj2027; }

  function budgetTotals(model) {
    const rec = Array(12).fill(0);
    const desp = Array(12).fill(0);
    model.lines.forEach((l) => {
      for (let m = 0; m < 12; m++) {
        const v = parseFloat(l.v[m]) || 0;
        if (l.tipo === 'receita') rec[m] += v; else desp[m] += v;
      }
    });
    return { rec, desp };
  }

  function realizado2026() {
    const rec = Array(12).fill(0);
    const desp = Array(12).fill(0);
    Object.keys(D.monthlyMap).forEach((k) => {
      const [y, m] = k.split('-');
      if (y !== '2026') return;
      rec[parseInt(m, 10) - 1] = D.monthlyMap[k].entradas;
      desp[parseInt(m, 10) - 1] = D.monthlyMap[k].saidas;
    });
    return { rec, desp };
  }

  function cell(v, cls) { return `<td class="${cls || ''}">${fmtBRL(v)}</td>`; }

  function footHtml(key) {
    const model = gridModel(key);
    const o = budgetTotals(model);
    const resO = o.rec.map((r, i) => r - o.desp[i]);
    const line = (label, arr, cls, bold, noTotal) => `<tr class="${bold ? 'tot' : ''}"><td>${label}</td>${arr.map((v) => cell(v, cls ? cls(v) : '')).join('')}${noTotal ? '<td></td>' : cell(sumArr(arr), cls ? cls(sumArr(arr)) : '')}<td></td></tr>`;
    const posneg = (v) => (v < 0 ? 'wv-neg' : '');
    let html = line('Receitas orçadas', o.rec, null, false) + line('Despesas orçadas', o.desp, null, false) + line('Resultado orçado', resO, posneg, true);
    if (key === 'orc2026') {
      const r = realizado2026();
      const resR = r.rec.map((x, i) => x - r.desp[i]);
      const varr = resR.map((x, i) => x - resO[i]);
      const hoje = new Date();
      // variação só nos meses já encerrados/em andamento
      const mesAtual = hoje.getFullYear() === 2026 ? hoje.getMonth() : (hoje.getFullYear() > 2026 ? 11 : -1);
      const varVis = varr.map((x, i) => (i <= mesAtual ? x : 0));
      html += line('Receitas realizadas', r.rec, null, false) + line('Despesas realizadas', r.desp, null, false) + line('Resultado realizado', resR, posneg, true);
      html += line('Variação (realizado − orçado)', varVis, posneg, true);
    } else {
      const ini = model.saldoInicial != null ? model.saldoInicial : D.saldoAtual;
      let acc = ini;
      const saldos = resO.map((x) => (acc += x));
      html += line('Saldo projetado (acumulado)', saldos, posneg, true, true);
    }
    return html;
  }

  function gridTable(key) {
    const model = gridModel(key);
    const head = `<tr><th>Linha</th><th>Tipo</th>${MESES_PT.map((m) => `<th>${m}</th>`).join('')}<th>Total</th><th></th></tr>`;
    const body = model.lines.map((l) => `
      <tr data-id="${l.id}">
        <td><input class="nome" data-f="nome" value="${esc(l.nome)}" placeholder="Ex.: Mensalidades"></td>
        <td style="text-align:left;"><select data-f="tipo"><option value="receita"${l.tipo === 'receita' ? ' selected' : ''}>Receita</option><option value="despesa"${l.tipo === 'despesa' ? ' selected' : ''}>Despesa</option></select></td>
        ${l.v.map((v, m) => `<td><input class="num" type="number" step="0.01" data-m="${m}" value="${v === '' || v == null ? '' : v}"></td>`).join('')}
        <td class="tot-line">${fmtBRL(sumArr(l.v))}</td>
        <td><button class="wv-btn" data-del="${l.id}" title="Remover linha" style="padding:3px 8px;">✕</button></td>
      </tr>`).join('');
    return `<div class="wv-scroll"><table class="wv-table" id="wv-grid-${key}">
      <thead>${head}</thead>
      <tbody>${body || `<tr><td colspan="16" style="text-align:left;color:var(--text2);">Nenhuma linha ainda — use "+ Receita" ou "+ Despesa".</td></tr>`}</tbody>
      <tfoot id="wv-foot-${key}">${footHtml(key)}</tfoot>
    </table></div>`;
  }

  function tabOrcamento(key) {
    const is26 = key === 'orc2026';
    const model = gridModel(key);
    const extra = is26
      ? ''
      : `<div class="ini-card" style="margin-bottom:16px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;">
          <label style="color:var(--text2);font-size:13px;">Saldo inicial 2027 (R$)
            <input id="wv-saldo-ini" class="wv-btn" type="number" step="0.01" style="width:130px;margin-left:6px;" value="${model.saldoInicial != null ? model.saldoInicial : ''}" placeholder="${D.saldoAtual.toFixed(2)}">
          </label>
          <span class="wv-note" style="margin:0;">vazio = usa o saldo em caixa de hoje (${fmtBRL(D.saldoAtual)})</span>
          <span style="flex:1"></span>
          <label style="color:var(--text2);font-size:13px;">Ajuste
            <input id="wv-ajuste" class="wv-btn" type="number" step="0.1" style="width:80px;margin-left:6px;" value="0"> %
          </label>
          <button class="wv-btn" id="wv-copy26">Copiar orçamento 2026 → 2027</button>
        </div>`;
    return `
      <p class="section-intro">${is26 ? 'Orçamento de 2026 digitado aqui, comparado com o realizado do Extrato (entradas e saídas por mês).' : 'Projeção de 2027: receitas e despesas previstas mês a mês e o saldo acumulado resultante.'}</p>
      ${extra}
      <div class="ini-card">
        <div class="wv-top">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="wv-btn" id="wv-add-rec">+ Receita</button>
            <button class="wv-btn" id="wv-add-desp">+ Despesa</button>
          </div>
          <span class="wv-note" style="margin:0;">salvo automaticamente neste navegador</span>
        </div>
        ${gridTable(key)}
      </div>
      ${sectionHead(is26 ? 'Orçado × Realizado' : 'Resultado e saldo projetados', is26 ? 'receitas e despesas por mês' : 'barras = resultado do mês, linha = saldo acumulado')}
      <div class="rp-chart-wrap" id="wv-chart-orc"></div>
    `;
  }

  function chartOrcamento(key) {
    const t = chartTheme();
    const model = gridModel(key);
    const o = budgetTotals(model);
    if (key === 'orc2026') {
      const r = realizado2026();
      return {
        data: {
          labels: MESES_PT,
          datasets: [
            { type: 'bar', label: 'Receita orçada', data: o.rec, backgroundColor: 'rgba(74,222,128,.35)', borderColor: COR_VERDE, borderWidth: 1, borderRadius: 4 },
            { type: 'bar', label: 'Receita realizada', data: r.rec, backgroundColor: COR_VERDE, borderRadius: 4 },
            { type: 'bar', label: 'Despesa orçada', data: o.desp, backgroundColor: 'rgba(248,113,113,.35)', borderColor: '#f87171', borderWidth: 1, borderRadius: 4 },
            { type: 'bar', label: 'Despesa realizada', data: r.desp, backgroundColor: '#f87171', borderRadius: 4 },
          ],
        },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { labels: { color: t.text } }, tooltip: { callbacks: { label: (i) => `${i.dataset.label}: ${fmtBRL(i.parsed.y)}` } } },
          scales: { x: { ticks: { color: t.text }, grid: { color: t.grid } }, y: { ticks: { color: t.text, callback: fmtAxisK }, grid: { color: t.grid } } },
        },
      };
    }
    const res = o.rec.map((x, i) => x - o.desp[i]);
    let acc = model.saldoInicial != null ? model.saldoInicial : D.saldoAtual;
    const saldo = res.map((x) => (acc += x));
    return {
      data: {
        labels: MESES_PT,
        datasets: [
          { type: 'bar', label: 'Resultado do mês', data: res, backgroundColor: res.map((x) => (x >= 0 ? COR_VERDE : '#f87171')), borderRadius: 4, order: 2 },
          { type: 'line', label: 'Saldo projetado', data: saldo, borderColor: COR_ROXO, backgroundColor: COR_ROXO, pointRadius: 4, tension: 0.3, order: 1 },
        ],
      },
      options: {
        responsive: true, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: t.text } }, tooltip: { callbacks: { label: (i) => `${i.dataset.label}: ${fmtBRL(i.parsed.y)}` } } },
        scales: { x: { ticks: { color: t.text }, grid: { color: t.grid } }, y: { ticks: { color: t.text, callback: fmtAxisK }, grid: { color: t.grid } } },
      },
    };
  }

  async function afterOrcamento(key) {
    const body = document.getElementById('wv-body');
    const model = gridModel(key);
    const redrawChart = () => drawChart('wv-chart-orc', 'wv-cv-orc', chartOrcamento(key));
    await redrawChart();

    const refreshFoot = () => {
      const f = document.getElementById('wv-foot-' + key);
      if (f) f.innerHTML = footHtml(key);
    };

    const addLine = (tipo) => {
      model.lines.push({ id: uid(), tipo, nome: '', v: Array(12).fill('') });
      saveStore();
      renderTab();
    };
    const addRec = document.getElementById('wv-add-rec');
    const addDesp = document.getElementById('wv-add-desp');
    if (addRec) addRec.addEventListener('click', () => addLine('receita'));
    if (addDesp) addDesp.addEventListener('click', () => addLine('despesa'));

    const table = document.getElementById('wv-grid-' + key);
    if (table) {
      table.addEventListener('input', (ev) => {
        const tr = ev.target.closest('tr[data-id]');
        if (!tr) return;
        const l = model.lines.find((x) => x.id === tr.dataset.id);
        if (!l) return;
        if (ev.target.dataset.m != null) {
          const v = ev.target.value;
          l.v[parseInt(ev.target.dataset.m, 10)] = v === '' ? '' : parseFloat(v);
          const tl = tr.querySelector('.tot-line');
          if (tl) tl.textContent = fmtBRL(sumArr(l.v));
          refreshFoot();
        } else if (ev.target.dataset.f === 'nome') {
          l.nome = ev.target.value;
        }
        saveStore();
      });
      table.addEventListener('change', (ev) => {
        const tr = ev.target.closest('tr[data-id]');
        if (!tr) return;
        const l = model.lines.find((x) => x.id === tr.dataset.id);
        if (!l) return;
        if (ev.target.dataset.f === 'tipo') {
          l.tipo = ev.target.value;
          saveStore();
          refreshFoot();
        }
        redrawChart();
      });
      table.addEventListener('click', (ev) => {
        const del = ev.target.closest('[data-del]');
        if (!del) return;
        model.lines = model.lines.filter((x) => x.id !== del.dataset.del);
        if (key === 'orc2026') store.orc2026.lines = model.lines; else store.proj2027.lines = model.lines;
        saveStore();
        renderTab();
      });
    }

    if (key === 'proj27') {
      const ini = document.getElementById('wv-saldo-ini');
      if (ini) ini.addEventListener('change', () => {
        model.saldoInicial = ini.value === '' ? null : parseFloat(ini.value);
        saveStore(); refreshFoot(); redrawChart();
      });
      const cp = document.getElementById('wv-copy26');
      if (cp) cp.addEventListener('click', () => {
        const pct = parseFloat((document.getElementById('wv-ajuste') || {}).value) || 0;
        if (!store.orc2026.lines.length) { alert('O orçamento 2026 ainda está vazio.'); return; }
        if (model.lines.length && !confirm('Substituir as linhas atuais da projeção 2027 pelo orçamento 2026?')) return;
        model.lines = store.orc2026.lines.map((l) => ({
          id: uid(), tipo: l.tipo, nome: l.nome,
          v: l.v.map((v) => (v === '' || v == null ? '' : Math.round(parseFloat(v) * (1 + pct / 100) * 100) / 100)),
        }));
        saveStore();
        renderTab();
      });
    }
    void body;
  }

  // ───────────────────────── aba: Reservas ─────────────────────────
  function tabReservas() {
    const total = store.reservas.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
    const livre = D.saldoAtual - total;
    const itens = store.reservas.map((r) => {
      const val = parseFloat(r.valor) || 0;
      const meta = parseFloat(r.meta) || 0;
      const pct = meta > 0 ? Math.min(1, val / meta) : 0;
      return `<tr data-id="${r.id}">
        <td><input class="nome" data-f="nome" value="${esc(r.nome)}" placeholder="Ex.: Reserva de campo"></td>
        <td><input class="num" type="number" step="0.01" data-f="valor" value="${r.valor === '' || r.valor == null ? '' : r.valor}"></td>
        <td><input class="num" type="number" step="0.01" data-f="meta" value="${r.meta === '' || r.meta == null ? '' : r.meta}"></td>
        <td style="min-width:140px;">${meta > 0 ? `${fmtPct(val / meta)}<div class="wv-bar"><i style="width:${pct * 100}%"></i></div>` : '<span style="color:var(--text2)">—</span>'}</td>
        <td style="text-align:left;"><input class="nome" data-f="obs" value="${esc(r.obs || '')}" placeholder="Observação"></td>
        <td><button class="wv-btn" data-del="${r.id}" style="padding:3px 8px;">✕</button></td>
      </tr>`;
    }).join('');
    return `
      <p class="section-intro">Reservas de caixa do time: quanto está separado para cada finalidade e quanto do saldo em caixa continua livre.</p>
      <div class="rp-cards" id="wv-res-cards">${reservasCards(total, livre)}</div>
      ${sectionHead('Reservas', '')}
      <div class="ini-card">
        <div class="wv-top"><button class="wv-btn" id="wv-add-res">+ Reserva</button><span class="wv-note" style="margin:0;">salvo automaticamente neste navegador</span></div>
        <div class="wv-scroll"><table class="wv-table" id="wv-res-table">
          <thead><tr><th>Reserva</th><th>Valor</th><th>Meta</th><th>Atingido</th><th style="text-align:left;">Observação</th><th></th></tr></thead>
          <tbody>${itens || '<tr><td colspan="6" style="text-align:left;color:var(--text2);">Nenhuma reserva cadastrada.</td></tr>'}</tbody>
        </table></div>
      </div>`;
  }

  function reservasCards(total, livre) {
    return `
      <div class="rp-card"><div class="rp-label">Saldo em caixa</div><div class="rp-value ${D.saldoAtual >= 0 ? 'pos' : 'neg'}">${fmtBRL(D.saldoAtual)}</div></div>
      <div class="rp-card"><div class="rp-label">Total reservado</div><div class="rp-value">${fmtBRL(total)}</div></div>
      <div class="rp-card"><div class="rp-label">Caixa livre</div><div class="rp-value ${livre >= 0 ? 'pos' : 'neg'}">${fmtBRL(livre)}</div></div>`;
  }

  function afterReservas() {
    const add = document.getElementById('wv-add-res');
    if (add) add.addEventListener('click', () => {
      store.reservas.push({ id: uid(), nome: '', valor: '', meta: '', obs: '' });
      saveStore(); renderTab();
    });
    const table = document.getElementById('wv-res-table');
    if (!table) return;
    table.addEventListener('input', (ev) => {
      const tr = ev.target.closest('tr[data-id]');
      if (!tr) return;
      const r = store.reservas.find((x) => x.id === tr.dataset.id);
      if (!r) return;
      const f = ev.target.dataset.f;
      if (f === 'valor' || f === 'meta') r[f] = ev.target.value === '' ? '' : parseFloat(ev.target.value);
      else if (f) r[f] = ev.target.value;
      saveStore();
      const total = store.reservas.reduce((s, x) => s + (parseFloat(x.valor) || 0), 0);
      const c = document.getElementById('wv-res-cards');
      if (c) c.innerHTML = reservasCards(total, D.saldoAtual - total);
    });
    table.addEventListener('change', () => renderTab());
    table.addEventListener('click', (ev) => {
      const del = ev.target.closest('[data-del]');
      if (!del) return;
      store.reservas = store.reservas.filter((x) => x.id !== del.dataset.del);
      saveStore(); renderTab();
    });
  }

  // ───────────────────────── aba: Aproveitamento ─────────────────────────
  function tabAproveitamento() {
    const g = D.calendario;
    if (!g.length) return '<div class="ini-empty">Nenhum jogo realizado encontrado na aba Calendário.</div>';
    const v = g.filter((x) => x.res === 'vitoria').length;
    const e = g.filter((x) => x.res === 'empate').length;
    const d = g.filter((x) => x.res === 'derrota').length;
    const pts = 3 * v + e;
    const aprov = pts / (3 * g.length);
    const pro = g.reduce((s, x) => s + x.pro, 0);
    const contra = g.reduce((s, x) => s + x.contra, 0);
    const badge = { vitoria: ['V', COR_VERDE], empate: ['E', COR_CAMP], derrota: ['D', COR_PELADA] };
    const ult = g.slice().reverse().slice(0, 12).map((x) => `<tr><td>${esc(x.data)}</td><td style="text-align:left;">${esc(x.adversario)}</td><td>${x.pro} × ${x.contra}</td><td><span class="wv-badge" style="color:${badge[x.res][1]}">${badge[x.res][0]}</span></td></tr>`).join('');
    return `
      <div class="rp-cards">
        <div class="rp-card"><div class="rp-label">Aproveitamento</div><div class="rp-value">${fmtPct(aprov)}</div><div class="wv-note">${pts} de ${3 * g.length} pontos</div></div>
        <div class="rp-card"><div class="rp-label">Jogos</div><div class="rp-value">${g.length}</div></div>
        <div class="rp-card"><div class="rp-label">V · E · D</div><div class="rp-value"><span class="wv-pos">${v}</span> · <span class="wv-camp">${e}</span> · <span class="wv-neg">${d}</span></div></div>
        <div class="rp-card"><div class="rp-label">Gols pró · contra</div><div class="rp-value">${pro} · ${contra} <span style="font-size:14px;color:var(--text2)">(${pro - contra >= 0 ? '+' : ''}${pro - contra})</span></div></div>
      </div>
      ${sectionHead('Aproveitamento ao longo da temporada', 'barras = V/E/D por mês, linha = aproveitamento acumulado (%)')}
      <div class="rp-chart-wrap" id="wv-chart-aprov"></div>
      ${sectionHead('Últimos jogos', '')}
      <div class="ini-card wv-scroll"><table class="wv-table"><thead><tr><th>Data</th><th style="text-align:left;">Adversário</th><th>Placar</th><th>Resultado</th></tr></thead><tbody>${ult}</tbody></table></div>`;
  }

  function chartAproveitamento() {
    const t = chartTheme();
    const meses = {};
    let jogos = 0, pts = 0;
    const cum = {};
    D.calendario.forEach((x) => {
      const k = monthKeyFromBR(x.data);
      if (!meses[k]) meses[k] = { v: 0, e: 0, d: 0 };
      if (x.res === 'vitoria') meses[k].v++;
      else if (x.res === 'empate') meses[k].e++;
      else meses[k].d++;
      jogos++; pts += x.res === 'vitoria' ? 3 : x.res === 'empate' ? 1 : 0;
      cum[k] = (pts / (3 * jogos)) * 100;
    });
    const keys = Object.keys(meses).sort();
    return {
      data: {
        labels: keys.map(monthLabel),
        datasets: [
          { type: 'bar', label: 'Vitórias', data: keys.map((k) => meses[k].v), backgroundColor: COR_VERDE, stack: 'r', yAxisID: 'y', order: 2 },
          { type: 'bar', label: 'Empates', data: keys.map((k) => meses[k].e), backgroundColor: COR_CAMP, stack: 'r', yAxisID: 'y', order: 2 },
          { type: 'bar', label: 'Derrotas', data: keys.map((k) => meses[k].d), backgroundColor: '#f87171', stack: 'r', yAxisID: 'y', order: 2 },
          { type: 'line', label: 'Aproveitamento acumulado (%)', data: keys.map((k) => Math.round(cum[k] * 10) / 10), borderColor: COR_ROXO, backgroundColor: COR_ROXO, pointRadius: 4, tension: 0.3, yAxisID: 'y1', order: 1 },
        ],
      },
      options: {
        responsive: true, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: t.text } } },
        scales: {
          x: { stacked: true, ticks: { color: t.text }, grid: { color: t.grid } },
          y: { stacked: true, position: 'left', ticks: { color: t.text, precision: 0 }, grid: { color: t.grid }, title: { display: true, text: 'Jogos', color: t.text } },
          y1: { position: 'right', min: 0, max: 100, ticks: { color: t.text, callback: (v) => v + '%' }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Aproveitamento', color: t.text } },
        },
      },
    };
  }

  async function afterAproveitamento() {
    if (!D.calendario.length) return;
    await drawChart('wv-chart-aprov', 'wv-cv-aprov', chartAproveitamento());
  }

  // ───────────────────────── orquestração ─────────────────────────
  const TABS = [
    ['resumo', 'Resumo'],
    ['campeonato', '🏆 Campeonato'],
    ['orc2026', 'Orçamento 2026'],
    ['proj27', 'Projeção 2027'],
    ['reservas', 'Reservas'],
    ['aprov', 'Aproveitamento'],
  ];

  let rootEl = null;

  async function renderTab() {
    destroyCharts();
    const body = document.getElementById('wv-body');
    if (!body) return;
    document.querySelectorAll('#wv-tabs .wv-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
    switch (ui.tab) {
      case 'campeonato': body.innerHTML = tabCampeonato(); break;
      case 'orc2026': body.innerHTML = tabOrcamento('orc2026'); await afterOrcamento('orc2026'); break;
      case 'proj27': body.innerHTML = tabOrcamento('proj27'); await afterOrcamento('proj27'); break;
      case 'reservas': body.innerHTML = tabReservas(); afterReservas(); break;
      case 'aprov': body.innerHTML = tabAproveitamento(); await afterAproveitamento(); break;
      default: body.innerHTML = tabResumo(); await afterResumo();
    }
  }

  async function carregarERenderizar() {
    rootEl.innerHTML = '<div class="ini-empty">Carregando dados financeiros do Wolves…</div>';
    try {
      D = await carregarDados();
    } catch (err) {
      console.error('[wolves-financeiro] erro ao carregar', err);
      rootEl.innerHTML =
        '<div class="ini-empty">Não foi possível carregar os dados do Wolves. Verifique se a planilha está compartilhada publicamente e se os nomes das abas (Extrato/Atletas/Participação/Calendário/ConciliacaoLog) conferem.</div>';
      return;
    }
    rootEl.innerHTML = `
      <div class="wv-top">
        <div class="wv-tabs" id="wv-tabs" style="flex:1;margin:0;">
          ${TABS.map(([id, label]) => `<button class="wv-tab${id === ui.tab ? ' active' : ''}" data-tab="${id}">${label}</button>`).join('')}
        </div>
        <button class="wv-btn" id="wv-refresh" title="Recarregar da planilha">↻ Atualizar</button>
      </div>
      <div id="wv-body" style="margin-top:20px;"></div>`;
    document.getElementById('wv-tabs').addEventListener('click', (ev) => {
      const b = ev.target.closest('.wv-tab');
      if (!b) return;
      ui.tab = b.dataset.tab;
      renderTab();
    });
    document.getElementById('wv-refresh').addEventListener('click', carregarERenderizar);
    await renderTab();
  }

  window.renderWolvesFinanceiro = async function (containerEl) {
    if (!containerEl) return;
    injectStyle();
    rootEl = containerEl;
    store = loadStore();
    await carregarERenderizar();
  };
})();
