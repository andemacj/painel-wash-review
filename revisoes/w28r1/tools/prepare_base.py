"""One pinned W28 snapshot, two physical delivery allowlists and a single shared source/runtime."""
from common import *
NOMINAL_ASSETS={'assets/operational.js','assets/operational-model.js','assets/school-map.js','assets/school-map-config.js','assets/school-map.css'}
def main():
 b=read(A/'baseline.json');i=Inputs();put(A/'copy_snapshot_plan.json',{'W28FinalSHA256':b['W28ManifestSHA256'],'web':b['W28WebFiles'],'aggregateExcludesPrefixes':['data/operational/'],'aggregateExcludesAssets':sorted(NOMINAL_ASSETS)});agg=E/'aggregate/web'
 for n,m in b['W28WebFiles'].items():
  body=i.get(W28/'web'/n,m['sha256']);p=WEB/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(body)
  if not n.startswith('data/operational/')and n not in NOMINAL_ASSETS:
   p=agg/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(body)
  i.cache.clear()
 for n,m in b['W28CodeInventory'].items():
  if n.startswith('source/')and n!='source/rascunho_analitico.md':p=E/n;p.parent.mkdir(exist_ok=True);p.write_bytes(i.get(W28/n,m['sha256']))
 names=['frozen_canonical_source.py','frozen_equity.py','group_model.py','school_map_model.py','build_private.py','comparison_model.py','browser.py','qa_support.py']
 for n in names:(E/'tools'/n).write_bytes(i.get(W28/'tools'/n,b['W28CodeInventory']['tools/'+n]['sha256']))
 rr=ResidentReader(W28,byte_budget=24000000);receipts=[]
 for n in ['private/manifest.json','private/catalog.json','private/equity_metadata.json','private/characterized_responses.parquet','private/map_manifest.json','private/school_map.sqlite','private/census_manifest.json','private/census_infrastructure.sqlite','contract/contrato_comparabilidade.json','audit/comparison_delivery.json','audit/characterization_contract.json','audit/minifier.json']:
  body=rr.read(n);receipts.append(rr.receipts[-1]);put(A/'minimal_private_snapshot_plan.json',receipts);p=E/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(body)
 # Host bridge source is reused; its two HTML/config entries are generated later from this exact snapshot.
 hosts=['drupal_embed/homologacao/index.html','drupal_embed/homologacao/host.css','drupal_embed/integracao/wash-embed-host.js','drupal_embed/integracao/wash-embed-host.css']
 for n in hosts:p=E/'host_source'/Path(n).relative_to('drupal_embed');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(i.get(W28/n,b['W28CodeInventory'][n]['sha256']))
 controls={r['path']:r for r in read(A/'inherited_protected_inventory.json')};approved={'matrix.js':'equidade_w23_teste/web/assets/matrix.js','school-workbook.js':'equidade_w23_teste/source/school-workbook.js','school-workbook-thematic.js':'editorial_integracao_teste/assets/school-workbook.js','matrix-xlsx.js':'editorial_integracao_teste/assets/matrix-xlsx.js'};put(A/'approved_export_code_copy_plan.json',{n:controls[p]for n,p in approved.items()})
 for name,path in approved.items():p=E/'approved_export_source'/name;p.parent.mkdir(exist_ok=True);p.write_bytes(i.get(R/path,controls[path]['sha256']))
 i.flush();print('One W28 snapshot copied into isolated internal and aggregate deliveries; aggregate nominal assets/indices excluded',flush=True)
if __name__=='__main__':main()
