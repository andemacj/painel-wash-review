"""Amend the same W28-R1 delivery for the user's one-worksheet decision; retain the previous seal."""
import datetime,re
from common import *
def main():
 amendment=read(A/'single_sheet_amendment.json');history=E/amendment['amendmentRoot'];previous=read(E/amendment['previousManifest']);assert sha(E/amendment['previousManifest'])==amendment['previousManifestSHA256'];assert read(E/'build_config.json')['workbookLayout']=='single';checked=[]
 for name,info in amendment['beforeFilesPlan'].items():assert sha(history/'before'/name)==info['sha256'],name
 for name,info in previous['codeInventory'].items():
  before=amendment['beforeFilesPlan'].get(name)
  assert sha(history/'before'/name if before else E/name)==info['sha256'],name
 private_reader=ResidentReader(E,byte_budget=sum(v['bytes']for v in previous['privateSnapshot'].values())+1000000)
 for name,info in previous['privateSnapshot'].items():assert digest(private_reader.read(name))==info['sha256'],name
 assert sha(W28/'MANIFESTO_W28_20261030.json')==previous['sourceW28ManifestSHA256'];git=read(A/'baseline.json')['gitIndex'];assert sha(git['path'])==git['sha256'];assert sha(R/previous['report']['path'])==previous['report']['sha256']
 profile_deltas={}
 for name,allowed in[('distribution_manifest.json',{'assets/profile-config.js','assets/report-viewer.js','assets/school-workbook.js'}),('aggregate_distribution_manifest.json',{'assets/profile-config.js','assets/report-viewer.js'})]:
  old=read(history/'before/audit'/name);current=read(A/name);assert set(old['files'])==set(current['files']);changed={p for p in current['files']if current['files'][p]!=old['files'][p]};assert changed==allowed,(name,changed);profile_deltas[name]=sorted(changed)
 result_names=['workbooks_2200707_results.json','workbooks_1506807_results.json','profile_smoke_internal_results.json','profile_smoke_aggregate_results.json','excel_visual_validation.json'];results={name:read(A/name)for name in result_names};current_sha=sha(A/'distribution_manifest.json')
 for name,r in results.items():
  assert r['status']=='PASS',name
  if'manifestSHA256'in r:assert r['manifestSHA256']==current_sha,name
 books=[w for name in result_names[:2]for w in results[name]['workbooks']];assert sum(w['responseCellsIndependentlyChecked']for w in books)==50640
 for w in books:assert w['sheets']==['respostas_'+str(w['questions'])]and w['metadata']['sheets']==1 and w['sameMatrixAsBefore']and sha(E/w['file'])==w['sha256']
 browser_receipts=[read(p)for p in(A/'browser-processes').glob('*.json')];assert all(p['ownedBy']=='W28R1'and p['status']=='CLOSED'for p in browser_receipts)
 report=R/'docs/W28R1_ajuste_excel_aba_unica_20261031.md';table='\n'.join('| '+w['municipality']+' | '+str(w['schools'])+' | '+str(w['questions'])+' | `'+w['sheets'][0]+'` | `'+w['file'].replace('\\','/')+'` |'for w in books)
 report.write_text(f'''# W28-R1 — Excel com uma única aba

Decisão do usuário recebida em **31/10/2026**: manter uma aba por arquivo, como aprovado anteriormente. Esta decisão substitui a organização com várias abas descrita no item 7 do anexo e na entrega anterior. A candidata continua a mesma: `consolidacao_w28r1_teste`.

## Formato vigente

- Produto estratégico: somente a aba **`respostas_31`**.
- Questionário completo disponível: somente a aba **`respostas_89`**.
- Os temas permanecem acima das questões. Identificadores, nomes e respostas ficam na mesma matriz.
- Fonte, referência das respostas, coleta e release ficam no cabeçalho da própria aba.
- Não são geradas abas extras de dicionário, fontes, identificação ou grandes áreas.

O gerador de aba única já aprovado foi reutilizado; sua origem permanece intacta em `approved_export_source/school-workbook.js`. O escritor XLSX e as regras de dados não mudaram. A central informa a aba única e confirma “1 aba” após o download. A exportação operacional W25 permanece com seu contrato próprio; a correção se refere aos dois produtos de respostas escolares.

## Conferência dos arquivos reais

| Município IBGE | Escolas elegíveis | Questões | Única aba | Exemplo privado |
| --- | --- | --- | --- | --- |
{table}

Os quatro arquivos foram baixados pelo navegador e reabertos. Foram conferidas **50.640 células de resposta**, nomes, códigos INEP/IBGE como texto, pendências, máscaras e proteção contra fórmulas. Os temas, os cabeçalhos das questões, os identificadores e todas as respostas foram comparados diretamente com as matrizes preservadas da entrega anterior: **nenhuma diferença**. Apenas o título recebeu a identificação da fonte e das datas; as abas adicionais foram removidas.

A abertura real dos quatro arquivos pelo Microsoft Excel ocorreu em instância própria, somente leitura, com conferência do nome e da quantidade de abas e das dimensões da matriz, sem salvar novamente os arquivos. Não foram gerados PDFs nesta correção: a tentativa de impressão encontrou um diálogo de configuração de impressora, cancelado sem alterar a configuração da máquina. Os recortes PDF da entrega anterior permanecem apenas como histórico. O filtro global Rural permaneceu intacto após os downloads em Geral. A entrada agregada continuou sem geradores ou requisições nominais; Q16 ativa e as seis máscaras continuam sob as regras anteriores.

## Acesso e preservação

Painel interno: http://127.0.0.1:8906/wash28r1/internal/index.html

Painel agregado: http://127.0.0.1:8908/wash28r1/aggregate/index.html

Atalhos: `ABRIR_INTERNO.cmd` e `ABRIR_AGREGADO.cmd`, na candidata. Os serviços locais foram recarregados somente após comprovar sua propriedade.

A base segue congelada: respostas até **26/10/2026**, coleta **27/10/2026**, infraestrutura Censo **2025**. Permanecem as 53.555 escolas elegíveis, 39.209 finalizadas e 14.346 pendentes. O completo continua com 89 questões, 83 permitidas e seis mascaradas; o estratégico contém 31 questões, 28 permitidas e três mascaradas.

O selo anterior `{amendment['previousManifest']}`, SHA256 `{amendment['previousManifestSHA256']}`, não foi alterado. As versões anteriores dos arquivos afetados e dos exemplos Excel estão preservadas, com hashes, em `{amendment['amendmentRoot']}/before/`. Esse conjunto permite verificar e restaurar a entrega anterior sem copiar novamente os dados da aplicação. O relatório anterior permanece como registro histórico; este documento descreve o formato vigente.

O delta servido limita-se ao gerador escolar, à indicação de formato e à descrição da central. Dados, backend de permissões, perguntas, leituras Censo, mapas, filtros, relatórios e demais módulos permanecem idênticos. W28, W22, fontes e Git foram preservados. Não houve atualização de base, nova candidata, scheduler, alteração de OneDrive, mudança de ponteiro de produção ou publicação. A homologação institucional/Drupal e as limitações metodológicas anteriores continuam pendentes de suas próprias decisões.
''',encoding='utf-8')
 code={}
 for folder in['tools','source','approved_export_source']:
  for p in sorted((E/folder).iterdir()):
   if p.is_file():code[str(p.relative_to(E)).replace('\\','/')]={'bytes':p.stat().st_size,'sha256':sha(p)}
 for name in['README.md','build_config.json','ABRIR_INTERNO.cmd','ABRIR_AGREGADO.cmd']:code[name]={'bytes':(E/name).stat().st_size,'sha256':sha(E/name)}
 evidence={name:{'file':'audit/'+name,'sha256':sha(A/name)}for name in result_names};gate='PASS-W28R1-SINGLE-WORKSHEET-PER-RESPONSE-WORKBOOK';manifest={'schema':'wash.w28r1.single-sheet-amendment.v1','gate':previous['gate'],'amendmentGate':gate,'dateClient':'2026-10-31','sealedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'userDecision':amendment['userDecision'],'workbookLayout':'single','worksheets':['respostas_31','respostas_89'],'previousManifest':amendment['previousManifest'],'previousManifestSHA256':amendment['previousManifestSHA256'],'history':amendment,'profileDeltas':profile_deltas,'distributionManifests':{n:sha(A/n)for n in profile_deltas},'privateSnapshot':previous['privateSnapshot'],'schoolCounts':previous['schoolCounts'],'releaseVersion':VERSION,'sourceDates':previous['sourceDates'],'workbooks':books,'answerCellsChecked':50640,'allMatrixCellsEqualBefore':True,'inheritedGates':previous['gates'],'evidence':evidence,'codeInventory':code,'report':{'path':str(report.relative_to(R)).replace('\\','/'),'sha256':sha(report)},'ownedBrowserProfiles':len(browser_receipts),'allOwnedBrowsersClosed':True,'PUBLICATION_READY':False,'publication':'NOT_EXECUTED','gitIndexSHA256':git['sha256'],'gitWrites':False,'sourcesChanged':False,'productionPointersChanged':False,'old145ProfilesTouched':False};target=E/'MANIFESTO_W28R1_ABA_UNICA_20261031.json';put(target,manifest);target.with_suffix('.sha256').write_text(sha(target)+'  '+target.name+'\n',encoding='ascii');put(E/'ENTREGA_W28R1.json',{'manifest':target.name,'sha256':sha(target),'report':str(report.relative_to(R)).replace('\\','/'),'gate':previous['gate'],'amendmentGate':gate,'workbookLayout':'single','worksheets':['respostas_31','respostas_89'],'internalURL':'http://127.0.0.1:8906/wash28r1/internal/index.html','aggregateURL':'http://127.0.0.1:8908/wash28r1/aggregate/index.html','PUBLICATION_READY':False});print('SEALED',target.name,sha(target),'one worksheet per file; 50640 responses unchanged',flush=True)
if __name__=='__main__':main()
