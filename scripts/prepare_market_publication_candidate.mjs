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

export function assessCandidateCustody(candidateBytes, {
  rightsManifest = null, evidenceDir = null, nowMs = Date.now(), symbols = [], stageRequested = false,
} = {}) {
  const blocks = [], grantReceipts = [];
  const deny = code => { if (!blocks.includes(code)) blocks.push(code); };
  let candidate;
  try { candidate = JSON.parse(candidateBytes.toString('utf8')); }
  catch { candidate = null; deny('CANDIDATE_JSON_INVALID'); }
  const digest = sha256(candidateBytes);
  const technical = assessMarketPublication(candidate, { nowMs, symbols });
  const scopes = presentScopes(candidate || {});
  const required = scopes.flatMap(scope => layersFor(scope).map(layer => ({ scope, layer })));
  if (candidate?.fixtureOnly === true || candidate?.synthetic === true) deny('FIXTURE_CANNOT_STAGE');
  if (!rightsManifest || rightsManifest.schemaVersion !== GRANT_SCHEMA) deny('RIGHTS_MANIFEST_MISSING');
  if (rightsManifest?.candidateSha256 !== digest) deny('RIGHTS_CANDIDATE_BINDING_INVALID');
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
  const technicalPass = technical.technicalStatus === 'PASS';
  const documentHashesPass = blocks.length === 0;
  return {
    schemaVersion:'market-publication-candidate-custody-v1',
    inspectedAt:new Date(nowMs).toISOString(),
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
  const out=get('--out-dir') || path.join(os.tmpdir(),'nw7-market-release-candidate');
  return {candidate,rights,evidence,out,stage:argv.includes('--stage'),now:get('--now')};
}
export function prepareCandidate(argv=process.argv.slice(2)){
  const input=args(argv);
  if (!input.candidate) throw Error('--candidate is required');
  const candidateBytes=fs.readFileSync(input.candidate);
  const rightsManifest=input.rights ? JSON.parse(fs.readFileSync(input.rights,'utf8')) : null;
  const symbols=JSON.parse(fs.readFileSync(path.join(ROOT,'src/config/marketEquityUniverse.json'),'utf8')).symbols;
  const nowMs=input.now ? ms(input.now) : Date.now();
  if (!Number.isFinite(nowMs)) throw Error('Invalid --now timestamp');
  const result=assessCandidateCustody(candidateBytes,{
    rightsManifest,evidenceDir:input.evidence,nowMs,symbols,stageRequested:input.stage,
  });
  const out=privateOutput(input.out);
  // Report only file hashes and counts. No source quote values appear in report.
  if (result.stageEligible){
    const dest=path.join(out,'market_snapshot.json');
    fs.writeFileSync(dest,candidateBytes,{flag:'wx',mode:0o600});
    const actual=fs.readFileSync(dest);
    if (sha256(actual)!==result.candidate.sha256 || actual.length!==result.candidate.bytes){
      fs.unlinkSync(dest); throw Error('STAGED_BYTES_MISMATCH');
    }
    result.staged={name:'market_snapshot.json',sha256:sha256(actual),bytes:actual.byteLength};
    result.candidateCustody='PRIVATE_STAGED_NOT_APPROVED_FOR_PUBLICATION';
  }else result.candidateCustody='NO_CANDIDATE_STAGED';
  fs.writeFileSync(path.join(out,'custody.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
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
