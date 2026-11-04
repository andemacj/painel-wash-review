"""Only aggregate complementary readings. All guards precede cache and school query."""
import collections,csv,gzip,io,math,sqlite3,threading,time
from common import *
LOSS_LABELS={'pendente':'Autoavaliação pendente','resposta_ausente':'Resposta da pergunta ausente','nao_aplicavel':'Resposta não aplicável','resposta_desconhecida':'Resposta Não sei/desconhecida','resposta_codigo_invalido':'Categoria da resposta não documentada','sem_vinculo':'Sem vínculo no Censo 2025 adotado','inconsistencia_cadastro':'Inconsistência de chave/ano não resolvida','censo_desconhecido':'Campo Censo ausente ou código não documentado','inconsistencia_censo':'Condições contraditórias dentro do Censo, sem resolução'}
TITLES={'22':'Abastecimento por rede pública','28':'Fontes de abastecimento geral','58':'Declaração de que não há abastecimento de água','81':'Existência de banheiro','94':'Instalações de esgotamento sanitário','98':'Existência de banheiro ou vestiário com chuveiro'}
WATER={'IN_AGUA_REDE_PUBLICA':'Rede pública','IN_AGUA_POCO_ARTESIANO':'Poço artesiano','IN_AGUA_CACIMBA':'Cacimba/cisterna/poço','IN_AGUA_FONTE_RIO':'Fonte/rio/igarapé/riacho/córrego','IN_AGUA_CARRO_PIPA':'Carro-pipa','IN_AGUA_INEXISTENTE':'Não há abastecimento de água'}
SEWAGE={'IN_ESGOTO_REDE_PUBLICA':'Rede pública de esgoto','IN_ESGOTO_FOSSA_SEPTICA':'Fossa séptica','IN_ESGOTO_FOSSA_COMUM':'Fossa rudimentar/comum','IN_ESGOTO_INEXISTENTE':'Não há esgotamento sanitário'}
def pct(n,d):return round(100*n/d,4)if d else None
def wash_values(value,spec,parse,unknown,not_applicable):
 if value is None or not str(value).strip():return 'resposta_ausente',[]
 values=list(dict.fromkeys(parse(value,spec['p45_field'])))if spec['multi_response']else[str(value)]
 if not values:return 'resposta_ausente',[]
 if any(not_applicable(v)for v in values):return 'nao_aplicavel',values
 if any(unknown(v)for v in values):return 'resposta_desconhecida',values
 labels=set(spec['official_options'])|set(spec['observed_options'])
 if any(v not in labels for v in values):return 'resposta_codigo_invalido',values
 return None,values
def census_values(row,fields):
 if any(row[f]is None or row[f]not in(0,1)for f in fields):return 'censo_desconhecido'
 group=WATER if'IN_AGUA_INEXISTENTE'in fields and len(fields)>1 else SEWAGE if'IN_ESGOTO_INEXISTENTE'in fields else None
 absent='IN_AGUA_INEXISTENTE'if group is WATER else'IN_ESGOTO_INEXISTENTE'
 if group and row[absent]==1 and any(row[f]==1 for f in fields if f!=absent):return 'inconsistencia_censo'
 return None
