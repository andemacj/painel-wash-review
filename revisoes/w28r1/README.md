# W28-R1 — código da entrega local consolidada

Sincronização de código em 04/11/2026. Origem: candidata local concluída em 31/10/2026, identificada pelo selo em `SOURCE_REVIEW.json`.

Os dois Excel de respostas escolares contêm exatamente uma aba por arquivo: `respostas_31` ou `respostas_89`. Os temas ficam acima das questões. Fonte, referência, coleta e release ficam no cabeçalho da mesma aba. A conferência local comparou 50.640 células de resposta e reabriu quatro arquivos no Microsoft Excel, sem diferenças na matriz anterior.

## Conteúdo

- `source/`: módulos legíveis da interface, mapas, equidade, leituras complementares e relatórios.
- `approved_export_source/`: geradores de origem preservados; o modo vigente é `single` em `build_config.json`.
- `tools/`: construção, servidores locais e verificações da candidata.
- `runtime/internal/` e `runtime/aggregate/`: HTML, JavaScript e CSS efetivamente compilados, separados por perfil.
- `README_LOCAL_ORIGINAL.md`: instruções originais preservadas do ambiente local.
- `SOURCE_REVIEW.json`: hashes e síntese de validação sem bases privadas.

## Execução e dados

Este diretório registra o código para revisão. Não contém os dados exigidos para executar os atalhos ou abrir os HTML como um painel funcional. A construção usa dependências do workspace governado e os insumos locais autorizados; este snapshot não é uma instalação autônoma.

Não fazem parte desta sincronização: SQLite, respostas por escola, índices nominais/operacionais, dados Q16, arquivos Excel, relatórios de escolas, perfis de navegador, logs, caches, credenciais, fontes nacionais ou cópias de releases. Os caminhos locais eventualmente presentes nas ferramentas e no README original são referências de desenvolvimento e não destinos publicados.

A base da candidata permanece congelada: Autoavaliação até 26/10/2026, coleta de 27/10/2026, infraestrutura Censo 2025. Sincronizar o código não representa atualização de dados nem homologação institucional. O ambiente Drupal não foi publicado por esta operação.

O painel W14A anteriormente publicado na raiz do repositório permanece como entrega histórica. Seus arquivos e sua base não são substituídos por este registro de código.
