/* DGX Beauty — módulos extras: Orçamento (Metas, Premissas, Orçado, Realizado, Orçado × Realizado),
   Projeção DFC e Estoque / Sugestão de pedido.
   Dados 100% fictícios, gerados no navegador a partir dos mesmos dados fictícios do dashboard
   (DFC_DADOS e FV_HAWKS). Nada é lido nem gravado no Supabase; ajustes feitos na tela
   (metas, premissas, quantidades do pedido) ficam só na memória e voltam ao padrão ao recarregar. */
(function(){
var ML=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
var CH={};
function $(id){return document.getElementById(id);}
function pad(n){return String(n).padStart(2,'0');}
function fmt(v){return (v===null||v===undefined||!isFinite(v))?'—':Math.round(v).toLocaleString('pt-BR');}
function fmtR(v){if(v===null||v===undefined||!isFinite(v))return '—';return (v<0?'-':'')+'R$ '+Math.abs(Math.round(v)).toLocaleString('pt-BR');}
function pc(v,d){if(v===null||v===undefined||!isFinite(v))return '—';return (v*100).toFixed(d==null?1:d).replace('.',',')+'%';}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function killChart(k){if(CH[k]){CH[k].destroy();delete CH[k];}}
function mkChart(k,id,cfg){killChart(k);var c=$(id);if(!c||!window.Chart)return;CH[k]=new Chart(c,cfg);}
var GRID='rgba(255,255,255,.06)',TXT='#8BA0B0',COR='#00B4D8',VERDE='#6FD39A',VERM='#E58B8B',AMAR='#F2C94C',AZUL='#5B8DEF';
function opts(extra){
  var o={responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:TXT,boxWidth:10,font:{size:11}}}},
    scales:{x:{ticks:{color:TXT,font:{size:10}},grid:{color:GRID}},y:{ticks:{color:TXT,font:{size:10},callback:function(v){return Math.abs(v)>=1000?(v/1000).toLocaleString('pt-BR')+' mil':v;}},grid:{color:GRID}}}};
  if(extra) Object.keys(extra).forEach(function(k){o[k]=extra[k];});
  return o;
}
function setPeriodo(t){var tp=$('topbarPeriod');if(tp)tp.textContent=t;}

/* ───────── CSS ───────── */
var st=document.createElement('style');
st.textContent=
'.nav-parent{display:flex;align-items:center}.nav-sub{padding-left:2.4rem!important;font-size:12.5px}'
+'.nav-caret{margin-left:auto;font-size:10px;opacity:.6;transition:transform .15s}.nav-parent.open .nav-caret{transform:rotate(180deg)}'
+'#orc-sub{display:none}#orc-sub.open{display:block}'
+'.bx-demo{font-size:11px;color:#6B8BAA;margin:-6px 0 1rem}'
+'.bx-tabs{display:flex;gap:4px;margin-bottom:1rem;border-bottom:1px solid #1F3044;flex-wrap:wrap}'
+'.bx-tabs button{background:none;border:0;border-bottom:2px solid transparent;color:#8BA0B0;font-size:13px;padding:8px 16px;cursor:pointer;margin-bottom:-1px}'
+'.bx-tabs button.active{color:#fff;border-bottom-color:#00B4D8}'
+'.bx-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:1.25rem}'
+'.bx-grid3{grid-template-columns:repeat(3,1fr)}'
+'.bx-field{background:#162230;border:0.5px solid #1F3044;border-radius:10px;padding:12px 14px}'
+'.bx-field label{display:block;font-size:10px;color:#6B8BAA;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}'
+'.bx-field input,.bx-field select,.bx-sel,.bx-search{width:100%;background:#0F1923;border:1px solid #1F3044;border-radius:6px;color:#E2EAF4;font-size:13px;padding:7px 9px;outline:none}'
+'.bx-field small{display:block;font-size:10px;color:#4A6580;margin-top:5px}'
+'.bx-btn{background:#00B4D8;border:0;color:#fff;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer}'
+'.bx-btn.sec{background:#162230;border:1px solid #1F3044;color:#8BA0B0}'
+'.bx-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:1rem}'
+'.bx-chartbox{height:260px;position:relative}.bx-chartcard{background:#111f35;border:1px solid rgba(0,174,239,0.12);border-radius:12px;padding:1rem 1.25rem;margin-bottom:14px}'
+'.bx-2col{display:grid;grid-template-columns:1fr 1fr;gap:14px}'
+'.bx-outer{overflow:auto;border:0.5px solid #1F3044;border-radius:10px;background:#162230;max-height:70vh;margin-bottom:1rem}'
+'.bx-pos{color:#6FD39A!important}.bx-neg{color:#E58B8B!important}'
+'.dfc-tbl tr.bx-sub td{font-weight:700;color:#E2EAF4;background:#0F1923}.dfc-tbl tr.bx-tot td{font-weight:700;color:#00D4DA;background:#0F1923}'
+'.bx-tag{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px}'
+'.bx-tag.rup{background:rgba(229,139,139,.15);color:#E58B8B}.bx-tag.rep{background:rgba(242,201,76,.15);color:#F2C94C}.bx-tag.ok{background:rgba(111,211,154,.15);color:#6FD39A}.bx-tag.exc{background:rgba(91,141,239,.15);color:#7FA6F5}'
+'.bx-qty{width:70px;text-align:right;background:#0F1923;border:1px solid #1F3044;border-radius:5px;color:#E2EAF4;padding:3px 5px;font-size:11.5px}'
+'.bx-banner{background:rgba(0,180,216,.08);border:1px solid rgba(0,180,216,.3);color:#9FD8E8;border-radius:8px;padding:10px 14px;font-size:12px;margin-bottom:1rem}'
+'@media(max-width:900px){.bx-grid,.bx-grid3,.bx-2col{grid-template-columns:1fr 1fr}}';
document.head.appendChild(st);

/* ───────── Navegação ───────── */
window.orcToggleMenu=function(){var s=$('orc-sub'),p=$('nav-orcamento');var o=!s.classList.contains('open');s.classList.toggle('open',o);p.classList.toggle('open',o);};
var TITULOS={'orc-metas':'Orçamento — Metas','orc-prem':'Orçamento — Premissas','orc-orcado':'Orçamento — Orçado','orc-realizado':'Orçamento — Realizado','orc-comp':'Orçamento — Orçado × Realizado',projecao:'Projeção DFC',estoque:'Estoque e Sugestão de Pedido'};
window.bxTitulos=TITULOS;

