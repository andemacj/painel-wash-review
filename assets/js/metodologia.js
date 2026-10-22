(() => {
  "use strict";

  const D = window.WASH_PREVIEW_DATA;
  const RELEASE_ID = window.WASH_PREVIEW_CONFIG.releaseId;
  const RELEASE_ROOT = window.WASH_PREVIEW_CONFIG.releaseBase;
  const DOC_PATH = "../docs/w7b_diagnostico_urbano_rural_relatorio_municipal_20260911.md";
  const SEMANTIC_FIELD = "semantic" + "_interpretation";

  const endpoints = Object.freeze({
    metadata: `${RELEASE_ROOT}/metadata.json`,
    national: `${RELEASE_ROOT}/diagnostico/national.json`,
    questions: `${RELEASE_ROOT}/diagnostico/questions.json`,
  });

  const typeLabels = Object.freeze({
    POSITIVE_DIRECT: "Condição declarada",
    NEGATIVE_DIRECT: "Ponto de atenção",
    PERCEPTION: "Percepção declarada",
    CONTEXT: "Contexto",
    RISK_EXPOSURE: "Exposição / contexto de risco",
    DESCRIPTIVE: "Distribuição descritiva",
    MULTI_RESPONSE: "Multirresposta",
  });

  const typeNotes = Object.freeze({
    POSITIVE_DIRECT: "Indica presença declarada de uma condição ou prática.",
    NEGATIVE_DIRECT: "Descreve uma condição que merece atenção; a resposta original é preservada.",
    PERCEPTION: "Representa relato da escola, não verificação externa.",
    CONTEXT: "Ajuda a interpretar o cenário, sem representar desempenho WASH.",
    RISK_EXPOSURE: "Representa contexto territorial ou operacional de risco.",
    DESCRIPTIVE: "Mostra a distribuição das alternativas escolhidas.",
    MULTI_RESPONSE: "Uma escola pode selecionar mais de uma alternativa.",
  });

  const state = {
    metadata: null,
    national: null,
    questions: [],
  };

  const root = document.getElementById("methodpub-root");
  const footerMeta = document.getElementById("methodpub-footer-meta");
  const live = document.getElementById("methodpub-live");

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    if (!root) return;

    try {
      const [metadata, national, questionPayload] = await Promise.all([
        fetchJson(endpoints.metadata),
        fetchJson(endpoints.national),
        fetchJson(endpoints.questions),
      ]);

      if(metadata.release_candidate_id !== RELEASE_ID) throw new Error("Base incompatível.");
      state.metadata = metadata;
      state.national = D.normalize(national);
      state.questions = sortQuestions(questionPayload.questions || []);
      render();
      bindEvents();
      announce("Metodologia carregada.");
    } catch (error) {
      renderError(error);
    }
  }

  async function fetchJson(url) {
    return window.WASH_REVIEW_DATA.read(url);
  }

  function sortQuestions(questions) {
    return [...questions].sort((a, b) => Number(a.display_order || a.question_number) - Number(b.display_order || b.question_number));
  }

  function render() {
    const metadata = state.metadata || {};
    const totals = metadata.totals || state.national?.coverage || {};
    const questions = state.questions;
    const types = groupByType(questions);

    root.className = "methodpub-root";
    root.removeAttribute("role");
    root.innerHTML = `
      ${renderHero(metadata, totals, questions.length)}
      <section class="methodpub-grid" aria-label="Metodologia e dados">
        ${renderAboutCard()}
        ${renderScopeAndFocusCards()}
        ${renderUniverseCard(metadata, totals)}
        ${renderQuestionSetCard(metadata, questions)}
        ${renderPercentCard(totals, questions)}
        ${renderTypesCard(types)}
        ${renderNoScoreCard()}
        ${renderPrivacyCard()}
        ${renderUpdateCard(metadata)}
        ${renderLimitationsCard()}
        ${renderDownloadsCard()}
        ${renderQuestionsCard(questions)}
      </section>
      ${renderSourceNote()}
    `;

    updateFooter(metadata);
  }

  function renderError(error) {
    root.className = "methodpub-state methodpub-state--error";
    root.setAttribute("role", "alert");
    root.innerHTML = `
      <div>
        <strong>Não foi possível carregar a metodologia.</strong>
        <p>${escapeHtml(error.message || String(error))}</p>
      </div>
    `;
  }

  function renderHero(metadata, totals, questionCount) {
    return `
      <section class="methodpub-hero" aria-labelledby="methodpub-title">
        <div>
          <p class="methodpub-eyebrow">Metodologia e dados</p>
          <h1 id="methodpub-title">Metodologia e dados</h1>
          <p class="methodpub-subtitle">
            Entenda a fonte, o universo, os cálculos e os cuidados necessários para interpretar os resultados.
          </p>
          <p class="methodpub-source-line">Fonte extraída em ${formatDate(metadata.source_date)} · Última resposta em ${formatDate(metadata.data_reference_date)}.</p>
        </div>
        <div class="methodpub-hero__aside" aria-label="Resumo da metodologia">
          <span>Primeira devolutiva</span>
          <strong>${formatNumber(questionCount)}</strong>
          <small>questões estratégicas</small>
          <small>${formatNumber(totals.eligible_schools)} escolas elegíveis</small>
        </div>
      </section>
    `;
  }

  function renderAboutCard() {
    return card("Sobre o diagnóstico", `
      <p>
        A Autoavaliação WASH reúne informações declaradas pelas escolas sobre água, saneamento, higiene,
        dignidade menstrual, drenagem e riscos climáticos.
      </p>
      <p>
        Esta versão organiza os resultados para apoiar uma primeira conversa com a equipe WASH.
      </p>
    `);
  }

  function renderUniverseCard(metadata, totals) {
    return card(D.universe, '<p>' + escapeHtml(D.description) + '</p><p><strong>' + escapeHtml(metadata.national_reference_label) + '.</strong> ' + escapeHtml(D.referenceNote) + '</p><div class="methodpub-kpis">' + kpi('Municípios',totals.municipalities) + kpi('UFs',totals.ufs) + kpi('Escolas elegíveis',totals.eligible_schools) + kpi('Autoavaliações finalizadas',totals.completed_schools) + kpi('Pendentes',totals.pending_schools) + '</div><p>Cobertura: ' + formatPercent(totals.coverage_pct) + '</p>');
  }

  function renderScopeAndFocusCards() {
    const c = state.national.scopes;
    return card('Geral, Urbana e Rural', '<p>A localização Urbana/Rural utiliza o Censo Escolar ' + escapeHtml(state.metadata.censo_reference_year) + '. O recorte Geral reúne todas as escolas elegíveis; Urbana e Rural apresentam separadamente os resultados das escolas classificadas em cada localização.</p><p>' + formatNumber(c.urban.coverage.eligible_schools) + ' urbanas; ' + formatNumber(c.rural.coverage.eligible_schools) + ' rurais; ' + formatNumber(c.not_classified.coverage.eligible_schools) + ' não classificadas.</p>' + D.dots(D.coverageSeries(state.national),'all',null,true)) +
      card('Resposta destacada em validação', '<p>' + escapeHtml(D.focusNote) + '</p><p>' + formatNumber(state.metadata.comparable_question_count) + ' das ' + formatNumber(state.questions.length) + ' questões possuem resposta destacada. As comparações utilizam sempre a mesma área de abrangência no município, na UF e na Referência Selo UNICEF.</p>') +
      card('Q28 e Q65: distribuições completas', '<p>A Q28 permite que a escola informe mais de uma fonte de água para beber. Por isso, seus percentuais podem somar mais de 100% e não são reduzidos a uma única resposta de comparação.</p><p>A Q65 apresenta a distribuição das formas de destinação dos resíduos. Nesta versão, nenhuma categoria foi adotada como referência única de comparação.</p>') +
      card('Como interpretar a Q22', '<p>' + escapeHtml(state.questions.find(q=>String(q.question_number)==='22').explanation) + '</p>');
  }

  function renderQuestionSetCard(metadata, questions) {
    return card("As 31 questões", `
      <p>
        A equipe WASH selecionou ${formatNumber(questions.length)} questões estratégicas para esta primeira devolutiva.
      </p>
      <p>
        O instrumento completo possui um conjunto mais amplo de perguntas. A camada tratada utilizada nesta versão
        contém ${formatNumber(metadata.p45_audit.response_question_columns_available)} perguntas distintas; 31 foram selecionadas
        para esta primeira leitura.
      </p>
      <p class="methodpub-note">
        Nota metodológica: a discussão inicial referiu-se a aproximadamente 30 questões; a lista operacional recebida
        contém 31 itens.
      </p>
    `);
  }

  function renderPercentCard(totals, questions) {
    const multiCount = questions.filter((question) => question.multi_response).length;
    return card("Como os percentuais são calculados", `
      <div class="methodpub-formula">
        <span>Cobertura</span>
        <strong>autoavaliações finalizadas ÷ escolas elegíveis</strong>
        <span>${formatNumber(totals.completed_schools)} ÷ ${formatNumber(totals.eligible_schools)} = ${formatPercent(totals.coverage_pct)}</span>
      </div>
      <ul>
        <li>Nas perguntas, o percentual usa as respostas válidas daquela questão.</li>
        <li>Ausências e itens não aplicáveis são preservados quando aparecem na base agregada.</li>
        <li>${formatNumber(multiCount)} questão(ões) permitem múltiplas respostas; nesses casos, a soma pode ultrapassar 100%.</li>
      </ul>
    `);
  }

  function renderTypesCard(types) {
    const order = ["POSITIVE_DIRECT", "NEGATIVE_DIRECT", "PERCEPTION", "CONTEXT", "RISK_EXPOSURE", "DESCRIPTIVE", "MULTI_RESPONSE"]
      .filter((key) => types[key]?.length);
    return card("Como interpretar os tipos de pergunta", `
      <div class="methodpub-semantic-list">
        ${order.map((key) => `
          <div class="methodpub-semantic-item">
            <strong>${escapeHtml(typeLabels[key] || key)} · ${formatNumber(types[key].length)} questão(ões)</strong>
            <span>${escapeHtml(typeNotes[key] || "Leitura definida na matriz metodológica.")}</span>
          </div>
        `).join("")}
      </div>
    `);
  }

  function renderNoScoreCard() {
    return card("Por que não há uma nota geral?", `
      <p>
        As perguntas medem dimensões diferentes e incluem condições declaradas, percepções, contexto e exposição a riscos.
        Somá-las em uma única nota poderia gerar interpretações inadequadas.
      </p>
    `);
  }

  function renderPrivacyCard() {
    return card("Privacidade", `
      <p>
        Os resultados das questões são apresentados de forma agregada por território. As respostas individuais das escolas
        não fazem parte desta versão.
      </p>
      <p>
        Esta versão de revisão não inclui listas nominais ou respostas individuais de escolas.
      </p>
    `);
  }

  function renderUpdateCard(metadata) {
    return card("Atualização dos dados", `
      <p>Extração da fonte em ${formatDate(metadata.source_date)}.</p>
      <p>Referência dos dados: ${formatDate(metadata.data_reference_date)}.</p>
      <p>Censo Escolar ${escapeHtml(metadata.censo_reference_year || "2025")} como referência do universo elegível.</p>
    `);
  }

  function renderLimitationsCard() {
    return card("Limitações", `
      <ul>
        <li>VERSÃO DE TESTE. Respostas em foco provisórias; publicação externa não autorizada.</li>
        <li>Os critérios para tratamento de agregados com pequeno número de observações ainda serão definidos antes da publicação externa.</li>
        <li>A publicação externa depende de validação funcional, metodológica e institucional.</li>
      </ul>
    `);
  }

  function renderDownloadsCard() {
    return card("Arquivos de apoio", `
      <p>Os arquivos abaixo ajudam na revisão da reunião e não incluem respostas individuais de escolas.</p>
      <div class="methodpub-actions" aria-label="Arquivos para download">
        <button class="methodpub-button" type="button" data-method-download="questions">Baixar lista de questões</button>
        <button class="methodpub-button" type="button" data-method-download="national">Baixar resultados agregados</button>
        <a class="methodpub-button methodpub-button--link" href="${escapeAttr(DOC_PATH)}" download>Baixar documentação</a>
      </div>
    `);
  }

  function renderQuestionsCard(questions) {
    return `
      <article class="methodpub-card methodpub-card--wide">
        <div class="methodpub-card__head">
          <p class="methodpub-eyebrow">Lista de referência</p>
          <h2>Questões estratégicas</h2>
        </div>
        <div class="methodpub-card__body">
          <p>Lista compacta das questões usadas no Diagnóstico WASH.</p>
          <div class="methodpub-table-shell">
            <table class="methodpub-table">
              <thead>
                <tr>
                  <th scope="col">Questão</th>
                  <th scope="col">Tema</th>
                  <th scope="col">Enunciado</th>
                  <th scope="col">Leitura</th>
                </tr>
              </thead>
              <tbody>
                ${questions.map((question) => `
                  <tr>
                    <td>Q${escapeHtml(question.question_number)}</td>
                    <td>${escapeHtml(window.WASH_PREVIEW_THEMES.find(t=>t.question_numbers.includes(Number(question.question_number)))?.title || question.theme_id)}</td>
                    <td>${escapeHtml(question.question_text)}</td>
                    <td>${escapeHtml(typeLabels[question[SEMANTIC_FIELD]] || "Distribuição descritiva")}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </article>
    `;
  }

  function renderSourceNote() {
    return `
      <aside class="methodpub-source-card" aria-label="Nota técnica discreta">
        <p>
          Identificador técnico da base: <code>${escapeHtml(RELEASE_ID)}</code>. Este identificador é mantido aqui apenas
          para rastreabilidade interna da apresentação.
        </p>
      </aside>
    `;
  }

  function card(title, body) {
    return `
      <article class="methodpub-card">
        <div class="methodpub-card__head">
          <p class="methodpub-eyebrow">Autoavaliação WASH</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="methodpub-card__body">${body}</div>
      </article>
    `;
  }

  function kpi(label, value) {
    return `
      <div class="methodpub-kpi">
        <span>${escapeHtml(label)}</span>
        <strong>${formatNumber(value)}</strong>
      </div>
    `;
  }

  function groupByType(questions) {
    return questions.reduce((acc, question) => {
      const key = question[SEMANTIC_FIELD] || "DESCRIPTIVE";
      if (!acc[key]) acc[key] = [];
      acc[key].push(question);
      return acc;
    }, {});
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-method-download]");
      if (!button) return;

      const type = button.getAttribute("data-method-download");
      if (type === "questions") downloadQuestionsCsv();
      if (type === "national") downloadNationalCsv();
    });
  }

  function downloadQuestionsCsv() {
    const rows = state.questions.map((question) => ({
      questao: question.question_number,
      bloco: question.theme_id,
      enunciado: question.question_text,
      tipo_de_resposta: question.response_type,
      leitura_publica: typeLabels[question[SEMANTIC_FIELD]] || "Distribuição descritiva",
      multirresposta: question.multi_response ? "sim" : "não",
      cuidado_adicional: question.special_sensitive_review_required ? "sim" : "não",
      regra_do_denominador: state.metadata.denominator_rule,
      regra_de_ausencia: state.metadata.branching_note,
    }));

    downloadCsv("questoes_estrategicas_wash_validacao_interna.csv", rows, [
      "questao",
      "bloco",
      "enunciado",
      "tipo_de_resposta",
      "leitura_publica",
      "multirresposta",
      "cuidado_adicional",
      "regra_do_denominador",
      "regra_de_ausencia",
    ]);
  }

  function downloadNationalCsv() {
    const questionByNumber = new Map(state.questions.map((question) => [String(question.question_number), question]));
    const rows = (state.national.scopes.all.questions || []).flatMap((item) => {
      const question = questionByNumber.get(String(item.question_number)) || {};
      return (item.options || []).map((option) => ({
        escopo: D.universe,
        questao: item.question_number,
        bloco: question.theme_id,
        enunciado: question.question_text || "",
        leitura_publica: typeLabels[item[SEMANTIC_FIELD]] || "Distribuição descritiva",
        tipo_de_resposta: item.response_type,
        alternativa: option.label,
        quantidade: option.count,
        percentual_respostas_validas: option.pct_valid,
        escolas_elegiveis_no_recorte: item.n_eligible,
        autoavaliacoes_finalizadas_no_recorte: item.n_completed,
        respostas_validas: item.n_valid,
        sem_resposta: item.n_missing,
        nao_sabe: item.n_dont_know,
        multirresposta: item.multi_response ? "sim" : "não",
      }));
    });

    downloadCsv("resultados_agregados_wash_selo_unicef_validacao_interna.csv", rows, [
      "escopo",
      "questao",
      "bloco",
      "enunciado",
      "leitura_publica",
      "tipo_de_resposta",
      "alternativa",
      "quantidade",
      "percentual_respostas_validas",
      "escolas_elegiveis_no_recorte",
      "autoavaliacoes_finalizadas_no_recorte",
      "respostas_validas",
      "sem_resposta",
      "nao_sabe",
      "multirresposta",
    ]);
  }

  function downloadCsv(filename, rows, headers) {
    const content = [
      headers.join(";"),
      ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(";")),
    ].join("\n");

    const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    announce(`Arquivo ${filename} gerado.`);
  }

  function csvCell(value) { return D.csvCell(value); }

  function updateFooter(metadata) {
    if (!footerMeta) return;
    footerMeta.textContent = `Dados atualizados em ${formatDate(metadata.data_reference_date)} · VERSÃO DE TESTE`;
  }

  function announce(message) {
    if (!live) return;
    live.textContent = message;
  }

  function shortBlock(block) {
    return String(block || "—").replace(/\s+/g, " ").trim();
  }

  function formatDate(value) {
    if (!value) return "—";
    const text = String(value).slice(0, 10);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("pt-BR");
  }

  function formatPercent(value) {
    return `${Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })}%`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
