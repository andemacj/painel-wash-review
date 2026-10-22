/* Shared release configuration and pure readers of the W7A contract. No data is rewritten. */
window.WASH_PREVIEW_CONFIG = Object.freeze({
  releaseId: 'd261013_a6842249',
  releaseBase: 'data',
  internalValidation: false
});

(() => {
  'use strict';
  const scopes = Object.freeze(['all', 'urban', 'rural']);
  const labels = Object.freeze({ all: 'Geral', urban: 'Urbana', rural: 'Rural' });
  const universe = 'Universo Selo UNICEF';
  const reference = 'Referência Selo UNICEF';
  const description = 'Escolas elegíveis dos municípios participantes do Selo UNICEF incluídas na Autoavaliação WASH.';
  const referenceNote = 'A referência corresponde às escolas elegíveis dos municípios participantes do Selo UNICEF incluídas nesta edição. Não representa o conjunto de todas as escolas brasileiras.';
  const focusNote = 'Para permitir comparações consistentes, determinadas questões utilizam uma resposta previamente destacada. Essa definição está em revisão com a equipe WASH. A distribuição completa das respostas continua disponível.';
  const multiNote = 'Uma escola pode selecionar mais de uma opção; por isso, os percentuais podem somar mais de 100%.';
  const smallNote = 'VERSÃO DE TESTE. Dados preliminares sujeitos a revisão. Considere o n válido e as limitações dos agregados com pequeno número de observações; a política de pequenos números ainda não foi homologada.';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const valid = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const num = v => valid(v) ? Number(v) : null;
  const fmt = v => valid(v) ? Number(v).toLocaleString('pt-BR') : '—';
  const pct = v => valid(v) ? Number(v).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 2}) + '%' : '—';
  const pp = v => valid(v) ? (v > 0 ? '+' : '') + Number(v).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + ' p.p.' : '—';
  const date = v => /^\d{4}-\d{2}-\d{2}/.test(v || '') ? v.slice(0, 10).split('-').reverse().join('/') : '—';
  const semantics = Object.freeze({
    POSITIVE_DIRECT: {label: 'Condição declarada', caution: 'A resposta informa a existência ou disponibilidade declarada. Não mede a qualidade do serviço.'},
    NEGATIVE_DIRECT: {label: 'Condição que pede atenção', caution: 'Uma diferença positiva representa maior ocorrência relatada, não melhora.'},
    PERCEPTION: {label: 'Percepção declarada', caution: 'Diferença entre as declarações das escolas urbanas e rurais. Não equivale a uma verificação técnica das condições.'},
    CONTEXT: {label: 'Contexto', caution: 'Esta questão descreve o contexto da escola e não representa desempenho.'},
    RISK_EXPOSURE: {label: 'Exposição / contexto de risco', caution: 'Esta questão representa contexto ou exposição declarada e não desempenho da escola.'},
    MULTI_RESPONSE: {label: 'Multirresposta', caution: multiNote},
    DESCRIPTIVE: {label: 'Distribuição categórica', caution: 'Nenhuma categoria foi adotada como referência única de comparação nesta versão.'}
  });
  function normalize(payload, scope = 'all') {
    if (!payload?.territory || !scopes.every(s => Array.isArray(payload.scopes?.[s]?.questions))) throw new Error('Dados do território indisponíveis.');
    const t = payload.territory;
    return {...payload, scope: t.type, uf: t.uf || (t.type === 'UF' ? t.code : ''), ibge: t.ibge || '', municipality: t.label,
      coverage: payload.scopes[scope].coverage, questions: new Map(payload.scopes[scope].questions.map(q => [String(q.question_number), q]))};
  }
  function aggregate(data, number, scope = 'all') {
    return data?.scopes?.[scope]?.questions.find(q => String(q.question_number) === String(number));
  }
  function model(question, data, scope = 'all', refData = null) {
    const number = String(question.question_number);
    const a = aggregate(data, number, scope);
    const comparable = question.comparison_eligible === true && question.focus_response_value != null;
    const options = (a?.options || []).map(o => ({label: o.label, count: num(o.count), pct: a.n_valid > 0 ? num(o.pct_valid) : null, present: true}));
    const original = comparable ? options.find(o => o.label === question.focus_response_value) : null;
    const focus = {label: comparable ? question.focus_response_label : '', value: comparable ? question.focus_response_value : null,
      count: original ? num(a.focus_response_count) : null, pct: original && a.n_valid > 0 ? num(a.focus_response_pct) : null, present: Boolean(original)};
    const series = scopes.map(key => {
      const item = aggregate(data, number, key);
      return {scope: key, label: labels[key], pct: comparable && item?.n_valid > 0 ? num(item.focus_response_pct) : null,
        count: comparable ? num(item?.focus_response_count) : null, nValid: num(item?.n_valid), eligible: num(item?.n_eligible)};
    });
    const ref = aggregate(refData, number, scope);
    const refPct = comparable && ref?.n_valid > 0 ? num(ref.focus_response_pct) : null;
    const gap = comparable && series[1].pct !== null && series[2].pct !== null ? Number((series[1].pct - series[2].pct).toFixed(4)) : null;
    return {number, question, data, scope, aggregate: a, comparable, semantic: question.semantic_interpretation, options, focus, series, gap,
      nValid: num(a?.n_valid), missing: num(a?.n_missing), nCompleted: num(a?.n_completed), nEligible: num(a?.n_eligible), refPct,
      difference: focus.pct !== null && refPct !== null ? Number((focus.pct - refPct).toFixed(4)) : null,
      multi: question.multi_response, binary: question.response_type === 'binária'};
  }
  function dots(series, selected = 'all', gap = null, coverage = false) {
    const text = series.map(s => s.label + ': ' + (s.pct === null ? (coverage && s.eligible === 0 ? 'Não há escolas elegíveis neste recorte' : 'Sem respostas válidas') : pct(s.pct)) + ', ' + fmt(s.count) + ' de ' + fmt(coverage ? s.eligible : s.nValid)).join('; ');
    return '<div class="wash-mini" role="group" aria-label="' + esc(text) + '"><div class="wash-mini-axis" aria-hidden="true"><span>0%</span><span>100%</span>' +
      series.filter(s => s.pct !== null).map((s, i) => '<i class="wash-marker wash-marker--' + s.scope + (s.scope === selected ? ' is-current' : '') + '" style="left:' + Math.max(0, Math.min(100, s.pct)) + '%;top:' + (14 + i * 4) + 'px">' + ({all:'G',urban:'U',rural:'R'}[s.scope]) + '</i>').join('') + '</div><div class="wash-mini-values">' +
      series.map(s => '<span class="' + (s.scope === selected ? 'is-current' : '') + '"><b>' + s.label + '</b> ' + pct(s.pct) + (coverage ? '<small>' + fmt(s.count) + '/' + fmt(s.eligible) + '</small>' : '') + '</span>').join('') + '</div>' +
      (gap !== null ? '<p class="wash-mini-gap">Diferença Urbana–Rural: ' + pp(gap) + '</p>' : '') + '</div>';
  }
  function coverageSeries(data) {
    return scopes.map(scope => {const c = data.scopes[scope].coverage; return {scope, label: labels[scope], pct: num(c.coverage_pct), count: c.completed_schools, eligible: c.eligible_schools};});
  }
  function scopeTable(m) {
    const rows = m.comparable ? m.series.map(s => '<tr class="' + (s.scope === m.scope ? 'is-current' : '') + '"><th scope="row">' + s.label + '</th><td>' + pct(s.pct) + '</td><td>' + fmt(s.count) + '</td><td>' + fmt(s.nValid) + '</td></tr>').join('') :
      m.options.map(o => '<tr><th scope="row">' + esc(o.label) + '</th>' + scopes.map(scope => {
        const a = aggregate(m.data, m.number, scope), v = a?.options.find(item => item.label === o.label);
        return '<td class="' + (scope === m.scope ? 'is-current' : '') + '">' + pct(a?.n_valid > 0 ? v?.pct_valid : null) + ' · ' + fmt(v?.count) + '/' + fmt(a?.n_valid) + '</td>';
      }).join('') + '</tr>').join('');
    return '<div class="wash-scope-table-wrap"><table class="wash-scope-table"><caption>Geral × Urbana × Rural · Q' + m.number + (m.comparable ? ' · Resposta: ' + esc(m.focus.label) : ' · Percentual, quantidade/n válido') + '</caption><thead><tr>' +
      (m.comparable ? '<th scope="col">Área</th><th scope="col">Percentual</th><th scope="col">Quantidade</th><th scope="col">n válido</th>' : '<th scope="col">Alternativa</th>' + scopes.map(s=>'<th scope="col">' + labels[s] + '</th>').join('')) + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function csvCell(value) {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }
  const csv = rows => '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  function download(filename, content) {
    const url = URL.createObjectURL(new Blob([content], {type: 'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.WASH_PREVIEW_DATA = Object.freeze({scopes, labels, universe, reference, description, referenceNote, focusNote, multiNote, smallNote, semantics,
    esc, num, fmt, pct, pp, date, normalize, aggregate, model, dots, coverageSeries, scopeTable, csvCell, csv, download});
})();

