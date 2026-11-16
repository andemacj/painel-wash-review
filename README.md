# Painéis WASH

Versão atual: https://andemacj.github.io/painel-wash-review/current/ .

Ao clicar em um município no mapa ou na lista, o acompanhamento mostra nominalmente as escolas elegíveis, com abas Todas, Finalizadas e Pendentes. Os números da lista são reconciliados com os indicadores municipais da mesma base. Estão disponíveis busca, ordenação, paginação, impressão do acompanhamento completo e exportação operacional da lista.

A correção de 04/11/2026 restaura o módulo W25 que havia sido omitido na publicação agregada. A identificação institucional inclui apenas INEP, nome, IBGE, UF, área e situação. Não foram adicionados dados de pessoas, contatos, respostas individuais, vínculos Q16, matrículas, coordenadas ou datas individuais. Pendente significa elegível sem finalização; não prova que a escola nunca iniciou.

O monitoramento, diagnóstico estratégico, equidade consolidada, relatórios territoriais e CSV agregados continuam disponíveis. Mapas escolares por resposta, recortes Q16 e consultas dinâmicas WASH–Censo continuam dependentes do servidor da versão completa. O Excel operacional de acompanhamento é um produto distinto dos Excel de respostas_31/respostas_89.

Respostas até 26/10/2026, coleta de 27/10/2026, Censo 2025. A correção não atualiza a base, não altera a candidata local nem seus selos e não publica no Drupal. O código original está em revisoes/w28r1/; a autorização desta correção se limita ao acompanhamento escolar solicitado pelo usuário.

## Excel de respostas restaurados em 11/11/2026

Na central de relatórios, escolha estado e município para baixar os arquivos de 31 ou 89 questões. Cada arquivo tem uma única aba, `respostas_31` ou `respostas_89`, com temas acima das questões. A exportação usa Geral e todas as escolas elegíveis do município, mantendo inalterado o filtro global de área. Pendentes permanecem sem respostas fabricadas. As seis questões Q16, Q18, Q77, Q103, Q104 e Q106 permanecem mascaradas; seus valores não integram os arquivos de dados públicos. Foram restauradas também as três descrições restritas ausentes do catálogo agregado, para preservar exatamente 89 colunas de questões. Não foram acrescentados campos de Censo, dados de pessoas, vínculos Q16 ou coordenadas. A base continua em 26/10/2026, coletada em 27/10/2026.


## Painel reduzido municipal · W29

[Abrir o painel municipal](https://andemacj.github.io/painel-wash-review/compacto/) · [Baixar o HTML integral para Drupal](https://andemacj.github.io/painel-wash-review/compacto/baixar.html) · [Proveniência](compacto/version.json).

Correção de 16/11/2026: o produto correto é a devolutiva municipal do arquivo `painel_devolutiva_municipal/entrega/html_unico_20261113/index.html`, de 116.092.565 bytes. Permite selecionar município, ver os nomes das escolas, alternar Finalizadas/Pendentes, emitir o relatório nominal e acessar diagnóstico, mapa e Excel de 31/89 questões.

O arquivo original é preservado, com SHA256 `4861a00cdfecb7e10402ac58eb6f37c55abcae4932baf74d9c6c65b020cdd212`. No site GitHub, a interface abre primeiro e carrega os dados somente do município selecionado; não baixa o pacote nacional. O gzip integral fica reservado ao download do arquivo único para Drupal. Para Drupal, o link de download produz exatamente o HTML original único; a edição web modular não é a entrega Drupal. A base permanece com respostas até 26/10/2026, coletadas em 27/10/2026.

Em 15/11/2026 a edição territorial W22-R1 foi publicada equivocadamente como reduzida. Essa origem foi separada como [referência histórica](historico/w22-r1/README.md). A versão territorial W28-R1 e o endereço `/current/` foram preservados.
