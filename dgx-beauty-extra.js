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
var TITULOS={'orc-metas':'Orçamento — Metas','orc-prem':'Orçamento — Premissas','orc-orcado':'Orçamento — Orçado','orc-realizado':'Orçamento — Realizado','orc-comp':'Orçamento — Orçado × Realizado'};
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

/* ───────── Roteador ───────── */
window.bxRender=function(page){
  if(!TITULOS[page])return false;
  BX.page=page;
  var ult=nReal();
  var per={'orc-metas':'2026','orc-prem':'2026','orc-orcado':'Jan – Dez 2026','orc-realizado':'Jan – '+ML[Math.max(0,ult-1)]+' 2026','orc-comp':'Jan – '+ML[Math.max(0,ult-1)]+' 2026',estoque:'Posição fictícia · '+nomeFilial()}[page];
  setPeriodo(per);
  if(page==='orc-metas')paginaMetas();
  else if(page==='orc-prem')paginaPrem();
  else if(page==='orc-orcado'){iniciarOrc();paginaOrcSerie(page,BX.orcado,'Orçado 2026');}
  else if(page==='orc-realizado')paginaOrcSerie(page,serieReal(),'Realizado 2026','Realizado fictício: vem do mesmo conjunto de dados do menu DFC, de janeiro ao último mês fechado.');
  else if(page==='orc-comp')paginaComp();
  return true;
};
})();
