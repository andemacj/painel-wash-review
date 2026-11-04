"""Approved municipal workbook matrix: exact frozen source, allowed fields only, internal server only."""
import collections,gzip,sqlite3,threading
from common import *
class MunicipalWorkbooks:
 def __init__(self,dataset):
  self.dataset=dataset;self.lock=threading.RLock();self.cache=collections.OrderedDict();self.query_count=0;self.policy=read(E/'policy/workbooks.json');rr=ResidentReader(R,byte_budget=180000000);source=self.policy['source'];body=rr.read(source['path']);assert digest(body)==source['sha256'];del body;self.db=Path(source['path']);s=self.db.stat();self.signature=(s.st_size,s.st_mtime_ns,s.st_ino);self.catalog=read(E/'private/catalog.json');self.questions={q['question_number']:q for q in self.catalog['questions']};self.allowed={q for q,spec in self.questions.items()if spec.get('nominal_allowed')is True};self.blocked=set(self.questions)-self.allowed;self.strategic=self.policy['strategicQuestions'];assert self.allowed==set(self.policy['allowedQuestionNumbers'])and self.blocked==set(self.policy['maskedQuestionNumbers']);assert self.policy['censusFieldsAdded']is False;put(A/'workbook_source_read_receipts.json',rr.receipts)
 def validate(self,source):
  keys={'territory','uf','ibge','scope','status','questionSet','releaseId','level','schoolCharacteristic','classificationVersion','workbookContractVersion'}
  if set(source)-keys:raise ValueError('Parâmetro fora do contrato municipal escolar')
  if source.get('schoolCharacteristic')!='all':raise PermissionError('Excel escolar indisponível com Q16 ativa; retire o filtro explicitamente para exportar o município completo')
  if source.get('releaseId')!=self.policy['releaseId']:raise ValueError('Release divergente')
  if source.get('workbookContractVersion',self.policy['version'])!=self.policy['version']:raise ValueError('Contrato de exportação divergente')
  if source.get('scope')!='all'or source.get('status','all')!='all':raise ValueError('Excel municipal usa Geral e todas as situações, sem alterar a exploração global')
  if source.get('classificationVersion',self.dataset.manifest['classificationVersion'])!=self.dataset.manifest['classificationVersion']:raise ValueError('Versão de caracterização divergente')
  c={k:str(source.get(k,d))for k,d in [('territory','all'),('uf',''),('ibge',''),('scope','all'),('status','all'),('questionSet','strategic31')]};town=self.dataset.geo.get(c['ibge'])
  if not town or not c['uf']or town['territory']['uf']!=c['uf']:raise ValueError('Selecione município participante e UF correspondentes')
  if c['questionSet']not in['strategic31','complete_available']:raise ValueError('Conjunto de questões não autorizado')
  if c['ibge']not in self.dataset.prototype.municipalities(c):raise ValueError('Município fora do território selecionado')
  c.update({'schoolCharacteristic':'all','releaseId':self.policy['releaseId'],'workbookContractVersion':self.policy['version']});return c
 def healthy(self):
  st=self.db.stat()
  if recall_flagged(self.db,st)or(st.st_size,st.st_mtime_ns,st.st_ino)!=self.signature:raise OSError('Índice canônico indisponível ou alterado; nenhum Excel parcial será entregue')
 def payload(self,source):
  c=self.validate(source);selected=self.strategic if c['questionSet']=='strategic31'else list(self.questions);allowed=[q for q in selected if q in self.allowed];assert all(q.isdecimal()for q in allowed);key=tuple(sorted(c.items()))
  with self.lock:
   self.healthy()
   if key in self.cache:return self.cache[key]
   self.query_count+=1;con=sqlite3.connect('file:'+self.db.as_posix()+'?mode=ro&immutable=1',uri=True);con.row_factory=sqlite3.Row
   # Restricted questions are absent from the SQL projection, not merely hidden in the workbook.
   projection=','.join('CASE WHEN status=\'COMPLETED\' THEN json_extract(answers,\'$."'+q+'"\') ELSE NULL END AS q'+q for q in allowed);sql='SELECT inep,name,ibge,uf,scope,status,'+projection+' FROM schools WHERE ibge=? ORDER BY name,inep';rawrows=con.execute(sql,[c['ibge']]).fetchall();con.close();rows=[]
   for rawrow in rawrows:
    r=dict(rawrow);answers={q:r.pop('q'+q)for q in allowed};r['answers']=answers if r['status']=='COMPLETED'else{};assert set(r['answers'])<=self.allowed;rows.append(r)
   expected=self.dataset.geo[c['ibge']]['scopes']['all'];assert len(rows)==expected['eligible_schools'];assert sum(r['status']=='COMPLETED'for r in rows)==expected['completed_schools'];assert len({r['inep']for r in rows})==len(rows);assert all(len(r['inep'])==8 and len(r['ibge'])==7 for r in rows)
   result={'schema':'wash.w28r1.municipal-workbook.v1','complete':True,'releaseId':self.policy['releaseId'],'releaseVersion':VERSION,'sourceReference':self.policy['responseDate'],'collectionDate':self.policy['collectionDate'],'workbookContractVersion':self.policy['version'],'context':c,'total':len(rows),'rows':rows,'questionNumbers':selected,'allowedQuestionNumbers':allowed,'maskedQuestionNumbers':[q for q in selected if q in self.blocked],'schoolCharacteristic':'all','PUBLICATION_READY':False};self.cache[key]=result
   if len(self.cache)>4:self.cache.popitem(last=False)
   return result
