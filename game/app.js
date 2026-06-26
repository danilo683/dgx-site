// ── Estado global ──
const estado = {
  meuClube: null,
  rodadaAtual: 0,
  resultados: [],
  calendario: []
};

// ── Inicialização ──
document.addEventListener("DOMContentLoaded", () => {
  renderSelecaoClube();
});

// ── Tela de seleção de clube ──
function renderSelecaoClube() {
  document.getElementById("header-info").classList.add("hidden");
  document.getElementById("nav").classList.add("hidden");

  const main = document.getElementById("main");
  main.innerHTML = `
    <div id="tela-selecao">
      <h2>Escolha seu clube</h2>
      <p>Você será o manager. Escolha com sabedoria.</p>
      <div class="grid-clubes">
        ${CLUBES.map(c => {
          const { forca } = calcularForca(c);
          return `
            <div class="card-clube" onclick="selecionarClube('${c.id}')">
              <div class="escudo" style="background:${c.cor}">${c.sigla}</div>
              <div class="nome">${c.nome}</div>
              <div class="forca">Força geral: <strong>${forca}</strong></div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function selecionarClube(id) {
  estado.meuClube = CLUBES.find(c => c.id === id);
  estado.calendario = gerarCalendario(CLUBES);
  estado.rodadaAtual = 0;
  estado.resultados = [];

  document.getElementById("header-clube").textContent = estado.meuClube.nome;
  document.getElementById("header-info").classList.remove("hidden");
  document.getElementById("nav").classList.remove("hidden");

  navegarPara("campeonato");
}

// ── Navegação ──
function navegarPara(aba) {
  document.querySelectorAll("nav button").forEach(b => b.classList.remove("ativo"));
  document.querySelector(`nav button[data-aba="${aba}"]`).classList.add("ativo");

  const renders = {
    campeonato: renderCampeonato,
    tabela: renderTabela,
    elenco: renderElenco,
  };

  renders[aba]?.();
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("nav button[data-aba]").forEach(btn => {
    btn.addEventListener("click", () => navegarPara(btn.dataset.aba));
  });
});

