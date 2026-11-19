const A = v => Array.isArray(v) ? v : [];
const O = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const uniq = v => [...new Set(v.filter(Boolean))];
const key = s => String(s?.id || s?.url || s?.link || s?.title || '').trim();
const src = s => String(s?.sourceGroup || s?.source || 'unknown').trim().toLowerCase();
const LOW_TS = new Set(['missing', 'invalid', 'fetch_time_fallback', 'unknown']);

function timeMs(s) {
  for (const x of [s?.publishedAt, s?.pubDate, s?.date, s?.timestamp, s?.timeMs]) {
    const n = Number(x);
    if (Number.isFinite(n) && n > 0) return n < 10_000_000_000 ? n * 1000 : n;
  }
  return 0;
}

function lowTs(s) {
  return String(s?.timestampConfidence || '').toLowerCase() === 'low' ||
    LOW_TS.has(String(s?.publishedAtSource || s?.timestampSource || '').toLowerCase()) ||
    timeMs(s) <= 0;
}

function liveLike(s) {
  const t = `${s?.title || s?.headline || ''} ${s?.summary || s?.description || ''}`;
  return Boolean(s?.isBreaking || Number(s?.breakingScore || 0) > 0 || /^live\b/i.test(t) || /\b(live\s+blog|live\s+updates?|live\s+coverage|developing|ongoing)\b/i.test(t) || String(s?.url || s?.link || '').includes('/live/'));
}

