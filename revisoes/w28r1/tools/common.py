"""W28 isolated outputs and pinned resident inputs; source products are read only."""


import ast,hashlib,json,os,sys,uuid


from pathlib import Path


E=Path(__file__).resolve().parents[1];R=E.parent;W28=R/'comparacao_w28_teste';W27=R/'mapa_escolas_w27_teste';W26=R/'caracterizacao_w26_teste';W25=R/'monitoramento_operacional_w25_teste';W24=R/'consolidacao_w24_teste';W23=R/'equidade_w23_teste';O=R/'editorial_otimizado_teste';F=O/'fechamento_w22';C=R/'editorial_integracao_teste';A=E/'audit';WEB=E/'web';VERSION='d261027_3455a1a9_006f838c';V=C/'versions'/VERSION


sys.path.insert(0,str(R.parent/'python_scripts'))


from pcj_workspace_policy import ResidentReader,recall_flagged,qa_profile_proposal


def raw(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf-8')


def put(path,value):path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw(value))


def read(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def digest(data):return hashlib.sha256(data).hexdigest()


def sha(path):


 with Path(path).open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()


class Inputs:


 def __init__(self,budget=800*1024*1024):


  self.reader=ResidentReader(R,byte_budget=budget);self.project=ResidentReader(R.parent,byte_budget=8000000);self.cache={};self.receipts=[];self.output=A/('inputs-'+str(os.getpid())+'-'+uuid.uuid4().hex[:6]+'.json')


  self.pins=read(A/'baseline.json')['inputHashes']if(A/'baseline.json').exists()else{}


 def get(self,path,expected=None,project=False):


  key=(str(path),project)


  if key in self.cache:return self.cache[key]


  rr=self.project if project else self.reader;body=rr.read(path);rec=rr.receipts[-1];wanted=expected or self.pins.get(str(path))


  if wanted:assert digest(body)==wanted,'Pinned input changed: '+str(path)


  self.receipts.append({**rec,'project':project})


  if len(self.receipts)<=30 or len(self.receipts)%100==0:put(self.output,self.receipts)


  self.cache[key]=body;return body


 def json(self,path,expected=None,project=False):return json.loads(self.get(path,expected,project))


 def flush(self):put(self.output,self.receipts)


def functions(source,names,globals_):


 tree=ast.parse(source);nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))and n.name in names];assert len(nodes)==len(names);exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pinned readable source>','exec'),globals_);return globals_


