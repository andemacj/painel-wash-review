"""Municipal-only authorized payload; never loads, filters or serializes Q16."""
import collections,functools,gzip,math,sqlite3,threading,typing
from shapely.geometry import shape,Point
from common import *
STATES={'usable':'Disponível','missing':'Indisponível — sem coordenada','invalid':'Indisponível — coordenada inválida','conflict':'Em revisão — coordenadas conflitantes','municipality_mismatch':'Em revisão — vínculo municipal divergente','outside_municipality':'Em revisão — fora do limite municipal','geometry_unavailable':'Em revisão — geometria indisponível ou inválida'}
def coordinate_quality(lat,lon,geometry,*,source_municipality=None,municipality=None,conflict=False,system='geographic_latitude_longitude',geometry_valid=None):
 flags=[]
 if conflict:return 'conflict',flags
 if lat is None or lon is None:return 'missing',flags
 if system!='geographic_latitude_longitude':return 'invalid',['unknown_coordinate_system']
 try:lat=float(lat);lon=float(lon)
 except(ValueError,TypeError):return 'invalid',['invalid_number']
 if not math.isfinite(lat)or not math.isfinite(lon):return 'invalid',['nonfinite']
 if not(-35<=lat<=6 and-75<=lon<=-30):
  if -75<=lat<=-30 and-35<=lon<=6:flags.append('possible_inverted_axes_not_corrected')
  return 'invalid',flags
 if source_municipality and municipality and source_municipality!=municipality:return 'municipality_mismatch',flags
 if geometry is None or not(geometry.is_valid if geometry_valid is None else geometry_valid):return 'geometry_unavailable',flags
 p=Point(lon,lat)
 if not geometry.covers(p):return 'outside_municipality',flags
 if not geometry.contains(p):flags.append('on_boundary')
 return 'usable',flags
def read_pinned(path,expected,budget=50000000):
 rr=ResidentReader(E,byte_budget=budget);body=rr.read(path);assert digest(body)==expected,'Pinned map input changed';return body
