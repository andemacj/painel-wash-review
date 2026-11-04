"""Existing CDP transport with isolated Edge profiles in this candidate only."""
import base64,json,socket,subprocess,sys,time,urllib.request,uuid
from pathlib import Path
from common import O,R,A,put
sys.path.insert(0,str(R.parent/'python_scripts'))
from ava_dev_browser import CDP

class DiagnosticCDP(CDP):
    def evaluate(self,s):
        r=self.call('Runtime.evaluate',{'expression':s,'returnByValue':True,'awaitPromise':True})
        if 'exceptionDetails' in r:raise RuntimeError(json.dumps(r['exceptionDetails'],ensure_ascii=False))
        return r.get('result',{}).get('value')

class Browser:
    def __init__(self,runtime=None,extra_flags=None,native=False,preferences=None):
        with socket.socket() as s:s.bind(('127.0.0.1',0));self.port=s.getsockname()[1]
        assert runtime is not None,'W25 requires an owned TEMP QA profile';self.profile=(Path(runtime) if runtime is not None else O/'.runtime')/('edge-'+str(self.port)+'-'+uuid.uuid4().hex[:6]);self.profile.mkdir(parents=True,exist_ok=False)
        if preferences:
            (self.profile/'Default').mkdir();(self.profile/'Default/Preferences').write_text(json.dumps(preferences),encoding='utf-8')
        edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
        startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
        self.process=subprocess.Popen([edge,*([]if native else['--headless=new']),'--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+str(self.port),'--user-data-dir='+str(self.profile),*(extra_flags or []),'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW,startupinfo=startup)
        self.receipt=A/'browser-processes'/(self.profile.name+'.json');put(self.receipt,{'pid':self.process.pid,'profile':str(self.profile),'port':self.port,'ownedBy':'W28R1','status':'STARTING','cleanup':'Browser.close; preserve profile'})
        for _ in range(20):
            try:
                tabs=json.load(urllib.request.urlopen('http://127.0.0.1:'+str(self.port)+'/json/list',timeout=2));self.cdp=DiagnosticCDP(next(t['webSocketDebuggerUrl'] for t in tabs if t['type']=='page'))
                for method in ['Page.enable','Runtime.enable','Network.enable','Performance.enable','Log.enable']:self.cdp.call(method)
                put(self.receipt,{'pid':self.process.pid,'profile':str(self.profile),'port':self.port,'ownedBy':'W28R1','status':'CDP_READY'});break
            except Exception:time.sleep(.15)
        else:raise RuntimeError('Edge CDP unavailable')
    def go(self,url,condition):
        navigation=self.cdp.call('Page.navigate',{'url':url})
        if navigation.get('errorText'):raise RuntimeError(navigation['errorText'])
        if navigation.get('loaderId'):
            until=time.monotonic()+60
            while time.monotonic()<until:
                frame=self.cdp.call('Page.getFrameTree')['frameTree']['frame']
                if frame.get('loaderId')==navigation['loaderId']:break
                time.sleep(.1)
            else:raise RuntimeError('Requested navigation did not commit')
        self.cdp.wait(condition,timeout=90)
    def shot(self,path):Path(path).write_bytes(base64.b64decode(self.cdp.call('Page.captureScreenshot',{'captureBeyondViewport':False})['data']))
    def close(self):
        try:self.cdp.call('Browser.close')
        except Exception:pass
        try:self.process.wait(timeout=8)
        except subprocess.TimeoutExpired:self.process.terminate()
        put(self.receipt,{'pid':self.process.pid,'profile':str(self.profile),'port':self.port,'ownedBy':'W28R1','status':'CLOSED','exitCode':self.process.poll()})
