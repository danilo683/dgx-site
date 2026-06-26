// Calcula a força de um clube por setor
function calcularForca(clube) {
  const jogadores = clube.jogadores;

  const media = (posicao) => {
    const grupo = jogadores.filter(j => j.posicao === posicao);
    if (grupo.length === 0) return 50;
    return grupo.reduce((s, j) => s + j.overall, 0) / grupo.length;
  };

  const gol = media("GOL");
  const def = media("DEF");
  const mei = media("MEI");
  const atk = media("ATK");

  // Pesos: defesa vale um pouco mais (realismo)
  const forca = gol * 0.20 + def * 0.30 + mei * 0.25 + atk * 0.25;

  return { forca: Math.round(forca), gol, def, mei, atk };
}

// Gera um número de gols baseado na força de ataque vs defesa adversária
function gerarGols(ataque, defesaAdversaria) {
  const vantagem = (ataque - defesaAdversaria) / 100;
  const base = 0.5 + vantagem * 1.5;
  const rand = Math.random();

  if (rand < 0.20) return 0;
  if (rand < 0.45) return 1;
  if (rand < 0.68) return 2;
  if (rand < 0.83) return 3;
  if (rand < 0.93) return 4;
  return 5;
}

// Simula uma partida entre dois clubes
function simularPartida(clubeMandante, clubeVisitante) {
  const m = calcularForca(clubeMandante);
  const v = calcularForca(clubeVisitante);

  // Fator casa: leve vantagem pro mandante
  const golsMandante = gerarGols(m.atk + 3, v.def);
  const golsVisitante = gerarGols(v.atk, m.def + 3);

  const eventos = gerarEventos(clubeMandante, clubeVisitante, golsMandante, golsVisitante);

  return {
    mandante: clubeMandante.nome,
    visitante: clubeVisitante.nome,
    golsMandante,
    golsVisitante,
    forcaMandante: m,
    forcaVisitante: v,
    eventos
  };
}

// Gera eventos textuais da partida (gols com autor)
function gerarEventos(mandante, visitante, golsM, golsV) {
  const eventos = [];
  const minutosUsados = new Set();

  const minutoUnico = () => {
    let m;
    do { m = Math.floor(Math.random() * 90) + 1; } while (minutosUsados.has(m));
    minutosUsados.add(m);
    return m;
  };

  const atacantes = (clube) =>
    clube.jogadores.filter(j => j.posicao === "ATK" || j.posicao === "MEI");

  const marcador = (clube) => {
    const lista = atacantes(clube);
    return lista[Math.floor(Math.random() * lista.length)];
  };

  for (let i = 0; i < golsM; i++) {
    const jogador = marcador(mandante);
    eventos.push({ minuto: minutoUnico(), texto: `⚽ Gol de ${jogador.nome} (${mandante.nome})` });
  }

  for (let i = 0; i < golsV; i++) {
    const jogador = marcador(visitante);
    eventos.push({ minuto: minutoUnico(), texto: `⚽ Gol de ${jogador.nome} (${visitante.nome})` });
  }

  eventos.sort((a, b) => a.minuto - b.minuto);
  return eventos;
}

// Gera a tabela do campeonato a partir dos resultados
function calcularTabela(clubes, resultados) {
  const tabela = clubes.map(c => ({
    id: c.id,
    nome: c.nome,
    sigla: c.sigla,
    cor: c.cor,
    pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0
  }));

  const encontrar = (id) => tabela.find(t => t.id === id);

  resultados.forEach(r => {
    const m = encontrar(r.mandanteId);
    const v = encontrar(r.visitanteId);
    if (!m || !v) return;

    m.j++; v.j++;
    m.gp += r.golsMandante; m.gc += r.golsVisitante;
    v.gp += r.golsVisitante; v.gc += r.golsMandante;

    if (r.golsMandante > r.golsVisitante) {
      m.pts += 3; m.v++;
      v.d++;
    } else if (r.golsMandante < r.golsVisitante) {
      v.pts += 3; v.v++;
      m.d++;
    } else {
      m.pts++; v.pts++;
      m.e++; v.e++;
    }
  });

  tabela.forEach(t => t.sg = t.gp - t.gc);
  tabela.sort((a, b) => b.pts - a.pts || b.sg - a.sg || b.gp - a.gp);

  return tabela;
}

// Gera calendário de rodadas (todos contra todos, ida e volta)
function gerarCalendario(clubes) {
  const ids = clubes.map(c => c.id);
  const rodadas = [];
  const n = ids.length;

  // Algoritmo round-robin
  const lista = [...ids];
  if (lista.length % 2 !== 0) lista.push(null); // bye

  const totalRodadas = lista.length - 1;

  for (let r = 0; r < totalRodadas; r++) {
    const jogos = [];
    for (let i = 0; i < lista.length / 2; i++) {
      const m = lista[i];
      const v = lista[lista.length - 1 - i];
      if (m && v) jogos.push({ mandanteId: m, visitanteId: v });
    }
    rodadas.push({ numero: r + 1, jogos });
    // Rotacionar fixando o primeiro
    lista.splice(1, 0, lista.pop());
  }

  // Volta (invertendo mando de campo)
  const idaLength = rodadas.length;
  for (let r = 0; r < idaLength; r++) {
    rodadas.push({
      numero: idaLength + r + 1,
      jogos: rodadas[r].jogos.map(j => ({ mandanteId: j.visitanteId, visitanteId: j.mandanteId }))
    });
  }

  return rodadas;
}