class SchoolMap:
 def __init__(self):
  self.manifest=read(E/'private/map_manifest.json');self.catalog=json.loads(read_pinned('private/catalog.json',read(E/'private/manifest.json')['catalogSHA256']));self.questions={q['question_number']:q for q in self.catalog['questions']};self.enabled=set(self.manifest['allowedQuestions']);self.query_count=0;self.lock=threading.RLock();self.cache=collections.OrderedDict()
  m=read(A/'distribution_manifest.json');self.monitor=json.loads(gzip.decompress(read_pinned('web/data/monitor.json.gz',m['files']['data/monitor.json.gz']['sha256'])))['municipalities'];self.geo={r['territory']['ibge']:r for r in self.monitor};self.members={r['ibge']:r for r in json.loads(gzip.decompress(read_pinned('web/data/territories.json.gz',m['files']['data/territories.json.gz']['sha256'])))['municipalities']};self.features={str(f['properties']['codigo_ibge']):f for f in json.loads(gzip.decompress(read_pinned('web/data/map/municipalities.geojson.gz',self.manifest['geometrySHA256'])))['features']}
  self.db_path=E/'private/school_map.sqlite';h=self.manifest['projectionSHA256'];body=read_pinned('private/school_map.sqlite',h);del body;st=self.db_path.stat();self.db_signature=(st.st_size,st.st_mtime_ns,st.st_ino)
  namespace={'Any':typing.Any,'Counter':collections.Counter};functions(read_pinned('tools/frozen_canonical_source.py',read(E/'private/manifest.json')['frozenTools']['frozen_canonical_source.py']).decode('utf-8-sig'),['normalize_text','parse_multi_response'],namespace);self.parse=namespace['parse_multi_response']
 def validate(self,source):
  allowed={'territory','uf','ibge','scope','status','releaseId','questionSet','level','schoolCharacteristic','classificationVersion','question','option','cartographyVersion','purpose'}
  if set(source)-allowed:raise ValueError('Parâmetro fora do contrato municipal autorizado')
  if source.get('schoolCharacteristic')!='all':raise PermissionError('Mapa identificado indisponível com qualquer caracterização Q16; remova-a explicitamente')
  q=str(source.get('question',''));spec=self.questions.get(q)
  if q not in self.enabled or not spec or not spec.get('nominal_allowed')or spec.get('sensitive')or spec.get('special_sensitive_review_required'):raise PermissionError('Pergunta sem autorização nominal no contrato interno')
  if source.get('releaseId','d261027_3455a1a9')!='d261027_3455a1a9':raise ValueError('Release divergente')
  if source.get('cartographyVersion',self.manifest['cartographyVersion'])!=self.manifest['cartographyVersion']:raise ValueError('Versão cartográfica divergente')
  if source.get('purpose','map')not in['map','print','report']:raise ValueError('Finalidade inválida')
  c={k:str(source.get(k,default))for k,default in [('territory','all'),('uf',''),('ibge',''),('scope','all'),('status','all')]};town=self.geo.get(c['ibge'])
  if not town or not c['uf']or town['territory']['uf']!=c['uf']:raise ValueError('Selecione um município participante válido e sua UF')
  if c['scope']not in['all','urban','rural']or c['territory']not in['all','amazonia','semiarido']:raise ValueError('Área ou território inválido')
  member=self.members[c['ibge']]
  if c['territory']!='all'and not member['amazon'if c['territory']=='amazonia'else'semiarid']:raise ValueError('Município fora do território selecionado')
  v=town['scopes'][c['scope']];e=v['eligible_schools'];f=v['completed_schools'];band='unknown'if not e else'advanced'if f*100>=e*90 else'near'if f*100>=e*80 else'attention'if f*100>=e*50 else'critical'
  if c['status']not in['all','advanced','near','attention','critical','unknown']or c['status']!='all'and c['status']!=band:raise ValueError('Município incompatível com a situação selecionada')
  option=str(source.get('option','__all_valid__'));labels=list(dict.fromkeys(spec.get('official_options',[])+spec.get('observed_options',[])))
  if option!='__all_valid__'and option not in labels:raise ValueError('Alternativa fora do contrato da pergunta')
  return {**c,'question':q,'option':option,'schoolCharacteristic':'all','releaseId':'d261027_3455a1a9','cartographyVersion':self.manifest['cartographyVersion']},spec
 def payload(self,source):
  c,spec=self.validate(source);key=tuple(sorted(c.items()))
  with self.lock:
   if key in self.cache:return self.cache[key]
   self.query_count+=1;st=self.db_path.stat()
   if recall_flagged(self.db_path,st)or(st.st_size,st.st_mtime_ns,st.st_ino)!=self.db_signature:raise OSError('Partição privada indisponível ou alterada; não há mapa parcial')
   q=c['question'];con=sqlite3.connect('file:'+(E/'private/school_map.sqlite').as_posix()+'?mode=ro&immutable=1',uri=True);con.row_factory=sqlite3.Row;sql='SELECT s.inep,s.name,s.ibge,s.uf,s.scope,s.status,s.lat,s.lon,s.coordinate_state,s.coordinate_flags,v.value AS response FROM schools s LEFT JOIN response_values v ON v.question=? AND v.value_id=s.q'+q+' WHERE s.ibge=? AND s.status=\'COMPLETED\'';params=[q,c['ibge']]
   if c['scope']!='all':sql+=' AND s.scope=?';params.append(c['scope'])
   data=con.execute(sql+' ORDER BY s.name,s.inep',params).fetchall();con.close();rows=[];counts=collections.Counter();valid=0
   for r in data:
    r=dict(r);value=r.pop('response');values=list(dict.fromkeys(self.parse(value or'',spec['p45_field'])))if spec['multi_response']else([value]if value not in[None,'']else[])
    if not values:continue
    valid+=1;counts.update(set(values))
    if c['option']!='__all_valid__'and c['option']not in values:continue
    state=r['coordinate_state'];r['responses']=values;r['coordinate_flags']=json.loads(r['coordinate_flags']);r['locationLabel']=STATES[state];r['locationStatus']='available'if state=='usable'else'unavailable'if state in['missing','invalid']else'review'
    if state!='usable':r['lat']=None;r['lon']=None
    rows.append(r)
   assert len(rows)==len({r['inep']for r in rows});reasons=collections.Counter(r['coordinate_state']for r in rows);mapped=reasons['usable'];selected=len(rows);assert selected==mapped+sum(v for k,v in reasons.items()if k!='usable');labels=list(dict.fromkeys(spec['official_options']+spec['observed_options']+list(counts)));town=self.geo[c['ibge']]['territory'];feature=self.features.get(c['ibge']);result={'schema':'wash.w27.municipal-school-response.v1','context':c,'question':{k:spec.get(k)for k in ['question_number','question_short_label','question_text','multi_response','indicator_direction','semantic_interpretation','focus_response_value']},'municipality':{'ibge':c['ibge'],'name':town['label'],'uf':c['uf']},'selectedSchools':selected,'mappedSchools':mapped,'unmappedSchools':selected-mapped,'validQuestionSchools':valid,'schoolPct':100*selected/valid if valid else None,'alternatives':[{'label':o,'schools':counts[o],'pctValid':100*counts[o]/valid if valid else None}for o in labels],'coordinateReasons':{k:reasons[k]for k in STATES},'rows':rows,'geometry':feature['geometry']if feature else None,'coordinateSource':self.manifest['coordinateSource'],'sourceDates':{'responses':'2026-10-26','collection':'2026-10-27','coordinateTable':2025,'coordinateReference':2024,'municipalMesh':2024},'PUBLICATION_READY':False,'nominalCommunityAssociation':False}
   self.assert_payload(result);self.cache[key]=result
   if len(self.cache)>40:self.cache.popitem(last=False)
   return result
 @staticmethod
 def assert_payload(result):
  assert result['context']['schoolCharacteristic']=='all'
  keys={'inep','name','ibge','uf','scope','status','lat','lon','coordinate_state','coordinate_flags','responses','locationLabel','locationStatus'}
  for row in result['rows']:assert set(row)==keys
  assert result['question']['question_number']not in['16','103','104','106'];assert all(len(r['inep'])==8 for r in result['rows'])
