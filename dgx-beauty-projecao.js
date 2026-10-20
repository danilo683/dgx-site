/* DGX Beauty — Projeção de DFC.
   Código de tela e de cálculo copiado da Projeção da Hawks (hawks.html), para as duas páginas ficarem iguais:
   saldo realizado (linha cheia) e projetado (pontilhada), aportes/captações em barras, caixa mínimo,
   cenários e premissas. Aqui a projeção é FICTÍCIA: é gerada no navegador a partir do DFC fictício
   da Beauty (DFC_DADOS), sem Supabase. */
var PJ={carregado:false,carregando:false,erro:null,dados:{},prem:{},cen:'base',view:'geral',tbl:'anual',open:{},charts:[],versao:''};
var PJ_CEN=[
  {k:'base',n:'Base',c:'#00B4D8'},{k:'conservador',n:'Conservador',c:'#E74C3C'},
  {k:'otimista',n:'Otimista',c:'#2ECC71'},{k:'livre',n:'Livre',c:'#9B59B6'}
];
var PJ_MESES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
var PJ_NUM=['vendas','compras','ent_clientes','juros_multas','pgto_truss','pgto_nao_truss','pgto_pessoal','pgto_prolabore','pgto_mkt','pgto_comissoes','pgto_logistica','pgto_ocupacao','pgto_gerais','pgto_terceiros','pgto_impostos','caixa_operacional','sai_invest','pgto_financ','antecipacao','encargos_antec','aporte','outros_financ','caixa_inicial','caixa_final'];
var PJ_DESP=['pgto_pessoal','pgto_prolabore','pgto_mkt','pgto_comissoes','pgto_logistica','pgto_ocupacao','pgto_gerais','pgto_terceiros'];
var PJ_HIST_RAZAO=0.782; // Sell-in ÷ Sell-through, Out/25–Ago/26 (referência)

