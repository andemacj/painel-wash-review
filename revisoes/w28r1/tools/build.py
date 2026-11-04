"""Repeatable build of the SAME W28-R1 candidate from its pinned W28 snapshot and approved exporters."""
import argparse,subprocess
from common import *
def main():
 p=argparse.ArgumentParser();p.add_argument('--dry-run',action='store_true');args=p.parse_args();b=read(A/'baseline.json');assert sha(W28/'MANIFESTO_W28_20261030.json')==b['W28ManifestSHA256'];assert read(E/'build_config.json')['releaseVersion']==VERSION
 checked=[]
 for name,info in b['W28CodeInventory'].items():
  if name.startswith('source/')or name in['tools/comparison_model.py','tools/frozen_equity.py','tools/group_model.py','tools/school_map_model.py']:
   path=W28/name;assert not recall_flagged(path,path.stat()),'Nonresident input';assert sha(path)==info['sha256'];checked.append(name)
 for name,info in read(A/'approved_export_code_copy_plan.json').items():
  source=R/info['path'];assert not recall_flagged(source,source.stat());assert sha(source)==info['sha256'];assert sha(E/'approved_export_source'/name)==info['sha256']
 print(('DRY-RUN: 'if args.dry_run else'BUILD: ')+str(len(checked))+' immutable W28 code inputs verified; same snapshot, no RAW/release copy.',flush=True)
 if args.dry_run:return
 before={key:sha(W28/key)for key in['MANIFESTO_W28_20261030.json','contract/contrato_comparabilidade.json']}
 for tool in['build_catalog.py','build_policy.py','build_web.py']:subprocess.run([sys.executable,'-B',str(E/'tools'/tool)],check=True)
 assert before=={key:sha(W28/key)for key in before};print('Internal and aggregate distributions built; no publication or Git write.',flush=True)
if __name__=='__main__':main()
