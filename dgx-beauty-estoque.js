/* DGX Beauty — Estoque e Sugestão de Pedido.
   Código de cálculo e de tela copiado da página Estoque da Hawks (hawks.html), para as duas páginas ficarem iguais.
   Diferença: aqui o estoque, as campanhas e os parâmetros são FICTÍCIOS e gerados no navegador a partir de
   FV_HAWKS (vendas fictícias da Beauty). Nada é lido nem gravado no Supabase; importação de arquivos,
   de-para e campanhas ficam desligados nesta versão de demonstração. */
var PED_DIAS_MES = 30.4375;
var PED_PARAM_PADRAO = {
  janela_meses: 24,          // histórico considerado
  peso_u6m: 0.5, peso_7a12m: 0.3, peso_13a24m: 0.2,   // média ponderada (renormaliza se faltar janela)
  lead_time: 21,             // dias (a validar com a Hawks)
  doh_alvo: 45,              // dias de cobertura após a chegada (A DEFINIR com a Hawks)
  ciclo_compra: 15,          // dias entre pedidos (quinzenal) — entra no estoque de segurança
  servico_a: 98, servico_b: 95, servico_c: 90,         // nível de serviço (%) por curva
  corte_a: 80, corte_b: 95,  // ABC por unidades (% acumulado)
  cv_x: 0.5, cv_y: 1.0, freq_z: 0.5,                   // XYZ (CV) e frequência mínima p/ não ser Z
  excesso_mult: 2,           // excesso = cobertura > mult × DOH alvo
  sem_giro_dias: 90,         // sem venda há X dias com estoque
  meses_novo: 6,             // produto novo = 1ª venda há <= X meses (após histórico sem venda)
  meses_ativo: 12,           // SKU sem venda há mais de X meses e sem estoque = inativo
  qtd_minima_novo: 0,        // piso de pedido para produto novo (franqueado pode editar linha a linha)
  lote_minimo: 1,            // múltiplo de arredondamento (pendente: lote/caixa por fornecedor)
  usar_sazonalidade: 0,      // 1 = aplica índice sazonal por SKU (suavizado)
  estoque_ausente_zero: 0,   // SKU com venda sem posição no estoque: 0 = não sugere (revisar de-para); 1 = trata como estoque 0
  fornecedores_truss: 'VEGAN,CALAMO',  // só estes fornecedores entram no pedido (fábrica antiga e nova da TRUSS)
  limite_risco: 10,          // % de risco de ruptura até a chegada do pedido a partir do qual a tabela destaca o SKU
  campanha_base: 1,          // 1 = a demanda de base ignora os meses de campanha importados (precisa de 3+ meses sem campanha)
  lift_10: 1, lift_15: 1, lift_20: 1,   // efeito padrão da campanha por desconto (1 = neutro). O histórico calibra por SKU quando há 2+ meses de campanha
  dias_faturamento: 5,       // dias entre entrada do pedido e faturamento (exemplo; a validar)
  mes_ref: '',               // 'YYYY-MM' p/ forçar o último mês fechado; vazio = automático
  feriados_extra: ''         // datas AAAA-MM-DD separadas por vírgula (feriados estaduais etc.)
};
var PED_FERIADOS_NAC = ['2026-01-01','2026-04-03','2026-04-21','2026-05-01','2026-09-07','2026-10-12',
  '2026-11-02','2026-11-15','2026-11-20','2026-12-25','2027-01-01','2027-03-26','2027-04-21','2027-05-01',
  '2027-09-07','2027-10-12','2027-11-02','2027-11-15','2027-11-20','2027-12-25'];

/* ── utilidades ── */
function pedSemAcento(s){ return (s==null?'':String(s)).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(); }
function pedNormSku(s){ return pedSemAcento(s).replace(/^0+(?=.)/,''); }
function pedCategoriaLabel(g){
  var s = pedSemAcento(g);
  if (!s) return 'Outros';
  if (s.indexOf('HOME') >= 0) return 'Home Care';
  if (s.indexOf('COLORA') >= 0) return 'Colora\u00e7\u00e3o';
  if (s.indexOf('PROFISSIONAL') >= 0) return 'Profissional';
  if (s.indexOf('QUIMIC') >= 0) return 'Qu\u00edmica';
  return String(g).trim();
}
function pedZ(p){ // inversa da normal (Abramowitz-Stegun 26.2.23), p > 0,5
  if (p <= 0.5) return 0; if (p >= 0.9999) p = 0.9999;
  var t = Math.sqrt(-2*Math.log(1-p));
  return t - (2.515517 + 0.802853*t + 0.010328*t*t) / (1 + 1.432788*t + 0.189269*t*t + 0.001308*t*t*t);
}
function pedPhi(x){ // distribuição normal acumulada (Abramowitz-Stegun 26.2.17)
  var t = 1/(1+0.2316419*Math.abs(x)), d = 0.3989423*Math.exp(-x*x/2);
  var p = d*t*(0.3193815 + t*(-0.3565638 + t*(1.781478 + t*(-1.821256 + t*1.330274))));
  return x>0 ? 1-p : p;
}
function pedYMD(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function pedParseYMD(s){ var p=String(s).split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function pedAddDias(d,n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()+n); }
function pedFmtBR(d){ return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); }
function pedFmtBRc(d){ return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'); }
function pedMesKey(c){ return String(c).slice(0,7); }
function pedMesMais(key,n){ var y=+key.slice(0,4), m=+key.slice(5,7)-1+n; y+=Math.floor(m/12); m=((m%12)+12)%12; return y+'-'+String(m+1).padStart(2,'0'); }
function pedMesesLista(fim,n){ var a=[]; for(var i=n-1;i>=0;i--) a.push(pedMesMais(fim,-i)); return a; }
function pedMedia(a){ return a.length ? a.reduce(function(x,y){return x+y;},0)/a.length : 0; }
function pedDesvio(a){ if(a.length<2) return 0; var m=pedMedia(a); return Math.sqrt(a.reduce(function(s,v){return s+(v-m)*(v-m);},0)/(a.length-1)); }

/* ── calendário de compras (quinzenas) ── */
function pedFeriadosSet(extra){
  var set = {}; PED_FERIADOS_NAC.forEach(function(k){ set[k]=true; });
  String(extra||'').split(/[,; \n]+/).forEach(function(k){ if(/^\d{4}-\d{2}-\d{2}$/.test(k)) set[k]=true; });
  return set;
}
function pedEhUtil(d,set){ var w=d.getDay(); return w>=1 && w<=5 && !set[pedYMD(d)]; }
function pedQuinzena(d){
  var q = d.getDate()<=15 ? 1 : 2, y=d.getFullYear(), m=d.getMonth();
  return { q:q, inicio:new Date(y,m,q===1?1:16), fim: q===1 ? new Date(y,m,15) : new Date(y,m+1,0) };
}
function pedJanela(base,set){ // quinzena que contém "base"
  var qz = pedQuinzena(base);
  var ult = qz.fim; while(!pedEhUtil(ult,set) && ult>=qz.inicio) ult = pedAddDias(ult,-1);
  var rec = pedAddDias(ult,-1); while(!pedEhUtil(rec,set) && rec>=qz.inicio) rec = pedAddDias(rec,-1);
  if (rec < qz.inicio) rec = ult;
  return { q:qz.q, inicio:qz.inicio, fim:qz.fim, ultimoUtil:ult, recomendada:rec,
           prazos: qz.q===1 ? [45,75,105,135] : [30,60,90,120] };
}
function pedProximaQuinzenaInicio(d){ var qz=pedQuinzena(d); return pedAddDias(qz.fim,1); }
function pedDiasUteisEntre(de,ate,set){ // dias úteis em (de, ate]
  var n=0, d=pedAddDias(de,1); while(d<=ate){ if(pedEhUtil(d,set)) n++; d=pedAddDias(d,1); } return n;
}
function pedSituacao(hoje,set){
  var h = new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());
  var j = pedJanela(h,set), cor, rotulo, alvo, fechada=false;
  if (+h===+j.recomendada)      { cor='verde';    rotulo='Hoje \u00e9 a data ideal de pedido'; alvo=h; }
  else if (+h===+j.ultimoUtil)  { cor='laranja';  rotulo='\u00daltimo dia \u00fatil da quinzena (reserva)'; alvo=h; }
  else if (h < j.ultimoUtil)    { cor='amarelo';  rotulo='Aguardar a data ideal'; alvo=j.recomendada>h ? j.recomendada : j.ultimoUtil; }
  else { // depois do último dia útil (fim de semana/feriado no fim da quinzena)
    cor='vermelho'; rotulo='Janela fechada \u2014 pr\u00f3xima quinzena'; fechada=true;
    alvo = pedJanela(pedProximaQuinzenaInicio(h),set).recomendada;
  }
  return { hoje:h, janela:j, cor:cor, rotulo:rotulo, dataAlvo:alvo, fechada:fechada,
           diasAteAlvo: Math.round((alvo-h)/86400000),
           diasUteisAteAlvo: alvo>h ? pedDiasUteisEntre(h,alvo,set) : 0 };
}
function pedCenarioPrazo(dataPedido,diasFat){
  var q = dataPedido.getDate()<=15 ? 1 : 2, prazos = q===1 ? [45,75,105,135] : [30,60,90,120];
  var fat = pedAddDias(dataPedido,diasFat);
  return { q:q, prazos:prazos, faturamento:fat, prazoMedio:pedMedia(prazos),
           parcelas: prazos.map(function(p){ return { dias:p, data:pedAddDias(fat,p) }; }) };
}
function pedProximasJanelas(hoje,set,n){
  var out=[], base=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());
  for (var i=0;i<n;i++){ var j=pedJanela(base,set); out.push(j); base=pedProximaQuinzenaInicio(base); }
  return out;
}

/* ── séries de venda por SKU (vendas − devoluções) ── */
function pedConstruirSerie(rows,alias){
  alias = alias || {};
  var serie={}, minKey=null, maxKey=null;
  (rows||[]).forEach(function(r){
    if (!r.sku || !r.competencia) return;
    var t = pedSemAcento(r.tipo_operacao), sinal;
    if (t==='VENDA') sinal=1; else if (t.indexOf('DEVOL')===0 && t.indexOf('COMPRA')<0) sinal=-1; else return;   // fora: bonificação e devolução de COMPRA
    var k = pedNormSku(r.sku); if (alias[k]) k = alias[k]; var mk = pedMesKey(r.competencia);
    var q = sinal>0 ? (parseFloat(r.qtd)||0) : -Math.abs(parseFloat(r.qtd)||0);
    var s = serie[k] || (serie[k] = { sku:k, skuOrig:r.sku, produto:'', grupo:'', m:{}, cmv:{}, qv:{} });
    if (r.produto && (sinal>0 || !s.produto)) s.produto = r.produto;
    if (r.grupo && (sinal>0 || !s.grupo)) s.grupo = r.grupo;
    s.m[mk] = (s.m[mk]||0) + q;
    if (sinal>0){ s.cmv[mk]=(s.cmv[mk]||0)+(parseFloat(r.cmv_total)||0); s.qv[mk]=(s.qv[mk]||0)+(parseFloat(r.qtd)||0); }
    if (!minKey || mk<minKey) minKey=mk; if (!maxKey || mk>maxKey) maxKey=mk;
  });
  return { serie:serie, minKey:minKey, maxKey:maxKey };
}
function pedMesRef(maxKey,hoje,P){
  if (/^\d{4}-\d{2}$/.test(P.mes_ref)) return P.mes_ref;
  var atual = hoje.getFullYear()+'-'+String(hoje.getMonth()+1).padStart(2,'0');
  return maxKey===atual ? pedMesMais(maxKey,-1) : maxKey;   // mês corrente é parcial
}

/* ── métricas de demanda de um SKU ── */
function pedMetricasSku(s,meses,minKey,P,campSet){
  var n = meses.length;
  var vals = meses.map(function(k){ return Math.max(0, s.m[k]||0); });
  var ini0 = 0; while (ini0<n && meses[ini0]<minKey) ini0++;                 // 1º mês com dado possível
  var first = -1; for (var i=0;i<n;i++){ if ((s.m[meses[i]]||0)>0){ first=i; break; } }
  var antes = Object.keys(s.m).some(function(k){ return k<meses[0] && s.m[k]>0; });
  var novo = first>=0 && !antes && (n-first)<=P.meses_novo && (first-ini0)>=P.meses_novo;
  var ini = novo ? first : ini0;
  var obs = vals.slice(ini);
  var emCamp = meses.map(function(k){ return !!(campSet && campSet[k]); });
  var nBase = 0; for (var b0=ini;b0<n;b0++){ if (!emCamp[b0]) nBase++; }
  var nCamp = (n-ini) - nBase;
  var filtrar = !!(P.campanha_base && nCamp>0 && nBase>=3);                  // demanda de base: sem os meses de campanha
  function pega(a,b){ var out=[]; for (var q=a;q<=b;q++){ if (q<ini || q>=n) continue; if (filtrar && emCamp[q]) continue; out.push(vals[q]); } return out; }
  var jan = [ [n-6,n-1,P.peso_u6m], [n-12,n-7,P.peso_7a12m], [n-24,n-13,P.peso_13a24m] ];
  var medias = jan.map(function(w){ var arr = pega(w[0],w[1]); return arr.length ? pedMedia(arr) : null; });
  var num=0, den=0;
  medias.forEach(function(m,ix){ if (m!==null){ num+=m*jan[ix][2]; den+=jan[ix][2]; } });
  var mediaPond = den>0 ? num/den : 0;
  var total = vals.reduce(function(x,y){return x+y;},0);
  var mesesVenda = obs.filter(function(v){return v>0;}).length;
  var obsBase = filtrar ? pega(ini,n-1) : obs;
  var media = pedMedia(obsBase), desvio = obsBase.length>=3 ? pedDesvio(obsBase) : media;   // poucos meses: assume CV = 1
  var ult=-1; for (var j=n-1;j>=0;j--){ if (vals[j]>0){ ult=j; break; } }
  var campV = [], baseV = []; for (var q2=ini;q2<n;q2++){ (emCamp[q2] ? campV : baseV).push(vals[q2]); }
  var mb = pedMedia(baseV), lift = null;
  if (campV.length>=2 && baseV.length>=3 && mb>0) lift = Math.max(0.5, Math.min(5, pedMedia(campV)/mb));   // efeito medido no próprio SKU
  var somaCamp = campV.reduce(function(x,y){return x+y;},0);
  var seas = null;
  if (P.usar_sazonalidade && media>0){                                         // índice por mês do calendário, suavizado
    seas = {};
    for (var c=1;c<=12;c++){
      var cv=[]; for (var q=ini;q<n;q++){ if (+meses[q].slice(5,7)===c) cv.push(vals[q]); }
      var idx=1; if (cv.length>=2){ idx = 1 + 0.5*(pedMedia(cv)/media - 1); idx = Math.max(0.7, Math.min(1.3, idx)); }
      seas[c]=idx;
    }
  }
  return { vals:vals, mediaPond:mediaPond, u6:medias[0], m7a12:medias[1], m13a24:medias[2],
    tendencia: (medias[0]!==null && medias[1]!==null && medias[1]>0) ? medias[0]/medias[1]-1 : null,
    total:total, mesesObs:obs.length, mesesVenda:mesesVenda, freq: obs.length ? mesesVenda/obs.length : 0,
    media:media, desvio:desvio, cv: media>0 ? desvio/media : null, novo:novo,
    mesesSemVenda: ult<0 ? null : n-1-ult, vendas12m: vals.slice(Math.max(0,n-P.meses_ativo)).reduce(function(x,y){return x+y;},0),
    seas:seas, campMeses:nCamp, baseAplicada:filtrar, lift:lift, depCamp: total>0 ? somaCamp/total : null };
}
function pedFatorSazonal(seas,dataIni,dias){
  if (!seas) return 1; var t=0, cnt=Math.max(1,Math.round(dias));
  for (var i=0;i<cnt;i++){ t += seas[pedAddDias(dataIni,i).getMonth()+1]; }
  return t/cnt;
}
function pedCustoUnit(s,meses){
  function calc(ms){ var c=0,q=0; ms.forEach(function(k){ c+=s.cmv[k]||0; q+=s.qv[k]||0; }); return q>0 ? c/q : null; }
  return calc(meses.slice(-3)) || calc(meses);
}

/* fornecedor TRUSS? Com fornecedor preenchido: pelo nome (Vegan/Calamo). Em branco: só se o nome do produto tiver TRUSS.
   forn === null/undefined = linha antiga sem a coluna (não bloqueia). */
function pedEhTruss(forn, produto, lista){
  if (forn===null || forn===undefined) return true;
  var f = pedSemAcento(forn);
  if (!f) return pedSemAcento(produto).indexOf('TRUSS')>=0;
  return lista.some(function(t){ return f.indexOf(t)>=0; });
}