/* ───────── DFC base ───────── */
var LIN=[
 {k:'recVendas',n:'Recebimento de vendas',g:'Entradas operacionais'},
 {k:'jurosMultas',n:'Juros e multas recebidos',g:'Entradas operacionais'},
 {k:'outrasEnt',n:'Outras entradas',g:'Entradas operacionais'},
 {k:'pgtoTruss',n:'Pgto. compras Truss',g:'Saídas operacionais',v:'truss'},
 {k:'pgtoNaoTruss',n:'Pgto. fornecedores não Truss',g:'Saídas operacionais',v:'naoTruss'},
 {k:'pgtoPessoal',n:'Pgto. pessoal',g:'Saídas operacionais',f:1},
 {k:'pgtoMkt',n:'Pgto. marketing',g:'Saídas operacionais',f:1},
 {k:'pgtoComissoes',n:'Pgto. comissões',g:'Saídas operacionais',v:'comissoes'},
 {k:'pgtoLogistica',n:'Pgto. logística',g:'Saídas operacionais',f:1},
 {k:'pgtoOcupacao',n:'Pgto. ocupação',g:'Saídas operacionais',f:1},
 {k:'pgtoGerais',n:'Pgto. despesas gerais',g:'Saídas operacionais',f:1},
 {k:'pgtoTerceiros',n:'Pgto. terceiros',g:'Saídas operacionais',f:1},
 {k:'pgtoImpostos',n:'Pgto. impostos',g:'Saídas operacionais',v:'impostos'},
 {k:'entInvest',n:'Entradas de investimento',g:'Investimentos'},
 {k:'saiInvest',n:'Saídas de investimento',g:'Investimentos'},
 {k:'emprestimos',n:'Empréstimos captados',g:'Financiamento'},
 {k:'pgtoFinanc',n:'Pagamento de financiamentos',g:'Financiamento'}
];
var GRUPOS=['Entradas operacionais','Saídas operacionais','Investimentos','Financiamento'];
function dReal(m){return (typeof DFC_DADOS!=='undefined' && DFC_DADOS['2026-'+pad(m+1)])||null;}
function nReal(){var n=0;for(var m=0;m<12;m++){if(dReal(m))n=m+1;else break;}return n;}
function caixaIni(){var d=dReal(0);return d?d.caixaInicial:50000;}
function soma(d,g){var s=0;LIN.forEach(function(l){if(l.g===g)s+=(d[l.k]||0);});return s;}
function totais(d){
  var ent=soma(d,GRUPOS[0]),sai=soma(d,GRUPOS[1]),inv=soma(d,GRUPOS[2]),fin=soma(d,GRUPOS[3]);
  return {ent:ent,sai:sai,res:ent+sai,inv:inv,fin:fin,var_:ent+sai+inv+fin};
}
/* série mensal [12] de objetos d (ou null) → totais + caixa final acumulado */
function derivar(serie,cx0){
  var cx=cx0,out=[];
  serie.forEach(function(d){
    if(!d){out.push(null);return;}
    var t=totais(d);t.caixaIni=cx;cx=cx+t.var_;t.caixaFim=cx;out.push(t);
  });
  return out;
}

/* ───────── Metas / Premissas / Orçado (fictícios) ───────── */
var BX={modo:'orcado',pjCen:'base'};
function iniciarOrc(){
  if(BX.META) return;
  var d0=dReal(0)||{recVendas:150000};
  BX.META={recJan:Math.round(d0.recVendas*1.02/1000)*1000,cresc:0.05,margemBruta:0.55,ebitda:0.12,caixaMin:FILIAL==='fl'?30000:45000};
  BX.PREM={truss:0.28,naoTruss:0.06,comissoes:0.05,impostos:0.09,pessoal:FILIAL==='fl'?36000:39500,mkt:9500,logistica:6500,ocupacao:7000,gerais:5500,terceiros:4000,pgtoFinanc:2500,invest:12000};
  genOrcado();
}
function genOrcado(){
  var M=BX.META,P=BX.PREM,s=[];
  for(var m=0;m<12;m++){
    var rec=M.recJan*Math.pow(1+M.cresc,m);
    s.push({recVendas:rec,jurosMultas:300,outrasEnt:500,
      pgtoTruss:-rec*P.truss,pgtoNaoTruss:-rec*P.naoTruss,pgtoPessoal:-P.pessoal,pgtoMkt:-P.mkt,pgtoComissoes:-rec*P.comissoes,
      pgtoLogistica:-P.logistica,pgtoOcupacao:-P.ocupacao,pgtoGerais:-P.gerais,pgtoTerceiros:-P.terceiros,pgtoImpostos:-rec*P.impostos,
      entInvest:0,saiInvest:m===2?-P.invest:0,emprestimos:m===0?30000:0,pgtoFinanc:m>0?-P.pgtoFinanc:0});
  }
  BX.orcado=s;
}
function serieReal(){var s=[];for(var m=0;m<12;m++)s.push(dReal(m));return s;}

function cabecalho(){return '<div class="bx-demo">Dados fictícios para demonstração · ajustes feitos nesta tela não são salvos.</div>';}
function orcTabs(){
  var t=[['orc-metas','Metas'],['orc-prem','Premissas'],['orc-orcado','Orçado'],['orc-realizado','Realizado'],['orc-comp','Orçado × Realizado']];
  return '<div class="bx-tabs">'+t.map(function(x){return '<button data-p="'+x[0]+'" class="'+(BX.page===x[0]?'active':'')+'" onclick="bxIrOrc(\''+x[0]+'\')">'+x[1]+'</button>';}).join('')+'</div>';
}
window.bxIrOrc=function(p){
  var el=$('nav-'+p.replace('orc-','orc-'));
  document.querySelectorAll('.nav-item').forEach(function(i){i.classList.remove('active');});
  var nav=$('nav-'+p);if(nav)nav.classList.add('active');
  renderPage(p);
};
function cardsHTML(a){ // a=[[label,valor,sub],...]
  return '<div class="dfc-cards" style="grid-template-columns:repeat('+a.length+',1fr)">'+a.map(function(c){return '<div class="dfc-card"><div class="dfc-card-label">'+c[0]+'</div><div class="dfc-card-value">'+c[1]+'</div><div class="dfc-card-sub">'+(c[2]||'')+'</div></div>';}).join('')+'</div>';
}
function cls(v){return v>0?' class="bx-pos"':(v<0?' class="bx-neg"':'');}