window.WASH_PREVIEW_THEMES = [
    {
      id: 'contexto-apoio', title: 'Contexto e apoio à escola', order: 1, icon: 'school',
      subtitle: 'Participação em programas de apoio à escola.',
      context: 'O acesso ao apoio institucional compõe o contexto da escola e não representa suas condições de WASH.',
      question_numbers: [19], highlights: [19],
      questions: {
        19: { short: 'Apoio do PDDE', statement: 'informaram já ter sido beneficiadas por alguma modalidade do PDDE' },
      },
    },
    {
      id: 'abastecimento-agua', title: 'Abastecimento de água', order: 2, icon: 'water',
      subtitle: 'Disponibilidade, continuidade, fontes e armazenamento de água nas escolas.',
      context: 'Observe separadamente o acesso à água, a continuidade do abastecimento e o armazenamento. As fontes de água admitem múltiplas respostas.',
      question_numbers: [22, 23, 28, 40, 43, 50, 58], highlights: [22, 23, 28, 40, 43],
      questions: {
        22: { short: 'Distribuição interna de água encanada', statement: 'informaram possuir água encanada e pontos disponíveis em vários ambientes' },
        23: { short: 'Abastecimento diário', statement: 'informaram ter abastecimento diário de água' },
        28: { short: 'Fontes da água utilizada para beber', statement: 'informaram suas fontes de água para beber' },
        40: { short: 'Reservatório de água', statement: 'informaram possuir reservatório de água' },
        43: { short: 'Limpeza do reservatório', statement: 'informaram limpar o reservatório a cada seis meses ou menos' },
        50: { short: 'Falta de energia recorrente', statement: 'relataram episódios recorrentes de falta de energia' },
        58: { short: 'Falta de água no semestre', statement: 'relataram falta de água para limpeza, lavagem das mãos e outras atividades no último semestre' },
      },
    },
    {
      id: 'residuos-solidos', title: 'Manejo de resíduos sólidos', order: 3, icon: 'recycle',
      subtitle: 'Destinação, coleta e armazenamento dos resíduos nas escolas.',
      context: 'A destinação dos resíduos descreve o serviço disponível. As avaliações sobre coleta e armazenamento expressam percepção declarada.',
      question_numbers: [65, 68, 69], highlights: [65, 68, 69],
      questions: {
        65: { short: 'Destinação dos resíduos', statement: 'informaram as formas de destinação dos resíduos' },
        68: { short: 'Periodicidade da coleta', statement: 'declararam considerar a periodicidade da coleta adequada às necessidades da escola' },
        69: { short: 'Armazenamento dos resíduos', statement: 'declararam considerar adequado o espaço de armazenamento dos resíduos antes da coleta' },
      },
    },
    {
      id: 'esgotamento-sanitario', title: 'Esgotamento e condições sanitárias', order: 4, icon: 'sanitation',
      subtitle: 'Infraestrutura sanitária, privacidade, higiene e situações de risco.',
      context: 'Infraestrutura e percepção são leituras distintas. O relato de esgoto a céu aberto pede atenção e conserva a resposta original.',
      question_numbers: [76, 81, 83, 84, 85, 94], highlights: [76, 81, 83, 84, 85],
      questions: {
        76: { short: 'Banheiros separados por gênero', statement: 'informaram possuir banheiros separados por gênero' },
        81: { short: 'Quantidade de banheiros', statement: 'declararam considerar suficiente a quantidade de banheiros e/ou vasos sanitários' },
        83: { short: 'Portas e privacidade', statement: 'informaram que todos os banheiros possuem portas com trancas que garantem a privacidade' },
        84: { short: 'Água nas pias dos banheiros', statement: 'informaram possuir pias nos banheiros com água sempre disponível' },
        85: { short: 'Sabão para lavar as mãos', statement: 'informaram que as pias dos banheiros sempre têm sabão' },
        94: { short: 'Esgoto a céu aberto', statement: 'relataram esgoto correndo a céu aberto nas dependências da escola' },
      },
    },
    {
      id: 'higiene-dignidade-menstrual', title: 'Higiene e dignidade menstrual', order: 5, icon: 'hygiene',
      subtitle: 'Condições para higiene, lavagem das mãos e manejo digno da menstruação.',
      context: 'As respostas descrevem práticas, insumos e condições declaradas para a higiene. Os resultados são apresentados por questão.',
      question_numbers: [98, 99, 101, 103, 104, 105, 106], highlights: [98, 99, 101, 103, 104],
      questions: {
        98: { short: 'Quantidade de chuveiros', statement: 'declararam considerar suficiente a quantidade de chuveiros' },
        99: { short: 'Água nas pias do refeitório', statement: 'informaram possuir pias no refeitório ou nas proximidades com água sempre disponível' },
        101: { short: 'Programa de Lavagem de Mãos', statement: 'informaram implementar o Programa de Lavagem de Mãos do SELO UNICEF' },
        103: { short: 'Programa Saúde na Escola', statement: 'informaram ter ações do Programa Saúde na Escola' },
        104: { short: 'Produtos de higiene menstrual', statement: 'informaram disponibilizar produtos de higiene menstrual' },
        105: { short: 'Condições para troca de absorventes', statement: 'declararam considerar os banheiros adequados e seguros para troca de absorventes' },
        106: { short: 'Promoção da saúde menstrual', statement: 'informaram realizar ações de promoção da saúde e higiene menstrual com estudantes' },
      },
    },
    {
      id: 'drenagem-adaptacao', title: 'Drenagem e adaptação local', order: 6, icon: 'leaf',
      subtitle: 'Espaços e soluções locais que ajudam a reduzir calor e alagamentos.',
      context: 'A pergunta reúne diferentes soluções no mesmo relato. Uma resposta afirmativa não identifica qual solução existe na escola.',
      question_numbers: [109], highlights: [109],
      questions: {
        109: { short: 'Espaços de adaptação local', statement: 'informaram possuir áreas sombreadas, vegetação ou espaços que ajudam a reduzir calor e alagamentos' },
      },
    },
    {
      id: 'gestao-manutencao', title: 'Gestão e manutenção', order: 7, icon: 'tools',
      subtitle: 'Planejamento da manutenção dos sistemas de água, esgotamento e drenagem.',
      context: 'O relato de um plano informa sua existência declarada; não mede a execução ou a qualidade da manutenção.',
      question_numbers: [111], highlights: [111],
      questions: {
        111: { short: 'Plano de gestão e manutenção', statement: 'informaram possuir plano de gestão e manutenção para falhas nos sistemas' },
      },
    },
    {
      id: 'gestao-riscos', title: 'Gestão de riscos e desastres', order: 8, icon: 'shield',
      subtitle: 'Exposição a eventos climáticos, interrupções e capacidade de preparação das escolas.',
      context: 'Exposição a risco e preparação têm sentidos diferentes. Leia os relatos de eventos junto das ações de capacitação e dos planos existentes.',
      question_numbers: [115, 116, 117, 118, 119], highlights: [115, 116, 117, 118, 119],
      questions: {
        115: { short: 'Interrupções e danos por eventos climáticos', statement: 'relataram interrupções no abastecimento de água ou danos ao saneamento por eventos climáticos extremos nos últimos cinco anos' },
        116: { short: 'Localização em área de risco ambiental', statement: 'informaram estar situadas em área de risco ambiental' },
        117: { short: 'Suspensão de aulas', statement: 'relataram necessidade de suspender aulas por falta de água, calor extremo ou condições inseguras relacionadas a eventos climáticos no último ano' },
        118: { short: 'Capacitação ou simulado', statement: 'informaram participação em capacitação ou simulado sobre emergências climáticas', preparation: true },
        119: { short: 'Plano de contingência e orientações', statement: 'informaram possuir plano de contingência e/ou orientações para emergências climáticas', preparation: true },
      },
    },
  ];
