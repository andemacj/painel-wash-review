/* W12 — sober aggregate views and a separate, internal-only answer-to-school action layer. */
(() => {
  'use strict';
  const D = window.WASH_PREVIEW_DATA, CONFIG = window.WASH_PREVIEW_CONFIG;
  const THEMES = window.WASH_PREVIEW_THEMES;
  const {esc, fmt, pct, pp, date} = D;
  const UF_NAMES = {AC:'Acre',AL:'Alagoas',AM:'Amazonas',AP:'Amapá',BA:'Bahia',CE:'Ceará',MA:'Maranhão',MG:'Minas Gerais',MT:'Mato Grosso',PA:'Pará',PB:'Paraíba',PE:'Pernambuco',PI:'Piauí',RN:'Rio Grande do Norte',RO:'Rondônia',RR:'Roraima',SE:'Sergipe',TO:'Tocantins'};
  const UF_PREFIX = {'11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO','21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA','31':'MG','51':'MT'};
  // THEME / ICONS — inline vectors, no external library.
  const ICONS={
    school:'<path d="M3 21V9l9-6 9 6v12H3Zm6 0v-6h6v6M7 10h2m6 0h2"/><circle cx="12" cy="8" r="1"/>',
    water:'<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Zm-4 13a4 4 0 0 0 4 4"/>',
    recycle:'<path d="m9 6 3-4 5 7m0-4v4h-4m6 3 3 5-5 3m4-3-4 3-1-4m-2 5H6l-3-6m0 4v-4h4m-3-3 3-5"/>',
    sanitation:'<path d="M3 11h18l-2 7H5l-2-7Zm5 7v3m8-3v3M8 11V6a4 4 0 0 1 8 0v1m-2 0h4"/>',
    hygiene:'<path d="M8 9h8l2 12H6L8 9Zm2 0V5h4v4m-3-4V2h6m-1 3h3"/>',
    leaf:'<path d="M20 3C7 1 2 8 6 15s15 4 14-12ZM4 21 16 8m-7 8v-6m0 6h6"/>',
    tools:'<path d="m14 5 3 3 4-4a6 6 0 0 1-8 8L5 21l-3-3 9-8a6 6 0 0 1 3-8v3Z"/>',
    shield:'<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Zm0 5v6m0 3v1"/>',
    chart:'<path d="M4 21V11h3v10Zm7 0V3h3v18Zm7 0V7h3v14Z"/>',
    map:'<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2V5Zm6-2v15m6-12v15"/>',
    file:'<path d="M5 2h10l4 4v16H5V2Zm10 0v5h4M9 11h6m-6 4h6m-6 4h4"/>',
    download:'<path d="M12 2v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-5a6 6 0 0 1 12 0v5m2-17a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v3"/>',
    compare:'<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>'
  };
  const icon=name=>'<svg class="wash-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(ICONS[name]||ICONS.file)+'</svg>';
  const state = {metadata:null,catalog:[],national:null,current:null,ufData:null,models:new Map(),territories:[],cache:new Map(),requestToken:0,indexToken:0,
    uf:'',ibge:'',area:'all',view:'percent',theme:'gestao-riscos',question:'115',search:'',allThemes:false,municipalities:null,
    loading:false,error:'',referenceError:'',indexError:'',indexLoading:false,detail:null,previewRequested:false,schoolListRequested:false,expandedOptions:new Set(),schoolAnswerFilter:null,schoolAnswerCount:null,answerRequest:0,answerProgress:{loaded:0,total:0},answerErrors:[],lastAnswerTrigger:''};
  const $ = id => document.getElementById(id), root = $('wash-root');
  const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
  const themeFor = n => THEMES.find(t=>t.question_numbers.includes(Number(n)));
  const activeTheme = () => THEMES.find(t=>t.id===state.theme);
  const ufLabel = uf => (UF_NAMES[uf] || uf) + ' (' + uf + ')';
  const scopeLabel = () => state.ibge ? (state.current?.municipality || state.ibge) + ' (' + state.uf + ')' : state.uf ? ufLabel(state.uf) : D.universe;
  const announce = text => { $('wash-live').textContent = text; };
  const endpoint = p => CONFIG.releaseBase + '/' + p;
  const empty = text => '<p class="wash-empty">' + esc(text) + '</p>';
  const reportLink = () => state.ibge ? 'relatorio-municipal.html?uf=' + state.uf + '&ibge=' + state.ibge : '';

  // W11 — explicit visual contracts; no analytical field is changed here.
  const QUESTION_VISUAL_WEIGHT = Object.freeze({
    19:'feature',22:'wide',23:'compact',28:'feature',40:'compact',43:'wide',50:'standard',58:'standard',
    65:'feature',68:'standard',69:'compact',76:'compact',81:'standard',83:'standard',84:'standard',85:'standard',94:'standard',
    98:'standard',99:'standard',101:'compact',103:'compact',104:'standard',105:'standard',106:'compact',
    109:'feature',111:'feature',115:'standard',116:'standard',117:'standard',118:'compact',119:'compact'
  });
  const THEME_VISUAL_LAYOUT = Object.freeze({
    'contexto-apoio': {mode:'SINGLE',summaryQuestions:[19],summarySpans:[12],resultSpans:{19:12},rows:[[19]],featureQuestion:19,insightsLimit:1,schoolDetailRatio:[1.8,0.9]},
    'abastecimento-agua': {mode:'MULTI_COMPLEX',summaryQuestions:[22,23,40,43,58],summarySpans:[4,4,4,6,6],resultSpans:{22:6,23:3,28:6,40:3,43:6,50:6,58:6},rows:[[22,23,40],[28,43],[50,58]],featureQuestion:28,insightsLimit:2,schoolDetailRatio:[1.8,0.9]},
    'residuos-solidos': {mode:'SMALL_COMPLEX',summaryQuestions:[65,68,69],summarySpans:[4,4,4],resultSpans:{65:6,68:3,69:3},rows:[[65,68,69]],featureQuestion:65,insightsLimit:2,schoolDetailRatio:[1.8,0.9]},
    'esgotamento-sanitario': {mode:'MULTI_BALANCED',summaryQuestions:[76,81,83,84,85,94],summarySpans:[4,4,4,4,4,4],resultSpans:{76:4,81:4,83:4,84:4,85:4,94:4},rows:[[76,81,83],[84,85,94]],featureQuestion:null,insightsLimit:2,schoolDetailRatio:[1.8,0.9]},
    'higiene-dignidade-menstrual': {mode:'MULTI_BALANCED_7',summaryQuestions:[98,99,101,103,104,105,106],summarySpans:[3,3,3,3,4,4,4],resultSpans:{98:3,99:3,101:3,103:3,104:4,105:4,106:4},rows:[[98,99,101,103],[104,105,106]],featureQuestion:null,insightsLimit:2,schoolDetailRatio:[1.8,0.9]},
    'drenagem-adaptacao': {mode:'SINGLE',summaryQuestions:[109],summarySpans:[12],resultSpans:{109:12},rows:[[109]],featureQuestion:109,insightsLimit:1,schoolDetailRatio:[1.8,0.9]},
    'gestao-manutencao': {mode:'SINGLE',summaryQuestions:[111],summarySpans:[12],resultSpans:{111:12},rows:[[111]],featureQuestion:111,insightsLimit:1,schoolDetailRatio:[1.8,0.9]},
    'gestao-riscos': {mode:'MULTI_5',summaryQuestions:[115,116,117,118,119],summarySpans:[4,4,4,6,6],resultSpans:{115:4,116:4,117:4,118:6,119:6},rows:[[115,116,117],[118,119]],featureQuestion:null,insightsLimit:2,schoolDetailRatio:[1.8,0.9]}
  });
  function getThemeLayoutMode(themeId=state.theme) {
    return THEME_VISUAL_LAYOUT[themeId].mode;
  }
  function buildQuestionViewModel(question,data,refData=null,area=state.area) {
    const model = D.model(question,data,area,refData), theme = themeFor(question.question_number);
    return {...model,theme,display:{...theme.questions[model.number],short:model.number==='65'?'Destinação final dos resíduos':theme.questions[model.number].short}};
  }
  function rebuildModels() {
    const make = (data,ref) => new Map(state.catalog.map(q=>[String(q.question_number),buildQuestionViewModel(q,data,ref)]));
    state.models = make(state.current,state.ibge ? state.ufData : state.uf ? state.national : null);
    state.territories = [{key:'current',label:scopeLabel(),data:state.current,models:state.models}];
    if(state.ibge) state.territories.push({key:'uf',label:ufLabel(state.uf),data:state.ufData,models:make(state.ufData,state.national)});
    if(state.uf) state.territories.push({key:'national',label:D.reference,data:state.national,models:make(state.national,null)});
  }
  async function fetchJson(url) {
    if(state.cache.has(url))return state.cache.get(url);
    const promise=window.WASH_REVIEW_DATA.read(url).catch(error=>{state.cache.delete(url);throw error;});
    state.cache.set(url,promise);return promise;
  }
  function readUrl() {
    const params = new URL(window.location.href).searchParams, rawUf=(params.get('uf')||'').toUpperCase();
    let ibge=params.get('ibge')||params.get('municipio')||'';
    if(!/^\d{7}$/.test(ibge))ibge='';
    const uf=Object.hasOwn(UF_NAMES,rawUf)?rawUf:(ibge?UF_PREFIX[ibge.slice(0,2)]||'':'');
    if(!uf || ibge && UF_PREFIX[ibge.slice(0,2)]!==uf)ibge='';
    const q=params.get('q')||params.get('questao')||'';
    const theme=THEMES.find(t=>t.id===params.get('tema'))||themeFor(q)||THEMES.find(t=>t.id==='gestao-riscos');
    state.theme=theme.id;state.question=theme.question_numbers.includes(Number(q))?String(Number(q)):String(theme.question_numbers[0]);
    state.area=D.scopes.includes(params.get('scope'))?params.get('scope'):'all';
    state.view=['count','numero','number'].includes(params.get('view')||params.get('visualizacao'))?'count':'percent';
    return {uf,ibge};
  }
  function writeUrl() {
    const url=new URL(window.location.href);
    ['uf','ibge','municipio','tema','q','questao','scope','view','visualizacao'].forEach(k=>url.searchParams.delete(k));
    if(state.uf)url.searchParams.set('uf',state.uf);if(state.ibge)url.searchParams.set('ibge',state.ibge);
    url.searchParams.set('tema',state.theme);url.searchParams.set('q',state.question);url.searchParams.set('scope',state.area);url.searchParams.set('view',state.view==='count'?'count':'pct');
    window.history.replaceState(null,'',url);
  }
  // RENDER / PAGE COMPOSITION.
  function renderShell() {
    root.innerHTML='<section class="wash-filterbar wash-panel" aria-label="Filtros territoriais e do tema">'+
      '<label class="wash-field" for="wash-theme">Tema<select id="wash-theme">'+THEMES.map(t=>'<option value="'+t.id+'">'+esc(t.title)+'</option>').join('')+'</select></label>'+
      '<label class="wash-field" for="wash-uf">UF<select id="wash-uf"><option value="">Universo Selo UNICEF</option>'+Object.entries(UF_NAMES).sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([uf,name])=>'<option value="'+uf+'">'+esc(name)+' ('+uf+')</option>').join('')+'</select></label>'+
      '<label class="wash-field" for="wash-municipio">Município<select id="wash-municipio" disabled><option value="">Selecione uma UF</option></select></label>'+
      '<label class="wash-field" for="wash-area">Área de abrangência<select id="wash-area"><option value="all">Geral</option><option value="urban">Urbana</option><option value="rural">Rural</option></select></label>'+
      '<label class="wash-field" for="wash-view">Visualizar em<select id="wash-view"><option value="percent">Percentual de escolas</option><option value="count">Número de escolas</option></select></label>'+
      '<button type="button" class="wash-button wash-button--clear" id="wash-clear">Limpar filtros</button>'+
      '<details class="wash-download" id="wash-download"><summary class="wash-button wash-button--primary">'+icon('download')+'Baixar resultados</summary><div class="wash-download-menu">'+
      '<button type="button" data-export="theme">Tema selecionado — CSV</button><button type="button" data-export="all">31 questões — CSV</button><button type="button" data-export="question">Questão selecionada — CSV</button><a id="wash-report" aria-disabled="true">Selecione um município para gerar o relatório.</a></div></details>'+
      '<p id="wash-index-status" class="wash-filter-notice" hidden></p></section><div id="wash-status" role="status" hidden></div>'+
      '<section id="wash-municipal-actions" class="wash-panel wash-municipal-actions" aria-label="Ações do município" hidden></section><div id="wash-results" aria-busy="true"><div id="wash-summary" class="wash-overview-grid"><section id="wash-coverage" class="wash-panel wash-coverage" aria-labelledby="wash-coverage-title"></section><section id="wash-kpis" class="wash-kpis" aria-label="Síntese do tema"></section><section id="wash-reading-base" class="wash-panel reading-base-card" aria-labelledby="wash-reading-base-title" hidden></section></div>'+
      '<details id="wash-quick-reading" class="wash-panel wash-quick-reading" hidden><summary>Leitura rápida</summary><div id="wash-insights" class="wash-insights"></div></details>'+
      '<section id="wash-theme-results" class="wash-panel wash-theme-results" aria-labelledby="wash-results-title">'+
      '<div class="wash-section-head"><div class="wash-title-icon">'+icon('chart')+'<div><h2 id="wash-results-title">Resultados do tema</h2><p class="wash-muted">Respostas válidas às questões estratégicas.</p><p id="wash-question-count" class="wash-muted"></p></div></div>'+
      '<div class="wash-search-box"><label class="wash-field" for="wash-search">Buscar questão<input id="wash-search" type="search" placeholder="Número ou texto da questão"></label><label class="wash-check"><input id="wash-all-themes" type="checkbox">Buscar em todos os temas</label></div></div>'+
      '<details class="wash-how-to"><summary>Como ler</summary><p>Percentuais sobre as respostas válidas de cada pergunta. Nas questões Sim/Não, a barra completa representa 100%. As cores identificam as respostas, sem atribuir uma nota à escola. Sem resposta não equivale a “Não”.</p></details>'+
      '<div id="wash-question-results"></div></section></div>';
    renderSchoolsSection();
  }
  function renderSchoolsSection() {}
  // SCHOOLS / DEMAND — independent from analytical results.
  function ensureSchoolList() {}
  function refreshSchoolScope() {}
  let schoolObserver=null;
  function watchSchoolSection() {}

  function renderSchoolResults() {}
  function syncFilters() {
    ['wash-theme','wash-uf','wash-area','wash-view','wash-clear'].forEach(id=>{$(id).disabled=!state.metadata;});
    $('wash-theme').value=state.theme;$('wash-uf').value=state.uf;$('wash-area').value=state.area;$('wash-view').value=state.view;
    const select=$('wash-municipio');
    select.disabled=!state.uf||!state.municipalities;
    select.innerHTML=!state.uf?'<option value="">Selecione uma UF</option>':state.municipalities?'<option value="">Todos os municípios da UF</option>'+state.municipalities.filter(m=>m.uf===state.uf).map(m=>'<option value="'+m.ibge+'">'+esc(m.municipality)+'</option>').join(''):'<option value="">Carregando municípios…</option>'+(state.ibge?'<option value="'+state.ibge+'">'+esc(state.current?.municipality||state.ibge)+'</option>':'');
    select.value=state.ibge;
    $('wash-index-status').hidden=!state.indexError;
    $('wash-index-status').innerHTML=state.indexError?esc(state.indexError)+' <button type="button" id="wash-index-retry" class="wash-text-button">Tentar novamente</button>':'';
    const report=$('wash-report');report.textContent=state.ibge?'Gerar relatório municipal':'Selecione um município para gerar o relatório.';
    report.setAttribute('aria-disabled',String(!state.ibge));if(state.ibge)report.href=reportLink();else report.removeAttribute('href');
    root.querySelectorAll('[data-export]').forEach(button=>{button.disabled=state.loading||!state.current;});
    renderMunicipalActions();
    $('wash-title').textContent='Diagnóstico WASH nas escolas';
    $('wash-subtitle').textContent='Tema: '+activeTheme().title+' — '+activeTheme().subtitle;document.title='Diagnóstico WASH nas escolas';
  }
  async function loadMunicipalityIndex() {
    if(!state.uf||state.municipalities)return;
    const token=++state.indexToken;state.indexLoading=true;state.indexError='';
    try {
      const payload=await fetchJson(endpoint('monitoramento/resumo_municipal.json'));
      if(token!==state.indexToken)return;
      state.municipalities=(payload.municipalities||[]).map(row=>({ibge:String(row.territory.ibge),municipality:row.territory.label,uf:row.territory.uf})).sort((a,b)=>a.municipality.localeCompare(b.municipality,'pt-BR'));
    } catch {if(token===state.indexToken)state.indexError='Não foi possível obter os municípios.';}
    finally {if(token===state.indexToken){state.indexLoading=false;syncFilters();}}
  }
  async function loadScope(next) {
    ++state.answerRequest;
    const token=++state.requestToken;state.uf=next.uf||'';state.ibge=next.ibge||'';state.loading=true;state.current=null;state.ufData=null;state.error='';state.referenceError='';
    closeQuestionDetail(false);closeSchoolDetail(false);$('wash-selected-detail').innerHTML='<h2 id="wash-selected-title">Detalhe da questão</h2><p class="wash-muted">Carregando o território selecionado…</p>';$('wash-results').hidden=true;$('wash-results').setAttribute('aria-busy','true');
    $('wash-status').hidden=false;$('wash-status').textContent='Carregando resultados do território…';syncFilters();writeUrl();
    void refreshSchoolScope();
    if(state.uf)void loadMunicipalityIndex();
    try {
      let data=state.national,region=null;
      if(next.uf && !next.ibge){data=D.normalize(await fetchJson(endpoint('diagnostico/uf/'+encodeURIComponent(next.uf)+'.json')),state.area);region=data;if(data.scope!=='UF'||data.uf!==next.uf)throw new Error('UF incompatível.');}
      else if(next.ibge){
        const results=await Promise.allSettled([fetchJson(endpoint('diagnostico/municipios/'+encodeURIComponent(next.ibge)+'.json')),fetchJson(endpoint('diagnostico/uf/'+encodeURIComponent(next.uf)+'.json'))]);
        if(token!==state.requestToken)return;
        if(results[0].status==='rejected')throw results[0].reason;
        data=D.normalize(results[0].value,state.area);
        if(data.scope!=='MUNICIPIO'||data.ibge!==next.ibge||data.uf!==next.uf)throw new Error('Município incompatível.');
        if(results[1].status==='fulfilled'){region=D.normalize(results[1].value,state.area);if(region.scope!=='UF'||region.uf!==next.uf)region=null;}
        if(!region)state.referenceError='Referência da UF indisponível. A Referência Selo UNICEF continua disponível.';
      }
      if(token!==state.requestToken)return;
      state.current=data;state.ufData=region;state.loading=false;rebuildModels();syncFilters();renderResults();renderMunicipalActions();watchSchoolSection();if(state.schoolAnswerFilter)void refreshSchoolScope();
      $('wash-results').hidden=false;$('wash-results').setAttribute('aria-busy','false');$('wash-status').hidden=!state.referenceError;$('wash-status').textContent=state.referenceError;
      announce('Resultados carregados: '+scopeLabel()+', '+D.labels[state.area]+'.');
    } catch {
      if(token!==state.requestToken)return;state.loading=false;state.error='Não foi possível carregar este território. Verifique a seleção ou tente novamente.';state.current=null;state.models.clear();$('wash-selected-detail').innerHTML='<h2 id="wash-selected-title">Detalhe da questão</h2><p class="wash-muted">Selecione um território disponível para consultar o detalhe.</p>';
      $('wash-results').setAttribute('aria-busy','false');$('wash-status').innerHTML=esc(state.error)+' <button type="button" id="wash-retry" class="wash-button">Tentar novamente</button>';syncFilters();
    }
  }
  function renderCoverageSummary() {
    const c=state.current.scopes[state.area].coverage,all=state.current.scopes.all.coverage;
    const share=(count,total)=>total>0?count/total*100:null;
    if(c.completed_schools+c.pending_schools!==c.eligible_schools){$('wash-coverage').innerHTML=empty('Panorama temporariamente indisponível.');return;}
    const locations=[['urban','Urbana'],['rural','Rural']];
    const unclassified=state.current.scopes.not_classified?.coverage.eligible_schools;
    if(unclassified>0)locations.push(['not_classified','Não classificada']);
    $('wash-coverage').innerHTML='<div class="wash-title-icon">'+icon('map')+'<div><h2 id="wash-coverage-title">Panorama do território</h2><p>'+esc(scopeLabel())+' · Área: '+D.labels[state.area]+'</p></div></div>'+
      '<dl class="wash-coverage-values">'+[['Escolas elegíveis',c.eligible_schools,c.eligible_schools?100:null],['Finalizadas',c.completed_schools,share(c.completed_schools,c.eligible_schools)],['Pendentes',c.pending_schools,share(c.pending_schools,c.eligible_schools)]].map(([label,value,percentage])=>'<div><dt>'+label+'</dt><dd>'+fmt(value)+'</dd><small>'+pct(percentage)+'</small></div>').join('')+'</dl>'+
      '<div class="wash-completion-track" aria-hidden="true"><span class="wash-completion-final" style="width:'+(share(c.completed_schools,c.eligible_schools)||0)+'%"></span><span class="wash-completion-pending" style="width:'+(share(c.pending_schools,c.eligible_schools)||0)+'%"></span></div>'+
      '<section class="wash-location-composition" aria-labelledby="wash-location-title"><h3 id="wash-location-title">Localização das escolas elegíveis</h3><p class="wash-muted">Geral do território · '+fmt(all.eligible_schools)+' escolas</p>'+locations.map(([scope,label])=>{
        const count=state.current.scopes[scope].coverage.eligible_schools,percentage=share(count,all.eligible_schools);
        return '<div class="wash-location-line" data-location="'+scope+'" data-count="'+count+'" data-percentage="'+percentage+'"><span>'+label+'</span><b>'+fmt(count)+'</b><strong>'+pct(percentage)+'</strong><span class="wash-location-track" aria-hidden="true"><i class="wash-scope-fill--'+scope+'" style="width:'+(percentage||0)+'%"></i></span></div>';
      }).join('')+'</section><section class="wash-coverage-scopes"><h3>Cobertura da autoavaliação</h3>'+renderScopeSummary(D.coverageSeries(state.current),{coverage:true,secondaryOnly:true,allScopes:true})+'</section>';
  }

  function renderScopeSummary(series,{coverage=false,secondaryOnly=false,allScopes=false,selected=state.area,showPrimaryLabel=true,focusLabel=''}={}) {
    const primary=series.find(item=>item.scope===selected),others=series.filter(item=>allScopes||item.scope!==selected);
    const countBase=s=>coverage?s.eligible:s.nValid;
    const value=s=>s.eligible===0?'Sem escolas elegíveis':!countBase(s)?'Sem respostas válidas':state.view==='count'?fmt(s.count):pct(s.pct);
    const secondary='<div class="wash-scope-secondary'+(allScopes?' wash-scope-secondary--three':'')+'">'+others.map(s=>'<div class="wash-scope-cell" data-scope="'+s.scope+'"><span>'+s.label+'</span><strong>'+pct(s.pct)+'</strong><small>'+fmt(s.count)+' / '+fmt(countBase(s))+'</small><span class="wash-scope-track" aria-hidden="true"><i class="wash-scope-fill--'+s.scope+'" style="width:'+Math.max(0,Math.min(100,s.pct||0))+'%"></i></span></div>').join('')+'</div>';
    return '<div class="wash-scope-summary" role="group" aria-label="'+esc((coverage?'Cobertura':focusLabel?'Resposta: '+focusLabel:'Resposta em foco')+' por área')+'"'+(!coverage&&focusLabel?' title="'+esc('Resposta: '+focusLabel)+'"':'')+'>'+
      (!secondaryOnly?'<div class="wash-scope-primary"><span class="'+(showPrimaryLabel?'wash-scope-primary-label':'wash-sr-only')+'">'+D.labels[selected]+'</span><strong>'+value(primary)+'</strong><small>'+fmt(primary.count)+' escolas · n '+fmt(countBase(primary))+'</small></div>':'')+secondary+'</div>';
  }

  function renderQuestionScopeComparison(model) {
    return model.comparable?'<div class="wash-question-comparison" title="Resposta: '+esc(model.focus.label)+'">'+renderScopeSummary(model.series,{secondaryOnly:true,selected:model.scope,focusLabel:model.focus.label})+'</div>':'';
  }
  function getKpiModels() {
    return THEME_VISUAL_LAYOUT[state.theme].summaryQuestions.map(n=>state.models.get(String(n)));
  }
  const metricValue=s=>s.eligible===0?'Sem escolas elegíveis':!s.nValid?'Sem respostas válidas':state.view==='count'?fmt(s.count):pct(s.pct);
  function renderScopeBreakdown(model) {return model.comparable?renderScopeSummary(model.series,{selected:model.scope,showPrimaryLabel:false,focusLabel:model.focus.label}):'';}
  function renderKpi(m, index=0) {
    const shortTitles={22:'Água encanada',43:'Limpeza do reservatório',76:'Banheiros por gênero',84:'Água nas pias',85:'Sabão nas pias',98:'Chuveiros',99:'Água no refeitório',101:'Lavagem de Mãos',103:'Saúde na Escola',104:'Produtos menstruais',105:'Troca de absorventes',106:'Saúde menstrual',109:'Adaptação local',111:'Plano de manutenção',115:'Eventos climáticos',116:'Área de risco',117:'Suspensão de aulas',118:'Capacitação / simulado',119:'Plano de contingência'};
    const negative=m.semantic==='NEGATIVE_DIRECT', span=THEME_VISUAL_LAYOUT[state.theme].summarySpans[index];
    const frequent=[...m.options].sort((a,b)=>(b.count??-1)-(a.count??-1)).slice(0,2);
    const categorical='<p class="wash-kpi-scope">Distribuição categórica</p>'+
      (m.nEligible===0||!m.nValid?'<p class="wash-kpi-base">'+(m.nEligible===0?'Sem escolas elegíveis':'Sem respostas válidas')+'</p>':'<ul class="wash-kpi-categories">'+frequent.map((o,index)=>'<li>'+renderAnswerOption(m,o,index,'kpi',false,true)+'</li>').join('')+'</ul>')+
      '<p class="wash-kpi-base">n válido '+fmt(m.nValid)+' · sem foco único</p><button type="button" class="wash-text-button" data-scroll-question="'+m.number+'">Ver distribuição</button>';
    return '<article class="wash-panel wash-kpi'+(negative?' wash-kpi--occurrence':'')+'" data-kpi-question="'+m.number+'" style="--summary-span:'+span+'"'+modelAttributes(m)+'>'+
      '<div class="wash-kpi-heading">'+icon(m.theme.icon)+'<button type="button" class="wash-kpi-link" data-select-question="'+m.number+'" aria-controls="wash-selected-detail" title="'+esc(m.display.short+(m.comparable?' · Resposta: '+m.focus.label:''))+'">'+esc(shortTitles[m.number]||m.display.short)+'</button></div>'+
      (m.comparable?renderScopeBreakdown(m):categorical)+
      '</article>';
  }
  function renderKpis() {
    const layout=THEME_VISUAL_LAYOUT[state.theme], models=getKpiModels(), single=layout.mode==='SINGLE';
    $('wash-summary').setAttribute('data-theme-layout',layout.mode);$('wash-kpis').setAttribute('aria-label','Síntese do tema · '+D.labels[state.area]);
    $('wash-kpis').innerHTML=models.map(renderKpi).join('');
    const base=$('wash-reading-base');base.hidden=!single;
    if(single){
      const m=models[0],coverage=state.current.scopes[state.area].coverage;
      const rows=[['file','Respostas válidas',fmt(m.nValid)],['map','Municípios no recorte',fmt(coverage.municipalities)],['compare','Diferença Urbana–Rural',m.gap===null?'Sem comparação válida':pp(m.gap)]];
      base.innerHTML='<h2 id="wash-reading-base-title">Base da leitura</h2><dl>'+rows.map(([symbol,label,value])=>'<div><dt>'+icon(symbol)+label+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>';
    }else base.innerHTML='';
    // Neutral comparisons of the existing focus, in official summary order; no ranking.
    const insights=single?[]:models.filter(m=>m.comparable&&m.gap!==null).slice(0,layout.insightsLimit);
    $('wash-quick-reading').hidden=!insights.length;
    $('wash-insights').innerHTML=insights.map(m=>'<p><b>Q'+m.number+' · '+esc(m.display.short)+'</b><span>Urbana–Rural: '+pp(m.gap)+' · Resposta: '+esc(m.focus.label)+'. Cada área usa sua própria base.</span></p>').join('');
    $('wash-bottom').style.setProperty('--school-ratio',layout.schoolDetailRatio[0]+'fr');
    $('wash-bottom').style.setProperty('--detail-ratio',layout.schoolDetailRatio[1]+'fr');
  }
  function optionTone(m,o) {
    const label=norm(o.label);
    if(!o.present)return 'missing';
    if(/^nao (se aplica|aplicavel)/.test(label))return 'na';
    if(/^nao sei|^nao sabe/.test(label))return 'unknown';
    if(label==='sim')return 'yes';
    if(label==='nao')return 'no';
    if(m.multi)return 'yes';
    if(label.startsWith('sim'))return o.label===m.question.focus_response_value?'yes':'partial';
    if(label.startsWith('nao'))return 'no';
    return 'category';
  }
  function orderedOptions(m) {
    const labels=m.question.observed_options;
    const result=labels.map(label=>m.options.find(o=>o.label===label)).filter(Boolean);
    m.options.forEach(o=>{if(!result.some(r=>r.label===o.label))result.push(o);});
    if(m.binary&&result.length===2&&result.every(o=>['sim','nao'].includes(norm(o.label))))result.sort((a,b)=>norm(a.label)==='sim'?-1:1);
    return result;
  }
  function interpretation(m) {
    if(m.number==='19')return 'A participação no PDDE descreve o contexto de apoio à escola; não representa uma nota de suas condições de WASH.';
    if(m.number==='94')return 'Resposta “Sim”: ocorrência relatada de esgoto a céu aberto.';
    if(m.semantic==='NEGATIVE_DIRECT')return 'Resposta “Sim”: ocorrência relatada que exige atenção. Maior percentual não indica melhora.';
    if(m.semantic==='RISK_EXPOSURE')return 'Representa exposição territorial declarada, não desempenho da escola.';
    if(m.semantic==='PERCEPTION')return 'Expressa a avaliação declarada pela escola, não uma verificação técnica.';
    return D.semantics[m.semantic].caution;
  }
  function modelAttributes(m) {return ' data-count="'+esc(m.focus.count)+'" data-percentage="'+esc(m.focus.pct)+'" data-n-valid="'+esc(m.nValid)+'" data-response-option="'+esc(m.focus.label)+'"';}
  function isYesNoQuestion(m) {
    const labels=m.question.observed_options;
    return m.binary&&!m.multi&&Array.isArray(labels)&&labels.length===2&&
      ['sim','nao'].every(label=>labels.some(value=>norm(value)===label));
  }
  function hasCompleteBinaryDistribution(m) {
    return isYesNoQuestion(m)&&!!m.aggregate&&m.nEligible>0&&m.nValid>0&&m.options.length===2&&
      ['sim','nao'].every(label=>m.options.some(o=>norm(o.label)===label))&&
      m.options.every(o=>o.present&&Number.isFinite(o.count)&&o.count>=0&&Number.isFinite(o.pct)&&o.pct>=0&&o.pct<=100)&&
      m.options.reduce((sum,o)=>sum+o.count,0)===m.nValid&&
      Math.abs(m.options.reduce((sum,o)=>sum+o.pct,0)-100)<=0.001;
  }
  function renderBinaryDistribution(m, compact=false, surface='card') {
    if(!hasCompleteBinaryDistribution(m))return '';
    const options=orderedOptions(m);
    return '<div class="wash-binary'+(compact?' wash-binary--compact':'')+'" role="group" aria-label="Respostas da questão Q'+m.number+' · '+D.labels[m.scope]+'"><div class="wash-binary-values">'+options.map((option,index)=>
      renderAnswerOption(m,option,index,surface,true)).join('')+'</div><div class="wash-binary-track" aria-hidden="true">'+options.map(o=>'<span class="wash-fill--'+optionTone(m,o)+'" style="width:'+o.pct+'%"></span>').join('')+'</div></div>';
  }

  const mSafeScope=scope=>D.scopes.includes(scope)?scope:'all';
  function renderAnswerOption(model,option,index,surface,binary=false,summary=false) {
    const enabled=true,tag='button',active=state.schoolAnswerFilter?.questionNumber===model.number&&state.schoolAnswerFilter.optionLabel===option.label&&state.schoolAnswerFilter.scope===model.scope;
    const attrs=enabled?' type="button" id="wash-answer-'+surface+'-'+model.number+'-'+index+'" data-answer-question="'+model.number+'" data-answer-value="'+esc(encodeURIComponent(option.label))+'" data-answer-scope="'+mSafeScope(model.scope)+'" aria-pressed="'+active+'" aria-label="'+esc(option.label+'; '+pct(option.pct)+'; '+fmt(option.count)+' escolas. Ver detalhe agregado')+'"':'';
    if(summary)return '<'+tag+' class="wash-answer-option wash-answer-option--summary'+(active?' is-active':'')+'"'+attrs+' data-response-option="'+esc(option.label)+'" data-count="'+option.count+'" data-percentage="'+option.pct+'"><span class="wash-response-label">'+esc(option.label)+'</span><strong>'+(state.view==='count'?fmt(option.count):pct(option.pct))+'</strong>'+(enabled?'<span class="wash-answer-action" aria-hidden="true">↗</span>':'')+'</'+tag+'>';
    return '<'+tag+' class="wash-answer-option'+(binary?' wash-answer-option--binary':'')+(active?' is-active':'')+'"'+attrs+' data-response-option="'+esc(option.label)+'" data-count="'+option.count+'" data-percentage="'+option.pct+'">'+
      '<span class="wash-response-label">'+(binary?'<i class="wash-binary-key wash-fill--'+optionTone(model,option)+'" aria-hidden="true"></i>':'')+esc(option.label)+'</span>'+
      (!binary?'<span class="wash-response-track" aria-hidden="true"><i class="wash-fill--'+optionTone(model,option)+'" style="width:'+Math.max(0,Math.min(100,option.pct||0))+'%"></i></span>':'')+
      '<strong>'+(state.view==='count'?fmt(option.count):pct(option.pct))+'</strong><small>'+(state.view==='count'?pct(option.pct):fmt(option.count)+' escolas')+'</small>'+
      (enabled?'<span class="wash-answer-action">Ver detalhe agregado <span aria-hidden="true">↗</span></span>':'')+'</'+tag+'>';
  }
  function renderQuestionDistribution(m, full=false, surface='card') {
    if(!m.aggregate)return empty('Agregado indisponível.');
    if(m.nEligible===0)return empty('Não há escolas elegíveis neste recorte.');
    if(!m.nValid)return empty('Sem respostas válidas.');
    if(hasCompleteBinaryDistribution(m))return renderBinaryDistribution(m,false,surface);
    const feature=['28','65'].includes(m.number),expandable=surface==='card'&&!full;
    const all=feature&&expandable?[...orderedOptions(m)].sort((a,b)=>(b.count??-1)-(a.count??-1)):orderedOptions(m);
    const expanded=expandable&&state.expandedOptions.has(m.number),limit=4;
    const options=full||expanded?all:all.slice(0,surface==='preview'?2:limit);
    const listId='wash-options-'+surface+'-'+m.number;
    return '<div class="wash-distribution" role="group" aria-label="Respostas da questão Q'+m.number+' · '+D.labels[m.scope]+'"><ul id="'+listId+'">'+options.map((option,index)=>
      '<li>'+renderAnswerOption(m,option,index,surface)+'</li>').join('')+'</ul>'+
      (expandable&&all.length>limit?'<button type="button" class="wash-text-button wash-more-options" id="wash-more-card-'+m.number+'" data-expand-options="'+m.number+'" aria-expanded="'+expanded+'" aria-controls="'+listId+'">'+(expanded?'Mostrar menos':'Ver todas as '+all.length+(m.number==='28'?' fontes':' respostas'))+'</button>':'')+'</div>';
  }
  function renderBase(m) {
    const a=m.aggregate;
    return '<dl class="wash-base">'+[['Escolas elegíveis',m.nEligible],['Autoavaliações finalizadas',m.nCompleted],['Respostas válidas',m.nValid],['Sem resposta',m.missing],['Não sabe',a?.n_dont_know],['Não se aplica',a?.n_not_applicable]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+fmt(value)+'</dd></div>').join('')+'<div><dt>Não exibida por fluxo</dt><dd>'+(a?.n_branch_not_shown==null?'Não identificável nesta base':fmt(a.n_branch_not_shown))+'</dd></div></dl><p class="wash-muted">Sem resposta não equivale a “Não”. Não sabe e Não se aplica conservam a definição de resposta válida da release.</p>';
  }
  function renderTerritorialReference(m, compact=false, area=m.scope) {
    if(!state.uf)return '';
    if(!m.comparable)return '<p class="wash-note">Esta questão é apresentada por distribuição, sem comparação por resposta única.</p>';
    if(m.nEligible===0||!m.nValid)return empty('Comparação indisponível neste recorte.');
    if(compact)return '<p class="wash-muted">'+esc(m.focus.label)+' · '+D.labels[area]+'</p><div class="wash-reference-list">'+state.territories.filter(t=>t.key!=='current').map(t=>{
      const r=buildQuestionViewModel(m.question,t.data,null,area),gap=m.focus.pct!==null&&r.focus.pct!==null?Number((m.focus.pct-r.focus.pct).toFixed(4)):null;
      return '<div class="wash-reference-item"><h4>'+esc(t.label)+'</h4><strong>'+pct(r.focus.pct)+'</strong><p>'+fmt(r.focus.count)+' escolas · n válido '+fmt(r.nValid)+'</p><p>Diferença do recorte atual: '+pp(gap)+'</p></div>';
    }).join('')+'</div><p class="wash-muted">'+esc(D.referenceNote)+'</p>';
    return '<div class="wash-table-wrap"><table class="wash-reference-table"><caption>Q'+m.number+' · '+esc(m.focus.label)+' · '+D.labels[area]+'</caption><thead><tr><th scope="col">Território</th><th scope="col">Percentual</th><th scope="col">Quantidade / n válido</th><th scope="col">Diferença do recorte atual</th></tr></thead><tbody>'+state.territories.map(t=>{
      const r=buildQuestionViewModel(m.question,t.data,null,area);const gap=m.focus.pct!==null&&r.focus.pct!==null?Number((m.focus.pct-r.focus.pct).toFixed(4)):null;
      return '<tr><th scope="row">'+esc(t.label)+'</th><td>'+pct(r.focus.pct)+'</td><td>'+fmt(r.focus.count)+' / '+fmt(r.nValid)+'</td><td>'+(t.key==='current'?'—':pp(gap))+'</td></tr>';
    }).join('')+'</tbody></table></div><p class="wash-muted">'+esc(D.referenceNote)+'</p>';
  }
  function renderQuestionCard(m, single=false, position={span:12}) {
    const badge=['PERCEPTION','RISK_EXPOSURE'].includes(m.semantic)?'<span class="wash-badge">'+esc(D.semantics[m.semantic].label)+'</span>':m.semantic==='NEGATIVE_DIRECT'?'<span class="wash-badge" title="'+esc(interpretation(m))+'">Ocorrência relatada</span>':'';
    return '<article id="wash-card-'+m.number+'" tabindex="-1" class="wash-question-card span-'+position.span+(single?' wash-question-card--single':'')+(state.question===m.number?' is-selected':'')+'" data-card-question="'+m.number+'" data-visual-weight="'+QUESTION_VISUAL_WEIGHT[m.number]+'" style="--result-span:'+position.span+';--result-row:'+(position.row||'auto')+';--result-column:'+(position.column||'auto')+'"'+modelAttributes(m)+'>'+
      '<div class="wash-card-heading">'+icon(m.theme.icon)+'<div><span class="wash-question-number">Q'+m.number+'</span><h3>'+esc(m.display.short)+'</h3>'+badge+'</div></div>'+
      '<div class="wash-card-content">'+renderQuestionDistribution(m)+'</div>'+renderQuestionScopeComparison(m)+
      (m.multi?'<p class="wash-card-note">Uma escola pode selecionar mais de uma opção. A soma pode ultrapassar 100%.</p>':'')+
      '<div class="wash-card-footer"><span>n válido '+fmt(m.nValid)+'</span><button type="button" class="wash-text-button" id="wash-select-'+m.number+'" data-select-question="'+m.number+'" aria-controls="wash-selected-detail" aria-pressed="'+(state.question===m.number)+'">Ver detalhe <span aria-hidden="true">→</span></button></div></article>';
  }
  function resultPositions(models) {
    const layout=THEME_VISUAL_LAYOUT[state.theme], positions={};
    if(models.length===activeTheme().question_numbers.length){
      layout.rows.forEach((row,index)=>{let column=1;row.forEach(n=>{positions[n]={span:layout.resultSpans[n],row:index+1,column};column+=layout.resultSpans[n];});});
    }else{
      // Search changes only placement, never the theme's semantic mode or DOM order.
      const rows=models.length===4?[models.slice(0,2),models.slice(2)]:[models.slice(0,3),models.slice(3)];
      rows.filter(row=>row.length).forEach((row,index)=>{let column=1;const feature=row.find(m=>QUESTION_VISUAL_WEIGHT[m.number]==='feature');
        row.forEach(m=>{const span=row.length===1?12:row.length===2?6:feature?(m===feature?6:3):4;positions[m.number]={span,row:index+1,column};column+=span;});});
    }
    return positions;
  }
  function renderResultGrid(models) {
    const positions=resultPositions(models), single=getThemeLayoutMode()==='SINGLE';
    return '<div class="results-grid" data-theme-mode="'+getThemeLayoutMode()+'" data-question-count="'+models.length+'">'+models.map(m=>renderQuestionCard(m,single,positions[m.number])).join('')+'</div>';
  }
  function renderResults() {if(!state.current)return;renderCoverageSummary();renderThemeResults();}
  function renderThemeResults() {
    const theme=activeTheme(),mode=getThemeLayoutMode();
    $('wash-theme-results').setAttribute('data-theme-layout',mode);
    $('wash-results-title').textContent='Resultados do tema';
    const models=theme.question_numbers.map(n=>state.models.get(String(n))),query=norm(state.search).replace(/^q\s*(\d+)$/,'$1');
    const matches=m=>!query||norm([m.number,'Q'+m.number,m.display.short,m.question.question_text].join(' ')).includes(query);
    const visible=models.filter(matches);
    $('wash-question-count').textContent=theme.title+' · '+theme.question_numbers.length+(theme.question_numbers.length===1?' questão':' questões')+' · '+D.labels[state.area]+(query?' · '+visible.length+' encontradas':mode==='MULTI_COMPLEX'?' neste tema · veja todas abaixo':'');
    let html=!visible.length?empty('Nenhuma questão corresponde à busca neste tema.'):renderResultGrid(visible);
    if(query&&state.allThemes){const others=[...state.models.values()].filter(m=>m.theme.id!==state.theme&&matches(m));html+='<div class="wash-other-results"><h3>Resultados em outros temas</h3>'+(others.length?others.map(m=>'<button type="button" class="wash-text-button" data-jump-question="'+m.number+'">Q'+m.number+' · '+esc(m.display.short)+' — '+esc(m.theme.title)+'</button>').join(''):empty('Nenhum resultado em outros temas.'))+'</div>';}
    $('wash-question-results').innerHTML=html;
    renderKpis();renderSelectedDetail();
  }
  // DETAIL — compact selected scope; complete bases and comparisons only on demand.
  function renderSelectedDetail() {
    const m=state.models.get(state.question);if(!m)return;
    $('wash-selected-detail').innerHTML='<div class="wash-section-head"><div class="wash-title-icon">'+icon('chart')+'<h2 id="wash-selected-title" tabindex="-1">Detalhe da questão</h2></div><span class="wash-question-number">Q'+m.number+'</span></div>'+
      '<div class="wash-detail-preview" data-detail-question="'+m.number+'"'+modelAttributes(m)+'><h3>'+esc(m.display.short)+'</h3><p class="wash-detail-summary">'+esc(m.question.question_text)+'</p>'+
      '<div class="wash-preview-analysis">'+(m.comparable?renderScopeSummary(m.series,{selected:m.scope,focusLabel:m.focus.label}):renderQuestionDistribution(m,false,'preview'))+'</div>'+
      '<button type="button" id="wash-open-detail-'+m.number+'" class="wash-button wash-button--detail" data-question="'+m.number+'" aria-haspopup="dialog">Ver mais detalhes <span aria-hidden="true">→</span></button></div>';
  }
  function selectQuestion(number, focusPanel=true) {
    if(!state.models.has(String(number)))return;
    const owner=themeFor(number);if(owner.id!==state.theme)selectTheme(owner.id,number);
    state.question=String(number);state.previewRequested=false;renderThemeResults();writeUrl();
    announce('Detalhe da Q'+number+' selecionado.');
    if(focusPanel){$('wash-selected-title').focus();$('wash-selected-detail').scrollIntoView({block:'nearest',behavior:'auto'});}
  }

  function toggleOptions(number) {
    if(!state.models.has(number))return;
    if(state.expandedOptions.has(number))state.expandedOptions.delete(number);else state.expandedOptions.add(number);
    renderThemeResults();$('wash-more-card-'+number)?.focus();
    announce('Opções da Q'+number+(state.expandedOptions.has(number)?' expandidas.':' recolhidas.'));
  }
  function scrollToQuestion(number) {
    const card=$('wash-card-'+number);if(!card)return;
    card.focus({preventScroll:true});card.scrollIntoView({block:'center',behavior:'auto'});
  }
  function renderQuestionDetail(model, area=state.detail?.area||state.area) {
    const reference=state.ibge?state.ufData:state.uf?state.national:null;
    const m=buildQuestionViewModel(model.question,model.data,reference,area);
    return '<div class="wash-detail-tabs" role="tablist" aria-label="Área da questão, sem alterar o filtro global">'+D.scopes.map(scope=>
      '<button type="button" role="tab" id="wash-detail-tab-'+scope+'" data-detail-scope="'+scope+'" aria-selected="'+(scope===area)+'" aria-controls="wash-detail-panel" tabindex="'+(scope===area?'0':'-1')+'">'+D.labels[scope]+'</button>').join('')+'</div>'+
      '<section id="wash-detail-panel" role="tabpanel" aria-labelledby="wash-detail-tab-'+area+'"><p class="wash-enunciado">'+esc(m.question.question_text)+'</p>'+
      '<p class="wash-muted">'+esc(m.theme.title)+' · '+D.labels[area]+' · n válido '+fmt(m.nValid)+'</p>'+
      '<div class="wash-detail-full-distribution">'+renderQuestionDistribution(m,true,'detail')+'</div>'+
      (m.multi?'<p class="wash-note">'+esc(D.multiNote)+'</p>':'')+
      '<details class="wash-reference-help"><summary>Comparar Geral, Urbana e Rural</summary>'+D.scopeTable(m)+'</details>'+
      '<details class="wash-reference-help"><summary>Bases e metodologia</summary>'+renderBase(m)+'<p class="wash-note">'+esc(interpretation(m))+'</p>'+
      (m.question.explanation?'<p>'+esc(m.question.explanation)+'</p>':'')+
      (m.comparable?'<p>Resposta em foco: '+esc(m.focus.label)+'</p><p class="wash-muted">'+esc(D.focusNote)+'</p>':'<p>Distribuição sem foco único.</p>')+
      '<p class="wash-muted">'+esc(D.smallNote)+'</p></details>'+
      (state.uf?'<details class="wash-reference-help"><summary>Comparação territorial · '+D.labels[area]+'</summary>'+renderTerritorialReference(m,false,area)+'</details>':'')+
      '<details class="wash-reference-help"><summary>Sobre a Referência Selo UNICEF</summary><p>'+esc(D.referenceNote)+'</p></details>'+
      '<div class="wash-detail-actions"><button type="button" class="wash-button" data-export="question">'+icon('download')+'Baixar questão — CSV ('+D.labels[state.area]+')</button><button type="button" class="wash-button" id="wash-copy">Copiar link da questão</button></div><div id="wash-copy-fallback"></div></section>';
  }

  function selectDetailScope(area,focus=true) {
    if(!state.detail||!D.scopes.includes(area))return;
    state.detail.area=area;const m=state.models.get(state.detail.number);
    $('wash-detail-content').innerHTML='<div class="wash-drawer-heading"><div><p class="wash-eyebrow">Q'+m.number+' · '+D.labels[area]+'</p><h2 id="wash-detail-title">'+esc(m.display.short)+'</h2></div><button type="button" class="wash-button" data-close-question autofocus>Fechar detalhes</button></div>'+renderQuestionDetail(m,area);
    if(focus)$('wash-detail-tab-'+area).focus();
  }
  function openQuestionDetail(number,triggerId) {
    const m=state.models.get(String(number));if(!m)return;
    state.question=String(number);state.previewRequested=true;
    state.detail={number:String(number),area:state.area,trigger:triggerId||document.activeElement?.id||'wash-open-detail-'+number};
    writeUrl();renderThemeResults();
    $('wash-detail-content').innerHTML='<div class="wash-drawer-heading"><div><p class="wash-eyebrow">Q'+m.number+' · '+D.labels[state.area]+'</p><h2 id="wash-detail-title">'+esc(m.display.short)+'</h2></div><button type="button" class="wash-button" data-close-question autofocus>Fechar detalhes</button></div>'+renderQuestionDetail(m);
    $('wash-detail-dialog').showModal();
  }
  function closeQuestionDetail(restore=true) {
    const detail=state.detail;if(!detail)return;
    state.detail=null;if($('wash-detail-dialog').open)$('wash-detail-dialog').close();$('wash-detail-content').innerHTML='';
    if(restore)($(detail.trigger)||$('wash-open-detail-'+detail.number)||$('wash-selected-title'))?.focus();
  }
  let schoolTrigger='';
  function openSchoolDetail() {}
  function closeSchoolDetail() {}
  // EXPORTS — unchanged aggregate CSV, same model, encoding and cell protection.

  function buildCsv(kind) {
    const numbers = kind === 'question' ? [state.question] : kind === 'all' ? state.catalog.map(q=>String(q.question_number)) : activeTheme().question_numbers.map(String);
    const rows = [['territory_type','territory_code','territory_name','question_number','theme','question','response_option','count','pct_valid','n_valid','missing','scope','scope_label','reference_type','reference_name','focus_response','focus_count','focus_pct','urban_pct','rural_pct','urban_rural_gap_pp']];
    state.territories.forEach(t => numbers.forEach(n => {
      const m=t.models.get(n); const territory=t.data?.territory;
      if (!m || !territory) return;
      m.options.forEach(o=>rows.push([territory.type,territory.code,t.label,m.number,m.theme.title,m.question.question_text,o.label,o.count,o.pct,m.nValid,m.missing,state.area,D.labels[state.area],t.key === 'current' ? 'SELECTED' : territory.type,t.key === 'current' ? '' : t.label,m.comparable ? m.focus.label : '',m.focus.count,m.focus.pct,m.comparable ? m.series[1].pct : '',m.comparable ? m.series[2].pct : '',m.gap]));
    }));
    return D.csv(rows);
  }
  function exportCurrentResults(kind) {
    if(state.loading||!state.current)return;
    D.download('diagnostico_wash_'+(state.ibge||state.uf||'selo_unicef')+'_'+state.area+'_'+(kind==='question'?'q'+state.question:kind==='theme'?state.theme:'todas_questoes')+'.csv',buildCsv(kind));
    $('wash-download').open=false;announce('CSV agregado gerado para '+D.labels[state.area]+'.');
  }
  async function copyLink() {
    writeUrl();try {await navigator.clipboard.writeText(window.location.href);announce('Link da questão copiado.');}
    catch {$('wash-copy-fallback').innerHTML='<label class="wash-field" for="wash-link">Copie o link<input id="wash-link" readonly value="'+esc(window.location.href)+'"></label>';$('wash-link').select();}
  }
  function selectTheme(id,number) {
    const theme=THEMES.find(t=>t.id===id);if(!theme)return;
    closeQuestionDetail(false);state.previewRequested=false;state.theme=id;state.question=theme.question_numbers.includes(Number(number))?String(number):String(theme.question_numbers[0]);state.search='';$('wash-search').value='';
    syncFilters();if(state.current)renderThemeResults();writeUrl();announce('Tema: '+theme.title+'.');
  }

  function syncAnswerOptionSelection() {}

  function renderSchoolAnswerContext() {}

  async function applySchoolAnswerFilter(number,label,options={}) {
    openQuestionDetail(number, options.triggerId);
  }

  function clearSchoolAnswerFilter() {}

  function renderMunicipalActions() {
    const box=$('wash-municipal-actions'); if(!box)return;
    box.hidden=!state.ibge;
    box.innerHTML=state.ibge?'<strong>Ações do município</strong><a class="wash-button" href="'+esc(reportLink())+'">Gerar resumo municipal agregado</a>':'';
  }

  function downloadMunicipalStatus() {}

  function wireEvents() {
    root.addEventListener('change',event=>{
      const {id,value}=event.target;
      if(id==='wash-theme')selectTheme(value);
      if(id==='wash-uf')void loadScope({uf:value,ibge:''});
      if(id==='wash-municipio')void loadScope({uf:state.uf,ibge:value});
      if(id==='wash-area'){closeQuestionDetail(false);closeSchoolDetail(false);state.area=D.scopes.includes(value)?value:'all';if(state.current){rebuildModels();renderResults();}void refreshSchoolScope();syncFilters();writeUrl();}
      if(id==='wash-view'){closeQuestionDetail(false);state.view=value==='count'?'count':'percent';if(state.current)renderThemeResults();writeUrl();}
      if(id==='wash-all-themes'){state.allThemes=event.target.checked;if(state.current)renderThemeResults();}
    });
    root.addEventListener('input',event=>{if(event.target.id==='wash-search'){state.search=event.target.value;if(state.current)renderThemeResults();}});
    document.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b||b.disabled)return;
      if(b.dataset.answerQuestion)void applySchoolAnswerFilter(b.dataset.answerQuestion,decodeURIComponent(b.dataset.answerValue),{triggerId:b.id,scope:b.dataset.answerScope});
      if(b.dataset.detailScope)selectDetailScope(b.dataset.detailScope);
      if(b.id==='wash-clear-answer')clearSchoolAnswerFilter();
      if(b.id==='wash-retry-answer'&&state.schoolAnswerFilter)void applySchoolAnswerFilter(state.schoolAnswerFilter.questionNumber,state.schoolAnswerFilter.optionLabel,{refresh:true,focus:false});
      if(b.dataset.expandOptions)toggleOptions(b.dataset.expandOptions);
      if(b.dataset.scrollQuestion)scrollToQuestion(b.dataset.scrollQuestion);
      if(b.dataset.question)openQuestionDetail(b.dataset.question,b.id);
      if(b.dataset.selectQuestion)selectQuestion(b.dataset.selectQuestion);
      if(b.dataset.jumpQuestion)selectQuestion(b.dataset.jumpQuestion);
      if(b.dataset.export)exportCurrentResults(b.dataset.export);
      if(b.hasAttribute('data-close-question'))closeQuestionDetail();
      if(b.hasAttribute('data-close-school'))closeSchoolDetail();
      if(b.id==='wash-copy')void copyLink();
      if(b.id==='wash-retry') {if(state.metadata)void loadScope({uf:state.uf,ibge:state.ibge});else void init();}
      if(b.id==='wash-index-retry')void loadMunicipalityIndex();
      if(b.id==='wash-clear'){clearSchoolAnswerFilter(false);closeQuestionDetail(false);state.area='all';state.view='percent';state.theme='gestao-riscos';state.question='115';state.previewRequested=false;state.search='';state.allThemes=false;$('wash-all-themes').checked=false;$('wash-search').value='';void loadScope({uf:'',ibge:''});}
    });
    $('wash-detail-content').addEventListener('keydown',event=>{
      const button=event.target.closest('button[data-detail-scope]');if(!button||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();let index=D.scopes.indexOf(button.dataset.detailScope);index=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;selectDetailScope(D.scopes[index]);
    });
    $('wash-detail-dialog').addEventListener('cancel',event=>{event.preventDefault();closeQuestionDetail();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){$('wash-download').open=false;}});
    window.addEventListener('popstate',()=>{const next=readUrl();state.search='';$('wash-search').value='';if(state.metadata)void loadScope(next);});
  }
  async function init() {
    syncFilters();
    $('wash-status').hidden=false;$('wash-status').textContent='Carregando Diagnóstico WASH…';$('wash-results').hidden=true;
    try {
      const [metadata,catalog,national]=await Promise.all([fetchJson(endpoint('metadata.json')),fetchJson(endpoint('diagnostico/questions.json')),fetchJson(endpoint('diagnostico/national.json'))]);
      const configured=THEMES.flatMap(t=>t.question_numbers.map(String));
      if(metadata.release_candidate_id!==CONFIG.releaseId||catalog.questions.length!==metadata.strategic_question_count||configured.length!==catalog.questions.length||new Set(configured).size!==configured.length||catalog.questions.some(q=>!configured.includes(String(q.question_number))))throw new Error('Catálogo incompatível.');
      state.metadata=metadata;state.catalog=catalog.questions;state.national=D.normalize(national);
      if(state.national.scope!=='NATIONAL')throw new Error('Referência incompatível.');
      $('wash-footer-meta').textContent='Fonte extraída em '+date(metadata.source_date)+' · Última resposta em '+date(metadata.data_reference_date)+' · VERSÃO DE TESTE';
      await loadScope(readUrl());
    } catch {state.metadata=null;$('wash-status').innerHTML='Não foi possível abrir o diagnóstico. <button type="button" id="wash-retry" class="wash-button">Tentar novamente</button>';}
  }
  // W10-UI bootstrap.
  renderShell();wireEvents();void init();
})();
