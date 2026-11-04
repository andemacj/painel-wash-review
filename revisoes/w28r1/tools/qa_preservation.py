"""Rehash the inherited exact allowlist; no recursive historical audit or Git writes."""
import subprocess,time,concurrent.futures
from common import *
def main():
 b=read(A/'baseline.json');assert sha(W28/'MANIFESTO_W28_20261030.json')==b['W28ManifestSHA256'];old=read(W28/'MANIFESTO_W28_20261030.json');plan={r['path']:{'bytes':r['bytes'],'sha256':r['sha256']}for r in read(A/'inherited_protected_inventory.json')}
 def add(path,info):
  key=str(path.relative_to(R)).replace('\\','/');existing=plan.get(key);assert existing is None or existing['sha256']==info['sha256'];plan[key]={'sha256':info['sha256'],'bytes':info.get('bytes',path.stat().st_size)}
 add(W28/'MANIFESTO_W28_20261030.json',{'sha256':b['W28ManifestSHA256'],'bytes':(W28/'MANIFESTO_W28_20261030.json').stat().st_size})
 for name,info in b['W28WebFiles'].items():add(W28/'web'/name,info)
 for name,info in b['W28CodeInventory'].items():add(W28/name,info)
 for value in old['evidence'].values():
  if isinstance(value,dict)and'file'in value and'sha256'in value:add(W28/value['file'],value)
 for name,info in old['deliverables'].items():add(W28/name,info)
 value=old['report'];add(R/value['path'],value)
 for info in read(A/'minimal_private_snapshot_plan.json'):add(W28/info['path'],info)
 for info in read(A/'approved_export_code_copy_plan.json').values():add(R/info['path'],info)
 canonical=read(E/'policy/workbooks.json')['source'];add(Path(canonical['path']),canonical)
 put(A/'preservation_exact_plan.json',plan);rr=ResidentReader(R,byte_budget=sum(v['bytes']for v in plan.values())+1000000);rows=[];start=time.monotonic();print('Preservation exact allowlist:',len(plan),'files',flush=True)
 def chunk(bucket):
  reader=ResidentReader(R,byte_budget=sum(v['bytes']for n,v in bucket)+1000000);verified=[]
  for name,info in bucket:
   body=reader.read(name);assert len(body)==info['bytes']and digest(body)==info['sha256'],name;verified.append({'path':name,'sha256':info['sha256'],'bytes':info['bytes'],'unchanged':True});del body
  return verified,len(reader.receipts)
 items=list(plan.items());receipt_count=0
 with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:
  for verified,count in pool.map(chunk,[items[n::4]for n in range(4)]):rows.extend(verified);receipt_count+=count
 rows.sort(key=lambda r:r['path'])
 git=b['gitIndex'];assert sha(git['path'])==git['sha256'];cmd=['git','--no-optional-locks','-C',str(R.parent),'status','--porcelain=v1','--untracked-files=no'];status=subprocess.run(cmd,check=True,capture_output=True,encoding='utf-8').stdout;assert status.splitlines()==[line for line in b['gitStatus'].splitlines()if not line.startswith(('??','!!'))],'Preexisting tracked Git status changed';assert sha(git['path'])==git['sha256'];put(A/'preservation_validation.json',{'status':'PASS','files':rows,'count':len(rows),'bytes':sum(r['bytes']for r in rows),'inputPlanSHA256':sha(A/'preservation_exact_plan.json'),'W28ManifestSHA256':b['W28ManifestSHA256'],'gitIndexSHA256':git['sha256'],'gitIndexChanged':False,'preexistingTrackedStatusPreserved':True,'gitCommand':cmd,'gitWrites':False,'sourceWrites':False,'nationalDownload':False,'currentPointerChanged':False,'schedulerChanged':False,'OneDrivePoliciesChanged':False,'publication':'NOT_EXECUTED','elapsedSeconds':round(time.monotonic()-start,3),'readerReceiptsCount':receipt_count,'residentReaderWorkers':4,'gitComparison':'Current tracked status compared with tracked lines of original full status; original index hash independently unchanged'});print('Preservation PASS',len(rows),'files; Git index and tracked preexisting changes intact',flush=True)
if __name__=='__main__':main()
