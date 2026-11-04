"""Shared W28 controlled server, with immutable per-profile physical roots and route allowlists."""
import argparse,gzip,hmac,mimetypes,secrets,threading,time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import parse_qs,unquote,urlsplit
from common import *
class LocalServer(ThreadingHTTPServer):
 allow_reuse_address=False
 request_queue_size=128
class Handler(BaseHTTPRequestHandler):
 def authorized(self):
  cookie=SimpleCookie()
  try:cookie.load(self.headers.get('Cookie',''))
  except Exception:return False
  name=self.server.cookie_name;return bool(name in cookie and hmac.compare_digest(cookie[name].value,self.server.session)and self.headers.get('Origin')in[None,self.server.app_origin]and self.headers.get('Sec-Fetch-Site')not in['cross-site','same-site'])
 def query(self,parsed):
  pairs=parse_qs(parsed.query,keep_blank_values=True,strict_parsing=True)
  if len(pairs)>16 or not all(len(v)==1 and len(v[0])<=1200 for v in pairs.values()):raise ValueError('Parâmetros inválidos')
  return {k:v[0]for k,v in pairs.items()}
 def do_GET(self):
  parsed=urlsplit(self.path);path=unquote(parsed.path)
  if self.headers.get('Host')!='127.0.0.1:'+str(self.server.server_port):self.error(path,403,'Invalid loopback Host');return
  if self.server.is_app:
   if not path.startswith(self.server.prefix):self.error(path,404,'Outside exact profile root');return
   name=path[len(self.server.prefix):]or'index.html'
   # Aggregate delivery rejects nominal operations before cookie, query parsing or dataset access.
   if self.server.mode=='aggregate'and(name.startswith(('internal/','api/school-map/','data/operational/'))or name in['assets/matrix.js','assets/matrix-xlsx.js','assets/school-workbook.js','assets/school-map.js','assets/operational.js']):self.error(path,404,'Resource absent from aggregate profile');return
   if name=='internal/matrix':
    self.api(path,parsed,'workbook');return
   if name=='api/school-map/data':
    self.api(path,parsed,'map');return
   if name in['api/census-comparison/data','api/census-comparison/csv']:
    self.api(path,parsed,'census-csv'if name.endswith('/csv')else'census');return
   if name.startswith('api/characterization/'):
    self.api(path,parsed,'characterization-'+name.removeprefix('api/characterization/'));return
   encoded=False;files=self.server.manifest['files']
   if name not in files:
    if name+'.gz'in files:name+='.gz';encoded=True
    else:self.error(path,404,'Resource absent from profile allowlist');return
   if name.startswith('data/operational/')and not self.authorized():self.error(path,403,'Internal local session required');return
   file=self.server.webroot/name;body=file.read_bytes()
   if digest(body)!=files[name]['sha256']:self.error(path,503,'Reviewed delivery changed');return
   mime=mimetypes.guess_type(str(file).removesuffix('.gz'))[0]or'application/octet-stream'
   if name.removesuffix('.gz').endswith(('.json','.geojson')):mime='application/json'
   self.bytes(path,200,body,mime,encoded,cookie=name in['index.html','relatorio.html']);return
  allowed={'/homologacao/':'homologacao/index.html','/homologacao/index.html':'homologacao/index.html','/homologacao/host.css':'homologacao/host.css','/integracao/wash-embed-host.js':'integracao/wash-embed-host.js','/integracao/wash-embed-host.css':'integracao/wash-embed-host.css'}
  if path not in allowed:self.error(path,404,'Resource absent from host allowlist');return
  file=E/'drupal_embed'/self.server.mode/allowed[path];self.bytes(path,200,file.read_bytes(),mimetypes.guess_type(str(file))[0]or'application/octet-stream')
 def api(self,path,parsed,kind):
  if not self.authorized():self.json(path,403,{'error':'Sessão local e mesma origem necessárias'});return
  try:
   query=self.query(parsed)
   if kind=='workbook':
    if self.server.mode!='internal'or self.server.workbooks is None:raise PermissionError('Excel escolar indisponível neste perfil')
    result=self.server.workbooks.payload(query)
   elif kind=='map':
    if self.server.mode!='internal':raise PermissionError('Mapa identificado indisponível neste perfil')
    result=self.server.school_map.payload(query)
   elif kind in['census','census-csv']:
    if self.server.comparison is None:raise OSError('Fonte da leitura complementar indisponível')
    if kind=='census-csv':self.bytes(path,200,self.server.comparison.csv(query),'text/csv');return
    result=self.server.comparison.payload(query);self.safe_aggregate(result)
   elif kind=='characterization-aggregate':result=self.server.dataset.aggregate(query);self.safe_aggregate(result)
   elif kind=='characterization-equity':
    q=query.pop('question');option=query.pop('option',None);result=self.server.dataset.equity(query,q,option);self.safe_aggregate(result)
   elif kind=='characterization-report':result=self.server.dataset.report(query);self.safe_aggregate(result)
   else:self.json(path,404,{'error':'Operação ausente do contrato'});return
   self.json(path,200,result)
  except PermissionError as error:self.json(path,403,{'error':str(error)})
  except(ValueError,KeyError,AssertionError)as error:self.json(path,400,{'error':str(error)})
  except Exception as error:
   with self.server.loglock:
    with(A/'runtime_api_errors.jsonl').open('a',encoding='utf-8')as stream:stream.write(json.dumps({'profile':self.server.mode,'kind':kind,'type':type(error).__name__,'error':str(error)})+'\n')
   self.json(path,503,{'error':'Fonte ou partição indisponível; nenhum arquivo ou resultado parcial substituiu esta seleção.'})
 def safe_aggregate(self,value):
  if isinstance(value,dict):
   assert not({'inep','school_name','nome_escola','answers','rawValue','sourceRecordHash','membership'}&set(value)),'Nominal attribute in aggregate response'
   for item in value.values():self.safe_aggregate(item)
  elif isinstance(value,list):
   for item in value:self.safe_aggregate(item)
 def payload_headers(self,status,size,mime,encoded=False,cookie=False):
  self.send_response(status);self.send_header('Content-Type',mime+('; charset=utf-8'if mime.startswith('text/')or mime in['application/json','application/javascript']else''));self.send_header('Content-Length',str(size))
  if encoded:self.send_header('Content-Encoding','gzip')
  if cookie:self.send_header('Set-Cookie',self.server.cookie_name+'='+self.server.session+'; Path='+self.server.prefix+'; HttpOnly; SameSite=Strict')
  self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','strict-origin-when-cross-origin');self.send_header('Permissions-Policy','camera=(), microphone=(), geolocation=()');csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; ";csp+=("frame-ancestors "+self.server.app_origin+' '+self.server.host_origin+"; frame-src 'none'"if self.server.is_app else"frame-ancestors 'none'; frame-src "+self.server.app_origin);self.send_header('Content-Security-Policy',csp);self.end_headers()
 def bytes(self,path,status,body,mime,encoded=False,cookie=False):
  self.payload_headers(status,len(body),mime,encoded,cookie)
  try:self.wfile.write(body)
  except(BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
  self.record(path,status,len(body))
 def json(self,path,status,value):
  body=raw(value);encoded=len(body)>1024
  if encoded:body=gzip.compress(body,mtime=0)
  self.bytes(path,status,body,'application/json',encoded)
 def error(self,path,status,message):self.send_error(status,message);self.record(path,status,0)
 def record(self,path,status,size):
  with self.server.loglock:
   with self.server.logpath.open('a',encoding='utf-8')as stream:stream.write(json.dumps({'time':time.time(),'path':path,'status':status,'bodyBytes':size,'profile':self.server.mode})+'\n')
 def log_message(self,*args):pass
def main():
 p=argparse.ArgumentParser();p.add_argument('--profile',choices=['internal','aggregate'],required=True);p.add_argument('--host',action='store_true');args=p.parse_args();spec=read(E/'policy/profile_matrix.json')['profiles'][args.profile];port=spec['hostPort'if args.host else'port'];server=LocalServer(('127.0.0.1',port),Handler);server.mode=args.profile;server.is_app=not args.host;server.prefix=spec['prefix'];server.webroot=E/spec['webroot'];server.app_origin='http://127.0.0.1:'+str(spec['port']);server.host_origin='http://127.0.0.1:'+str(spec['hostPort']);server.cookie_name='W28R1_'+args.profile.upper()+'_LOCAL_SESSION';server.session=secrets.token_hex(32);server.loglock=threading.Lock();server.logpath=A/('http-'+str(port)+'.jsonl');server.dataset=None;server.school_map=None;server.comparison=None;server.workbooks=None;server.manifest=None
 if server.is_app:
  from group_model import Dataset
  from school_map_model import SchoolMap
  from comparison_model import CensusComparison
  server.dataset=Dataset();map_context=SchoolMap();server.school_map=map_context if args.profile=='internal'else None
  try:server.comparison=CensusComparison(server.dataset,map_context)
  except Exception as err:put(A/('comparison-init-'+args.profile+'.json'),{'type':type(err).__name__,'error':str(err),'diagnosticPreserved':True})
  if args.profile=='internal':
   try:
    from workbook_model import MunicipalWorkbooks
    server.workbooks=MunicipalWorkbooks(server.dataset)
   except Exception as err:put(A/'workbook_initialization_error.json',{'type':type(err).__name__,'error':str(err)})
  server.manifest=read(A/('distribution_manifest.json'if args.profile=='internal'else'aggregate_distribution_manifest.json'))
 put(A/('server-'+str(port)+'.json'),{'pid':os.getpid(),'bind':'127.0.0.1','port':port,'profile':args.profile,'role':'host'if args.host else'app','root':str(E/'drupal_embed'/args.profile if args.host else server.webroot),'prefix':server.prefix,'nominalRoutes':args.profile=='internal'and not args.host,'workbookReady':server.workbooks is not None,'publication':'NOT_EXECUTED'});print('W28-R1 controlled',args.profile,'host'if args.host else'app',port,flush=True);server.serve_forever()
if __name__=='__main__':main()
