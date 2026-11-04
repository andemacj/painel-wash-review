"""Current internal/aggregate HTTP cohorts equal the immutable W28 pilot, for six readings at seven levels."""
import urllib.request,urllib.parse,http.cookiejar,gzip
from common import *
def main():
 contract=read(E/'contract/contrato_comparabilidade.json');clients={};cases=[]
 for mode,port,prefix in[('baseline',8904,'/wash28/'),('internal',8906,'/wash28r1/internal/'),('aggregate',8908,'/wash28r1/aggregate/')]:
  op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));base='http://127.0.0.1:'+str(port)+prefix;op.open(base+'index.html',timeout=15).read();clients[mode]=(op,base)
 def get(mode,query):
  op,base=clients[mode];r=op.open(base+'api/census-comparison/data?'+urllib.parse.urlencode(query),timeout=30);b=r.read();return json.loads(gzip.decompress(b)if r.headers.get('Content-Encoding')=='gzip'else b)
 for label,extra in[('Selo',{}),('Amazonia',{'territory':'amazonia'}),('Semiarido',{'territory':'semiarido'}),('PA',{'uf':'PA'}),('PI',{'uf':'PI'}),('Santarem',{'uf':'PA','ibge':'1506807'}),('Teresina',{'uf':'PI','ibge':'2211001'})]:
  for number in['22','28','58','81','94','98']:
   context={'territory':'all','uf':'','ibge':'','scope':'all','status':'all','schoolCharacteristic':'all','releaseId':contract['releaseId'],'question':number,'censusYear':2025,'contractVersion':contract['contractVersion'],**extra};old=get('baseline',context)
   for mode in['internal','aggregate']:
    m=get(mode,context);assert m==old,(mode,label,number,'Actual aggregate differs from preserved W28');b=m['base'];assert b['common']+sum(r['schools']for r in b['losses'])==b['eligible'];assert all(r['denominator']==b['common']for side in['wash','census']for r in m[side]['options']);assert m['pair']['semanticClassification']=='Parcial/complementar';assert not any(k in m for k in['agreement','accuracy','differencePP','comparisonMatrix','schoolRows']);cases.append({'profile':mode,'territory':label,'question':number,'eligible':b['eligible'],'finalized':b['finalized'],'originalValid':b['originalValidQuestion'],'common':b['common'],'losses':b['losses'],'flags':b['flags'],'sourceDates':m['sourceDates'],'identicalW28':True})
 put(A/'six_readings_reconciliation.json',{'status':'PASS','cases':cases,'numberOfActualProfileCases':len(cases),'questions':['22','28','58','81','94','98'],'W28ManifestSHA256':sha(W28/'MANIFESTO_W28_20261030.json'),'contractSHA256':sha(E/'contract/contrato_comparabilidade.json'),'reuse':'Same frozen cohort rules, canonical school source, adopted Census projection and numerical model; original exhaustive numerical evidence remains sealed in W28'});print('Six readings PASS',len(cases),'real profile/context cases equal preserved W28',flush=True)
if __name__=='__main__':main()
