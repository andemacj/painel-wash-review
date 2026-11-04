import base64,tempfile,time,traceback
from common import *
from browser import Browser
READY="window.W15App?.ready&&W15App.renderedContext===W15.query(W15.context)&&(W15.context.uf?WashCartography.store.ufs.has(W15.context.uf):WashCartography.store.territories.has('amazonia')&&WashCartography.store.territories.has('semiarido'))"
APP='http://127.0.0.1:8906/wash28r1/internal/';HOST='http://127.0.0.1:8907/homologacao/'
CONTEXTS=[('selo',{}),('amazonia',{'territory':'amazonia'}),('semiarido',{'territory':'semiarido'}),('PA',{'uf':'PA'}),('PI',{'uf':'PI'}),('Santarem',{'uf':'PA','ibge':'1506807'}),('Teresina',{'uf':'PI','ibge':'2211001'})]
class QA:
 def __init__(self,name='qa',native=False,preferences=None,flags=None,profile='internal'):
  self.profile=profile;self.appOrigin='http://127.0.0.1:'+str(8906 if profile=='internal'else 8908);self.appURL=self.appOrigin+'/wash28r1/'+profile+'/';self.hostURL='http://127.0.0.1:'+str(8907 if profile=='internal'else 8909)+'/homologacao/'
  self.name=name;self.run='W28R1_20261030_'+name+'_'+uuid.uuid4().hex[:8];self.runtime=Path(tempfile.gettempdir())/'SeloUNICEF/PCJ_QA'/self.run
  self.runtime.mkdir(parents=True,exist_ok=False);self.b=Browser(self.runtime,native=native,preferences=preferences,extra_flags=flags);self.c=self.b.cdp;self.context=None
  self.result={'status':'RUNNING','checks':[],'owned':{'runtime':str(self.runtime),'profile':str(self.b.profile),'pid':self.b.process.pid,'debugPort':self.b.port,'closed':False},'manifestSHA256':sha(A/'distribution_manifest.json')};self.save()
 def save(self):put(A/(self.name+'_results.json'),self.result)
 def check(self,ok,label):
  if not ok:raise AssertionError(label)
  self.result['checks'].append(label);self.save()
 def ev(self,expression,host=False,userGesture=False):
  args={'expression':expression,'returnByValue':True,'awaitPromise':True,'userGesture':userGesture}
  if self.context is not None and not host:args['contextId']=self.context
  result=self.c.call('Runtime.evaluate',args)
  if 'exceptionDetails'in result:raise RuntimeError(json.dumps(result['exceptionDetails'],ensure_ascii=False))
  return result.get('result',{}).get('value')
 def wait(self,expression,host=False,timeout=45):
  end=time.monotonic()+timeout
  while time.monotonic()<end:
   if self.ev(expression,host):return
   time.sleep(.12)
  raise RuntimeError('Timeout: '+expression)
 def frame(self):
  end=time.monotonic()+15
  while time.monotonic()<end:
   tree=self.c.call('Page.getFrameTree')['frameTree'];children=tree.get('childFrames',[]);self.c.call('Runtime.enable')
   target=self.ev("document.querySelector('iframe').src",host=True);child=next((x['frame']['id']for x in children if x['frame']['url']==target and 'wash-embed-id='in x['frame']['url']),None)
   contexts=[e['params']['context']for e in self.c.events if e.get('method')=='Runtime.executionContextCreated'and e['params']['context'].get('auxData',{}).get('isDefault')and e['params']['context'].get('auxData',{}).get('frameId')==child and e['params']['context'].get('origin')==self.appOrigin]
   if child and contexts:
    self.context=contexts[-1]['id']
    try:
     if self.ev('location.href')==target and self.ev("!!window.W15App"):return
    except Exception:pass
   time.sleep(.1)
  raise RuntimeError('No committed application-origin iframe execution context')
 def go(self,embedded=False,suffix=''):
  self.context=None;self.b.go((self.hostURL if embedded else self.appURL+'index.html')+suffix,"document.readyState==='complete'")
  if embedded:
   self.ev("document.querySelector('iframe').scrollIntoView({block:'start'});true",host=True);self.frame()
  self.wait(READY)
  if embedded:self.wait("document.querySelector('[data-wash-embed]').dataset.washState==='ready'",host=True)
 def select(self,context):
  self.ev('W15.set('+json.dumps({'territory':'all','uf':'','ibge':'','scope':'all','status':'all','questionSet':'strategic31',**context})+');true');self.wait(READY)
 def question(self,number):
  self.ev('W15App.drawer('+json.dumps(str(number))+');true');self.wait("document.querySelector('#questionDialog').open")
  if str(number)not in ['103','104','106']:self.wait("W23Equity.state?.data?.question==="+json.dumps(str(number)))
 def report(self,product):
  self.ev("W15ReportViewer.open(W15.context,document.querySelector('#openEditorialReports'),{product:"+json.dumps(product)+"});true")
  self.wait('W15ReportViewer.ready',timeout=60)
 def close_dialog(self):self.ev("WashOverlays.close(WashOverlays.active);true")
 def screenshot(self,name):
  target=A/'screens'/name;target.parent.mkdir(exist_ok=True);self.b.shot(target);return str(target.relative_to(E))
 def close(self):
  self.b.close();self.result['owned']['closed']=True;self.result['owned']['processExitCode']=self.b.process.poll();self.save()

def main_guard(q,work):
 try:work();q.result['status']='PASS'
 except Exception:
  q.result.update(status='FAILED',error=traceback.format_exc())
  try:q.result['failureUI']=q.ev("({url:location.href,docReady:document.readyState,bodyText:document.body.innerText.slice(0,800),ready:window.W15App?.ready,globals:['W15','WASH_PREVIEW_DATA','WashOverlays','W25Operational'].map(k=>[k,typeof window[k]]),dialog:document.querySelector('dialog[open]')?.id,operational:window.W25Operational?{stage:W25Operational.state.stage,context:W25Operational.state.context,text:document.querySelector('#w25Body')?.innerText.slice(0,2500)}:null,equity:window.W23Equity?.state?{question:W23Equity.state.question,option:W23Equity.state.option,loading:W23Equity.state.loading,body:W23Equity.state.body.innerText}:null})")
  except Exception:pass
  q.result['exceptions']=[e['params']for e in q.c.events if e.get('method')=='Runtime.exceptionThrown'];q.result['browserLog']=[e['params']for e in q.c.events if e.get('method')=='Log.entryAdded'];q.result['failedRequests']=[e['params']for e in q.c.events if e.get('method')=='Network.loadingFailed']
  try:q.screenshot('failure-'+q.name+'.png')
  except Exception:pass
  print(q.result['error'],flush=True)
 finally:q.close()
 print(q.name,q.result['status'],len(q.result['checks']),'checks',flush=True)
 return q.result['status']=='PASS'