// ---------- formatação ----------
function pjN(v){var x=parseFloat(v);return isFinite(x)?x:0;}
function pjFmt(v){if(v===null||v===undefined||Math.abs(v)<0.5)return'\u2014';var s=Math.abs(Math.round(v)).toLocaleString('pt-BR');return v<0?'('+s+')':s;}
function pjMi(v){
  if(v===null||v===undefined||isNaN(v))return'\u2014';
  var a=Math.abs(v),s=v<0?'\u2212':'';
  if(a>=1e6)return s+'R$ '+(a/1e6).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' mi';
  if(a>=1e3)return s+'R$ '+Math.round(a/1e3).toLocaleString('pt-BR')+' mil';
  return s+'R$ '+Math.round(a).toLocaleString('pt-BR');
}
function pjAx(v){var a=Math.abs(v),s=v<0?'\u2212':'';if(a>=1e6)return s+(a/1e6).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi';if(a>=1e3)return s+Math.round(a/1e3)+' mil';return String(v);}
function pjPct(v,d){return(v*100).toLocaleString('pt-BR',{minimumFractionDigits:d===undefined?1:d,maximumFractionDigits:d===undefined?1:d})+'%';}
function pjLbl(k){return PJ_MESES[parseInt(k.slice(5,7),10)-1]+'/'+k.slice(2,4);}
function pjEsc(s){return(typeof escapeHtml==='function')?escapeHtml(s):String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function pjCenInfo(k){return PJ_CEN.filter(function(c){return c.k===k;})[0]||PJ_CEN[0];}

// ---------- carga ----------
async function pjCarregar(){
  if(PJ.carregado||PJ.carregando)return;
  PJ.carregando=true;PJ.erro=null;
  try{
    var res=await Promise.all([
      sb.from('proj_dfc').select('*').eq('cliente_id','hawks_mg').order('competencia',{ascending:true}),
      sb.from('proj_premissas').select('*').eq('cliente_id','hawks_mg').order('ordem',{ascending:true})
    ]);
    if(res[0].error)throw res[0].error;
    if(res[1].error)throw res[1].error;
    PJ.dados={};PJ.prem={};
    (res[0].data||[]).forEach(function(r){
      var o={cen:r.cenario,mk:String(r.competencia).slice(0,7),realizado:(r.realizado===true||r.realizado===1||r.realizado==='true'),caixa_pre:(r.caixa_pre===null||r.caixa_pre===undefined)?null:pjN(r.caixa_pre)};
      PJ_NUM.forEach(function(f){o[f]=pjN(r[f]);});
      o.lbl=pjLbl(o.mk);o.ano=parseInt(o.mk.slice(0,4),10);
      o.desp=PJ_DESP.reduce(function(a,f){return a+o[f];},0);
      o.antec_liq=o.antecipacao+o.encargos_antec;
      if(r.versao)PJ.versao=r.versao;
      (PJ.dados[r.cenario]=PJ.dados[r.cenario]||[]).push(o);
    });
    (res[1].data||[]).forEach(function(r){(PJ.prem[r.cenario]=PJ.prem[r.cenario]||[]).push(r);});
    PJ.carregado=true;
  }catch(e){console.error(e);PJ.erro=(e&&e.message)?e.message:String(e);}
  PJ.carregando=false;
}
function pjRows(cen){return PJ.dados[cen]||[];}
function pjProj(cen){return pjRows(cen).filter(function(r){return!r.realizado;});}
function pjReal(cen){return pjRows(cen).filter(function(r){return r.realizado;});}
function pjSoma(rs,f){return rs.reduce(function(a,r){return a+r[f];},0);}
function pjAgg(rs){
  var o={n:rs.length};
  PJ_NUM.concat(['desp','antec_liq']).forEach(function(f){o[f]=pjSoma(rs,f);});
  o.caixa_inicial=rs.length?rs[0].caixa_inicial:0;o.caixa_final=rs.length?rs[rs.length-1].caixa_final:0;
  return o;
}
function pjCxMin(cen){var p=(PJ.prem[cen]||[]).filter(function(x){return x.chave==='cxm';})[0];return p&&p.valor_num!==null?pjN(p.valor_num):10000;}
function pjKpis(cen){
  var pr=pjProj(cen),re=pjReal(cen);
  if(!pr.length)return null;
  var apoRows=pr.filter(function(r){return r.aporte>0.5;});
  var minR=pr.reduce(function(a,r){return r.caixa_final<a.caixa_final?r:a;},pr[0]);
  var realMarAgo=re.slice(5);
  var opReal=realMarAgo.length?pjSoma(realMarAgo,'caixa_operacional')/realMarAgo.length:0;
  var comp=pjSoma(pr,'compras'),vend=pjSoma(pr,'vendas');
  return{aporte:pjSoma(pr,'aporte'),nApo:apoRows.length,primeiro:apoRows.length?apoRows[0]:null,minimo:minR,
    opMedio:pjSoma(pr,'caixa_operacional')/pr.length,opReal:opReal,final:pr[pr.length-1],razao:vend?comp/vend:0,
    opTotal:pjSoma(pr,'caixa_operacional'),vendas:vend,n:pr.length};
}

// ---------- casca e navegação ----------
function projecaoHTML(){
  return '<div class="pj-head"><div><h2>Proje\u00e7\u00e3o de DFC \u00b7 3 anos</h2><p id="pj-sub"></p></div><div class="pj-scen" id="pj-scen"></div></div>'
    +'<div class="dfc-nav" id="pj-nav">'
    +'<button class="dfc-nav-btn" data-v="geral" onclick="pjSetView(\'geral\')">Vis\u00e3o geral</button>'
    +'<button class="dfc-nav-btn" data-v="dfc" onclick="pjSetView(\'dfc\')">DFC projetado</button>'
    +'<button class="dfc-nav-btn" data-v="cenarios" onclick="pjSetView(\'cenarios\')">Cen\u00e1rios</button>'
    +'<button class="dfc-nav-btn" data-v="premissas" onclick="pjSetView(\'premissas\')">Premissas</button></div>'
    +'<div id="pj-body"><div class="pj-loading">Carregando proje\u00e7\u00e3o\u2026</div></div>'
    +'<div class="confidential">\u00a9 2026 DGX Consulting \u00b7 Demonstra\u00e7\u00e3o DGX Beauty '+nomeFilial()+' \u00b7 Dados fict\u00edcios</div>';
}
function pjRenderShell(){
  var sc=document.getElementById('pj-scen');
  if(sc){sc.innerHTML=PJ_CEN.map(function(c){return'<div class="pj-pill'+(c.k===PJ.cen?' active':'')+'" style="--pj-c:'+c.c+'" onclick="pjSetCen(\''+c.k+'\')"><span class="pj-dot" style="background:'+c.c+'"></span>'+c.n+'</div>';}).join('');}
  document.querySelectorAll('#pj-nav .dfc-nav-btn').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-v')===PJ.view);});
  var sub=document.getElementById('pj-sub');
  if(sub)sub.textContent=PJ.carregado?('DGX Beauty '+nomeFilial()+' \u00b7 Out/26 a Dez/29 \u00b7 '+(PJ.versao||'')):'DGX Beauty '+nomeFilial();
  pjRenderBody();
}
function pjSetCen(k){PJ.cen=k;pjRenderShell();}
function pjSetView(v){PJ.view=v;pjRenderShell();}
function pjKill(){PJ.charts.forEach(function(c){try{c.destroy();}catch(e){}});PJ.charts=[];}
function pjRenderBody(){
  var b=document.getElementById('pj-body');if(!b)return;
  pjKill();
  if(PJ.carregando||(!PJ.carregado&&!PJ.erro)){b.innerHTML='<div class="pj-loading">Carregando proje\u00e7\u00e3o\u2026</div>';return;}
  if(PJ.erro){b.innerHTML='<div class="pj-empty"><div class="i">\u26A0\uFE0F</div><h3>N\u00e3o foi poss\u00edvel carregar a proje\u00e7\u00e3o</h3><p>'+pjEsc(PJ.erro)+'<br>Confira se as tabelas <b>proj_dfc</b> e <b>proj_premissas</b> foram criadas e se a policy de leitura permite este perfil.</p></div>';return;}
  if(!pjRows(PJ.cen).length){b.innerHTML='<div class="pj-empty"><div class="i">\uD83D\uDCED</div><h3>Sem dados para este cen\u00e1rio</h3><p>Rode o script de dados da proje\u00e7\u00e3o no Supabase para carregar o cen\u00e1rio \u201c'+pjCenInfo(PJ.cen).n+'\u201d.</p></div>';return;}
  if(PJ.view==='geral'){b.innerHTML=pjGeralHTML();pjGeralCharts();}
  else if(PJ.view==='dfc'){b.innerHTML=pjDfcHTML();pjDfcInit();}
  else if(PJ.view==='cenarios'){b.innerHTML=pjCenariosHTML();pjCenariosCharts();}
  else{b.innerHTML=pjPremissasHTML();}
}

// ---------- gráficos: base ----------
function pjOpts(extra){
  var o={responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:false},tooltip:{backgroundColor:'#0D1B2E',borderColor:'#1F3044',borderWidth:1,titleColor:'#E2EAF4',bodyColor:'#C8D6E5',padding:10,
      callbacks:{label:function(c){if(c.parsed.y===null||c.parsed.y===undefined)return null;return' '+c.dataset.label+': '+pjMi(c.parsed.y);}}}},
    scales:{x:{grid:{display:false},ticks:{color:'#8BA0B0',font:{size:10},maxRotation:0,autoSkip:true,maxTicksLimit:16}},
      y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#8BA0B0',font:{size:10},callback:pjAx}}}};
  if(extra){Object.keys(extra).forEach(function(k){o[k]=extra[k];});}
  return o;
}
function pjMk(id,cfg){var el=document.getElementById(id);if(!el)return null;var ch=new Chart(el,cfg);PJ.charts.push(ch);return ch;}
var pjDivider={id:'pjDivider',afterDraw:function(chart,args,opt){
  if(opt===undefined||opt.idx===undefined||opt.idx<0)return;
  var x=chart.scales.x,a=chart.chartArea,ctx=chart.ctx;
  var px=(x.getPixelForValue(opt.idx)+x.getPixelForValue(opt.idx+1))/2;
  ctx.save();ctx.strokeStyle='rgba(255,255,255,0.28)';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(px,a.top);ctx.lineTo(px,a.bottom);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#6B8BAA';ctx.font='10px sans-serif';ctx.textAlign='right';ctx.fillText('Realizado',px-6,a.top+11);ctx.textAlign='left';ctx.fillText('Projetado',px+6,a.top+11);ctx.restore();}};

// ---------- VISÃO GERAL ----------
function pjBanner(cen,k){
  var ci=pjCenInfo(cen);
  if(!k)return'';
  if(k.aporte<=0.5){
    return'<div class="pj-banner ok"><div class="pj-b-ico">\u2705</div><div>No cen\u00e1rio <b>'+ci.n+'</b>, o caixa se mant\u00e9m acima do m\u00ednimo (<b>'+pjMi(pjCxMin(cen))+'</b>) em todo o horizonte, sem necessidade de aporte. Menor saldo: <b>'+pjMi(k.minimo.caixa_final)+'</b> em <b>'+k.minimo.lbl+'</b>.</div></div>';
  }
  var meses=pjRows(cen).filter(function(r){return!r.realizado;});
  var idx=meses.indexOf(k.primeiro)+1;
  var cls=idx<=12?'bad':'warn';
  return'<div class="pj-banner '+cls+'"><div class="pj-b-ico">'+(cls==='bad'?'\uD83D\uDEA8':'\u26A0\uFE0F')+'</div><div>No cen\u00e1rio <b>'+ci.n+'</b>, o caixa chega ao m\u00ednimo (<b>'+pjMi(pjCxMin(cen))+'</b>) j\u00e1 em <b>'+k.primeiro.lbl+'</b>. Para se manter acima dele s\u00e3o necess\u00e1rios <b>'+pjMi(k.aporte)+'</b> de aportes em <b>'+k.nApo+' dos '+k.n+' meses</b> projetados, sem contar antecipa\u00e7\u00e3o de receb\u00edveis (limite zerado neste cen\u00e1rio). A projeção usa a estrutura de custos atual (m\u00e9dia Jun\u2013Set/26).</div></div>';
}
function pjGeralHTML(){
  var cen=PJ.cen,k=pjKpis(cen),ci=pjCenInfo(cen);
  var kp=function(l,v,s,cls,cor){return'<div class="pj-kpi '+(cls||'')+'" style="--k:'+(cor||ci.c)+'"><div class="l">'+l+'</div><div class="v">'+v+'</div><div class="s">'+s+'</div></div>';};
  var h=pjBanner(cen,k);
  h+='<div class="pj-kpis">'
    +kp('Aporte necess\u00e1rio ('+k.n+' meses)',pjMi(k.aporte),k.aporte>0?(k.nApo+' meses com aporte \u00b7 1\u00ba em '+k.primeiro.lbl):'nenhum aporte necess\u00e1rio',k.aporte>0?'neg':'pos',k.aporte>0?'#E74C3C':'#2ECC71')
    +kp('Menor saldo de caixa',pjMi(k.minimo.caixa_final),'em '+k.minimo.lbl+' \u00b7 m\u00ednimo '+pjMi(pjCxMin(cen)),k.minimo.caixa_final<=pjCxMin(cen)+1?'neg':'','#F39C12')
    +kp('Caixa operacional m\u00e9dio/m\u00eas',pjMi(k.opMedio),'realizado Jun\u2013Set/26: '+pjMi(k.opReal),k.opMedio<0?'neg':'pos',k.opMedio<0?'#E74C3C':'#2ECC71')
    +kp('Saldo de caixa em '+k.final.lbl,pjMi(k.final.caixa_final),'j\u00e1 inclui os aportes','',ci.c)
    +kp('Compras \u00f7 vendas',pjPct(k.razao),'hist\u00f3rico Jan\u2013Set/26: '+pjPct(PJ_HIST_RAZAO),k.razao<PJ_HIST_RAZAO-0.05?'':'', '#9B59B6')
    +'</div>';
  h+='<div class="chart-card"><div class="chart-title">Saldo de caixa: realizado e projetado</div><div class="chart-sub">Saldo banc\u00e1rio mensal, aportes/capta\u00e7\u00f5es e caixa m\u00ednimo \u00b7 cen\u00e1rio '+ci.n+'</div>'
    +'<div class="legend"><span class="leg"><span class="leg-line" style="background:#00B4D8"></span>Saldo realizado</span><span class="leg"><span class="leg-line" style="background:#7FDBF0"></span>Saldo projetado</span><span class="leg"><span class="leg-dot" style="background:rgba(139,160,176,.7)"></span>Aporte/capta\u00e7\u00e3o realizado</span><span class="leg"><span class="leg-dot" style="background:#F39C12"></span>Aporte necess\u00e1rio (proje\u00e7\u00e3o)</span><span class="leg"><span class="leg-line" style="background:#E74C3C"></span>Caixa m\u00ednimo</span></div>'
    +'<div class="chart-wrap pj-chart-h"><canvas id="pj-ch-saldo"></canvas></div></div>';
  h+='<div class="pj-grid2"><div class="chart-card"><div class="chart-title">Caixa operacional por m\u00eas</div><div class="chart-sub">Entradas de clientes menos todas as sa\u00eddas operacionais</div><div class="chart-wrap pj-chart-m"><canvas id="pj-ch-op"></canvas></div></div>'
    +'<div class="chart-card"><div class="chart-title">Para onde vai cada R$ 100 recebidos</div><div class="chart-sub">% das entradas de clientes \u00b7 realizado Jun\u2013Set/26 \u00d7 proje\u00e7\u00e3o 2027</div><div class="chart-wrap pj-chart-m"><canvas id="pj-ch-uso"></canvas></div></div></div>';
  h+='<p class="pj-note"><b>Como ler:</b> o caixa m\u00ednimo \u00e9 o piso que o modelo tenta manter; quando o caixa operacional n\u00e3o cobre, o modelo calcula o aporte necess\u00e1rio para chegar nele. A proje\u00e7\u00e3o \u00e9 sens\u00edvel principalmente \u00e0 rela\u00e7\u00e3o compras \u00f7 vendas (meta de Sell-in do franqueador) e \u00e0 inadimpl\u00eancia \u2014 veja a aba Cen\u00e1rios.</p>';
  return h;
}
function pjGeralCharts(){
  var cen=PJ.cen,rs=pjRows(cen),lastReal=-1;
  rs.forEach(function(r,i){if(r.realizado)lastReal=i;});
  var labs=rs.map(function(r){return r.lbl;});
  var sReal=rs.map(function(r){return r.realizado?r.caixa_final:null;});
  var sProj=rs.map(function(r,i){return!r.realizado?r.caixa_final:(i===lastReal?r.caixa_final:null);});
  var cap=rs.map(function(r){return r.realizado?(r.aporte+r.antecipacao+Math.max(r.outros_financ,0)):(r.aporte+r.antecipacao);});
  var cor=rs.map(function(r){return r.realizado?'rgba(139,160,176,.55)':'#F39C12';});
  var mn=pjCxMin(cen);
  pjMk('pj-ch-saldo',{type:'bar',plugins:[pjDivider],data:{labels:labs,datasets:[
    {type:'bar',label:'Aporte / capta\u00e7\u00e3o',data:cap,backgroundColor:cor,borderRadius:3,maxBarThickness:16,order:3},
    {type:'line',label:'Saldo realizado',data:sReal,borderColor:'#00B4D8',backgroundColor:'#00B4D8',borderWidth:2.5,pointRadius:3,tension:.25,spanGaps:false,order:1},
    {type:'line',label:'Saldo projetado',data:sProj,borderColor:'#7FDBF0',backgroundColor:'#7FDBF0',borderWidth:2.5,borderDash:[6,4],pointRadius:2,tension:.25,spanGaps:false,order:1},
    {type:'line',label:'Caixa m\u00ednimo',data:rs.map(function(){return mn;}),borderColor:'#E74C3C',borderWidth:1.2,borderDash:[2,4],pointRadius:0,order:2}
  ]},options:pjOpts({plugins:{legend:{display:false},pjDivider:{idx:lastReal},tooltip:{backgroundColor:'#0D1B2E',borderColor:'#1F3044',borderWidth:1,titleColor:'#E2EAF4',bodyColor:'#C8D6E5',padding:10,callbacks:{label:function(c){if(c.parsed.y===null||c.parsed.y===undefined)return null;return' '+c.dataset.label+': '+pjMi(c.parsed.y);}}}}})});
  var op=rs.map(function(r){return r.caixa_operacional;});
  pjMk('pj-ch-op',{type:'bar',plugins:[pjDivider],data:{labels:labs,datasets:[{label:'Caixa operacional',data:op,backgroundColor:rs.map(function(r){return r.realizado?'rgba(139,160,176,.55)':(r.caixa_operacional>=0?'#2ECC71':'#E74C3C');}),borderRadius:3,maxBarThickness:14}]},
    options:pjOpts({plugins:{legend:{display:false},pjDivider:{idx:lastReal},tooltip:{backgroundColor:'#0D1B2E',borderColor:'#1F3044',borderWidth:1,titleColor:'#E2EAF4',bodyColor:'#C8D6E5',padding:10,callbacks:{label:function(c){return' '+c.dataset.label+': '+pjMi(c.parsed.y);}}}}})});
  // uso do dinheiro
  var re=pjReal(cen).slice(5),y27=pjRows(cen).filter(function(r){return r.ano===2027;});
  var A=pjAgg(re),B=pjAgg(y27);
  var defs=[['Fornecedores Truss',function(o){return-o.pgto_truss;}],['Fornecedores n\u00e3o Truss',function(o){return-o.pgto_nao_truss;}],['Pessoal + pr\u00f3-labore',function(o){return-(o.pgto_pessoal+o.pgto_prolabore);}],
    ['Comiss\u00f5es',function(o){return-o.pgto_comissoes;}],['Marketing',function(o){return-o.pgto_mkt;}],['Log\u00edstica',function(o){return-o.pgto_logistica;}],
    ['Ocupa\u00e7\u00e3o, gerais e terceiros',function(o){return-(o.pgto_ocupacao+o.pgto_gerais+o.pgto_terceiros);}],['Impostos',function(o){return-o.pgto_impostos;}],['Sobra operacional',function(o){return o.caixa_operacional;}]];
  var pc=function(o){return defs.map(function(d){return o.ent_clientes?d[1](o)/o.ent_clientes*100:0;});};
  pjMk('pj-ch-uso',{type:'bar',data:{labels:defs.map(function(d){return d[0];}),datasets:[
    {label:'Realizado Jun\u2013Set/26',data:pc(A),backgroundColor:'rgba(139,160,176,.6)',borderRadius:3},
    {label:'Proje\u00e7\u00e3o 2027',data:pc(B),backgroundColor:'#00B4D8',borderRadius:3}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:true,labels:{color:'#8BA0B0',font:{size:11},boxWidth:10}},tooltip:{backgroundColor:'#0D1B2E',borderColor:'#1F3044',borderWidth:1,titleColor:'#E2EAF4',bodyColor:'#C8D6E5',callbacks:{label:function(c){return' '+c.dataset.label+': R$ '+c.parsed.x.toLocaleString('pt-BR',{maximumFractionDigits:1})+' a cada R$ 100';}}}},
      scales:{x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#8BA0B0',font:{size:10},callback:function(v){return v+'%';}}},y:{grid:{display:false},ticks:{color:'#C8D6E5',font:{size:11}}}}}});
}

// ---------- DFC PROJETADO (tabela) ----------
function pjRowSpec(){return[
  {l:'Caixa inicial',f:'caixa_inicial',t:'ini'},
  {l:'(+) Entradas de clientes',f:'ent_clientes'},
  {l:'(+) Juros e multas recebidos',f:'juros_multas'},
  {l:'(\u2212) Pagamentos de compras \u2014 Truss',f:'pgto_truss'},
  {l:'(\u2212) Fornecedores n\u00e3o Truss',f:'pgto_nao_truss'},
  {l:'(\u2212) Despesas administrativas e gerais',f:'desp',g:'desp',kids:[['Pessoal','pgto_pessoal'],['Pr\u00f3-labore','pgto_prolabore'],['Marketing','pgto_mkt'],['Comiss\u00f5es','pgto_comissoes'],['Log\u00edstica','pgto_logistica'],['Taxa de ocupa\u00e7\u00e3o','pgto_ocupacao'],['Despesas gerais','pgto_gerais'],['Servi\u00e7os de terceiros','pgto_terceiros']]},
  {l:'(\u2212) Impostos operacionais',f:'pgto_impostos'},
  {l:'= Caixa operacional',f:'caixa_operacional',t:'hi'},
  {l:'(\u2212) Capex',f:'sai_invest'},
  {l:'(\u2212) Servi\u00e7o da d\u00edvida banc\u00e1ria',f:'pgto_financ'},
  {l:'(+) Antecipa\u00e7\u00e3o de receb\u00edveis (l\u00edquida do des\u00e1gio)',f:'antec_liq'},
  {l:'(+/\u2212) Outros do financiamento (realizado)',f:'outros_financ',opt:true},
  {l:'(+) Aportes (necess\u00e1rios na proje\u00e7\u00e3o)',f:'aporte',t:'apo'},
  {l:'= Saldo final do caixa',f:'caixa_final',t:'tot'},
  {l:'Vendas (Sell-through)',f:'vendas',t:'memo'},
  {l:'Compras (Sell-in)',f:'compras',t:'memo'},
  {l:'Compras \u00f7 vendas',f:'razao',t:'memo',pct:true}
];}
function pjCols(cen){
  var rs=pjRows(cen),cols=[];
  if(PJ.tbl==='anual'){
    var re=pjReal(cen);if(re.length)cols.push({lbl:'Realizado<br>'+re[0].lbl+'\u2013'+re[re.length-1].lbl,real:true,o:pjAgg(re),nm:re.length});
    var anos=[];pjProj(cen).forEach(function(r){if(anos.indexOf(r.ano)<0)anos.push(r.ano);});
    anos.forEach(function(a){var x=pjProj(cen).filter(function(r){return r.ano===a;});cols.push({lbl:a+(x.length<12?'<br>'+x[0].lbl.slice(0,3)+'\u2013'+x[x.length-1].lbl.slice(0,3):''),o:pjAgg(x),nm:x.length});});
    cols.push({lbl:'Total<br>projetado',o:pjAgg(pjProj(cen)),nm:pjProj(cen).length,tot:true});
  }else{
    rs.forEach(function(r){cols.push({lbl:r.lbl,real:r.realizado,o:pjAgg([r]),nm:1,apo:r.aporte>0.5});});
  }
  return cols;
}
function pjTabela(){
  var cen=PJ.cen,cols=pjCols(cen),spec=pjRowSpec();
  var anyOutros=cols.some(function(c){return Math.abs(c.o.outros_financ)>0.5;});
  var h='<div class="pj-tbl-wrap"><table class="pj-tbl"><thead><tr><th>R$</th>'+cols.map(function(c){return'<th class="'+(c.real?'pj-real':'')+'">'+c.lbl+'</th>';}).join('')+'</tr></thead><tbody>';
  var cell=function(v,c,cls,pct){
    var t=pct?(isFinite(v)&&v?pjPct(v):'\u2014'):pjFmt(v);
    var k=(v<-0.5?' neg':(Math.abs(v)<0.5?' zero':''));
    return'<td class="'+(c.real?'pj-real ':'')+(cls||'')+k+'">'+t+'</td>';};
  spec.forEach(function(s){
    if(s.opt&&!anyOutros)return;
    var cls={ini:'pj-sub',hi:'pj-hi',apo:'pj-apo',tot:'pj-tot',memo:'pj-memo'}[s.t]||'';
    if(s.g){
      var ab=PJ.open[s.g];
      h+='<tr class="pj-grp"><td onclick="pjToggle(\''+s.g+'\')"><span class="pj-caret'+(ab?' open':'')+'">\u25B6</span>'+s.l+'</td>'+cols.map(function(c){return cell(c.o[s.f],c);}).join('')+'</tr>';
      if(ab)s.kids.forEach(function(kd){h+='<tr class="pj-child"><td>'+kd[0]+'</td>'+cols.map(function(c){return cell(c.o[kd[1]],c);}).join('')+'</tr>';});
      return;
    }
    h+='<tr class="'+cls+'"><td>'+s.l+'</td>'+cols.map(function(c){
      var v;
      if(s.f==='razao')v=c.o.vendas?c.o.compras/c.o.vendas:0;else v=c.o[s.f];
      var extra=(s.f==='caixa_final'&&c.apo)?' pj-flag':'';
      return cell(v,c,extra,s.pct);}).join('')+'</tr>';
  });
  return h+'</tbody></table></div>';
}
function pjToggle(g){PJ.open[g]=!PJ.open[g];var w=document.getElementById('pj-tbl-host');if(w)w.innerHTML=pjTabela();}
function pjDfcHTML(){
  var ci=pjCenInfo(PJ.cen);
  var h='<div class="pj-subhead"><div><div class="chart-title">DFC projetado \u00b7 cen\u00e1rio '+ci.n+'</div><div class="chart-sub" style="margin-bottom:0">Sa\u00eddas entre par\u00eanteses \u00b7 colunas cinza = realizado \u00b7 clique em \u201cDespesas administrativas\u201d para abrir o detalhe</div></div>'
    +'<div class="pj-toggle"><button class="'+(PJ.tbl==='anual'?'active':'')+'" onclick="pjSetTbl(\'anual\')">Anual</button><button class="'+(PJ.tbl==='mensal'?'active':'')+'" onclick="pjSetTbl(\'mensal\')">Mensal</button></div></div>';
  if(PJ.tbl==='anual'){
    h+='<div class="chart-card"><div class="chart-title">M\u00e9dia mensal por per\u00edodo</div><div class="chart-sub">Entradas \u00d7 sa\u00eddas operacionais e caixa operacional \u2014 m\u00e9dia por m\u00eas, para comparar per\u00edodos de tamanhos diferentes</div>'
      +'<div class="legend"><span class="leg"><span class="leg-dot" style="background:#00B4D8"></span>Entradas operacionais</span><span class="leg"><span class="leg-dot" style="background:#3B5B85"></span>Sa\u00eddas operacionais</span><span class="leg"><span class="leg-line" style="background:#F39C12"></span>Caixa operacional</span></div>'
      +'<div class="chart-wrap pj-chart-m"><canvas id="pj-ch-ano"></canvas></div></div>';
  }
  h+='<div id="pj-tbl-host">'+pjTabela()+'</div>';
  if(PJ.tbl==='anual')h+='<p class="pj-note" style="margin-top:.6rem">2026 projetado = Out\u2013Dez. O realizado cobre Jan\u2013Set/26 e inclui a capta\u00e7\u00e3o de empr\u00e9stimo de janeiro. Dados fict\u00edcios para demonstra\u00e7\u00e3o.</p>';
  return h;
}
function pjSetTbl(t){PJ.tbl=t;pjRenderBody();}
function pjDfcInit(){
  if(PJ.tbl==='mensal'){var w=document.querySelector('#pj-tbl-host .pj-tbl-wrap');var ths=w?w.querySelectorAll('thead th'):[];for(var i=1;i<ths.length;i++){if(!ths[i].classList.contains('pj-real')){w.scrollLeft=Math.max(0,ths[i].offsetLeft-420);break;}}return;}
  if(PJ.tbl!=='anual')return;
  var cols=pjCols(PJ.cen),lb=cols.filter(function(c){return!c.tot;});
  var m=function(c,f){return c.o[f]/c.nm;};
  var ent=lb.map(function(c){return(c.o.ent_clientes+c.o.juros_multas)/c.nm;});
  var sai=lb.map(function(c){return(c.o.caixa_operacional-c.o.ent_clientes-c.o.juros_multas)/c.nm;});
  pjMk('pj-ch-ano',{type:'bar',data:{labels:lb.map(function(c){return c.lbl.replace('<br>',' \u00b7 ');}),datasets:[
    {type:'bar',label:'Entradas operacionais',data:ent,backgroundColor:'#00B4D8',borderRadius:4,order:2},
    {type:'bar',label:'Sa\u00eddas operacionais',data:sai.map(function(v){return-v;}),backgroundColor:'#3B5B85',borderRadius:4,order:2},
    {type:'line',label:'Caixa operacional',data:lb.map(function(c){return m(c,'caixa_operacional');}),borderColor:'#F39C12',backgroundColor:'#F39C12',borderWidth:2.5,pointRadius:5,order:1}
  ]},options:pjOpts()});
}

// ---------- CENÁRIOS ----------
function pjCenariosHTML(){
  var h='<div class="chart-card"><div class="chart-title">Comparativo de cen\u00e1rios</div><div class="chart-sub">Mesmo horizonte (Out/26\u2013Dez/29), premissas diferentes \u00b7 clique no cen\u00e1rio para ver o detalhe</div>';
  h+='<div class="pj-tbl-wrap"><table class="pj-tbl"><thead><tr><th>Cen\u00e1rio</th><th>Vendas projetadas</th><th>Compras \u00f7 vendas</th><th>Caixa operacional acumulado</th><th>Aporte necess\u00e1rio</th><th>1\u00ba aporte</th><th>Meses com aporte</th><th>Saldo final</th></tr></thead><tbody>';
  PJ_CEN.forEach(function(c){
    var k=pjKpis(c.k);if(!k)return;
    h+='<tr class="'+(c.k===PJ.cen?'pj-hi':'')+'" style="cursor:pointer" onclick="pjSetCen(\''+c.k+'\')"><td><span class="pj-dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:'+c.c+';margin-right:8px"></span>'+c.n+'</td>'
      +'<td>'+pjMi(k.vendas)+'</td><td>'+pjPct(k.razao)+'</td><td'+(k.opTotal<0?' class="neg"':'')+'>'+pjMi(k.opTotal)+'</td><td'+(k.aporte>0?' class="neg"':'')+'>'+(k.aporte>0?pjMi(k.aporte):'\u2014')+'</td><td>'+(k.primeiro?k.primeiro.lbl:'\u2014')+'</td><td>'+k.nApo+' de '+k.n+'</td><td>'+pjMi(k.final.caixa_final)+'</td></tr>';
  });
  h+='</tbody></table></div></div>';
  h+='<div class="chart-card"><div class="chart-title">Aporte acumulado necess\u00e1rio</div><div class="chart-sub">Quanto os s\u00f3cios precisariam colocar, somado m\u00eas a m\u00eas, para manter o caixa no m\u00ednimo</div>'
    +'<div class="legend">'+PJ_CEN.map(function(c){return'<span class="leg"><span class="leg-line" style="background:'+c.c+'"></span>'+c.n+'</span>';}).join('')+'</div>'
    +'<div class="chart-wrap pj-chart-h"><canvas id="pj-ch-cen"></canvas></div></div>';
  var b=pjKpis('base'),cv=pjKpis('conservador');
  h+='<p class="pj-note"><b>Por que os cen\u00e1rios divergem tanto:</b> o Base usa a meta de Sell-in do franqueador, que implica compras de '+(b?pjPct(b.razao):'\u2014')+' das vendas; o hist\u00f3rico (Jan\u2013Set/26) foi de '+pjPct(PJ_HIST_RAZAO)+'. O Conservador usa o hist\u00f3rico'+(cv?' ('+pjPct(cv.razao)+')':'')+', al\u00e9m de inadimpl\u00eancia maior, ruptura e recebimento mais lento. Cada ponto percentual nessa rela\u00e7\u00e3o pesa centenas de milhares de reais por ano no caixa \u2014 \u00e9 a premissa que mais precisa de valida\u00e7\u00e3o. O cen\u00e1rio <b>Livre</b> parte igual ao Base e serve para simula\u00e7\u00f5es.</p>';
  return h;
}
function pjCenariosCharts(){
  var base=pjProj('base'),labs=base.map(function(r){return r.lbl;});
  var ds=PJ_CEN.map(function(c){
    var acc=0;
    return{label:c.n,data:pjProj(c.k).map(function(r){acc+=r.aporte;return acc;}),borderColor:c.c,backgroundColor:c.c,borderWidth:c.k===PJ.cen?3.2:1.8,pointRadius:0,tension:.2,borderDash:c.k==='livre'?[5,4]:[]};
  });
  pjMk('pj-ch-cen',{type:'line',data:{labels:labs,datasets:ds},options:pjOpts()});
}

// ---------- PREMISSAS ----------
function pjValFmt(p){
  if(p.valor_txt)return pjEsc(p.valor_txt);
  var v=pjN(p.valor_num);
  if(p.formato==='pct')return pjPct(v,1);
  if(p.formato==='pct2')return pjPct(v,2);
  if(p.formato==='brl')return'R$ '+Math.round(v).toLocaleString('pt-BR');
  return v.toLocaleString('pt-BR');
}
function pjPremissasHTML(){
  var cen=PJ.cen,ci=pjCenInfo(cen),rows=PJ.prem[cen]||[],base=PJ.prem['base']||[];
  var bmap={};base.forEach(function(p){bmap[p.chave]=p;});
  var h='<div class="pj-sect">Como o modelo funciona</div><div class="pj-steps">'
    +'<div class="pj-step"><span class="n">1</span><b>Vendas</b>Meta de Sell-through do franqueador at\u00e9 Dez/27; em 2028\u201329, mesmo m\u00eas do ano anterior \u00d7 (1 + crescimento). Multiplicada pelo cen\u00e1rio.</div>'
    +'<div class="pj-step"><span class="n">2</span><b>Recebimentos</b>Vendas \u00d7 mix (boleto, cart\u00e3o, pix) \u00d7 prazos de pagamento do franqueador, menos a inadimpl\u00eancia dos boletos.</div>'
    +'<div class="pj-step"><span class="n">3</span><b>Compras e fornecedores</b>Meta de Sell-in (ou % hist\u00f3rico das vendas). O pagamento \u00e0 Truss ocorre 1 a 3 meses ap\u00f3s a compra.</div>'
    +'<div class="pj-step"><span class="n">4</span><b>Despesas e impostos</b>Estrutura de custos m\u00e9dia de Jun\u2013Set/26, com infla\u00e7\u00e3o nas fixas. Impostos: parcela mensal + recolhimento trimestral (Jan/Abr/Jul/Out).</div>'
    +'<div class="pj-step"><span class="n">5</span><b>Financiamento</b>Se o caixa cai abaixo do m\u00ednimo: 1\u00ba antecipa\u00e7\u00e3o de receb\u00edveis (at\u00e9 o limite), 2\u00ba o restante vira <b style="display:inline">aporte necess\u00e1rio</b>.</div></div>';
  h+='<div class="pj-subhead"><div class="chart-title">Premissas do cen\u00e1rio '+ci.n+'</div><div class="pj-note">Valores em <span class="pj-diff">amarelo</span> diferem do cen\u00e1rio Base \u00b7 <span class="pj-tag-ph" style="margin:0">a validar</span> = valor provis\u00f3rio</div></div>';
  h+='<div class="pj-tbl-wrap"><table class="pj-tbl pj-prem"><thead><tr><th>Premissa</th><th>Valor</th><th>Origem / observa\u00e7\u00e3o</th></tr></thead><tbody>';
  var g='';
  rows.forEach(function(p){
    if(p.grupo!==g){g=p.grupo;h+='<tr class="pj-prem-grp"><td colspan="3">'+pjEsc(g)+'</td></tr>';}
    var b=bmap[p.chave],diff=cen!=='base'&&b&&(pjValFmt(b)!==pjValFmt(p));
    var ph=(p.fonte||'').indexOf('PLACEHOLDER')>=0;
    h+='<tr><td>'+pjEsc(p.rotulo)+(ph?'<span class="pj-tag-ph">a validar</span>':'')+'</td><td class="'+(diff?'pj-diff':'')+'">'+pjValFmt(p)+(diff?'<div style="font-size:10px;font-weight:400;color:#6B8BAA">Base: '+pjValFmt(b)+'</div>':'')+'</td><td>'+pjEsc((p.fonte||'').replace(/^PLACEHOLDER:?\s*/,''))+'</td></tr>';
  });
  h+='</tbody></table></div>';
  h+='<div class="pj-grid2" style="margin-top:14px"><div class="chart-card"><div class="chart-title">Pontos a validar (demonstra\u00e7\u00e3o)</div><ul class="pj-list"><li>Plano de expans\u00e3o: valor e calend\u00e1rio do capex da loja nova</li><li>Contrato do financiamento banc\u00e1rio (a parcela usada \u00e9 a m\u00e9dia recente)</li><li>Limite e taxa da antecipa\u00e7\u00e3o de receb\u00edveis</li><li>Meta de Sell-in do franqueador para 2027 em diante</li></ul></div>'
    +'<div class="chart-card"><div class="chart-title">Limita\u00e7\u00f5es conhecidas</div><ul class="pj-list"><li>A rela\u00e7\u00e3o compras \u00f7 vendas \u00e9 a principal sensibilidade da proje\u00e7\u00e3o</li><li>Calibra\u00e7\u00e3o dos pagamentos \u00e0 Truss com poucos meses de hist\u00f3rico</li><li>Sazonalidade vem das metas do franqueador; 2028\u201329 herdam a de 2027</li><li>Todos os n\u00fameros desta p\u00e1gina s\u00e3o fict\u00edcios</li></ul></div></div>';
  h+='<p class="pj-note">Modelo atualizado mensalmente: ao fechar cada m\u00eas, o realizado substitui o projetado e o horizonte continua em at\u00e9 3 anos. '+(PJ.versao?('Vers\u00e3o: '+pjEsc(PJ.versao)+'.'):'')+'</p>';
  return h;
}



/* ════ DEMONSTRAÇÃO: dados fictícios no lugar do Supabase (proj_dfc / proj_premissas) ════ */
var PJ_SC = {
  base:        { g:0.012, rz:0.93, inad:0.015, cap:1.00, resp:0 },
  conservador: { g:0.003, rz:1.00, inad:0.030, cap:1.10, resp:1 },
  otimista:    { g:0.020, rz:0.88, inad:0.010, cap:0.90, resp:0 },
  livre:       { g:0.008, rz:0.96, inad:0.020, cap:1.00, resp:0 }
};
var PJ_SAZ = [0.88,0.90,0.95,0.97,1.00,0.98,1.00,1.02,1.03,1.08,1.18,1.30];
function pjFakeReais(){
  var out = [];
  MESES_COM_DADOS.forEach(function(k){
    var d = DFC_DADOS[k], c = calcDFC(d);
    out.push({
      mk:k, realizado:true, caixa_pre:null,
      vendas:d.recVendas*1.07, compras:-(d.pgtoTruss+d.pgtoNaoTruss)*1.04,
      ent_clientes:d.recVendas, juros_multas:d.jurosMultas+d.outrasEnt,
      pgto_truss:d.pgtoTruss, pgto_nao_truss:d.pgtoNaoTruss, pgto_pessoal:d.pgtoPessoal, pgto_prolabore:0,
      pgto_mkt:d.pgtoMkt, pgto_comissoes:d.pgtoComissoes, pgto_logistica:d.pgtoLogistica, pgto_ocupacao:d.pgtoOcupacao,
      pgto_gerais:d.pgtoGerais, pgto_terceiros:d.pgtoTerceiros, pgto_impostos:d.pgtoImpostos,
      caixa_operacional:c.fcOp, sai_invest:d.saiInvest+d.entInvest, pgto_financ:d.pgtoFinanc,
      antecipacao:0, encargos_antec:0, aporte:0, outros_financ:d.emprestimos,
      caixa_inicial:d.caixaInicial, caixa_final:c.caixaFinal
    });
  });
  return out;
}
function pjFakeCenario(cen, reais, cxm){
  var S = PJ_SC[cen], n = reais.length, ult = reais[n-1], i, t;
  var hist = reais.reduce(function(a,r){return a+r.compras;},0) / reais.reduce(function(a,r){return a+r.vendas;},0);
  var razao = hist * S.rz;
  var u3 = reais.slice(-3), media = function(f){ return u3.reduce(function(a,r){return a+r[f];},0)/u3.length; };
  var fixos = ['pgto_pessoal','pgto_mkt','pgto_logistica','pgto_ocupacao','pgto_gerais','pgto_terceiros'];
  var fin = reais.slice(1).reduce(function(a,r){return a+r.pgto_financ;},0)/Math.max(1,n-1);
  var mi0 = parseInt(ult.mk.slice(5,7),10)-1, ano0 = parseInt(ult.mk.slice(0,4),10);
  var N = 39, V = [], C = [], mk = [], mm = [];
  for (t=0;t<=N+1;t++){ var m = (mi0+t)%12, y = ano0+Math.floor((mi0+t)/12); mm.push(m); mk.push(y+'-'+String(m+1).padStart(2,'0'));
    V.push(ult.vendas*Math.pow(1+S.g,t)*PJ_SAZ[m]/PJ_SAZ[mi0]); }
  V[0] = ult.vendas;
  for (t=1;t<=N;t++) C[t] = razao*V[t+1];
  C[0] = ult.compras; C[-1] = n>1 ? reais[n-2].compras : ult.compras;
  var caixa0 = ult.caixa_final, caixa = caixa0, rows = [], capexPlan = {2:0.30, 3:0.30, 4:0.25, 5:0.20, 6:0.15, 18:0.20, 19:0.20, 20:0.15};
  var limAntec = 0.12, taxaAntec = 0.028;
  for (t=1;t<=N;t++){
    var ent = ((0.6*V[t]+0.4*V[t-1])/1.07) * (1-S.inad)/(1-0.015);
    var pay = (0.5*C[t-1]+0.5*C[t-2])/1.04, infl = Math.pow(1.06, t/12);
    var r = { mk:mk[t], realizado:false, caixa_pre:null, vendas:V[t], compras:C[t], ent_clientes:ent, juros_multas:media('juros_multas'),
      pgto_truss:-0.82*pay, pgto_nao_truss:-0.18*pay, pgto_prolabore:0, pgto_comissoes:-0.05*ent, pgto_impostos:-0.09*ent };
    fixos.forEach(function(f){ r[f] = media(f)*infl; });
    r.caixa_operacional = r.ent_clientes+r.juros_multas+r.pgto_truss+r.pgto_nao_truss+r.pgto_comissoes+r.pgto_impostos+fixos.reduce(function(a,f){return a+r[f];},0);
    r.sai_invest = capexPlan[t] ? -Math.max(caixa0,250000)*1.9*S.cap*capexPlan[t] : 0;
    r.pgto_financ = fin;
    var antes = caixa + r.caixa_operacional + r.sai_invest + r.pgto_financ;
    var nec = Math.max(0, cxm-antes), face = 0, enc = 0, aporte = 0;
    if (nec>0){ face = Math.min(limAntec*V[t], nec/(1-taxaAntec)); enc = face*taxaAntec; aporte = Math.max(0, nec-(face-enc)); }
    r.antecipacao = face; r.encargos_antec = -enc; r.aporte = aporte; r.outros_financ = 0;
    r.caixa_inicial = caixa; caixa = antes+face-enc+aporte; r.caixa_final = caixa;
    rows.push(r);
  }
  return rows;
}
function pjFakePremissas(cen, cxm, hist){
  var S = PJ_SC[cen], pf = function(v){ return v; };
  var L = [
    ['Vendas','g','Crescimento mensal das vendas (tendência)',S.g,'pct2','Premissa DGX — fictícia'],
    ['Vendas','saz','Sazonalidade','Perfil do varejo de beleza: pico em nov/dez','', 'Metas do franqueador — fictício'],
    ['Recebimentos','inad','Inadimplência dos boletos',S.inad,'pct','Histórico recente — fictício'],
    ['Recebimentos','prazo','Prazo de recebimento','60% no mês da venda, 40% no mês seguinte','', 'Mix boleto/cartão/pix — fictício'],
    ['Compras e fornecedores','rz','Compras ÷ vendas (Sell-in ÷ Sell-through)',hist*S.rz,'pct','Base: meta do franqueador · Conservador: histórico'],
    ['Compras e fornecedores','pgt','Pagamento à Truss','50% em 1 mês e 50% em 2 meses após a compra','', 'Calibração com poucos meses — fictício'],
    ['Despesas e impostos','infl','Inflação das despesas fixas (a.a.)',0.06,'pct','Premissa DGX — fictícia'],
    ['Despesas e impostos','com','Comissões (% das entradas)',0.05,'pct','Política comercial — fictícia'],
    ['Despesas e impostos','imp','Impostos sobre entradas',0.09,'pct','Regime tributário — fictício'],
    ['Financiamento e caixa mínimo','cap','Plano de expansão (capex da loja nova)', 'Nov/26 a Jan/27 · '+Math.round(S.cap*190)+'% do caixa atual (m\u00ednimo de R$ 475 mil)','', 'Plano de expansão — fictício'],
    ['Financiamento e caixa mínimo','cxm','Caixa mínimo',cxm,'brl','Política de caixa — fictícia'],
    ['Financiamento e caixa mínimo','ant','Antecipação de recebíveis (limite / taxa)','até 12% das vendas do mês · 2,8% de deságio','', 'Contrato — a validar PLACEHOLDER']
  ];
  return L.map(function(x,i){
    var txt = (typeof x[3]==='string') ? x[3] : null;
    return { cenario:cen, grupo:x[0], chave:x[1], rotulo:x[2], valor_num:txt?null:x[3], valor_txt:txt, formato:x[4], fonte:x[5], ordem:i };
  });
}
async function pjCarregar(){
  PJ.carregando = true; PJ.erro = null; PJ.dados = {}; PJ.prem = {};
  try {
    var reais = pjFakeReais(), ult = reais[reais.length-1];
    var cxm = Math.max(50000, Math.round(0.45*ult.caixa_final/1000)*1000);
    PJ_HIST_RAZAO = reais.reduce(function(a,r){return a+r.compras;},0) / reais.reduce(function(a,r){return a+r.vendas;},0);
    ['base','conservador','otimista','livre'].forEach(function(cen){
      var rows = reais.map(function(r){ var o = {}; Object.keys(r).forEach(function(k){ o[k]=r[k]; }); return o; }).concat(pjFakeCenario(cen, reais, cxm));
      rows.forEach(function(r){
        var o = { cen:cen, mk:r.mk, realizado:r.realizado, caixa_pre:null };
        PJ_NUM.forEach(function(f){ o[f] = pjN(r[f]); });
        o.lbl = pjLbl(o.mk); o.ano = parseInt(o.mk.slice(0,4),10);
        o.desp = PJ_DESP.reduce(function(a,f){return a+o[f];},0);
        o.antec_liq = o.antecipacao + o.encargos_antec;
        (PJ.dados[cen] = PJ.dados[cen] || []).push(o);
      });
      PJ.prem[cen] = pjFakePremissas(cen, cxm, PJ_HIST_RAZAO);
    });
    PJ.versao = 'dados fictícios';
    PJ.carregado = true;
  } catch(e){ console.error(e); PJ.erro = (e && e.message) ? e.message : String(e); }
  PJ.carregando = false;
}
async function initProjecao(){
  var tp = document.getElementById('topbarPeriod'); if (tp) tp.textContent = 'Out/26 – Dez/29';
  pjRenderShell();
  await pjCarregar();
  pjRenderShell();
}
