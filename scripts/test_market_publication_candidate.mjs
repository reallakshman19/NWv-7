import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessCandidateCustody, prepareCandidate } from './prepare_market_publication_candidate.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SYMBOLS=JSON.parse(fs.readFileSync(path.join(ROOT,'src/config/marketEquityUniverse.json'),'utf8')).symbols;
const now=Date.parse('2026-11-19T12:00:00Z');
const time=new Date(now-30_000).toISOString();
const hash=s=>createHash('sha256').update(s).digest('hex');
const index=symbol=>({symbol,name:symbol,value:'100',quoteAt:time,sourceMode:'yahoo-free-daily'});
const equity=symbol=>({
  id:'equity:NSE:'+symbol,symbol,name:symbol,exchange:'NSE',
  currency:'INR',sourceProvider:'Synthetic Test Provider',sourceAuthority:'third-party',
  value:100,quoteAt:time,sourceMode:'yahoo-free-daily',
});
const sample=()=>({
  fixtureOnly:true, schemaVersion:'market-india-1', generatedAt:time,fetchedAt:now-30_000,
  indices:['^NSEI','^BSESN','^NSEBANK'].map(index),
  equities:SYMBOLS.map(equity), sourceHealth:{equities:{status:'snapshot'}},
  equityCoverage:{universeSize:SYMBOLS.length,quotedCount:SYMBOLS.length,unavailableSymbols:[]},
});
const buffer=obj=>Buffer.from(JSON.stringify(obj));
function fixtureRights(candidateBytes, directory, offset=86400000){
  const grants=[];
  for(const scope of ['indices','equities']){
    for(const layer of ['provider','underlying-exchange']){
      const file=scope+'-'+layer+'.txt';
      const bytes=Buffer.from('SYNTHETIC TEST LICENSING FIXTURE '+scope+layer);
      fs.writeFileSync(path.join(directory,file),bytes);
      grants.push({
        scope,layer,grantId:'test-'+scope+'-'+layer,
        licensor:'FICTIONAL',
        licensee:'TEST ONLY',
        rights:['public-display','reproduce','distribute'],
        effectiveFrom:new Date(now-offset).toISOString(),
        expiresAt:new Date(now+offset).toISOString(),
        evidenceFile:file,evidenceSha256:hash(bytes),
      });
    }
  }
  return {schemaVersion:'market-publication-rights-v1',
    candidateSha256:hash(candidateBytes),target:'public-web-display',grants};
}
function temp(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nw7-rights-test-'));
 try {return fn(dir);} finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function sidecars(candidate){
  const copy={...candidate,mutualFunds:[],nfo:[],ipo:{live:[],upcoming:[],recent:[]},
    sourceHealth:{...candidate.sourceHealth,mutualFunds:{status:'empty',provider:'AMFI'}}};
  const nav=Buffer.from(JSON.stringify({generatedAt:copy.generatedAt,mutualFunds:[],sourceHealth:copy.sourceHealth.mutualFunds}));
  const health=Buffer.from(JSON.stringify({generatedAt:copy.generatedAt,validation:{status:'WARN'},sources:copy.sourceHealth}));
  return {copy,nav,health};
}
function boundRights(candidateBytes, nav, health, dir){
  const rights=fixtureRights(candidateBytes,dir);
  const assets=[
    ['market_snapshot.json',candidateBytes],
    ['mutual_fund_snapshot.json',nav],
    ['market_source_health.json',health],
  ];
  rights.bundleSha256=hash(Buffer.from(assets.map(([name,bytes])=>name+':'+hash(bytes)).join('\n')+'\n'));
  return rights;
}

test('without rights evidence, valid technical rows remain release HOLD',()=>{
 const bytes=buffer(sample());
 const r=assessCandidateCustody(bytes,{nowMs:now,symbols:SYMBOLS});
 assert.equal(r.technicalStatus,'PASS');
 assert.equal(r.releaseStatus,'HOLD_FOR_LEGAL_AND_OWNER_APPROVAL');
 assert.equal(r.publicationAuthorized,false);
 assert.ok(r.rightsBlocks.includes('RIGHTS_MANIFEST_MISSING'));
 assert.ok(r.rightsBlocks.includes('FIXTURE_CANNOT_STAGE'));
 assert.equal(r.stageEligible,false);
 assert.ok(!JSON.stringify(r).includes('Synthetic Test Provider'));
});
test('an old public snapshot fails technical qualification without inventing new dates',()=>{
 const old=JSON.parse(fs.readFileSync(path.join(ROOT,'public/data/market_snapshot.json'),'utf8'));
 const r=assessCandidateCustody(buffer(old),{nowMs:now,symbols:SYMBOLS});
 assert.equal(r.technicalStatus,'HOLD');
 assert.ok(r.technicalBlocks.includes('SCHEMA_UNKNOWN'));
 assert.ok(r.technicalBlocks.includes('NO_EQUITY_COVERAGE'));
});
test('rights manifest must be bound to exact candidate SHA',()=>temp(dir=>{
 const bytes=buffer({...sample(),fixtureOnly:false});
 const manifest=fixtureRights(bytes,dir);manifest.candidateSha256='0'.repeat(64);
 const r=assessCandidateCustody(bytes,{nowMs:now,symbols:SYMBOLS,rightsManifest:manifest,evidenceDir:dir});
 assert.ok(r.rightsBlocks.includes('RIGHTS_CANDIDATE_BINDING_INVALID'));
 assert.equal(r.stageEligible,false);
}));
test('scope coverage requires both downstream provider and underlying exchange permission',()=>temp(dir=>{
 const bytes=buffer({...sample(),fixtureOnly:false});
 const manifest=fixtureRights(bytes,dir);
 manifest.grants=manifest.grants.filter(g=>g.layer!=='underlying-exchange');
 const r=assessCandidateCustody(bytes,{nowMs:now,symbols:SYMBOLS,rightsManifest:manifest,evidenceDir:dir,stageRequested:true});
 assert.ok(r.rightsBlocks.includes('RIGHTS_SCOPE_NOT_UNIQUELY_COVERED'));
 assert.equal(r.stageEligible,false);
}));
test('expired grants cannot be treated as current permissions',()=>temp(dir=>{
 const bytes=buffer({...sample(),fixtureOnly:false});
 const manifest=fixtureRights(bytes,dir);
 manifest.grants[0].expiresAt=new Date(now-1000).toISOString();
 const r=assessCandidateCustody(bytes,{nowMs:now,symbols:SYMBOLS,rightsManifest:manifest,evidenceDir:dir});
 assert.ok(r.rightsBlocks.includes('RIGHTS_GRANT_OUTSIDE_EFFECTIVE_WINDOW'));
}));
test('missing actions and duplicate grants fail closed',()=>temp(dir=>{
 const bytes=buffer({...sample(),fixtureOnly:false});
 const manifest=fixtureRights(bytes,dir);
 manifest.grants[0].rights=['public-display'];
 assert.ok(assessCandidateCustody(bytes,{nowMs:now,symbols:SYMBOLS,rightsManifest:manifest,evidenceDir:dir}).rightsBlocks.includes('RIGHTS_GRANT_INCOMPLETE'));
 manifest.grants[0].rights=['public-display','reproduce','distribute'];
 manifest.grants.push({...manifest.grants[0]});
 assert.ok(assessCandidateCustody(bytes,{nowMs:now,symbols:SYMBOLS,rightsManifest:manifest,evidenceDir:dir}).rightsBlocks.includes('RIGHTS_SCOPE_NOT_UNIQUELY_COVERED'));
}));
test('evidence hash mismatch and unsafe paths are rejected',()=>temp(dir=>{
 const bytes=buffer({...sample(),fixtureOnly:false});
 const manifest=fixtureRights(bytes,dir);
 manifest.grants[0].evidenceSha256='a'.repeat(64);
 assert.ok(assessCandidateCustody(bytes,{nowMs:now,symbols:SYMBOLS,rightsManifest:manifest,evidenceDir:dir}).rightsBlocks.includes('RIGHTS_EVIDENCE_HASH_MISMATCH'));
 manifest.grants[0].evidenceSha256=hash('test');
 manifest.grants[0].evidenceFile='../secrets.txt';
 assert.ok(assessCandidateCustody(bytes,{nowMs:now,symbols:SYMBOLS,rightsManifest:manifest,evidenceDir:dir}).rightsBlocks.includes('RIGHTS_EVIDENCE_NOT_FOUND_OR_UNSAFE'));
}));
test('present private documents still require independent legal and Owner decision',()=>temp(dir=>{
 const bytes=buffer({...sample(),fixtureOnly:false});
 const manifest=fixtureRights(bytes,dir);
 const r=assessCandidateCustody(bytes,{nowMs:now,symbols:SYMBOLS,rightsManifest:manifest,evidenceDir:dir});
 assert.equal(r.technicalStatus,'PASS');
 assert.equal(r.rightsEvidenceStatus,'HASHES_MATCHED_PENDING_HUMAN_REVIEW');
 assert.equal(r.rightsEvidence.length,4);
 assert.equal(r.stageEligible,false);
 assert.equal(r.releaseStatus,'HOLD_FOR_LEGAL_AND_OWNER_APPROVAL');
 assert.equal(r.publicationAuthorized,false);
}));
test('synthetic fixture is always barred from stage even with matching document hashes',()=>temp(dir=>{
 const bytes=buffer(sample());
 const manifest=fixtureRights(bytes,dir);
 const r=assessCandidateCustody(bytes,{nowMs:now,symbols:SYMBOLS,rightsManifest:manifest,evidenceDir:dir,stageRequested:true});
 assert.ok(r.rightsBlocks.includes('FIXTURE_CANNOT_STAGE'));
 assert.equal(r.stageEligible,false);
}));
test('no permissions means a metadata-only HOLD receipt, no staged candidate',()=>temp(dir=>{
 const candidate=path.join(dir,'source.json');fs.writeFileSync(candidate,buffer(sample()));
 const result=prepareCandidate(['--candidate',candidate,'--out-dir',path.join(dir,'private'),'--now',new Date(now).toISOString(),'--stage']);
 assert.equal(result.result.stageEligible,false);
 assert.equal(result.result.releaseStatus,'HOLD_FOR_LEGAL_AND_OWNER_APPROVAL');
 assert.ok(fs.existsSync(path.join(result.out,'custody.json')));
 assert.ok(!fs.existsSync(path.join(result.out,'market_snapshot.json')));
 const receipt=fs.readFileSync(path.join(result.out,'custody.json'),'utf8');
 assert.ok(!receipt.includes('"value":100'));
}));
test('candidate output paths inside tracked repository are forbidden',()=>temp(dir=>{
 const candidate=path.join(dir,'source.json');fs.writeFileSync(candidate,buffer(sample()));
 assert.throws(()=>prepareCandidate(['--candidate',candidate,'--out-dir',path.join(ROOT,'public/data','test-candidate'),'--now',new Date(now).toISOString()]),
  /PRIVATE_OUTSIDE_REPO_REQUIRED/);
 assert.ok(!fs.existsSync(path.join(ROOT,'public/data','test-candidate')));
}));


test('sidecar absence prevents staging even with valid fictional grant hashes',()=>temp(dir=>{
  const bytes=buffer({...sample(),fixtureOnly:false});
  const grants=fixtureRights(bytes,dir);
  const r=assessCandidateCustody(bytes,{
    nowMs:now,symbols:SYMBOLS,rightsManifest:grants,evidenceDir:dir,stageRequested:true,
  });
  assert.equal(r.technicalStatus,'PASS');
  assert.equal(r.sidecarStatus,'INCOMPLETE');
  assert.ok(r.sidecarBlocks.includes('SOURCE_SIDECARS_REQUIRED'));
  assert.equal(r.stageEligible,false);
}));
test('three-asset bundle binding detects altered NAV sidecar independently of quote hash',()=>temp(dir=>{
  const {copy,nav,health}=sidecars({...sample(),fixtureOnly:false});
  const bytes=buffer(copy),grants=boundRights(bytes,nav,health,dir);
  const altered=Buffer.from(JSON.stringify({...JSON.parse(nav.toString()),generatedAt:'2026-11-18T00:00:00Z'}));
  const r=assessCandidateCustody(bytes,{
    navSidecarBytes:altered,healthSidecarBytes:health,
    nowMs:now,symbols:SYMBOLS,rightsManifest:grants,evidenceDir:dir,stageRequested:true,
  });
  assert.ok(r.rightsBlocks.includes('RIGHTS_BUNDLE_BINDING_INVALID'));
  assert.ok(r.sidecarBlocks.includes('SIDECAR_COLLECTION_CLOCK_CONFLICT'));
  assert.equal(r.stageEligible,false);
}));
test('publisher source-health sidecar mismatch is a technical block',()=>temp(dir=>{
  const {copy,nav,health}=sidecars({...sample(),fixtureOnly:false});
  const bytes=buffer(copy),grants=boundRights(bytes,nav,health,dir);
  const tampered=Buffer.from(JSON.stringify({...JSON.parse(health.toString()),sources:{}}));
  grants.bundleSha256=hash(Buffer.from([
    'market_snapshot.json:'+hash(bytes),
    'mutual_fund_snapshot.json:'+hash(nav),
    'market_source_health.json:'+hash(tampered)
  ].join('\n')+'\n'));
  const r=assessCandidateCustody(bytes,{
    navSidecarBytes:nav,healthSidecarBytes:tampered,
    nowMs:now,symbols:SYMBOLS,rightsManifest:grants,evidenceDir:dir,stageRequested:true,
  });
  assert.ok(r.sidecarBlocks.includes('SOURCE_HEALTH_SIDECAR_MISMATCH'));
  assert.equal(r.stageEligible,false);
}));
test('hypothetical complete bundle can be PRIVATE staged with independently rehashed bytes; release stays HOLD',()=>temp(dir=>{
  const {copy,nav,health}=sidecars({...sample(),fixtureOnly:false});
  const bytes=buffer(copy),grants=boundRights(bytes,nav,health,dir);
  const candidate=path.join(dir,'source.json');
  const navInput=path.join(dir,'nav.json'),healthInput=path.join(dir,'health.json');
  const rights=path.join(dir,'rights.json');
  fs.writeFileSync(candidate,bytes);
  fs.writeFileSync(navInput,nav);
  fs.writeFileSync(healthInput,health);
  fs.writeFileSync(rights,JSON.stringify(grants));
  const out=path.join(dir,'private');
  const {result}=prepareCandidate([
    '--candidate',candidate,'--nav-sidecar',navInput,'--health-sidecar',healthInput,
    '--rights',rights,'--evidence-dir',dir,'--out-dir',out,
    '--now',new Date(now).toISOString(),'--stage'
  ]);
  assert.equal(result.technicalStatus,'PASS');
  assert.equal(result.rightsEvidenceStatus,'HASHES_MATCHED_PENDING_HUMAN_REVIEW');
  assert.equal(result.sidecarStatus,'MATCHED');
  assert.equal(result.stageEligible,true);
  assert.equal(result.publicationAuthorized,false);
  assert.equal(result.releaseStatus,'HOLD_FOR_LEGAL_AND_OWNER_APPROVAL');
  assert.equal(result.staged.length,3);
  for(const [name,source] of [
    ['market_snapshot.json',bytes],['mutual_fund_snapshot.json',nav],
    ['market_source_health.json',health]
  ]){
    const actual=fs.readFileSync(path.join(out,name));
    assert.equal(hash(actual),hash(source));
    assert.equal(fs.statSync(path.join(out,name)).mode & 0o077,0);
  }
  const second=()=>prepareCandidate(['--candidate',candidate,'--out-dir',out,'--now',new Date(now).toISOString()]);
  assert.throws(second,/CUSTODY_RECEIPT_ALREADY_EXISTS/);
}));

test('free/open-only no longer contains any scheduled public quote writer',()=>{
  const workflow=fs.readFileSync(path.join(ROOT,'.github/workflows/market_refresh.yml'),'utf8');
  assert.doesNotMatch(workflow,/^\\s*schedule:/m);
  assert.doesNotMatch(workflow,/^\\s*refresh:/m);
  assert.doesNotMatch(workflow,/git push origin HEAD:main/);
  assert.match(workflow,/persist-credentials: false/);
});
