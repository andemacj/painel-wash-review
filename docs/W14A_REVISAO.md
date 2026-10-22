# W14A — painel WASH para revisão da equipe

VERSÃO DE TESTE. Dados preliminares sujeitos a revisão. Esta entrega é um retrato estático da base aprovada de 13/10/2026 e não substitui o painel oficial.

O repositório dedicado é `andemacj/painel-wash-review`. A publicação usa GitHub Pages, branch `main`, diretório raiz `/`, sem dependências instaladas ou bibliotecas externas. A hospedagem é pública e não possui autenticação.

## Conteúdo

- Monitoramento: meta de 90%, elegíveis, finalizadas, pendentes, cobertura, categorias municipais, ordenação, mapa, filtros e CSV municipal agregado.
- Diagnóstico: oito temas, 31 questões, Geral/Urbana/Rural, contagens, percentuais, bases, distribuições e downloads agregados. Q28 mantém multirresposta; Q65 mantém categorias completas.
- Metodologia: fontes, cobertura, denominadores, interpretação, recortes e limitações.
- Relatório municipal: resumo executivo, destaques, resultados das 31 questões, Geral/Urbana/Rural e metodologia. A impressão do navegador permite salvar em PDF.

Não há lista nominal de escolas, respostas individuais, ficha de escola, matriz escolar, filtro nominal por resposta, RAW, parquet, credenciais ou histórico de execução. Clicar em uma alternativa abre somente o detalhe agregado da questão.

## Validação e limitações

Os JSONs usam um dicionário comum para reduzir a repetição de chaves e textos. A reconstrução foi comparada exatamente com todos os 2.300 arquivos agregados da fonte: não há arredondamento novo, mudança de denominadores ou preenchimento de ausências.

Foram verificados os caminhos relativos, assets, JSONs, os destinos de leitura, HTML, CSS e a sintaxe dos seis arquivos JavaScript. Foram executadas 3.808 verificações em JavaScript nativo, com DOM e requisições simulados, cobrindo modelos, filtros, temas, downloads e relatório. Esses testes não equivalem a uma revisão visual em navegador. Não foi usado navegador automatizado.

As quatro páginas têm faixa VERSÃO DE TESTE, `noindex,nofollow` e `robots.txt`. Essas medidas não tornam o site privado nem garantem ausência de indexação.

Os focos destacados e a política de pequenos números ainda aguardam homologação. Considerar sempre a base válida. Os resultados descrevem declarações das escolas; não são inspeção técnica, score ou inferência causal. A origem temporal consta no painel e no manifesto.

O pacote preserva o layout atual e não implementa os novos produtos da reunião de 19/10. O backlog correspondente está em `W14_BACKLOG_POS_REUNIAO_WASH_20261019.md`.
