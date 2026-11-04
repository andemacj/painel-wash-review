"""Private school sets; only aggregate return values may cross the local API."""
import collections,io,math,threading,typing
import pandas as pd
from common import *
from build_private import LABELS
SCOPES=['all','urban','rural','not_classified']
def pinned(path,expected):
 reader=ResidentReader(E,byte_budget=90000000);body=reader.read(path);assert digest(body)==expected,'W26 private input changed';return body
class Dataset:
 def __init__(self):
  self.manifest=read(E/'private/manifest.json');m=self.manifest;self.lock=threading.RLock();self.cache=collections.OrderedDict();self.schema=read(A/'characterization_contract.json');self.labels=LABELS;self.groups=set(LABELS)
  frame=pd.read_parquet(io.BytesIO(pinned('private/'+m['frame']['file'],m['frame']['sha256'])));assert len(frame)==frame.inep.nunique()==m['frame']['rows'];assert set(frame.status)=={'COMPLETED'}
  self.catalog=json.loads(pinned('private/catalog.json',m['catalogSHA256']));self.metadata=json.loads(pinned('private/equity_metadata.json',m['equityMetadataSHA256']));self.questions={q['question_number']:q for q in self.catalog['questions']};self.enabled=m['equityAllowed'];self.strategic=[self.questions[n]for n in m['questionColumns']]
  eq={'math':math,'collections':collections};code=pinned('tools/frozen_equity.py',m['frozenTools']['frozen_equity.py']).decode('utf-8-sig');tree=ast.parse(code);nodes=[n for n in tree.body if isinstance(n,(ast.ClassDef,ast.FunctionDef))or isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id in ['RACE','SEX','TERRITORIES']for t in n.targets)];exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pinned W23-R1 pure engine>','exec'),eq);self.eq=eq
  stats={'Any':typing.Any,'Counter':collections.Counter};code=pinned('tools/frozen_canonical_source.py',m['frozenTools']['frozen_canonical_source.py']).decode('utf-8-sig');functions(code,['normalize_text','normalize_for_match','pct','parse_multi_response','is_dont_know','is_not_applicable','QuestionStats'],stats);self.stats=stats
  import gzip
  wm=read(A/'distribution_manifest.json')
  self.monitor=json.loads(gzip.decompress(pinned('web/data/monitor.json.gz',wm['files']['data/monitor.json.gz']['sha256'])))['municipalities'];self.territories=json.loads(gzip.decompress(pinned('web/data/territories.json.gz',wm['files']['data/territories.json.gz']['sha256'])));self.records=frame.to_dict('records');self.rowsByGroup={g:[r for r in self.records if r['characteristic']==g]for g in self.groups};self.engines={}
  for g,rows in self.rowsByGroup.items():
   safe=[{k:v for k,v in r.items()if k not in ['q103','q104','q106']}for r in rows];prepared=eq['prepare_rows'](safe);assert all('q103'not in r and 'q104'not in r and 'q106'not in r for r in prepared);self.engines[g]=eq['Engine'](prepared,self.monitor,self.territories,self.catalog,self.metadata,stats['parse_multi_response'])
  self.prototype=next(iter(self.engines.values()));self.geo={r['territory']['ibge']:r for r in self.monitor};self._school_cache={}
 def context(self,source):
  allowed={'territory','uf','ibge','scope','status','schoolCharacteristic','classificationVersion','releaseId','questionSet','level'}
  if set(source)-allowed:raise ValueError('Parâmetro fora do contrato agregado')
  c={k:str(source.get(k,default))for k,default in [('territory','all'),('uf',''),('ibge',''),('scope','all'),('status','all'),('schoolCharacteristic','all')]}
  if c['schoolCharacteristic']not in self.groups:raise ValueError('Caracterização fora do contrato; Todas reutiliza os agregados W25')
  if source.get('releaseId','d261027_3455a1a9')!='d261027_3455a1a9':raise ValueError('Release divergente')
  if source.get('classificationVersion',self.manifest['classificationVersion'])!=self.manifest['classificationVersion']:raise ValueError('Versão da caracterização divergente')
  if c['uf']and c['uf']not in{r['territory']['uf']for r in self.monitor}:raise ValueError('UF fora do cadastro')
  if c['ibge']and(c['ibge']not in self.geo or c['uf']and self.geo[c['ibge']]['territory']['uf']!=c['uf']):raise ValueError('Município/UF inválido')
  self.prototype.municipalities(c);c.update({'releaseId':'d261027_3455a1a9','classificationVersion':self.manifest['classificationVersion'],'questionSet':'strategic31'});return c
 def selected(self,c,scope=None,all_groups=False):
  ids=self.prototype.municipalities(c);area=scope or c['scope'];source=self.records if all_groups else self.rowsByGroup[c['schoolCharacteristic']];return [r for r in source if r['ibge']in ids and(area=='all'or r['scope']==area)]
 def info(self,c,scope=None):
  allrows=self.selected(c,scope,True);rows=self.selected(c,scope);ids=self.prototype.municipalities(c);area=scope or c['scope'];engine=self.engines[c['schoolCharacteristic']];quality=engine.quality([r for r in engine.rows if r['ibge']in ids and(area=='all'or r['scope']==area)]);return {'observedEnrollments':quality['observedEnrollments'],'knownTotalSchools':quality['knownTotalSchools'],'missingTotalSchools':quality['missingTotalSchools'],'characteristic':c['schoolCharacteristic'],'label':self.labels[c['schoolCharacteristic']],'schoolCount':len(rows),'finalizedRespondents':len(allrows),'characterizationAvailable':sum(r['characteristic']in self.groups for r in allrows),'characterizationMissing':sum(r['characteristic']=='missing'for r in allrows),'characterizationInvalid':sum(r['characteristic']=='invalid_or_ambiguous'for r in allrows),'enrollmentYear':2025,'questionNumber':'16','sourceMeaning':'Escola inserida em comunidade tradicional, conforme declaração no formulário','overlapSchools':0,'multiResponse':False,'nominalAssociationAllowed':False,'policy':'LOCAL_INTERNAL_AGGREGATE_ONLY_EXTERNAL_REVIEW_PENDING'}
 def school_block(self,q,rows):
  stats=self.stats['QuestionStats'](q,None,len(rows));parse=self.stats['parse_multi_response'];normal=self.stats['normalize_text']
  for r in rows:
   value=r.get('q'+q['question_number']);value=None if value is None or isinstance(value,float)and math.isnan(value)else value
   if q['multi_response']and value:value=' | '.join(dict.fromkeys(parse(value,q['p45_field'])))
   stats.add_answer(value)
  result=stats.as_dict();result['n_eligible']=None;observed={v['label']:v for v in result['options']};labels=list(dict.fromkeys([v for v in q.get('official_options',[])if v in q.get('observed_options',[])]+q.get('observed_options',[])))
  result['options']=[observed.get(v,{'label':v,'count':0,'pct_valid':0 if result['n_valid']else None})for v in labels]+[v for k,v in observed.items()if k not in labels]
  if not result['n_valid']:
   for v in result['options']:v['pct_valid']=None
  if q.get('comparison_eligible')and q.get('focus_response_value')is not None:
   focus=next((v for v in result['options']if v['label']==q['focus_response_value']),None);result['focus_response_count']=focus['count']if focus else 0;result['focus_response_pct']=round(100*result['focus_response_count']/result['n_valid'],4)if result['n_valid']else None
  return result
 def aggregate(self,source):
  c=self.context(source);key=('aggregate',tuple(sorted(c.items())))
  with self.lock:
   if key in self.cache:return self.cache[key]
   blocks={}
   for scope in SCOPES:
    rows=self.selected(c,scope);blocks[scope]={'coverage':{'eligible_schools':None,'completed_schools':len(rows),'pending_schools':None,'coverage_pct':None},'questions':[self.school_block(q,rows)for q in self.strategic],'characterization':self.info(c,scope)}
   result={'schema':'wash.w26.diagnostic.v1','releaseVersion':VERSION,'classificationVersion':self.manifest['classificationVersion'],'context':c,'territory':{'type':'FILTERED','label':'Diagnóstico do grupo declarado'},'scopes':blocks,'characterization':self.info(c),'PUBLICATION_READY':False};self.remember(key,result);return result
 def remember(self,key,result):
  self.cache[key]=result
  if len(self.cache)>180:self.cache.popitem(last=False)
 def equity(self,source,question,option=None):
  c=self.context(source);q=str(question);engine=self.engines[c['schoolCharacteristic']];engine.require_allowed(q);spec=engine.questions[q];labels=list(dict.fromkeys([v for v in spec['official_options']if v in spec['observed_options']]+spec['observed_options']));option=option if option is not None else spec.get('focus_response_value')or labels[0];key=('equity',q,option,tuple(sorted(c.items())))
  with self.lock:
   if key in self.cache:return self.cache[key]
   result=engine.analyze(q,[option],c);result['eligibleSchools']=None;result['coveragePct']=None;result['groupRespondentSchools']=self.info(c)['schoolCount'];result['schoolCharacteristic']=c['schoolCharacteristic'];result['classificationVersion']=self.manifest['classificationVersion'];result['optionTotals']=[];cohort=engine.cohort(q,c)
   for label in labels:
    rows=cohort['byOption'][label];quality=engine.quality(rows);result['optionTotals'].append({'option':label,'schools':len(rows),'knownTotalSchools':quality['knownTotalSchools'],'linkedSchools':quality['linkedSchools'],'missingTotalSchools':quality['missingTotalSchools'],'observedEnrollments':quality['observedEnrollments']})
   result['references']=[]
   for t,label in self.eq['TERRITORIES'].items():
    reference=engine.analyze(q,[option],{**c,'territory':t,'uf':'','ibge':'','status':'all'});result['references'].append({'id':t,'label':label,'scope':c['scope'],'selectedSchools':reference['selectedSchools'],'validQuestionSchools':reference['validQuestionSchools'],'schoolPct':reference['schoolPct'],'schoolCharacteristic':c['schoolCharacteristic'],'contextPolicy':'Referência territorial consolidada; mesma caracterização, pergunta, alternativa, área e release; todas UFs/municípios'})
   result['characterization']=self.info(c);self.remember(key,result);return result
 def report(self,source):
  c=self.context({**source,'scope':'all','status':'all'});data=self.aggregate(c);rows=self.selected(c)
  if not rows:raise ValueError('Nenhuma escola com esta caracterização nas respostas disponíveis; relatório não gerado')
  if not any(q['n_valid']for q in data['scopes']['all']['questions']):raise ValueError('Não há base válida para gerar este relatório')
  engine=self.engines[c['schoolCharacteristic']];eq={q:self.equity(c,q)for q in self.enabled};ids=engine.municipalities(c);quality={scope:engine.quality([r for r in engine.rows if r['ibge']in ids and(scope=='all'or r['scope']==scope)])for scope in ['all','urban','rural']}
  return {'schema':'wash.w26.group-report.v1','releaseVersion':VERSION,'classificationVersion':self.manifest['classificationVersion'],'context':c,'data':data,'equity':eq,'groupQuality':quality,'characterization':self.info(c),'reportScope':'Geral; comparações Urbana/Rural no corpo','enrollmentYear':2025,'eligibleSchools':None,'pendingSchools':None,'publicationReady':False}