/* ── cálculo principal ── */
function pedCalcular(fvRows, estRows, P, hoje, alias, camp, fatores){
  hoje = hoje || new Date();
  var fer = pedFeriadosSet(P.feriados_extra);
  var sit = pedSituacao(hoje, fer);
  var base = pedConstruirSerie(fvRows, alias);
  var res = { P:P, sit:sit, feriados:fer, skus:[], kpis:{}, avisos:[], serieTotal:null };
  if (!base.maxKey){ res.avisos.push('Sem vendas no hist\u00f3rico (fato_vendas).'); return res; }
  var ref = pedMesRef(base.maxKey,hoje,P);
  var meses = pedMesesLista(ref, P.janela_meses);
  res.mesRef = ref; res.meses = meses; res.minKey = base.minKey; res.maxKey = base.maxKey;
  res.mesesComDado = meses.filter(function(k){return k>=base.minKey;}).length;
  var esperado = pedMesMais(hoje.getFullYear()+'-'+String(hoje.getMonth()+1).padStart(2,'0'),-1);
  if (ref < esperado) res.avisos.push('Último mês de vendas carregado: '+ref.slice(5,7)+'/'+ref.slice(0,4)+' — faltam meses recentes; a demanda pode estar defasada. Atualize fato_vendas.');
  if (res.mesesComDado < P.janela_meses) res.avisos.push('Hist\u00f3rico de vendas tem '+res.mesesComDado+' meses (janela configurada: '+P.janela_meses+'). A m\u00e9dia usa s\u00f3 os meses dispon\u00edveis.');

  var temEst = !!(estRows && estRows.length), estMap = {};
  (estRows||[]).forEach(function(r){
    var k=pedNormSku(r.sku); if(!k) return;
    estMap[k] = { qtd:parseFloat(r.qtd)||0, transito:parseFloat(r.qtd_transito)||0, produto:r.produto, categoria:r.categoria, skuOrig:(r.codigo_produto||r.sku),
      fornecedor:((r.fornecedor===null||r.fornecedor===undefined)?null:String(r.fornecedor)), status:String(r.status||'A').toUpperCase() };
  });
  var chaves = {}; Object.keys(base.serie).forEach(function(k){chaves[k]=1;}); Object.keys(estMap).forEach(function(k){chaves[k]=1;});
  var vazio = { m:{}, cmv:{}, qv:{}, produto:'', grupo:'' };
  var Dideal = sit.diasAteAlvo, dataAlvo = sit.dataAlvo;
  var lista = [], semPosicao = 0, estoqueSemVenda = 0;
  var trussList = String(P.fornecedores_truss||'').split(/[,;]+/).map(function(t){ return pedSemAcento(t); }).filter(Boolean);

  Object.keys(chaves).forEach(function(k){
    var s = base.serie[k] || vazio, e = estMap[k];
    var m = pedMetricasSku(s, meses, base.minKey, P, camp ? camp[k] : null);
    var est = temEst ? (e ? e.qtd : (P.estoque_ausente_zero ? 0 : null)) : null;
    var transito = e ? e.transito : 0;
    if (temEst && !e && base.serie[k]) semPosicao++;
    if (e && !base.serie[k]) estoqueSemVenda++;
    var ativo = m.vendas12m>0 || (est!==null && est>0);
    if (!ativo) return;
    var forn = e ? e.fornecedor : null;
    var truss = pedEhTruss(forn, (e&&e.produto)||s.produto||k, trussList);
    lista.push({ sku:k, skuOrig:(e&&e.skuOrig)||(base.serie[k]&&base.serie[k].skuOrig)||k, serie:s, m:m, est:est, transito:transito,
      produto:((e&&e.produto) || s.produto || k), categoria:pedCategoriaLabel(s.grupo || (e&&e.categoria)), semPosicao: temEst && !e,
      fornecedor:(forn||''), truss:truss, inativo:!!(e && e.status!=='A'), statusCad:(e?e.status:''), semVenda:!base.serie[k] });
  });

  /* ABC por unidades (histórico da janela) */
  var porVenda = lista.filter(function(x){return x.m.total>0;}).sort(function(a,b){return b.m.total-a.m.total;});
  var totGeral = porVenda.reduce(function(a,x){return a+x.m.total;},0), acum=0;
  porVenda.forEach(function(x){
    x.curva = acum/totGeral*100 < P.corte_a ? 'A' : (acum/totGeral*100 < P.corte_b ? 'B' : 'C');
    acum += x.m.total; x.acumPct = acum/totGeral*100;
  });
  lista.forEach(function(x){ if(!x.curva){ x.curva='C'; x.acumPct=100; } });

  /* XYZ + reposição */
  var cobRaw = [];
  lista.forEach(function(x){
    var m=x.m;
    x.xyz = (m.total<=0 || m.novo) ? '\u2014' : (m.freq<P.freq_z ? 'Z' : (m.cv<=P.cv_x ? 'X' : (m.cv<=P.cv_y ? 'Y' : 'Z')));
    var servico = (x.curva==='A'?P.servico_a:(x.curva==='B'?P.servico_b:P.servico_c))/100, z = pedZ(servico);
    var dDia = m.mediaPond/PED_DIAS_MES;
    x.dDia = dDia;
    x.ss = Math.ceil(z * (m.desvio/Math.sqrt(PED_DIAS_MES)) * Math.sqrt(Math.max(1,P.lead_time+P.ciclo_compra)));
    if (dDia<=0) x.ss = 0;
    var pos = (x.est===null) ? null : x.est + x.transito;
    x.cobertura = (pos!==null && dDia>0) ? pos/dDia : null;
    x.mesesSemVenda = m.mesesSemVenda;
    var semGiro = x.est!==null && x.est>0 && (m.mesesSemVenda===null || m.mesesSemVenda >= Math.ceil(P.sem_giro_dias/PED_DIAS_MES));
    var status;
    if (x.est===null) status='sem_posicao';
    else if (x.inativo) status='inativo';
    else if (semGiro) status='sem_giro';
    else if (dDia<=0) status='sem_demanda';
    else if (pos<=0) status='ruptura';
    else if (x.cobertura < P.lead_time) status='critico';
    else if (x.cobertura > P.excesso_mult*P.doh_alvo) status='excesso';
    else status='ok';
    x.status = status;

    // fatores de campanha (o fator manual do SKU sobrepõe o calendário) e demanda acumulada em dias
    var cs = (camp && camp[x.sku]) || null, fm = (fatores && fatores[x.sku]>0 && fatores[x.sku]!==1) ? fatores[x.sku] : null, cacheF = {};
    x.camp = cs; x.fatorManual = fm;
    function liftDe(mk){ var c = cs[mk]; if (!c) return 1; if (m.lift!==null && m.lift!==undefined) return m.lift; return c.desc>=0.195 ? P.lift_20 : (c.desc>=0.145 ? P.lift_15 : P.lift_10); }
    function fDia(t){ if (fm!==null) return fm; if (!cs) return 1; var mk = pedMesKey(pedYMD(pedAddDias(sit.hoje,t))); if (cacheF[mk]===undefined) cacheF[mk] = liftDe(mk); return cacheF[mk]; }
    function demAcum(t0,t1){ if (!cs && fm===null) return dDia*Math.max(0,t1-t0); var a=0, i0=Math.max(0,Math.floor(t0)), i1=Math.max(i0,Math.ceil(t1)); for (var t=i0;t<i1;t++) a+=fDia(t); return a*dDia; }
    x.fDia = fDia;

    // nível-alvo e sugestão — duas versões: pedir hoje (D=0) e pedir na data ideal (D=Dideal)
    function sugerir(D){
      var fS = P.usar_sazonalidade ? pedFatorSazonal(m.seas, pedAddDias(sit.hoje,D), P.lead_time+P.doh_alvo) : 1;
      var alvo = demAcum(D, D+P.lead_time+P.doh_alvo)*fS + x.ss;
      var posProj = Math.max(0, (pos||0) - demAcum(0,D));
      var q = Math.max(0, alvo - posProj);
      if (m.novo && q < P.qtd_minima_novo) q = P.qtd_minima_novo;
      var lote = Math.max(1,P.lote_minimo); q = Math.ceil(q/lote)*lote;
      return { alvo:alvo, qtd:q };
    }
    var sHoje = sugerir(0), sData = sugerir(Dideal);
    x.nivelAlvo = sHoje.alvo;
    var agora = status!=='sem_posicao' && dDia>0 && x.cobertura!==null && x.cobertura < (Dideal + P.lead_time) && sHoje.qtd>0;
    var usa = agora ? sHoje : sData;
    x.qtdSugerida = (status==='sem_posicao' || status==='sem_giro' || status==='inativo' || !x.truss || (dDia<=0 && !m.novo)) ? 0 : usa.qtd;   // sem giro/inativo/fora da TRUSS: revisar, não comprar
    x.prioridade = x.qtdSugerida<=0 ? 'ok' : (agora ? 'agora' : 'janela');
    x.quandoPedir = x.prioridade==='agora' ? sit.hoje : dataAlvo;
    x.custo = pedCustoUnit(x.serie, meses);
    x.invest = (x.custo!==null) ? x.qtdSugerida*x.custo : null;
    x.excessoUn = (status==='excesso'||status==='sem_giro'||status==='inativo') && x.est!==null ? Math.max(0, x.est - ((status==='sem_giro'||status==='inativo')?0:x.nivelAlvo)) : 0;
    x.riscoUnMes = (status==='ruptura') ? Math.round(m.mediaPond) : 0;
    // projeção até a chegada do pedido, estoque de segurança em dias, ruptura prevista e risco
    var Dq = Math.round((x.quandoPedir - sit.hoje)/86400000); x.diasAtePedido = Dq;
    x.chegaEm = pedAddDias(x.quandoPedir, Math.round(P.lead_time));
    var cons = demAcum(0, Dq + P.lead_time);
    x.estChegada = pos===null ? null : pos - cons;
    x.cobChegada = (pos!==null && dDia>0) ? (Math.max(0,x.estChegada) + x.qtdSugerida)/dDia : null;
    x.ssDias = dDia>0 ? x.ss/dDia : null;
    x.rompeEm = null;
    if (pos!==null && dDia>0) {
      if (pos<=0) x.rompeEm = sit.hoje;
      else if (!cs && fm===null) x.rompeEm = pedAddDias(sit.hoje, Math.min(730, Math.ceil(pos/dDia)));
      else { var acc=0, tt=0; while (tt<730 && acc<pos) { acc += dDia*fDia(tt); tt++; } x.rompeEm = pedAddDias(sit.hoje, tt); }
    }
    x.risco = null;     // probabilidade de faltar produto até a chegada de um pedido feito em x.quandoPedir (demanda normal)
    if (pos!==null && dDia>0) {
      var sdd = m.desvio/Math.sqrt(PED_DIAS_MES), HH = Dq + P.lead_time;
      x.risco = pos<=0 ? 1 : (sdd<=0 ? (pos<cons?1:0) : 1 - pedPhi((pos-cons)/(sdd*Math.sqrt(HH))));
    }
    x.campProx = null;
    if (cs) { var mk0 = pedMesKey(pedYMD(sit.hoje)); Object.keys(cs).sort().some(function(mk){ if (mk>=mk0){ x.campProx = { mes:mk, desc:cs[mk].desc, pacote:cs[mk].pacote, pedirAte:pedAddDias(pedParseYMD(mk+'-01'), -Math.round(P.lead_time)) }; return true; } return false; }); }
    if (x.cobertura!==null) cobRaw.push(x);
  });

  /* KPIs */
  var K = res.kpis, A = lista;
  K.skusAtivos = A.filter(function(x){return !x.inativo;}).length;
  K.inativos = A.filter(function(x){return x.inativo && (x.est||0)>0;}).length; K.unInativos = A.reduce(function(a,x){return a+((x.inativo&&x.est>0)?x.est:0);},0);
  K.foraTruss = A.filter(function(x){return !x.truss && !x.inativo;}).length;
  K.ruptura = A.filter(function(x){return x.status==='ruptura';}).length;
  K.critico = A.filter(function(x){return x.status==='critico';}).length;
  K.excesso = A.filter(function(x){return x.status==='excesso';}).length;
  K.semGiro = A.filter(function(x){return x.status==='sem_giro';}).length;
  K.unEstoque = A.reduce(function(a,x){return a+(x.est||0);},0);
  var somaEst = cobRaw.reduce(function(a,x){return a+(x.est||0)+x.transito;},0), somaD = cobRaw.reduce(function(a,x){return a+x.dDia;},0);
  K.coberturaMedia = somaD>0 ? somaEst/somaD : null;
  K.skusComprar = A.filter(function(x){return x.prioridade!=='ok';}).length;
  K.skusAgora = A.filter(function(x){return x.prioridade==='agora';}).length;
  K.unSugeridas = A.reduce(function(a,x){return a+x.qtdSugerida;},0);
  K.invest = A.reduce(function(a,x){return a+(x.invest||0);},0);
  K.unExcesso = A.reduce(function(a,x){return a+x.excessoUn;},0);
  K.riscoAlto = A.filter(function(x){ return !x.inativo && x.truss && x.prioridade==='janela' && x.risco!==null && x.risco*100>=P.limite_risco; }).length;
  K.comCampanha = A.filter(function(x){ return !!x.campProx || x.fatorManual!==null; }).length;
  K.semPosicao = semPosicao; K.estoqueSemVenda = estoqueSemVenda; K.temEstoque = temEst;
  if (!temEst) res.avisos.push('Nenhuma posi\u00e7\u00e3o de estoque importada (ped_estoque): mostrando s\u00f3 demanda e curvas.');
  if (semPosicao>0) res.avisos.push(semPosicao+' SKU(s) com venda e sem posi\u00e7\u00e3o no arquivo de estoque'+(P.estoque_ausente_zero?' (tratados como estoque 0)':' (ignorados na sugest\u00e3o)')+'. Se o n\u00famero for alto, confira a chave de SKU.');
  if (P.doh_alvo < P.ciclo_compra) res.avisos.push('DOH alvo ('+P.doh_alvo+' d) est\u00e1 abaixo do ciclo de compra ('+P.ciclo_compra+' d): haver\u00e1 ruptura entre pedidos.');

  /* séries para os gráficos */
  res.skus = lista; res.temCampanha = !!camp && Object.keys(camp).length>0;
  res.serieTotal = meses.map(function(k){ var t=0; lista.forEach(function(x){ t+= Math.max(0,x.serie.m[k]||0); }); return t; });
  res.matriz = { A:{X:0,Y:0,Z:0,'\u2014':0}, B:{X:0,Y:0,Z:0,'\u2014':0}, C:{X:0,Y:0,Z:0,'\u2014':0} };
  lista.forEach(function(x){ res.matriz[x.curva][x.xyz]++; });
  res.pareto = porVenda.map(function(x,i){ return { rank:(i+1)/porVenda.length*100, acum:x.acumPct, curva:x.curva }; });
  return res;
}


/* ── simulação do estoque de um produto (gráfico por produto) ──
   cenario: 'sem' (nenhum pedido) | 'sugestao' (pedidos quinzenais pela regra) | 'editada' (1º pedido = quantidade do franqueado) */
function pedSimularEstoque(x, P, sit, fer, opt){
  opt = opt || {}; var meses = opt.meses || 4, cen = opt.cenario || 'sugestao';
  var N = Math.round(meses*PED_DIAS_MES), LT = Math.round(P.lead_time), DOH = P.doh_alvo, dDia = x.dDia, hoje = sit.hoje;
  var ordenavel = !!(x.truss && !x.inativo && x.status!=='sem_giro' && x.status!=='sem_posicao' && x.status!=='sem_demanda' && dDia>0);
  if (!ordenavel) cen = 'sem';
  var fDia = x.fDia || function(){ return 1; }, lote = Math.max(1,P.lote_minimo);
  function dem(t0,t1){ var a=0; for (var t=t0;t<t1;t++) a+=fDia(t); return a*dDia; }
  var ords = [], D1 = sit.diasAteAlvo;
  if (x.prioridade==='agora' && D1>0) ords.push(0);
  ords.push(D1);
  var cur = sit.dataAlvo;
  for (var g=0; g<24; g++){ var jn = pedJanela(pedProximaQuinzenaInicio(cur), fer), off = Math.round((jn.recomendada-hoje)/86400000); if (off>N) break; ords.push(off); cur = jn.recomendada; }
  var est = (x.est||0) + (x.transito||0), pos0 = est, trans = [], ser = [], sem = [], ordens = [], consSem = 0, primeira = true;
  for (var t=0; t<=N; t++){
    var ch = 0; trans = trans.filter(function(o){ if (o.c===t){ ch += o.q; return false; } return true; }); est += ch;
    if (cen!=='sem' && ords.indexOf(t)>=0) {
      var emt = trans.reduce(function(a,o){ return a+o.q; },0), q;
      if (primeira) { q = (cen==='editada' && opt.qtdEditada!==null && opt.qtdEditada!==undefined) ? opt.qtdEditada : x.qtdSugerida; primeira = false; }
      else { q = Math.max(0, dem(t, t+LT+DOH) + x.ss - (est+emt)); q = Math.ceil(q/lote)*lote; }
      if (q>0) { trans.push({ c:t+LT, q:q }); ordens.push({ t:t, data:pedAddDias(hoje,t), qtd:q, cheg:t+LT, chegData:pedAddDias(hoje,t+LT) }); }
    }
    ser.push(est); sem.push(Math.max(0, pos0 - consSem));
    var d = dDia*fDia(t); est = Math.max(0, est - d); consSem += d;
  }
  var zera = null; for (var z=1; z<sem.length; z++){ if (sem[z]<=0){ zera = z; break; } }
  var minDia = -1, minVal = Infinity; for (var u=1; u<ser.length; u++){ if (ser[u]<minVal){ minVal = ser[u]; minDia = u; } }
  return { N:N, ser:ser, sem:sem, ordens:ordens, zeraEm:zera, minDia:minDia, minVal:minVal, ss:x.ss, alvo:x.nivelAlvo, cenario:cen, ordenavel:ordenavel, hoje:hoje };
}

/* ══════════════════════════════════════════════════════════════════════
   ESTOQUE — IMPORTAÇÃO DO ARQUIVO BRUTO + DE-PARA DE CÓDIGOS (funções puras)
   Lê o CSV do sistema deles (Latin-1, ";", decimal em vírgula), interpreta
   as colunas e liga cada código de venda ao produto do estoque.
══════════════════════════════════════════════════════════════════════ */
var PED_COLS = {
  cod:['CODIGO DO PRODUTO'], codf:['CODIGO DO PRODUTO (FORNECEDOR)'], desc:['DESCRICAO DO PRODUTO'], grupo:['GRUPO DO PRODUTO'],
  forn:['NOME DO FORNECEDOR'], status:['STATUS'], tipo:['TIPO PRODUTO'], ean:['CODIGO DE BARRA'],
  fisico:['EST.FISICO'], reservado:['EST.RESERVADO'], disp:['EST.DISPONIVEL'], comprado:['EST.COMPRADO'], consig:['EST.CONSIGNADO'] };
var PED_COLS_OBRIG = ['cod','desc','disp'];

function pedDecodificar(buf){
  var u8 = new Uint8Array(buf);
  if (u8.length>=3 && u8[0]===0xEF && u8[1]===0xBB && u8[2]===0xBF) u8 = u8.subarray(3);
  try { return { texto:new TextDecoder('utf-8',{fatal:true}).decode(u8), codificacao:'UTF-8' }; }
  catch(e){ return { texto:new TextDecoder('windows-1252').decode(u8), codificacao:'Windows-1252 (Latin-1)' }; }
}
function pedParseCSV(texto){
  var primeira = texto.split(/\r?\n/,1)[0] || '', delim = ';', melhor = -1;
  [';',',','\t'].forEach(function(d){ var n = primeira.split(d).length; if (n>melhor){ melhor=n; delim=d; } });
  var rows = [], row = [], cel = '', q = false;
  for (var i=0;i<texto.length;i++){
    var c = texto.charAt(i);
    if (q) { if (c==='"') { if (texto.charAt(i+1)==='"'){ cel+='"'; i++; } else q=false; } else cel+=c; }
    else if (c==='"') q = true;
    else if (c===delim) { row.push(cel); cel=''; }
    else if (c==='\n' || c==='\r') { if (c==='\r' && texto.charAt(i+1)==='\n') i++; row.push(cel); cel=''; if (row.length>1 || row[0]!=='') rows.push(row); row=[]; }
    else cel += c;
  }
  if (cel!=='' || row.length) { row.push(cel); if (row.length>1 || row[0]!=='') rows.push(row); }
  return { delim:delim, rows:rows };
}
function pedNumPT(s){
  s = String(s==null?'':s).trim(); if (s==='') return 0;
  var neg = s.charAt(0)==='-'; s = s.replace(/^[-+]/,'');
  if (s.indexOf(',')>=0) s = s.replace(/\./g,'').replace(',','.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');
  var v = parseFloat(s); if (!isFinite(v)) return 0; return neg ? -v : v;
}
function pedMapearColunas(header){
  var idx = {}; header.forEach(function(h,i){ idx[pedSemAcento(h)] = i; });
  var map = {}, faltando = [];
  Object.keys(PED_COLS).forEach(function(k){
    var ach = null; PED_COLS[k].forEach(function(n){ if (idx[n]!==undefined) ach = idx[n]; });
    if (ach===null) { if (PED_COLS_OBRIG.indexOf(k)>=0) faltando.push(PED_COLS[k][0]); } else map[k] = ach;
  });
  return { map:map, faltando:faltando };
}
function pedInterpretarEstoque(rows, map){
  var linhas = [], ign = [], vistos = {}, dup = 0;
  function g(r,k){ return map[k]===undefined ? '' : String(r[map[k]]==null?'':r[map[k]]).trim(); }
  for (var i=1;i<rows.length;i++){
    var r = rows[i], cod = g(r,'cod');
    if (!cod) { ign.push({ linha:i+1, motivo:'sem c\u00f3digo do produto' }); continue; }
    var it = { sku:cod, codigo_produto:cod, codigo_fornecedor:g(r,'codf'), produto:g(r,'desc'), categoria:g(r,'grupo'), fornecedor:g(r,'forn'),
      status:(g(r,'status')||'A').toUpperCase(), tipo:g(r,'tipo'), ean:g(r,'ean'),
      fisico:pedNumPT(g(r,'fisico')), reservado:pedNumPT(g(r,'reservado')), consignado:pedNumPT(g(r,'consig')),
      qtd:pedNumPT(g(r,'disp')), qtd_transito:pedNumPT(g(r,'comprado')) };
    var k = pedNormSku(cod);
    if (vistos[k]) { dup++; var o = vistos[k]; o.qtd += it.qtd; o.fisico += it.fisico; o.qtd_transito += it.qtd_transito; continue; }
    vistos[k] = it; linhas.push(it);
  }
  return { linhas:linhas, ignoradas:ign, duplicadas:dup };
}

/* ── comparação de nomes ── */
var PED_STOP = { TRUSS:1, VEGAN:1, FULL:1, DE:1, DO:1, DA:1, COM:1, C:1, E:1, CX:1, UN:1, UNID:1, UNIDADE:1, UNIDADES:1, VENDAVEL:1 };
function pedTokens(nome){
  var s = pedSemAcento(nome).replace(/(\d)\s*[.,](\d{3})\b/g,'$1$2');
  s = s.replace(/(\d)\s*(ML|GR|G|L|KG|MG)\b/g, function(m,n,u){ return u==='L' ? String(parseFloat(n)*1000)+'ML' : n+(u==='GR'?'G':u); });
  s = s.replace(/[^A-Z0-9.]+/g,' ');
  return s.split(' ').filter(function(w){ return w && w!=='.' && !PED_STOP[w]; });
}
function pedSimil(a,b){
  if (!a.length || !b.length) return 0;
  var sa = {}, sb = {}, inter = 0; a.forEach(function(t){ sa[t]=1; }); b.forEach(function(t){ sb[t]=1; });
  var ka = Object.keys(sa), kb = Object.keys(sb); ka.forEach(function(t){ if (sb[t]) inter++; });
  return 0.5*(inter/(ka.length+kb.length-inter)) + 0.5*(inter/Math.min(ka.length,kb.length));
}

