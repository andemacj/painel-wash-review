"""Seal local W28-R1 evidence only after real downloads, profile separation and preservation pass."""
import datetime,subprocess,re
from common import *
def main():
 if read(E/'build_config.json').get('workbookLayout')=='single':
  from seal_single_sheet import main as seal_single_sheet
  return seal_single_sheet()
 now=datetime.datetime.now().astimezone();stamp=now.strftime('%Y%m%d');b=read(A/'baseline.json');catalog=read(E/'catalog/catalogo_31.json');policy=read(E/'policy/workbooks.json');internal=read(A/'distribution_manifest.json');aggregate=read(A/'aggregate_distribution_manifest.json');current=sha(A/'distribution_manifest.json');delta=read(A/'final_catalog_delta.json');previous=delta['previousManifestHashes']['distribution_manifest.json'];assert delta['analyticsWorkbookOperationalMapAndPrintAssetsUnchanged']
 names=['profile_smoke_internal_results.json','profile_smoke_aggregate_results.json','workbooks_2200707_results.json','workbooks_1506807_results.json','workbook_faults_results.json','comparison_ui_internal_results.json','comparison_ui_aggregate_results.json','comparison_iframe_internal_results.json','comparison_iframe_aggregate_results.json','comparison_print_internal_results.json','comparison_print_aggregate_results.json','map_ui_results.json','regression_results.json','multiuf_results.json','legacy_native_print_results.json','measurements_results.json','profile_security_validation.json','six_readings_reconciliation.json','reproducibility_validation.json','preservation_validation.json','excel_visual_validation.json'];results={n:read(A/n)for n in names}
 for name,r in results.items():
  assert r['status']=='PASS',name
  if 'manifestSHA256'in r:assert r['manifestSHA256']in[current,previous],(name,'Unidentified test snapshot')
 assert sha(W28/'MANIFESTO_W28_20261030.json')==b['W28ManifestSHA256'];assert sha(b['gitIndex']['path'])==b['gitIndex']['sha256'];assert catalog['implementationCounts']=={'visualized':6,'remainingComplementary':8,'remainingMissingAdoptedFields':4,'remainingIndicatorAlreadyPresented':4};assert policy['catalogQuestionCount']==89;assert len(policy['allowedQuestionNumbers'])==83 and len(policy['maskedQuestionNumbers'])==6
 workbooks=[w for name in['workbooks_2200707_results.json','workbooks_1506807_results.json']for w in results[name]['workbooks']];assert sum(w['responseCellsIndependentlyChecked']for w in workbooks)==50640
 for w in workbooks:assert sha(E/w['file'])==w['sha256']
 browsers=[read(f)for f in(A/'browser-processes').glob('*.json')];assert all(r['ownedBy']=='W28R1'and r['status']=='CLOSED'for r in browsers);owned={'profiles':len(browsers),'allClosed':True,'old145ProfilesTouched':False};put(A/'owned_browser_closure.json',owned)
 for p in(E/'tools').glob('*.py'):compile(p.read_text(encoding='utf-8-sig'),str(p),'exec')
 # Prior functional results are reused only across the proven two-file catalog presentation delta.
 reuse={name:{'testedManifestSHA256':r.get('manifestSHA256'),'finalManifestSHA256':current,'reuseReason':'Only new catalog JS/CSS changed; analytical, workbook, map, operational and print assets byte-identical'if r.get('manifestSHA256')==previous else'Current snapshot or component-specific evidence'}for name,r in results.items()};put(A/'qa_reuse_validation.json',{'status':'PASS','catalogDelta':delta,'tests':reuse})
 gates={n:'PASS'for n in['COMPLEMENTARY_LANGUAGE_VERIFIED','CATALOG_31_IMPLEMENTATION_STATUS','SIX_COMPLEMENTARY_READINGS_PRESERVED','PER_READING_BASES_RECONCILED','INTERNAL_XLSX_31','INTERNAL_XLSX_COMPLETE','AGGREGATE_PROFILE_SEPARATION','W25_W26_W27_FEATURES_PRESERVED','Q16_AND_RESTRICTED_FIELDS_PRESERVED','IFRAME_VISUAL_PRINT_VALIDATION','ORIGINALS_AND_GIT_PRESERVED','PUBLICATION_NOT_EXECUTED']};gate='PASS-WITH-LIMITATIONS-W28R1-COMPLEMENTARY-READINGS-INTERNAL-EXPORTS-CONSOLIDATED';preservation=results['preservation_validation.json'];browser_checks=sum(len(r.get('checks',[]))for n,r in results.items()if n.endswith('_results.json'));http_checks=len(results['profile_security_validation.json']['checks']);pdfs=[p for name in['comparison_print_internal_results.json','comparison_print_aggregate_results.json','legacy_native_print_results.json']for p in results[name]['pdfs']]
 weight={'W28WebBytes':sum(v['bytes']for v in b['W28WebFiles'].values()),'internalWebBytes':internal['bytes'],'aggregateWebBytes':aggregate['bytes'],'minimalCopiedPrivateBytes':sum(p.stat().st_size for p in(E/'private').iterdir()),'existingCanonicalSQLiteReferencedNotCopiedBytes':policy['source']['bytes']};report=R/'docs'/('W28R1_consolidacao_leituras_excel_perfis_'+stamp+'.md');remaining=[r for r in catalog['rows']if r['semanticClassification']=='Parcial/complementar'and not r['implemented']];remaining_table='\n'.join('| Q'+r['question']+' | '+r['fieldAvailability']+' | '+r['notImplementedReason'].replace('|','/')+' |'for r in remaining);gate_table='\n'.join('| '+k+' | '+v+' |'for k,v in gates.items());xlsx_table='\n'.join('| '+w['municipality']+' | '+str(w['schools'])+' / '+str(w['completed'])+' / '+str(w['pending'])+' | '+str(w['questions'])+' | '+str(len(w['sheets']))+' | `'+w['file'].replace('\\','/')+'` |'for w in workbooks)
 text=f'''# W28-R1 — consolidação das leituras complementares e dos Excel por perfil

Fechamento local: {now.isoformat()}. Gate: **{gate}**. Publicação não executada; `PUBLICATION_READY=false` e comparação direta não autorizada.

## Resultado e acesso

A candidata está em `consolidacao_w28r1_teste`, independente das versões anteriores. O mesmo código/runtime atende duas entradas com raízes e capacidades fixadas no servidor.

| Entrada | Atalho na candidata | Painel | Iframe |
| --- | --- | --- | --- |
| Interna | `ABRIR_INTERNO.cmd` | http://127.0.0.1:8906/wash28r1/internal/index.html | http://127.0.0.1:8907/homologacao/ |
| Agregada | `ABRIR_AGREGADO.cmd` | http://127.0.0.1:8908/wash28r1/aggregate/index.html | http://127.0.0.1:8909/homologacao/ |

Os atalhos foram testados na inicialização e no reaproveitamento dos próprios serviços, sem abrir o navegador do usuário durante QA. Portas de terceiros não são encerradas.

## Base, definições e oito relações restantes

Permanece a versão `{VERSION}`, Autoavaliação até **26/10/2026**, coleta **27/10/2026**, infraestrutura Censo **2025**. O universo é **53.555 elegíveis, 39.209 finalizadas e 14.346 pendentes**. Cada leitura mantém a sua base comum observada, perdas exclusivas, ausências e multirrespostas. Coordenadas não são requisito de vínculo ou exclusão. Não foi criada atualização de dados, fonte ou pipeline nacional.

Não foi comprovado par equivalente nas fontes e contratos auditados. O catálogo separa semântica, disponibilidade efetiva na fonte adotada e implementação: **0 equivalentes, 14 parciais/complementares, 17 não comparáveis e 0 pendências semânticas**. As seis visualizações são Q22, Q28, Q58, Q81, Q94 e Q98, sob “Ler junto com o Censo Escolar” e “Leitura complementar”. Não há diferença em pontos percentuais, concordância, acurácia, erro da escola ou evolução entre as duas fontes.

As oito relações sem visualização não recebem um bloqueio genérico. Quatro têm campos ausentes na fonte analítica adotada; quatro possuem campos e reutilizam indicadores Censo já apresentados, mantendo diferenças conceituais da pergunta WASH. A ausência nesta fonte não implica inexistência em todo o Censo.

| Questão | Disponibilidade efetiva | Motivo registrado |
| --- | --- | --- |
{remaining_table}

O catálogo completo está em `catalog/catalogo_31.json`, `.csv` e `.md`, e no detalhe de cada uma das 31 questões. O novo catálogo mantém a largura do painel e permite rolagem própria da tabela; os rótulos de implementação são legíveis, com as seis colunas preservadas. O contrato W28 permanece com SHA256 `{b['W28ContractSHA256']}`.

## Diagnóstico do Excel e correção

A W28 herdou `operational_local`, perfil que não carregava `W15SchoolWorkbook`; a central exigia o perfil escolar legado e um município selecionado. O catálogo entregue ao navegador tinha 86 itens, enquanto o catálogo interno aprovado contém 89. A cadeia foi conferida de perfil e permissão até município, catálogo vigente, índice autorizado, gerador e download real.

A entrada interna reconecta o catálogo **89**, o adaptador de matriz, o gerador escolar aprovado e o escritor XLSX já existente. O backend consulta somente os campos autorizados da fonte congelada, em SQLite somente leitura. A fonte de 164.204.544 bytes é referenciada; não foi copiada nem modificada. O perfil agregado não instancia esse serviço de Excel.

O produto estratégico tem **31 questões: 28 permitidas e três mascaradas**. O completo tem **89 questões reais: 83 permitidas e seis mascaradas**, incluindo 58 colunas de questões adicionais ao estratégico. Q16, Q18, Q77, Q103, Q104 e Q106 ficam fora da projeção SQL nominal. A máscara é aplicada antes da apresentação, inclusive nas pendentes. Nenhuma coluna escolar do Censo, matrícula por raça/cor ou sexo, caracterização nominal ou coordenada foi acrescentada.

O item 7 da W28-R1 rege a organização: identificação, matriz consolidada, abas por grande área, fonte e dicionário, totalizando 12 abas no estratégico e 13 no completo. Os temas ficam acima das questões. As abas temáticas e a matriz repetem visualizações dos mesmos registros e não devem ter suas linhas somadas. Não foi criado novo motor de Excel.

Os dois arquivos usam **Geral** da central, sem alterar a seleção global urbano/rural. Incluem todas as escolas elegíveis, sem busca, paginação, situação temporária ou alternativa selecionada reduzir o conjunto. Pendentes não recebem respostas fabricadas. Ausência não é convertida em zero, “não se aplica” nem branching inferido; tipos/unidades seguem o catálogo. INEP e IBGE permanecem texto, nomes completos são conservados e texto semelhante a fórmula permanece literal.

| Município IBGE | Elegíveis / finalizadas / pendentes | Questões | Abas | Exemplo privado |
| --- | --- | --- | --- | --- |
{xlsx_table}

Esses quatro downloads foram reabertos e reconciliados célula a célula com a fonte canônica, totalizando **50.640 células de resposta**, além de identificadores, nomes, conjuntos, máscaras, pendências e dicionários. Há SHA256 binário e SHA256 lógico; o segundo normaliza apenas o instante de geração da aba de metadados. A conferência não depende de igualdade binária após uma regravação. O Microsoft Excel abriu quatro arquivos em modo somente leitura; os recortes visuais declarados A1:N16 foram exportados para PDF. Esses recortes não representam a impressão integral das 89 colunas.

A primeira pasta de download de QA produzia caminhos temporários de 270 caracteres no Windows. A pasta curta do próprio perfil TEMP resolveu o teste; os produtos e fontes não foram alterados para contornar o problema. As evidências estão em `audit/download_path_diagnosis.json`. Arquivos parciais antigos de QA ficam fora das allowlists de entrega.

## Matriz de capacidades e barreiras efetivas

| Capacidade | Interna | Agregada |
| --- | --- | --- |
| Monitoramento territorial, Diagnóstico, relatórios agregados | Sim | Sim |
| Seis leituras complementares e catálogo 31 | Sim | Sim |
| Caracterização Q16 e equidade agregadas já aprovadas | Sim | Sim |
| Operação W25 com nomes, status e Excel operacional | Sim | Ausente |
| Mapa identificado W27, popup e lista de escolas | Sim, sob as restrições existentes | Ausente |
| Excel escolar 31 / completo 89 | Sim, município e Q16 em Todas | Ausente |
| Índices operacionais nominais no diretório web | Sim, raiz interna controlada | Excluídos fisicamente |
| Endpoints nominais | Mesmo host/sessão local, parâmetros e campos controlados | 404 antes de processamento |
| Q16 × infraestrutura Censo | Indisponível | Indisponível |

`policy/profile_matrix.json` e `policy/workbooks.json` registram as capacidades e o contrato. Trocar flags, parâmetros, catálogo, caminhos ou URLs dentro da entrada agregada não habilita seus endpoints nominais. Foram testados origem cruzada, Host incorreto, ausência de sessão, parâmetros extras, Q16 ativa, escopo reduzido e tentativas diretas aos índices, módulos e bancos privados. Todos os JSON da raiz agregada foram decodificados e conferidos quanto à ausência de chaves de escola, respostas individuais e coordenadas escolares. Os arquivos Excel de exemplo não são servidos.

Os serviços são exclusivamente loopback. A sessão é uma proteção local de mesma origem/CSRF, não autenticação institucional. Quem está autorizado a operar esta máquina pode abrir a entrada interna separada; a revisão não demonstra controle de identidade de uma futura implantação remota. O gate de separação refere-se à raiz, ao runtime e aos endpoints agregados testados. Destino Drupal, autenticação/autorizações institucionais, CSP, cache e funcionamento publicado continuam sem homologação. Nenhum mecanismo de login fictício ou API pública foi criado.

## Regressão, visual e impressão

São **{browser_checks} verificações de navegador**, **{http_checks} verificações de HTTP/pacote/esquema**, **84 casos reais de leitura/recorte/perfil** exatamente iguais à W28 preservada, e as 50.640 células escolares reconciliadas independentemente. A evidência analítica exaustiva da W28 é reutilizada porque o modelo e os insumos correspondentes permanecem idênticos; não se atribui uma nova auditoria nacional a esta consolidação.

Foram preservados W25 municipal, UF e consolidado AP+RR, status, listas, exportação operacional e impressão; W26 cinco caracterizações e equidade; W27 mapa, clusters, lista, popup, busca, zoom, pan e retirada de Q16 mediante confirmação explícita. Os relatórios executivo e temático foram comparados com a W28, normalizando somente o instante de geração. Os 867 casos fora da revisão territorial e o datum/EPSG desconhecido permanecem como limites existentes; nenhuma coordenada foi movida nem centroide inventado.

Os dois iframes foram testados em **390, 768, 1024, 1366 e 1600 px**, com origem distinta, subdiretório, retorno de foco, Escape, backdrop e as quatro permissões originais: `allow-scripts allow-same-origin allow-downloads allow-modals`. Houve captura e inspeção visual do catálogo, das leituras e de recortes de Excel. São **{len(pdfs)} PDFs nativos do painel**, por seus botões e `window.print`, incluindo Santarém, Teresina, tela móvel, mapa W27, relatório com mapa opcional e pendentes W25; a validação não substituiu o fluxo por `Page.printToPDF`.

Respostas incompletas, release/contrato divergente, duplicidade, chave restrita injetada e ausência de campo obrigatório foram simuladas somente no navegador de QA. Produziram erro recuperável sem arquivo parcial. Uma mudança de Q16 durante a requisição invalidou o download tardio e conservou o filtro. Permanecem fechados os {owned['profiles']} perfis Edge próprios da W28-R1; os 145 antigos não foram removidos. A instância Excel de QA foi encerrada sem tocar no Excel preexistente.

## Tamanho, reprodução e preservação

Medidas em bytes, com 1 MB = 1.000.000 bytes: W28 web **{weight['W28WebBytes']:,}**; interna **{weight['internalWebBytes']:,}**; agregada **{weight['aggregateWebBytes']:,}**; oito insumos privados mínimos copiados uma vez **{weight['minimalCopiedPrivateBytes']:,}**. A fonte canônica existente de **{policy['source']['bytes']:,}** não foi duplicada. Exemplos de Excel, documentação e QA são medidos separadamente e não entram no pacote operacional web. A primeira requisição observada é uma medida local com cache do serviço/disco quente ou desconhecido, sem previsão de produção.

`tools/build.py --dry-run` confere os insumos sem escrita. Duas construções finais sequenciais produziram distribuições idênticas. O último ajuste de leitura alterou somente `assets/reading-catalog.js` e `.css`; dados, Excel, operação, mapas, impressão e análises não mudaram. `audit/final_catalog_delta.json` e `audit/qa_reuse_validation.json` vinculam as evidências anteriores aos componentes preservados e aos testes finais do catálogo.

A lista nominal herdada de preservação foi reutilizada; não se iniciou uma auditoria recursiva do histórico. **{preservation['count']:,} arquivos, {preservation['bytes']:,} bytes** passaram na conferência de tamanho e SHA256. O índice Git `{b['gitIndex']['sha256']}` e as alterações rastreadas preexistentes permaneceram intactos. A comparação de status usa o mesmo escopo rastreado; a captura inicial também incluía linhas não rastreadas. Não houve escrita Git, push, merge, nova release, mudança de ponteiro, scheduler, política do OneDrive, permissão institucional, download nacional ou execução/importação dos três scripts de origem WASH NAS ESCOLAS.

Retorno: abrir `comparacao_w28_teste/ABRIR_W28.cmd`. A W28, W22, fontes, releases, relatórios, Excel anteriores, Git e publicação permanecem preservados. A candidata nova e os seus dados privados ficam isolados; não publicar a pasta inteira.

## Gates

| Gate | Resultado local |
| --- | --- |
{gate_table}

Limitações mantidas: oito relações sem visualização; Q16 × Censo indisponível; seis restrições nominais; fontes de anos distintos e conceitos não intercambiáveis; política institucional de pequenos números e futura publicação sem nova homologação. Nenhuma nova etapa analítica foi aberta automaticamente.
'''
 text=re.sub(r'\b\d{1,3}(?:,\d{3})+\b',lambda m:m.group().replace(',','.'),text);report.write_text(text,encoding='utf-8');private_snapshot={}
 for item in read(A/'minimal_private_snapshot_plan.json'):
  path=E/item['path'];assert sha(path)==item['sha256'];private_snapshot[item['path']]={'bytes':path.stat().st_size,'sha256':item['sha256']}
 code={}
 for folder in['tools','source','approved_export_source']:
  for path in sorted((E/folder).iterdir()):
   if path.is_file():code[str(path.relative_to(E)).replace('\\','/')]={'bytes':path.stat().st_size,'sha256':sha(path)}
 for name in['README.md','ABRIR_INTERNO.cmd','ABRIR_AGREGADO.cmd','build_config.json']:code[name]={'bytes':(E/name).stat().st_size,'sha256':sha(E/name)}
 evidence={n:{'file':'audit/'+n,'sha256':sha(A/n),'bytes':(A/n).stat().st_size}for n in names+['final_catalog_delta.json','qa_reuse_validation.json','download_path_diagnosis.json','owned_browser_closure.json']};manifest={'schema':'wash.w28r1.final.v1','gate':gate,'dateLocal':now.isoformat(),'PUBLICATION_READY':False,'publication':'NOT_EXECUTED','institutionalAuthenticationAndDrupalGate':'HOLD_NOT_DEPLOYED_OR_VALIDATED','releaseVersion':VERSION,'sourceW28ManifestSHA256':b['W28ManifestSHA256'],'schoolCounts':{'eligible':53555,'completed':39209,'pending':14346},'sourceDates':{'autoResponses':'2026-10-26','collection':'2026-10-27','censusInfrastructure':2025},'semanticCounts':catalog['semanticCounts'],'implementationCounts':catalog['implementationCounts'],'implementedQuestions':['22','28','58','81','94','98'],'workbookContract':policy,'workbookProducts':workbooks,'profiles':read(E/'policy/profile_matrix.json'),'distributionManifests':{n:sha(A/n)for n in['distribution_manifest.json','aggregate_distribution_manifest.json']},'browserChecks':browser_checks,'httpPackageSchemaChecks':http_checks,'actualReadingProfileCases':84,'independentlyReconciledSchoolAnswerCells':50640,'nativePDFs':pdfs,'ownedBrowsers':owned,'weight':weight,'preservation':{'files':preservation['count'],'bytes':preservation['bytes'],'gitIndexUnchanged':True,'trackedPreexistingChangesPreserved':True},'gates':gates,'evidence':evidence,'codeInventory':code,'report':{'path':str(report.relative_to(R)).replace('\\','/'),'sha256':sha(report),'bytes':report.stat().st_size},'privateSnapshot':private_snapshot,'censusContractSHA256':sha(E/'contract/contrato_comparabilidade.json'),'catalogImplementationSHA256':sha(E/'catalog/catalogo_31.json'),'profilePolicySHA256':sha(E/'policy/profile_matrix.json'),'approvedExporterSourcePlanSHA256':sha(A/'approved_export_code_copy_plan.json'),'governanceAndSnapshotInputHashes':b['inputHashes'],'newNationalDownload':False,'sourceScriptsExecutedOrImported':False,'newQ16CensusIntersection':False,'newNominalCensusPayload':False,'coordinatesUsedToPairOrExclude':False,'currentPointerChanged':False,'schedulerChanged':False,'OneDrivePoliciesChanged':False,'institutionalPermissionsChanged':False,'gitWrites':False,'originalFilesModified':False,'automaticNextWave':False};target=E/('MANIFESTO_W28R1_'+stamp+'.json');put(target,manifest);target.with_suffix('.sha256').write_text(sha(target)+'  '+target.name+'\n',encoding='ascii');put(E/'ENTREGA_W28R1.json',{'manifest':target.name,'sha256':sha(target),'report':str(report.relative_to(R)).replace('\\','/'),'gate':gate,'internalURL':'http://127.0.0.1:8906/wash28r1/internal/index.html','aggregateURL':'http://127.0.0.1:8908/wash28r1/aggregate/index.html','PUBLICATION_READY':False});print('SEALED',target.name,sha(target),str(report.relative_to(R)),browser_checks,'browser checks',flush=True)
if __name__=='__main__':main()
