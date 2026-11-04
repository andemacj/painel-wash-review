"""School-set based enrollment/equity engine, never a long-response join."""
import math,collections
from common import *
RACE=[('brancas','Brancas','matriculas_brancas'),('negras','Negras — pretas e pardas','matriculas_negras'),('indigenas','Indígenas','matriculas_indigenas'),('amarelas','Amarelas','matriculas_amarelas'),('nao_declarada','Raça/cor não declarada','matriculas_raca_nao_declarada')]
SEX=[('feminino','Feminino','matriculas_femininas'),('masculino','Masculino','matriculas_masculinas')]
TERRITORIES={'all':'Universo Selo UNICEF','amazonia':'Amazônia Legal','semiarido':'Semiárido'}
def integer(value):
 if value is None:return None
 try:
  x=float(value)
  return int(x)if math.isfinite(x)and x>=0 and x.is_integer()else None
 except (ValueError,TypeError):return None
def pct(n,d):return 100*n/d if n is not None and d is not None and d>0 else None
def invalid_count(value):
 if value is None:return False
 try:
  x=float(value)
  if math.isnan(x):return False
  return not math.isfinite(x)or x<0 or not x.is_integer()
 except (ValueError,TypeError):return True
def vector_state(total,values):
 if total is None:return 'total_missing'
 if any(v is None for v in values):return 'incomplete'
 s=sum(values)
 return 'valid'if s==total else'inconsistent'
def classification(e,c):return 'unknown'if not e else'advanced'if c*100>=e*90 else'near'if c*100>=e*80 else'attention'if c*100>=e*50 else'critical'
def prepare_rows(records):
 result=[]
 for row in records:
  r={k:row[k]for k in ['inep','ibge','uf','scope','status']};r.update({k:v for k,v in row.items()if k.startswith('q')and k[1:].isdigit()});r['linked']=row['_merge']=='both';r['total']=integer(row['matriculas_educacao_basica']);r['totalState']='known'if r['total']is not None else'missing'
  if invalid_count(row['matriculas_educacao_basica']):r['totalState']='inconsistent'
  for dimension,fields in [('race',RACE),('sex',SEX)]:
   values={key:integer(row[field])for key,_,field in fields};r[dimension]=values;r[dimension+'State']=vector_state(r['total'],list(values.values()))
   if any(invalid_count(row[field])for _,_,field in fields)or r['totalState']=='inconsistent':r[dimension+'State']='inconsistent'
   if dimension=='race'and r[dimension+'State']=='valid':
    black,brown=integer(row['matriculas_pretas']),integer(row['matriculas_pardas'])
    if black is None or brown is None or black+brown!=values['negras']:r[dimension+'State']='inconsistent'
  # Canonical WASH geography is retained; differences are quality flags only.
  raw_scope=str(row.get('localizacao',''));mapped={'1':'urban','2':'rural','Urbana':'urban','Rural':'rural','1.0':'urban','2.0':'rural'}.get(raw_scope)
  raw_mun=str(row.get('codigo_municipio',''));r['municipalityMismatch']=r['linked']and raw_mun not in [r['ibge'],r['ibge']+'.0'];r['scopeMismatch']=r['linked']and mapped is not None and mapped!=r['scope'];r['originScopeUnmapped']=r['linked']and mapped is None
  result.append(r)
 assert len({r['inep']for r in result})==len(result),'Duplicate INEP before analytical join'
 return result
def option_members(value,spec,parse_multi):
 if value is None:return set()
 if spec.get('multi_response'):return set(parse_multi(value,spec['p45_field']))
 return {value}
