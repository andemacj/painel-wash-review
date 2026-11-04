/* W24: the sole decoder of frozen W23-R1 aggregate records, shared by UI/report/CSV.
 * No school records, inferred residuals, alternative denominators or joint sex/race.
 */
(()=>{'use strict';
 const W=window.W15,cache=new Map(),records=new Map();let shared=null;
 const version='d261027_3455a1a9_006f838c',dims=['race','sex'];
 const percent=(m,b)=>m!=null&&b!=null&&b>0?100*m/b:null;
 const aborted=s=>{if(s?.aborted)throw new DOMException('Contexto alterado','AbortError')};
 function resource(path){
  // Shared in-flight static fetches survive cancellation; each subscriber checks
  // its own signal before/after awaiting. A cancelled request never updates UI.
  if(!cache.has(path)){const pending=WashLoad.json(path);cache.set(path,pending);pending.catch(()=>cache.delete(path));if(cache.size>48)cache.delete(cache.keys().next().value)}
  return cache.get(path);
 }
 async function metadata(signal){aborted(signal);if(!shared)shared=resource('data/equity/metadata.json').then(m=>{if(m.schema!=='wash.w24.aggregate.metadata.v1'||m.releaseVersion!==version||m.enrollmentYear!==W23EquityConfig.enrollmentYear||m.releaseId!==W.config.releaseId||m.publicationReady!==false)throw Error('Contrato de equidade divergente');return m}).catch(e=>{shared=null;throw e});const m=await shared;aborted(signal);return m}
 function quality(values,m){let j=0;const q={};for(const key of m.qualityKeys)q[key]=values[j++];q.dimensions={};for(const dim of dims){q.dimensions[dim]={};for(const s of m.qualityStates)q.dimensions[dim][s]=values[j++]}for(const key of m.geoKeys)q[key]=values[j++];return q}
 function normalize(context){const c={territory:'all',uf:'',ibge:'',scope:'all',status:'all',...context};if(!['all','amazonia','semiarido'].includes(c.territory)||!['all','urban','rural'].includes(c.scope)||!['all','advanced','near','attention','critical','unknown'].includes(c.status))throw Error('Contexto fora do contrato');if(c.ibge){const town=W.rows.find(r=>r.ibge===c.ibge);if(!town||!W.member(town,c)||c.uf&&town.uf!==c.uf||c.status!=='all'&&W.classify(town.scopes[c.scope].eligible,town.scopes[c.scope].completed)!==c.status)throw Error('Município fora da seleção');c.uf=town.uf}return c}
 function decode(q,option,ctx,packed,m){
  const spec=m.questions[q],index=spec.options.indexOf(option);if(index<0)throw Error('Alternativa fora do contrato');
  const [eligible,completed,valid,qq,bases,options]=packed,[selected,sq,selectedDims]=options[index],qualitySelected=quality(sq,m),dimensions={};
  for(let i=0;i<dims.length;i++){
   const d=dims[i],[baseSchools,B,baseGroups]=bases[i],[state,selectedSchools,T,groupM]=selectedDims[i];
   const groups=m.groups[d].map((g,j)=>({id:g.id,label:g.label,selectedEnrollments:groupM[j],groupBaseEnrollments:baseGroups[j],compositionDenominator:T,compositionPct:percent(groupM[j],T),withinGroupPct:percent(groupM[j],baseGroups[j]),otherResponseEnrollments:baseGroups[j]==null?null:baseGroups[j]-(groupM[j]||0)}));
   dimensions[d]={state:m.dimensionStates[state],baseSchools,selectedSchools,otherResponseSchools:baseSchools-selectedSchools,baseEnrollments:B,selectedEnrollments:T,groups,declaredUnknownEnrollments:groups.find(g=>g.id==='nao_declarada')?.selectedEnrollments??null};
  }
  const meta=Object.fromEntries(Object.entries(m).filter(([k])=>!['schema','qualityKeys','qualityStates','geoKeys','dimensionStates','groups','questions','references'].includes(k)));
  const refs=['all','amazonia','semiarido'].map(id=>{const r=m.references[q][id][ctx.scope],n=r.options[option]??0;return {id,label:W.territoryNames[id],scope:ctx.scope,selectedSchools:n,validQuestionSchools:r.nValid,schoolPct:percent(n,r.nValid),contextPolicy:'Fixed territorial consolidated, all UFs/municipalities/statuses; same area/question/release'}});
  return {schema:'wash.equity.question.v1',contractVersion:m.contractVersion,publicationReady:false,question:q,questionLabel:spec.questionLabel,multiResponse:spec.multiResponse,hasSingleFocus:spec.hasSingleFocus,alternatives:[option],context:{...ctx},metadata:meta,eligibleSchools:eligible,completedSchools:completed,validQuestionSchools:valid,selectedSchools:selected,schoolPct:percent(selected,valid),questionQuality:quality(qq,m),selectedQuality:qualitySelected,schoolLinkagePct:percent(qualitySelected.linkedSchools,selected),observedTotalCoverageSchoolsPct:percent(qualitySelected.knownTotalSchools,selected),dimensions,references:refs,optionTotals:spec.options.map((label,j)=>{const opt=options[j],v=quality(opt[1],m);return {option:label,schools:opt[0],knownTotalSchools:v.knownTotalSchools,linkedSchools:v.linkedSchools,missingTotalSchools:v.missingTotalSchools,observedEnrollments:v.observedEnrollments}})};
 }
 async function question(number,context,signal){
  aborted(signal);const q=String(number);
  if(!W23EquityConfig.questions[q]?.enabled)throw Error('Associação demográfica não autorizada para esta questão');
  const m=await metadata(signal),ctx=normalize(context),file=ctx.uf?'uf-'+ctx.uf:'global';
  const pack=await resource('data/equity/q'+q+'/'+file+'.json');aborted(signal);
  if(pack.schema!=='wash.w24.aggregate.shard.v1'||pack.question!==q||pack.releaseVersion!==version)throw Error('Versão do agregado divergente');
  const key=[ctx.ibge?'all':ctx.territory,ctx.uf,ctx.ibge,ctx.scope,ctx.ibge?'all':ctx.status].join('|'),packed=pack.contexts[key];
  if(!packed)throw Error('Agregado indisponível para este contexto');
  return Object.fromEntries(m.questions[q].options.map(option=>[option,decode(q,option,ctx,packed,m)]));
 }
 async function result(number,option,context,signal){
  if(context.schoolCharacteristic&&context.schoolCharacteristic!=="all")return window.W26Data.equity(number,option,context,signal);
  const key=JSON.stringify([version,W23EquityConfig.enrollmentYear,String(number),context,option]);aborted(signal);
  if(records.has(key))return records.get(key);
  const data=await question(number,context,signal),record=data[option];if(!record)throw Error('Alternativa indisponível');aborted(signal);
  records.set(key,record);if(records.size>100)records.delete(records.keys().next().value);return record;
 }
 window.W24EquityModel=Object.freeze({result,question,metadata,version,publicationReady:false});
})();
