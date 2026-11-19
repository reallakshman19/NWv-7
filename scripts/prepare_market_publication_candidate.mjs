/**
 * No-network release-candidate custody gate.
 *
 * Reads a separately supplied candidate. Never fetches, fills or republishes
 * quotes. A rights document hash match is NOT a legal interpretation or owner
 * release approval. No command here writes to tracked public assets.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assessMarketPublication } from './check_market_publication_readiness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA = /^[a-f0-9]{64}$/;
const ACTIONS = ['public-display', 'reproduce', 'distribute'];
const GRANT_SCHEMA = 'market-publication-rights-v1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const ms = s => typeof s === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(s)
  ? Date.parse(s) : NaN;
const safe = value => typeof value === 'string' && /^[\w .-]{1,100}$/.test(value) && value !== '..';
const actualFile = (directory, file) => {
  if (!safe(file)) return null;
  try {
    const base = fs.realpathSync(directory);
    const resolved = fs.realpathSync(path.join(directory, file));
    if (!resolved.startsWith(base + path.sep) || !fs.statSync(resolved).isFile()) return null;
    return resolved;
  } catch { return null; }
};
const presentScopes = candidate => {
  const list = [];
  if (Array.isArray(candidate.indices) && candidate.indices.length) list.push('indices');
  if (Array.isArray(candidate.equities) && candidate.equities.length) list.push('equities');
  if (Array.isArray(candidate.mutualFunds) && candidate.mutualFunds.length) list.push('mutualFunds');
  if (Array.isArray(candidate.nfo) && candidate.nfo.length) list.push('nfo');
  const ipo = candidate.ipo || {};
  if (['live', 'upcoming', 'recent'].some(group => Array.isArray(ipo[group]) && ipo[group].length)) list.push('ipo');
  return list;
};
const layersFor = scope => ['indices', 'equities'].includes(scope) ? ['provider', 'underlying-exchange'] : ['source'];

const asJson = bytes => {
  try { return JSON.parse(bytes.toString('utf8')); } catch { return null; }
};
const assetReceipt = (name,bytes) => ({name,sha256:sha256(bytes),bytes:bytes.byteLength});
const bundleDigest = assets => sha256(Buffer.from(assets.map(a=>a.name+':'+a.sha256).join('\n')+'\n'));
const sidecarConsistency = (snapshot,navBytes,healthBytes) => {
  const issues = [];
  const sidecars = [navBytes,healthBytes];
  if (sidecars.some(value=>!Buffer.isBuffer(value))) return ['SOURCE_SIDECARS_REQUIRED'];
  const nav=asJson(navBytes),health=asJson(healthBytes);
  if (!nav || !health || typeof nav!=='object' || typeof health!=='object')return ['SIDECAR_JSON_INVALID'];
  if (nav.generatedAt!==snapshot?.generatedAt || health.generatedAt!==snapshot?.generatedAt)
    issues.push('SIDECAR_COLLECTION_CLOCK_CONFLICT');
  if (JSON.stringify(nav.mutualFunds)!==JSON.stringify(snapshot?.mutualFunds))
    issues.push('NAV_SIDECAR_DATA_MISMATCH');
  if (JSON.stringify(nav.sourceHealth)!==JSON.stringify(snapshot?.sourceHealth?.mutualFunds))
    issues.push('NAV_SIDECAR_HEALTH_MISMATCH');
  if (JSON.stringify(health.sources)!==JSON.stringify(snapshot?.sourceHealth))
    issues.push('SOURCE_HEALTH_SIDECAR_MISMATCH');
  if (!['PASS','WARN'].includes(health?.validation?.status))
    issues.push('PUBLISHER_RECEIPT_MISSING');
  return issues;
};


export function assessCandidateCustody(candidateBytes, {
  rightsManifest = null, evidenceDir = null, nowMs = Date.now(), symbols = [], stageRequested = false,
  navSidecarBytes = null, healthSidecarBytes = null,
} = {}) {
  const blocks = [], grantReceipts = [];
  const deny = code => { if (!blocks.includes(code)) blocks.push(code); };
  let candidate;
  try { candidate = JSON.parse(candidateBytes.toString('utf8')); }
  catch { candidate = null; deny('CANDIDATE_JSON_INVALID'); }
  const digest = sha256(candidateBytes);
  const assets = [assetReceipt('market_snapshot.json',candidateBytes)];
  if (Buffer.isBuffer(navSidecarBytes)) assets.push(assetReceipt('mutual_fund_snapshot.json',navSidecarBytes));
  if (Buffer.isBuffer(healthSidecarBytes)) assets.push(assetReceipt('market_source_health.json',healthSidecarBytes));
  const bundleSha256 = bundleDigest(assets);
  const sidecarBlocks = sidecarConsistency(candidate,navSidecarBytes,healthSidecarBytes);
  const technical = assessMarketPublication(candidate, { nowMs, symbols });
  const scopes = presentScopes(candidate || {});
  const required = scopes.flatMap(scope => layersFor(scope).map(layer => ({ scope, layer })));
  if (candidate?.fixtureOnly === true || candidate?.synthetic === true) deny('FIXTURE_CANNOT_STAGE');
  if (!rightsManifest || rightsManifest.schemaVersion !== GRANT_SCHEMA) deny('RIGHTS_MANIFEST_MISSING');
  if (rightsManifest?.candidateSha256 !== digest) deny('RIGHTS_CANDIDATE_BINDING_INVALID');
  if (assets.length===3 && rightsManifest?.bundleSha256 !== bundleSha256) deny('RIGHTS_BUNDLE_BINDING_INVALID');
  if (rightsManifest?.target !== 'public-web-display') deny('RIGHTS_TARGET_INVALID');
  if (!evidenceDir || !fs.existsSync(evidenceDir)) deny('EVIDENCE_DIR_MISSING');
  const grants = Array.isArray(rightsManifest?.grants) ? rightsManifest.grants : [];
  for (const { scope, layer } of required) {
    const matching = grants.filter(grant => grant.scope === scope && grant.layer === layer);
    if (matching.length !== 1) { deny('RIGHTS_SCOPE_NOT_UNIQUELY_COVERED'); continue; }
    const g = matching[0], from = ms(g.effectiveFrom), until = ms(g.expiresAt);
    if (!safe(g.grantId) || !safe(g.licensor) || !safe(g.licensee)
      || !Array.isArray(g.rights) || !ACTIONS.every(action => g.rights.includes(action))) {
      deny('RIGHTS_GRANT_INCOMPLETE'); continue;
    }
    if (!Number.isFinite(from) || !Number.isFinite(until) || from > nowMs || until <= nowMs) {
      deny('RIGHTS_GRANT_OUTSIDE_EFFECTIVE_WINDOW'); continue;
    }
    if (typeof g.evidenceSha256 !== 'string' || !SHA.test(g.evidenceSha256)) {
      deny('RIGHTS_EVIDENCE_HASH_INVALID'); continue;
    }
    const evidence = evidenceDir && actualFile(evidenceDir, g.evidenceFile);
    if (!evidence) { deny('RIGHTS_EVIDENCE_NOT_FOUND_OR_UNSAFE'); continue; }
    const observedSha256 = sha256(fs.readFileSync(evidence));
    if (observedSha256 !== g.evidenceSha256) { deny('RIGHTS_EVIDENCE_HASH_MISMATCH'); continue; }
    grantReceipts.push({ scope, layer, grantId:g.grantId, evidenceSha256:observedSha256,
      grantWindow:{from:g.effectiveFrom,until:g.expiresAt},
      reviewState:'DOCUMENT_PRESENT_NOT_LEGALLY_ADJUDICATED' });
  }
  // An incomplete rights record must not silently skip one required scope.
  if (grantReceipts.length !== required.length) deny('RIGHTS_COVERAGE_INCOMPLETE');
  const technicalPass = technical.technicalStatus === 'PASS' && sidecarBlocks.length===0;
  const documentHashesPass = blocks.length === 0;
  return {
    schemaVersion:'market-publication-candidate-custody-v1',
    inspectedAt:new Date(nowMs).toISOString(),
    assets,
    bundleSha256,
    sidecarStatus:sidecarBlocks.length===0?'MATCHED':'INCOMPLETE',
    sidecarBlocks,
    candidate:{name:'market_snapshot.json',sha256:digest,bytes:candidateBytes.byteLength,
      generatedAt:candidate?.generatedAt ?? null,
      indexCount:technical.counts.indices,equityCount:technical.counts.qualifiedEquities},
    requiredRights:required,
    rightsEvidence:grantReceipts,
    technicalStatus:technical.technicalStatus,
    technicalBlocks:technical.blocks.map(b=>b.code),
    rightsEvidenceStatus:documentHashesPass ? 'HASHES_MATCHED_PENDING_HUMAN_REVIEW' : 'INCOMPLETE',
    rightsBlocks:blocks,
    stageEligible:technicalPass && documentHashesPass && stageRequested,
    releaseStatus:'HOLD_FOR_LEGAL_AND_OWNER_APPROVAL',
    publicationAuthorized:false,
    technicalNotes:technical.notes.map(n=>n.code),
  };
}
const privateOutput = out => {
  const root = fs.realpathSync(ROOT);
  const resolved = path.resolve(out);
  // Prevent writes anywhere in this checkout (especially public/data, docs,
  // dist or a workflow directory). A private external directory is mandatory.
  if (resolved === root || resolved.startsWith(root + path.sep)) throw Error('PRIVATE_OUTSIDE_REPO_REQUIRED');
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) throw Error('SYMLINK_OUTDIR_FORBIDDEN');
  fs.mkdirSync(resolved, {recursive:true,mode:0o700});
  if (fs.realpathSync(resolved).startsWith(root + path.sep)) throw Error('PRIVATE_OUTSIDE_REPO_REQUIRED');
  return resolved;
};
function args(argv){
  const get = key => { const i=argv.indexOf(key); return i<0 ? null : argv[i+1] || null; };
  const candidate=get('--candidate'), rights=get('--rights'), evidence=get('--evidence-dir');
  const nav=get('--nav-sidecar'),health=get('--health-sidecar');
  const out=get('--out-dir') || path.join(os.tmpdir(),'nw7-market-release-candidate');
  return {candidate,rights,evidence,nav,health,out,stage:argv.includes('--stage'),now:get('--now')};
}
export function prepareCandidate(argv=process.argv.slice(2)){
  const input=args(argv);
  if (!input.candidate) throw Error('--candidate is required');
  const candidateBytes=fs.readFileSync(input.candidate);
  if (candidateBytes.byteLength > 4*1024*1024) throw Error('CANDIDATE_SIZE_LIMIT');
  const navSidecarBytes=input.nav?fs.readFileSync(input.nav):null;
  const healthSidecarBytes=input.health?fs.readFileSync(input.health):null;
  for (const bytes of [navSidecarBytes,healthSidecarBytes]) if (bytes && bytes.length>4*1024*1024) throw Error('SIDECAR_SIZE_LIMIT');
  const rightsManifest=input.rights ? JSON.parse(fs.readFileSync(input.rights,'utf8')) : null;
  const symbols=JSON.parse(fs.readFileSync(path.join(ROOT,'src/config/marketEquityUniverse.json'),'utf8')).symbols;
  const nowMs=input.now ? ms(input.now) : Date.now();
  if (!Number.isFinite(nowMs)) throw Error('Invalid --now timestamp');
  const result=assessCandidateCustody(candidateBytes,{
    rightsManifest,evidenceDir:input.evidence,nowMs,symbols,stageRequested:input.stage,
    navSidecarBytes,healthSidecarBytes,
  });
  const out=privateOutput(input.out);
  const receiptPath=path.join(out,'custody.json');
  if (fs.existsSync(receiptPath)) throw Error('CUSTODY_RECEIPT_ALREADY_EXISTS');
  // Only a complete three-asset private bundle can be staged.
  // Individual source/public assets in this repository are NEVER rewritten.
  if (result.stageEligible){
    const bytesByName={
      'market_snapshot.json':candidateBytes,
      'mutual_fund_snapshot.json':navSidecarBytes,
      'market_source_health.json':healthSidecarBytes,
    };
    const staged=[];
    try{
      for(const asset of result.assets){
        const dest=path.join(out,asset.name);
        fs.writeFileSync(dest,bytesByName[asset.name],{flag:'wx',mode:0o600});
        const actual=fs.readFileSync(dest);
        if(sha256(actual)!==asset.sha256 || actual.length!==asset.bytes)
          throw Error('STAGED_BYTES_MISMATCH');
        staged.push({name:asset.name,sha256:sha256(actual),bytes:actual.byteLength});
      }
      if(bundleDigest(staged)!==result.bundleSha256)throw Error('BUNDLE_STAGED_HASH_MISMATCH');
      result.staged=staged;
      result.candidateCustody='PRIVATE_STAGED_NOT_APPROVED_FOR_PUBLICATION';
    }catch(error){
      for(const asset of staged)fs.rmSync(path.join(out,asset.name),{force:true});
      throw error;
    }
  }else result.candidateCustody='NO_CANDIDATE_STAGED';
  fs.writeFileSync(receiptPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  return { result, out };
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const {result}=prepareCandidate();
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(result.technicalStatus!=='PASS' || result.rightsEvidenceStatus!=='HASHES_MATCHED_PENDING_HUMAN_REVIEW')
      process.exitCode=2;
  }catch(error){
    // Never print user-supplied license text or candidate payload.
    process.stderr.write('Candidate preparation blocked: '+String(error.message).replace(/[/\\].*/,'')+'\n');
    process.exitCode=2;
  }
}
