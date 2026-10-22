(() => {
  'use strict';
  const D = window.WASH_PREVIEW_DATA;
  const CONFIG = window.WASH_PREVIEW_CONFIG;
  const THEMES = window.WASH_PREVIEW_THEMES;
  const {esc, fmt, pct, pp, date} = D;
  const UF_PREFIX = {'11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO','21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA','31':'MG','51':'MT'};
  const root = document.getElementById('report-root');
  const state = {cache:new Map(), token:0, selectionToken:0, bundle:null};
  const endpoint = p => CONFIG.releaseBase + '/' + p;
  const schoolLocation = s => ({URBANA:'Urbana',RURAL:'Rural',NAO_CLASSIFICADA:'Não classificada'}[s.territorial_scope] || '—');
  const schoolStatus = s => s.response_status === 'COMPLETED' ? 'Finalizada' : 'Pendente';

  function parameters(search) {
    const p = new URLSearchParams(search);
    const uf = (p.get('uf') || '').toUpperCase(), ibge = p.get('ibge') || '';
    return {uf, ibge, valid: Object.values(UF_PREFIX).includes(uf) && /^\d{7}$/.test(ibge) && UF_PREFIX[ibge.slice(0,2)] === uf};
  }
  async function get(path) {
    const url=endpoint(path);
    if(!state.cache.has(url))state.cache.set(url,window.WASH_REVIEW_DATA.read(url).catch(e=>{state.cache.delete(url);throw e;}));
    return state.cache.get(url);
  }
  function selector(message = '') {
    root.innerHTML = '<section class="report-section"><h2>Selecione o município</h2>' + (message ? '<p role="alert">' + esc(message) + '</p>' : '') + '<p>O relatório reúne os resultados Geral, Urbana e Rural do município.</p><form id="report-selector"><label for="report-uf">UF<select id="report-uf" name="uf" required><option value="">Selecione</option>' + Object.values(UF_PREFIX).sort().map(uf=>'<option>' + uf + '</option>').join('') + '</select></label><label for="report-ibge">Município<select id="report-ibge" name="ibge" required disabled><option value="">Selecione uma UF</option></select></label><button type="submit" id="report-submit" disabled>Gerar relatório</button></form><p id="report-selector-status" role="status"></p><p><a href="diagnostico.html">Voltar ao Diagnóstico WASH</a></p></section>';
  }
  async function selectUf(uf) {
    const token = ++state.selectionToken;
    const select = document.getElementById('report-ibge'), submit = document.getElementById('report-submit'), status = document.getElementById('report-selector-status');
    select.disabled = true; submit.disabled = true;
    select.innerHTML = '<option value="">Selecione um município</option>';
    if (!Object.values(UF_PREFIX).includes(uf)) {status.textContent='Selecione uma UF.'; return;}
    status.textContent = 'Carregando municípios da UF…';
    try {
      const index = await get('monitoramento/resumo_municipal.json');
      if (token !== state.selectionToken) return;

      const municipalities = index.municipalities.filter(row=>row.territory.uf===uf).map(row=>({ibge:row.territory.ibge,name:row.territory.label})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
      select.innerHTML += municipalities.map(m=>'<option value="' + esc(m.ibge) + '">' + esc(m.name) + '</option>').join('');
      select.disabled = false; submit.disabled = false; status.textContent = 'Selecione o município para continuar.';
    } catch(e) {if(token===state.selectionToken) status.textContent=e.message + ' Selecione a UF novamente para tentar.';}
  }
  async function load(uf, ibge) {
    const token = ++state.token;
    state.bundle = null;
    document.body.classList.remove('report-with-schools');
    root.innerHTML = '<p role="status">Carregando os três recortes do município…</p>';
    try {
      // Six resources only. Municipality partitions outside this selection are never requested.
      const [metadata, catalog, municipality, region, national] = await Promise.all([
        get('metadata.json'), get('diagnostico/questions.json'), get('diagnostico/municipios/' + ibge + '.json'),
        get('diagnostico/uf/' + uf + '.json'), get('diagnostico/national.json')
      ]);
      if(token !== state.token) return;
      if(metadata.release_candidate_id !== CONFIG.releaseId || municipality.territory?.ibge !== ibge || municipality.territory?.uf !== uf || region.territory?.uf !== uf || catalog.questions.length !== 31) throw new Error('Município ou base incompatível com a seleção.');
      state.bundle = {metadata, questions:catalog.questions, municipality:D.normalize(municipality), region:D.normalize(region), national:D.normalize(national), uf, ibge};
      root.innerHTML = renderReport(state.bundle);
      document.title = 'Diagnóstico WASH · ' + municipality.territory.label + ' (' + uf + ')';
    } catch(e) {if(token===state.token) selector(e.message);}
  }
  function section(id, title, html, extra = '') {
    return '<section id="' + id + '" class="report-section ' + extra + '" aria-labelledby="' + id + '-title"><h2 id="' + id + '-title">' + esc(title) + '</h2>' + html + '</section>';
  }
  function badge(q) {
    return '<span class="report-badge report-badge--' + q.semantic_interpretation.toLowerCase() + '">' + esc(D.semantics[q.semantic_interpretation].label) + '</span>';
  }
  function coverageTable(b) {
    return '<div class="report-table-wrap"><table class="report-coverage"><caption>Cobertura por localização</caption><thead><tr><th scope="col">Área</th><th scope="col">Elegíveis</th><th scope="col">Finalizadas</th><th scope="col">Pendentes</th><th scope="col">Cobertura</th></tr></thead><tbody>' + D.scopes.map(scope=>{
      const c=b.municipality.scopes[scope].coverage;
      return '<tr><th scope="row">'+D.labels[scope]+'</th><td>'+fmt(c.eligible_schools)+'</td><td>'+fmt(c.completed_schools)+'</td><td>'+fmt(c.pending_schools)+'</td><td>'+(c.eligible_schools?pct(c.coverage_pct):'Sem elegíveis')+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  }
  function executiveMessages(b) {
    const models=b.questions.map(q=>D.model(q,b.municipality,'all')).filter(m=>m.comparable&&m.focus.pct!==null);
    const first=(direction)=>models.filter(m=>m.question.indicator_direction===direction).sort((a,b)=>b.focus.pct-a.focus.pct||Number(a.number)-Number(b.number))[0];
    const positive=first('HIGHER_IS_DESCRIPTIVELY_POSITIVE'),attention=first('HIGHER_REQUIRES_ATTENTION');
    const gap=models.filter(m=>m.gap!==null).sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap)||Number(a.number)-Number(b.number))[0];
    const finding=(m)=>'Q'+m.number+' — '+m.question.question_short_label+': resposta “'+m.focus.label+'”, '+pct(m.focus.pct)+' ('+fmt(m.focus.count)+'/'+fmt(m.nValid)+').';
    return [
      ['Destaque declarado',positive?(positive.focus.count>0?finding(positive):'A resposta destacada não foi relatada nas questões de condição positiva com base válida.'):'Sem base válida para destacar uma condição declarada.'],
      ['Ponto de atenção',attention?(attention.focus.count>0?finding(attention):'Nas questões de ocorrência com base válida, não houve relatos da resposta destacada.'):'Sem base válida para destacar uma ocorrência que pede atenção.'],
      ['Diferença Urbana–Rural',gap?(gap.gap===0?'Não houve diferença nos percentuais das respostas destacadas entre os recortes com base válida.':'Q'+gap.number+' — '+gap.question.question_short_label+': '+pp(gap.gap)+' na resposta “'+gap.focus.label+'”.'):'Sem base válida simultânea nos dois recortes.']
    ];
  }
  function executive(b) {
    const c=b.municipality.scopes,all=c.all.coverage,urban=c.urban.coverage,rural=c.rural.coverage;
    const gap=urban.coverage_pct!==null&&rural.coverage_pct!==null?urban.coverage_pct-rural.coverage_pct:null;
    const group=(name,items,cls)=>'<div class="report-metric-group"><h3>'+name+'</h3><dl class="report-totals '+cls+'">'+items.map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+value+'</dd></div>').join('')+'</dl></div>';
    const unknown=all.eligible_schools-urban.eligible_schools-rural.eligible_schools;
    return group('Participação',[
      ['Escolas elegíveis',fmt(all.eligible_schools)],['Autoavaliações finalizadas',fmt(all.completed_schools)],
      ['Pendentes',fmt(all.pending_schools)],['Cobertura geral',pct(all.coverage_pct)]
    ],'report-totals--general')+group('Localização das escolas',[
      ['Escolas urbanas',fmt(urban.eligible_schools)],['Escolas rurais',fmt(rural.eligible_schools)],
      ['Cobertura urbana',pct(urban.coverage_pct)],['Cobertura rural',pct(rural.coverage_pct)],
      ['Diferença Urbana–Rural',pp(gap)]
    ],'report-totals--location')+
    '<p class="report-small">Escolas urbanas e rurais: universo elegível. Cobertura: finalizadas ÷ elegíveis. Diferença: urbana menos rural, em pontos percentuais.'+
    (unknown>0?' Localização não classificada: '+fmt(unknown)+' escola(s), incluídas no Geral.':'')+'</p>';
  }
  function themeHighlights(b) {
    return '<div class="report-theme-highlights">'+THEMES.map(t=>{
      const questions=t.highlights.map(n=>b.questions.find(q=>String(q.question_number)===String(n))).filter(q=>q?.comparison_eligible).slice(0,2);
      return '<article><h3>'+esc(t.title)+'</h3><ul>'+questions.map(q=>{
        const m=D.model(q,b.municipality,'all');
        return '<li><strong>Q'+m.number+' — '+esc(q.question_short_label)+'</strong><span>'+esc(m.focus.label)+': '+(m.nValid?pct(m.focus.pct)+' <small>('+fmt(m.focus.count)+'/'+fmt(m.nValid)+')</small>':'Sem respostas válidas')+'</span></li>';
      }).join('')+'</ul></article>';
    }).join('')+'</div><p class="report-small">Indicadores do recorte Geral, escolhidos entre os destaques já definidos para cada tema. Os valores descrevem declarações das escolas; não certificam a qualidade do serviço.</p>';
  }
  function resultCell(q,b,scope,option=null) {
    const m=D.model(q,b.municipality,scope);
    const value=option===null?m.focus:m.options.find(o=>o.label===option);
    const count=value?.count??null,percentage=m.nValid>0?value?.pct??null:null;
    return '<td data-report-question="'+m.number+'" data-scope="'+scope+'"'+(option!==null?' data-option="'+esc(option)+'"':'')+' data-count="'+esc(count)+'" data-percentage="'+esc(percentage)+'" data-n-valid="'+esc(m.nValid)+'">'+
      (m.nEligible===0?'<span class="report-no-base">Sem elegíveis</span>':m.nValid===0?'<span class="report-no-base">Sem respostas válidas</span>':'<strong>'+pct(percentage)+'</strong><small>'+fmt(count)+' / '+fmt(m.nValid)+'</small>')+'</td>';
  }
  function resultTable(questions,b) {
    return '<div class="report-table-wrap"><table class="report-results"><colgroup><col class="report-col-label"><col span="3" class="report-col-value"></colgroup><thead><tr><th scope="col">Questão / resposta</th>'+D.scopes.map(s=>'<th scope="col">'+D.labels[s]+'</th>').join('')+'</tr></thead><tbody>'+
    questions.map(q=>{
      const m=D.model(q,b.municipality,'all');
      const heading='<strong>Q'+m.number+' — '+esc(q.question_short_label)+'</strong><span class="report-semantic">'+esc(D.semantics[m.semantic].label)+'</span>';
      if(m.comparable)return '<tr id="report-q'+m.number+'"><th scope="row">'+heading+'<small>Resposta: '+esc(m.focus.label)+'</small></th>'+D.scopes.map(s=>resultCell(q,b,s)).join('')+'</tr>';
      return '<tr class="report-category-title" id="report-q'+m.number+'"><th colspan="4" scope="rowgroup">'+heading+'<small>'+(m.multi?'Múltiplas respostas; a soma pode ultrapassar 100%.':'Todas as categorias; sem foco único de comparação.')+'</small></th></tr>'+
        q.observed_options.map(option=>'<tr><th scope="row" class="report-option">'+esc(option)+'</th>'+D.scopes.map(s=>resultCell(q,b,s,option)).join('')+'</tr>').join('');
    }).join('')+'</tbody></table></div>';
  }
  function questionGuide(b) {
    return '<details class="report-guide"><summary>Consultar enunciados, alternativas e bases das 31 questões</summary><p>Este detalhamento permanece disponível em tela. O PDF sintético apresenta a resposta destacada e as distribuições completas de Q28 e Q65.</p>'+THEMES.map(t=>
      '<section><h3>'+esc(t.title)+'</h3>'+t.question_numbers.map(n=>{
        const q=b.questions.find(q=>String(q.question_number)===String(n)),m=D.model(q,b.municipality,'all');
        return '<details id="report-guide-q'+m.number+'"><summary>Q'+m.number+' — '+esc(q.question_short_label)+'</summary><p>'+esc(q.question_text)+'</p>'+badge(q)+'<p>'+esc(D.semantics[m.semantic].caution)+'</p>'+D.scopeTable({...m,comparable:false})+
          '<p class="report-small">'+D.scopes.map(s=>{const a=D.aggregate(b.municipality,m.number,s);return D.labels[s]+': '+fmt(a.n_valid)+' válidas / '+fmt(a.n_completed)+' finalizadas; '+fmt(a.n_missing)+' sem resposta; '+fmt(a.n_not_applicable)+' Não se aplica; '+fmt(a.n_dont_know)+' Não sabe.';}).join(' ')+'</p></details>';
      }).join('')+'</section>').join('')+'</details>';
  }



  function renderReport(b) {
    const town=b.municipality.territory.label,back='diagnostico.html?uf='+b.uf+'&ibge='+b.ibge;
    const nav=[['resumo','Resumo'],['destaques','Grandes áreas'],['resultados','Resultados'],['metodologia','Metodologia']];
    return '<div class="report-identity"><p class="report-eyebrow">Síntese municipal · IBGE '+esc(b.ibge)+'</p><h2>'+esc(town)+' / '+b.uf+'</h2><p>Fonte: '+date(b.metadata.source_date)+' · Última resposta: '+date(b.metadata.data_reference_date)+' · Censo Escolar '+b.metadata.censo_reference_year+'</p></div>'+
      '<div class="report-actions"><button id="report-print" type="button">Imprimir ou salvar em PDF</button><a href="'+esc(back)+'">Voltar ao Diagnóstico</a><p>PDF de revisão com resultados agregados.</p></div>'+
      '<nav class="report-nav" aria-label="Seções do relatório">'+nav.map(([id,title])=>'<a href="#'+id+'">'+title+'</a>').join('')+'</nav>'+
      section('resumo','Resumo executivo',executive(b)+'<div class="report-findings"><h3>Principais achados</h3><ul>'+executiveMessages(b).map(([label,text])=>'<li><strong>'+label+':</strong> '+esc(text)+'</li>').join('')+'</ul></div>')+
      section('destaques','Destaques por grandes áreas',themeHighlights(b))+
      section('resultados','Resultados por tema','<p class="report-reading-key"><strong>Como ler:</strong> percentual da resposta destacada, seguido de quantidade / respostas válidas. Os três recortes usam suas próprias bases. Sem resposta não equivale a Não.</p>'+THEMES.map(t=>
        '<section class="report-theme" id="tema-'+t.id+'"><h3>'+esc(t.title)+'</h3>'+resultTable(t.question_numbers.map(n=>b.questions.find(q=>String(q.question_number)===String(n))),b)+'</section>').join('')+questionGuide(b))+
      section('metodologia','Metodologia e fonte',coverageTable(b)+'<div class="report-method"><p>Pesquisa 45 — Autoavaliação WASH. '+esc(D.focusNote)+' Os focos aguardam ratificação da equipe WASH. Não há score, classificação ou inferência causal.</p><p>Percentuais das questões: quantidade da alternativa ÷ respostas válidas na questão e no recorte. Ausências não são respostas Não; Não se aplica e Não sabe permanecem válidas. A fonte não distingue ausência por fluxo. Sem elegíveis ou sem respostas válidas, não se substitui ausência de base por 0%.</p><p>Q28 admite múltiplas fontes de água e soma acima de 100%; Q65 mantém todas as categorias. Q22 trata da distribuição interna de água encanada, sem necessariamente indicar ligação à rede pública. Percepções são declarações; Q115–Q117 descrevem exposição/contexto, sem medir desempenho.</p><p>Os achados destacam a maior proporção de condição positiva declarada, a maior ocorrência que pede atenção e a maior diferença absoluta Urbana–Rural, conforme o contrato; empates seguem o código da questão. Essa seleção não indica prioridade técnica, significância estatística ou comparação entre municípios.</p><p>Escolas urbanas/rurais seguem o Censo Escolar '+b.metadata.censo_reference_year+'. A comparação Urbano–Rural usa a mesma resposta e bases válidas próprias. Todas as questões deste relatório são agregadas. Não há identificação de escolas nesta versão de revisão.</p><p>'+esc(D.smallNote)+'</p><p>Extração: '+date(b.metadata.source_date)+' · Última resposta: '+date(b.metadata.data_reference_date)+' · Release do preview: <code>'+esc(CONFIG.releaseId)+'</code>. Versão de teste.</p></div>');
  }
  root.addEventListener('change',event=>{
    if(event.target.id==='report-uf') void selectUf(event.target.value);
    if(event.target.id==='report-print-schools') document.body.classList.toggle('report-with-schools',event.target.checked);
  });
  root.addEventListener('submit',event=>{
    if(event.target.id!=='report-selector') return;
    event.preventDefault();
    const uf=document.getElementById('report-uf').value, ibge=document.getElementById('report-ibge').value;
    if(!parameters('?uf=' + uf + '&ibge=' + ibge).valid) return;
    window.history.replaceState(null,'','relatorio-municipal.html?uf=' + uf + '&ibge=' + ibge);
    void load(uf,ibge);
  });
  root.addEventListener('click',event=>{
    if(!state.bundle) return;
    if(event.target.closest('#report-print')) window.print();
  });
  const p=parameters(window.location.search);
  if(p.valid) void load(p.uf,p.ibge); else selector();
})();