function tabelaDFC(serie,rotuloCols){
  var cx0=caixaIni(),der=derivar(serie,cx0),n=serie.length;
  var h='<table class="dfc-tbl"><thead><tr><th style="min-width:230px">Linha</th>'+rotuloCols.map(function(c){return '<th>'+c+'</th>';}).join('')+'<th>Total</th></tr></thead><tbody>';
  function linhaVal(lbl,get,c2,total){
    var tot=0,tem=false,cells=serie.map(function(d,i){var v=get(d,der[i]);if(v===null||v===undefined)return '<td>—</td>';tem=true;tot+=v;return '<td'+(c2?'':cls(v))+'>'+fmt(v)+'</td>';}).join('');
    return '<tr class="'+(c2||'')+'"><td>'+lbl+'</td>'+cells+'<td'+(c2?'':cls(tot))+'><b>'+(tem&&total!==false?fmt(tot):'—')+'</b></td></tr>';
  }
  GRUPOS.forEach(function(g,gi){
    h+='<tr class="dfc-grp"><td colspan="'+(n+2)+'">'+g+'</td></tr>';
    LIN.filter(function(l){return l.g===g;}).forEach(function(l){h+=linhaVal(l.n,function(d){return d?d[l.k]:null;});});
    if(gi===0)h+=linhaVal('Total entradas operacionais',function(d,t){return t?t.ent:null;},'bx-sub');
    if(gi===1){h+=linhaVal('Total saídas operacionais',function(d,t){return t?t.sai:null;},'bx-sub');h+=linhaVal('Resultado operacional',function(d,t){return t?t.res:null;},'bx-tot');}
  });
  h+='<tr class="dfc-grp"><td colspan="'+(n+2)+'">Caixa</td></tr>';
  h+=linhaVal('Variação de caixa',function(d,t){return t?t.var_:null;},'bx-sub');
  h+=linhaVal('Caixa inicial',function(d,t){return t?t.caixaIni:null;},'',false);
  h+=linhaVal('Caixa final',function(d,t){return t?t.caixaFim:null;},'bx-tot',false);
  return h+'</tbody></table>';
}
function paginaOrcSerie(p,serie,tit,aviso){
  iniciarOrc();
  var der=derivar(serie,caixaIni()),ult=null;der.forEach(function(t){if(t)ult=t;});
  var ent=0,sai=0,vr=0;der.forEach(function(t){if(t){ent+=t.ent;sai+=t.sai;vr+=t.var_;}});
  var h=cabecalho()+orcTabs()+(aviso?'<div class="bx-banner">'+aviso+'</div>':'')
   +cardsHTML([['Entradas operacionais',fmtR(ent),'Total no período'],['Saídas operacionais',fmtR(sai),'Total no período'],['Variação de caixa',fmtR(vr),'Entradas + saídas + invest. + financ.'],['Caixa final',ult?fmtR(ult.caixaFim):'—','Último mês com dados']])
   +'<div class="bx-chartcard"><div class="chart-title">'+tit+' — entradas, saídas e caixa final</div><div class="bx-chartbox"><canvas id="bx-ch1"></canvas></div></div>'
   +'<div class="bx-outer">'+tabelaDFC(serie,ML)+'</div>'
   +'<div class="confidential">© 2026 DGX Consulting · Demonstração · Dados fictícios</div>';
  $('content').innerHTML=h;
  setTimeout(function(){
    mkChart('o1','bx-ch1',{type:'bar',data:{labels:ML,datasets:[
      {label:'Entradas operacionais',data:der.map(function(t){return t?t.ent:null;}),backgroundColor:'rgba(0,180,216,.7)',order:2},
      {label:'Saídas operacionais',data:der.map(function(t){return t?t.sai:null;}),backgroundColor:'rgba(229,139,139,.7)',order:2},
      {label:'Caixa final',type:'line',data:der.map(function(t){return t?t.caixaFim:null;}),borderColor:'#F2C94C',backgroundColor:'#F2C94C',tension:.3,order:1}]},options:opts()});
  },50);
}
function paginaMetas(){
  iniciarOrc();var M=BX.META;
  function f(id,lbl,v,sub,step){return '<div class="bx-field"><label>'+lbl+'</label><input type="number" id="'+id+'" value="'+v+'" step="'+(step||'any')+'"><small>'+sub+'</small></div>';}
  var h=cabecalho()+orcTabs()
   +'<div class="bx-banner">As metas alimentam o orçado: ao clicar em <b>Gerar orçado</b> o ano de 2026 é recalculado com as metas e premissas abaixo. Os números são fictícios.</div>'
   +'<div class="bx-grid">'
   +f('mt-rec','Receita de janeiro (R$)',M.recJan,'Ponto de partida do ano',1000)
   +f('mt-cresc','Crescimento mês a mês (%)',(M.cresc*100).toFixed(1),'Aplicado sobre o recebimento de vendas','0.1')
   +f('mt-mb','Meta de margem bruta (%)',(M.margemBruta*100).toFixed(1),'Referência para análise de Margem','0.1')
   +f('mt-eb','Meta de EBITDA (%)',(M.ebitda*100).toFixed(1),'Sobre a receita líquida','0.1')
   +f('mt-cx','Caixa mínimo (R$)',M.caixaMin,'Alerta na Projeção DFC',1000)
   +'</div><div class="bx-row"><button class="bx-btn" onclick="bxSalvarMetas()">Gerar orçado</button><button class="bx-btn sec" onclick="bxResetOrc()">Restaurar padrão</button></div>';
  var rec=0;BX.orcado.forEach(function(d){rec+=d.recVendas;});
  var t=0;BX.orcado.forEach(function(d){t+=totais(d).res;});
  h+=cardsHTML([['Receita orçada 2026',fmtR(rec),'Recebimento de vendas'],['Resultado operacional orçado',fmtR(t),pc(rec?t/rec:0)+' da receita'],['Meta de EBITDA',pc(M.ebitda),'Sobre a receita líquida'],['Caixa mínimo',fmtR(M.caixaMin),'Alerta de caixa']]);
  $('content').innerHTML=h+'<div class="confidential">© 2026 DGX Consulting · Demonstração · Dados fictícios</div>';
}
window.bxSalvarMetas=function(){
  var M=BX.META;
  M.recJan=parseFloat($('mt-rec').value)||M.recJan;M.cresc=(parseFloat($('mt-cresc').value)||0)/100;
  M.margemBruta=(parseFloat($('mt-mb').value)||0)/100;M.ebitda=(parseFloat($('mt-eb').value)||0)/100;M.caixaMin=parseFloat($('mt-cx').value)||0;
  genOrcado();paginaMetas();
};
window.bxResetOrc=function(){BX.META=null;iniciarOrc();if(BX.page==='orc-prem')paginaPrem();else paginaMetas();};
function paginaPrem(){
  iniciarOrc();var P=BX.PREM;
  function f(id,lbl,v,sub,pctv){return '<div class="bx-field"><label>'+lbl+'</label><input type="number" id="'+id+'" value="'+(pctv?(v*100).toFixed(1):Math.round(v))+'" step="'+(pctv?'0.1':'500')+'"><small>'+sub+'</small></div>';}
  var h=cabecalho()+orcTabs()
   +'<div class="bx-banner">Premissas de custo e despesa usadas para gerar o orçado. Percentuais incidem sobre o recebimento de vendas; valores em R$ são fixos por mês.</div>'
   +'<div class="chart-title" style="margin-bottom:8px">Variáveis (% da receita)</div><div class="bx-grid">'
   +f('pm-truss','Compras Truss (%)',P.truss,'CMV de produtos da franqueadora',1)+f('pm-nao','Fornecedores não Truss (%)',P.naoTruss,'Outras compras',1)
   +f('pm-com','Comissões (%)',P.comissoes,'Equipe comercial',1)+f('pm-imp','Impostos (%)',P.impostos,'Sobre vendas',1)
   +'</div><div class="chart-title" style="margin-bottom:8px">Fixas (R$ por mês)</div><div class="bx-grid">'
   +f('pm-pes','Pessoal',P.pessoal,'Folha e encargos')+f('pm-mkt','Marketing',P.mkt,'Mídia e ações')+f('pm-log','Logística',P.logistica,'Fretes')+f('pm-ocu','Ocupação',P.ocupacao,'Aluguel e condomínio')
   +f('pm-ger','Despesas gerais',P.gerais,'Administrativo')+f('pm-ter','Terceiros',P.terceiros,'Serviços contratados')+f('pm-fin','Parcela de financiamento',P.pgtoFinanc,'A partir de fevereiro')+f('pm-inv','Investimento (março)',P.invest,'Reforma / equipamentos')
   +'</div><div class="bx-row"><button class="bx-btn" onclick="bxSalvarPrem()">Gerar orçado</button><button class="bx-btn sec" onclick="bxResetOrc()">Restaurar padrão</button></div>';
  $('content').innerHTML=h+'<div class="confidential">© 2026 DGX Consulting · Demonstração · Dados fictícios</div>';
}
window.bxSalvarPrem=function(){
  var P=BX.PREM;function n(id){return parseFloat($(id).value)||0;}
  P.truss=n('pm-truss')/100;P.naoTruss=n('pm-nao')/100;P.comissoes=n('pm-com')/100;P.impostos=n('pm-imp')/100;
  P.pessoal=n('pm-pes');P.mkt=n('pm-mkt');P.logistica=n('pm-log');P.ocupacao=n('pm-ocu');P.gerais=n('pm-ger');P.terceiros=n('pm-ter');P.pgtoFinanc=n('pm-fin');P.invest=n('pm-inv');
  genOrcado();paginaPrem();
};
function paginaComp(){
  iniciarOrc();
  var nr=nReal(),orc=BX.orcado,rea=serieReal();
  var dO=derivar(orc,caixaIni()),dR=derivar(rea,caixaIni());
  var yO=0,yR=0,eO=0,eR=0,sO=0,sR=0;
  for(var m=0;m<nr;m++){yO+=dO[m].var_;yR+=dR[m].var_;eO+=dO[m].ent;eR+=dR[m].ent;sO+=dO[m].sai;sR+=dR[m].sai;}
  function dlt(r,o){var d=r-o;return fmtR(d)+' ('+(o?pc(d/Math.abs(o)):'—')+')';}
  var h=cabecalho()+orcTabs()
   +cardsHTML([['Entradas — real vs orçado',fmtR(eR),'Orçado '+fmtR(eO)+' · Δ '+dlt(eR,eO)],['Saídas op. — real vs orçado',fmtR(sR),'Orçado '+fmtR(sO)+' · Δ '+dlt(sR,sO)],['Variação de caixa',fmtR(yR),'Orçado '+fmtR(yO)+' · Δ '+dlt(yR,yO)],['Período comparado','Jan – '+ML[nr-1],'Meses com realizado']])
   +'<div class="bx-chartcard"><div class="chart-title">Variação de caixa mensal — orçado × realizado</div><div class="bx-chartbox"><canvas id="bx-ch1"></canvas></div></div>';
  var t='<table class="dfc-tbl"><thead><tr><th style="min-width:230px">Linha</th>'+ML.slice(0,nr).map(function(x){return '<th>Δ '+x+'</th>';}).join('')+'<th>Orçado</th><th>Realizado</th><th>Δ R$</th><th>Δ %</th></tr></thead><tbody>';
  function linha(lbl,go,gr,c2){
    var so=0,sr=0,cells='';
    for(var m=0;m<nr;m++){var o=go(orc[m],dO[m]),r=gr(rea[m],dR[m]),d=r-o;so+=o;sr+=r;cells+='<td'+cls(d)+'>'+fmt(d)+'</td>';}
    var d=sr-so;
    return '<tr class="'+(c2||'')+'"><td>'+lbl+'</td>'+cells+'<td>'+fmt(so)+'</td><td>'+fmt(sr)+'</td><td'+cls(d)+'>'+fmt(d)+'</td><td'+cls(d)+'>'+(so?pc(d/Math.abs(so)):'—')+'</td></tr>';
  }
  GRUPOS.forEach(function(g,gi){
    t+='<tr class="dfc-grp"><td colspan="'+(nr+5)+'">'+g+'</td></tr>';
    LIN.filter(function(l){return l.g===g;}).forEach(function(l){t+=linha(l.n,function(d){return d[l.k]||0;},function(d){return d[l.k]||0;});});
    if(gi===0)t+=linha('Total entradas operacionais',function(d,x){return x.ent;},function(d,x){return x.ent;},'bx-sub');
    if(gi===1){t+=linha('Total saídas operacionais',function(d,x){return x.sai;},function(d,x){return x.sai;},'bx-sub');t+=linha('Resultado operacional',function(d,x){return x.res;},function(d,x){return x.res;},'bx-tot');}
  });
  t+='<tr class="dfc-grp"><td colspan="'+(nr+5)+'">Caixa</td></tr>'+linha('Variação de caixa',function(d,x){return x.var_;},function(d,x){return x.var_;},'bx-tot');
  h+='<div class="bx-outer">'+t+'</tbody></table></div><div class="bx-demo">Δ = realizado − orçado. Verde = favorável ao caixa; vermelho = desfavorável.</div><div class="confidential">© 2026 DGX Consulting · Demonstração · Dados fictícios</div>';
  $('content').innerHTML=h;
  setTimeout(function(){
    mkChart('o1','bx-ch1',{type:'bar',data:{labels:ML.slice(0,nr),datasets:[
      {label:'Orçado',data:dO.slice(0,nr).map(function(t){return t.var_;}),backgroundColor:'rgba(139,160,176,.6)'},
      {label:'Realizado',data:dR.slice(0,nr).map(function(t){return t.var_;}),backgroundColor:'rgba(0,180,216,.8)'}]},options:opts()});
  },50);
}

