"""Physical aggregate package and HTTP boundaries, plus current field masks in the internal matrix."""
import http.cookiejar,urllib.request,urllib.parse,urllib.error,gzip
from common import *
def main():
 checks=[];policy=read(E/'policy/workbooks.json');profiles=read(E/'policy/profile_matrix.json')['profiles'];clients={}
 def check(ok,name):assert ok,name;checks.append(name)
 for mode,p in profiles.items():
  jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));base='http://127.0.0.1:'+str(p['port'])+p['prefix'];client.open(base+'index.html',timeout=15).read();clients[mode]=(client,base)
 def get(mode,path,headers=None,cookie=True):
  client,base=clients[mode];request=urllib.request.Request(base+path,headers=headers or{})
  try:r=(client if cookie else urllib.request.build_opener()).open(request,timeout=30)
  except urllib.error.HTTPError as e:r=e
  body=r.read();return r.status,r.headers,gzip.decompress(body)if r.headers.get('Content-Encoding')=='gzip'else body
 source={'territory':'all','uf':'AP','ibge':'1600303','scope':'all','status':'all','questionSet':'complete_available','releaseId':policy['releaseId'],'schoolCharacteristic':'all','workbookContractVersion':policy['version']};path='internal/matrix?'+urllib.parse.urlencode(source);status,headers,body=get('internal',path);m=json.loads(body);check(status==200 and m['complete']and m['total']==len(m['rows'])==106,'Actual internal complete matrix contains all 106 eligible schools');check(len(m['questionNumbers'])==89 and len(m['allowedQuestionNumbers'])==83 and len(m['maskedQuestionNumbers'])==6,'Actual internal catalog/allowed/masked counts follow current contract');check(sum(r['status']=='COMPLETED'for r in m['rows'])==105,'Internal matrix preserves 105 finalized / one pending');check(all(set(r)=={'inep','name','ibge','uf','scope','status','answers'}for r in m['rows']),'No demographic, characterization, coordinate or Census row columns added');check(all(set(r['answers'])==set(policy['allowedQuestionNumbers'])if r['status']=='COMPLETED'else r['answers']=={}for r in m['rows']),'Restricted keys excluded and pending school has no fabricated answers');check(all(not(set(r['answers'])&set(policy['maskedQuestionNumbers']))for r in m['rows']),'All six masked source keys absent from nominal payload')
 check(get('internal',path,cookie=False)[0]==403,'Internal matrix requires actual local same-origin session');check(get('internal',path,{'Origin':'http://127.0.0.1:8908'})[0]==403,'Aggregate origin cannot call internal matrix');check(get('internal',path,{'Host':'localhost:8906'})[0]==403,'Internal exact loopback Host enforced');check(get('internal',path,{'Sec-Fetch-Site':'cross-site'})[0]==403,'Internal cross-site metadata rejected');check(headers.get('Access-Control-Allow-Origin')is None,'No nominal CORS permission')
 for group in['indigenous','riverside','quilombola','none','other']:
  q={**source,'schoolCharacteristic':group};check(get('internal','internal/matrix?'+urllib.parse.urlencode(q))[0]==403,'Internal workbook rejects Q16 '+group+' without clearing it')
 for delta in[{'scope':'rural'},{'questionSet':'all_raw'},{'releaseId':'other'},{'inep':'11000000'},{'search':'any'},{'page':'1'},{'uf':'PI'},{'profile':'internal'},{'schoolStatus':'PENDING'}]:check(get('internal','internal/matrix?'+urllib.parse.urlencode({**source,**delta}))[0]==400,'Matrix rejects unsupported/reducing context '+','.join(delta))
 denied=['internal/matrix','internal/schools','api/school-map/data','assets/matrix.js','assets/matrix-xlsx.js','assets/school-workbook.js','assets/school-map.js','assets/operational.js','private/school_map.sqlite','private/census_infrastructure.sqlite','policy/workbooks.json','../web/data/operational/manifest.json','../internal/internal/matrix']
 operational=[p for p in read(A/'distribution_manifest.json')['files']if p.startswith('data/operational/')];denied+=operational
 for path in denied:check(get('aggregate',path)[0]==404,'Aggregate direct path denied: '+path)
 check(get('aggregate','internal/matrix?'+urllib.parse.urlencode(source))[0]==404,'Aggregate rejects nominal query even with its valid cookie');status,h,body=get('aggregate','data/config.json?profile=internal');check(status==200 and json.loads(body)['profile']=='aggregate','Query/config cannot elevate aggregate profile');agg=read(A/'aggregate_distribution_manifest.json');check(not any(p.startswith('data/operational/')for p in agg['files']),'Aggregate physical allowlist has no operational nominal index');check(not any(p in agg['files']for p in['assets/matrix.js','assets/school-workbook.js','assets/school-map.js','assets/operational.js']),'Aggregate physical package excludes nominal generators and identified maps')
 # Decode the delivered aggregate JSON schemas, without scanning historical trees.
 rr=ResidentReader(E/'aggregate/web',byte_budget=45000000);decoded=0;files=0;forbidden={'inep','nome_escola','school_name','answers','latitude','longitude'}
 def scan(v,path):
  if isinstance(v,dict):
   assert not(set(v)&forbidden),'Nominal keys in aggregate delivery: '+path
   for child in v.values():scan(child,path)
  elif isinstance(v,list):
   for child in v:scan(child,path)
 for name,info in agg['files'].items():
  if not name.endswith(('.json.gz','.geojson.gz','.json','.geojson')):continue
  body=rr.read(name);assert digest(body)==info['sha256'];body=gzip.decompress(body)if name.endswith('.gz')else body;decoded+=len(body);assert decoded<650000000,'Bounded aggregate schema budget exceeded';scan(json.loads(body),name);files+=1
 check(True,'All '+str(files)+' delivered aggregate JSON schemas contain no school identifiers/answers/coordinate columns');put(A/'aggregate_schema_read_receipts.json',rr.receipts);put(A/'profile_security_validation.json',{'status':'PASS','checks':checks,'manifestSHA256':sha(A/'distribution_manifest.json'),'aggregateManifestSHA256':sha(A/'aggregate_distribution_manifest.json'),'matrixBackendSHA256':sha(E/'tools/workbook_model.py'),'aggregateJSONFilesChecked':files,'aggregateDecodedJSONBytes':decoded,'cookiesLogged':False});print('Profile security PASS',len(checks),'HTTP/package/schema checks',flush=True)
if __name__=='__main__':main()