/* ── produtos vendidos (a partir de fato_vendas) ── */
function pedProdutosVenda(rows){
  var m = {}, maxKey = null;
  (rows||[]).forEach(function(r){
    if (!r.sku || !r.competencia || pedSemAcento(r.tipo_operacao)!=='VENDA') return;
    var k = pedNormSku(r.sku), mk = pedMesKey(r.competencia), q = parseFloat(r.qtd)||0;
    var p = m[k] || (m[k] = { sku:k, skuOrig:r.sku, produto:'', unid:0, meses:{} });
    if (r.produto) p.produto = r.produto; p.unid += q; p.meses[mk] = (p.meses[mk]||0) + q;
    if (!maxKey || mk>maxKey) maxKey = mk;
  });
  var ini12 = maxKey ? pedMesMais(maxKey,-11) : '';
  return Object.keys(m).map(function(k){ var p=m[k]; p.unid12m = 0; Object.keys(p.meses).forEach(function(mk){ if (mk>=ini12) p.unid12m += p.meses[mk]; }); return p; })
    .sort(function(a,b){ return b.unid12m-a.unid12m; });
}

/* ── de-para: liga cada código de venda a um produto do estoque ──
   Ordem: (0) ligação manual salva; (1) código do produto ou do fornecedor
   — desempata colisões por nome e depois por status ativo; (2) nome igual;
   o que sobrar vai para revisão com sugestões. */
function pedMontarAlias(prods, est, manual){
  manual = manual || {};
  var E = est.map(function(r){ return { r:r, k:pedNormSku(r.sku), f:pedNormSku(r.codigo_fornecedor||''), t:pedTokens(r.produto) }; });
  var porK = {}, porCod = {}, porCodf = {};
  E.forEach(function(e){ porK[e.k] = e; (porCod[e.k]=porCod[e.k]||[]).push(e); if (e.f) (porCodf[e.f]=porCodf[e.f]||[]).push(e); });
  var alias = {}, ligados = [], pendentes = [], ambiguos = [], ignorados = [], alvos = {};
  var cont = { codigo:0, fornecedor:0, nome:0, manual:0 };
  prods.forEach(function(p){
    var s = p.sku, tgt = null, via = null;
    if (manual[s]!==undefined) {
      if (manual[s]==='-') { ignorados.push(p); return; }
      if (porK[manual[s]]) { tgt = manual[s]; via = 'manual'; }
    }
    if (!tgt) {
      var c = {}; (porCod[s]||[]).forEach(function(e){ c[e.k]=e; }); (porCodf[s]||[]).forEach(function(e){ c[e.k]=e; });
      var ks = Object.keys(c);
      if (ks.length===1) { tgt = ks[0]; via = (tgt===s) ? 'codigo' : 'fornecedor'; }
      else if (ks.length>1) {
        var pt = pedTokens(p.produto);
        var sc = ks.map(function(k){ return { k:k, s:pedSimil(pt,c[k].t), a:(c[k].r.status==='A'?1:0) }; }).sort(function(x,y){ return (y.s-x.s) || (y.a-x.a); });
        tgt = sc[0].k; via = (tgt===s) ? 'codigo' : 'fornecedor';
        if (sc[0].s - sc[1].s < 0.1) ambiguos.push({ p:p, escolhido:tgt, alternativas:sc.slice(1).map(function(x){ return x.k; }) });
      }
    }
    if (!tgt) {
      var pt2 = pedTokens(p.produto), sc2 = E.map(function(e){ return { k:e.k, s:pedSimil(pt2,e.t) }; }).sort(function(x,y){ return y.s-x.s; });
      var exatos = sc2.filter(function(x){ return x.s>=0.999; });
      if (exatos.length===1) { tgt = exatos[0].k; via = 'nome'; }
      else pendentes.push({ p:p, candidatos:sc2.filter(function(x){ return x.s>=0.4; }).slice(0,6), sugerido:(sc2[0] && sc2[0].s>=0.8 && (!sc2[1] || sc2[0].s-sc2[1].s>=0.1)) ? sc2[0].k : '' });
    }
    if (tgt) { if (tgt!==s) alias[s] = tgt; if (p.unid>0) alvos[tgt] = true; ligados.push({ p:p, tgt:tgt, via:via }); cont[via]++; }
  });
  var uni = 0, uniOk = 0, sk = 0, skOk = 0;
  prods.forEach(function(p){ if (p.unid12m>0) { uni += p.unid12m; sk++; } });
  ligados.forEach(function(l){ if (l.p.unid12m>0) { uniOk += l.p.unid12m; skOk++; } });
  pendentes = pendentes.filter(function(x){ return x.p.unid12m>0; });
  var semVenda = E.filter(function(e){ return !alvos[e.k]; }).map(function(e){ return e.r; });
  return { alias:alias, ligados:ligados, pendentes:pendentes, ambiguos:ambiguos, ignorados:ignorados, semVenda:semVenda, cont:cont,
           cobertura:{ skus:sk, skusLigados:skOk, unid:uni, unidLigadas:uniOk, pct: uni>0 ? uniOk/uni : 1 } };
}

/* ══════════════════════════════════════════════════════════════════════
   CAMPANHAS — leitura da tabela de ciclo da franqueadora (funções puras)
   Formato de referência: aba "Ciclo" (SKU, PACOTE, PERÍODO, MECÂNICA = % de desconto,
   SALÃO, PERFUMARIA, ITEM COM SELL OUT, preços de tabela e de ciclo).
══════════════════════════════════════════════════════════════════════ */
var PED_MESES_NOME = [['JANEIRO',1],['FEVEREIRO',2],['MARCO',3],['ABRIL',4],['MAIO',5],['JUNHO',6],['JULHO',7],['AGOSTO',8],['SETEMBRO',9],['OUTUBRO',10],['NOVEMBRO',11],['DEZEMBRO',12],
  ['JAN',1],['FEV',2],['MAR',3],['ABR',4],['MAI',5],['JUN',6],['JUL',7],['AGO',8],['SET',9],['OUT',10],['NOV',11],['DEZ',12]];
function pedMesDoPeriodo(txt, anoPadrao){
  var s = pedSemAcento(txt), ano = anoPadrao || new Date().getFullYear(), mes = 0;
  var my = /(\d{1,2})\s*[\/\-]\s*(\d{4}|\d{2})\b/.exec(s);
  if (my && +my[1]>=1 && +my[1]<=12) { mes = +my[1]; ano = my[2].length===2 ? 2000+(+my[2]) : +my[2]; }
  else {
    for (var i=0;i<PED_MESES_NOME.length && !mes;i++){ var re = new RegExp('(^|[^A-Z])'+PED_MESES_NOME[i][0]+'([^A-Z]|$)'); if (re.test(s)) mes = PED_MESES_NOME[i][1]; }
    var ay = /\b(20\d{2})\b/.exec(s); if (ay) ano = +ay[1];
  }
  return mes ? ano+'-'+String(mes).padStart(2,'0') : '';
}
function pedDescontoCiclo(v, pacote){
  var d = NaN;
  if (typeof v==='number') d = v;
  else if (v!==null && v!==undefined && String(v).trim()!=='') { var t = String(v).trim(); d = pedNumPT(t.replace('%','')); if (t.indexOf('%')>=0) d = d/100; }
  if (!isFinite(d) || d<=0) { var m = /(\d+(?:[.,]\d+)?)\s*%/.exec(String(pacote||'')); d = m ? pedNumPT(m[1])/100 : NaN; }
  if (isFinite(d) && d>1) d = d/100;
  return (isFinite(d) && d>0 && d<1) ? d : null;
}
function pedInterpretarCiclo(aoa){
  var hi = -1, norm = function(c){ return pedSemAcento(c==null?'':c); };
  for (var i=0;i<Math.min(aoa.length,20);i++){ var cel = aoa[i].map(norm); if (cel.indexOf('SKU')>=0 && cel.indexOf('PACOTE')>=0) { hi = i; break; } }
  if (hi<0) return { erro:'N\u00e3o encontrei o cabe\u00e7alho da tabela de campanha (colunas SKU e PACOTE).' };
  var head = aoa[hi].map(norm), col = {};
  function acha(nomes){ for (var a=0;a<nomes.length;a++){ var ix = head.indexOf(nomes[a]); if (ix>=0) return ix; } for (var b=0;b<nomes.length;b++){ for (var j=0;j<head.length;j++){ if (head[j].indexOf(nomes[b])===0) return j; } } return -1; }
  col.sku = acha(['SKU']); col.desc = acha(['DESCRICAO']); col.pacote = acha(['PACOTE']); col.periodo = acha(['PERIODO']); col.mec = acha(['MECANICA']);
  col.salao = acha(['SALAO']); col.perf = acha(['PERFUMARIA']); col.sellout = acha(['ITEM COM SELL OUT']); col.cat = acha(['CATEGORIA']);
  var por = {}, brutas = 0, periodo = '', pacotes = {};
  function g(r,k){ return col[k]<0 || r[col[k]]==null ? '' : r[col[k]]; }
  for (var r=hi+1;r<aoa.length;r++){
    var row = aoa[r]; var sku = String(g(row,'sku')).trim().replace(/\.0+$/,''); if (!sku) continue;
    brutas++;
    var pac = String(g(row,'pacote')).trim(), per = String(g(row,'periodo')).trim(), d = pedDescontoCiclo(g(row,'mec'), pac);
    if (per && !periodo) periodo = per;
    var k = pedNormSku(sku), it = por[k] || (por[k] = { sku:sku, key:k, produto:String(g(row,'desc')).trim(), pacotes:[], desconto:null, salao:false, perfumaria:false, sellout:'', categoria:String(g(row,'cat')).trim() });
    if (pac && it.pacotes.indexOf(pac)<0) it.pacotes.push(pac);
    if (d!==null && (it.desconto===null || d>it.desconto)) it.desconto = d;
    if (String(g(row,'salao')).trim()!=='') it.salao = true;
    if (String(g(row,'perf')).trim()!=='') it.perfumaria = true;
    var so = String(g(row,'sellout')).trim(); if (so && !it.sellout) it.sellout = so;
    if (pac) pacotes[pac] = pacotes[pac] || { itens:{}, desconto:d };
    if (pac) pacotes[pac].itens[k] = 1;
  }
  var linhas = Object.keys(por).map(function(k){ var it = por[k]; it.pacote = it.pacotes.join(' + '); return it; });
  var resumo = Object.keys(pacotes).map(function(p){ return { pacote:p, itens:Object.keys(pacotes[p].itens).length, desconto:pacotes[p].desconto }; }).sort(function(a,b){ return b.itens-a.itens; });
  return { linhas:linhas, brutas:brutas, periodo:periodo, mes:pedMesDoPeriodo(periodo), pacotes:resumo, semDesconto:linhas.filter(function(l){ return l.desconto===null; }).length };
}
/* expande a vigência (1 a 3 meses) em linhas por SKU e mês, prontas para a tabela ped_campanha */
function pedCampExpandir(linhas, mesIni, mesFim){
  var meses = [], m = mesIni; while (m<=mesFim && meses.length<12){ meses.push(m); m = pedMesMais(m,1); }
  var out = []; linhas.forEach(function(l){ meses.forEach(function(mk){
    out.push({ sku_venda:l.sku, mes:mk+'-01', desconto:l.desconto, pacote:l.pacote, salao:l.salao, perfumaria:l.perfumaria, sellout:l.sellout||null }); }); });
  return { meses:meses, linhas:out };
}
/* mapa usado pelo motor: chave do estoque -> { 'AAAA-MM': {desc, pacote} } (c\u00f3digo de venda passa pelo de-para) */
function pedCampMapa(rows, alias){
  var mp = {}; alias = alias || {};
  (rows||[]).forEach(function(r){
    var k0 = pedNormSku(r.sku_venda), k = alias[k0] || k0, mk = String(r.mes).slice(0,7), d = parseFloat(r.desconto); if (!(d>0)) d = 0.10;
    var o = mp[k] || (mp[k] = {}); if (!o[mk] || d>o[mk].desc) o[mk] = { desc:d, pacote:r.pacote||'' };
  });
  return mp;
}

/* ══════════════════════════════════════════════════════════════════════
   ESTOQUE — SUGESTÃO DE PEDIDO · TELA (usa o motor acima)
   Dados de venda: FV_HAWKS (já carregado pelo portal). Estoque, parâmetros
   e rascunho do pedido: tabelas ped_estoque, ped_parametro, ped_pedido_item.
══════════════════════════════════════════════════════════════════════ */
var PED_RES = null, PED_ESTOQUE = [], PED_PARAM = {}, PED_EDICOES = {}, PED_DEPARA = {}, PED_ALIAS = null;
var PED_CARREGADO = false, PED_ED_CARREGADAS = false, PED_DATA_POSICAO = null, PED_ERROS = [], PED_QUINZENA = null;
var PED_FILTROS = { cat:'todas', curva:'todas', prio:'comprar', busca:'' };
var PED_LINHAS = [];
var PED_PARAM_CAMPOS = [
  ['Reposição', [
    ['lead_time','Lead time (dias)','1','A validar com a Hawks'],
    ['doh_alvo','DOH alvo (dias)','1','A definir: política de caixa'],
    ['ciclo_compra','Ciclo de compra (dias)','1','Quinzenal = 15; entra no estoque de segurança'],
    ['lote_minimo','Lote mínimo (múltiplo)','1','Pendente: lote/caixa por fornecedor'],
    ['qtd_minima_novo','Qtd. mínima de produto novo','1','Piso para produto novo; editável linha a linha'] ]],
  ['Demanda', [
    ['janela_meses','Janela de histórico (meses)','1','Máx. 36'],
    ['peso_u6m','Peso: últimos 6 meses','0.05',''],
    ['peso_7a12m','Peso: meses 7 a 12','0.05',''],
    ['peso_13a24m','Peso: meses 13 a 24','0.05',''],
    ['usar_sazonalidade','Sazonalidade por SKU (0 = off, 1 = on)','1','Suavizada; com 24 meses há só 2 observações por mês'],
    ['meses_novo','Produto novo (meses desde a 1ª venda)','1',''] ]],
  ['Curvas e serviço', [
    ['corte_a','Curva A: até (% acum. das unidades)','1',''],
    ['corte_b','Curva B: até (% acum. das unidades)','1',''],
    ['cv_x','XYZ: limite do X (CV)','0.05',''],
    ['cv_y','XYZ: limite do Y (CV)','0.05',''],
    ['servico_a','Nível de serviço curva A (%)','1',''],
    ['servico_b','Nível de serviço curva B (%)','1',''],
    ['servico_c','Nível de serviço curva C (%)','1',''] ]],
  ['Alertas e dados', [
    ['excesso_mult','Excesso: cobertura > X × DOH alvo','0.5',''],
    ['sem_giro_dias','Sem giro: dias sem venda','1',''],
    ['meses_ativo','Inativo: meses sem venda e sem estoque','1',''],
    ['estoque_ausente_zero','SKU vendido sem posição no estoque (0 = não sugerir, 1 = tratar como 0)','1','Revise o de-para antes de usar 1'],
    ['fornecedores_truss','Fornecedores TRUSS (partes do nome, separadas por vírgula)','text','Vegan (fábrica antiga) e Calamo (nova): só eles entram no pedido'],
    ['dias_faturamento','Dias entre pedido e faturamento','1','Exemplo informado (5); a validar'],
    ['mes_ref','Último mês fechado (AAAA-MM; vazio = auto)','text',''],
    ['feriados_extra','Feriados extras (AAAA-MM-DD, separados por vírgula)','text','Estaduais/municipais'] ]],
  ['Campanha e risco', [
    ['limite_risco','Risco de ruptura que destaca o SKU (%)','1','Chance de faltar produto até a chegada do pedido; acima do limite a célula fica vermelha'],
    ['campanha_base','Demanda de base sem os meses de campanha (1 = sim)','1','Precisa de 3 ou mais meses sem campanha no histórico'],
    ['lift_10','Efeito padrão da campanha de 10% (fator)','0.05','1 = neutro. O histórico calibra por produto com 2+ meses de campanha'],
    ['lift_15','Efeito padrão da campanha de 15% (fator)','0.05',''],
    ['lift_20','Efeito padrão da campanha de 20% ou mais (fator)','0.05',''] ]]
];

function pedParams(){
  var P = {};
  Object.keys(PED_PARAM_PADRAO).forEach(function(k){
    var d = PED_PARAM_PADRAO[k], v = PED_PARAM[k];
    if (v===undefined || v===null || v==='') v = d;
    P[k] = (typeof d==='number') ? (isFinite(parseFloat(v)) ? parseFloat(v) : d) : String(v);
  });
  P.janela_meses = Math.max(3, Math.min(36, Math.round(P.janela_meses)));
  return P;
}
function pedFmtN(v,dec){ return (v===null||v===undefined||!isFinite(v)) ? '\u2014' : Number(v).toLocaleString('pt-BR',{minimumFractionDigits:dec||0,maximumFractionDigits:dec||0}); }
function pedFmtR(v){ return (v===null||v===undefined||!isFinite(v)) ? '\u2014' : 'R$ '+Number(v).toLocaleString('pt-BR',{maximumFractionDigits:0}); }
var PED_DOW = ['dom','seg','ter','qua','qui','sex','s\u00e1b'];
function pedDataLonga(d){ return pedFmtBRc(d)+' ('+PED_DOW[d.getDay()]+')'; }
function pedMesLabel(k){ return MESES_LABELS[+k.slice(5,7)-1]+'/'+k.slice(2,4); }
var PED_STATUS = {
  ruptura:['Ruptura','#c0392b'], critico:['Cr\u00edtico','#e67e22'], ok:['OK','#2ECC71'], excesso:['Excesso','#5B8DB8'],
  sem_giro:['Sem giro','#8BA0B0'], inativo:['Inativo','#4A6580'], sem_demanda:['Sem demanda','#4A6580'], sem_posicao:['Sem posi\u00e7\u00e3o','#4A6580'] };

/* ── carga de dados (Supabase) ── */
async function pedCarregar(){
  var cid = clienteIdAtual(); PED_ERROS = []; PED_ESTOQUE = []; PED_DATA_POSICAO = null; PED_PARAM = {};
  try {
    try { var ses = await sb.auth.getSession(); var uid = ses && ses.data && ses.data.session && ses.data.session.user.id;
      if (uid) { var pr = await sb.from('profiles').select('is_admin,tipo,dashboard').eq('id',uid).single(); var pf = pr && pr.data;
        PED_PODE_IMPORTAR = !!(pf && (pf.is_admin===true || pf.tipo==='admin' || (PED_FRANQUEADO_IMPORTA && pf.dashboard==='hawks'))); } } catch(e){ PED_PODE_IMPORTAR = false; }
    var r1 = await sb.from('ped_estoque').select('data_posicao').eq('cliente_id',cid).order('data_posicao',{ascending:false}).limit(1);
    if (r1.error) PED_ERROS.push('ped_estoque: '+r1.error.message);
    else if (r1.data && r1.data.length) {
      PED_DATA_POSICAO = r1.data[0].data_posicao;
      var from = 0, step = 1000;
      while (true) {
        var r = await sb.from('ped_estoque').select('sku,produto,categoria,qtd,qtd_transito,fornecedor,status,codigo_produto,codigo_fornecedor').eq('cliente_id',cid)
          .eq('data_posicao',PED_DATA_POSICAO).order('sku',{ascending:true}).range(from,from+step-1);
        if (r.error) { PED_ERROS.push('ped_estoque: '+r.error.message); break; }
        PED_ESTOQUE = PED_ESTOQUE.concat(r.data||[]);
        if (!r.data || r.data.length < step) break; from += step;
      }
    }
    var r2 = await sb.from('ped_parametro').select('chave,valor').eq('cliente_id',cid);
    if (r2.error) PED_ERROS.push('ped_parametro: '+r2.error.message);
    else (r2.data||[]).forEach(function(x){ PED_PARAM[x.chave] = x.valor; });
    PED_DEPARA = {};
    var r4 = await sb.from('ped_depara').select('sku_venda,sku_estoque').eq('cliente_id',cid);
    if (r4.error) PED_ERROS.push('ped_depara: '+r4.error.message);
    else (r4.data||[]).forEach(function(x){ PED_DEPARA[pedNormSku(x.sku_venda)] = (x.sku_estoque==='-') ? '-' : pedNormSku(x.sku_estoque); });
    PED_CAMP_ROWS = [];
    var r5 = await sb.from('ped_campanha').select('sku_venda,mes,desconto,pacote').eq('cliente_id',cid);
    if (r5.error) PED_ERROS.push('ped_campanha: '+r5.error.message); else PED_CAMP_ROWS = r5.data || [];
  } catch(e){ PED_ERROS.push(String(e && e.message || e)); }
}
async function pedCarregarEdicoes(){
  PED_EDICOES = {}; PED_FATORES = {}; PED_ED_CARREGADAS = true;
  if (!PED_QUINZENA) return;
  try {
    var r = await sb.from('ped_pedido_item').select('sku,qtd_sugerida,qtd_pedido,obs,fator_campanha').eq('cliente_id',clienteIdAtual()).eq('quinzena',PED_QUINZENA);
    if (r.error) { PED_ERROS.push('ped_pedido_item: '+r.error.message); return; }
    (r.data||[]).forEach(function(x){ var k = pedNormSku(x.sku), f = parseFloat(x.fator_campanha); if (f>0 && f!==1) PED_FATORES[k] = f; var q = parseFloat(x.qtd_pedido)||0; if (x.qtd_sugerida===null || x.qtd_sugerida===undefined || q!==(parseFloat(x.qtd_sugerida)||0)) PED_EDICOES[k] = { qtd:q, obs:x.obs||'' }; });
  } catch(e){ PED_ERROS.push(String(e && e.message || e)); }
}
function pedRecalcular(){
  PED_ALIAS = PED_ESTOQUE.length ? pedMontarAlias(pedProdutosComCamp(), PED_ESTOQUE, PED_DEPARA) : null;
  PED_CAMP = pedCampMapa(PED_CAMP_ROWS, PED_ALIAS ? PED_ALIAS.alias : {});
  PED_RES = pedCalcular(FV_HAWKS, PED_ESTOQUE, pedParams(), new Date(), PED_ALIAS ? PED_ALIAS.alias : {}, PED_CAMP, PED_FATORES);
  var j = pedJanela(PED_RES.sit.dataAlvo, PED_RES.feriados);
  var novaQ = pedYMD(j.inicio);
  if (novaQ !== PED_QUINZENA) { PED_QUINZENA = novaQ; PED_ED_CARREGADAS = false; }
}