/* ───────── Projeção DFC ───────── */
BX.pj={cresc:null,ajFix:0,caixaMin:null};
function pjBase(){
  iniciarOrc();
  var nr=nReal(),ult=[],i;for(i=Math.max(0,nr-3);i<nr;i++)ult.push(dReal(i));
  var recM=0;ult.forEach(function(d){recM+=d.recVendas;});recM/=ult.length;
  var r={rec:dReal(nr-1).recVendas,perc:{},fix:{}};
  LIN.forEach(function(l){
    if(l.v){var s=0;ult.forEach(function(d){s+=Math.abs(d[l.k])/d.recVendas;});r.perc[l.k]=s/ult.length;}
    else if(l.f){var s2=0;ult.forEach(function(d){s2+=d[l.k];});r.fix[l.k]=s2/ult.length;}
  });
  // crescimento m/m médio dos últimos meses
  var g=0,c=0;for(i=Math.max(1,nr-3);i<nr;i++){g+=dReal(i).recVendas/dReal(i-1).recVendas-1;c++;}
  r.g=c?g/c:0.03;
  return r;
}
function pjCalc(){
  var B=pjBase(),P=BX.pj,nr=nReal();
  var adj={base:0,otim:0.02,cons:-0.02}[BX.pjCen];
  var g=(P.cresc===null?B.g:P.cresc)+adj;
  var fixAdj=P.ajFix+(BX.pjCen==='cons'?0.03:0);
  var N=12,serie=[],rec=B.rec;
  for(var i=0;i<N;i++){
    rec=rec*(1+g);
    var d={recVendas:rec,jurosMultas:300,outrasEnt:500,entInvest:0,saiInvest:0,emprestimos:0,pgtoFinanc:-2500};
    LIN.forEach(function(l){if(l.v)d[l.k]=-rec*B.perc[l.k];else if(l.f)d[l.k]=B.fix[l.k]*(1+fixAdj);});
    serie.push(d);
  }
  var dR=derivar(serieReal().slice(0,nr),caixaIni());
  var cx0=dR[nr-1].caixaFim,dP=derivar(serie,cx0);
  return {g:g,serie:serie,der:dP,hist:dR,nr:nr,B:B};
}
function pjRot(i){var m=(nReal()+i)%12,a=2026+Math.floor((nReal()+i)/12);return ML[m]+'/'+String(a).slice(2);}
function paginaProj(){
  iniciarOrc();
  var C=pjCalc(),P=BX.pj,cm=P.caixaMin===null?BX.META.caixaMin:P.caixaMin;
  var minV=Infinity,minI=0,abaixo=0,res=0;
  C.der.forEach(function(t,i){if(t.caixaFim<minV){minV=t.caixaFim;minI=i;}if(t.caixaFim<cm)abaixo++;res+=t.var_;});
  var fim=C.der[C.der.length-1].caixaFim;
  var h=cabecalho()
   +'<div class="dfc-nav">'+[['base','Cenário base'],['otim','Otimista'],['cons','Conservador']].map(function(c){return '<button class="dfc-nav-btn'+(BX.pjCen===c[0]?' active':'')+'" onclick="bxCen(\''+c[0]+'\')">'+c[1]+'</button>';}).join('')+'</div>'
   +'<div class="bx-grid bx-grid3"><div class="bx-field"><label>Crescimento da receita mês a mês (%)</label><input type="number" id="pj-g" step="0.1" value="'+(((P.cresc===null?C.B.g:P.cresc))*100).toFixed(1)+'"><small>Padrão: média dos últimos 3 meses. Cenário soma/subtrai 2 p.p.</small></div>'
   +'<div class="bx-field"><label>Ajuste das despesas fixas (%)</label><input type="number" id="pj-f" step="0.5" value="'+(P.ajFix*100).toFixed(1)+'"><small>Sobre a média dos últimos 3 meses</small></div>'
   +'<div class="bx-field"><label>Caixa mínimo (R$)</label><input type="number" id="pj-c" step="1000" value="'+Math.round(cm)+'"><small>Linha de alerta no gráfico</small></div></div>'
   +'<div class="bx-row"><button class="bx-btn" onclick="bxPjAplicar()">Recalcular</button><button class="bx-btn sec" onclick="bxPjReset()">Restaurar padrão</button></div>'
   +cardsHTML([['Caixa final em 12 meses',fmtR(fim),pjRot(11)],['Menor caixa projetado',fmtR(minV),pjRot(minI)],['Resultado acumulado',fmtR(res),'Próximos 12 meses'],['Meses abaixo do mínimo',String(abaixo),abaixo?'Atenção ao capital de giro':'Sem pressão de caixa']])
   +'<div class="bx-chartcard"><div class="chart-title">Caixa final — realizado e projetado</div><div class="bx-chartbox"><canvas id="bx-ch1"></canvas></div></div>';
  var cols=C.der.map(function(t,i){return pjRot(i);});
  var t='<table class="dfc-tbl"><thead><tr><th style="min-width:230px">Linha</th>'+cols.map(function(c){return '<th>'+c+'</th>';}).join('')+'</tr></thead><tbody>';
  function ln(l,get,c2){return '<tr class="'+(c2||'')+'"><td>'+l+'</td>'+C.der.map(function(x,i){var v=get(C.serie[i],x);return '<td'+(c2?'':cls(v))+'>'+fmt(v)+'</td>';}).join('')+'</tr>';}
  t+=ln('Recebimento de vendas',function(d){return d.recVendas;})+ln('Outras entradas',function(d){return d.jurosMultas+d.outrasEnt;})
   +ln('Compras (Truss e não Truss)',function(d){return d.pgtoTruss+d.pgtoNaoTruss;})
   +ln('Comissões e impostos',function(d){return d.pgtoComissoes+d.pgtoImpostos;})
   +ln('Despesas fixas',function(d){return d.pgtoPessoal+d.pgtoMkt+d.pgtoLogistica+d.pgtoOcupacao+d.pgtoGerais+d.pgtoTerceiros;})
   +ln('Financiamento',function(d){return d.pgtoFinanc;})
   +ln('Variação de caixa',function(d,x){return x.var_;},'bx-sub')+ln('Caixa final',function(d,x){return x.caixaFim;},'bx-tot');
  h+='<div class="bx-outer">'+t+'</tbody></table></div><div class="confidential">© 2026 DGX Consulting · Demonstração · Dados fictícios</div>';
  $('content').innerHTML=h;
  setTimeout(function(){
    var nh=C.hist.length,labels=ML.slice(0,nh).concat(cols);
    var real=C.hist.map(function(t){return t.caixaFim;}).concat(cols.map(function(){return null;}));
    var proj=[];for(var i=0;i<nh-1;i++)proj.push(null);proj.push(C.hist[nh-1].caixaFim);C.der.forEach(function(t){proj.push(t.caixaFim);});
    var min=labels.map(function(){return cm;});
    mkChart('p1','bx-ch1',{type:'line',data:{labels:labels,datasets:[
      {label:'Realizado',data:real,borderColor:COR,backgroundColor:COR,tension:.3},
      {label:'Projetado',data:proj,borderColor:AMAR,backgroundColor:AMAR,borderDash:[6,4],tension:.3},
      {label:'Caixa mínimo',data:min,borderColor:VERM,borderDash:[2,3],pointRadius:0}]},options:opts()});
  },50);
}
window.bxCen=function(c){BX.pjCen=c;paginaProj();};
window.bxPjAplicar=function(){var P=BX.pj;P.cresc=(parseFloat($('pj-g').value)||0)/100;P.ajFix=(parseFloat($('pj-f').value)||0)/100;P.caixaMin=parseFloat($('pj-c').value)||0;paginaProj();};
window.bxPjReset=function(){BX.pj={cresc:null,ajFix:0,caixaMin:null};BX.pjCen='base';paginaProj();};