// ── Aba: Elenco ──
function renderElenco() {
  const clube = estado.meuClube;
  const { forca, gol, def, mei, atk } = calcularForca(clube);

  const ordemPos = { GOL: 0, DEF: 1, MEI: 2, ATK: 3 };
  const jogadores = [...clube.jogadores].sort((a, b) =>
    ordemPos[a.posicao] - ordemPos[b.posicao] || b.overall - a.overall
  );

  document.getElementById("main").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-valor">${forca}</div><div class="stat-label">Força geral</div></div>
      <div class="stat-card"><div class="stat-valor">${Math.round(gol)}</div><div class="stat-label">Goleiros</div></div>
      <div class="stat-card"><div class="stat-valor">${Math.round(def)}</div><div class="stat-label">Defensores</div></div>
      <div class="stat-card"><div class="stat-valor">${Math.round(mei)}</div><div class="stat-label">Meias</div></div>
      <div class="stat-card"><div class="stat-valor">${Math.round(atk)}</div><div class="stat-label">Atacantes</div></div>
    </div>

    <p class="secao-titulo">Elenco — ${clube.nome}</p>
    <div class="lista-jogadores">
      ${jogadores.map(j => `
        <div class="item-jogador">
          <span class="posicao-badge pos-${j.posicao}">${j.posicao}</span>
          <span class="jogador-nome">${j.nome}</span>
          <span class="overall-badge ${overallClasse(j.overall)}">${j.overall}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function overallClasse(v) {
  if (v >= 80) return "overall-alto";
  if (v >= 70) return "overall-medio";
  return "overall-baixo";
}

// ── Aba: Campeonato ──
function renderCampeonato() {
  const rodadas = estado.calendario;
  const meuId = estado.meuClube.id;

  document.getElementById("main").innerHTML = `
    <p class="secao-titulo">Brasileirão — Todas as rodadas</p>
    <div class="rodadas-container">
      ${rodadas.map((rodada, idx) => {
        const simulada = idx < estado.rodadaAtual;
        const proxima = idx === estado.rodadaAtual;

        return `
          <div class="card-rodada" id="rodada-${idx}">
            <div class="rodada-header">
              <span>Rodada ${rodada.numero}</span>
              ${proxima ? `<button class="btn-simular" onclick="simularRodada(${idx})">Simular rodada</button>` : ""}
              ${simulada ? `<span style="color:var(--green);font-size:12px">✓ Encerrada</span>` : ""}
            </div>
            <div class="lista-jogos">
              ${rodada.jogos.map(jogo => {
                const resultado = estado.resultados.find(
                  r => r.rodada === idx && r.mandanteId === jogo.mandanteId && r.visitanteId === jogo.visitanteId
                );
                const mandante = CLUBES.find(c => c.id === jogo.mandanteId);
                const visitante = CLUBES.find(c => c.id === jogo.visitanteId);
                const ehMeu = jogo.mandanteId === meuId || jogo.visitanteId === meuId;

                let placarHTML = `<span class="placar pendente">vs</span>`;
                if (resultado) {
                  const classeP = placarClasse(resultado, meuId);
                  placarHTML = `
                    <span class="placar ${classeP}" 
                      onclick="abrirModal(${JSON.stringify(resultado).replace(/"/g, '&quot;')})"
                      style="cursor:pointer" title="Ver detalhes">
                      ${resultado.golsMandante} – ${resultado.golsVisitante}
                    </span>
                  `;
                }

                return `
                  <div class="item-jogo">
                    <span class="time-nome ${jogo.mandanteId === meuId ? 'meu' : ''}">${mandante.nome}</span>
                    ${placarHTML}
                    <span class="time-nome direita ${jogo.visitanteId === meuId ? 'meu' : ''}">${visitante.nome}</span>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function placarClasse(resultado, meuId) {
  if (resultado.mandanteId !== meuId && resultado.visitanteId !== meuId) return "";
  const euSouMandante = resultado.mandanteId === meuId;
  const meusGols = euSouMandante ? resultado.golsMandante : resultado.golsVisitante;
  const delesGols = euSouMandante ? resultado.golsVisitante : resultado.golsMandante;
  if (meusGols > delesGols) return "vitoria";
  if (meusGols < delesGols) return "derrota";
  return "empate";
}

function simularRodada(idx) {
  const rodada = estado.calendario[idx];

  rodada.jogos.forEach(jogo => {
    const mandante = CLUBES.find(c => c.id === jogo.mandanteId);
    const visitante = CLUBES.find(c => c.id === jogo.visitanteId);
    const resultado = simularPartida(mandante, visitante);

    estado.resultados.push({
      rodada: idx,
      mandanteId: jogo.mandanteId,
      visitanteId: jogo.visitanteId,
      golsMandante: resultado.golsMandante,
      golsVisitante: resultado.golsVisitante,
      eventos: resultado.eventos
    });
  });

  estado.rodadaAtual = idx + 1;
  renderCampeonato();

  // Scroll suave para próxima rodada
  const proxima = document.getElementById(`rodada-${idx + 1}`);
  if (proxima) proxima.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Aba: Tabela ──
function renderTabela() {
  const tabela = calcularTabela(CLUBES, estado.resultados);
  const meuId = estado.meuClube.id;

  document.getElementById("main").innerHTML = `
    <p class="secao-titulo">Classificação — Brasileirão</p>
    <div class="tabela-classificacao">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Clube</th>
            <th>Pts</th>
            <th>J</th>
            <th>V</th>
            <th>E</th>
            <th>D</th>
            <th>GP</th>
            <th>GC</th>
            <th>SG</th>
          </tr>
        </thead>
        <tbody>
          ${tabela.map((t, i) => `
            <tr class="${t.id === meuId ? 'meu-clube' : ''}">
              <td class="td-pos">${i + 1}</td>
              <td>
                <span class="escudo-mini" style="background:${t.cor}">${t.sigla}</span>
                ${t.nome}
              </td>
              <td class="td-pts">${t.pts}</td>
              <td>${t.j}</td>
              <td>${t.v}</td>
              <td>${t.e}</td>
              <td>${t.d}</td>
              <td>${t.gp}</td>
              <td>${t.gc}</td>
              <td>${t.sg > 0 ? '+' + t.sg : t.sg}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ── Modal de detalhes da partida ──
function abrirModal(resultado) {
  const mandante = CLUBES.find(c => c.id === resultado.mandanteId);
  const visitante = CLUBES.find(c => c.id === resultado.visitanteId);

  const corPlacar = resultado.golsMandante !== resultado.golsVisitante
    ? (resultado.golsMandante > resultado.golsVisitante ? "var(--green)" : "var(--red)")
    : "var(--yellow)";

  const eventosHTML = resultado.eventos.length > 0
    ? resultado.eventos.map(e => `
        <div class="evento-item">
          <span class="evento-minuto">${e.minuto}'</span>
          <span>${e.texto}</span>
        </div>
      `).join("")
    : `<p style="color:var(--text2);font-size:13px">Jogo sem gols.</p>`;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px">Resultado final</div>
        <div class="modal-placar" style="color:${corPlacar}">
          ${resultado.golsMandante} – ${resultado.golsVisitante}
        </div>
      </div>
      <div class="modal-times">
        <span>${mandante.nome}</span>
        <span>${visitante.nome}</span>
      </div>
      <div class="modal-eventos">${eventosHTML}</div>
      <div class="modal-footer">
        <button class="btn-fechar" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
      </div>
    </div>
  `;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}