/* ── tela ── */
function estoqueHTML(){
  return '<div id="pedRoot"><div style="padding:3rem;text-align:center;color:#8BA0B0;font-size:13px">Carregando estoque e demanda\u2026</div></div>';
}
async function initEstoque(){
  if (!PED_CARREGADO) { await pedCarregar(); PED_CARREGADO = true; }
  pedRecalcular();
  if (!PED_ED_CARREGADAS) { await pedCarregarEdicoes(); if (Object.keys(PED_FATORES).length) pedRecalcular(); }
  var root = document.getElementById('pedRoot'); if (!root) return;
  root.innerHTML = pedPaginaHTML();
  var tp = document.getElementById('topbarPeriod');
  if (tp) tp.textContent = PED_DATA_POSICAO ? 'Posi\u00e7\u00e3o de estoque: '+pedFmtBR(pedParseYMD(PED_DATA_POSICAO)) : 'Estoque: sem posi\u00e7\u00e3o importada';
  pedRenderTabela(); pedRenderDesembolso(); pedPainelRender();
  setTimeout(pedDesenharGraficos, 60);
}
function pedPaginaHTML(){
  var R = PED_RES, K = R.kpis, sit = R.sit, h = '';
  PED_ERROS.forEach(function(e){ h += '<div class="ped-banner err">'+escapeHtml(e)+(/relation|does not exist|schema cache/i.test(e)?' \u2014 rode o ped_schema.sql no Supabase.':'')+'</div>'; });
  if (PED_AVISO_OK) { h += '<div class="ped-banner" style="background:rgba(46,204,113,.12);border-color:rgba(46,204,113,.4);color:#2ECC71">'+escapeHtml(PED_AVISO_OK)+'</div>'; PED_AVISO_OK = ''; }
  (R.avisos||[]).forEach(function(a){ h += '<div class="ped-banner">'+escapeHtml(a)+'</div>'; });
  if (PED_ALIAS) { var cb = PED_ALIAS.cobertura; if (PED_ALIAS.pendentes.length) h += '<div class="ped-banner">De-para: '+cb.skusLigados+' de '+cb.skus+' produtos vendidos (12 meses) ligados ao estoque ('+(cb.pct*100).toFixed(1).replace('.',',')+'% das unidades); '+PED_ALIAS.pendentes.length+' sem correspondência'+(PED_PODE_IMPORTAR?' — revise na seção de códigos mais abaixo.':'.')+'</div>'; }
  h += pedImpHTML();
  h += pedCampHTML();
  if (!R.skus.length) return h + '<div style="padding:2rem;text-align:center;color:#8BA0B0">Sem dados para calcular.</div>';

  /* janela de compra */
  var cen = pedCenarioPrazo(sit.dataAlvo, R.P.dias_faturamento), cenHoje = pedCenarioPrazo(sit.hoje, R.P.dias_faturamento);
  var ganho = Math.round((cen.parcelas.reduce(function(a,p,i){return a+(p.data-cenHoje.parcelas[i].data);},0)/4)/86400000);
  var cores = { verde:'#2ECC71', laranja:'#e67e22', amarelo:'#C8B89A', vermelho:'#c0392b' };
  var proj = pedProximasJanelas(sit.hoje, R.feriados, 6);
  h += '<div class="ped-grid-janela"><div class="ped-janela" style="border-left-color:'+cores[sit.cor]+'">'
    +'<div class="ped-janela-top"><span class="ped-dot" style="background:'+cores[sit.cor]+'"></span><span class="ped-janela-rot">'+sit.rotulo+'</span><span class="bi-tag">'+nomeFilial()+' \u00b7 pedido separado por filial</span></div>'
    +'<div class="ped-janela-main"><div><div class="ped-lbl">Data ideal do pedido</div><div class="ped-big">'+pedDataLonga(sit.dataAlvo)+'</div></div>'
    +'<div><div class="ped-lbl">Fechamento da quinzena</div><div class="ped-big sm">'+pedDataLonga(sit.janela.ultimoUtil)+'</div></div>'
    +'<div><div class="ped-lbl">Dias \u00fateis at\u00e9 a data ideal</div><div class="ped-big sm">'+sit.diasUteisAteAlvo+'</div></div>'
    +'<div><div class="ped-lbl">Prazo m\u00e9dio na data ideal</div><div class="ped-big sm">'+cen.prazoMedio+' dias</div><div class="ped-sub">'+cen.prazos.join(' \u00b7 ')+'</div></div></div>'
    +'<div class="ped-sub" style="margin-top:8px">'+(sit.diasAteAlvo>0 ? 'Aguardar at\u00e9 a data ideal adia o desembolso em m\u00e9dia <strong>'+ganho+' dias</strong> frente a pedir hoje (faturamento '+R.P.dias_faturamento+' d ap\u00f3s o pedido \u2014 a validar). ' : '')
    +'SKUs com risco de ruptura antes da chegada s\u00e3o marcados <strong>Comprar agora</strong>.</div></div>'
    +'<div class="ped-cal"><div class="ped-lbl" style="margin-bottom:6px">Calend\u00e1rio de compras</div><table class="dre-table" style="font-size:11.5px"><thead><tr><th>Quinzena</th><th>Data ideal</th><th>Fechamento</th><th>Prazos</th><th>M\u00e9dio</th></tr></thead><tbody>'
    + proj.map(function(j,i){ return '<tr'+(i===0?' class="subtotal"':'')+'><td style="text-align:left">'+pedFmtBRc(j.inicio)+' \u2013 '+pedFmtBRc(j.fim)+'</td><td>'+pedDataLonga(j.recomendada)+'</td><td>'+pedFmtBRc(j.ultimoUtil)+'</td><td>'+j.prazos.join('/')+'</td><td>'+pedMedia(j.prazos)+' d</td></tr>'; }).join('')
    +'</tbody></table></div></div>';

  /* KPIs */
  var temE = K.temEstoque;
  function kpi(l,v,s,c){ return '<div class="kpi"'+(c?' style="border-left-color:'+c+'"':'')+'><div class="kpi-label">'+l+'</div><div class="kpi-value">'+v+'</div><div class="kpi-sub">'+s+'</div></div>'; }
  h += '<div class="kpi-grid">'
    + kpi('SKUs ativos', pedFmtN(K.skusAtivos), 'venda nos \u00faltimos '+R.P.meses_ativo+' meses ou com estoque')
    + kpi('Em ruptura', temE?pedFmtN(K.ruptura):'\u2014', temE?(pedFmtN(K.critico)+' em n\u00edvel cr\u00edtico (cobertura < lead time)'):'sem estoque importado','#c0392b')
    + kpi('Com excesso', temE?pedFmtN(K.excesso):'\u2014', temE?(pedFmtN(K.semGiro)+' sem giro \u00b7 '+pedFmtN(K.unExcesso)+' un. acima do alvo'):'\u2014','#5B8DB8')
    + kpi('Cobertura m\u00e9dia', temE&&K.coberturaMedia!==null?pedFmtN(K.coberturaMedia,0)+' dias':'\u2014', 'unidades em estoque \u00f7 demanda di\u00e1ria total (alvo: '+(R.P.lead_time+R.P.doh_alvo)+' d com lead time)')
    +'</div><div class="kpi-grid">'
    + kpi('Unidades em estoque', temE?pedFmtN(K.unEstoque):'\u2014', PED_DATA_POSICAO?('posi\u00e7\u00e3o de '+pedFmtBR(pedParseYMD(PED_DATA_POSICAO))):'importe o estoque')
    + kpi('SKUs a comprar', temE?pedFmtN(K.skusComprar):'\u2014', temE?(pedFmtN(K.skusAgora)+' para comprar agora \u00b7 '+pedFmtN(K.riscoAlto)+' com risco de '+R.P.limite_risco+'% ou mais ao esperar'):'\u2014','#e67e22')
    + kpi('Unidades sugeridas', temE?pedFmtN(K.unSugeridas):'\u2014', 'antes das edi\u00e7\u00f5es do franqueado'+(K.comCampanha?' \u00b7 '+pedFmtN(K.comCampanha)+' em campanha':''))
    + kpi('Investimento estimado', temE?pedFmtR(K.invest):'\u2014', 'custo m\u00e9dio recente (CMV \u00f7 qtd) \u00d7 sugest\u00e3o','#00B4D8')
    +'</div>';

  /* gr\u00e1ficos */
  h += '<div class="ped-grid2">'
    +'<div class="chart-card"><div class="chart-title">Sa\u00fade do estoque por SKU</div><div class="chart-sub">Demanda di\u00e1ria \u00d7 cobertura em dias \u00b7 tamanho = unidades em estoque \u00b7 faixas: risco, saud\u00e1vel e capital parado \u00b7 linha laranja: in\u00edcio da curva A</div>'
    +'<div class="legend"><span class="leg"><span class="leg-dot" style="background:#00B4D8"></span>Curva A</span><span class="leg"><span class="leg-dot" style="background:#5B8DB8"></span>Curva B</span><span class="leg"><span class="leg-dot" style="background:#A8C8E0"></span>Curva C</span></div>'
    +'<div class="chart-wrap" style="height:300px"><canvas id="chartPedDisp"></canvas></div></div>'
    +'<div class="chart-card"><div class="chart-title">Status por categoria</div><div class="chart-sub">N\u00ba de SKUs por situa\u00e7\u00e3o de cobertura</div>'
    +'<div class="legend">'+['ruptura','critico','ok','excesso','sem_giro'].map(function(s){return '<span class="leg"><span class="leg-dot" style="background:'+PED_STATUS[s][1]+'"></span>'+PED_STATUS[s][0]+'</span>';}).join('')+'</div>'
    +'<div class="chart-wrap" style="height:300px"><canvas id="chartPedStatus"></canvas></div></div></div>'
    +'<div class="ped-grid2">'
    +'<div class="chart-card"><div class="chart-title">Demanda mensal (unidades)</div><div class="chart-sub">Vendas l\u00edquidas de devolu\u00e7\u00e3o, SKUs ativos \u00b7 linha tracejada = mesmo m\u00eas do ano anterior</div><div class="chart-wrap" style="height:260px"><canvas id="chartPedDemanda"></canvas></div></div>'
    +'<div class="chart-card"><div class="chart-title">Curvas ABC \u00d7 XYZ</div><div class="chart-sub">Pareto das unidades vendidas e matriz de SKUs por curva e variabilidade</div>'
    +'<div class="chart-wrap" style="height:170px"><canvas id="chartPedPareto"></canvas></div>'+pedMatrizHTML(R)+'</div></div>';

  /* top rupturas / excessos */
  var rup = R.skus.filter(function(x){return x.status==='ruptura';}).sort(function(a,b){return b.m.mediaPond-a.m.mediaPond;}).slice(0,10);
  var exc = R.skus.filter(function(x){return x.excessoUn>0;}).sort(function(a,b){return b.excessoUn-a.excessoUn;}).slice(0,10);
  function nm(x){ return '<td style="text-align:left">'+escapeHtml(x.skuOrig)+' \u00b7 '+escapeHtml(x.produto).slice(0,38)+'</td>'; }
  h += '<div class="ped-grid2"><div class="chart-card"><div class="chart-title">Top 10 rupturas</div><div class="chart-sub">Ordenado pela demanda mensal (unidades que deixam de vender por m\u00eas)</div>'
    +(rup.length?'<table class="dre-table"><thead><tr><th style="text-align:left">SKU \u00b7 Produto</th><th>Curva</th><th>Dem./m\u00eas</th></tr></thead><tbody>'+rup.map(function(x){return '<tr>'+nm(x)+'<td>'+x.curva+x.xyz+'</td><td>'+pedFmtN(x.m.mediaPond,0)+'</td></tr>';}).join('')+'</tbody></table>':'<div class="plano-vazio">'+(temE?'Nenhum SKU em ruptura.':'Importe o estoque para ver as rupturas.')+'</div>')+'</div>'
    +'<div class="chart-card"><div class="chart-title">Top 10 excessos</div><div class="chart-sub">Unidades acima do n\u00edvel-alvo (sem giro conta o estoque inteiro)</div>'
    +(exc.length?'<table class="dre-table"><thead><tr><th style="text-align:left">SKU \u00b7 Produto</th><th>Estoque</th><th>Cob. (d)</th><th>Excesso</th></tr></thead><tbody>'+exc.map(function(x){return '<tr>'+nm(x)+'<td>'+pedFmtN(x.est)+'</td><td>'+(x.cobertura===null?'\u2014':pedFmtN(x.cobertura))+'</td><td>'+pedFmtN(x.excessoUn)+'</td></tr>';}).join('')+'</tbody></table>':'<div class="plano-vazio">'+(temE?'Nenhum excesso.':'Importe o estoque para ver os excessos.')+'</div>')+'</div></div>';

  /* sugest\u00e3o de pedido */
  var cats = {}; R.skus.forEach(function(x){ cats[x.categoria]=1; });
  h += '<div class="chart-card" id="pedCardTabela"><div class="qd-header"><div><div class="chart-title">Sugest\u00e3o de pedido \u2014 '+nomeFilial()+'</div><div class="chart-sub">Quantidade edit\u00e1vel \u00b7 pedido na data ideal ('+pedFmtBRc(sit.dataAlvo)+') salvo os itens marcados \u201cComprar agora\u201d</div></div>'
    +'<div style="white-space:nowrap"><button class="qd-btn" onclick="pedExportarCSV()">Exportar CSV</button><button class="disp-save-btn" style="margin-left:8px" onclick="pedSalvarRascunho()">Salvar rascunho</button></div></div>'
    +'<div class="bi-filters"><label>Mostrar</label><select id="pedF-prio" onchange="pedFiltrou()"><option value="comprar">A comprar (agora + data ideal)</option><option value="agora">S\u00f3 comprar agora</option><option value="janela">S\u00f3 data ideal</option><option value="todas">Todos os SKUs</option><option value="sem_venda">Estoque sem venda</option><option value="inativo">Inativos com estoque</option><option value="fora">Fora da TRUSS</option><option value="risco">Risco acima do limite</option></select>'
    +'<label>Categoria</label><select id="pedF-cat" onchange="pedFiltrou()"><option value="todas">Todas</option>'+Object.keys(cats).sort().map(function(c){return '<option>'+escapeHtml(c)+'</option>';}).join('')+'</select>'
    +'<label>Curva</label><select id="pedF-curva" onchange="pedFiltrou()"><option value="todas">Todas</option><option>A</option><option>B</option><option>C</option></select>'
    +'<input type="text" id="pedF-busca" class="disp-input disp-input-obs" placeholder="Buscar SKU ou produto" oninput="pedFiltrou()"><label style="text-transform:none"><input type="checkbox" id="pedF-proj" checked onchange="pedToggleProj(this)"> Detalhar proje\u00e7\u00e3o</label></div>'
    +'<div id="pedMsg" class="disp-note" style="min-height:14px"></div>'
    +'<div style="overflow-x:auto;max-height:520px;overflow-y:auto"><table class="dre-table ped-tbl"><thead><tr><th style="text-align:left">SKU \u00b7 Produto</th><th>Categ.</th><th>Curva</th><th>Dem./dia</th><th>Estoque</th><th>Cob. (d)</th><th class="cproj" title="Estoque de seguran\u00e7a em unidades e em dias de venda">Seguran\u00e7a</th><th title="Chance de faltar produto at\u00e9 a chegada do pedido">Risco</th><th>Status</th><th>Prioridade</th><th>Sugerido</th><th>Pedido</th><th class="cproj">Chega em</th><th class="cproj" title="Estoque previsto na chegada, sem o novo pedido">Est. na chegada</th><th class="cproj" title="Cobertura logo depois da chegada do pedido">Cob. na chegada</th><th class="cproj" title="Data em que o estoque zera se nada for pedido">Rompe em</th><th>Campanha</th><th>Fator</th><th>Custo un.</th><th>Invest.</th></tr></thead><tbody id="pedTbody"></tbody></table></div>'
    +'<div class="ped-totais" id="pedTotais"></div></div>';

  h += pedPainelHTML();

  h += pedDeparaPaginaHTML();
  /* par\u00e2metros */
  h += '<div class="chart-card"><div class="qd-header"><div><div class="chart-title">Par\u00e2metros</div><div class="chart-sub">Valores iniciais propostos \u2014 edit\u00e1veis. \u201cAplicar\u201d recalcula; \u201cSalvar\u201d grava para esta filial.</div></div>'
    +'<div style="white-space:nowrap"><button class="qd-btn" onclick="pedAplicarParametros(false)">Aplicar</button><button class="disp-save-btn" style="margin-left:8px" onclick="pedAplicarParametros(true)">Salvar par\u00e2metros</button></div></div><div id="pedParamMsg" class="disp-note"></div>'
    + PED_PARAM_CAMPOS.map(function(g){
        return '<div class="disp-section-label" style="margin-top:.8rem">'+g[0]+'</div><div class="ped-params">'+g[1].map(function(c){
          var v = R.P[c[0]];
          return '<div class="ped-param"><label>'+c[1]+'</label><input class="disp-input" style="width:100%;text-align:'+(c[2]==='text'?'left':'right')+'" id="pedP-'+c[0]+'" '+(c[2]==='text'?'type="text"':'type="number" step="'+c[2]+'"')+' value="'+escapeHtml(v)+'">'+(c[3]?'<div class="ped-sub">'+c[3]+'</div>':'')+'</div>'; }).join('')+'</div>'; }).join('')
    +'</div>';
  h += '<div class="confidential">\u00a9 2026 DGX Consulting \u00b7 Uso exclusivo Hawks Beauty '+nomeFilial()+' \u00b7 N\u00e3o compartilhar</div>';
  return h;
}
function pedMatrizHTML(R){
  var max = 1; ['A','B','C'].forEach(function(c){ ['X','Y','Z','\u2014'].forEach(function(x){ max=Math.max(max,R.matriz[c][x]); }); });
  return '<table class="dre-table ped-matriz"><thead><tr><th></th><th>X (est\u00e1vel)</th><th>Y (oscila)</th><th>Z (err\u00e1tica)</th><th>Novo/s.d.</th></tr></thead><tbody>'
    + ['A','B','C'].map(function(c){ return '<tr><td style="text-align:left;font-weight:600">Curva '+c+'</td>'+['X','Y','Z','\u2014'].map(function(x){
        var n=R.matriz[c][x]; return '<td style="background:rgba(0,180,216,'+(0.05+0.45*n/max).toFixed(2)+')">'+n+'</td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table>';
}

/* ── tabela de sugestão ── */
function pedQtdFinal(x){ return PED_EDICOES[x.sku] ? PED_EDICOES[x.sku].qtd : x.qtdSugerida; }
function pedFiltrou(){
  PED_FILTROS.prio = document.getElementById('pedF-prio').value; PED_FILTROS.cat = document.getElementById('pedF-cat').value;
  PED_FILTROS.curva = document.getElementById('pedF-curva').value; PED_FILTROS.busca = document.getElementById('pedF-busca').value;
  pedRenderTabela();
}
function pedListaFiltrada(){
  var F = PED_FILTROS, b = pedSemAcento(F.busca), rk = { agora:0, janela:1, ok:2 };
  return PED_RES.skus.filter(function(x){
    if (F.prio==='sem_venda' && !(x.semVenda && (x.est||0)>0 && !x.inativo)) return false;
    if (F.prio==='inativo' && !(x.inativo && (x.est||0)>0)) return false;
    if (F.prio==='fora' && x.truss) return false;
    if (F.prio==='risco' && !(x.truss && !x.inativo && x.qtdSugerida>0 && x.risco!==null && x.risco*100>=PED_RES.P.limite_risco)) return false;
    if (F.prio==='comprar' && x.prioridade==='ok' && !PED_EDICOES[x.sku]) return false;
    if ((F.prio==='agora'||F.prio==='janela') && x.prioridade!==F.prio) return false;
    if (F.cat!=='todas' && x.categoria!==F.cat) return false;
    if (F.curva!=='todas' && x.curva!==F.curva) return false;
    if (b && (pedSemAcento(x.skuOrig+' '+x.produto).indexOf(b)<0)) return false;
    return true;
  }).sort(function(a,b){ return (rk[a.prioridade]-rk[b.prioridade]) || (b.qtdSugerida-a.qtdSugerida) || (b.m.mediaPond-a.m.mediaPond); });
}
function pedRenderTabela(){
  var tb = document.getElementById('pedTbody'); if (!tb) return;
  PED_LINHAS = pedListaFiltrada();
  var R = PED_RES, lim = R.P.limite_risco, h = '';
  PED_LINHAS.slice(0,600).forEach(function(x,i){
    var st = PED_STATUS[x.status], q = pedQtdFinal(x), edit = !!PED_EDICOES[x.sku], orden = x.truss && !x.inativo;
    var pr = x.prioridade==='agora' ? '<span class="ped-tag" style="background:rgba(192,57,43,.18);color:#e74c3c">Comprar agora</span>'
      : (x.prioridade==='janela' ? '<span class="ped-tag" style="background:rgba(0,180,216,.15);color:#00B4D8">Pedir em '+pedFmtBRc(x.quandoPedir)+'</span>' : '<span style="opacity:.35">\u2014</span>');
    var tags = (x.m.novo?' <span class="ped-tag" style="background:rgba(0,180,216,.15);color:#00B4D8">novo</span>':'')+(!x.truss?' <span class="ped-tag" style="background:rgba(139,160,176,.18);color:#8BA0B0">fora da TRUSS</span>':'')+(x.semVenda?' <span class="ped-tag" style="background:rgba(200,184,154,.18);color:#C8B89A">sem venda</span>':'');
    var risco = (x.risco===null || !orden) ? '\u2014' : pedFmtN(x.risco*100,0)+'%', riscoAlto = x.risco!==null && orden && x.qtdSugerida>0 && x.risco*100>=lim;
    var camp = x.campProx ? '<span class="ped-tag" title="Campanha de '+pedMesLabel(x.campProx.mes)+': '+escapeHtml(x.campProx.pacote)+'. '+(x.campProx.pedirAte<R.sit.hoje ? 'O prazo para chegar antes do in\u00edcio j\u00e1 passou: pe\u00e7a agora' : 'Para chegar antes do in\u00edcio, pe\u00e7a at\u00e9 '+pedFmtBRc(x.campProx.pedirAte))+'." style="background:rgba(255,138,61,.16);color:#ff8a3d">'+Math.round(x.campProx.desc*100)+'% \u00b7 '+pedMesLabel(x.campProx.mes)+'</span>' : '\u2014';
    var pedido = x.qtdSugerida>0 || q>0;
    h += '<tr data-k="'+escapeHtml(x.sku)+'" class="'+(x.prioridade==='agora'?'ped-urg':'')+(x.sku===PED_SEL?' ped-sel':'')+'">'
      +'<td style="text-align:left;cursor:pointer" title="Clique para ver a curva do produto" onclick="pedPainelSelecionar('+i+',true)">'+escapeHtml(x.skuOrig)+' \u00b7 '+escapeHtml(x.produto).slice(0,44)+tags+'</td>'
      +'<td>'+escapeHtml(x.categoria)+'</td><td>'+x.curva+x.xyz+'</td><td>'+pedFmtN(x.dDia,2)+'</td><td>'+(x.est===null?'\u2014':pedFmtN(x.est))+'</td><td>'+(x.cobertura===null?'\u2014':pedFmtN(x.cobertura))+'</td>'
      +'<td class="cproj">'+(x.dDia>0 && orden ? pedFmtN(x.ss)+' \u00b7 '+pedFmtN(x.ssDias,0)+' d' : '\u2014')+'</td>'
      +'<td class="'+(riscoAlto?'ped-risco-alto':'')+'" title="Chance de faltar produto at\u00e9 a chegada de um pedido feito em '+pedFmtBRc(x.quandoPedir)+'">'+risco+'</td>'
      +'<td><span class="ped-tag" style="background:'+st[1]+'22;color:'+st[1]+'">'+st[0]+'</span></td><td>'+pr+'</td>'
      +'<td>'+pedFmtN(x.qtdSugerida)+'</td><td><input type="number" min="0" step="1" class="disp-input ped-inp'+(edit?' editado':'')+'" data-i="'+i+'" value="'+q+'" onchange="pedEditou(this)"></td>'
      +'<td class="cproj">'+(pedido && x.est!==null ? pedFmtBRc(x.chegaEm) : '\u2014')+'</td><td class="cproj">'+(pedido && x.estChegada!==null ? pedFmtN(Math.max(0,x.estChegada)) : '\u2014')+'</td>'
      +'<td class="cproj">'+(pedido && x.cobChegada!==null ? pedFmtN(x.cobChegada,0) : '\u2014')+'</td><td class="cproj">'+(x.rompeEm ? pedFmtBRc(x.rompeEm) : '\u2014')+'</td>'
      +'<td>'+camp+'</td><td><input type="text" class="disp-input ped-inp-f'+(x.fatorManual!==null?' editado':'')+'" data-i="'+i+'" value="'+(x.fatorManual!==null?String(x.fatorManual).replace('.',','):'')+'" placeholder="auto" title="Fator de campanha: 1,5 = 50% a mais de demanda. Vazio = autom\u00e1tico" onchange="pedFatorMudou(this)"></td>'
      +'<td>'+(x.custo===null?'\u2014':pedFmtN(x.custo,2))+'</td><td id="pedInv'+i+'">'+(x.custo===null?'\u2014':pedFmtR(q*x.custo))+'</td></tr>';
  });
  if (!PED_LINHAS.length) h = '<tr><td colspan="20" style="text-align:center;padding:1.5rem;color:#8BA0B0">Nenhum SKU neste filtro.</td></tr>';
  if (PED_LINHAS.length>600) h += '<tr><td colspan="20" style="text-align:center;color:#8BA0B0">Mostrando 600 de '+PED_LINHAS.length+' \u2014 refine o filtro.</td></tr>';
  tb.innerHTML = h; pedAtualizarTotais();
}
function pedEditou(inp){
  var x = PED_LINHAS[+inp.getAttribute('data-i')]; if (!x) return;
  var v = Math.max(0, Math.round(parseFloat(inp.value)||0)); inp.value = v;
  if (v===x.qtdSugerida) { delete PED_EDICOES[x.sku]; inp.classList.remove('editado'); } else { PED_EDICOES[x.sku] = { qtd:v, obs:'' }; inp.classList.add('editado'); }
  var c = document.getElementById('pedInv'+inp.getAttribute('data-i')); if (c) c.textContent = x.custo===null ? '\u2014' : pedFmtR(v*x.custo);
  pedAtualizarTotais();
}
function pedTotais(){
  var T = { agora:{un:0,inv:0,skus:0}, data:{un:0,inv:0,skus:0}, semCusto:0 };
  PED_RES.skus.forEach(function(x){
    var q = pedQtdFinal(x); if (q<=0) return;
    var g = x.prioridade==='agora' ? T.agora : T.data;
    g.un += q; g.skus++; if (x.custo!==null) g.inv += q*x.custo; else T.semCusto++;
  });
  return T;
}
function pedAtualizarTotais(){
  var el = document.getElementById('pedTotais'); if (!el) return;
  var T = pedTotais(), un = T.agora.un+T.data.un, inv = T.agora.inv+T.data.inv, ed = Object.keys(PED_EDICOES).length;
  el.innerHTML = '<span><strong>'+pedFmtN(T.agora.skus+T.data.skus)+'</strong> SKUs</span><span><strong>'+pedFmtN(un)+'</strong> unidades</span><span><strong>'+pedFmtR(inv)+'</strong> investimento estimado</span><span>'+pedFmtN(ed)+' linha(s) editada(s) pelo franqueado</span>'
    +(T.semCusto?'<span style="color:#C8B89A">'+T.semCusto+' SKU(s) sem custo conhecido ficam fora do valor</span>':'');
  pedRenderDesembolso();
}
function pedLinhasPedido(){
  var sit = PED_RES.sit;
  return PED_RES.skus.filter(function(x){ return pedQtdFinal(x)>0; }).map(function(x){
    var q = pedQtdFinal(x);
    return { sku:x.skuOrig, produto:x.produto, categoria:x.categoria, qtd:q, sug:x.qtdSugerida, custo:x.custo, inv:x.custo===null?null:q*x.custo,
             quando:(x.prioridade==='agora'?sit.hoje:sit.dataAlvo), prio:(x.prioridade==='agora'?'Comprar agora':'Data ideal'), key:x.sku, chega:x.chegaEm, fator:x.fatorManual };
  });
}
function pedExportarCSV(){
  var L = pedLinhasPedido(); if (!L.length) { pedMsg('Nada para exportar: nenhum SKU com quantidade.'); return; }
  function esc(v){ v = (v===null||v===undefined)?'':String(v); return /[;"\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; }
  var linhas = [['SKU','Produto','Categoria','Qtd pedido','Qtd sugerida','Custo unit. estimado','Investimento estimado','Quando pedir','Prioridade','Chega em','Fator campanha'].join(';')];
  L.forEach(function(x){ linhas.push([x.sku,x.produto,x.categoria,x.qtd,x.sug,x.custo===null?'':x.custo.toFixed(2).replace('.',','),x.inv===null?'':x.inv.toFixed(2).replace('.',','),pedFmtBR(x.quando),x.prio,(x.chega?pedFmtBR(x.chega):''),(x.fator===null||x.fator===undefined?'':String(x.fator).replace('.',','))].map(esc).join(';')); });
  var blob = new Blob(['\ufeff'+linhas.join('\r\n')], {type:'text/csv;charset=utf-8'});
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'pedido_dgxbeauty_'+FILIAL+'_'+pedYMD(PED_RES.sit.dataAlvo)+'.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
function pedMsg(t,erro){ var el=document.getElementById('pedMsg'); if(el){ el.textContent=t; el.style.color=erro?'#e74c3c':'#6B8BAA'; } }
async function pedSalvarRascunho(){
  var cid = clienteIdAtual(), now = new Date().toISOString();
  var linhas = PED_RES.skus.filter(function(x){ return pedQtdFinal(x)>0 || PED_EDICOES[x.sku] || PED_FATORES[x.sku]; }).map(function(x){
    return { cliente_id:cid, quinzena:PED_QUINZENA, sku:x.skuOrig, qtd_sugerida:x.qtdSugerida, qtd_pedido:pedQtdFinal(x), obs:(PED_EDICOES[x.sku]&&PED_EDICOES[x.sku].obs)||null, fator_campanha:(PED_FATORES[x.sku]||null), updated_at:now };
  });
  if (!linhas.length) { pedMsg('Nada para salvar.'); return; }
  var r = await sb.from('ped_pedido_item').upsert(linhas, { onConflict:'cliente_id,quinzena,sku' });
  if (r.error) { pedMsg('Erro ao salvar rascunho: '+r.error.message, true); return; }
  pedMsg('Rascunho salvo: '+linhas.length+' itens (quinzena de '+pedFmtBR(pedParseYMD(PED_QUINZENA))+').');
}
async function pedAplicarParametros(salvar){
  var novo = {}, linhas = [], cid = clienteIdAtual(), now = new Date().toISOString();
  PED_PARAM_CAMPOS.forEach(function(g){ g[1].forEach(function(c){
    var el = document.getElementById('pedP-'+c[0]); if (!el) return;
    novo[c[0]] = el.value; linhas.push({ cliente_id:cid, chave:c[0], valor:String(el.value), updated_at:now });
  }); });
  PED_PARAM = novo; pedRecalcular();
  if (!PED_ED_CARREGADAS) await pedCarregarEdicoes();
  var msg = 'Par\u00e2metros aplicados.';
  if (salvar) { var r = await sb.from('ped_parametro').upsert(linhas, { onConflict:'cliente_id,chave' }); msg = r.error ? 'Erro ao salvar: '+r.error.message : 'Par\u00e2metros salvos para '+nomeFilial()+'.'; }
  pedRefresh(); var m = document.getElementById('pedParamMsg'); if (m) m.textContent = msg;
}

/* ── desembolso ── */
function pedRenderDesembolso(){
  var el = document.getElementById('pedDesembolso'); if (!el || !PED_RES) return;
  var R = PED_RES, sit = R.sit, T = pedTotais(), dias = R.P.dias_faturamento;
  var unico = sit.diasAteAlvo===0;
  var cH = pedCenarioPrazo(sit.hoje, dias), cD = pedCenarioPrazo(sit.dataAlvo, dias);
  var totD = unico ? T.agora.inv+T.data.inv : T.data.inv, totH = unico ? 0 : T.agora.inv;
  if (!(totD>0 || totH>0)) { el.innerHTML = '<div class="plano-vazio">Sem investimento estimado: sem pedido com custo conhecido.</div>'; destroyChart('chartPedDesemb'); return; }
  var rows = [], datas = {};
  function add(c,v,rot){ c.parcelas.forEach(function(p,i){ var k=pedYMD(p.data); datas[k]=datas[k]||{d:p.data,h:0,t:0}; datas[k][rot]+=v/4; }); }
  if (totH>0) add(cH,totH,'h'); if (totD>0) add(cD,totD,'t');
  var ks = Object.keys(datas).sort();
  var head = '<th style="text-align:left">Vencimento</th>'+(totH>0?'<th>Pedido agora (hoje)</th>':'')+'<th>'+(unico?'Pedido hoje (data ideal)':'Pedido na data ideal')+'</th><th>Total</th>';
  var body = ks.map(function(k){ var o=datas[k]; return '<tr><td style="text-align:left">'+pedFmtBR(o.d)+'</td>'+(totH>0?'<td>'+pedFmtR(o.h)+'</td>':'')+'<td>'+pedFmtR(o.t)+'</td><td class="v-total">'+pedFmtR(o.h+o.t)+'</td></tr>'; }).join('');
  el.innerHTML = '<div class="ped-grid2"><div><table class="dre-table"><thead><tr>'+head+'</tr></thead><tbody>'+body+'<tr class="highlight"><td style="text-align:left">Total</td>'+(totH>0?'<td>'+pedFmtR(totH)+'</td>':'')+'<td>'+pedFmtR(totD)+'</td><td>'+pedFmtR(totH+totD)+'</td></tr></tbody></table>'
    +'<div class="ped-sub" style="margin-top:6px">Tabela '+cD.prazos.join('/')+' dias para o pedido na data ideal'+(totH>0?'; pedido de hoje usa '+cH.prazos.join('/')+' dias':'')+'. Faturamento '+dias+' d ap\u00f3s o pedido (a validar).</div></div>'
    +'<div class="chart-wrap" style="height:210px"><canvas id="chartPedDesemb"></canvas></div></div>';
  destroyChart('chartPedDesemb');
  var cv = document.getElementById('chartPedDesemb'); if (!cv || typeof Chart==='undefined') return;
  var ds = [{ label:(unico?'Pedido hoje':'Na data ideal'), data:ks.map(function(k){return datas[k].t;}), backgroundColor:'#00B4D8', stack:'s', borderRadius:3 }];
  if (totH>0) ds.unshift({ label:'Comprar agora', data:ks.map(function(k){return datas[k].h;}), backgroundColor:'#c0392b', stack:'s', borderRadius:3 });
  new Chart(cv, { type:'bar', data:{ labels:ks.map(function(k){return pedFmtBRc(datas[k].d);}), datasets:ds },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:ds.length>1, labels:{color:'#8BA0B0',font:{size:11}} } },
      scales:{ x:{ stacked:true, grid:{display:false}, ticks:{color:'#8BA0B0'} }, y:{ stacked:true, grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#8BA0B0', callback:function(v){return pedFmtR(v);}} } } } });
}

/* ── gráficos ── */
function pedDesenharGraficos(){
  if (typeof Chart==='undefined' || !PED_RES || !PED_RES.skus.length) return;
  var R = PED_RES, P = R.P, tc = '#8BA0B0', gc = 'rgba(255,255,255,0.06)';
  ['chartPedDisp','chartPedStatus','chartPedDemanda','chartPedPareto'].forEach(destroyChart);
  var CAP = 240, cor = { A:'#00B4D8', B:'#5B8DB8', C:'#A8C8E0' };
  /* dispersão: faixas suaves (risco, saudável, capital parado) e linha laranja da curva A */
  var cv = document.getElementById('chartPedDisp');
  if (cv) {
    var pts = R.skus.filter(function(x){ return x.dDia>0 && x.cobertura!==null && x.truss && !x.inativo; });
    var lt = P.lead_time, exc = P.excesso_mult*P.doh_alvo;
    var Apts = pts.filter(function(x){ return x.curva==='A'; }), cutA = Apts.length ? Math.min.apply(null, Apts.map(function(x){ return x.dDia; })) : null;
    var nAR = Apts.filter(function(x){ return x.cobertura<lt; }).length;
    var dmin = pts.length ? Math.min.apply(null, pts.map(function(x){ return x.dDia; })) : 1, dmax = pts.length ? Math.max.apply(null, pts.map(function(x){ return x.dDia; })) : 10;
    var xmin = Math.pow(10, Math.floor(Math.log(dmin)/Math.LN10)), xmax = Math.pow(10, Math.ceil(Math.log(dmax)/Math.LN10));
    var ds = ['A','B','C'].map(function(c){
      return { label:'Curva '+c, backgroundColor:cor[c]+'cc', borderColor:'#3d6e94', borderWidth:1,
        data: pts.filter(function(x){ return x.curva===c; }).map(function(x){ return { x:x.dDia, y:Math.min(x.cobertura,CAP), r:Math.max(3,Math.min(14,3+Math.sqrt(Math.max(0,x.est||0))*0.28)), _x:x }; }) };
    });
    var zonas = { id:'pedZonas',
      beforeDatasetsDraw:function(ch){ var a=ch.chartArea, y=ch.scales.y, x=ch.scales.x, c=ch.ctx, yL=y.getPixelForValue(lt), yE=y.getPixelForValue(Math.min(exc,CAP));
        c.save(); c.fillStyle='rgba(208,59,59,0.06)'; c.fillRect(a.left,yL,a.width,a.bottom-yL);
        c.fillStyle='rgba(12,163,12,0.04)'; c.fillRect(a.left,yE,a.width,yL-yE);
        c.fillStyle='rgba(250,178,25,0.07)'; c.fillRect(a.left,a.top,a.width,yE-a.top);
        if (cutA!==null) { var xa=x.getPixelForValue(cutA); c.fillStyle='rgba(208,59,59,0.06)'; c.fillRect(xa,yL,a.right-xa,a.bottom-yL); }
        c.restore(); },
      afterDatasetsDraw:function(ch){ var a=ch.chartArea, y=ch.scales.y, x=ch.scales.x, c=ch.ctx, yL=y.getPixelForValue(lt), yE=y.getPixelForValue(Math.min(exc,CAP));
        c.save(); c.setLineDash([5,4]); c.lineWidth=1; c.strokeStyle='#6B8BAA';
        [yL,yE].forEach(function(q){ c.beginPath(); c.moveTo(a.left,q); c.lineTo(a.right,q); c.stroke(); }); c.restore();
        if (cutA!==null) { var xa=x.getPixelForValue(cutA); c.save(); c.setLineDash([7,5]); c.lineWidth=1.8; c.strokeStyle='#ff8a3d'; c.shadowColor='rgba(255,122,26,0.95)'; c.shadowBlur=14;
          c.beginPath(); c.moveTo(xa,a.top); c.lineTo(xa,a.bottom); c.stroke(); c.stroke(); c.restore(); }
        c.save(); c.font='500 12px sans-serif'; c.textAlign='left'; c.fillStyle=tc;
        c.fillText('Capital parado (acima de '+pedFmtN(exc,0)+' d)',a.left+8,a.top+16); c.fillText('Saud\u00e1vel ('+pedFmtN(lt,0)+' a '+pedFmtN(exc,0)+' d)',a.left+8,yE+16); c.fillText('Risco de ruptura (abaixo de '+pedFmtN(lt,0)+' d)',a.left+8,yL+16);
        if (cutA!==null) { var xb=x.getPixelForValue(cutA); c.fillStyle='#ff8a3d'; c.fillText('Curva A: acima de '+pedFmtN(cutA,1)+' un./dia',xb+8,a.top+16); c.fillStyle=tc; c.textAlign='right'; c.fillText('Risco de alto impacto: '+nAR+' de '+Apts.length+' produtos A',a.right-8,a.bottom-8); }
        c.textAlign='left'; c.font='11px sans-serif';
        c.restore(); } };
    new Chart(cv, { type:'bubble', plugins:[zonas], data:{ datasets:ds }, options:{ responsive:true, maintainAspectRatio:false, layout:{ padding:{ right:12, top:4 } }, plugins:{ legend:{display:false},
        tooltip:{ callbacks:{ label:function(c){ var x=c.raw._x; return [x.skuOrig+' \u00b7 '+x.produto.slice(0,30), 'Demanda: '+pedFmtN(x.dDia,2)+'/dia \u00b7 Estoque: '+pedFmtN(x.est)+' \u00b7 Cobertura: '+pedFmtN(x.cobertura)+' d']; } } } },
      scales:{ x:{ type:'logarithmic', min:xmin, max:xmax, title:{display:true,text:'Demanda di\u00e1ria (un./dia, escala log)',color:tc,font:{size:10}}, ticks:{color:tc, callback:function(v){ return [0.01,0.02,0.05,0.1,0.2,0.5,1,2,5,10,20,50,100,200,500,1000].indexOf(v)>=0 ? v : ''; }}, grid:{color:gc} },
               y:{ min:-12, max:CAP+12, title:{display:true,text:'Cobertura (dias; limitada a '+CAP+')',color:tc,font:{size:10}}, ticks:{color:tc, stepSize:30, callback:function(v){ return v<0 ? '' : v; }}, grid:{display:false} } } } });
  }
  /* status por categoria */
  cv = document.getElementById('chartPedStatus');
  if (cv) {
    var cats = {}; R.skus.forEach(function(x){ cats[x.categoria]=1; }); cats = Object.keys(cats).sort();
    var sts = ['ruptura','critico','ok','excesso','sem_giro'];
    new Chart(cv, { type:'bar', data:{ labels:cats, datasets: sts.map(function(s){ return { label:PED_STATUS[s][0], backgroundColor:PED_STATUS[s][1],
        data:cats.map(function(c){ return R.skus.filter(function(x){return x.categoria===c && x.status===s;}).length; }), stack:'a' }; }) },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{stacked:true,grid:{display:false},ticks:{color:tc}}, y:{stacked:true,grid:{color:gc},ticks:{color:tc,precision:0}} } } });
  }
  /* demanda mensal + ano anterior */
  cv = document.getElementById('chartPedDemanda');
  if (cv) {
    var n = R.meses.length, tot = R.meses.map(function(k,i){ return k>=R.minKey ? R.serieTotal[i] : null; });
    var prev = R.meses.map(function(k,i){ return i>=12 ? tot[i-12] : null; });
    new Chart(cv, { type:'line', data:{ labels:R.meses.map(pedMesLabel), datasets:[
      { label:'Unidades', data:tot, borderColor:'#00B4D8', backgroundColor:'rgba(0,180,216,0.10)', fill:true, tension:0.3, pointRadius:3, borderWidth:2.5 },
      { label:'Ano anterior', data:prev, borderColor:'#8BA0B0', borderDash:[5,4], fill:false, tension:0.3, pointRadius:0, borderWidth:1.5 } ] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:true,labels:{color:tc,font:{size:11}}} }, scales:{ x:{grid:{display:false},ticks:{color:tc,maxRotation:60,autoSkip:true}}, y:{grid:{color:gc},ticks:{color:tc,callback:function(v){return pedFmtN(v);}}} } } });
  }
  /* pareto */
  cv = document.getElementById('chartPedPareto');
  if (cv) {
    var pts = R.pareto.filter(function(p,i){ return i%Math.max(1,Math.floor(R.pareto.length/120))===0 || i===R.pareto.length-1; }).map(function(p){ return {x:p.rank,y:p.acum}; });
    pts.unshift({x:0,y:0});
    new Chart(cv, { type:'scatter', data:{ datasets:[
      { label:'% acumulado das unidades', data:pts, showLine:true, borderColor:'#00B4D8', backgroundColor:'rgba(0,180,216,0.12)', fill:true, pointRadius:0, borderWidth:2.5, tension:0.2 },
      { label:'Corte A', data:[{x:0,y:P.corte_a},{x:100,y:P.corte_a}], showLine:true, borderColor:'#e67e22', borderDash:[4,4], pointRadius:0, borderWidth:1 },
      { label:'Corte B', data:[{x:0,y:P.corte_b},{x:100,y:P.corte_b}], showLine:true, borderColor:'#5B8DB8', borderDash:[4,4], pointRadius:0, borderWidth:1 } ] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{min:0,max:100,title:{display:true,text:'% dos SKUs (ordenados por unidades)',color:tc,font:{size:10}},ticks:{color:tc,callback:function(v){return v+'%';}},grid:{color:gc}}, y:{min:0,max:100,ticks:{color:tc,callback:function(v){return v+'%';}},grid:{color:gc}} } } });
  }
}


/* ── auxiliares de atualização da tela ── */
var PED_PROJ_COLS = true;
function pedToggleProj(cb){ PED_PROJ_COLS = !!cb.checked; var t = document.querySelector('.ped-tbl'); if (t) t.classList.toggle('ped-sem-proj', !PED_PROJ_COLS); }
function pedAplicarFiltrosNaTela(){
  var F = PED_FILTROS; [['pedF-prio',F.prio],['pedF-cat',F.cat],['pedF-curva',F.curva],['pedF-busca',F.busca]].forEach(function(p){ var el = document.getElementById(p[0]); if (el) el.value = p[1]; });
  var tg = document.getElementById('pedF-proj'); if (tg) { tg.checked = PED_PROJ_COLS; pedToggleProj(tg); }
}
function pedRefresh(){
  pedRecalcular(); var root = document.getElementById('pedRoot'); if (!root) return; var y = window.scrollY;
  root.innerHTML = pedPaginaHTML(); pedAplicarFiltrosNaTela(); pedRenderTabela(); pedRenderDesembolso(); pedPainelRender(); setTimeout(pedDesenharGraficos, 60); window.scrollTo(0,y);
}

/* ══════════════════════════════════════════════════════════════════════
   ESTOQUE — IMPORTAÇÃO: TELA (upload bruto → prévia → confirmar)
   Grava: ped_estoque (posição), ped_depara (ligações manuais) e
   ped_upload_bruto (cópia do arquivo original).
══════════════════════════════════════════════════════════════════════ */
var PED_IMP = null, PED_PODE_IMPORTAR = false, PED_FRANQUEADO_IMPORTA = false, PED_AVISO_OK = '', PED_DEC_PAG = {};
function pedImpFilialDoNome(nome){ var m = /^(mg|mt)/i.exec(String(nome||'').trim()); return m ? m[1].toLowerCase() : ''; }
function pedImpDataDoNome(nome){
  var m = /(\d{2})(\d{2})(\d{4}|\d{2})?(?=\D|$)/.exec(String(nome||'')); if (!m) return '';
  var d = +m[1], mo = +m[2], a = m[3] ? (m[3].length===2 ? 2000+(+m[3]) : +m[3]) : new Date().getFullYear();
  if (d<1 || d>31 || mo<1 || mo>12) return '';
  return a+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}
function pedImpHTML(){
  if (!PED_PODE_IMPORTAR) return '';
  var aberto = PED_IMP || !PED_ESTOQUE.length;
  return '<details class="chart-card ped-imp" id="pedImp"'+(aberto?' open':'')+'><summary class="chart-title" style="cursor:pointer">Importar estoque <span class="ped-sub" style="font-weight:400">\u2014 arquivo do sistema, do jeito que sai (CSV)</span></summary>'
    +'<div class="chart-sub" style="margin-top:6px">O portal l\u00ea o arquivo bruto, liga os c\u00f3digos de venda aos produtos do estoque e mostra uma pr\u00e9via antes de gravar. Filial desta p\u00e1gina: <strong>'+nomeFilial()+'</strong>.</div>'
    +'<div class="bi-filters"><input type="file" id="pedImpFile" accept=".csv,.txt,text/csv" onchange="pedImpArquivo(this)" class="disp-input" style="width:auto;text-align:left"></div>'
    +'<div id="pedImpPrev">'+(PED_IMP?pedImpPrevHTML():'')+'</div></details>';
}
function pedImpArquivo(inp){
  var f = inp.files && inp.files[0]; if (!f) return;
  var rd = new FileReader(); rd.onload = function(){ pedImpProcessar(rd.result, f.name); }; rd.readAsArrayBuffer(f);
}
function pedImpProcessar(buf, nome){
  var d = pedDecodificar(buf), p = pedParseCSV(d.texto), m = pedMapearColunas(p.rows[0]||[]);
  var imp = { nome:nome, texto:d.texto, codificacao:d.codificacao, filialNome:pedImpFilialDoNome(nome), data:(pedImpDataDoNome(nome)||pedYMD(new Date())), erro:'', override:false, dec:{}, delim:p.delim };
  if (m.faltando.length || p.rows.length<2) {
    imp.erro = p.rows.length<2 ? 'O arquivo n\u00e3o tem linhas de dados.' : 'Colunas obrigat\u00f3rias n\u00e3o encontradas: '+m.faltando.join(', ')+'. Colunas do arquivo: '+(p.rows[0]||[]).join(' | ');
    PED_IMP = imp; pedImpRender(); return imp;
  }
  var it = pedInterpretarEstoque(p.rows, m.map); imp.itens = it.linhas; imp.ign = it.ignoradas; imp.dup = it.duplicadas;
  imp.byKey = {}; imp.itens.forEach(function(x){ imp.byKey[pedNormSku(x.sku)] = x; });
  imp.info = pedMontarAlias(pedProdutosVenda(FV_HAWKS), imp.itens, PED_DEPARA);
  imp.info.pendentes.forEach(function(x){ if (x.sugerido) imp.dec[x.p.sku] = x.sugerido; });
  PED_IMP = imp; pedImpRender(); return imp;
}
function pedImpRender(){
  var el = document.getElementById('pedImpPrev'); if (!el) return;
  el.innerHTML = pedImpPrevHTML(); var d = document.getElementById('pedImp'); if (d) d.open = true;
}
function pedPendentesTabelaHTML(pend, byKey, dec, fn){
  var rows = pend.slice(0,40).map(function(x){
    var sel = dec[x.p.sku]!==undefined ? dec[x.p.sku] : '';
    var ops = '<option value="">(escolher)</option>' + x.candidatos.map(function(c){ var e = byKey[c.k]; return '<option value="'+escapeHtml(c.k)+'"'+(sel===c.k?' selected':'')+'>'+escapeHtml(e.sku)+' \u00b7 '+escapeHtml(e.produto).slice(0,46)+(e.status!=='A'?' ['+e.status+']':'')+'</option>'; }).join('')
      + '<option value="-"'+(sel==='-'?' selected':'')+'>(sem correspond\u00eancia \u2014 ignorar)</option>';
    return '<tr><td style="text-align:left">'+escapeHtml(x.p.skuOrig)+'</td><td style="text-align:left">'+escapeHtml(x.p.produto).slice(0,50)+'</td><td>'+pedFmtN(x.p.unid12m)+'</td><td><select class="disp-input" style="width:100%;text-align:left" onchange="'+fn+'(\''+escapeHtml(x.p.sku).replace(/\\/g,'')+'\',this.value)">'+ops+'</select></td></tr>';
  }).join('');
  return '<table class="dre-table"><thead><tr><th style="text-align:left">C\u00f3d. venda</th><th style="text-align:left">Produto vendido</th><th>Un. 12m</th><th style="text-align:left;min-width:300px">Corresponde a (produto do estoque)</th></tr></thead><tbody>'+rows+'</tbody></table>'
    + (pend.length>40 ? '<div class="ped-sub">Mostrando 40 de '+pend.length+' (os de maior venda).</div>' : '');
}
function pedImpPrevHTML(){
  var I = PED_IMP; if (!I) return '';
  if (I.erro) return '<div class="ped-banner err">'+escapeHtml(I.erro)+'</div>';
  var A = I.info, n = I.itens.length, uni = 0, truss = 0, outros = 0, inat = 0, inatEst = 0, zero = 0, neg = 0, ativos = 0;
  var tl = String(pedParams().fornecedores_truss).split(/[,;]+/).map(pedSemAcento).filter(Boolean);
  I.itens.forEach(function(x){ uni += x.qtd; var t = pedEhTruss(x.fornecedor, x.produto, tl);
    if (t) truss++; else outros++; if (x.status!=='A') { inat++; if (x.qtd>0) inatEst++; } else { ativos++; if (x.qtd===0) zero++; } if (x.qtd<0) neg++; });
  function c(l,v,s){ return '<div class="kpi"><div class="kpi-label">'+l+'</div><div class="kpi-value" style="font-size:18px">'+v+'</div><div class="kpi-sub">'+(s||'')+'</div></div>'; }
  var h = '<div class="ped-sub" style="margin:8px 0">Arquivo <strong>'+escapeHtml(I.nome)+'</strong> \u00b7 '+I.codificacao+' \u00b7 separador \u201c'+(I.delim==='\t'?'tab':I.delim)+'\u201d</div>';
  h += '<div class="bi-filters"><label>Data da posi\u00e7\u00e3o</label><input type="date" id="pedImpData" class="disp-input" style="width:auto" value="'+I.data+'" onchange="PED_IMP.data=this.value">';
  if (I.filialNome && I.filialNome!==FILIAL) h += '<span class="ped-banner err" style="margin:0">O nome do arquivo indica <strong>'+I.filialNome.toUpperCase()+'</strong>, mas esta p\u00e1gina \u00e9 <strong>'+nomeFilial()+'</strong>. <label style="color:#e74c3c;text-transform:none"><input type="checkbox" onchange="PED_IMP.override=this.checked"> importar mesmo assim</label></span>';
  h += '</div><div class="kpi-grid">'
    + c('Produtos lidos', pedFmtN(n), pedFmtN(I.ign.length)+' linha(s) ignorada(s)'+(I.dup?' \u00b7 '+I.dup+' duplicada(s) somada(s)':''))
    + c('Unidades dispon\u00edveis', pedFmtN(uni), 'f\u00edsico menos reservado e consignado')
    + c('TRUSS / outros', pedFmtN(truss)+' / '+pedFmtN(outros), 'fornecedores: '+escapeHtml(pedParams().fornecedores_truss))
    + c('Inativos', pedFmtN(inat), pedFmtN(inatEst)+' com estoque \u00b7 '+pedFmtN(zero)+' ativos zerados'+(neg?' \u00b7 '+neg+' negativo(s)':''))
    + '</div>';
  var cb = A.cobertura, cor = cb.pct>=0.98 ? '#2ECC71' : (cb.pct>=0.9 ? '#C8B89A' : '#e74c3c');
  h += '<div class="disp-section-label">De-para de c\u00f3digos (vendas \u2192 estoque)</div><div class="ped-sub" style="font-size:12px;margin-bottom:8px">'
    + '<strong style="color:'+cor+'">'+pedFmtN(cb.skusLigados)+' de '+pedFmtN(cb.skus)+'</strong> produtos vendidos nos \u00faltimos 12 meses ligados ao estoque (<strong style="color:'+cor+'">'+(cb.pct*100).toFixed(1).replace('.',',')+'%</strong> das unidades). '
    + 'Ligados por c\u00f3digo do produto: '+A.cont.codigo+' \u00b7 por c\u00f3digo do fornecedor: '+A.cont.fornecedor+' \u00b7 por nome igual: '+A.cont.nome+' \u00b7 manual: '+A.cont.manual+'.'+(A.ambiguos.length?' <span style="color:#C8B89A">'+A.ambiguos.length+' c\u00f3digo(s) reciclado(s) resolvido(s) pelo nome \u2014 confira abaixo.</span>':'')+'</div>';
  if (A.ambiguos.length) h += '<div class="ped-sub" style="margin-bottom:8px">Reciclados: '+A.ambiguos.slice(0,8).map(function(x){ var e=I.byKey[x.escolhido]; return escapeHtml(x.p.skuOrig)+' \u2192 '+escapeHtml(e.sku)+' ('+escapeHtml(e.produto).slice(0,28)+')'; }).join(' \u00b7 ')+'</div>';
  if (A.pendentes.length) h += '<div class="ped-banner">'+A.pendentes.length+' produto(s) vendido(s) sem correspond\u00eancia no estoque. Escolha o produto certo (as sugest\u00f5es j\u00e1 v\u00eam marcadas) ou ignore. As escolhas ficam salvas para os pr\u00f3ximos arquivos.</div>'+pedPendentesTabelaHTML(A.pendentes, I.byKey, I.dec, 'pedImpDec');
  var sv = A.semVenda.filter(function(x){ return x.qtd>0 && x.status==='A'; });
  h += '<div class="ped-sub" style="margin:10px 0">Estoque sem venda (produto ativo com estoque e nenhuma venda ligada): <strong>'+pedFmtN(sv.length)+'</strong>. Aparece no filtro \u201cEstoque sem venda\u201d da tabela.</div>';
  h += '<div style="display:flex;align-items:center;gap:12px;margin-top:12px"><button class="disp-save-btn" onclick="pedImpConfirmar()">Confirmar e importar</button><span id="pedImpMsg" class="disp-note"></span></div>';
  return h;
}
function pedImpDec(sku, v){ if (PED_IMP) PED_IMP.dec[sku] = v; }
async function pedImpConfirmar(){
  var I = PED_IMP; if (!I || !I.itens) return;
  var msg = document.getElementById('pedImpMsg'); function m(t,e){ if (msg){ msg.textContent=t; msg.style.color = e?'#e74c3c':'#6B8BAA'; } }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(I.data||'')) return m('Informe a data da posi\u00e7\u00e3o.', true);
  if (I.filialNome && I.filialNome!==FILIAL && !I.override) return m('O nome do arquivo indica '+I.filialNome.toUpperCase()+', mas esta p\u00e1gina \u00e9 '+nomeFilial()+'. Troque a filial no topo ou marque \u201cimportar mesmo assim\u201d.', true);
  var cid = clienteIdAtual(), now = new Date().toISOString(); m('Gravando\u2026');
  var linhas = I.itens.map(function(x){ return { cliente_id:cid, data_posicao:I.data, sku:x.sku, produto:x.produto, categoria:x.categoria, qtd:x.qtd, qtd_transito:x.qtd_transito,
    fisico:x.fisico, reservado:x.reservado, consignado:x.consignado, status:x.status, fornecedor:x.fornecedor, codigo_produto:x.codigo_produto, codigo_fornecedor:x.codigo_fornecedor, arquivo:I.nome }; });
  for (var i=0;i<linhas.length;i+=400) {
    var r = await sb.from('ped_estoque').upsert(linhas.slice(i,i+400), { onConflict:'cliente_id,data_posicao,sku' });
    if (r.error) return m('Erro ao gravar o estoque: '+r.error.message, true);
  }
  var man = []; Object.keys(I.dec).forEach(function(sku){ var v = I.dec[sku]; if (v) man.push({ cliente_id:cid, sku_venda:sku, sku_estoque:v, origem:'manual', updated_at:now }); });
  if (man.length) { var r2 = await sb.from('ped_depara').upsert(man, { onConflict:'cliente_id,sku_venda' }); if (r2.error) return m('Estoque gravado, mas erro ao salvar as liga\u00e7\u00f5es: '+r2.error.message, true); }
  var r3 = await sb.from('ped_upload_bruto').insert({ cliente_id:cid, data_posicao:I.data, nome_arquivo:I.nome, codificacao:I.codificacao, linhas:I.itens.length, conteudo:I.texto });
  var aviso = r3.error ? ' (a c\u00f3pia do arquivo bruto n\u00e3o foi guardada: '+r3.error.message+')' : '';
  PED_AVISO_OK = 'Estoque de '+nomeFilial()+' importado: '+I.itens.length+' produtos, posi\u00e7\u00e3o de '+pedFmtBR(pedParseYMD(I.data))+'.'+aviso;
  PED_IMP = null; PED_CARREGADO = false; PED_ED_CARREGADAS = false;
  var root = document.getElementById('pedRoot'); if (root) root.innerHTML = '<div style="padding:3rem;text-align:center;color:#8BA0B0;font-size:13px">Atualizando\u2026</div>';
  await initEstoque();
}

/* ── revisão de de-para direto na página (sem novo upload) ── */
function pedDeparaPaginaHTML(){
  if (!PED_PODE_IMPORTAR || !PED_ALIAS || !PED_ALIAS.pendentes.length) return '';
  var byKey = {}; PED_ESTOQUE.forEach(function(x){ byKey[pedNormSku(x.sku)] = { sku:x.codigo_produto||x.sku, produto:x.produto||'', status:x.status||'A' }; });
  var pend = PED_ALIAS.pendentes.filter(function(x){ return x.candidatos.every(function(c){ return byKey[c.k]; }); });
  pend.forEach(function(x){ if (PED_DEC_PAG[x.p.sku]===undefined && x.sugerido) PED_DEC_PAG[x.p.sku] = x.sugerido; });
  return '<div class="chart-card"><div class="qd-header"><div><div class="chart-title">C\u00f3digos de venda sem produto no estoque ('+PED_ALIAS.pendentes.length+')</div><div class="chart-sub">Ligue cada c\u00f3digo ao produto certo; fica salvo e vale nos pr\u00f3ximos arquivos. Sem correspond\u00eancia = ignorar.</div></div>'
    +'<div style="white-space:nowrap"><button class="disp-save-btn" onclick="pedDeparaSalvar()">Salvar liga\u00e7\u00f5es</button></div></div><div id="pedDeparaMsg" class="disp-note"></div>'
    + pedPendentesTabelaHTML(pend, byKey, PED_DEC_PAG, 'pedDeparaDec')+'</div>';
}
function pedDeparaDec(sku, v){ PED_DEC_PAG[sku] = v; }
async function pedDeparaSalvar(){
  var cid = clienteIdAtual(), now = new Date().toISOString(), man = [];
  Object.keys(PED_DEC_PAG).forEach(function(sku){ var v = PED_DEC_PAG[sku]; if (v) man.push({ cliente_id:cid, sku_venda:sku, sku_estoque:v, origem:'manual', updated_at:now }); });
  var el = document.getElementById('pedDeparaMsg'); if (!man.length) { if (el) el.textContent = 'Nada selecionado.'; return; }
  var r = await sb.from('ped_depara').upsert(man, { onConflict:'cliente_id,sku_venda' });
  if (r.error) { if (el) { el.textContent = 'Erro ao salvar: '+r.error.message; el.style.color = '#e74c3c'; } return; }
  man.forEach(function(x){ PED_DEPARA[x.sku_venda] = x.sku_estoque; }); PED_DEC_PAG = {};
  PED_AVISO_OK = 'Liga\u00e7\u00f5es salvas: '+man.length+'.'; PED_ED_CARREGADAS = false; await initEstoque();
}

/* ══════════════════════════════════════════════════════════════════════
   CAMPANHAS — importação da tabela de ciclo e fator manual por SKU
   Grava: ped_campanha (um registro por SKU e mês de vigência), ped_upload_bruto (cópia).
══════════════════════════════════════════════════════════════════════ */
var PED_CAMP_ROWS = [], PED_CAMP = {}, PED_CAMP_IMP = null, PED_FATORES = {};
function pedCampResumoHTML(){
  if (!PED_CAMP_ROWS.length) return '<div class="ped-sub" style="margin:8px 0">Nenhuma campanha importada ainda. Sem campanha, a demanda de cada produto segue a m\u00e9dia do hist\u00f3rico.</div>';
  var por = {}; PED_CAMP_ROWS.forEach(function(r){ var k = String(r.mes).slice(0,7); (por[k] = por[k] || {})[pedNormSku(r.sku_venda)] = Math.max(por[k][pedNormSku(r.sku_venda)]||0, parseFloat(r.desconto)||0); });
  return '<div class="ped-sub" style="margin:8px 0">Calend\u00e1rio importado: '+Object.keys(por).sort().map(function(k){ var n = Object.keys(por[k]).length, f = Object.keys(por[k]).filter(function(s){ return por[k][s]>=0.145; }).length; return '<strong>'+pedMesLabel(k)+'</strong> ('+n+' SKUs, '+f+' com 15% ou mais)'; }).join(' \u00b7 ')+'</div>';
}
function pedCampHTML(){
  if (!PED_PODE_IMPORTAR) return '';
  return '<details class="chart-card ped-imp" id="pedCamp"'+(PED_CAMP_IMP?' open':'')+'><summary class="chart-title" style="cursor:pointer">Campanhas <span class="ped-sub" style="font-weight:400">\u2014 tabela de ciclo da franqueadora (aba \u201cCiclo\u201d, xlsx ou csv)</span></summary>'
    +'<div class="chart-sub" style="margin-top:6px">A campanha entra na demanda: os meses de campanha saem da m\u00e9dia de base, e o pedido considera o efeito (fator) nos meses em que o produto est\u00e1 em campanha. O fator come\u00e7a neutro (1,0) e passa a ser medido no pr\u00f3prio produto quando h\u00e1 2 ou mais meses de campanha no hist\u00f3rico. Voc\u00ea tamb\u00e9m pode ajustar o fator na tabela do pedido.</div>'
    + pedCampResumoHTML()
    +'<div class="bi-filters"><input type="file" id="pedCampFile" accept=".xlsx,.xls,.csv,.txt" onchange="pedCampArquivo(this)" class="disp-input" style="width:auto;text-align:left"></div>'
    +'<div id="pedCampPrev">'+(PED_CAMP_IMP?pedCampPrevHTML():'')+'</div></details>';
}
function pedCampArquivo(inp){
  var f = inp.files && inp.files[0]; if (!f) return;
  var rd = new FileReader(); rd.onload = function(){ pedCampLerBuffer(rd.result, f.name); }; rd.readAsArrayBuffer(f);
}
function pedCampLerBuffer(buf, nome){
  try {
    if (/\.(csv|txt)$/i.test(nome)) { var d = pedDecodificar(buf), p = pedParseCSV(d.texto); return pedCampProcessarAOA(p.rows, nome, d.texto, ''); }
    if (typeof XLSX==='undefined') { PED_CAMP_IMP = { nome:nome, erro:'A biblioteca de planilha n\u00e3o carregou neste navegador. Salve a aba \u201cCiclo\u201d como CSV e envie de novo.' }; return pedCampRender(); }
    var meta = XLSX.read(buf, { type:'array', bookSheets:true }), nomes = meta.SheetNames.slice().sort(function(a,b){ return (/ciclo|campanha/i.test(b)?1:0) - (/ciclo|campanha/i.test(a)?1:0); });
    var pref = nomes.filter(function(n){ return /ciclo|campanha/i.test(n); }), alvo = pref.length ? pref : nomes;
    var wb = XLSX.read(buf, { type:'array', sheets:alvo }), achou = null;
    for (var i=0;i<alvo.length && !achou;i++){ var ws = wb.Sheets[alvo[i]]; if (!ws) continue;
      var aoa = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:'' }), t = pedInterpretarCiclo(aoa);
      if (!t.erro && t.linhas.length) achou = { aoa:aoa, aba:alvo[i], csv:XLSX.utils.sheet_to_csv(ws) }; }
    if (!achou) { PED_CAMP_IMP = { nome:nome, erro:'Nenhuma aba parece uma tabela de campanha (colunas SKU e PACOTE).' }; return pedCampRender(); }
    return pedCampProcessarAOA(achou.aoa, nome, achou.csv, achou.aba);
  } catch(e){ PED_CAMP_IMP = { nome:nome, erro:'N\u00e3o consegui ler o arquivo: '+(e && e.message || e) }; pedCampRender(); }
}
function pedProdutosComCamp(extras){
  var prods = pedProdutosVenda(FV_HAWKS), seen = {}; prods.forEach(function(p){ seen[p.sku] = 1; });
  PED_CAMP_ROWS.forEach(function(r){ var k = pedNormSku(r.sku_venda); if (!seen[k]) { seen[k] = 1; prods.push({ sku:k, skuOrig:r.sku_venda, produto:'', unid:0, unid12m:0, meses:{} }); } });
  (extras||[]).forEach(function(l){ if (!seen[l.key]) { seen[l.key] = 1; prods.push({ sku:l.key, skuOrig:l.sku, produto:l.produto||'', unid:0, unid12m:0, meses:{} }); } });
  return prods;
}
function pedCampLigacao(linhas){
  var est = {}, vend = {}, ok = 0, soVenda = 0, sem = [];
  PED_ESTOQUE.forEach(function(e){ est[pedNormSku(e.sku)] = 1; }); pedProdutosVenda(FV_HAWKS).forEach(function(p){ vend[p.sku] = 1; });
  var alias = PED_ESTOQUE.length ? pedMontarAlias(pedProdutosComCamp(linhas), PED_ESTOQUE, PED_DEPARA).alias : {};
  linhas.forEach(function(l){ var k = alias[l.key] || l.key; if (est[k]) ok++; else if (vend[k]) soVenda++; else sem.push(l); });
  return { ok:ok, soVenda:soVenda, sem:sem };
}
function pedCampProcessarAOA(aoa, nome, csv, aba){
  var t = pedInterpretarCiclo(aoa), I = { nome:nome, aba:aba||'', csv:csv||'', erro:t.erro||'' };
  if (!t.erro) { I.linhas = t.linhas; I.brutas = t.brutas; I.periodo = t.periodo; I.pacotes = t.pacotes; I.semDesconto = t.semDesconto;
    I.mesIni = t.mes || pedYMD(new Date()).slice(0,7); I.mesFim = I.mesIni; I.liga = pedCampLigacao(t.linhas); }
  PED_CAMP_IMP = I; pedCampRender(); return I;
}
function pedCampRender(){
  var el = document.getElementById('pedCampPrev'); if (!el) return;
  el.innerHTML = pedCampPrevHTML(); var d = document.getElementById('pedCamp'); if (d) d.open = true;
}
function pedCampPrevHTML(){
  var I = PED_CAMP_IMP; if (!I) return '';
  if (I.erro) return '<div class="ped-banner err">'+escapeHtml(I.erro)+'</div>';
  var n = I.linhas.length, f15 = I.linhas.filter(function(l){ return l.desconto!==null && l.desconto>=0.145; }).length, L = I.liga;
  function c(l,v,s){ return '<div class="kpi"><div class="kpi-label">'+l+'</div><div class="kpi-value" style="font-size:18px">'+v+'</div><div class="kpi-sub">'+(s||'')+'</div></div>'; }
  var h = '<div class="ped-sub" style="margin:8px 0">Arquivo <strong>'+escapeHtml(I.nome)+'</strong>'+(I.aba?' \u00b7 aba \u201c'+escapeHtml(I.aba)+'\u201d':'')+' \u00b7 per\u00edodo informado: <strong>'+escapeHtml(I.periodo||'\u2014')+'</strong></div>';
  h += '<div class="bi-filters"><label>Vig\u00eancia: de</label><input type="month" id="pedCampIni" class="disp-input" style="width:auto" value="'+I.mesIni+'" onchange="PED_CAMP_IMP.mesIni=this.value"><label>at\u00e9</label><input type="month" id="pedCampFim" class="disp-input" style="width:auto" value="'+I.mesFim+'" onchange="PED_CAMP_IMP.mesFim=this.value"><span class="ped-sub">a campanha dura de 1 a 3 meses; a tabela vale para todos os meses da vig\u00eancia</span></div>';
  h += '<div class="kpi-grid">'+c('SKUs na campanha', pedFmtN(n), pedFmtN(I.brutas)+' linhas (o mesmo SKU aparece em mais de um pacote)')
    + c('Desconto de 15% ou mais', pedFmtN(f15), pedFmtN(n-f15)+' com 10% (coloração)')
    + c('Ligados ao estoque', pedFmtN(L.ok), pedFmtN(L.soVenda)+' s\u00f3 nas vendas')
    + c('Sem correspond\u00eancia', pedFmtN(L.sem.length), I.semDesconto? I.semDesconto+' sem desconto lido':'c\u00f3digos que n\u00e3o achei')+'</div>';
  h += '<table class="dre-table"><thead><tr><th style="text-align:left">Pacote</th><th>SKUs</th><th>Desconto</th></tr></thead><tbody>'+I.pacotes.slice(0,12).map(function(p){ return '<tr><td style="text-align:left">'+escapeHtml(p.pacote).slice(0,70)+'</td><td>'+p.itens+'</td><td>'+(p.desconto===null?'\u2014':Math.round(p.desconto*100)+'%')+'</td></tr>'; }).join('')+'</tbody></table>'
    +(I.pacotes.length>12?'<div class="ped-sub">+ '+(I.pacotes.length-12)+' pacotes menores.</div>':'');
  if (L.sem.length) h += '<div class="ped-sub" style="margin-top:8px">Sem correspond\u00eancia no estoque nem nas vendas: '+L.sem.slice(0,8).map(function(l){ return escapeHtml(l.sku)+' ('+escapeHtml(l.produto).slice(0,24)+')'; }).join(' \u00b7 ')+(L.sem.length>8?' \u2026':'')+'. Eles ficam gravados e passam a valer quando o c\u00f3digo aparecer.</div>';
  h += '<div style="display:flex;align-items:center;gap:12px;margin-top:12px"><button class="disp-save-btn" onclick="pedCampConfirmar()">Confirmar e importar</button><span id="pedCampMsg" class="disp-note"></span></div>';
  return h;
}
async function pedCampConfirmar(){
  var I = PED_CAMP_IMP; if (!I || !I.linhas) return;
  var msg = document.getElementById('pedCampMsg'); function m(t,e){ if (msg){ msg.textContent = t; msg.style.color = e?'#e74c3c':'#6B8BAA'; } }
  var mi = I.mesIni, mf = I.mesFim;
  if (!/^\d{4}-\d{2}$/.test(mi||'') || !/^\d{4}-\d{2}$/.test(mf||'') || mf<mi) return m('Informe a vig\u00eancia (m\u00eas inicial e final).', true);
  var ex = pedCampExpandir(I.linhas, mi, mf); if (ex.meses.length>6) return m('Vig\u00eancia longa demais (m\u00e1ximo de 6 meses).', true);
  var cid = clienteIdAtual(), now = new Date().toISOString(); m('Gravando\u2026');
  var rd = await sb.from('ped_campanha').delete().eq('cliente_id',cid).in('mes', ex.meses.map(function(k){ return k+'-01'; }));
  if (rd.error) return m('Erro ao preparar os meses: '+rd.error.message, true);
  var linhas = ex.linhas.map(function(l){ return { cliente_id:cid, sku_venda:l.sku_venda, mes:l.mes, desconto:l.desconto, pacote:l.pacote, salao:l.salao, perfumaria:l.perfumaria, sellout:l.sellout, origem:'ciclo', arquivo:I.nome, updated_at:now }; });
  for (var i=0;i<linhas.length;i+=400) {
    var r = await sb.from('ped_campanha').upsert(linhas.slice(i,i+400), { onConflict:'cliente_id,sku_venda,mes' });
    if (r.error) return m('Erro ao gravar as campanhas: '+r.error.message, true);
  }
  var r3 = await sb.from('ped_upload_bruto').insert({ cliente_id:cid, data_posicao:ex.meses[0]+'-01', nome_arquivo:I.nome, codificacao:'planilha', linhas:I.linhas.length, conteudo:I.csv||'', tipo:'campanha' });
  PED_AVISO_OK = 'Campanhas importadas: '+I.linhas.length+' SKUs em '+ex.meses.map(pedMesLabel).join(', ')+'.'+(r3.error ? ' (a c\u00f3pia do arquivo n\u00e3o foi guardada: '+r3.error.message+')' : '');
  PED_CAMP_IMP = null; PED_CARREGADO = false;
  var root = document.getElementById('pedRoot'); if (root) root.innerHTML = '<div style="padding:3rem;text-align:center;color:#8BA0B0;font-size:13px">Atualizando\u2026</div>';
  await initEstoque();
}

/* fator manual de campanha por SKU (sobrepõe o calendário); vazio = automático */
function pedFatorMudou(inp){
  var x = PED_LINHAS[+inp.getAttribute('data-i')]; if (!x) return;
  var v = parseFloat(String(inp.value).replace(',','.'));
  if (!isFinite(v) || v<=0 || v===1) delete PED_FATORES[x.sku]; else PED_FATORES[x.sku] = Math.min(10, Math.round(v*100)/100);
  pedRefresh();
}

/* ══════════════════════════════════════════════════════════════════════
   GRÁFICO POR PRODUTO — dois painéis alinhados no tempo
   Em cima: vendas por mês (histórico) e demanda projetada. Embaixo: estoque
   (posições importadas + projeção com pedidos quinzenais, estoque de segurança e nível alvo).
══════════════════════════════════════════════════════════════════════ */
var PED_SEL = null, PED_PROJ = 4, PED_CEN = 'sugestao', PED_SNAP = {};
var PP = { txt:'#8BA0B0', pri:'#E2EAF4', grid:'rgba(255,255,255,0.08)', bar:'#00B4D8', barp:'rgba(0,180,216,0.22)', est:'#00D4DA', sem:'#8BA0B0',
           ss:'#e74c3c', alvo:'#C8B89A', ped:'#7c9cff', cheg:'#2ECC71', hoje:'#ff8a3d', camp:'rgba(255,138,61,0.13)', zona:'rgba(255,255,255,0.035)' };

function pedPainelSku(){ return (PED_SEL && PED_RES) ? (PED_RES.skus.filter(function(x){ return x.sku===PED_SEL; })[0] || null) : null; }
function pedPainelHTML(){
  if (!PED_RES || !PED_RES.skus.length) return '';
  var lista = PED_RES.skus.filter(function(x){ return x.dDia>0 || (x.est||0)>0; }).sort(function(a,b){ return pedSemAcento(a.produto) < pedSemAcento(b.produto) ? -1 : 1; });
  var ops = '<option value="">(escolha um produto)</option>' + lista.slice(0,900).map(function(x){ return '<option value="'+escapeHtml(x.sku)+'"'+(x.sku===PED_SEL?' selected':'')+'>'+escapeHtml(x.skuOrig)+' \u00b7 '+escapeHtml(x.produto).slice(0,50)+'</option>'; }).join('');
  function sw(c,t,x){ return '<span class="leg"><span class="leg-dot" style="background:'+c+(x||'')+'"></span>'+t+'</span>'; }
  return '<div class="chart-card" id="pedPainel"><div class="chart-title">Curva do produto</div><div class="chart-sub">Vendas por m\u00eas e estoque projetado, com pedidos, chegadas, estoque de seguran\u00e7a e n\u00edvel alvo. Clique em um produto da tabela para abrir aqui.</div>'
    +'<div class="bi-filters"><label>Produto</label><select id="pedPSel" onchange="pedPainelSelecionar(this.value)" style="max-width:340px">'+ops+'</select>'
    +'<label>Proje\u00e7\u00e3o</label><select id="pedPProj" onchange="pedPainelOpcao()"><option value="3">3 meses</option><option value="4">4 meses</option><option value="6">6 meses</option></select>'
    +'<label>Cen\u00e1rio</label><select id="pedPCen" onchange="pedPainelOpcao()"><option value="sugestao">Com a sugest\u00e3o</option><option value="editada">Com a minha quantidade</option><option value="sem">Se n\u00e3o pedir nada</option></select></div>'
    +'<div class="legend">'+sw(PP.bar,'Vendas do m\u00eas')+sw(PP.est,'Estoque com os pedidos')+sw(PP.sem,'Se n\u00e3o pedir nada')+sw(PP.ss,'Estoque de seguran\u00e7a')+sw(PP.alvo,'N\u00edvel alvo')+sw(PP.ped,'Pedido')+sw(PP.cheg,'Chegada')+sw('rgba(255,138,61,.45)','Campanha')+'</div>'
    +'<div id="pedPainelInfo" class="ped-sub" style="margin-bottom:8px"></div><div id="pedPainelSvg"></div></div>';
}
async function pedPainelCarregarSnap(x){
  if (PED_SNAP[x.sku]!==undefined) return;
  try {
    var r = await sb.from('ped_estoque').select('data_posicao,qtd,sku').eq('cliente_id',clienteIdAtual()).eq('sku',x.skuOrig).order('data_posicao',{ascending:true});
    PED_SNAP[x.sku] = r.error ? [] : (r.data||[]).filter(function(q){ return pedNormSku(q.sku)===x.sku; }).map(function(q){ return { d:String(q.data_posicao).slice(0,10), q:parseFloat(q.qtd)||0 }; });
  } catch(e){ PED_SNAP[x.sku] = []; }
}
async function pedPainelSelecionar(v, rolar){
  if (typeof v==='number') { var xl = PED_LINHAS[v]; v = xl ? xl.sku : ''; }
  PED_SEL = v || null; var x = pedPainelSku(); if (x) await pedPainelCarregarSnap(x);
  pedPainelRender(); document.querySelectorAll('#pedTbody tr').forEach(function(tr){ tr.classList.toggle('ped-sel', tr.getAttribute('data-k')===PED_SEL); });
  if (rolar) { var el = document.getElementById('pedPainel'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior:'smooth', block:'start' }); }
}
function pedPainelOpcao(){
  PED_PROJ = +document.getElementById('pedPProj').value || 4; PED_CEN = document.getElementById('pedPCen').value || 'sugestao'; pedPainelRender();
}
function pedPainelRender(){
  var box = document.getElementById('pedPainelSvg'); if (!box) return;
  var ps = document.getElementById('pedPSel'); if (ps) ps.value = PED_SEL || '';
  var pp = document.getElementById('pedPProj'); if (pp) pp.value = String(PED_PROJ);
  var pc = document.getElementById('pedPCen'); if (pc) pc.value = PED_CEN;
  var x = pedPainelSku(), info = document.getElementById('pedPainelInfo');
  if (!x) { box.innerHTML = '<div class="plano-vazio">Escolha um produto acima ou clique em uma linha da tabela.</div>'; if (info) info.textContent = ''; return; }
  var R = PED_RES, ed = PED_EDICOES[x.sku];
  var sim = pedSimularEstoque(x, R.P, R.sit, R.feriados, { meses:PED_PROJ, cenario:PED_CEN, qtdEditada: ed ? ed.qtd : null });
  if (info) {
    var t = '<strong>'+escapeHtml(x.skuOrig)+' \u00b7 '+escapeHtml(x.produto)+'</strong> \u00b7 demanda '+pedFmtN(x.dDia,1)+'/dia \u00b7 estoque '+(x.est===null?'\u2014':pedFmtN(x.est))
      +' \u00b7 seguran\u00e7a '+pedFmtN(x.ss)+' un'+(x.ssDias!==null?' ('+pedFmtN(x.ssDias,0)+' d)':'')
      +(x.risco!==null?' \u00b7 risco at\u00e9 a chegada '+pedFmtN(x.risco*100,0)+'%':'')+(x.qtdSugerida>0?' \u00b7 chega em '+pedFmtBRc(x.chegaEm):'');
    if (!sim.ordenavel) t += '<br><span style="color:#C8B89A">Este produto n\u00e3o entra no pedido (inativo, fora da TRUSS, sem giro ou sem demanda): mostrando s\u00f3 a proje\u00e7\u00e3o sem pedido.</span>';
    else if (PED_CEN==='editada' && !ed) t += '<br><span style="color:#C8B89A">Sem quantidade editada para este produto: o cen\u00e1rio \u00e9 igual \u00e0 sugest\u00e3o.</span>';
    if (x.camp) t += '<br><span style="color:#ff8a3d">Campanha: '+Object.keys(x.camp).sort().map(function(k){ return pedMesLabel(k)+' ('+Math.round(x.camp[k].desc*100)+'% off)'; }).join(', ')+(x.fatorManual!==null?' \u00b7 fator manual '+x.fatorManual:'')+'</span>';
    info.innerHTML = t;
  }
  var W = Math.round(box.clientWidth) || 680; W = Math.max(520, Math.min(1400, W));
  box.innerHTML = pedPainelSVG(x, sim, PED_SNAP[x.sku] || [], W);
  if (!window.__pedPainelResize) { window.__pedPainelResize = true; var tmr = null;
    window.addEventListener('resize', function(){ clearTimeout(tmr); tmr = setTimeout(function(){ if (document.getElementById('pedPainelSvg')) pedPainelRender(); }, 150); }); }
}
function pedNiceTicks(max,n){
  var rough = Math.max(1,max)/n, mag = Math.pow(10, Math.floor(Math.log(rough)/Math.LN10)), res = rough/mag, step = (res<=1?1:(res<=2?2:(res<=5?5:10)))*mag;
  var top = Math.ceil(max/step)*step, t = []; for (var v=0; v<=top+step/1000; v+=step) t.push(Math.round(v*1000)/1000); return { step:step, top:top, ticks:t };
}
function pedPainelSVG(x, sim, snaps, Wd){
  var R = PED_RES, P = R.P, hoje = sim.hoje, N = sim.N, mon = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  var iniKey = R.minKey > R.meses[0] ? R.minKey : R.meses[0];
  var fim = pedAddDias(hoje, N), endKey = pedMesKey(pedYMD(fim));
  var months = [], mk = iniKey; while (mk<=endKey && months.length<40) { months.push(mk); mk = pedMesMais(mk,1); }
  var tStart = pedParseYMD(iniKey+'-01'), dayOf = function(d){ return Math.round((d - tStart)/86400000); };
  var starts = months.map(function(k){ return dayOf(pedParseYMD(k+'-01')); }); starts.push(dayOf(pedParseYMD(pedMesMais(endKey,1)+'-01')));
  var DT = starts[starts.length-1], H0 = dayOf(hoje);
  Wd = Wd || 680; var X0 = 58, XW = Wd - X0 - 14, T1 = 28, B1 = 150, T2 = 206, B2 = 336, H = B2 + 32;
  var X = function(t){ return X0 + t/DT*XW; };
  // vendas: histórico e projeção por mês
  var projMes = {}; for (var t=0;t<=N;t++){ var k = pedMesKey(pedYMD(pedAddDias(hoje,t))); projMes[k] = (projMes[k]||0) + x.dDia*(x.fDia ? x.fDia(t) : 1); }
  var vals = months.map(function(k){
    var ix = R.meses.indexOf(k);
    if (k<=R.mesRef && ix>=0) return { v:x.m.vals[ix], tipo:'h' };
    if (projMes[k]!==undefined) return { v:projMes[k], tipo:'p' };
    return { v:null, tipo:'s' };
  });
  var maxV = Math.max(x.m.mediaPond, 1); vals.forEach(function(o){ if (o.v!==null && o.v>maxV) maxV = o.v; });
  var tk1 = pedNiceTicks(maxV*1.15, 4), Y1 = function(v){ return B1 - v/tk1.top*(B1-T1); };
  var maxS = Math.max(sim.ser.reduce(function(a,b){ return Math.max(a,b); },0), sim.ordenavel ? x.nivelAlvo : 0, sim.sem[0]||0);
  (snaps||[]).forEach(function(s){ if (s.q>maxS) maxS = s.q; });
  var tk2 = pedNiceTicks(maxS*1.1, 4), Y2 = function(v){ return B2 - v/tk2.top*(B2-T2); };
  var o = '<svg viewBox="0 0 '+Wd+' '+H+'" width="100%" height="'+H+'" role="img" aria-label="Painel de vendas mensais e painel de estoque projetado do produto">';
  function T(px,py,txt,anc,fill){ return '<text x="'+px.toFixed(1)+'" y="'+py.toFixed(1)+'" font-size="11" text-anchor="'+(anc||'start')+'" fill="'+(fill||PP.txt)+'">'+txt+'</text>'; }
  function L(x1,y1,x2,y2,st,w,da){ return '<line x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)+'" stroke="'+st+'" stroke-width="'+(w||1)+'"'+(da?' stroke-dasharray="'+da+'"':'')+'/>'; }
  o += '<rect x="'+X(H0).toFixed(1)+'" y="'+T1+'" width="'+(X(DT)-X(H0)).toFixed(1)+'" height="'+(B1-T1)+'" fill="'+PP.zona+'"/><rect x="'+X(H0).toFixed(1)+'" y="'+T2+'" width="'+(X(DT)-X(H0)).toFixed(1)+'" height="'+(B2-T2)+'" fill="'+PP.zona+'"/>';
  // campanhas (sombreado)
  if (x.camp) months.forEach(function(k,i){ var c = x.camp[k]; if (!c) return;
    o += '<rect x="'+X(starts[i]).toFixed(1)+'" y="'+T1+'" width="'+(X(starts[i+1])-X(starts[i])).toFixed(1)+'" height="'+(B1-T1)+'" fill="'+PP.camp+'"/><rect x="'+X(starts[i]).toFixed(1)+'" y="'+T2+'" width="'+(X(starts[i+1])-X(starts[i])).toFixed(1)+'" height="'+(B2-T2)+'" fill="'+PP.camp+'"/>'
       + T((X(starts[i])+X(starts[i+1]))/2, T1+12, 'campanha \u2212'+Math.round(c.desc*100)+'%', 'middle', PP.hoje); });
  o += T(X0,16,'Vendas por m\u00eas (unidades)<tspan fill="'+PP.txt+'"> \u00b7 linha tracejada: m\u00e9dia ponderada de '+pedFmtN(x.m.mediaPond)+' por m\u00eas</tspan>',null,PP.pri)+T(X0,T2-10,'Estoque (unidades)',null,PP.pri);
  tk1.ticks.forEach(function(v){ o += L(X0,Y1(v),X0+XW,Y1(v),PP.grid,0.6)+T(X0-6,Y1(v)+4,pedFmtN(v),'end'); });
  tk2.ticks.forEach(function(v){ o += L(X0,Y2(v),X0+XW,Y2(v),PP.grid,0.6)+T(X0-6,Y2(v)+4,pedFmtN(v),'end'); });
  for (var i=1;i<months.length;i++){ o += L(X(starts[i]),T1,X(starts[i]),B1,PP.grid,0.5)+L(X(starts[i]),T2,X(starts[i]),B2,PP.grid,0.5); }
  months.forEach(function(k,i){
    var bx = X(starts[i])+2, bw = Math.max(4, X(starts[i+1])-X(starts[i])-4), cx = bx+bw/2, ob = vals[i], lab = mon[+k.slice(5,7)-1] + ((i===0 || k.slice(5,7)==='01') ? '/'+k.slice(2,4) : '');
    if (ob.v!==null) { var h = B1-Y1(ob.v), hist = ob.tipo==='h';
      o += '<rect x="'+bx.toFixed(1)+'" y="'+Y1(ob.v).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(0,h).toFixed(1)+'" fill="'+(hist?PP.bar:PP.barp)+'"'+(hist?'':' stroke="'+PP.bar+'" stroke-dasharray="4 3"')+'><title>'+pedMesLabel(k)+': '+pedFmtN(ob.v)+' un'+(hist?'':' (proje\u00e7\u00e3o)')+'</title></rect>'+T(cx,Y1(ob.v)-4,pedFmtN(ob.v),'middle',PP.pri); }
    else o += T(cx,B1-8,'sem dados','middle');
    o += T(cx,B2+16,lab,'middle');
  });
  o += L(X0,Y1(x.m.mediaPond),X0+XW,Y1(x.m.mediaPond),PP.sem,1.2,'6 4');
  // estoque: histórico das posições importadas
  var pts = (snaps||[]).filter(function(s){ return s.d>=iniKey+'-01' && s.d<=pedYMD(hoje); });
  if (pts.length>1) o += '<path d="M'+pts.map(function(s){ return X(dayOf(pedParseYMD(s.d))).toFixed(1)+','+Y2(s.q).toFixed(1); }).join(' L')+'" fill="none" stroke="'+PP.est+'" stroke-width="1.6"/>';
  pts.forEach(function(s){ o += '<circle cx="'+X(dayOf(pedParseYMD(s.d))).toFixed(1)+'" cy="'+Y2(s.q).toFixed(1)+'" r="3.5" fill="'+PP.est+'"><title>Posi\u00e7\u00e3o de '+pedFmtBR(pedParseYMD(s.d))+': '+pedFmtN(s.q)+' un</title></circle>'; });
  if (pts.length<=1) o += T(X0+(X(H0)-X0)/2, T2+(B2-T2)/2, 'hist\u00f3rico de estoque: cresce a cada importa\u00e7\u00e3o', 'middle');
  // projeção
  var sx = X(H0), ex = X(H0+N);
  if (sim.ordenavel) {
    o += L(sx,Y2(sim.ss),ex,Y2(sim.ss),PP.ss,1.3,'2 3')+T(ex-2,Y2(sim.ss)-5,'estoque de seguran\u00e7a: '+pedFmtN(sim.ss),'end');
    o += L(sx,Y2(sim.alvo),ex,Y2(sim.alvo),PP.alvo,1.3,'2 3')+T(ex-2,Y2(sim.alvo)-5,'n\u00edvel alvo: '+pedFmtN(sim.alvo),'end');
  }
  var semPath = 'M'+sim.sem.map(function(v,t){ if (sim.zeraEm!==null && t>sim.zeraEm) return null; return X(H0+t).toFixed(1)+','+Y2(v).toFixed(1); }).filter(Boolean).join(' L');
  var mainPath = 'M'+sim.ser.map(function(v,t){ return X(H0+t).toFixed(1)+','+Y2(v).toFixed(1); }).join(' L');
  if (sim.cenario!=='sem') o += '<path d="'+semPath+'" fill="none" stroke="'+PP.sem+'" stroke-width="1.5" stroke-dasharray="6 4"/>';
  o += '<path d="'+mainPath+'" fill="none" stroke="'+(sim.cenario==='sem'?PP.sem:PP.est)+'" stroke-width="2.4" stroke-linejoin="round"/>';
  sim.ordens.forEach(function(od, j){
    var px = X(H0+od.t), py = Y2(sim.ser[od.t]);
    o += '<path d="M'+px.toFixed(1)+','+(py-10).toFixed(1)+' L'+(px-5).toFixed(1)+','+py.toFixed(1)+' L'+(px+5).toFixed(1)+','+py.toFixed(1)+' Z" fill="'+PP.ped+'"><title>Pedido '+pedFmtBRc(od.data)+': '+pedFmtN(od.qtd)+' un (chega '+pedFmtBRc(od.chegData)+')</title></path>';
    if (od.cheg<=N) { var cx = X(H0+od.cheg), cy = Y2(sim.ser[od.cheg]); o += '<circle cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="5" fill="'+PP.cheg+'" stroke="#0A1525" stroke-width="2"><title>Chegada '+pedFmtBRc(od.chegData)+': +'+pedFmtN(od.qtd)+' un</title></circle>'; if (j===0) o += T(cx+8,cy-6,'chega '+pedFmtBRc(od.chegData)); }
    if (j===0) { var abaixo = py+34 < B2; o += T(px,abaixo?py+18:py-18,'pedido '+pedFmtBRc(od.data),'middle',PP.pri)+T(px,abaixo?py+31:py-30,pedFmtN(od.qtd)+' un','middle',PP.pri); }
  });
  if (sim.cenario!=='sem' && sim.minDia>0 && sim.minVal < sim.ss) {
    var mx = X(H0+sim.minDia), my = Y2(sim.minVal);
    o += T(mx-10,my+5,'ponto mais baixo: '+pedFmtN(sim.minVal)+' un','end')+T(mx-10,my+18,'abaixo do estoque de seguran\u00e7a','end');
  }
  if (sim.zeraEm!==null) o += T(X(H0+sim.zeraEm)+6, Y2(0)-8, (sim.cenario==='sem'?'zera em ':'sem pedido, zera em ')+pedFmtBRc(pedAddDias(hoje,sim.zeraEm)));
  o += '<circle cx="'+sx.toFixed(1)+'" cy="'+Y2(x.est||0).toFixed(1)+'" r="5" fill="'+PP.est+'" stroke="#0A1525" stroke-width="2"><title>Posi\u00e7\u00e3o atual: '+pedFmtN(x.est||0)+' un</title></circle>';
  var hx = X(H0); o += L(hx,T1-8,hx,B2,'rgba(255,138,61,0.10)',9)+L(hx,T1-8,hx,B2,'rgba(255,138,61,0.20)',5)+L(hx,T1-8,hx,B2,PP.hoje,1.6,'5 4');
  o += T(hx-6,T1-12,'hist\u00f3rico','end')+T(hx+6,T1-12,'proje\u00e7\u00e3o ('+(sim.N>=170?6:(sim.N>=110?4:3))+' meses)')+T(hx,T2-10,'hoje, '+pedFmtBRc(hoje),'middle',PP.hoje);
  return o + '</svg>';
}
/* ═══ FIM MÓDULO ESTOQUE ═══ */
// ══════════════════════════════════════════════════════════════
// PROJEÇÃO DFC (3 anos) — Hawks MG
// Fonte: tabelas Supabase proj_dfc + proj_premissas (cenários base/conservador/otimista/livre).
// O motor de cálculo vive na planilha "Projecao_DFC_Hawks_MG"; o dash apenas exibe os resultados.
// Todas as funções deste bloco usam o prefixo "pj" para não colidir com o restante do dash.

/* ════ DEMONSTRAÇÃO: substitui tudo que lia/gravava no Supabase por dados fictícios ════ */
function pedFakeEstoque(){
  var rnd = seededRandom(FILIAL==='fl' ? 311 : 211);
  var meses = {}, by = {}, ordem = [];
  FV_HAWKS.forEach(function(r){
    if (r.tipo_operacao!=='venda') return;
    var k = String(r.competencia).slice(0,7); meses[k] = 1;
    var s = by[r.sku] || (by[r.sku] = { sku:r.sku, produto:r.produto, grupo:r.grupo, q:{} });
    if (ordem.indexOf(r.sku)<0) ordem.push(r.sku);
    s.q[k] = (s.q[k]||0) + (parseFloat(r.qtd)||0);
  });
  var ks = Object.keys(meses).sort().slice(-6), cat = { 'HOME CARE':'Home Care', 'PROFISSIONAL':'Profissional', 'COLORACAO':'Colora\u00e7\u00e3o', 'QUIMICA':'Qu\u00edmica' };
  return ordem.map(function(sku,i){
    var s = by[sku], arr = ks.map(function(k){ return s.q[k]||0; });
    var dem = arr.reduce(function(a,b){return a+b;},0)/Math.max(1,arr.length), p = rnd();
    var fat = p<0.07 ? 0 : (p<0.20 ? 0.12 : (p<0.34 ? 0.6 : (p<0.80 ? 1.5 : (p<0.93 ? 3.8 : 8))));
    var irregular = (parseInt(String(sku).replace(/\D/g,''),10)-1000)%8 >= 5;   // perfis Y e Z: nunca zerados
    if (irregular && fat===0) fat = 0.12;
    var fora = (i%13===12);
    return { sku:sku, codigo_produto:sku, codigo_fornecedor:'F'+(9000+i), produto:s.produto, categoria:cat[String(s.grupo).toUpperCase()]||s.grupo,
      qtd:Math.max(irregular?Math.max(3,Math.round(dem*0.2)):0, Math.round(dem*fat*(0.85+rnd()*0.3))), qtd_transito:(!fora && rnd()<0.22) ? Math.round(dem*0.7) : 0,
      fornecedor: fora ? 'DISTRIBUIDORA OUTRAS MARCAS' : (i%2 ? 'CALAMO' : 'VEGAN DO BRASIL'), status:'A' };
  });
}
function pedFakeData(){ var d = new Date(); d.setDate(d.getDate()-1); return pedYMD(d); }
async function pedCarregar(){
  PED_ERROS = []; PED_PARAM = {}; PED_DEPARA = {}; PED_CAMP_ROWS = []; PED_PODE_IMPORTAR = false;
  PED_ESTOQUE = pedFakeEstoque(); PED_DATA_POSICAO = pedFakeData();
}
async function pedCarregarEdicoes(){ PED_EDICOES = {}; PED_FATORES = {}; PED_ED_CARREGADAS = true; }
async function pedSalvarRascunho(){ pedMsg('Demonstra\u00e7\u00e3o: o rascunho n\u00e3o \u00e9 gravado (os dados da Beauty s\u00e3o fict\u00edcios).'); }
async function pedAplicarParametros(salvar){
  var novo = {};
  PED_PARAM_CAMPOS.forEach(function(g){ g[1].forEach(function(c){ var el = document.getElementById('pedP-'+c[0]); if (el) novo[c[0]] = el.value; }); });
  PED_PARAM = novo; pedRecalcular();
  if (!PED_ED_CARREGADAS) await pedCarregarEdicoes();
  pedRefresh(); var m = document.getElementById('pedParamMsg');
  if (m) m.textContent = salvar ? 'Demonstra\u00e7\u00e3o: par\u00e2metros aplicados nesta tela, mas n\u00e3o s\u00e3o gravados.' : 'Par\u00e2metros aplicados.';
}
/* hist\u00f3rico fict\u00edcio de posi\u00e7\u00f5es de estoque (8 semanas) para o painel de curva do produto */
async function pedPainelCarregarSnap(x){
  if (PED_SNAP[x.sku]!==undefined) return;
  var rnd = seededRandom(7 + x.sku.length*31 + (parseInt(String(x.sku).replace(/\D/g,''))||0)), est = x.est||0, dd = x.dDia||0, out = [], hoje = pedParseYMD(PED_DATA_POSICAO||pedFakeData());
  var q = est;
  for (var w=0; w<8; w++){ out.unshift({ d:pedYMD(pedAddDias(hoje,-7*w)), q:Math.max(0,Math.round(q)) }); q = q + dd*7*(0.8+rnd()*0.4) - (w===4 ? dd*20 : 0); }
  PED_SNAP[x.sku] = out;
}
/* importa\u00e7\u00e3o de arquivo, de-para e campanhas: desligados na demonstra\u00e7\u00e3o */
function pedImpHTML(){ return '<div class="ped-banner">Demonstra\u00e7\u00e3o: o estoque desta tela \u00e9 fict\u00edcio. Na Hawks, o estoque entra por upload do arquivo do sistema, com de-para de c\u00f3digos e campanhas da franqueadora.</div>'; }
function pedCampHTML(){ return ''; }
function pedDeparaPaginaHTML(){ return ''; }