function gradeFromScore(score) {
  if (score >= 88) return 'A';
  if (score >= 74) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

function toneFromGrade(grade) {
  if (grade === 'A' || grade === 'B') return 'good';
  if (grade === 'C') return 'warn';
  return 'bad';
}

function capScore(score) { return Math.max(0, Math.min(100, Math.round(score))); }
function gate(id, label, status, detail) { return { id, label, status, detail }; }
function metric(label, value, hint = '') { return { label, value, hint }; }
function row(label, value, detail = '') { return { label, value, detail }; }
function diag({ id, title, description, status = null, metrics = [], rows = [], notes = [], raw = null }) { return { id, title, description, status, metrics, rows, notes, raw }; }

function scoreGates(gates) {
  const w = { PASS: 100, WARN: 62, FAIL: 15 };
  return capScore(gates.reduce((s, g) => s + (w[g.status] ?? 40), 0) / Math.max(1, gates.length));
}

function capGrade(grade, ceiling) {
  const order = ['A', 'B', 'C', 'D', 'F'];
  return order[Math.max(order.indexOf(grade), order.indexOf(ceiling))] || 'F';
}

function gradeMax(g) { return g === 'A' ? 100 : g === 'B' ? 87 : g === 'C' ? 73 : g === 'D' ? 59 : 44; }

function makePageAudit({ target, title, gates, summary = {}, dataTrust = {}, moreDiagnostics = [], now = Date.now(), gradeCeilings = [] }) {
  let score = scoreGates(gates);
  let grade = gradeFromScore(score);
  gradeCeilings.filter(Boolean).forEach(c => { grade = capGrade(grade, c); });
  score = Math.min(score, gradeMax(grade));
  const warnings = gates.filter(g => g.status === 'WARN').map(g => g.detail);
  const failures = gates.filter(g => g.status === 'FAIL').map(g => g.detail);
  return { schemaVersion: 1, target, title, grade, score, tone: toneFromGrade(grade), generatedAt: now, summary, gates, audits: gates, dataTrust: { status: failures.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS', ...dataTrust }, moreDiagnostics, warnings, failures };
}

function snapshotStale(newsData, envelope) {
  const n = O(newsData);
  return Boolean(envelope?.freshness === 'stale' || envelope?.data?.raw?.sections?.freshness === 'stale' || envelope?.data?.raw?.sections?.data?.sectionSnapshotStaleness?.stale || n?.sectionSnapshotStaleness?.stale || n?._snapshotStale || n?.snapshotRuntimeSummary?.stale);
}

function topStats(frontPage, now, limit) {
  const top10 = A(frontPage).slice(0, limit);
  const ages = top10.map(s => { const t = timeMs(s); return t ? Math.max(0, Math.round((now - t) / 60000)) : null; });
  const freshCount = ages.filter((age, i) => age != null && (liveLike(top10[i]) ? age < 36 * 60 : age < 6 * 60)).length;
  return {
    top10,
    ages,
    topStoryAgeMinutes: ages[0] ?? null,
    lowConfidenceCount: top10.filter(lowTs).length,
    fail24hCount: ages.filter(age => age != null && age >= 24 * 60).length,
    freshCount,
    freshRatio: top10.length ? freshCount / top10.length : 0,
  };
}

export function auditMainTabQuality({ newsData = {}, weatherData = {}, breakingNews = [], settings = {}, loading = false, errors = {}, envelope = null, now = Date.now(), topStoryDisplayLimit = 10 } = {}) {
  const news = O(newsData);
  const weather = O(weatherData);
  const sectionSettings = O(settings.sections);
  const frontPage = A(news.frontPage);
  const enabledSections = ['india', 'chennai', 'local', 'world'].filter(s => sectionSettings?.[s]?.enabled !== false);
  const sectionStories = enabledSections.flatMap(s => A(news[s]));
  const allStories = [...frontPage, ...sectionStories, ...A(breakingNews)];
  const keys = allStories.map(key).filter(Boolean);
  const duplicateCount = Math.max(0, keys.length - uniq(keys).length);
  const duplicateRate = keys.length ? duplicateCount / keys.length : 0;
  const sourceGroups = uniq(allStories.map(src));
  const sectionHealth = enabledSections.map(section => {
    const stories = A(news[section]);
    const sourceGroupCount = uniq(stories.map(src)).length;
    return { section, storyCount: stories.length, sourceGroupCount, status: stories.length >= 3 && sourceGroupCount >= 2 ? 'PASS' : stories.length ? 'WARN' : 'FAIL' };
  });
  const missingSections = sectionHealth.filter(x => x.status === 'FAIL').map(x => x.section);
  const weakSections = sectionHealth.filter(x => x.status === 'WARN').map(x => x.section);
  const timestamps = allStories.map(timeMs).filter(Boolean);
  const newestAgeMinutes = timestamps.length ? Math.max(0, Math.round((now - Math.max(...timestamps)) / 60000)) : null;
  const stale = newestAgeMinutes == null || newestAgeMinutes > 360;
  const weatherCities = Object.keys(weather).filter(c => weather[c]);
  const weatherReadyCount = weatherCities.filter(c => weather[c]?.current || weather[c]?.temp || weather[c]?.weeklyForecast).length;
  const healthySectionCount = sectionHealth.filter(x => x.status === 'PASS').length;
  const nonEmptySectionCount = sectionHealth.filter(x => x.storyCount > 0).length;
  const expectedSourceGroups = Math.max(3, Math.min(6, enabledSections.length + 2));
  const ts = topStats(frontPage, now, topStoryDisplayLimit);
  const ss = snapshotStale(news, envelope);
  const topStoryGate = ts.topStoryAgeMinutes == null ? 'FAIL' : ts.topStoryAgeMinutes >= 1440 ? 'FAIL' : ts.topStoryAgeMinutes >= 360 ? 'WARN' : 'PASS';
  const ratioGate = ts.top10.length === 0 ? 'FAIL' : ts.freshRatio >= 0.7 ? 'PASS' : ts.freshRatio >= 0.5 ? 'WARN' : 'FAIL';
  const gates = [
    gate('frontpage-volume', 'Front page story volume', frontPage.length >= 10 ? 'PASS' : frontPage.length >= 5 ? 'WARN' : 'FAIL', `${frontPage.length} front-page stories available.`),
    gate('source-diversity', 'Source diversity', sourceGroups.length >= expectedSourceGroups ? 'PASS' : sourceGroups.length >= Math.max(2, expectedSourceGroups - 2) ? 'WARN' : 'FAIL', `${sourceGroups.length} unique source groups across visible main-tab news.`),
    gate('section-coverage', 'Section coverage', healthySectionCount >= enabledSections.length ? 'PASS' : nonEmptySectionCount >= Math.max(1, enabledSections.length - 1) ? 'WARN' : 'FAIL', missingSections.length ? `Missing sections: ${missingSections.join(', ')}.` : weakSections.length ? `Weak sections: ${weakSections.join(', ')}.` : 'All enabled sections have visible stories.'),
    gate('duplicate-rate', 'Duplicate story control', duplicateRate <= 0.08 ? 'PASS' : duplicateRate <= 0.18 ? 'WARN' : 'FAIL', `${duplicateCount} duplicate-like story keys from ${keys.length || 0} keyed stories.`),
    gate('freshness', 'Freshness', !stale ? 'PASS' : newestAgeMinutes == null ? 'WARN' : 'FAIL', newestAgeMinutes == null ? 'No usable story timestamp found.' : `Newest visible story is about ${newestAgeMinutes} minutes old.`),
    gate('top-story-currentness', 'Top story currentness', topStoryGate, ts.topStoryAgeMinutes == null ? 'Top story has no trusted timestamp.' : `Top story age is about ${ts.topStoryAgeMinutes} minutes.`),
    gate('top-10-fresh-ratio', 'Visible Top Stories freshness', ratioGate, `${ts.freshCount}/${ts.top10.length} top stories are within the strict current-news window.`),
    gate('top-10-timestamp-confidence', 'Visible Top Stories timestamps', ts.lowConfidenceCount === 0 ? 'PASS' : 'WARN', ts.lowConfidenceCount === 0 ? 'No fallback/missing timestamps detected in top stories.' : `${ts.lowConfidenceCount} top story/stories use fallback or missing timestamps.`),
    gate('top-stories-snapshot-staleness', 'Top Stories snapshot staleness', ss ? 'FAIL' : 'PASS', ss ? 'Main/sections snapshot is stale or degraded.' : 'No stale snapshot marker detected.'),
    gate('weather-availability', 'Weather availability', weatherReadyCount >= 3 ? 'PASS' : weatherReadyCount >= 1 ? 'WARN' : 'FAIL', `${weatherReadyCount} weather locations ready from ${weatherCities.length} loaded locations.`),
    gate('error-state', 'Runtime error state', Object.keys(O(errors)).length === 0 ? 'PASS' : 'FAIL', Object.keys(O(errors)).length === 0 ? 'No active error object from news context.' : `Errors present: ${Object.keys(O(errors)).join(', ')}.`),
    gate('loading-state', 'Loading gate', loading ? 'WARN' : 'PASS', loading ? 'Main tab is still loading or refreshing.' : 'Main tab is not in blocking loading state.'),
  ];
  return makePageAudit({
    target: 'main-tab', title: 'Main tab data quality', gates, now,
    gradeCeilings: [ss ? 'C' : null, ts.fail24hCount ? 'C' : null, ts.topStoryAgeMinutes >= 1440 ? 'C' : null, ts.topStoryAgeMinutes >= 360 ? 'B' : null, ts.freshRatio < 0.7 ? 'B' : null, ts.freshRatio < 0.5 ? 'C' : null, ts.lowConfidenceCount ? 'B' : null],
    summary: { frontPageStoryCount: frontPage.length, totalVisibleStoryCount: allStories.length, sourceGroupCount: sourceGroups.length, expectedSourceGroups, duplicateRate: Number(duplicateRate.toFixed(3)), newestAgeMinutes, topStoryAgeMinutes: ts.topStoryAgeMinutes, top10FreshRatio: Number(ts.freshRatio.toFixed(3)), top10LowConfidenceTimestampCount: ts.lowConfidenceCount, top10Over24hCount: ts.fail24hCount, snapshotStale: ss, enabledSections, missingSections, weakSections, weatherReadyCount, loading },
    dataTrust: { sourceDiversity: sourceGroups.length, duplicateRate: Number(duplicateRate.toFixed(3)), stale, snapshotStale: ss, top10FreshRatio: Number(ts.freshRatio.toFixed(3)), top10LowConfidenceTimestampCount: ts.lowConfidenceCount, weatherReadyCount },
    moreDiagnostics: [
      diag({ id: 'main-section-health', title: 'Section health', description: 'Per-section volume and source diversity behind the Main tab grade.', status: missingSections.length ? 'FAIL' : weakSections.length ? 'WARN' : 'PASS', metrics: [metric('Enabled sections', enabledSections.length), metric('Missing sections', missingSections.length), metric('Weak sections', weakSections.length), metric('Section stories', sectionStories.length)], rows: sectionHealth.map(x => row(x.section, x.status, x.storyCount + ' stories / ' + x.sourceGroupCount + ' source groups')), raw: { sectionHealth, enabledSections, missingSections, weakSections } }),
      diag({ id: 'main-data-trust', title: 'Data trust details', description: 'Source diversity, freshness, duplicate control and weather readiness.', status: gates.some(g => g.status === 'FAIL') ? 'FAIL' : gates.some(g => g.status === 'WARN') ? 'WARN' : 'PASS', metrics: [metric('Visible stories', allStories.length), metric('Front page stories', frontPage.length), metric('Source groups', sourceGroups.length), metric('Duplicate rate', Number(duplicateRate.toFixed(3))), metric('Newest age min', newestAgeMinutes ?? 'unknown'), metric('Top story age min', ts.topStoryAgeMinutes ?? 'unknown'), metric('Top-10 fresh ratio', Number(ts.freshRatio.toFixed(3))), metric('Low-confidence top timestamps', ts.lowConfidenceCount), metric('Snapshot stale', ss), metric('Weather ready', weatherReadyCount)], notes: [stale ? 'Newest story is stale or timestamp is unavailable.' : 'Freshness gate has usable story timestamps.', ss ? 'Main/sections snapshot is stale; Grade A is blocked.' : 'No snapshot stale marker detected.', ts.lowConfidenceCount ? 'Top stories contain fallback/missing timestamps; Grade A is blocked.' : 'Top stories have trusted timestamps.'], raw: { sourceGroups, duplicateCount, duplicateRate, timestamps, weatherCities, topStats: ts } }),
    ],
  });
}

export function auditWeatherTabQuality({ weatherData = {}, cities = [], activeCity = '', error = null, loading = false, now = Date.now() } = {}) {
  const data = O(weatherData); const cityList = A(cities).length ? A(cities) : Object.keys(data); const active = activeCity || cityList[0] || '';
  const ready = cityList.filter(c => data?.[c]?.current || data?.[c]?.temp || data?.[c]?.weeklyForecast); const weekly = cityList.filter(c => A(data?.[c]?.weeklyForecast).length >= 5); const modes = uniq(cityList.map(c => data?.[c]?.sourceMode)); const stale = cityList.filter(c => data?.[c]?.isStale || data?.[c]?.sourceMode === 'cache'); const fallback = cityList.filter(c => data?.[c]?.sourceMode === 'fallback' || data?.[c]?.sourceMode === 'snapshot');
  const gates = [gate('weather-city-coverage', 'Configured city coverage', ready.length >= Math.min(3, cityList.length) ? 'PASS' : ready.length ? 'WARN' : 'FAIL', `${ready.length} of ${cityList.length} configured weather cities have usable data.`), gate('weather-active-city', 'Active city readiness', data?.[active] ? 'PASS' : 'FAIL', data?.[active] ? `Active city ${active} is ready.` : `Active city ${active || 'unknown'} has no weather payload.`), gate('weather-weekly-forecast', 'Weekly forecast coverage', weekly.length >= Math.min(3, cityList.length) ? 'PASS' : weekly.length ? 'WARN' : 'FAIL', `${weekly.length} city/cities have 5+ day weekly forecast.`), gate('weather-source-mode', 'Source mode trust', fallback.length === 0 && stale.length === 0 ? 'PASS' : fallback.length === 0 ? 'WARN' : 'FAIL', modes.length ? `Source modes: ${modes.join(', ')}. Stale: ${stale.length}, fallback/snapshot: ${fallback.length}.` : 'No source mode metadata available.'), gate('weather-error-state', 'Weather error state', error ? 'WARN' : 'PASS', error ? 'Weather context reports degraded update or cached fallback.' : 'No active weather error.'), gate('weather-loading-state', 'Loading gate', loading ? 'WARN' : 'PASS', loading ? 'Weather tab is still loading or refreshing.' : 'Weather tab is not in blocking loading state.')];
  return makePageAudit({ target: 'weather-tab', title: 'Weather tab data quality', gates, now, summary: { configuredCities: cityList, activeCity: active, readyCityCount: ready.length, weeklyReadyCount: weekly.length, staleCityCount: stale.length, fallbackCityCount: fallback.length, sourceModes: modes, loading }, moreDiagnostics: [diag({ id: 'weather-city-readiness', title: 'Weather city readiness', description: 'Configured city coverage, active city state and weekly forecast readiness.', status: ready.length === cityList.length ? 'PASS' : ready.length ? 'WARN' : 'FAIL', metrics: [metric('Configured cities', cityList.length), metric('Ready cities', ready.length), metric('Weekly ready', weekly.length), metric('Active city', active)], rows: cityList.map(c => row(c, data?.[c] ? 'ready' : 'missing', A(data?.[c]?.weeklyForecast).length + ' weekly days; source ' + (data?.[c]?.sourceMode || 'unknown'))), raw: { cityList, ready, weekly, stale, fallback, active } }), diag({ id: 'weather-source-trust', title: 'Weather source trust', description: 'Source mode, stale/cache/fallback visibility and runtime error state.', status: fallback.length === 0 && !error ? stale.length === 0 ? 'PASS' : 'WARN' : 'FAIL', metrics: [metric('Source modes', modes), metric('Stale cities', stale.length), metric('Fallback cities', fallback.length), metric('Loading', loading), metric('Error', Boolean(error))], raw: { modes, stale, fallback, error } })], dataTrust: { readyCityCount: ready.length, weeklyReadyCount: weekly.length, staleCityCount: stale.length, fallbackCityCount: fallback.length } });
}

export function auditMarketTabQuality({ marketData = {}, sourceHealth = {}, sessionState = {}, error = null, loading = false, lastFetch = null, now = Date.now() } = {}) {
  const d = O(marketData); const indices = A(d.indices); const gainers = A(d?.movers?.gainers); const losers = A(d?.movers?.losers); const sectorals = A(d.sectorals); const commodities = A(d.commodities); const currencies = A(d.currencies); const mutualFunds = A(d.mutualFunds); const srcRows = Object.values(O(sourceHealth)); const ok = srcRows.filter(x => x?.ok !== false).length; const fail = srcRows.filter(x => x?.ok === false).length; const age = lastFetch ? Math.max(0, Math.round((now - Number(lastFetch)) / 60000)) : null;
  const gates = [gate('market-index-coverage', 'Index coverage', indices.length >= 4 ? 'PASS' : indices.length ? 'WARN' : 'FAIL', `${indices.length} index row(s) available.`), gate('market-movers', 'Mover coverage', gainers.length && losers.length ? 'PASS' : gainers.length + losers.length ? 'WARN' : 'FAIL', `${gainers.length} gainers and ${losers.length} losers available.`), gate('market-breadth-sections', 'Market breadth sections', [sectorals, commodities, currencies, mutualFunds].filter(x => x.length).length >= 2 ? 'PASS' : 'WARN', `Sectorals ${sectorals.length}, commodities ${commodities.length}, currencies ${currencies.length}, mutual funds ${mutualFunds.length}.`), gate('market-source-health', 'Source health', fail === 0 ? 'PASS' : ok >= fail ? 'WARN' : 'FAIL', `${ok} source(s) OK, ${fail} failing.`), gate('market-session-freshness', 'Session freshness', d.isSnapshot || d.isStale ? 'WARN' : age == null || age <= 60 ? 'PASS' : age <= 240 ? 'WARN' : 'FAIL', sessionState?.label ? `${sessionState.label}; age ${sessionState.ageLabel || (age == null ? 'unknown' : age + ' min')}.` : age == null ? 'No lastFetch timestamp.' : `Latest market fetch age ${age} minutes.`), gate('market-error-state', 'Market error state', error ? 'WARN' : 'PASS', error ? String(error) : 'No active market error.'), gate('market-loading-state', 'Loading gate', loading ? 'WARN' : 'PASS', loading ? 'Market tab is still loading or refreshing.' : 'Market tab is not in blocking loading state.')];
  return makePageAudit({ target: 'market-tab', title: 'Market tab data quality', gates, now, summary: { indexCount: indices.length, gainerCount: gainers.length, loserCount: losers.length, sectoralCount: sectorals.length, commodityCount: commodities.length, currencyCount: currencies.length, mutualFundCount: mutualFunds.length, sourceOkCount: ok, sourceFailCount: fail, sourceMode: d.isSnapshot ? 'snapshot' : d.isStale ? 'cache' : 'live', newestAgeMinutes: age, loading }, moreDiagnostics: [diag({ id: 'market-coverage', title: 'Market coverage', description: 'Coverage across indices, movers and auxiliary market sections.', status: indices.length >= 4 && gainers.length && losers.length ? 'PASS' : indices.length ? 'WARN' : 'FAIL', metrics: [metric('Indices', indices.length), metric('Gainers', gainers.length), metric('Losers', losers.length), metric('Sectorals', sectorals.length), metric('Commodities', commodities.length), metric('Currencies', currencies.length), metric('Mutual funds', mutualFunds.length)], raw: { indices, gainers, losers } }), diag({ id: 'market-source-health', title: 'Market source health', description: 'Source health and freshness details behind the market grade.', status: fail === 0 ? 'PASS' : ok >= fail ? 'WARN' : 'FAIL', metrics: [metric('Sources OK', ok), metric('Sources failing', fail), metric('Source mode', d.isSnapshot ? 'snapshot' : d.isStale ? 'cache' : 'live'), metric('Newest age min', age ?? 'unknown'), metric('Loading', loading), metric('Error', Boolean(error))], rows: Object.entries(O(sourceHealth)).map(([name, item]) => row(name, item?.ok === false ? 'FAIL' : 'PASS', item?.message || item?.reason || '')), raw: { sourceHealth, sessionState, lastFetch } })], dataTrust: { sourceOkCount: ok, sourceFailCount: fail, sourceMode: d.isSnapshot ? 'snapshot' : d.isStale ? 'cache' : 'live', newestAgeMinutes: age } });
}

export function auditInsightTabQuality({ result = null, diagnostics = null, behaviorEvidence = null, source = 'live', loading = false, error = null, now = Date.now() } = {}) {
  const parents = A(result?.parents); const storiesById = result?.storiesById instanceof Map ? result.storiesById : new Map(Object.entries(O(result?.storiesById))); const sg = uniq([...storiesById.values()].map(s => s?.sourceGroup || s?.source || 'unknown')); const weak = parents.filter(p => p?.weakTree).length; const childCounts = parents.map(p => A(p?.childStoryIds).length); const avgChild = childCounts.length ? childCounts.reduce((s, v) => s + v, 0) / childCounts.length : 0; const angleCounts = parents.map(p => uniq(A(p?.childStoryIds).map(id => storiesById.get(id)).filter(Boolean).map(s => s?.angle || 'unknown')).length); const multi = angleCounts.filter(c => c >= 2).length; const avgAngle = angleCounts.length ? angleCounts.reduce((s, v) => s + v, 0) / angleCounts.length : 0; const behaviorStatus = behaviorEvidence?.status || ''; const runtime = result?.runtimeQualityGate || null;
  const gates = [gate('insight-parent-volume', 'Parent cluster volume', parents.length >= 5 ? 'PASS' : parents.length >= 2 ? 'WARN' : 'FAIL', `${parents.length} parent cluster(s) generated.`), gate('insight-child-depth', 'Child-story depth', avgChild >= 3 ? 'PASS' : avgChild >= 1.5 ? 'WARN' : 'FAIL', `Average child stories per cluster: ${avgChild.toFixed(1)}.`), gate('insight-angle-diversity', 'Angle diversity', avgAngle >= 2 && multi >= 2 ? 'PASS' : multi >= 1 ? 'WARN' : 'FAIL', `${multi} multi-angle parent(s), average angles ${avgAngle.toFixed(1)}.`), gate('insight-source-diversity', 'Source diversity', sg.length >= 5 ? 'PASS' : sg.length >= 2 ? 'WARN' : 'FAIL', `${sg.length} source group(s) available.`), gate('insight-weak-tree-control', 'Weak-tree control', weak === 0 ? 'PASS' : weak <= 1 ? 'WARN' : 'FAIL', `${weak} weak tree(s) detected.`), gate('insight-runtime-quality-gate', 'Runtime quality gate', runtime?.recovered ? 'PASS' : runtime?.attempted ? 'WARN' : 'PASS', runtime?.reason || 'No runtime recovery required.'), gate('insight-behavior-evidence', 'Behavior evidence', behaviorStatus === 'pass' || behaviorStatus === 'PASS' ? 'PASS' : behaviorStatus ? 'WARN' : 'WARN', behaviorEvidence?.summaryTitle || 'Behavior evidence available only after pipeline diagnostics run.'), gate('insight-error-state', 'Insight error state', error ? 'FAIL' : 'PASS', error ? String(error) : 'No active Insight error.'), gate('insight-loading-state', 'Loading gate', loading ? 'WARN' : 'PASS', loading ? 'Insight pipeline is still loading.' : 'Insight pipeline is not in blocking loading state.')];
  return makePageAudit({ target: 'insight-tab', title: 'Insight tab data quality', gates, now, summary: { parentCount: parents.length, storyCount: storiesById.size, sourceGroupCount: sg.length, weakTreeCount: weak, multiAngleParentCount: multi, avgAngleCount: Number(avgAngle.toFixed(2)), avgChildCount: Number(avgChild.toFixed(2)), signalScore: diagnostics?.signalScore, source, loading }, moreDiagnostics: [diag({ id: 'insight-tree-quality', title: 'Insight tree quality', description: 'Cluster depth, angle diversity, source diversity and weak-tree control.', status: multi >= 2 && weak === 0 ? 'PASS' : multi >= 1 ? 'WARN' : 'FAIL', metrics: [metric('Parents', parents.length), metric('Stories', storiesById.size), metric('Source groups', sg.length), metric('Weak trees', weak), metric('Multi-angle parents', multi), metric('Avg angles', Number(avgAngle.toFixed(2))), metric('Avg children', Number(avgChild.toFixed(2)))], rows: parents.slice(0, 10).map(p => row(p?.canonicalHeadline || p?.parentId || 'cluster', p?.weakTree ? 'weak' : 'ok', A(p?.childStoryIds).length + ' children / ' + A(p?.clusterStoryIds).length + ' cluster stories')), raw: { sourceGroups: sg, weakTrees: weak, angleCounts, childCounts } }), diag({ id: 'insight-runtime-gates', title: 'Insight runtime gates', description: 'Runtime quality gate, source mode and behavior evidence status.', status: runtime?.attempted && !runtime?.recovered ? 'WARN' : 'PASS', metrics: [metric('Source', source), metric('Signal score', diagnostics?.signalScore ?? 'unknown'), metric('Runtime recovered', Boolean(runtime?.recovered)), metric('Runtime attempted', Boolean(runtime?.attempted)), metric('Behavior status', behaviorStatus || 'unknown'), metric('Loading', loading), metric('Error', Boolean(error))], notes: [runtime?.reason || 'No runtime recovery reason recorded.', behaviorEvidence?.summaryTitle || 'No behavior evidence title recorded.'], raw: { runtime, behaviorEvidence, diagnostics } })], dataTrust: { parentCount: parents.length, storyCount: storiesById.size, sourceGroupCount: sg.length, weakTreeCount: weak, multiAngleParentCount: multi, runtimeRecovered: Boolean(runtime?.recovered) } });
}

export function auditGradeLabel(audit) { return audit?.grade || 'F'; }
export function auditGradeTone(audit) { return audit?.tone || toneFromGrade(audit?.grade || 'F'); }
export const __pageAuditGradingInternalsForTest = { timeMs, lowTs, topStats, snapshotStale, capGrade, makePageAudit };
