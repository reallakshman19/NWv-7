import { getStorySourceFamily } from './topStories/topStoriesSourceIdentity.js';
import { newsIdentityKey, newsUrl, stableNewsRowKey } from './newsStoryIdentity.js';
export function independentPublisherFamilies(families=[]) {
  return [...new Set(families.filter(f=>f && !['unknown','source','publisher','google_news'].includes(f)))].sort();
}
export function clusterPublisherFamilies(rows=[]) {
  const byUrl=new Map(), withoutUrl=[];
  for(const row of rows){const key=newsUrl(row);if(!key){withoutUrl.push(row);continue;}const current=byUrl.get(key)||[];current.push(row);byUrl.set(key,current);}
  const named=withoutUrl.map(row=>getStorySourceFamily(row));
  for(const group of byUrl.values()){
    // A shared canonical article URL is one report, even if an acquisition lane supplies another label.
    const candidates=independentPublisherFamilies(group.map(row=>getStorySourceFamily(row)));
    if(candidates.length)named.push(candidates[0]);
    // Legacy producer aggregates have no per-member URL; do not manufacture extra families from them.
  }
  const known=independentPublisherFamilies(named);
  if(known.length) return known;
  return rows.some(row=>getStorySourceFamily(row)==='google_news')?['google_news']:[];
}
// Each clustered row retains its original publication timestamp and family. Do not
// let a cached representative reintroduce an expired or disabled member as evidence.
export function expandNewsEvidenceRows(rows=[]) {
  return rows.flatMap(row=>Array.isArray(row?.newsEvidenceRows) && row.newsEvidenceRows.length
    ? row.newsEvidenceRows.map(member=>newsIdentityKey(member)===newsIdentityKey(row) && member.source===row.source
      ? {...member,section:row.section||member.section} : member)
    : [row]);
}
export function captureNewsEvidenceRows(rows=[]) {
  const result=new Map();
  for(const row of expandNewsEvidenceRows(rows)){
    if(!row||typeof row!=='object')continue;
    const { newsEvidenceRows: _newsEvidenceRows, topFeedEvidenceRows: _topFeedEvidenceRows, _topStoryRank, ...member } = row;
    const key=stableNewsRowKey(member);
    const previous=result.get(key);
    if (!previous) { result.set(key,member); continue; }
    const provenance = row => JSON.stringify([
      String(row.timestampConfidence || row.publishedAtConfidence || '').toLowerCase(),
      String(row.publishedAtSource || row.timestampSource || '').toLowerCase(),
    ]);
    // Conflicting provenance for the same report is not independent proof.
    const chosen = JSON.stringify(previous) <= JSON.stringify(member) ? previous : member;
    result.set(key, provenance(previous) === provenance(member) ? chosen : {
      ...chosen, timestampConfidence: 'low', publishedAtSource: 'invalid',
    });
  }
  return [...result.values()];
}
