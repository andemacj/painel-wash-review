/* Municipal school Excel: direct authorized matrix -> existing browser XLSX writer. Internal only. */
(() => {'use strict';
 const W=window.W15,M=window.W15SchoolMatrix,H=window.WashPresentation;
 const idColumns=[{label:'INEP',width:15},{label:'Nome',width:38},{label:'IBGE',width:14},{label:'Município',width:27},{label:'UF',width:8},{label:'Localização',width:17},{label:'Situação da autoavaliação',width:25}].map(c=>({...c,theme:'Identificação escolar'}));
 const areaNames={all:'geral',urban:'urbana',rural:'rural',not_classified:'nao_classificada'};
 const shortNames={'cadastro-contexto':'00_CADASTRO','contexto-apoio':'01_CONTEXTO','abastecimento-agua':'02_AGUA','residuos-solidos':'03_RESIDUOS','esgotamento-sanitario':'04_ESGOTAMENTO','higiene-dignidade-menstrual':'05_HIGIENE','drenagem-adaptacao':'06_DRENAGEM','gestao-manutencao':'07_MANUTENCAO','gestao-riscos':'08_RISCOS'};
 function theme(q){const t=W.themeFor(q);return t.id==='cadastro-contexto'?{...t,title:'Cadastro e contexto'}:t;}
 function groups(questions){const found=new Map();for(const q of questions){const t=theme(q);if(!found.has(t.id))found.set(t.id,{theme:t,questions:[]});found.get(t.id).questions.push(q)}return [...found.values()];}
 function identity(s,context){const town=W.rows.find(r=>r.ibge===s.ibge);return [String(s.inep),s.name,String(s.ibge),town?.name||s.ibge,s.uf,W.scopes[s.scope],s.status==='COMPLETED'?'Finalizada':'Pendente'];}
 function answer(s,q){
  if(!M.permitted(q))return 'Restrito — somente agregado';
  if(s.status!=='COMPLETED')return 'Sem autoavaliação finalizada';
  const value=s.answers[q.question_number];
  if(value==null)return 'Sem resposta — não exibida / não respondida não identificável';
  if(q.multi_response){const prefix='response_json_'+q.p45_field;return String(value).replace(new RegExp('^'+prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*\\|?\\s*'),'').split('|').map(v=>v.trim()).filter(Boolean).join(' | ');}
  if(q.unit_status==='VALIDATED'&&q.unit&&/^(numérica|numeric)$/.test(q.response_type)&&Number.isFinite(Number(value)))return Number(value);
  return String(value);
 }
 function dictionary(model){return model.questions.map(q=>[theme(q).title,'Q'+q.question_number,q.question_short_label,q.question_text,q.response_type,(q.official_options||q.observed_options||[]).join(' | '),q.unit|| (q.unit_status==='NOT_VALIDATED'?'Unidade não validada; valor original como texto':''),q.missing_rule||'Ausência não distingue item não exibido de não respondido.',M.permitted(q)?'Resposta permitida no acesso interno':'Restrito — somente agregado']);}
 function workbook(model){
  if(W.config.profile!=='internal'||model.config.releaseId!==W.config.releaseId)throw Error('O Excel requer a mesma versão e o acesso interno autorizado.');
  const c=M.context(model.context),town=W.rows.find(r=>r.ibge===c.ibge),qs=model.questions,grouped=groups(qs),permitted=qs.filter(M.permitted).length;
  if(new Set(model.schools.map(s=>s.inep)).size!==model.schools.length)throw Error('Há identificadores escolares duplicados; o arquivo não foi gerado.');
  const summary=W.summary(c);if(model.schools.length!==summary.eligible)throw Error('O conjunto escolar não corresponde às escolas elegíveis do município e da área.');
  const ids=model.schools.map(s=>identity(s,c));
  const setName=c.questionSet==='strategic31'?'31 questões estratégicas':'Questionário completo disponível';
  const readme=[['Uso','USO INTERNO — compartilhamento externo depende de autorização.'],['Município',town.name],['UF',town.uf],['IBGE',String(town.ibge)],['Território',W.territoryNames[c.territory]],['Área',W.scopes[c.scope]],['Fonte','Autoavaliação WASH nas escolas do Selo UNICEF'],['Referência das respostas',model.config.dataReferenceDate],['Atualização / coleta',model.config.collectionFinishedAt||model.config.snapshotDate],['Geração',model.generatedAt],['Conjunto',setName],['Perguntas catalogadas neste produto',qs.length],['Campos com respostas escolares permitidas',permitted],['Perguntas restritas',qs.length-permitted],['Escolas elegíveis',model.schools.length],['Finalizadas',summary.completed],['Pendentes',summary.pending],['Universo','Todas as escolas elegíveis do município e da área, inclusive pendentes. Busca, paginação e filtro temporário de resposta/situação não reduzem esta exportação.'],['Inclusão de respostas','O contrato traz respostas somente de autoavaliações finalizadas. Pendentes são identificadas, sem respostas fabricadas.'],['Organização','RESPOSTAS e abas por grande área são duas visualizações dos mesmos registros; não somar linhas entre abas. Identificadores não contam como perguntas.'],['Cadastro e contexto','O conjunto completo preserva os itens adicionais numerados do catálogo em 00_CADASTRO. Não são novos indicadores WASH.'],['Q28 e demais multirrespostas','Seleções reunidas com | em uma célula por escola. Removido apenas o prefixo técnico do campo; escolhas e significado preservados.'],['Ausências','Sem resposta não distingue pergunta não exibida de não respondida. Não se aplica e Não sabe conservam a resposta original. Sem branching inferido.'],['Numéricas','Valor numérico somente com tipo e unidade validados no catálogo; caso contrário, texto original, sem média ou unidade inventada.'],['Máscaras','Restrito é aplicado antes de ler a resposta e também nas pendentes. Sem contatos pessoais, respondentes ou textos livres não autorizados.'],['Limites','Política de pequenos números pendente. Não há nova supressão ou permissão de divulgação.'],['Release',model.config.releaseId],['SHA256 da fonte',model.config.wideSha256],['SHA256 do catálogo',model.config.catalogSha256],['Campos fora do catálogo disponível',model.catalogAudit.excluded.length+' campos excluídos; motivos na auditoria do catálogo, sem incorporar respostas desses campos.']];
  const cols=questions=>[...idColumns,...questions.map(q=>({label:'Q'+q.question_number+' · '+q.question_short_label,theme:theme(q).title,width:34}))];
  const rows=questions=>model.schools.map((s,i)=>[...ids[i],...questions.map(q=>answer(s,q))]);
  const matrixName=c.questionSet==='strategic31'?'RESPOSTAS_31':'RESPOSTAS_COMPLETAS';
  const sheets=[{name:'LEIA-ME',title:'Selo UNICEF · '+setName,columns:[{label:'Informação',width:35},{label:'Descrição',width:100}],rows:readme,idCount:0},
   {name:'ESCOLAS',title:town.name+'/'+town.uf+' · '+W.scopes[c.scope]+' · escolas elegíveis',columns:idColumns,rows:ids,idCount:idColumns.length,filter:true},
   {name:matrixName,title:setName+' · '+town.name+'/'+town.uf+' · '+W.scopes[c.scope],columns:cols(qs),rows:rows(qs),idCount:idColumns.length,groups:true,filter:true}];
  for(const group of grouped){const safe=shortNames[group.theme.id]||('AREA_'+(sheets.length-2)+'_'+W.norm(group.theme.title).replace(/[^a-z0-9]+/g,'_')).slice(0,31);sheets.push({name:safe,title:group.theme.title,columns:cols(group.questions),rows:rows(group.questions),idCount:idColumns.length,groups:true,filter:true});}
  sheets.push({name:'DICIONARIO',title:'Dicionário das perguntas · '+setName,columns:['Tema','Código','Título curto','Enunciado completo','Tipo','Alternativas','Unidade','Regra de ausência','Disponibilidade / restrição'].map((label,i)=>({label,width:[35,12,42,95,20,80,42,85,44][i]})),rows:dictionary(model),idCount:2,filter:true});
  return {sheets,questions:qs.length,permitted,restricted:qs.length-permitted,schools:model.schools.length,context:c,groups:grouped.map(g=>({id:g.theme.id,title:g.theme.title,numbers:g.questions.map(q=>q.question_number)}))};
 }
 function filename(context){const c=M.context(context);return 'WASH_'+c.uf+'_'+c.ibge+'_'+(c.questionSet==='strategic31'?'31_questoes':'questionario_completo')+'_'+areaNames[c.scope]+'_'+W.config.dataReferenceDate+'.xlsx';}
 async function generate(context){const frozen=M.context({...context}),model=await M.load(frozen),spec=workbook(model),bytes=window.WASH_MATRIX_XLSX.buildWorkbook(spec.sheets);if(bytes.length<4||bytes[0]!==80||bytes[1]!==75)throw Error('O arquivo Excel não foi produzido corretamente.');return {bytes,name:filename(frozen),model,spec};}
 window.W15SchoolWorkbook={generate,workbook,filename,answer,groups,identity};
})();
