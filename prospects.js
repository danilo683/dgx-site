/* DGX · Área Pessoal · Prospects (funil kanban)
 * Depende do cliente Supabase `sb` criado em personal.html e da tabela `prospects` (ver prospects.sql).
 * Uso: window.renderProspects(containerEl) — chamado pelo showPage('prospects').
 */
(function () {
  const ETAPAS = [
    { id: 'prospeccao',            label: 'Prospecção' },
    { id: 'primeiro_contato',      label: 'Primeiro contato' },
    { id: 'apresentacao_agendada', label: 'Apresentação agendada' },
    { id: 'apresentado',           label: 'Apresentado' },
    { id: 'proposta_enviada',      label: 'Proposta enviada' },
    { id: 'negociacao',            label: 'Negociação' },
    { id: 'contrato',              label: 'Contrato' },
    { id: 'ganho',                 label: 'Ganho' },
    { id: 'perdido',               label: 'Perdido' },
  ];
  const ORIGENS = ['Indicação', 'Contato direto', 'LinkedIn', 'Evento', 'Outro'];

  let rows = [];
  let root = null;
  let editingId = null;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const brl = n => (n == null || n === '') ? '' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const hojeISO = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const fmtData = iso => iso ? iso.split('-').reverse().join('/') : '';

  function injectStyle() {
    if (document.getElementById('prospects-style')) return;
    const st = document.createElement('style');
    st.id = 'prospects-style';
    st.textContent = `
.pr-bar { display:flex; flex-wrap:wrap; gap:14px; align-items:center; justify-content:space-between; margin:18px 0 16px; }
.pr-kpis { display:flex; flex-wrap:wrap; gap:10px; }
.pr-kpi { background:var(--bg2); border:1px solid var(--border); border-radius:10px; padding:8px 14px; font-size:12.5px; color:var(--text2); }
.pr-kpi strong { display:block; font-size:16px; color:var(--text); font-weight:600; }
.pr-board { display:flex; gap:12px; overflow-x:auto; padding-bottom:14px; align-items:flex-start; }
.pr-col { flex:0 0 250px; background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius); min-height:140px; transition:border-color .15s, background .15s; }
.pr-col.over { border-color:var(--accent); background:var(--bg3); }
.pr-col-head { padding:12px 14px 8px; display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
.pr-col-head h3 { font-size:13px; font-weight:600; letter-spacing:.2px; }
.pr-col-head .n { font-size:11.5px; color:var(--text2); }
.pr-col-sum { padding:0 14px 8px; font-size:11.5px; color:var(--text2); min-height:18px; }
.pr-cards { padding:0 10px 10px; display:flex; flex-direction:column; gap:8px; }
.pr-card { background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:10px 12px; cursor:grab; font-size:13px; }
.pr-card:hover { border-color:var(--border2); }
.pr-card.dragging { opacity:.4; }
.pr-card h4 { font-size:14px; font-weight:600; margin-bottom:2px; }
.pr-card .sub { color:var(--text2); font-size:12px; }
.pr-card .val { color:var(--fin); font-weight:600; margin-top:4px; }
.pr-card .next { margin-top:6px; font-size:12px; color:var(--text2); }
.pr-card .next.late { color:#f87171; font-weight:600; }
.pr-card .acts { display:flex; gap:6px; margin-top:8px; }
.pr-card select { flex:1; min-width:0; font-size:12px; padding:4px 6px; background:var(--bg2); color:var(--text); border:1px solid var(--border); border-radius:7px; font-family:var(--body); }
.pr-card .acts button { padding:4px 10px; font-size:12px; }
.pr-empty { color:var(--text2); font-size:12px; padding:6px 4px; text-align:center; }
.pr-msg { background:var(--bg2); border:1px solid var(--border); border-radius:10px; padding:16px 18px; color:var(--text2); font-size:14px; margin-top:18px; }
.pr-msg.err { border-color:#7f1d1d; color:#fca5a5; }
dialog.pr-dialog { background:var(--bg2); color:var(--text); border:1px solid var(--border2); border-radius:14px; padding:22px; width:min(520px, 92vw); }
dialog.pr-dialog::backdrop { background:rgba(0,0,0,.6); }
.pr-dialog h2 { font-family:var(--display); font-size:20px; margin-bottom:14px; }
.pr-dialog label { display:block; font-size:12px; color:var(--text2); margin:10px 0 4px; }
.pr-dialog input, .pr-dialog select, .pr-dialog textarea { width:100%; font-family:var(--body); font-size:14px; background:var(--bg); color:var(--text); border:1px solid var(--border); border-radius:9px; padding:9px 12px; }
.pr-dialog textarea { min-height:80px; resize:vertical; }
.pr-dialog .row2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.pr-dialog .foot { display:flex; gap:10px; justify-content:flex-end; margin-top:18px; }
.pr-dialog .foot .del { margin-right:auto; color:#f87171; }
`;
    document.head.appendChild(st);
  }

  function shell() {
    root.innerHTML = `
      <div class="pr-bar">
        <div class="pr-kpis" id="pr-kpis"></div>
        <button class="primary" id="pr-add">+ Novo prospect</button>
      </div>
      <div id="pr-body"></div>
      <dialog class="pr-dialog" id="pr-dialog"></dialog>`;
    root.querySelector('#pr-add').addEventListener('click', () => openForm(null));
  }

  async function load() {
    const body = root.querySelector('#pr-body');
    if (typeof sb === 'undefined') {
      body.innerHTML = '<div class="pr-msg err">Cliente Supabase não encontrado nesta página.</div>';
      return;
    }
    const { data, error } = await sb.from('prospects').select('*').order('ordem', { ascending: true }).order('created_at', { ascending: true });
    if (error) {
      const faltaTabela = /relation|does not exist|schema cache/i.test(error.message || '');
      body.innerHTML = '<div class="pr-msg err">' + (faltaTabela
        ? 'A tabela <strong>prospects</strong> ainda não existe no Supabase. Rode o arquivo prospects.sql no SQL Editor e recarregue.'
        : 'Erro ao carregar prospects: ' + esc(error.message)) + '</div>';
      root.querySelector('#pr-kpis').innerHTML = '';
      return;
    }
    rows = data || [];
    render();
  }

  function render() {
    const hoje = hojeISO();
    const abertos = rows.filter(r => r.etapa !== 'ganho' && r.etapa !== 'perdido');
    const pipeline = abertos.reduce((s, r) => s + (Number(r.valor_proposta) || 0), 0);
    const ganho = rows.filter(r => r.etapa === 'ganho').reduce((s, r) => s + (Number(r.valor_proposta) || 0), 0);
    const vencidos = abertos.filter(r => r.data_proximo_passo && r.data_proximo_passo < hoje).length;
    root.querySelector('#pr-kpis').innerHTML =
      `<div class="pr-kpi"><strong>${abertos.length}</strong>em aberto</div>` +
      `<div class="pr-kpi"><strong>${brl(pipeline) || 'R$ 0'}</strong>pipeline (propostas)</div>` +
      `<div class="pr-kpi"><strong>${brl(ganho) || 'R$ 0'}</strong>ganho</div>` +
      (vencidos ? `<div class="pr-kpi"><strong style="color:#f87171">${vencidos}</strong>próximo passo vencido</div>` : '');

    const body = root.querySelector('#pr-body');
    body.innerHTML = '<div class="pr-board">' + ETAPAS.map(et => {
      const lista = rows.filter(r => r.etapa === et.id);
      const soma = lista.reduce((s, r) => s + (Number(r.valor_proposta) || 0), 0);
      return `<div class="pr-col" data-etapa="${et.id}">
        <div class="pr-col-head"><h3>${esc(et.label)}</h3><span class="n">${lista.length}</span></div>
        <div class="pr-col-sum">${soma ? brl(soma) : ''}</div>
        <div class="pr-cards">${lista.length ? lista.map(card).join('') : '<div class="pr-empty">—</div>'}</div>
      </div>`;
    }).join('') + '</div>';

    body.querySelectorAll('.pr-card').forEach(el => {
      el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', el.dataset.id); el.classList.add('dragging'); });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.querySelector('[data-edit]').addEventListener('click', () => openForm(el.dataset.id));
      el.querySelector('select').addEventListener('change', e => moverPara(el.dataset.id, e.target.value));
    });
    body.querySelectorAll('.pr-col').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', () => col.classList.remove('over'));
      col.addEventListener('drop', e => {
        e.preventDefault(); col.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        if (id) moverPara(id, col.dataset.etapa);
      });
    });
  }

  function card(r) {
    const fechado = r.etapa === 'ganho' || r.etapa === 'perdido';
    const atrasado = !fechado && r.data_proximo_passo && r.data_proximo_passo < hojeISO();
    const sub = [r.contato, r.uf].filter(Boolean).map(esc).join(' · ');
    const next = (r.proximo_passo || r.data_proximo_passo)
      ? `<div class="next${atrasado ? ' late' : ''}">${r.data_proximo_passo ? fmtData(r.data_proximo_passo) + ' · ' : ''}${esc(r.proximo_passo || '')}</div>` : '';
    return `<div class="pr-card" draggable="true" data-id="${esc(r.id)}">
      <h4>${esc(r.empresa)}</h4>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
      ${r.valor_proposta != null ? `<div class="val">${brl(r.valor_proposta)}</div>` : ''}
      ${next}
      <div class="acts">
        <select aria-label="Etapa">${ETAPAS.map(et => `<option value="${et.id}"${et.id === r.etapa ? ' selected' : ''}>${esc(et.label)}</option>`).join('')}</select>
        <button data-edit>Editar</button>
      </div>
    </div>`;
  }

  async function moverPara(id, etapa) {
    const r = rows.find(x => String(x.id) === String(id));
    if (!r || r.etapa === etapa) { render(); return; }
    const anterior = r.etapa;
    r.etapa = etapa;
    render();
    const { error } = await sb.from('prospects').update({ etapa }).eq('id', id);
    if (error) { r.etapa = anterior; render(); alert('Não consegui mover: ' + error.message); }
  }

  function openForm(id) {
    editingId = id;
    const r = id ? rows.find(x => String(x.id) === String(id)) : {};
    const dlg = root.querySelector('#pr-dialog');
    dlg.innerHTML = `
      <form method="dialog" id="pr-form">
        <h2>${id ? 'Editar prospect' : 'Novo prospect'}</h2>
        <label>Empresa *</label>
        <input name="empresa" required value="${esc(r.empresa)}">
        <div class="row2">
          <div><label>Contato</label><input name="contato" value="${esc(r.contato)}"></div>
          <div><label>UF / operações</label><input name="uf" value="${esc(r.uf)}" placeholder="ex.: PR e SC"></div>
        </div>
        <div class="row2">
          <div><label>Etapa</label><select name="etapa">${ETAPAS.map(et => `<option value="${et.id}"${et.id === (r.etapa || 'prospeccao') ? ' selected' : ''}>${esc(et.label)}</option>`).join('')}</select></div>
          <div><label>Origem</label><select name="origem"><option value=""></option>${ORIGENS.map(o => `<option${o === r.origem ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
        </div>
        <label>Valor da proposta (R$)</label>
        <input name="valor_proposta" type="number" step="0.01" min="0" value="${r.valor_proposta == null ? '' : esc(r.valor_proposta)}">
        <div class="row2">
          <div><label>Próximo passo</label><input name="proximo_passo" value="${esc(r.proximo_passo)}"></div>
          <div><label>Data do próximo passo</label><input name="data_proximo_passo" type="date" value="${esc(r.data_proximo_passo)}"></div>
        </div>
        <label>Observações</label>
        <textarea name="observacoes">${esc(r.observacoes)}</textarea>
        <div class="foot">
          ${id ? '<button type="button" class="del" id="pr-del">Excluir</button>' : ''}
          <button type="button" id="pr-cancel">Cancelar</button>
          <button type="submit" class="primary">Salvar</button>
        </div>
      </form>`;
    dlg.querySelector('#pr-cancel').addEventListener('click', () => dlg.close());
    if (id) dlg.querySelector('#pr-del').addEventListener('click', () => excluir(id, dlg));
    dlg.querySelector('#pr-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const v = k => (f.get(k) || '').toString().trim();
      const payload = {
        empresa: v('empresa'),
        contato: v('contato') || null,
        uf: v('uf') || null,
        etapa: v('etapa') || 'prospeccao',
        origem: v('origem') || null,
        valor_proposta: v('valor_proposta') === '' ? null : Number(v('valor_proposta')),
        proximo_passo: v('proximo_passo') || null,
        data_proximo_passo: v('data_proximo_passo') || null,
        observacoes: v('observacoes') || null,
      };
      if (!payload.empresa) return;
      const q = editingId ? sb.from('prospects').update(payload).eq('id', editingId) : sb.from('prospects').insert(payload);
      const { error } = await q;
      if (error) { alert('Não consegui salvar: ' + error.message); return; }
      dlg.close();
      load();
    });
    dlg.showModal();
  }

  async function excluir(id, dlg) {
    const r = rows.find(x => String(x.id) === String(id));
    if (!confirm('Excluir "' + (r ? r.empresa : 'este prospect') + '"? Isso não pode ser desfeito.')) return;
    const { error } = await sb.from('prospects').delete().eq('id', id);
    if (error) { alert('Não consegui excluir: ' + error.message); return; }
    dlg.close();
    load();
  }

  window.renderProspects = function (container) {
    injectStyle();
    root = container;
    shell();
    load();
  };
})();