class Engine:
 def __init__(self,rows,monitor,territories,catalog,metadata,parse_multi):
  assert len(rows)==len({r['inep']for r in rows}),'Duplicate school grain would multiply enrollments'
  self.rows=rows;self.monitor={r['territory']['ibge']:r for r in monitor};self.members={r['ibge']:r for r in territories['municipalities']};self.questions={q['question_number']:q for q in catalog['questions']};self.metadata=metadata;self.parse_multi=parse_multi;self._cohorts=collections.OrderedDict()
 def allowed(self,question):
  q=str(question);spec=self.questions.get(q)
  if not spec or not spec.get('nominal_allowed',True)or spec.get('special_sensitive_review_required',False):return False
  return q in self.metadata.get('enabledQuestions',['58','28'])
 def require_allowed(self,question):
  if not self.allowed(question):raise PermissionError('Associação demográfica não autorizada ou ainda indisponível para esta questão')
 def municipalities(self,ctx):
  t=ctx.get('territory','all');scope=ctx.get('scope','all');status=ctx.get('status','all')
  if t not in TERRITORIES or scope not in ['all','urban','rural']or status not in ['all','critical','attention','near','advanced','unknown']:raise ValueError('Contexto fora do contrato')
  return {id for id,r in self.monitor.items()if(t=='all'or self.members[id]['amazon'if t=='amazonia'else'semiarid'])and(not ctx.get('uf')or r['territory']['uf']==ctx['uf'])and(not ctx.get('ibge')or id==ctx['ibge'])and(status=='all'or classification(r['scopes'][scope]['eligible_schools'],r['scopes'][scope]['completed_schools'])==status)}
 def selected(self,question,options,ctx):
  q=str(question);self.require_allowed(q);spec=self.questions[q];ids=self.municipalities(ctx);area=ctx.get('scope','all');allrows=[r for r in self.rows if r['ibge']in ids and(area=='all'or r['scope']==area)];choices=set(options);valid_options=set(spec['observed_options']);s=[];a=[]
  for r in allrows:
   if r['status']!='COMPLETED':continue
   selected=option_members(r.get('q'+q),spec,self.parse_multi)
   if not selected.intersection(valid_options):continue
   s.append(r)
   if selected.intersection(choices):a.append(r)
  return allrows,s,a
 def cohort(self,q,ctx):
  self.require_allowed(q);key=(q,tuple((k,ctx.get(k,'all'if k in ['territory','scope','status']else''))for k in ['territory','uf','ibge','scope','status']))
  if key in self._cohorts:self._cohorts.move_to_end(key);return self._cohorts[key]
  spec=self.questions[q];ids=self.municipalities(ctx);area=ctx.get('scope','all');eligible=[r for r in self.rows if r['ibge']in ids and(area=='all'or r['scope']==area)];valid=set(spec['observed_options']);s=[];by_option={o:[]for o in valid}
  for r in eligible:
   if r['status']!='COMPLETED':continue
   members=option_members(r.get('q'+q),spec,self.parse_multi)&valid
   if not members:continue
   s.append(r)
   for option in members:by_option[option].append(r)
  dimensions={}
  for dimension,fields in [('race',RACE),('sex',SEX)]:
   d=[r for r in s if r['linked']and r[dimension+'State']=='valid'];dimensions[dimension]={'rows':d,'baseTotal':sum(r['total']for r in d)if d else None,'groups':{g:sum(r[dimension][g]for r in d)if d else None for g,_,_ in fields}}
  result={'eligible':eligible,'s':s,'byOption':by_option,'quality':self.quality(s),'dimensions':dimensions};self._cohorts[key]=result
  if len(self._cohorts)>16:self._cohorts.popitem(last=False)
  return result
 @staticmethod
 def quality(rows):
  known=[r for r in rows if r['total']is not None];states={d:{state:sum(r[d+'State']==state for r in rows)for state in ['valid','incomplete','inconsistent','total_missing']}for d in ['race','sex']}
  return {'schools':len(rows),'linkedSchools':sum(r['linked']for r in rows),'unlinkedSchools':sum(not r['linked']for r in rows),'knownTotalSchools':len(known),'missingTotalSchools':sum(r['totalState']=='missing'for r in rows),'inconsistentTotalSchools':sum(r['totalState']=='inconsistent'for r in rows),'legitimateZeroTotalSchools':sum(r['total']==0 for r in known),'observedEnrollments':sum(r['total']for r in known)if known or not rows else None,'dimensions':states,'municipalityMismatchSchools':sum(r['municipalityMismatch']for r in rows),'scopeMismatchSchools':sum(r['scopeMismatch']for r in rows),'originScopeUnmappedSchools':sum(r['originScopeUnmapped']for r in rows)}
 def analyze(self,question,options,ctx):
  q=str(question);self.require_allowed(q);spec=self.questions[q]
  if not set(options)<=set(spec['observed_options']):raise ValueError('Alternativa não consta da fonte')
  cohort=self.cohort(q,ctx);eligible,s=cohort['eligible'],cohort['s'];a=list({r['inep']:r for option in options for r in cohort['byOption'][option]}.values());dimensions={}
  for dimension,fields in [('race',RACE),('sex',SEX)]:
   base=cohort['dimensions'][dimension];d=base['rows'];ad=[r for r in a if r['linked']and r[dimension+'State']=='valid'];selected_observed=bool(ad)or not a;t=sum(r['total']for r in ad)if selected_observed else None;base_total=base['baseTotal'];groups=[]
   for key,label,_ in fields:
    n=sum(r[dimension][key]for r in ad)if selected_observed else None;b=base['groups'][key];comparator=b-(n or 0)if b is not None else None
    if n is not None and b is not None:assert n+comparator==b
    groups.append({'id':key,'label':label,'selectedEnrollments':n,'groupBaseEnrollments':b,'compositionDenominator':t,'compositionPct':pct(n,t),'withinGroupPct':pct(n,b),'otherResponseEnrollments':comparator})
   if t is not None:assert sum(g['selectedEnrollments']for g in groups)==t
   if base_total is not None:assert sum(g['groupBaseEnrollments']for g in groups)==base_total
   dimensions[dimension]={'state':'no_usable_base'if not d else'no_usable_selected_base'if a and not ad else'available','baseSchools':len(d),'selectedSchools':len(ad),'otherResponseSchools':len(d)-len(ad),'baseEnrollments':base_total,'selectedEnrollments':t,'groups':groups,'declaredUnknownEnrollments':next((g['selectedEnrollments']for g in groups if g['id']=='nao_declarada'),None)}
  metadata={k:v for k,v in self.metadata.items()if k not in ['questionReferences','territorialSchoolReferences','questionAvailability','question']}
  return {'schema':'wash.equity.question.v1','contractVersion':self.metadata.get('contractVersion','W23.1'),'publicationReady':False,'question':q,'questionLabel':spec.get('question_short_label','Q'+q),'multiResponse':bool(spec.get('multi_response')),'hasSingleFocus':bool(spec.get('focus_response_value')),'alternatives':list(options),'context':dict(ctx),'metadata':metadata,'eligibleSchools':len(eligible),'completedSchools':sum(r['status']=='COMPLETED'for r in eligible),'validQuestionSchools':len(s),'selectedSchools':len(a),'schoolPct':pct(len(a),len(s)),'questionQuality':cohort['quality'],'selectedQuality':self.quality(a),'schoolLinkagePct':pct(sum(r['linked']for r in a),len(a)),'observedTotalCoverageSchoolsPct':pct(sum(r['total']is not None for r in a),len(a)),'dimensions':dimensions}
 def result(self,option,ctx,question='58'):
  q=str(question);self.require_allowed(q);spec=self.questions[q];labels=list(dict.fromkeys([o for o in spec['official_options']if o in spec['observed_options']]+spec['observed_options']))
  option=option if option is not None else spec.get('focus_response_value')or labels[0]
  result=self.analyze(q,[option],ctx);result['optionTotals']=[]
  for label in labels:
   a=self.analyze(q,[label],ctx);result['optionTotals'].append({'option':label,'schools':a['selectedSchools'],'knownTotalSchools':a['selectedQuality']['knownTotalSchools'],'linkedSchools':a['selectedQuality']['linkedSchools'],'missingTotalSchools':a['selectedQuality']['missingTotalSchools'],'observedEnrollments':a['selectedQuality']['observedEnrollments']})
  result['references']=[]
  for t,label in TERRITORIES.items():
   refs=self.metadata.get('questionReferences',{}).get(q,self.metadata.get('territorialSchoolReferences',{}));legacy=refs[t][ctx.get('scope','all')];n=legacy['options'].get(option,0);result['references'].append({'id':t,'label':label,'scope':ctx.get('scope','all'),'selectedSchools':n,'validQuestionSchools':legacy['nValid'],'schoolPct':pct(n,legacy['nValid']),'contextPolicy':'Fixed territorial consolidated, all UFs/municipalities/statuses; same area/question/release'})
  return result
