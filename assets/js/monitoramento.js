(() => {
  'use strict';

  const D = window.WASH_PREVIEW_DATA;
  const RELEASE_ID = window.WASH_PREVIEW_CONFIG.releaseId;
  const RELEASE_ROOT = window.WASH_PREVIEW_CONFIG.releaseBase;
  const TARGET = 90;
  // Ordered lower bounds; the next bound is exclusive, without decimal gaps.
  const MUNICIPAL_PROGRESS_STATUS = Object.freeze({
    advanced: Object.freeze({ label: 'Avançado', min: TARGET, color: '#168A5B', textColor: '#116B46', icon: '✓', description: `Meta de ${TARGET}% atingida.` }),
    near: Object.freeze({ label: 'Próximo', min: 80, color: '#E8A720', textColor: '#805700', icon: '↗', description: 'Município perto da meta.' }),
    attention: Object.freeze({ label: 'Atenção', min: 50, color: '#E07A2B', textColor: '#994B13', icon: '!', description: 'Necessidade relevante de avanço.' }),
    critical: Object.freeze({ label: 'Crítico', min: 0, color: '#D9482B', textColor: '#B3341B', icon: '!!', description: 'Menos da metade das escolas concluiu.' }),
  });
  const MUNICIPAL_PAGE_SIZE = 10;
  const municipalPctFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const municipalNameCollator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
  const SCHOOL_PAGE_SIZE = 30;
  const MAP_ZOOM_MIN = 1;
  const MAP_ZOOM_MAX = 4;
  const MAP_ZOOM_STEP = 0.5;
  const MAP_GESTURE_ZOOM_STEP = 0.25;
  const MAP_GESTURE_LIMIT = 18;
  const MAP_GEOJSON_URL = 'data/mapa/municipios_autoavaliacao_2024.geojson';
  const MAP_CONTEXT_URL = 'data/mapa/contexto_brasil_2024.json';

  const endpoints = {
    metadata: `${RELEASE_ROOT}/metadata.json`,
    national: `${RELEASE_ROOT}/monitoramento/resumo_nacional.json`,
    ufSummary: `${RELEASE_ROOT}/monitoramento/resumo_uf.json`,
    municipalitySummary: `${RELEASE_ROOT}/monitoramento/resumo_municipal.json`,
  };

  const root = document.getElementById('washpub-root');
  const drawerRoot = document.getElementById('washpub-drawer-root');
  const live = document.getElementById('washpub-live');

  const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const pctFormatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });

  const state = {
    metadata: null,
    national: null,
    ufs: [],
    municipalities: [],
    municipalityByCode: new Map(),
    schoolCache: new Map(),
    schoolRows: [],
    selectedUf: '',
    selectedIbge: '',
    previousUfBeforeMunicipality: '',
    coverageBand: '',
    municipalStatus: '',
    municipalSearch: '',
    municipalSort: 'progress-desc',
    municipalPage: 1,
    schoolTab: 'all',
    schoolSearch: '',
    schoolPage: 1,
    schoolSort: { key: 'response_status', direction: 'asc' },
    schoolAccess: 'loading',
    mapGeojson: null,
    mapContext: null,
    mapAccess: 'loading',
    mapFocus: 'brasil',
    mapZoom: MAP_ZOOM_MIN,
    mapPanX: 0,
    mapPanY: 0,
    mapGestureZoomAccumulator: 0,
    mapGestureChanged: false,
    mapGestureAnnouncementTimer: null,
    mapPanPointer: null,
    suppressNextMapClick: false,
    drawerMunicipality: null,
    drawerTrigger: null,
    previousBodyOverflow: '',
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      renderLoading('Carregando dados da autoavaliação…');
      bindEvents();

      const [metadata, national, ufPayload, municipalityPayload, mapPayload, mapContext] = await Promise.all([
        fetchJson(endpoints.metadata),
        fetchJson(endpoints.national),
        fetchJson(endpoints.ufSummary),
        fetchJson(endpoints.municipalitySummary),
        fetchJson(MAP_GEOJSON_URL).catch(() => null),
        fetchJson(MAP_CONTEXT_URL).catch(() => null),
      ]);

      state.metadata = metadata;
      state.reviewMunicipalScopes = new Map(municipalityPayload.municipalities.map(row => [row.territory.ibge, row.scopes]));
      if (metadata.release_candidate_id !== RELEASE_ID) throw new Error("Base incompatível.");
      state.national = {...national.scopes.all, schools_needed_for_90_national: national.scopes.all.needed_for_90};
      state.ufs = normalizeUfRows((ufPayload.ufs || []).map(row=>({...row.scopes.all, uf:row.territory.uf, schools_needed_for_90_uf:row.scopes.all.needed_for_90})));
      state.municipalities = normalizeMunicipalRows((municipalityPayload.municipalities || []).map(row=>({...row.scopes.all, uf:row.territory.uf, ibge:row.territory.ibge, municipality:row.territory.label, needed_for_90_municipal:row.scopes.all.needed_for_90})));
      state.municipalityByCode = new Map(state.municipalities.map((row) => [row.ibge, row]));

      auditAndStoreMap(mapPayload, mapContext);
      await loadSchoolsForCurrentScope();
      renderApp();
      announce('Monitoramento carregado.');
    } catch (error) {
      renderFatalError('Não foi possível carregar o monitoramento.', error);
    }
  }

  function normalizeUfRows(rows) {
    return rows
      .map((row) => ({
        uf: String(row.uf || ''),
        municipalities: Number(row.municipalities || 0),
        eligible_schools: Number(row.eligible_schools || 0),
        completed_schools: Number(row.completed_schools || 0),
        pending_schools: Number(row.pending_schools || 0),
        coverage_pct: Number(row.coverage_pct || 0),
        municipalities_100: Number(row.municipalities_100 || 0),
        municipalities_at_least_90: Number(row.municipalities_at_least_90 || 0),
        municipalities_below_50: Number(row.municipalities_below_50 || 0),
        schools_needed_for_90_uf: Number(row.schools_needed_for_90_uf || 0),
        schools_needed_for_90_sum_municipal: Number(row.schools_needed_for_90_sum_municipal || 0),
      }))
      .sort((a, b) => a.uf.localeCompare(b.uf, 'pt-BR'));
  }

  function normalizeMunicipalRows(rows) {
    return rows
      .map((row) => ({
        ibge: String(row.ibge || ''),
        municipality: String(row.municipality || ''),
        uf: String(row.uf || ''),
        eligible_schools: Number(row.eligible_schools || 0),
        completed_schools: Number(row.completed_schools || 0),
        pending_schools: Number(row.pending_schools || 0),
        coverage_pct: Number(row.coverage_pct || 0),
        needed_for_90_municipal: Number(row.needed_for_90_municipal || 0),
        target_status: String(row.target_status || ''),
      }))
      .sort((a, b) => {
        const ufCompare = a.uf.localeCompare(b.uf, 'pt-BR');
        if (ufCompare !== 0) return ufCompare;
        return a.municipality.localeCompare(b.municipality, 'pt-BR');
      });
  }

  function normalizeSchoolRows(rows) {
    return rows.map((row) => {
      const locationValue = ({URBANA:'Urbana',RURAL:'Rural',NAO_CLASSIFICADA:'Não classificada'}[row.territorial_scope]);
      return {
        id: `${row.uf || ''}-${row.inep || ''}`,
        inep: String(row.inep || ''),
        school_name: String(row.school_name || ''),
        ibge: String(row.ibge || ''),
        municipality: String(row.municipality || ''),
        uf: String(row.uf || ''),
        response_status: row.response_status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
        location_value: locationValue == null ? '' : String(locationValue),
      };
    });
  }

  function auditAndStoreMap(mapPayload, contextPayload) {
    if (!mapPayload || mapPayload.type !== 'FeatureCollection' || !Array.isArray(mapPayload.features)) {
      state.mapAccess = 'unavailable';
      return;
    }

    const expectedCodes = new Set(state.municipalities.map((row) => row.ibge));
    const seenCodes = new Set();
    const thematicKeys = new Set(['cobertura', 'faixa_cobertura', 'escolas_elegiveis', 'escolas_finalizadas', 'escolas_pendentes', 'faltam_para_90']);
    const safeFeatures = [];

    for (const feature of mapPayload.features) {
      const properties = feature?.properties || {};
      const code = String(properties.codigo_ibge || properties.ibge || '');
      if (!expectedCodes.has(code) || seenCodes.has(code) || !feature?.geometry) {
        state.mapAccess = 'unavailable';
        state.mapGeojson = null;
        return;
      }
      seenCodes.add(code);
      safeFeatures.push({
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          codigo_ibge: code,
          municipio: String(properties.municipio || state.municipalityByCode.get(code)?.municipality || ''),
          uf: String(properties.uf || state.municipalityByCode.get(code)?.uf || ''),
          ignored_thematic_keys: Object.keys(properties).filter((key) => thematicKeys.has(key)),
        },
      });
    }

    if (seenCodes.size !== expectedCodes.size) {
      state.mapAccess = 'unavailable';
      state.mapGeojson = null;
      return;
    }

    const contextStates = Array.isArray(contextPayload?.ufs) ? contextPayload.ufs : [];
    const validContext = contextPayload?.type === 'SvgGeographyContext'
      && contextStates.every((row) => /^[A-Z]{2}$/.test(String(row.uf || '')) && typeof row.d === 'string');

    state.mapGeojson = { type: 'FeatureCollection', features: safeFeatures };
    state.mapContext = validContext ? { type: 'SvgGeographyContext', ufs: contextStates } : null;
    state.mapAccess = 'available';
  }

  function renderLoading(message) {
    root.className = 'washpub-state washpub-state--loading';
    root.setAttribute('role', 'status');
    root.textContent = message;
  }

  function renderFatalError(message, error) {
    root.className = 'washpub-state washpub-state--error';
    root.setAttribute('role', 'alert');
    root.innerHTML = `
      <div>
        <strong>${escapeHtml(message)}</strong>
        <p>${escapeHtml(error?.message || String(error || 'Erro desconhecido'))}</p>
      </div>
    `;
  }

  function renderApp() {
    root.className = 'washpub-root';
    root.removeAttribute('role');
    root.innerHTML = `
      ${renderHero()}
      ${renderValidationBanner()}
      ${renderControls()}
      ${state.selectedIbge ? `<p class="washpub-report-link"><a class="washpub-button" href="relatorio-municipal.html?uf=${escapeAttr(state.selectedUf)}&amp;ibge=${escapeAttr(state.selectedIbge)}">Gerar relatório do município</a></p>` : ""}
      ${renderKpis()}
      <section id="washpub-map-ranking" class="washpub-map-ranking monitor-analysis-grid" aria-label="Situação dos municípios, mapa e perfil territorial das escolas">
        ${renderRankingCard()}
        <div class="washpub-analysis-side">
          ${renderMapCard()}
          ${renderSchoolLocationCard()}
        </div>
      </section>
      ${renderSchoolPanel()}
      ${renderSourceCard()}
    `;
    updateFooterMeta();
  }

  function renderHero() {
    const context = currentContext();
    const metrics = getMetrics(context.row);
    return `
      <section class="washpub-hero" aria-labelledby="washpub-title">
        <div class="washpub-hero__body">
          <p class="washpub-eyebrow">Monitoramento da autoavaliação</p>
          <h1 id="washpub-title">Monitoramento da autoavaliação</h1>
          <p class="washpub-subtitle">
            Acompanhe a participação das escolas no Diagnóstico WASH e o avanço dos municípios em relação à meta de 90%.
          </p>
          <p class="washpub-source-line">Fonte extraída em ${escapeHtml(formatDate(state.metadata?.source_date))} · Última resposta em ${escapeHtml(formatDate(state.metadata?.data_reference_date))}</p>
        </div>
        <div class="washpub-hero__aside" aria-label="Cobertura atual do recorte">
          <span>Cobertura atual · ${escapeHtml(context.label)}</span>
          <strong>${escapeHtml(metrics.eligible > 0 ? formatPct(metrics.coverage) : '—')}</strong>
          <small>${formatNumber(metrics.completed)} de ${formatNumber(metrics.eligible)} escolas finalizadas</small>
        </div>
      </section>
    `;
  }

  function renderValidationBanner() {
    return `
      <section class="washpub-validation" aria-label="Identificação da versão">
        <strong>VERSÃO DE TESTE.</strong>
        <span>Resultados agregados para revisão pela equipe WASH. As respostas individuais das escolas não são exibidas.</span>
      </section>
    `;
  }

  function renderControls() {
    const municipalities = state.selectedUf
      ? state.municipalities.filter((row) => row.uf === state.selectedUf)
      : [];
    return `
      <section class="washpub-controls-card" aria-labelledby="washpub-filters-title">
        <div class="washpub-section-head">
          <div>
            <p class="washpub-eyebrow">Recorte</p>
            <h2 id="washpub-filters-title">Filtros territoriais</h2>
          </div>
        </div>
        <div class="washpub-controls">
          <label class="washpub-field" for="washpub-uf">
            <span>UF</span>
            <select id="washpub-uf">
              <option value="">Universo Selo UNICEF</option>
              ${state.ufs.map((row) => `<option value="${escapeAttr(row.uf)}"${row.uf === state.selectedUf ? ' selected' : ''}>${escapeHtml(row.uf)}</option>`).join('')}
            </select>
          </label>
          <label class="washpub-field" for="washpub-municipality">
            <span>Município</span>
            <select id="washpub-municipality" ${state.selectedUf ? '' : 'disabled'}>
              ${state.selectedUf ? '<option value="">Todos os municípios da UF</option>' : '<option value="">Selecione uma UF</option>'}
              ${municipalities.map((row) => `<option value="${escapeAttr(row.ibge)}"${row.ibge === state.selectedIbge ? ' selected' : ''}>${escapeHtml(row.municipality)}/${escapeHtml(row.uf)}</option>`).join('')}
            </select>
          </label>
          <label class="washpub-field" for="washpub-coverage-band">
            <span>Faixa de cobertura</span>
            <select id="washpub-coverage-band">
              <option value=""${state.coverageBand ? '' : ' selected'}>Todas</option>
              <option value="critical"${state.coverageBand === 'critical' ? ' selected' : ''}>${escapeHtml(municipalStatusRange('critical'))}</option>
              <option value="attention"${state.coverageBand === 'attention' ? ' selected' : ''}>${escapeHtml(municipalStatusRange('attention'))}</option>
              <option value="near"${state.coverageBand === 'near' ? ' selected' : ''}>${escapeHtml(municipalStatusRange('near'))}</option>
              <option value="success"${state.coverageBand === 'success' ? ' selected' : ''}>${escapeHtml(municipalStatusRange('advanced'))}</option>
            </select>
          </label>
          <div class="washpub-filter-actions">
            <button class="washpub-button washpub-button--primary" type="button" data-action="export-schools">Baixar resumo agregado</button>
            <button class="washpub-button" type="button" data-action="clear-selection" ${state.selectedUf || state.selectedIbge || state.coverageBand ? '' : 'disabled'}>Limpar recorte</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderKpis() {
    const context = currentContext();
    const metrics = getMetrics(context.row);
    const municipalities = scopeMunicipalities();
    const municipalities100 = municipalities.filter((row) => getMetrics(row).coverage >= 100).length;
    const municipalities90 = municipalities.filter((row) => getMetrics(row).coverage >= TARGET).length;
    const scopeLabel = context.level === 'municipio' ? 'Município selecionado' : context.label;
    return `
      <section class="washpub-kpis" aria-label="Indicadores do recorte">
        ${kpiCard('Municípios participantes', formatNumber(municipalities.length || metrics.municipalities), scopeLabel)}
        ${kpiCard('Escolas elegíveis', formatNumber(metrics.eligible), 'Universo do recorte')}
        ${kpiCard('Escolas finalizadas', formatNumber(metrics.completed), 'Autoavaliação concluída')}
        ${kpiCard('Cobertura geral', metrics.eligible > 0 ? formatPct(metrics.coverage) : '—', 'Finalizadas / elegíveis')}
        ${kpiCard('Municípios com 100%', formatNumber(municipalities100), 'Cobertura completa')}
        ${kpiCard('Municípios ≥90%', formatNumber(municipalities90), 'Meta operacional atingida')}
        ${kpiCard('Escolas adicionais para 90%', formatNumber(metrics.missingToTarget), 'Distância do recorte')}
      </section>
    `;
  }

  function kpiCard(label, value, note) {
    return `
      <div class="washpub-kpi">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(note)}</small>
      </div>
    `;
  }

  function renderRankingCard() {
    const rows = municipalProgressScope();
    const distribution = municipalProgressDistribution(rows);
    return `
      <article id="washpub-municipal-progress" class="washpub-card washpub-progress-card" aria-labelledby="washpub-ranking-title" aria-describedby="washpub-progress-note">
        <div class="washpub-card-heading">
          <div>
            <p class="washpub-eyebrow">Progresso municipal</p>
            <h2 id="washpub-ranking-title">Situação dos municípios</h2>
            <p>Classificados pelo percentual de escolas que concluíram a autoavaliação.</p>
          </div>
          <span class="washpub-progress-target" title="Meta de conclusão: ${TARGET}% das escolas elegíveis.">Meta: ${TARGET}%</span>
        </div>
        <div class="washpub-progress-body">
          <p class="washpub-progress-summary">Meta de conclusão: ${TARGET}% das escolas elegíveis.</p>
          <div class="washpub-progress-segments" role="group" aria-label="Distribuição das situações de progresso municipal">
            ${Object.entries(MUNICIPAL_PROGRESS_STATUS).map(([key, status]) => {
              const count = distribution.counts[key];
              const share = distribution.total ? count / distribution.total * 100 : 0;
              const label = `${status.label}: ${formatNumber(count)} municípios — ${municipalPctFormatter.format(share)}% do recorte. ${status.description}`;
              return count ? `<button type="button" class="washpub-progress-segment" data-municipal-status="${key}" aria-pressed="${state.municipalStatus === key}" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}" style="width:${share}%;--municipal-status-color:${status.color}"><span class="washpub-progress-percent" aria-hidden="true">${municipalPctFormatter.format(share)}%</span></button>` : '';
            }).join('')}
          </div>
          <div class="washpub-progress-legend" role="group" aria-label="Filtrar municípios por situação">
            <button type="button" data-municipal-status="" aria-pressed="${!state.municipalStatus}">Todos <strong>${formatNumber(rows.length)}</strong></button>
            ${Object.entries(MUNICIPAL_PROGRESS_STATUS).map(([key, status]) => {
              const share = distribution.total ? distribution.counts[key] / distribution.total * 100 : 0;
              return `<button type="button" data-municipal-status="${key}" aria-pressed="${state.municipalStatus === key}" title="${escapeAttr(status.description + ' ' + municipalStatusRange(key))}" style="--municipal-status-color:${status.color}"><i aria-hidden="true"></i><span>${status.label}</span><strong>${formatNumber(distribution.counts[key])}</strong><small class="washpub-progress-share">${municipalPctFormatter.format(share)}%</small></button>`;
            }).join('')}
          </div>
          ${distribution.unclassified ? `<p class="washpub-muted">${formatNumber(distribution.unclassified)} município(s) sem escolas elegíveis ou sem percentual válido: sem classificação de progresso e fora da distribuição.</p>` : ''}
          <div class="washpub-progress-controls">
            <label class="washpub-field" for="washpub-municipal-search"><span>Buscar município</span><input id="washpub-municipal-search" type="search" value="${escapeAttr(state.municipalSearch)}" placeholder="Nome ou UF" aria-controls="washpub-municipal-results"></label>
            <label class="washpub-field" for="washpub-municipal-sort"><span>Ordenar por</span><select id="washpub-municipal-sort" aria-controls="washpub-municipal-results">${[
              ['progress-desc', 'Maior progresso'], ['progress-asc', 'Menor progresso'],
              ['name', 'Município A–Z'], ['network', 'Maior rede escolar'],
            ].map(([value, label]) => `<option value="${value}"${state.municipalSort === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
          </div>
          <div id="washpub-municipal-results">${renderMunicipalProgressResults()}</div>
          <p id="washpub-progress-note" class="washpub-progress-note">As categorias representam somente o progresso de aplicação da autoavaliação e não classificam as condições de WASH das escolas.</p>
        </div>
      </article>
    `;
  }

  function municipalStatusKey(value) {
    const coverage = Number(value);
    if (value == null || !Number.isFinite(coverage) || coverage < 0 || coverage > 100) return null;
    return Object.keys(MUNICIPAL_PROGRESS_STATUS).find((key) => coverage >= MUNICIPAL_PROGRESS_STATUS[key].min) || null;
  }

  function municipalStatusRange(key) {
    const keys = Object.keys(MUNICIPAL_PROGRESS_STATUS);
    const index = keys.indexOf(key), min = MUNICIPAL_PROGRESS_STATUS[key].min;
    if (!index) return `≥${formatNumber(min)}%`;
    const upper = MUNICIPAL_PROGRESS_STATUS[keys[index - 1]].min;
    return min ? `${formatNumber(min)}% a menos de ${formatNumber(upper)}%` : `<${formatNumber(upper)}%`;
  }

  function municipalRowStatus(row) {
    const metrics = getMetrics(row);
    return metrics.eligible > 0 ? municipalStatusKey(metrics.coverage) : null;
  }

  function municipalProgressScope() {
    // Keep the territorial distribution stable while a category is selected.
    return state.municipalities.filter((row) => !state.selectedUf || row.uf === state.selectedUf);
  }

  function matchesMunicipalProgressFilter(row) {
    return matchesCoverageBand(row) && (!state.municipalStatus || municipalRowStatus(row) === state.municipalStatus);
  }

  function applyMunicipalStatusFilter(key, options = {}) {
    const requested = Object.hasOwn(MUNICIPAL_PROGRESS_STATUS, key) ? key : '';
    const next = options.toggle && requested === state.municipalStatus ? '' : requested;
    closeDrawer();
    state.municipalStatus = next;
    state.coverageBand = next === 'advanced' ? 'success' : next;
    state.selectedIbge = '';
    state.previousUfBeforeMunicipality = '';
    state.municipalSearch = '';
    state.municipalPage = 1;
    state.schoolTab = 'all';
    state.schoolSearch = '';
    state.schoolPage = 1;
    state.mapFocus = state.selectedUf ? 'uf' : 'brasil';
    resetMapNavigationState();
    renderApp();
    if (options.toggle) root.querySelector(`[data-municipal-status="${requested}"]`)?.focus({ preventScroll: true });
    announce(`Progresso municipal: ${MUNICIPAL_PROGRESS_STATUS[next]?.label || 'Todos'}. Ranking, mapa e escolas atualizados.`);
  }

  function municipalProgressDistribution(rows) {
    const counts = Object.fromEntries(Object.keys(MUNICIPAL_PROGRESS_STATUS).map((key) => [key, 0]));
    let unclassified = 0;
    rows.forEach((row) => { const key = municipalRowStatus(row); if (key) counts[key] += 1; else unclassified += 1; });
    return { counts, total: rows.length - unclassified, unclassified };
  }

  function sortedMunicipalProgressRows() {
    const query = normalizeText(state.municipalSearch);
    const rows = municipalProgressScope().filter((row) => matchesMunicipalProgressFilter(row)
      && (!query || normalizeText(`${row.municipality} ${row.uf}`).includes(query)));
    const nameOrder = (a, b) => municipalNameCollator.compare(a.municipality, b.municipality)
      || a.uf.localeCompare(b.uf) || a.ibge.localeCompare(b.ibge);
    return rows.slice().sort((a, b) => {
      if (state.municipalSort === 'name') return nameOrder(a, b);
      const eligibleDiff = getMetrics(b).eligible - getMetrics(a).eligible;
      const progressDiff = getMetrics(b).coverage - getMetrics(a).coverage;
      if (state.municipalSort === 'network') return eligibleDiff || progressDiff || nameOrder(a, b);
      // No eligible schools remain last in both progress orders.
      const classifiedDiff = Number(!!municipalRowStatus(b)) - Number(!!municipalRowStatus(a));
      return classifiedDiff || (state.municipalSort === 'progress-asc' ? -progressDiff : progressDiff) || eligibleDiff || nameOrder(a, b);
    });
  }

  function municipalProgressPage() {
    const rows = sortedMunicipalProgressRows();
    const pageCount = Math.max(1, Math.ceil(rows.length / MUNICIPAL_PAGE_SIZE));
    const page = Math.max(1, Math.min(pageCount, state.municipalPage));
    const start = (page - 1) * MUNICIPAL_PAGE_SIZE;
    return { rows: rows.slice(start, start + MUNICIPAL_PAGE_SIZE), total: rows.length, pageCount, page, start };
  }

  function renderMunicipalProgressResults() {
    const model = municipalProgressPage();
    state.municipalPage = model.page;
    if (!model.total) return '<p class="washpub-empty" role="status">Nenhum município corresponde aos filtros desta lista.</p>';
    return `
      <table class="washpub-progress-table">
        <caption class="p45-sr-only">Municípios do recorte e progresso de conclusão da autoavaliação</caption>
        <thead><tr><th scope="col">Município</th><th scope="col">Progresso</th><th scope="col">Situação</th><th scope="col">Ação</th></tr></thead>
        <tbody>${model.rows.map(renderMunicipalProgressRow).join('')}</tbody>
      </table>
      <div class="washpub-progress-results-bar">
        <span role="status" aria-live="polite">${formatNumber(model.start + 1)}–${formatNumber(model.start + model.rows.length)} de ${formatNumber(model.total)} municípios</span>
        <nav class="washpub-pagination" aria-label="Paginação dos municípios">
          ${model.pageCount > 1 ? `<button type="button" class="washpub-page-button" data-municipal-page="${model.page - 1}" ${model.page === 1 ? 'disabled' : ''} aria-label="Página anterior de municípios">‹</button>
          ${compactPageItems(model.pageCount, model.page).map((page) => page === '…' ? '<span aria-hidden="true">…</span>' : `<button type="button" class="washpub-page-button" data-municipal-page="${page}" aria-label="Página ${page} de municípios"${page === model.page ? ' aria-current="page"' : ''}>${formatNumber(page)}</button>`).join('')}
          <button type="button" class="washpub-page-button" data-municipal-page="${model.page + 1}" ${model.page === model.pageCount ? 'disabled' : ''} aria-label="Próxima página de municípios">›</button>` : ''}
        </nav>
      </div>
    `;
  }

  function formatMunicipalProgressPct(value) {
    const rounded = Math.round(Number(value) * 10) / 10;
    // Keep source precision at a boundary so 89.99% never appears as 90%.
    return municipalStatusKey(rounded) === municipalStatusKey(value) && !(value < 100 && rounded >= 100)
      ? `${municipalPctFormatter.format(value)}%` : formatPct(value);
  }

  function renderMunicipalProgressRow(row) {
    const metrics = getMetrics(row), key = municipalRowStatus(row), status = MUNICIPAL_PROGRESS_STATUS[key];
    const selected = row.ibge === state.selectedIbge;
    const name = `${row.municipality}/${row.uf}`;
    const pct = status ? formatMunicipalProgressPct(metrics.coverage) : 'Não aplicável';
    const exact = status ? formatPct(metrics.coverage) : 'Sem escolas elegíveis ou percentual válido';
    const distance = status ? (metrics.missingToTarget ? `Faltam ${formatNumber(metrics.missingToTarget)} escolas para atingir ${TARGET}%.` : 'Meta atingida.') : '';
    const style = status ? `--municipal-status-color:${status.color};--municipal-status-text:${status.textColor}` : '';
    return `
      <tr class="washpub-progress-row${selected ? ' is-selected' : ''}" data-rank-row="${escapeAttr(row.ibge)}" style="${style}">
        <th scope="row"><button type="button" id="washpub-ranking-municipality-${escapeAttr(row.ibge)}" class="washpub-progress-name-button" data-select-municipality="${escapeAttr(row.ibge)}" aria-pressed="${selected}" aria-label="Selecionar ${escapeAttr(name)}${selected ? ', município selecionado' : ''}"><strong>${escapeHtml(name)}</strong></button></th>
        <td data-label="Progresso"><div class="washpub-progress-meter" title="${escapeAttr(exact + '. ' + distance)}" ${status ? `role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${metrics.coverage}" aria-valuetext="${escapeAttr(exact)}"` : ''} aria-label="${escapeAttr(name + ': ' + exact + ' das escolas concluíram. Situação: ' + (status?.label || 'Não aplicável') + '. ' + distance)}">
          <span class="washpub-progress-track" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, status ? metrics.coverage : 0))}%"></span></span>
          <strong>${escapeHtml(pct)}</strong>
        </div>
        </td>
        <td data-label="Situação"><span class="washpub-progress-pill" title="${escapeAttr(status?.description || 'Sem classificação de progresso')}"${status ? ` data-progress-status="${key}"` : ''}><span aria-hidden="true">${status?.icon || '—'}</span>${status?.label || 'Não aplicável'}</span></td>
        <td data-label="Ação"><button type="button" class="washpub-button washpub-progress-schools" data-municipal-schools="${escapeAttr(row.ibge)}" aria-label="Ver escolas de ${escapeAttr(name)}">Ver diagnóstico</button></td>
      </tr>
    `;
  }

  function refreshMunicipalProgressResults() {
    const results = document.getElementById('washpub-municipal-results');
    if (results) results.innerHTML = renderMunicipalProgressResults();
    root.querySelectorAll('[data-municipal-status]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.municipalStatus === state.municipalStatus)));
  }

  function revealMunicipalProgressSelection() {
    const row = selectedMunicipality();
    if (!row) return;
    // An explicit municipal selection must remain visible, even after a filter.
    if (!matchesMunicipalProgressFilter(row)) {
      state.coverageBand = '';
      state.municipalStatus = '';
    }
    const matchesSearch = normalizeText(`${row.municipality} ${row.uf}`).includes(normalizeText(state.municipalSearch));
    if (!matchesSearch) state.municipalSearch = '';
    const index = sortedMunicipalProgressRows().findIndex((item) => item.ibge === row.ibge);
    state.municipalPage = index < 0 ? 1 : Math.floor(index / MUNICIPAL_PAGE_SIZE) + 1;
  }

  async function viewMunicipalitySchools(code) {
    const town = state.municipalityByCode.get(String(code));
    if (town) window.location.href = 'diagnostico.html?uf='+town.uf+'&ibge='+town.ibge;
  }

  function renderMapCard() {
    if (state.mapAccess !== 'available') {
      return `
        <article class="washpub-card washpub-map-card" aria-labelledby="washpub-map-title">
          <div class="washpub-card-heading">
            <div>
              <p class="washpub-eyebrow">Visão territorial</p>
              <h2 id="washpub-map-title">Mapa da cobertura municipal</h2>
              <p>Malha municipal indisponível nesta execução local.</p>
            </div>
          </div>
          <div class="washpub-map-fallback">O monitoramento continua disponível pela tabela e pelo ranking.</div>
        </article>
      `;
    }

    const features = mapFocusedFeatures();
    const baseViewBox = mapViewBox(features, state.mapFocus === 'municipio' ? 0.16 : 0.018);
    const visualViewBox = zoomedMapViewBox(baseViewBox);
    const contextStates = Array.isArray(state.mapContext?.ufs) ? state.mapContext.ufs : [];
    const focusedContextState = state.selectedUf
      ? contextStates.find((row) => row.uf === state.selectedUf)
      : null;
    const visibleContextStates = state.mapFocus === 'brasil'
      ? contextStates
      : focusedContextState ? [focusedContextState] : [];
    const stateDefinitions = contextStates
      .map((row) => `<path id="washpub-map-state-${escapeAttr(row.uf)}" d="${escapeAttr(row.d)}"></path>`)
      .join('');
    const stateUses = visibleContextStates
      .map((row) => `<use href="#washpub-map-state-${escapeAttr(row.uf)}"></use>`)
      .join('');
    const paths = features.map(renderMapFeature).join('');
    const contextLabel = state.mapFocus === 'municipio' && selectedMunicipality()
      ? `Foco em ${selectedMunicipality().municipality}/${selectedMunicipality().uf}`
      : state.mapFocus === 'uf' && state.selectedUf
        ? `Foco em ${state.selectedUf}`
        : 'Visão Universo Selo UNICEF';

    return `
      <article id="washpub-map-card" class="washpub-card washpub-map-card" aria-labelledby="washpub-map-title">
        <div class="washpub-card-heading">
          <div>
            <p class="washpub-eyebrow">Visão territorial</p>
            <h2 id="washpub-map-title">Mapa da cobertura municipal</h2>
            <p>Municípios do recorte selecionado, coloridos pelo progresso da autoavaliação.${state.municipalStatus ? ` Categoria: ${escapeHtml(MUNICIPAL_PROGRESS_STATUS[state.municipalStatus].label)}.` : ''}</p>
          </div>
          <div class="washpub-map-tools" role="group" aria-label="Controles de zoom do mapa">
            <button type="button" data-action="map-zoom-in" aria-label="Aproximar mapa" ${state.mapZoom >= MAP_ZOOM_MAX ? 'disabled' : ''}>+</button>
            <button type="button" data-action="map-zoom-out" aria-label="Afastar mapa" ${state.mapZoom <= MAP_ZOOM_MIN ? 'disabled' : ''}>−</button>
            <output class="washpub-map-zoom-value" aria-label="Nível de zoom do mapa">${formatNumber(state.mapZoom * 100)}%</output>
            <button type="button" data-action="map-zoom-reset" aria-label="Redefinir zoom do mapa" ${state.mapZoom === MAP_ZOOM_MIN && !state.mapPanX && !state.mapPanY ? 'disabled' : ''}>↺</button>
          </div>
        </div>
        <div class="washpub-map-toolbar" aria-label="Controles do foco territorial">
          <span><strong>${escapeHtml(contextLabel)}</strong><small>${formatNumber(features.length)} município${features.length === 1 ? '' : 's'} participante${features.length === 1 ? '' : 's'} · pinça no trackpad para zoom</small></span>
          <div>
            <button type="button" data-action="map-brazil" ${state.mapFocus === 'brasil' ? 'aria-pressed="true"' : ''}>Ver Universo Selo UNICEF</button>
            <button type="button" data-action="map-focus-state" ${state.selectedUf ? '' : 'disabled'} ${state.mapFocus === 'uf' ? 'aria-pressed="true"' : ''}>Focar UF</button>
            <button type="button" data-action="map-focus-municipality" ${state.selectedIbge ? '' : 'disabled'} ${state.mapFocus === 'municipio' ? 'aria-pressed="true"' : ''}>Focar município</button>
          </div>
        </div>
        ${!features.length ? '<p class="washpub-empty" role="status">Nenhum município corresponde à categoria neste recorte.</p>' : ''}
        <div class="washpub-map-stage" data-map-pan-enabled="${state.mapZoom > MAP_ZOOM_MIN ? 'true' : 'false'}">
          <svg class="washpub-map-svg" viewBox="${escapeAttr(visualViewBox)}" data-base-view-box="${escapeAttr(baseViewBox)}" role="img" aria-labelledby="washpub-map-svg-title washpub-map-svg-desc" preserveAspectRatio="xMidYMid meet">
            <title id="washpub-map-svg-title">Cobertura dos municípios participantes do Selo UNICEF</title>
            <desc id="washpub-map-svg-desc">O mapa mostra os municípios participantes coloridos pela cobertura da autoavaliação.</desc>
            <defs>${stateDefinitions}</defs>
            <g class="washpub-map-base" aria-hidden="true">${stateUses}</g>
            <g class="washpub-map-participants">${paths}</g>
          </svg>
          <div id="washpub-map-tooltip" class="washpub-map-tooltip" role="status" hidden></div>
        </div>
        <div class="washpub-map-legend" aria-label="Legenda do mapa">
          <strong>Cobertura dos participantes</strong>
          <span><i class="critical"></i>${escapeHtml(municipalStatusRange('critical'))}</span>
          <span><i class="attention"></i>${escapeHtml(municipalStatusRange('attention'))}</span>
          <span><i class="near"></i>${escapeHtml(municipalStatusRange('near'))}</span>
          <span><i class="success"></i>${escapeHtml(municipalStatusRange('advanced'))}</span>
          <span><i class="context"></i>Contexto territorial neutro</span>
        </div>
      </article>
    `;
  }

  function renderMapFeature(feature) {
    const code = String(feature?.properties?.codigo_ibge || '');
    const row = state.municipalityByCode.get(code);
    const metrics = getMetrics(row);
    const tone = mapCoverageTone(metrics.coverage);
    const muted = state.coverageBand && tone !== state.coverageBand;
    const selected = state.selectedIbge === code;
    const label = `${row?.municipality || 'Município'} / ${row?.uf || 'UF'}: ${formatPct(metrics.coverage)} de cobertura; ${formatNumber(metrics.pending)} pendentes; faltam ${formatNumber(metrics.missingToTarget)} para 90%.`;
    return `
      <path
        class="washpub-map-municipality washpub-map-municipality--${escapeAttr(tone)} ${muted ? 'is-muted' : ''} ${selected ? 'is-selected' : ''}"
        d="${escapeAttr(geometryPath(feature.geometry))}"
        data-map-ibge="${escapeAttr(code)}"
        aria-label="${escapeAttr(label)}"
        vector-effect="non-scaling-stroke"
      >
        <title>${escapeHtml(label)}</title>
      </path>
    `;
  }

  function renderSchoolLocationCard() {
    return `
      <article class="washpub-card washpub-location-card" aria-labelledby="washpub-location-title">
        <div class="washpub-card-heading">
          <div>
            <p class="washpub-eyebrow">Perfil das escolas</p>
            <h2 id="washpub-location-title">Escolas rurais e urbanas</h2>
            <p>Distribuição das escolas na seleção atual.</p>
          </div>
        </div>
        <div id="washpub-location-results" class="washpub-location-body">${renderSchoolLocationResults()}</div>
      </article>
    `;
  }

  function schoolLocationSummary() {
    const summary = {total:0, rural:0, urban:0, unclassified:0};
    for (const town of scopeMunicipalities()) {
      const scopes = state.reviewMunicipalScopes.get(town.ibge);
      summary.total += scopes.all.eligible_schools;
      summary.rural += scopes.rural.eligible_schools;
      summary.urban += scopes.urban.eligible_schools;
      summary.unclassified += scopes.not_classified.eligible_schools;
    }
    return summary;
  }

  function renderSchoolLocationResults() {
    if (state.schoolAccess === 'loading') return '<p class="washpub-muted" role="status">Carregando a distribuição das escolas…</p>';
    if (state.schoolAccess !== 'available') return '<p class="washpub-muted" role="status">Distribuição das escolas indisponível neste recorte.</p>';
    const summary = schoolLocationSummary();
    if (!summary.total) return '<p class="washpub-empty" role="status">Nenhuma escola no recorte selecionado.</p>';
    const tabLabel = state.schoolTab === 'completed' ? 'Finalizadas' : state.schoolTab === 'pending' ? 'Pendentes' : 'Todas';
    const groups = [
      { key: 'rural', label: 'Rurais', count: summary.rural },
      { key: 'urban', label: 'Urbanas', count: summary.urban },
      ...(summary.unclassified ? [{ key: 'unclassified', label: 'Localização não classificada', count: summary.unclassified }] : []),
    ];
    return `
      <p class="washpub-location-context">${escapeHtml(currentContext().label)}</p>
      <figure class="washpub-location-figure">
        <figcaption class="washpub-location-base">${formatNumber(summary.total)} escola${summary.total === 1 ? '' : 's'} · ${tabLabel}${state.schoolSearch.trim() ? ` · Busca: ${escapeHtml(state.schoolSearch.trim())}` : ''}</figcaption>
        <ul class="washpub-location-list">
          ${groups.map((group) => {
            const share = group.count / summary.total * 100;
            return `<li class="washpub-location-row washpub-location-row--${group.key}" data-school-location="${group.key}">
              <div class="washpub-location-heading"><span>${group.label}</span><strong>${escapeHtml(formatPct(share))}</strong></div>
              <div class="washpub-location-track" aria-hidden="true"><span style="width:${share}%"></span></div>
              <p class="washpub-location-count">${formatNumber(group.count)} escola${group.count === 1 ? '' : 's'}</p>
            </li>`;
          }).join('')}
        </ul>
      </figure>
      <p class="washpub-location-note">Base: totais agregados de escolas no recorte atual.${summary.unclassified ? ' A localização não classificada também integra essa base.' : ''}</p>
    `;
  }

  function refreshSchoolLocationResults() {
    const results = document.getElementById('washpub-location-results');
    if (results) results.innerHTML = renderSchoolLocationResults();
  }

  function renderSchoolPanel() {
    return '<section class="washpub-card" aria-label="Downloads agregados"><h2>Resultados do recorte</h2><p>Esta versão de teste apresenta somente totais agregados por município.</p><button type="button" class="washpub-button washpub-button--primary" data-action="export-schools">Baixar resumo municipal — CSV</button></section>';
  }

  function schoolTabButton(tab, label, count) {
    const selected = state.schoolTab === tab;
    return `
      <button
        id="washpub-tab-${escapeAttr(tab)}"
        class="washpub-tab"
        type="button"
        role="tab"
        aria-selected="${selected ? 'true' : 'false'}"
        data-school-tab="${escapeAttr(tab)}"
      >
        ${escapeHtml(label)} <span>${formatNumber(count)}</span>
      </button>
    `;
  }

  function renderSchoolResults(rows) {
    if (state.schoolAccess === 'loading') {
      return '<div class="washpub-empty">Carregando lista operacional de escolas…</div>';
    }

    const sorted = sortSchoolRows(rows);
    const total = sorted.length;
    const pageCount = Math.max(1, Math.ceil(total / SCHOOL_PAGE_SIZE));
    state.schoolPage = Math.max(1, Math.min(state.schoolPage, pageCount));

    if (!total) {
      return `
        <div class="washpub-empty">
          <strong>Nenhuma escola encontrada.</strong>
          <span>Ajuste a busca ou limpe os filtros do recorte.</span>
        </div>
      `;
    }

    const includeLocation = shouldShowLocationColumn(sorted);
    const start = (state.schoolPage - 1) * SCHOOL_PAGE_SIZE;
    const end = Math.min(start + SCHOOL_PAGE_SIZE, total);
    const pageRows = sorted.slice(start, end);

    return `
      <div class="washpub-table-shell">
        <table class="washpub-table washpub-school-table${includeLocation ? ' has-location' : ' no-location'}">
          <caption class="p45-sr-only">Escolas do recorte e situação da autoavaliação</caption>
          <colgroup>
            <col class="washpub-school-col--inep">
            <col class="washpub-school-col--name">
            <col class="washpub-school-col--municipality">
            <col class="washpub-school-col--uf">
            ${includeLocation ? '<col class="washpub-school-col--location">' : ''}
            <col class="washpub-school-col--status">
          </colgroup>
          <thead>
            <tr>
              ${schoolHeader('inep', 'INEP')}
              ${schoolHeader('school_name', 'Escola')}
              ${schoolHeader('municipality', 'Município')}
              ${schoolHeader('uf', 'UF')}
              ${includeLocation ? schoolHeader('location_value', 'Localização') : ''}
              ${schoolHeader('response_status', 'Situação da autoavaliação')}
            </tr>
          </thead>
          <tbody>
            ${pageRows.map((row) => renderSchoolRow(row, includeLocation)).join('')}
          </tbody>
        </table>
      </div>
      <div class="washpub-results-bar">
        <span>Mostrando <strong>${formatNumber(start + 1)} a ${formatNumber(end)}</strong> de <strong>${formatNumber(total)}</strong> escolas</span>
        <nav class="washpub-pagination" aria-label="Paginação das escolas">
          ${renderPagination(pageCount)}
        </nav>
      </div>
    `;
  }

  function schoolHeader(key, label) {
    const active = state.schoolSort.key === key;
    return `
      <th scope="col" aria-sort="${active ? (state.schoolSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}">
        <button class="washpub-sort-button ${active ? 'is-active' : ''}" type="button" data-school-sort="${escapeAttr(key)}" data-sort-dir="${escapeAttr(active ? state.schoolSort.direction : 'none')}">
          ${escapeHtml(label)}
        </button>
      </th>
    `;
  }

  function renderSchoolRow(row, includeLocation) {
    return `
      <tr class="washpub-school-row">
        <td class="washpub-school-cell--inep" data-label="INEP">${escapeHtml(row.inep || '—')}</td>
        <td class="washpub-school-cell--name" data-label="Escola" title="${escapeAttr(row.school_name || '—')}"><strong>${escapeHtml(row.school_name || '—')}</strong></td>
        <td class="washpub-school-cell--municipality" data-label="Município/UF">${escapeHtml(row.municipality || '—')}<span class="washpub-school-mobile-uf">/${escapeHtml(row.uf || '—')}</span></td>
        <td class="washpub-school-cell--uf" data-label="UF">${escapeHtml(row.uf || '—')}</td>
        ${includeLocation ? `<td class="washpub-school-cell--location" data-label="Localização">${escapeHtml(row.location_value || '—')}</td>` : ''}
        <td class="washpub-school-cell--status" data-label="Situação da autoavaliação">${statusPill(row.response_status)}</td>
      </tr>
    `;
  }

  function statusPill(status) {
    const completed = status === 'COMPLETED';
    return `
      <span class="washpub-status-pill ${completed ? 'washpub-status-pill--completed' : 'washpub-status-pill--pending'}">
        ${completed ? 'Finalizada' : 'Pendente'}
      </span>
    `;
  }

  function renderPagination(pageCount) {
    if (pageCount <= 1) return '';
    const pages = compactPageItems(pageCount, state.schoolPage);
    return `
      <button class="washpub-page-button" type="button" data-school-page="${state.schoolPage - 1}" ${state.schoolPage === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
      ${pages.map((page) => page === '…'
        ? '<span class="washpub-muted" aria-hidden="true">…</span>'
        : `<button class="washpub-page-button" type="button" data-school-page="${page}" ${page === state.schoolPage ? 'aria-current="page"' : ''}>${formatNumber(page)}</button>`).join('')}
      <button class="washpub-page-button" type="button" data-school-page="${state.schoolPage + 1}" ${state.schoolPage === pageCount ? 'disabled' : ''} aria-label="Próxima página">›</button>
    `;
  }

  function renderSourceCard() {
    return `
      <section class="washpub-source-card" aria-label="Fonte e referência">
        <p>
          Fonte: Pesquisa 45 — Autoavaliação WASH nas escolas. Dados atualizados em ${escapeHtml(formatDate(state.metadata?.source_date))}.
          Cobertura = escolas com autoavaliação finalizada ÷ escolas elegíveis. Esta visão não calcula nota WASH. ${escapeHtml(D.description)}
        </p>
      </section>
    `;
  }

  function bindEvents() {
    root.addEventListener('change', (event) => {
      if (event.target.id === 'washpub-uf') {
        handleUfChange(event.target.value).catch(showError);
      } else if (event.target.id === 'washpub-municipality') {
        handleMunicipalityChange(event.target.value).catch(showError);
      } else if (event.target.id === 'washpub-coverage-band') {
        applyMunicipalStatusFilter(event.target.value === 'success' ? 'advanced' : event.target.value);
      } else if (event.target.id === 'washpub-municipal-sort') {
        state.municipalSort = event.target.value;
        state.municipalPage = 1;
        refreshMunicipalProgressResults();
      }
    });

    root.addEventListener('input', (event) => {
      if (event.target.id === 'washpub-school-search') {
        state.schoolSearch = event.target.value;
        state.schoolPage = 1;
        refreshSchoolResults();
      } else if (event.target.id === 'washpub-municipal-search') {
        state.municipalSearch = event.target.value;
        state.municipalPage = 1;
        refreshMunicipalProgressResults();
      }
    });

    root.addEventListener('wheel', (event) => {
      const mapStage = event.target.closest?.('.washpub-map-stage');
      const isTrackpadPinch = event.ctrlKey || event.metaKey;
      if (!mapStage || !isTrackpadPinch || state.mapAccess !== 'available') return;
      event.preventDefault();
      const modeMultiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
      const delta = Number(event.deltaY) * modeMultiplier;
      if (!Number.isFinite(delta) || delta === 0) return;
      state.mapGestureZoomAccumulator += delta;
      if (Math.abs(state.mapGestureZoomAccumulator) >= MAP_GESTURE_LIMIT) {
        const direction = state.mapGestureZoomAccumulator < 0 ? 1 : -1;
        state.mapGestureZoomAccumulator = 0;
        state.mapGestureChanged = changeMapZoom(direction * MAP_GESTURE_ZOOM_STEP, { announceChange: false }) || state.mapGestureChanged;
      }
      window.clearTimeout(state.mapGestureAnnouncementTimer);
      state.mapGestureAnnouncementTimer = window.setTimeout(() => {
        state.mapGestureZoomAccumulator = 0;
        if (state.mapGestureChanged) announce(`Zoom do mapa ajustado para ${formatNumber(state.mapZoom * 100)}%.`);
        state.mapGestureChanged = false;
      }, 180);
    }, { passive: false });

    root.addEventListener('pointerdown', startMapPan);
    root.addEventListener('pointermove', (event) => {
      if (moveMapPan(event)) return;
      const mapPath = event.target.closest?.('[data-map-ibge]');
      if (mapPath) showMapTooltip(mapPath, event);
      else hideMapTooltip();
    });
    root.addEventListener('pointerup', finishMapPan);
    root.addEventListener('pointercancel', finishMapPan);
    root.addEventListener('pointerleave', hideMapTooltip);

    root.addEventListener('click', (event) => {
      if (state.suppressNextMapClick && event.target.closest('.washpub-map-stage')) {
        event.preventDefault();
        return;
      }

      const mapPath = event.target.closest('[data-map-ibge]');
      if (mapPath) {
        toggleMunicipalitySelection(mapPath.dataset.mapIbge, event.target).catch(showError);
        return;
      }

      const municipalityButton = event.target.closest('[data-select-municipality]');
      if (municipalityButton) {
        toggleMunicipalitySelection(municipalityButton.dataset.selectMunicipality, municipalityButton).catch(showError);
        return;
      }

      const schoolsButton = event.target.closest('[data-municipal-schools]');
      if (schoolsButton) {
        viewMunicipalitySchools(schoolsButton.dataset.municipalSchools).catch(showError);
        return;
      }

      const statusButton = event.target.closest('[data-municipal-status]');
      if (statusButton) {
        applyMunicipalStatusFilter(statusButton.dataset.municipalStatus || '', { toggle: true });
        return;
      }

      const municipalPageButton = event.target.closest('[data-municipal-page]');
      if (municipalPageButton) {
        if (municipalPageButton.disabled) return;
        const page = Number(municipalPageButton.dataset.municipalPage);
        if (Number.isInteger(page) && page > 0 && page <= municipalProgressPage().pageCount) {
          state.municipalPage = page;
          refreshMunicipalProgressResults();
          document.getElementById('washpub-municipal-results')?.querySelector('[aria-current="page"]')?.focus();
        }
        return;
      }

      const rankRow = event.target.closest('[data-rank-row]');
      if (rankRow && !event.target.closest('button, input, select, a')) {
        toggleMunicipalitySelection(rankRow.dataset.rankRow, rankRow.querySelector('[data-select-municipality]')).catch(showError);
        return;
      }

      const tabButton = event.target.closest('[data-school-tab]');
      if (tabButton) {
        state.schoolTab = tabButton.dataset.schoolTab || 'all';
        state.schoolPage = 1;
        renderApp();
        return;
      }

      const sortButton = event.target.closest('[data-school-sort]');
      if (sortButton) {
        updateSchoolSort(sortButton.dataset.schoolSort);
        return;
      }

      const pageButton = event.target.closest('[data-school-page]');
      if (pageButton) {
        const page = Number(pageButton.dataset.schoolPage);
        if (Number.isFinite(page)) {
          state.schoolPage = page;
          refreshSchoolResults();
        }
        return;
      }

      const actionElement = event.target.closest('[data-action]');
      const action = actionElement?.dataset.action;
      if (action === 'clear-selection') clearSelection().catch(showError);
      else if (action === 'scroll-schools') document.getElementById('washpub-schools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (action === 'map-brazil') focusMap('brasil');
      else if (action === 'map-focus-state') focusMap('uf');
      else if (action === 'map-focus-municipality') focusMap('municipio');
      else if (action === 'map-zoom-in') changeMapZoom(MAP_ZOOM_STEP);
      else if (action === 'map-zoom-out') changeMapZoom(-MAP_ZOOM_STEP);
      else if (action === 'map-zoom-reset') resetMapZoom();
      else if (action === 'export-schools') exportSchools();
    });

    drawerRoot?.addEventListener('click', (event) => {
      if (event.target.closest('[data-drawer-close]')) closeDrawer();
      const action = event.target.closest('[data-drawer-action]')?.dataset.drawerAction;
      if (action === 'select' && state.drawerMunicipality) {
        closeDrawer();
        document.getElementById('washpub-schools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDrawer();
    });
  }

  async function handleUfChange(uf) {
    state.selectedUf = uf;
    state.selectedIbge = '';
    state.previousUfBeforeMunicipality = '';
    state.municipalPage = 1;
    state.schoolPage = 1;
    state.schoolSearch = '';
    state.mapFocus = uf ? 'uf' : 'brasil';
    resetMapNavigationState();
    renderLoading(uf ? `Carregando escolas de ${uf}…` : 'Carregando escolas do Universo Selo UNICEF…');
    await loadSchoolsForCurrentScope();
    renderApp();
    announce(uf ? `Recorte atualizado para ${uf}.` : 'Recorte atualizado para Universo Selo UNICEF.');
  }

  async function handleMunicipalityChange(ibge) {
    state.selectedIbge = ibge;
    state.schoolPage = 1;
    state.schoolSearch = '';
    if (ibge) {
      const row = state.municipalityByCode.get(String(ibge));
      state.selectedUf = row?.uf || state.selectedUf;
      state.mapFocus = 'municipio';
      revealMunicipalProgressSelection();
    } else {
      state.mapFocus = state.selectedUf ? 'uf' : 'brasil';
    }
    resetMapNavigationState();
    renderLoading('Carregando escolas do recorte…');
    await loadSchoolsForCurrentScope();
    renderApp();
    announce(`Recorte atualizado para ${currentContext().label}.`);
  }

  async function clearSelection() {
    state.selectedUf = '';
    state.selectedIbge = '';
    state.previousUfBeforeMunicipality = '';
    state.coverageBand = '';
    state.municipalStatus = '';
    state.municipalSearch = '';
    state.municipalPage = 1;
    state.schoolTab = 'all';
    state.schoolSearch = '';
    state.schoolPage = 1;
    state.mapFocus = 'brasil';
    resetMapNavigationState();
    renderLoading('Carregando escolas do Universo Selo UNICEF…');
    await loadSchoolsForCurrentScope();
    renderApp();
    announce('Seleção limpa. Você está vendo o Universo Selo UNICEF.');
  }

  async function toggleMunicipalitySelection(code, trigger) {
    const row = state.municipalityByCode.get(String(code));
    if (!row) return;
    closeDrawer();

    if (state.selectedIbge === row.ibge) {
      state.selectedIbge = '';
      state.selectedUf = state.previousUfBeforeMunicipality || row.uf;
      state.previousUfBeforeMunicipality = '';
      state.mapFocus = state.selectedUf ? 'uf' : 'brasil';
    } else {
      state.previousUfBeforeMunicipality = state.selectedUf;
      state.selectedUf = row.uf;
      state.selectedIbge = row.ibge;
      state.mapFocus = 'municipio';
      openDrawer(row, trigger);
    }

    state.schoolPage = 1;
    state.schoolSearch = '';
    resetMapNavigationState();
    if (state.selectedIbge) revealMunicipalProgressSelection();
    else state.municipalPage = 1;
    await loadSchoolsForCurrentScope();
    renderApp();
  }

  async function loadSchoolsForCurrentScope() {
    state.schoolAccess = 'available';
  }

  async function fetchSchoolIndex() { return []; }

  function currentContext() {
    const municipality = selectedMunicipality();
    if (municipality) return { level: 'municipio', label: `${municipality.municipality}/${municipality.uf}`, row: municipality };
    const uf = selectedUf();
    const context = uf
      ? { level: 'estado', label: `Estado de ${uf.uf}`, row: uf }
      : { level: 'brasil', label: 'Universo Selo UNICEF', row: state.national };
    if (!state.municipalStatus && !state.coverageBand) return context;
    const municipalities = scopeMunicipalities();
    const totals = municipalities.reduce((sum, row) => {
      const metrics = getMetrics(row);
      sum.eligible_schools += metrics.eligible;
      sum.completed_schools += metrics.completed;
      sum.pending_schools += metrics.pending;
      return sum;
    }, { municipalities: municipalities.length, eligible_schools: 0, completed_schools: 0, pending_schools: 0 });
    totals.coverage_pct = totals.eligible_schools ? totals.completed_schools / totals.eligible_schools * 100 : 0;
    const category = MUNICIPAL_PROGRESS_STATUS[state.municipalStatus || (state.coverageBand === 'success' ? 'advanced' : state.coverageBand)];
    return { ...context, label: `${context.label} · ${category?.label || 'Recorte'}`, row: totals };
  }

  function selectedMunicipality() {
    return state.selectedIbge ? state.municipalityByCode.get(String(state.selectedIbge)) || null : null;
  }

  function selectedUf() {
    return state.selectedUf ? state.ufs.find((row) => row.uf === state.selectedUf) || null : null;
  }

  function scopeMunicipalities() {
    const municipality = selectedMunicipality();
    if (municipality) return [municipality].filter(matchesMunicipalProgressFilter);
    return municipalProgressScope().filter(matchesMunicipalProgressFilter);
  }

  function getMetrics(row) {
    const safeRow = row || {};
    const eligible = Number(safeRow.eligible_schools || 0);
    const completed = Number(safeRow.completed_schools || 0);
    const pending = Number.isFinite(Number(safeRow.pending_schools))
      ? Number(safeRow.pending_schools)
      : Math.max(0, eligible - completed);
    const coverage = Number.isFinite(Number(safeRow.coverage_pct))
      ? Number(safeRow.coverage_pct)
      : eligible ? completed / eligible * 100 : 0;
    const missingToTarget = Number(
      safeRow.schools_needed_for_90_national
      ?? safeRow.schools_needed_for_90_uf
      ?? safeRow.needed_for_90_municipal
      ?? Math.max(0, Math.ceil(eligible * TARGET / 100) - completed)
    );

    return {
      eligible,
      completed,
      pending,
      coverage,
      missingToTarget: Math.max(0, missingToTarget),
      municipalities: Number(safeRow.municipalities || 0),
    };
  }

  function mapCoverageTone(value) {
    const key = municipalStatusKey(value);
    return key === 'advanced' ? 'success' : key || 'nodata';
  }

  function matchesCoverageBand(row) {
    return !state.coverageBand || mapCoverageTone(getMetrics(row).coverage) === state.coverageBand;
  }

  function mapFocusedFeatures() {
    const features = (Array.isArray(state.mapGeojson?.features) ? state.mapGeojson.features : []).filter((feature) => {
      const row = state.municipalityByCode.get(String(feature?.properties?.codigo_ibge));
      return row && matchesMunicipalProgressFilter(row)
        && (!(state.municipalStatus || state.coverageBand) || !state.selectedUf || row.uf === state.selectedUf);
    });
    if (state.mapFocus === 'municipio' && state.selectedIbge) {
      return features.filter((feature) => String(feature?.properties?.codigo_ibge) === state.selectedIbge);
    }
    if (state.mapFocus === 'uf' && state.selectedUf) {
      return features.filter((feature) => feature?.properties?.uf === state.selectedUf);
    }
    return features;
  }

  function projectMapCoordinate(longitude, latitude) {
    const projectedLongitude = Number(longitude);
    const projectedLatitude = -Number(latitude);
    return Number.isFinite(projectedLongitude) && Number.isFinite(projectedLatitude)
      ? { x: projectedLongitude, y: projectedLatitude }
      : null;
  }

  function geometryPath(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates)) return '';
    const ringPath = (ring) => {
      if (!Array.isArray(ring) || !ring.length) return '';
      const points = ring.map((point, index) => {
        const projected = projectMapCoordinate(point?.[0], point?.[1]);
        if (!projected) return '';
        return `${index ? 'L' : 'M'}${projected.x.toFixed(4)} ${projected.y.toFixed(4)}`;
      }).filter(Boolean);
      return points.length ? `${points.join('')}Z` : '';
    };
    if (geometry.type === 'Polygon') return geometry.coordinates.map(ringPath).join('');
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.flatMap((polygon) => polygon.map(ringPath)).join('');
    }
    return '';
  }

  function visitMapCoordinates(value, bounds) {
    if (!Array.isArray(value) || !value.length) return;
    if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
      const projected = projectMapCoordinate(value[0], value[1]);
      if (!projected) return;
      bounds[0] = Math.min(bounds[0], projected.x);
      bounds[1] = Math.min(bounds[1], projected.y);
      bounds[2] = Math.max(bounds[2], projected.x);
      bounds[3] = Math.max(bounds[3], projected.y);
      return;
    }
    value.forEach((item) => visitMapCoordinates(item, bounds));
  }

  function mapViewBox(features, marginRatio = 0.018) {
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    features.forEach((feature) => visitMapCoordinates(feature?.geometry?.coordinates, bounds));
    if (!bounds.every(Number.isFinite)) return '-74 -6 40 29';
    const width = Math.max(0.4, bounds[2] - bounds[0]);
    const height = Math.max(0.4, bounds[3] - bounds[1]);
    const margin = Math.max(0.12, Math.max(width, height) * marginRatio);
    return `${(bounds[0] - margin).toFixed(4)} ${(bounds[1] - margin).toFixed(4)} ${(width + margin * 2).toFixed(4)} ${(height + margin * 2).toFixed(4)}`;
  }

  function parsedMapViewBox(value) {
    const values = String(value || '').trim().split(/\s+/).map(Number);
    return values.length === 4 && values.every(Number.isFinite) ? values : null;
  }

  function normalizedMapZoom(value) {
    return Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, Number(value) || MAP_ZOOM_MIN));
  }

  function zoomedMapViewBox(baseViewBox, zoom = state.mapZoom) {
    const values = parsedMapViewBox(baseViewBox);
    if (!values) return baseViewBox;
    const [x, y, width, height] = values;
    const scale = normalizedMapZoom(zoom);
    const zoomedWidth = Math.max(0.0001, width / scale);
    const zoomedHeight = Math.max(0.0001, height / scale);
    const maximumPanX = Math.max(0, (width - zoomedWidth) / 2);
    const maximumPanY = Math.max(0, (height - zoomedHeight) / 2);
    state.mapPanX = Math.min(maximumPanX, Math.max(-maximumPanX, Number(state.mapPanX) || 0));
    state.mapPanY = Math.min(maximumPanY, Math.max(-maximumPanY, Number(state.mapPanY) || 0));
    const centerX = x + width / 2 + state.mapPanX;
    const centerY = y + height / 2 + state.mapPanY;
    return `${(centerX - zoomedWidth / 2).toFixed(4)} ${(centerY - zoomedHeight / 2).toFixed(4)} ${zoomedWidth.toFixed(4)} ${zoomedHeight.toFixed(4)}`;
  }

  function updateMapZoomPresentation() {
    const card = document.getElementById('washpub-map-card');
    const map = card?.querySelector('.washpub-map-svg');
    const baseViewBox = map?.dataset.baseViewBox;
    if (!card || !map || !baseViewBox) {
      renderApp();
      return;
    }
    map.setAttribute('viewBox', zoomedMapViewBox(baseViewBox));
    const stage = card.querySelector('.washpub-map-stage');
    if (stage) stage.dataset.mapPanEnabled = String(state.mapZoom > MAP_ZOOM_MIN);
    const output = card.querySelector('.washpub-map-zoom-value');
    const zoomIn = card.querySelector('[data-action="map-zoom-in"]');
    const zoomOut = card.querySelector('[data-action="map-zoom-out"]');
    const reset = card.querySelector('[data-action="map-zoom-reset"]');
    if (output) output.textContent = `${formatNumber(state.mapZoom * 100)}%`;
    if (zoomIn) zoomIn.disabled = state.mapZoom >= MAP_ZOOM_MAX;
    if (zoomOut) zoomOut.disabled = state.mapZoom <= MAP_ZOOM_MIN;
    if (reset) reset.disabled = state.mapZoom === MAP_ZOOM_MIN && !state.mapPanX && !state.mapPanY;
  }

  function changeMapZoom(delta, options = {}) {
    if (state.mapAccess !== 'available') return false;
    const nextZoom = normalizedMapZoom(state.mapZoom + delta);
    if (nextZoom === state.mapZoom) return false;
    state.mapZoom = nextZoom;
    updateMapZoomPresentation();
    if (options.announceChange !== false) announce(`Zoom do mapa ajustado para ${formatNumber(state.mapZoom * 100)}%.`);
    return true;
  }

  function resetMapNavigationState() {
    state.mapZoom = MAP_ZOOM_MIN;
    state.mapPanX = 0;
    state.mapPanY = 0;
  }

  function resetMapZoom() {
    if (state.mapZoom === MAP_ZOOM_MIN && !state.mapPanX && !state.mapPanY) return;
    resetMapNavigationState();
    updateMapZoomPresentation();
    announce('Zoom do mapa redefinido.');
  }

  function focusMap(scope) {
    if (scope === 'uf' && !state.selectedUf) return;
    if (scope === 'municipio' && !state.selectedIbge) return;
    state.mapFocus = scope;
    resetMapNavigationState();
    renderApp();
  }

  function startMapPan(event) {
    const stage = event.target.closest?.('.washpub-map-stage');
    const map = stage?.querySelector('.washpub-map-svg');
    const viewBox = parsedMapViewBox(map?.getAttribute('viewBox'));
    const bounds = stage?.getBoundingClientRect();
    if (!stage || !map || !viewBox || !bounds?.width || !bounds?.height
      || state.mapZoom <= MAP_ZOOM_MIN || event.button !== 0 || event.isPrimary === false) return;
    state.mapPanPointer = {
      pointerId: event.pointerId,
      stage,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: state.mapPanX,
      startPanY: state.mapPanY,
      viewWidth: viewBox[2],
      viewHeight: viewBox[3],
      stageWidth: bounds.width,
      stageHeight: bounds.height,
      moved: false,
    };
    stage.setPointerCapture?.(event.pointerId);
  }

  function moveMapPan(event) {
    const pointer = state.mapPanPointer;
    if (!pointer || event.pointerId !== pointer.pointerId) return false;
    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;
    if (!pointer.moved && Math.hypot(deltaX, deltaY) < 4) return false;
    pointer.moved = true;
    event.preventDefault();
    state.mapPanX = pointer.startPanX - deltaX * pointer.viewWidth / pointer.stageWidth;
    state.mapPanY = pointer.startPanY - deltaY * pointer.viewHeight / pointer.stageHeight;
    pointer.stage.classList.add('is-panning');
    hideMapTooltip();
    updateMapZoomPresentation();
    return true;
  }

  function finishMapPan(event) {
    const pointer = state.mapPanPointer;
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    const { stage, moved, pointerId } = pointer;
    stage.classList.remove('is-panning');
    if (stage.hasPointerCapture?.(pointerId)) stage.releasePointerCapture(pointerId);
    state.mapPanPointer = null;
    if (!moved) return;
    state.suppressNextMapClick = true;
    window.setTimeout(() => { state.suppressNextMapClick = false; }, 0);
    announce('Posição do mapa ajustada.');
  }

  function showMapTooltip(path, event) {
    const tooltip = document.getElementById('washpub-map-tooltip');
    const stage = path?.closest('.washpub-map-stage');
    const row = state.municipalityByCode.get(String(path?.dataset.mapIbge || ''));
    if (!tooltip || !stage || !row) return;
    const metrics = getMetrics(row);
    const tooltipKey = `municipality:${row.ibge}`;
    if (tooltip.dataset.key !== tooltipKey) {
      tooltip.dataset.key = tooltipKey;
      tooltip.innerHTML = `
        <strong>${escapeHtml(row.municipality)}/${escapeHtml(row.uf)}</strong>
        <span>Cobertura <b>${escapeHtml(formatPct(metrics.coverage))}</b></span>
        <span>Elegíveis <b>${formatNumber(metrics.eligible)}</b> · Finalizadas <b>${formatNumber(metrics.completed)}</b></span>
        <span>Pendentes <b>${formatNumber(metrics.pending)}</b> · Faltam para 90% <b>${formatNumber(metrics.missingToTarget)}</b></span>
      `;
    }
    tooltip.hidden = false;
    positionMapTooltip(tooltip, stage, event);
  }

  function hideMapTooltip() {
    const tooltip = document.getElementById('washpub-map-tooltip');
    if (!tooltip) return;
    tooltip.hidden = true;
    tooltip.dataset.key = '';
  }

  function positionMapTooltip(tooltip, stage, event) {
    const stageRect = stage.getBoundingClientRect();
    const cursorX = event.clientX - stageRect.left;
    const cursorY = event.clientY - stageRect.top;
    const offset = 18;
    const margin = 8;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const maximumX = Math.max(margin, stageRect.width - width - margin);
    const maximumY = Math.max(margin, stageRect.height - height - margin);
    const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(value, maximum));
    tooltip.style.left = `${clamp(cursorX + offset, margin, maximumX)}px`;
    tooltip.style.top = `${clamp(cursorY + offset, margin, maximumY)}px`;
  }

  function openDrawer(row, trigger) {
    const metrics = getMetrics(row);
    state.drawerMunicipality = row;
    state.drawerTrigger = trigger || null;
    state.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';



    drawerRoot.innerHTML = `
      <div class="washpub-drawer-backdrop" data-drawer-close></div>
      <aside class="washpub-drawer" role="dialog" aria-modal="true" aria-labelledby="washpub-drawer-title" tabindex="-1">
        <header class="washpub-drawer__head">
          <div>
            <p class="washpub-eyebrow">Acompanhamento municipal</p>
            <h2 id="washpub-drawer-title">${escapeHtml(row.municipality)}/${escapeHtml(row.uf)}</h2>
            <p class="washpub-muted">Resumo operacional da autoavaliação.</p>
          </div>
          <button class="washpub-icon-button" type="button" data-drawer-close aria-label="Fechar painel">×</button>
        </header>
        <div class="washpub-drawer__body">
          <div class="washpub-drawer-metrics">
            <div><span>Cobertura</span><strong>${escapeHtml(formatPct(metrics.coverage))}</strong></div>
            <div><span>Elegíveis</span><strong>${formatNumber(metrics.eligible)}</strong></div>
            <div><span>Finalizadas</span><strong>${formatNumber(metrics.completed)}</strong></div>
            <div><span>Pendentes</span><strong>${formatNumber(metrics.pending)}</strong></div>
            <div><span>Faltam para 90%</span><strong>${formatNumber(metrics.missingToTarget)}</strong></div>
            <div><span>Status</span><strong>${metrics.coverage >= TARGET ? 'Meta atingida' : 'Mobilização necessária'}</strong></div>
          </div>

          <button class="washpub-button washpub-button--primary" type="button" data-drawer-action="select">Ver município no painel</button>
        </div>
      </aside>
    `;
    drawerRoot.querySelector('.washpub-drawer')?.focus();
  }

  function closeDrawer() {
    if (!state.drawerMunicipality) return;
    drawerRoot.innerHTML = '';
    document.body.style.overflow = state.previousBodyOverflow;
    state.drawerTrigger?.focus?.();
    state.drawerMunicipality = null;
    state.drawerTrigger = null;
  }

  function filteredSchoolRows(options = {}) {
    const query = normalizeText(state.schoolSearch);
    const allowedMunicipalities = new Set(scopeMunicipalities().map((row) => row.ibge));
    return state.schoolRows.filter((row) => {
      if (state.selectedUf && row.uf !== state.selectedUf) return false;
      if (state.selectedIbge && row.ibge !== state.selectedIbge) return false;
      if (!allowedMunicipalities.has(row.ibge)) return false;
      if (!options.ignoreTab) {
        if (state.schoolTab === 'completed' && !isCompletedSchool(row)) return false;
        if (state.schoolTab === 'pending' && isCompletedSchool(row)) return false;
      }
      if (!query) return true;
      return normalizeText([
        row.inep,
        row.school_name,
        row.municipality,
        row.uf,
        statusLabel(row.response_status),
      ].join(' ')).includes(query);
    });
  }

  function sortSchoolRows(rows) {
    const direction = state.schoolSort.direction === 'desc' ? -1 : 1;
    const key = state.schoolSort.key;
    return rows.slice().sort((a, b) => {
      const av = schoolSortValue(a, key);
      const bv = schoolSortValue(b, key);
      const compare = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' });
      if (compare !== 0) return compare * direction;
      return `${a.uf} ${a.municipality} ${a.school_name}`.localeCompare(`${b.uf} ${b.municipality} ${b.school_name}`, 'pt-BR', { sensitivity: 'base' });
    });
  }

  function schoolSortValue(row, key) {
    if (key === 'response_status') return row.response_status === 'PENDING' ? '0' : '1';
    return row[key] || '';
  }

  function updateSchoolSort(key) {
    if (!key) return;
    if (state.schoolSort.key === key) {
      state.schoolSort.direction = state.schoolSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      state.schoolSort = { key, direction: 'asc' };
    }
    state.schoolPage = 1;
    refreshSchoolResults();
  }

  function refreshSchoolResults() {
    const results = document.getElementById('washpub-school-results');
    const rows = filteredSchoolRows();
    if (!results) {
      renderApp();
      return;
    }
    results.innerHTML = renderSchoolResults(rows);
    refreshSchoolLocationResults();
    const exportButton = root.querySelector('[data-action="export-schools"]');
    if (exportButton) exportButton.disabled = rows.length === 0;
  }

  function isCompletedSchool(row) {
    return row.response_status === 'COMPLETED';
  }

  function shouldShowLocationColumn(rows) {
    return rows.some((row) => row.location_value);
  }

  function exportSchools() {
    const rows = scopeMunicipalities();
    const headers = ['codigo_ibge','municipio','uf','elegiveis','finalizadas','pendentes','cobertura_pct','faltam_para_90'];
    const values = rows.map(row => [row.ibge,row.municipality,row.uf,row.eligible_schools,row.completed_schools,row.pending_schools,row.coverage_pct,row.needed_for_90_municipal]);
    D.download('resumo_municipal_wash.csv', [headers,...values].map(row=>row.map(csvCell).join(';')).join('\n'));
  }

  function compactPageItems(total, current) {
    const visible = new Set([1, total, current, current - 1, current + 1]);
    if (current <= 3) {
      visible.add(2);
      visible.add(3);
    }
    if (current >= total - 2) {
      visible.add(total - 1);
      visible.add(total - 2);
    }
    const pages = Array.from(visible).filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
    const items = [];
    pages.forEach((page, index) => {
      if (index > 0 && page - pages[index - 1] > 1) items.push('…');
      items.push(page);
    });
    return items;
  }

  function statusLabel(status) {
    return status === 'COMPLETED' ? 'Finalizada' : 'Pendente';
  }

  function formatNumber(value) {
    return numberFormatter.format(Number(value || 0));
  }

  function formatPct(value) {
    return `${pctFormatter.format(Number(value || 0))}%`;
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }

  function fileScopeSuffix() {
    const municipality = selectedMunicipality();
    if (municipality) return `${municipality.uf}_${municipality.ibge}`;
    if (state.selectedUf) return state.selectedUf;
    return 'SELO_UNICEF';
  }

  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  async function fetchJson(url) {
    return window.WASH_REVIEW_DATA.read(url);
  }

  function updateFooterMeta() {
    const footerMeta = document.getElementById('washpub-footer-meta');
    if (!footerMeta) return;
    footerMeta.textContent = `Dados atualizados em ${formatDate(state.metadata?.source_date)} · VERSÃO DE TESTE`;
  }

  function announce(message) {
    if (!live) return;
    live.textContent = '';
    window.setTimeout(() => { live.textContent = message; }, 10);
  }

  function showError(error) {
    announce(error?.message || String(error || 'Erro inesperado.'));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function normalizeText(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
})();
