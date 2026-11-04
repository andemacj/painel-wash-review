# W28-R1 — leituras complementares e Excel por perfil

Candidata de revisão local derivada da W28 preservada, usando uma única base congelada e o mesmo código compartilhado. Não é publicação no Drupal.

Abra `ABRIR_INTERNO.cmd` para a operação W25, os mapas escolares W27 e os dois Excel municipais. Abra `ABRIR_AGREGADO.cmd` para a consulta agregada, sem índices ou rotas nominais. Os atalhos iniciam somente os seus serviços locais ausentes e reutilizam processos cuja propriedade conseguem comprovar. Uma porta ocupada por outro serviço produz erro; o atalho não encerra esse processo.

| Entrada | Painel | Iframe de revisão |
| --- | --- | --- |
| Interna | http://127.0.0.1:8906/wash28r1/internal/index.html | http://127.0.0.1:8907/homologacao/ |
| Agregada | http://127.0.0.1:8908/wash28r1/aggregate/index.html | http://127.0.0.1:8909/homologacao/ |

Na entrada interna, escolha estado e município na central de relatórios para baixar **31 questões estratégicas** ou **questionário completo disponível — 89 questões**. As exportações usam Geral, incluem todas as escolas elegíveis e não alteram o filtro global urbano/rural. Pendência e ausência de resposta têm representações diferentes. As seis restrições do catálogo vigente continuam aplicadas antes da leitura nominal: Q16, Q18, Q77, Q103, Q104 e Q106. Com caracterização Q16 ativa, os Excel ficam indisponíveis até a retirada explícita do filtro.

Conforme a decisão do usuário em 31/10/2026, cada arquivo escolar contém **somente uma aba**: `respostas_31` ou `respostas_89`. Os temas ficam acima das questões; a fonte, a referência, a coleta e a release ficam no cabeçalho da própria aba. Não há abas extras de dicionário, identificação, fonte ou grandes áreas. Os identificadores e as respostas permanecem na mesma matriz. Exemplos reais e os testes completos ficam em `audit/xlsx/`, fora dos dois diretórios web. A entrega anterior com várias abas está preservada no histórico nominal da emenda, em `audit/amendments/`; consulte `ENTREGA_W28R1.json` para o relatório vigente.

O catálogo das 31 questões está em `catalog/catalogo_31.md`, `.csv` e `.json`, e também no detalhe de cada questão do Diagnóstico. Ele separa semântica, campos efetivamente disponíveis e implementação: 14 relações complementares, das quais seis visualizadas e oito sem visualização. Quatro das oito têm campos ausentes na fonte adotada; outras quatro reutilizam indicadores Censo já apresentados. Não foi comprovado par equivalente nas fontes auditadas. Q16 × infraestrutura do Censo continua indisponível.

## Arquivos e limites

- `web/`: entrega interna, incluindo os índices operacionais autorizados.
- `aggregate/web/`: entrega agregada física, sem os índices e módulos nominais.
- `source/`, `tools/`, `approved_export_source/`: código, construção, serviços e QA; não integram a raiz servida.
- `private/`: oito insumos mínimos preservados para processamento local; não são servidos.
- `policy/`: matriz de capacidades e contrato dos produtos escolares.
- `contract/`: contrato W28 imutável; não altera as classificações metodológicas anteriores.
- `audit/`: evidências privadas de QA, exemplos escolares e manifests das duas entregas; não é conteúdo público.
- `drupal_embed/internal/` e `drupal_embed/aggregate/`: hosts de homologação com origens distintas e as mesmas quatro permissões originais do iframe.

O servidor interno referencia, sem copiar ou modificar, o `private/schools.sqlite` da versão `d261027_3455a1a9_006f838c` em `editorial_integracao_teste/versions/`. Esse arquivo de 164.204.544 bytes e os insumos do runtime precisam estar residentes para o respectivo recurso funcionar. Não se executa hidratação, mudança de política do OneDrive nem extração nacional. A verificação de disponibilidade e integridade ocorre antes de consultar inclusive o cache; uma falha não gera Excel parcial.

Os dois servidores usam perfis fixados no processo, raízes físicas e allowlists distintas. Mudar uma flag ou URL dentro da entrada agregada não habilita seus endpoints nominais. Ambos estão limitados a `127.0.0.1`; a sessão local protege o fluxo de mesma origem e **não é autenticação institucional**. Uma pessoa autorizada a operar esta máquina pode abrir a outra entrada local. Não há promessa de controle de identidade para uma implantação remota. A futura publicação exige destino, autorização institucional e validação efetiva de sessão, CSP, cache e iframe nesse ambiente. Não publicar esta pasta inteira: ela contém insumos e exemplos privados fora das raízes web.

## Construção e retorno

Com o ambiente já existente `C:\MSEL\venv\Scripts\python.exe`, execute `-B tools/build.py --dry-run` para conferir os insumos sem escrever. `-B tools/build.py` recompila esta mesma candidata a partir do snapshot identificado e dos geradores aprovados; não cria outra candidata, não baixa fontes nacionais e não executa Git ou publicação. Após recompilar arquivos servidos, recarregue apenas os serviços próprios em uma sessão de DEV controlada.

O retorno operacional permanece a W28 em `../comparacao_w28_teste/ABRIR_W28.cmd`. Nenhum ponteiro de produção foi alterado. A referência continua Autoavaliação até 26/10/2026, coleta de 27/10/2026 e infraestrutura Censo 2025; esta consolidação não é nova atualização de dados.
