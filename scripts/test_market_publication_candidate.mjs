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
 assert.ok(r.technicalBlocks.includes('EQUITIES_MISSING'));
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