/* ───────── Estoque / Sugestão de pedido (fictício) ───────── */
var EST={par:{lead:21,doh:45,servico:0.95},edit:{},filtro:{status:'',curva:'',cat:'',q:''},itens:null,base:null};
var ZSV={0.90:1.28,0.95:1.645,0.98:2.054};
function estBase(){
  if(EST.base)return EST.base;
  var rnd=seededRandom(FILIAL==='fl'?311:211),by={},ordem=[];
  FV_HAWKS.forEach(function(r){
    var s=by[r.sku];
    if(!s){s=by[r.sku]={sku:r.sku,produto:r.produto,cat:r.grupo,q:{},rec:{},cmv:{}};ordem.push(r.sku);}
    var k=r.competencia.slice(0,7);
    s.q[k]=(s.q[k]||0)+r.qtd;s.rec[k]=(s.rec[k]||0)+r.valor_liquido;s.cmv[k]=(s.cmv[k]||0)+r.cmv_total;
  });
  var meses=[];FV_HAWKS.forEach(function(r){var k=r.competencia.slice(0,7);if(meses.indexOf(k)<0)meses.push(k);});
  meses.sort();
  var forn=['Truss — fábrica A','Truss — fábrica B'];
  var itens=ordem.map(function(sku,i){
    var s=by[sku],arr=meses.map(function(k){return s.q[k]||0;}),u=arr.slice(-6);
    var dem=u.reduce(function(a,b){return a+b;},0)/u.length;
    var sd=Math.sqrt(u.reduce(function(a,b){return a+(b-dem)*(b-dem);},0)/Math.max(1,u.length-1));
    var rec6=0,cmv6=0,q6=0;meses.slice(-6).forEach(function(k){rec6+=s.rec[k]||0;cmv6+=s.cmv[k]||0;q6+=s.q[k]||0;});
    var perfil=rnd(),fat=perfil<0.15?0.25:(perfil<0.35?0.85:(perfil<0.8?1.4:3.4)); // ruptura / saudável / excesso
    return {sku:sku,produto:s.produto,cat:s.cat,forn:forn[i%2],serie:arr,dem:dem,sd:sd,rec6:rec6,
      custo:q6?cmv6/q6:50,preco:q6?rec6/q6:85,estoque:Math.round(dem*fat*(0.8+rnd()*0.4)),transito:rnd()<0.22?Math.round(dem*0.7):0};
  });
  var tot=0;itens.forEach(function(x){tot+=x.rec6;});
  itens.slice().sort(function(a,b){return b.rec6-a.rec6;}).reduce(function(ac,x){ac+=x.rec6;x.curva=(ac-x.rec6)/tot<0.8?'A':((ac-x.rec6)/tot<0.95?'B':'C');return ac;},0);
  EST.meses=meses;EST.base=itens;return itens;
}
function estCalc(){
  var P=EST.par,z=ZSV[P.servico]||1.645;
  return estBase().map(function(x){
    var dd=x.dem/30,ss=z*(x.sd/Math.sqrt(30))*Math.sqrt(P.lead),pp=dd*P.lead+ss;
    var alvo=dd*(P.lead+P.doh)+ss,disp=x.estoque+x.transito;
    var doh=dd>0?x.estoque/dd:999,sug=Math.max(0,Math.ceil(alvo-disp));
    var status=doh<P.lead?'rup':(disp<pp?'rep':(doh>P.doh*2?'exc':'ok'));
    var o={};Object.keys(x).forEach(function(k){o[k]=x[k];});
    o.dd=dd;o.min=Math.ceil(pp);o.doh=doh;o.sug=sug;o.status=status;return o;
  });
}
var STROT={rup:'Ruptura',rep:'Repor',ok:'Saudável',exc:'Excesso'};
function qtdFinal(x){return EST.edit[x.sku]!==undefined?EST.edit[x.sku]:x.sug;}
function dataBR(d){return pad(d.getDate())+'/'+pad(d.getMonth()+1);}
function addDias(d,n){return new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);}
function ultUtil(d){while(d.getDay()===0||d.getDay()===6)d=addDias(d,-1);return d;}
function janelaHTML(total){
  var hj=new Date(),q=hj.getDate()<=15?1:2;
  var fimQ=q===1?new Date(hj.getFullYear(),hj.getMonth(),15):new Date(hj.getFullYear(),hj.getMonth()+1,0);
  var melhor=ultUtil(fimQ),T={1:[45,75,105,135],2:[30,60,90,120]};
  function bloco(tit,dt,qz){
    var pr=T[qz],pmp=pr.reduce(function(a,b){return a+b;},0)/4,dif=Math.round((dt-new Date(hj.getFullYear(),hj.getMonth(),hj.getDate()))/864e5);
    var pg=pr.map(function(p){return addDias(dt,p);});
    return '<div class="bx-field"><label>'+tit+'</label><div style="font-size:13px;color:#E2EAF4;margin-bottom:6px">Pedido em <b>'+dataBR(dt)+'</b> · '+qz+'ª quinzena · prazo médio '+pmp+' dias</div>'
      +'<div style="font-size:12px;color:#8BA0B0;line-height:1.7">'+pg.map(function(d,i){return 'Parcela '+(i+1)+' — '+dataBR(d)+'/'+String(d.getFullYear()).slice(2)+' · '+fmtR(total/4);}).join('<br>')+'</div>'
      +'<small>Pagamento médio em '+(dif+pmp)+' dias a partir de hoje</small></div>';
  }
  return '<div class="chart-title" style="margin-bottom:8px">Janela de compra — prazo de pagamento por quinzena</div><div class="bx-banner">Prazo contado a partir do faturamento, em 4 parcelas iguais. Pedidos da 1ª quinzena pagam 45-75-105-135 dias; da 2ª, 30-60-90-120 dias. Pedir no último dia útil da quinzena empurra os pagamentos para mais tarde. Regras fictícias para demonstração.</div>'
   +'<div class="bx-grid bx-grid3" style="grid-template-columns:1fr 1fr">'+bloco('Pedir hoje',new Date(hj.getFullYear(),hj.getMonth(),hj.getDate()),q)+bloco('Pedir no último dia útil da quinzena',melhor,q)+'</div>';
}
function paginaEstoque(){
  var P=EST.par,L=estCalc();EST.itens=L;
  var cats=[];L.forEach(function(x){if(cats.indexOf(x.cat)<0)cats.push(x.cat);});
  var vEst=0,vSug=0,dSum=0,dN=0,cnt={rup:0,rep:0,ok:0,exc:0},vExc=0;
  L.forEach(function(x){vEst+=x.estoque*x.custo;cnt[x.status]++;if(x.dd>0){dSum+=Math.min(x.doh,365);dN++;}vSug+=qtdFinal(x)*x.custo;if(x.status==='exc')vExc+=Math.max(0,x.estoque-x.dd*P.doh*1.0)*x.custo;});
  var h=cabecalho()
   +'<div class="bx-grid"><div class="bx-field"><label>Lead time (dias)</label><input type="number" id="es-lead" value="'+P.lead+'"><small>Do pedido à chegada</small></div>'
   +'<div class="bx-field"><label>DOH alvo (dias)</label><input type="number" id="es-doh" value="'+P.doh+'"><small>Cobertura desejada após a chegada</small></div>'
   +'<div class="bx-field"><label>Nível de serviço</label><select id="es-sv">'+[0.90,0.95,0.98].map(function(v){return '<option value="'+v+'"'+(v===P.servico?' selected':'')+'>'+Math.round(v*100)+'%</option>';}).join('')+'</select><small>Define o estoque de segurança</small></div>'
   +'<div class="bx-field" style="display:flex;align-items:flex-end"><button class="bx-btn" style="width:100%" onclick="bxEstAplicar()">Recalcular</button></div></div>'
   +cardsHTML([['Produtos ativos',String(L.length),'NY/FL separados por filial: '+nomeFilial()],['Estoque a custo',fmtR(vEst),'Disponível hoje'],['DOH médio',Math.round(dN?dSum/dN:0)+' dias','Meta: '+P.doh+' dias'],['Pedido sugerido',fmtR(vSug),L.filter(function(x){return qtdFinal(x)>0;}).length+' produtos']])
   +cardsHTML([['Ruptura',String(cnt.rup),'DOH menor que o lead time'],['Repor',String(cnt.rep),'Abaixo do ponto de pedido'],['Saudável',String(cnt.ok),'Dentro da faixa'],['Excesso',String(cnt.exc),'DOH acima de 2× o alvo · ~'+fmtR(vExc)+' parados']])
   +'<div class="bx-2col"><div class="bx-chartcard"><div class="chart-title">Demanda × cobertura (DOH) por produto</div><div class="bx-chartbox"><canvas id="es-c1"></canvas></div></div>'
   +'<div class="bx-chartcard"><div class="chart-title">Demanda mensal — unidades vendidas</div><div class="bx-chartbox"><canvas id="es-c2"></canvas></div></div></div>'
   +'<div class="bx-2col"><div class="bx-chartcard"><div class="chart-title">Pedido sugerido por categoria (R$ a custo)</div><div class="bx-chartbox"><canvas id="es-c3"></canvas></div></div>'
   +'<div class="bx-chartcard"><div class="chart-title">Estoque por curva ABC (R$ a custo)</div><div class="bx-chartbox"><canvas id="es-c4"></canvas></div></div></div>'
   +janelaHTML(vSug)
   +'<div class="chart-title" style="margin:1rem 0 8px">Sugestão de pedido por produto</div>'
   +'<div class="bx-row"><select class="bx-sel" style="width:auto" id="es-fs" onchange="bxEstFiltro()"><option value="">Todos os status</option>'+['rup','rep','ok','exc'].map(function(s){return '<option value="'+s+'">'+STROT[s]+'</option>';}).join('')+'</select>'
   +'<select class="bx-sel" style="width:auto" id="es-fc" onchange="bxEstFiltro()"><option value="">Todas as curvas</option><option>A</option><option>B</option><option>C</option></select>'
   +'<select class="bx-sel" style="width:auto" id="es-fg" onchange="bxEstFiltro()"><option value="">Todas as categorias</option>'+cats.map(function(c){return '<option>'+esc(c)+'</option>';}).join('')+'</select>'
   +'<input class="bx-search" style="width:200px" id="es-fq" placeholder="Buscar produto ou SKU" oninput="bxEstFiltro()">'
   +'<button class="bx-btn sec" onclick="bxEstCSV()">Exportar CSV</button><span id="es-tot" style="font-size:12px;color:#8BA0B0"></span></div>'
   +'<div class="bx-outer"><table class="dfc-tbl" id="es-tbl"></table></div>'
   +'<div class="confidential">© 2026 DGX Consulting · Demonstração · Dados fictícios</div>';
  $('content').innerHTML=h;
  estTabela();
  setTimeout(estGraficos,50);
}
function estFiltrada(){
  var f=EST.filtro,q=f.q.toLowerCase();
  return EST.itens.filter(function(x){return (!f.status||x.status===f.status)&&(!f.curva||x.curva===f.curva)&&(!f.cat||x.cat===f.cat)&&(!q||(x.sku+' '+x.produto).toLowerCase().indexOf(q)>=0);});
}
function estTabela(){
  var L=estFiltrada(),t=0,q=0;
  var h='<thead><tr><th style="min-width:200px">Produto</th><th>Categoria</th><th>Curva</th><th>Demanda/mês</th><th>Estoque</th><th>Em trânsito</th><th>DOH</th><th>Ponto de pedido</th><th>Custo unit.</th><th>Status</th><th>Pedido (un.)</th><th>Valor</th></tr></thead><tbody>';
  L.sort(function(a,b){return b.sug*b.custo-a.sug*a.custo;}).forEach(function(x){
    var qt=qtdFinal(x);t+=qt*x.custo;q+=qt;
    h+='<tr><td>'+esc(x.produto)+' <span style="color:#4A6580">'+esc(x.sku)+'</span></td><td style="text-align:left">'+esc(x.cat)+'</td><td>'+x.curva+'</td><td>'+fmt(x.dem)+'</td><td>'+fmt(x.estoque)+'</td><td>'+fmt(x.transito)+'</td><td>'+(x.doh>=999?'—':fmt(x.doh))+'</td><td>'+fmt(x.min)+'</td><td>'+fmtR(x.custo)+'</td>'
     +'<td><span class="bx-tag '+x.status+'">'+STROT[x.status]+'</span></td><td><input class="bx-qty" type="number" min="0" value="'+qt+'" onchange="bxEstEditar(\''+x.sku+'\',this.value)"></td><td>'+fmtR(qt*x.custo)+'</td></tr>';
  });
  $('es-tbl').innerHTML=h+'</tbody>';
  $('es-tot').textContent=L.length+' produtos · '+fmt(q)+' un. · '+fmtR(t);
}
function estGraficos(){
  var L=EST.itens,P=EST.par;
  var cor={rup:VERM,rep:AMAR,ok:VERDE,exc:AZUL};
  mkChart('e1','es-c1',{type:'scatter',data:{datasets:['rup','rep','ok','exc'].map(function(s){return {label:STROT[s],backgroundColor:cor[s],data:L.filter(function(x){return x.status===s&&x.doh<400;}).map(function(x){return {x:x.dem,y:x.doh,n:x.produto};})};})},
    options:opts({plugins:{legend:{labels:{color:TXT,boxWidth:10,font:{size:11}}},tooltip:{callbacks:{label:function(c){var p=c.raw;return p.n+': '+Math.round(p.x)+' un./mês, DOH '+Math.round(p.y);}}}},scales:{x:{title:{display:true,text:'Demanda mensal (un.)',color:TXT},ticks:{color:TXT},grid:{color:GRID}},y:{title:{display:true,text:'DOH (dias)',color:TXT},ticks:{color:TXT},grid:{color:GRID}}}})});
  var meses=EST.meses,tot=meses.map(function(k,i){var s=0;L.forEach(function(x){s+=x.serie[i];});return s;});
  mkChart('e2','es-c2',{type:'bar',data:{labels:meses.map(function(k){return ML[+k.slice(5,7)-1]+'/'+k.slice(2,4);}),datasets:[{label:'Unidades',data:tot,backgroundColor:'rgba(0,180,216,.75)'}]},options:opts()});
  var cats={},ab={A:0,B:0,C:0};
  L.forEach(function(x){cats[x.cat]=(cats[x.cat]||0)+qtdFinal(x)*x.custo;ab[x.curva]+=x.estoque*x.custo;});
  mkChart('e3','es-c3',{type:'bar',data:{labels:Object.keys(cats),datasets:[{label:'Pedido sugerido (R$)',data:Object.keys(cats).map(function(c){return Math.round(cats[c]);}),backgroundColor:'rgba(242,201,76,.75)'}]},options:opts()});
  mkChart('e4','es-c4',{type:'bar',data:{labels:['Curva A','Curva B','Curva C'],datasets:[{label:'Estoque (R$)',data:[Math.round(ab.A),Math.round(ab.B),Math.round(ab.C)],backgroundColor:['rgba(0,180,216,.8)','rgba(91,141,239,.7)','rgba(139,160,176,.6)']}]},options:opts()});
}
window.bxEstAplicar=function(){var P=EST.par;P.lead=Math.max(1,parseInt($('es-lead').value)||21);P.doh=Math.max(1,parseInt($('es-doh').value)||45);P.servico=parseFloat($('es-sv').value)||0.95;EST.edit={};paginaEstoque();};
window.bxEstFiltro=function(){EST.filtro={status:$('es-fs').value,curva:$('es-fc').value,cat:$('es-fg').value,q:$('es-fq').value};estTabela();};
window.bxEstEditar=function(sku,v){EST.edit[sku]=Math.max(0,parseInt(v)||0);estTabela();};
window.bxEstCSV=function(){
  var rows=[['SKU','Produto','Categoria','Curva','Demanda mensal','Estoque','Em transito','DOH','Ponto de pedido','Custo unitario','Status','Pedido (un.)','Valor']];
  estFiltrada().forEach(function(x){rows.push([x.sku,x.produto,x.cat,x.curva,Math.round(x.dem),x.estoque,x.transito,Math.round(x.doh),x.min,x.custo.toFixed(2).replace('.',','),STROT[x.status],qtdFinal(x),(qtdFinal(x)*x.custo).toFixed(2).replace('.',',')]);});
  var csv=rows.map(function(r){return r.join(';');}).join('\n');
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));a.download='sugestao-pedido-dgx-beauty-'+FILIAL+'.csv';a.click();
};

/* ───────── Roteador ───────── */
window.bxRender=function(page){
  if(!TITULOS[page])return false;
  BX.page=page;
  var ult=nReal();
  var per={'orc-metas':'2026','orc-prem':'2026','orc-orcado':'Jan – Dez 2026','orc-realizado':'Jan – '+ML[Math.max(0,ult-1)]+' 2026','orc-comp':'Jan – '+ML[Math.max(0,ult-1)]+' 2026',projecao:'Próximos 12 meses',estoque:'Posição fictícia · '+nomeFilial()}[page];
  setPeriodo(per);
  if(page==='orc-metas')paginaMetas();
  else if(page==='orc-prem')paginaPrem();
  else if(page==='orc-orcado'){iniciarOrc();paginaOrcSerie(page,BX.orcado,'Orçado 2026');}
  else if(page==='orc-realizado')paginaOrcSerie(page,serieReal(),'Realizado 2026','Realizado fictício: vem do mesmo conjunto de dados do menu DFC, de janeiro ao último mês fechado.');
  else if(page==='orc-comp')paginaComp();
  else if(page==='projecao')paginaProj();
  else if(page==='estoque')paginaEstoque();
  return true;
};
})();