class CensusComparison:
 def __init__(self,dataset,school_map):
  self.dataset=dataset;self.school_map=school_map;self.lock=threading.RLock();self.cache=collections.OrderedDict();self.query_count=0;self.rr=ResidentReader(E,byte_budget=12000000);self.delivery=read(A/'comparison_delivery.json');body=self.rr.read('contract/contrato_comparabilidade.json');assert digest(body)==self.delivery['contractSHA256'];self.contract=json.loads(body);body=self.rr.read('private/census_manifest.json');assert digest(body)==self.delivery['privateManifestSHA256'];self.census=json.loads(body);self.enabled={r['question']:r for r in self.contract['rows']if r['enabledInPilot']};self.db=E/'private/census_infrastructure.sqlite';body=self.rr.read(self.db);assert digest(body)==self.census['sha256'];st=self.db.stat();self.signature=(st.st_size,st.st_mtime_ns,st.st_ino);del body;self.parse=school_map.parse;self.unknown=dataset.stats['is_dont_know'];self.not_applicable=dataset.stats['is_not_applicable'];self.last_measurement=None
 def validate(self,source):
  allowed={'territory','uf','ibge','scope','status','schoolCharacteristic','releaseId','question','contractVersion','censusYear','questionSet','level','classificationVersion'}
  if set(source)-allowed:raise ValueError('Parâmetro fora do contrato comparativo agregado')
  if source.get('schoolCharacteristic')!='all':raise PermissionError('Leitura indisponível com Q16: combinação com infraestrutura do Censo ainda sem autorização específica documentada. O filtro foi preservado.')
  q=str(source.get('question',''))
  if q in self.contract['cohort']['restrictions']:raise PermissionError('Pergunta restrita: nenhuma comparação, residual ou resposta nominal nova é autorizada')
  if q not in self.enabled:raise ValueError('Questão sem leitura implementada e sustentada neste piloto')
  spec=self.school_map.questions[q]
  if not spec.get('aggregate_allowed')or spec.get('sensitive'):raise PermissionError('Agregado não autorizado para esta pergunta')
  if source.get('releaseId',self.contract['releaseId'])!=self.contract['releaseId']:raise ValueError('Release divergente')
  if str(source.get('censusYear',self.contract['censusYear']))!=str(self.contract['censusYear']):raise ValueError('Ano de infraestrutura divergente; nenhum preenchimento por outro ano')
  if source.get('contractVersion',self.contract['contractVersion'])!=self.contract['contractVersion']:raise ValueError('Versão do contrato divergente')
  if source.get('classificationVersion',self.dataset.manifest['classificationVersion'])!=self.dataset.manifest['classificationVersion']:raise ValueError('Versão de caracterização divergente')
  c={k:str(source.get(k,d))for k,d in [('territory','all'),('uf',''),('ibge',''),('scope','all'),('status','all')]}
  if c['uf']and c['uf']not in{r['territory']['uf']for r in self.dataset.monitor}:raise ValueError('UF fora do cadastro governado')
  if c['ibge']and(c['ibge']not in self.school_map.geo or c['uf']and self.school_map.geo[c['ibge']]['territory']['uf']!=c['uf']):raise ValueError('Município/UF incompatível com cadastro')
  ids=self.dataset.prototype.municipalities(c)
  if c['ibge']and c['ibge']not in ids:raise ValueError('Município fora do território/situação selecionado')
  c.update({'schoolCharacteristic':'all','releaseId':self.contract['releaseId'],'contractVersion':self.contract['contractVersion'],'censusYear':self.contract['censusYear']});return c,q,spec,ids
 def healthy(self):
  st=self.db.stat()
  if recall_flagged(self.db,st)or(st.st_size,st.st_mtime_ns,st.st_ino)!=self.signature:raise OSError('Partição Censo indisponível ou alterada; leitura conjunta não calculada')
  st=self.school_map.db_path.stat()
  if recall_flagged(self.school_map.db_path,st)or(st.st_size,st.st_mtime_ns,st.st_ino)!=self.school_map.db_signature:raise OSError('Partição canônica indisponível ou alterada; leitura conjunta não calculada')
 def payload(self,source):
  c,q,spec,ids=self.validate(source);key=(VERSION,c['censusYear'],c['contractVersion'],q,tuple(sorted(c.items())))
  with self.lock:
   self.healthy() # Integrity checked even for an already cached context.
   if key in self.cache:self.cache.move_to_end(key);return self.cache[key]
   started=time.perf_counter();self.query_count+=1;p=self.enabled[q];fields=[v['field']for v in p['censusItems']];conn=sqlite3.connect('file:'+self.school_map.db_path.as_posix()+'?mode=ro&immutable=1',uri=True);conn.row_factory=sqlite3.Row;conn.execute('ATTACH DATABASE ? AS infra',('file:'+self.db.as_posix()+'?mode=ro&immutable=1',));cols=','.join('c.'+f+' AS '+f for f in fields);sql='SELECT s.inep,s.ibge,s.uf,s.scope,s.status,s.coordinate_state,v.value AS response,c.inep AS census_key,c.census_year,c.ibge AS census_ibge,c.uf AS census_uf,c.network,c.functioning,c.c_scope,'+cols+' FROM schools s LEFT JOIN response_values v ON v.question=? AND v.value_id=s.q'+q+' LEFT JOIN infra.census c ON c.inep=s.inep';params=[q]
   if ids:sql+=' WHERE s.ibge IN('+','.join('?'for _ in ids)+')';params+=sorted(ids)
   else:sql+=' WHERE 0'
   if c['scope']!='all':sql+=' AND s.scope=?';params.append(c['scope'])
   rows=conn.execute(sql+' ORDER BY s.inep',params).fetchall();conn.close();assert len(rows)==len({r['inep']for r in rows});losses=collections.Counter({k:0 for k in LOSS_LABELS});flags=collections.Counter();paired=[];original_valid=0;finalized=0;found_finalized=0;known_finalized=0;original_counts=collections.Counter();census_known_valid=0;found_valid=0
   for r in rows:
    if r['status']!='COMPLETED':losses['pendente']+=1;continue
    finalized+=1;loss,values=wash_values(r['response'],spec,self.parse,self.unknown,self.not_applicable)
    if r['response']is not None and str(r['response']).strip():
     original_valid+=1;original_counts.update(set(self.parse(r['response'],spec['p45_field']))if spec['multi_response']else[r['response']])
    if r['census_key']is not None:
     found_finalized+=1
     if all(r[f]in(0,1)for f in fields):known_finalized+=1
    if loss:losses[loss]+=1;continue
    if r['census_key']is None:losses['sem_vinculo']+=1;continue
    found_valid+=1
    if r['census_year']!=c['censusYear']or r['census_key']!=r['inep']:losses['inconsistencia_cadastro']+=1;continue
    # Historical administrative differences are flagged, not relocated or discarded.
    if r['ibge']!=r['census_ibge']or r['uf']!=r['census_uf']:flags['municipality_or_uf_differs']+=1
    expected='urban'if r['c_scope']==1 else'rural'if r['c_scope']==2 else None
    if expected and expected!=r['scope']:flags['census_area_differs_current_area']+=1
    error=census_values(r,fields)
    if error:
     losses[error]+=1
     if error=='censo_desconhecido':
      if any(r[f]is None for f in fields):flags['missing_census_field']+=1
      if any(r[f]is not None and r[f]not in(0,1)for f in fields):flags['undocumented_census_code']+=1
     continue
    census_known_valid+=1
    if len(fields)>1 and not any(r[f]for f in fields):flags['all_census_source_fields_zero_retained']+=1
    paired.append((r,values))
   n=len(paired);assert n+sum(losses.values())==len(rows);ac=collections.Counter();cc=collections.Counter()
   for r,values in paired:
    ac.update(set(values))
    if len(fields)==1:cc.update(['Sim'if r[fields[0]]==1 else'Não'])
    else:cc.update([f for f in fields if r[f]==1])
   labels=list(dict.fromkeys(spec['official_options']+spec['observed_options']));wash=[{'label':label,'numerator':ac[label],'denominator':n,'percent':pct(ac[label],n)}for label in labels];census=[{'label':label,'numerator':cc[label],'denominator':n,'percent':pct(cc[label],n)}for label in ['Sim','Não']]if len(fields)==1 else[{'label':(WATER if q=='28'else SEWAGE)[f],'numerator':cc[f],'denominator':n,'percent':pct(cc[f],n)}for f in fields];flags['common_without_usable_coordinates']=sum(r['coordinate_state']!='usable'for r,_ in paired)
   if c['ibge']:place=self.school_map.geo[c['ibge']]['territory']['label']+'/'+self.school_map.geo[c['ibge']]['territory']['uf']
   elif c['uf']:place=c['uf']
   else:place={'all':'Universo Selo UNICEF','amazonia':'Amazônia Legal','semiarido':'Semiárido'}[c['territory']]
   result={'schema':'wash.w28.complementary.v1','pair':{'id':p['pairId'],'question':q,'questionText':p['questionText'],'semanticClassification':p['semanticClassification'],'reason':p['reason'],'commonEvent':None},'context':{**c,'territoryLabel':place},'sourceDates':{'censusYear':c['censusYear'],'autoResponses':'2026-10-26','autoCollection':'2026-10-27','releaseVersion':VERSION,'contractVersion':self.contract['contractVersion']},'base':{'eligible':len(rows),'finalized':finalized,'originalValidQuestion':original_valid,'foundCensusAmongFinalized':found_finalized,'knownCensusAmongFinalized':known_finalized,'foundCensusAmongValid':found_valid,'knownCensusAmongValid':census_known_valid,'common':n,'linkCoveragePercent':pct(found_finalized,finalized),'losses':[{'id':k,'label':v,'schools':losses[k]}for k,v in LOSS_LABELS.items()],'flags':dict(flags),'noCoordinatesRequired':True},'wash':{'title':p['questionText'],'source':'Autoavaliação WASH — respostas até 26/10/2026','multi':spec['multi_response'],'options':wash},'census':{'title':TITLES[q],'source':'Censo Escolar 2025 — infraestrutura','multi':len(fields)>1,'options':census},'readingNote':'Conceitos relacionados, não intercambiáveis. Não são calculadas diferença percentual nem concordância. Fontes e referências diferentes não comprovam erro, melhoria ou piora.','empty':n==0,'qualityStatus':'LOCAL_INTERNAL_COMPLEMENTARY_REVIEW_PENDING','disclosure':'INTERNAL_ONLY_EXTERNAL_REVIEW_PENDING','PUBLICATION_READY':False,'dictionary':{'washCardinality':p['washCardinality'],'censusCardinality':p['censusCardinality'],'washWindow':p['washWindow'],'washObject':p['washObject'],'washTransformation':p['washTransformation'],'censusTransformation':p['censusTransformation'],'censusItems':p['censusItems'],'washEvidence':p['washEvidence'],'censusEvidence':{'sheet':'Tabela_de_Escola','dictionarySHA256':self.contract['sourceContract']['dictionary']['sha256'],'sourceFactSHA256':self.census['sourceFactSHA256'],'chain':p['censusEvidence']['sourceChain']},'administrativeRule':'Mesmos INEPs, território/área atuais. Diferença administrativa histórica registrada, mantida na coorte. Rede/situação atuais não disponíveis para cotejo no snapshot; não confundir participação com funcionamento.','q16Rule':self.contract['cohort']['q16'],'coordinateRule':'Sem requisito de coordenada; 867 localizações W27 continuam em revisão, datum/EPSG não informado.'}}
   self.assert_aggregate(result);self.cache[key]=result
   if len(self.cache)>36:self.cache.popitem(last=False)
   self.last_measurement={'query':self.query_count,'seconds':time.perf_counter()-started,'uncompressedJSONBytes':len(raw(result)),'gzipJSONBytes':len(gzip.compress(raw(result),mtime=0)),'context':c,'question':q};return result
 @staticmethod
 def assert_aggregate(value):
  if isinstance(value,dict):
   assert not({'inep','name','school_name','nome_escola','latitude','longitude','lat','lon','answers','response','membership','characteristic','q16','rows'}&set(value)),'Identifiable or restricted data in comparison DTO'
   assert not({'differencePP','agreement','binaryCells','divergences'}&set(value)),'Metrics invalid for complementary concepts'
   for v in value.values():CensusComparison.assert_aggregate(v)
  elif isinstance(value,list):
   for v in value:CensusComparison.assert_aggregate(v)
 def csv(self,source):
  m=self.payload(source);b=m['base'];c=m['context'];s=m['sourceDates'];heads=['par_id','questao','conceito','classificacao_semantica','fonte_censo','ano_censo','respostas_autoavaliacao_ate','coleta_autoavaliacao','release','contrato','territorio','uf','municipio_ibge','area','caracterizacao','base_elegivel_original','finalizadas','respostas_validas_originais','vinculadas_entre_finalizadas','censo_conhecido_entre_finalizadas','base_comum']+['perda_'+k for k in LOSS_LABELS]+['fonte_resultado','categoria','numerador','denominador','percentual','status_medidas_diretas','sinalizacoes_agregadas','qualidade','divulgacao','PUBLICATION_READY'];buf=io.StringIO(newline='');w=csv.writer(buf,delimiter=';');w.writerow(heads);prefix=[m['pair']['id'],'Q'+m['pair']['question'],m['pair']['questionText'],m['pair']['semanticClassification'],'Censo Escolar/INEP — infraestrutura',s['censusYear'],s['autoResponses'],s['autoCollection'],s['releaseVersion'],s['contractVersion'],c['territoryLabel'],c['uf'],c['ibge'],c['scope'],c['schoolCharacteristic'],b['eligible'],b['finalized'],b['originalValidQuestion'],b['foundCensusAmongFinalized'],b['knownCensusAmongFinalized'],b['common']]+[r['schools']for r in b['losses']]
  for source_name in['wash','census']:
   for o in m[source_name]['options']:w.writerow(prefix+[m[source_name]['source'],o['label'],o['numerator'],o['denominator'],''if o['percent']is None else o['percent'],'NAO_APLICAVEL_CONCEITOS_COMPLEMENTARES',json.dumps(b['flags'],ensure_ascii=False,sort_keys=True),m['qualityStatus'],m['disclosure'],'false'])
  return ('\ufeff'+buf.getvalue()).encode('utf-8')
