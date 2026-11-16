# Devolutiva municipal WASH — site GitHub

[Abrir o painel](https://andemacj.github.io/painel-wash-review/compacto/) · [Baixar o HTML único para Drupal](https://andemacj.github.io/painel-wash-review/compacto/baixar.html) · [Painel completo](https://andemacj.github.io/painel-wash-review/current/#monitoramento)

O site abre a interface e a lista de municípios primeiro. Ao selecionar um município, baixa somente sua parte básica, com todas as escolas, status e diagnóstico. Mapas, matrículas, leituras complementares e Excel carregam a parte detalhada desse município quando necessária. Não há download inicial do HTML de 116 MB nem do pacote nacional de 87 MB.

Reutiliza exatamente a base municipal W29 d261027_3455a1a9_006f838c: respostas até 26/10/2026, coletadas em 27/10/2026. Não recalcula indicadores, não atualiza a base e preserva as regras e restrições aprovadas, inclusive as seis questões mascaradas no Excel. Cada Excel tem uma única aba, respostas_31 ou respostas_89.

Os arquivos data/4a3e563bd4b6/<IBGE>/base.json.gz e detail.json.gz são o conteúdo gzip original das partições municipais seladas, retirado do invólucro JavaScript/base64. Todos os 4.554 conteúdos foram conferidos pelo manifesto de origem. A interface e os renderizadores aprovados foram preservados; mudou apenas o carregamento e o aviso de identificação do site.

Para Drupal, baixar.html continua entregando o HTML único original de 116.092.565 bytes, SHA256 4861a00cdfecb7e10402ac58eb6f37c55abcae4932baf74d9c6c65b020cdd212. O index.html deste site é a edição web e usa as partições; não é a entrega Drupal.

O painel territorial completo permanece em /current/. A publicação GitHub não afirma homologação institucional nem publicação em Drupal.
