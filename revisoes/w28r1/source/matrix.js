/* Existing municipal matrix model, now shared by its standalone view and school report modal. */

(() => {'use strict';

 const W=window.W15,$=id=>document.getElementById(id),E=W.esc,idColumns=['INEP','Escola','IBGE','Localização','Situação'];

 function permitted(q){return q.nominal_allowed!==false&&W.catalog.questions.find(c=>c.question_number===q.question_number)?.nominal_allowed!==false;}

 function answer(r,q){if(!permitted(q))return 'RESTRITO — somente agregado';if(r.status!=='COMPLETED')return 'NÃO FINALIZADA';const v=r.answers[q.question_number];return v==null?'AUSENTE — não exibida / não respondida não identificável':v;}

 function displayAnswer(r,q){let v=answer(r,q);if(!permitted(q)||r.status!=='COMPLETED'||!q.multi_response)return v;const prefix='response_json_'+q.p45_field;if(v.startsWith(prefix))v=v.slice(prefix.length).trim();return v.replace(/^\|\s*/,'').split('|').map(s=>s.trim()).filter(Boolean).join(' · ');}

 function columns(questions){return [...idColumns.map(label=>({label,theme:'Identificação escolar',width:label==='Escola'?35:17})),...questions.map(q=>({label:'Q'+q.question_number+' · '+q.question_short_label,theme:W.themeFor(q).title,width:32}))];}

 const values=(r,questions)=>[r.inep,r.name,r.ibge,W.scopes[r.scope],r.status==='COMPLETED'?'Finalizada':'Pendente',...questions.map(q=>answer(r,q))];

 function dictionary(questions){const rows=[['Tema','Código','Título','Enunciado','Tipo','Alternativas previstas','Ausências','Restrição nominal','Fonte / referência'],...questions.map(q=>[W.themeFor(q).title,'Q'+q.question_number,q.question_short_label,q.question_text,q.response_type,(q.official_options||q.observed_options||[]).join(' | '),q.missing_rule||'Ausência entre finalizadas. Não exibida e não respondida não identificáveis.',permitted(q)?'Incluída na entrega escolar solicitada':'Somente agregado; sem associação nominal',W.config.releaseId+' / '+W.config.dataReferenceDate])];if(questions.length>W.strategic.questions.length)for(const x of W.catalog.audit.excluded){const code=/^\s*(\d+)\s*[-–.]/.exec(x.question);rows.push(['Fora do conjunto disponível',code?'Q'+code[1]:'Sem código oficial',x.field,x.question,'Não incorporada','','Não confundir exclusão do campo com ausência de resposta escolar.',x.reasons.join(' · '),W.config.releaseId+' / '+W.config.dataReferenceDate]);}return rows;}



 function source(ctx,questions){return [['Campo','Valor'],['Uso','Consulta escolar — campos permitidos; respostas restritas mascaradas.'],['Release',W.config.releaseId],['Referência das respostas',W.config.dataReferenceDate],['Coleta',W.config.snapshotDate],['Geração',new Date().toISOString()],['Território',W.label(ctx)],['Localização',W.scopes[ctx.scope]],['Conjunto',ctx.questionSet],['Questões',questions.length],['Campos fora do conjunto disponível',W.catalog.audit.excluded.length+'; motivos no catálogo auditado. No conjunto completo, ver as linhas de exclusão no dicionário.'],['Fonte canônica SHA256',W.config.wideSha256],['Catálogo SHA256',W.config.catalogSha256],['Crosswalk SHA256',W.config.crosswalkSha256],['Semântica','Autodeclarações; sem score ou certificação técnica.'],['Ausências','Não exibida e não respondida não identificáveis; pendência é distinta.'],['Q28','Múltiplas escolhas separadas por |, uma escola por linha.'],['Campos sensíveis','Somente agregado; respostas não estão no banco nominal da candidata.'],['Privacidade','Política de pequenos n pendente de homologação; rótulos de governança da fonte preservados.']];}

 function context(base,questionSet=base.questionSet){if(window.W28R1_CONFIG?.mode!=='internal'||window.W26Data?.active||base.schoolCharacteristic&&base.schoolCharacteristic!=='all')throw Error('Excel escolar indisponível com caracterização ativa ou neste perfil.');if(base.scope!=='all')throw Error('Use o contexto Geral da central de relatórios.');if(W.config.profile!=='public_school')throw Error('Resultados por escola disponíveis somente no acesso interno autorizado.');const row=W.rows.find(r=>r.ibge===base.ibge);if(!row||!W.member(row,base))throw Error('Escolha um município do território selecionado.');if(!W.scopes[base.scope])throw Error('Área selecionada inválida.');return {level:'municipality',territory:base.territory,uf:row.uf,ibge:row.ibge,scope:base.scope,questionSet:questionSet==='complete_available'?'complete_available':'strategic31',releaseId:W.config.releaseId,status:'all',schoolCharacteristic:'all',workbookContractVersion:window.W28R1_CONFIG.workbookContractVersion};}

 async function load(base){const ctx=context(base),data=await W.read('internal/matrix?'+W.query(ctx));if(data.releaseId!==W.config.releaseId)throw Error('Os dados pertencem a outra versão; tente novamente.');if(data.rows.length!==data.total)throw Error('Não foi possível carregar todas as escolas do município. Tente novamente.');if(data.rows.some(s=>s.ibge!==ctx.ibge||(ctx.scope!=='all'&&s.scope!==ctx.scope)))throw Error('As escolas não correspondem ao município e à área selecionados.');const expected=W.questions(ctx),ids=expected.map(q=>String(q.question_number)),permittedIds=expected.filter(permitted).map(q=>String(q.question_number));if(data.schema!=='wash.w28r1.municipal-workbook.v1'||data.complete!==true||data.workbookContractVersion!==window.W28R1_CONFIG.workbookContractVersion||data.total!==W.summary(ctx).eligible||new Set(data.rows.map(s=>s.inep)).size!==data.total||JSON.stringify([...data.questionNumbers].sort())!==JSON.stringify([...ids].sort())||JSON.stringify([...data.allowedQuestionNumbers].sort())!==JSON.stringify([...permittedIds].sort())||data.rows.some(s=>!/^\d{8}$/.test(s.inep)||!/^\d{7}$/.test(s.ibge)||!s.name||!['COMPLETED','PENDING'].includes(s.status)||(s.status==='COMPLETED'?JSON.stringify(Object.keys(s.answers).sort())!==JSON.stringify([...permittedIds].sort()):Object.keys(s.answers).length>0)))throw Error('O índice escolar está incompleto ou fora do contrato; nenhum arquivo parcial foi produzido.');return {context:ctx,questions:W.questions(ctx),schools:data.rows,total:data.total,config:W.config,catalogAudit:W.catalog.audit,generatedAt:new Date().toISOString()};}

 function build(model){return window.WASH_MATRIX_XLSX.build({columns:columns(model.questions),rows:model.schools.map(r=>values(r,model.questions)),dictionary:dictionary(model.questions),source:source(model.context,model.questions),idCount:5});}

 function csv(model){return W.csv([[...idColumns,...model.questions.map(q=>W.themeFor(q).title+' | Q'+q.question_number+' | '+q.question_text)],...model.schools.map(r=>values(r,model.questions))]);}

 window.W15SchoolMatrix={answer,displayAnswer,permitted,columns,values,dictionary,source,context,load,build,csv};

 // Registration above has no request or initialization on the main dashboard.

 if(!$('matrixTable'))return;let model,search='',page=1;

 const selected=()=>model.schools.filter(r=>!search||W.norm(r.name+' '+r.inep).includes(W.norm(search)));

 function render(){model.questions=W.questions(model.context);const questions=model.questions,cols=columns(questions),groups=[];for(const c of cols){const last=groups.at(-1);if(last?.theme===c.theme)last.count++;else groups.push({theme:c.theme,count:1});}

  const rows=selected(),pages=Math.max(1,Math.ceil(rows.length/20));page=Math.min(page,pages);$('matrixTitle').textContent='Matriz escolar · '+W.label(model.context);$('matrixContext').textContent=questions.length+' questões · '+W.scopes[model.context.scope]+' · atualizado em '+W.config.snapshotDate.split('-').reverse().join('/')+' · uso interno';$('matrixSet').value=model.context.questionSet;$('matrixSet').options[1].textContent='Questionário completo — '+W.catalog.questions.length+' disponíveis';

  $('matrixTable').innerHTML='<thead><tr>'+groups.map(g=>`<th colspan="${g.count}" scope="colgroup">${E(g.theme)}</th>`).join('')+'</tr><tr>'+cols.map((c,i)=>`<th scope="col">${E(c.label)}${i>=5?`<details><summary>Enunciado e regras</summary><p>${E(questions[i-5].question_text)}</p><p>${E(questions[i-5].missing_rule||'Base: respostas válidas; ausência não distingue não exibida / não respondida.')}</p></details>`:''}</th>`).join('')+'</tr></thead><tbody>'+rows.slice((page-1)*20,page*20).map(r=>'<tr>'+values(r,questions).map(v=>'<td>'+E(v)+'</td>').join('')+'</tr>').join('')+'</tbody>';

  $('matrixCount').textContent=W.fmt(rows.length)+' escolas · '+questions.length+' questões; a exportação desta visualização alternativa respeita a busca e inclui todas as páginas.';$('matrixPage').textContent=page+' / '+pages;$('matrixPrev').disabled=page<=1;$('matrixNext').disabled=page>=pages;

  $('matrixDictionary').innerHTML=questions.map(q=>`<dt>${E(W.themeFor(q).title)} · Q${q.question_number} · ${E(q.question_short_label)}</dt><dd>${E(q.question_text)}<br>Tipo: ${E(q.response_type)}. ${E(q.missing_rule||'Ausência entre finalizadas; não exibida não identificável.')}</dd>`).join('');$('matrixSource').textContent='Autoavaliação WASH nas escolas do Selo UNICEF · referência '+W.config.dataReferenceDate+' · política de pequenos n pendente. Uso interno.';

  $('matrixBack').href='index.html?'+W.query(model.context)+'#relatorios';$('matrixReport').href=$('matrixBack').href;$('matrixReport').textContent='Voltar à central de relatórios';window.W15Matrix={ready:true,questions,schools:rows,columns:cols,rows:rows.map(r=>values(r,questions)),dictionary:dictionary(questions),source:source(model.context,questions),buildXlsx:()=>build({...model,schools:rows})};

 }

 $('matrixSet').onchange=e=>{model.context={...model.context,questionSet:e.target.value};page=1;render()};$('matrixSearch').oninput=e=>{search=e.target.value;page=1;render()};$('matrixPrev').onclick=()=>{page--;render()};$('matrixNext').onclick=()=>{page++;render()};

 $('matrixCsv').onclick=()=>W.download(W.filename(model.context,'matriz')+'.csv',csv({...model,schools:selected()}),'text/csv;charset=utf-8');$('dictionaryCsv').onclick=()=>W.download(W.filename(model.context,'dicionario')+'.csv',W.csv(dictionary(model.questions)),'text/csv;charset=utf-8');$('matrixXlsx').onclick=()=>window.WASH_MATRIX_XLSX.download(W.filename(model.context,'matriz')+'.xlsx',window.W15Matrix.buildXlsx());

 W.init().then(()=>load(W.context)).then(m=>{model=m;render()}).catch(e=>{$('matrixCount').textContent='Matriz indisponível: '+e.message;for(const id of ['matrixCsv','matrixXlsx','dictionaryCsv'])$(id).disabled=true;});

})();

