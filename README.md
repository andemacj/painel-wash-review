# Painel WASH — W28-R1

Versão atual: https://andemacj.github.io/painel-wash-review/current/ .

Ao clicar em um município no mapa ou na lista, o acompanhamento mostra nominalmente as escolas elegíveis, com abas Todas, Finalizadas e Pendentes. Os números da lista são reconciliados com os indicadores municipais da mesma base. Estão disponíveis busca, ordenação, paginação, impressão do acompanhamento completo e exportação operacional da lista.

A correção de 04/11/2026 restaura o módulo W25 que havia sido omitido na publicação agregada. A identificação institucional inclui apenas INEP, nome, IBGE, UF, área e situação. Não foram adicionados dados de pessoas, contatos, respostas individuais, vínculos Q16, matrículas, coordenadas ou datas individuais. Pendente significa elegível sem finalização; não prova que a escola nunca iniciou.

O monitoramento, diagnóstico estratégico, equidade consolidada, relatórios territoriais e CSV agregados continuam disponíveis. Mapas escolares por resposta, recortes Q16 e consultas dinâmicas WASH–Censo continuam dependentes do servidor da versão completa. O Excel operacional de acompanhamento é um produto distinto dos Excel de respostas_31/respostas_89.

Respostas até 26/10/2026, coleta de 27/10/2026, Censo 2025. A correção não atualiza a base, não altera a candidata local nem seus selos e não publica no Drupal. O código original está em revisoes/w28r1/; a autorização desta correção se limita ao acompanhamento escolar solicitado pelo usuário.

## Excel de respostas restaurados em 11/11/2026

Na central de relatórios, escolha estado e município para baixar os arquivos de 31 ou 89 questões. Cada arquivo tem uma única aba, `respostas_31` ou `respostas_89`, com temas acima das questões. A exportação usa Geral e todas as escolas elegíveis do município, mantendo inalterado o filtro global de área. Pendentes permanecem sem respostas fabricadas. As seis questões Q16, Q18, Q77, Q103, Q104 e Q106 permanecem mascaradas; seus valores não integram os arquivos de dados públicos. Foram restauradas também as três descrições restritas ausentes do catálogo agregado, para preservar exatamente 89 colunas de questões. Não foram acrescentados campos de Censo, dados de pessoas, vínculos Q16 ou coordenadas. A base continua em 26/10/2026, coletada em 27/10/2026.
