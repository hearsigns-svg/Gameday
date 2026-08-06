import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { planReconcile } from './lib/providers/tennisApiAtp.js';
admin.initializeApp({ projectId: 'gameday-fixtures' });
const db=admin.firestore();
const S='/private/tmp/claude-501/-Users-lnw/ca812d43-a9a3-4f93-88f5-0859006ff343/scratchpad';
const ranked=JSON.parse(readFileSync(`${S}/atp-rank-vendor.json`,'utf8')).rankings
  .map(r=>({vendorId:String(r.team.id),name:r.team.name,rank:r.ranking,countryCode:r.team?.country?.alpha3??null}));
const all=(await db.collection('athletes').where('sport','==','tennis').get()).docs.map(d=>({id:d.id,...d.data()}));
// MEN ONLY. A WTA-id-backed athlete is a woman and is out of scope.
const men=all.filter(a=>a.providerIds?.wta===undefined);
const women=all.length-men.length;
const devs=(await db.collection('devices').get()).docs.map(d=>d.data());
const followed=new Set(devs.flatMap(d=>d.followKeys??[]).filter(k=>k.startsWith('athlete_')));
const plan=planReconcile(ranked, men.map(a=>({id:a.id,displayName:a.displayName,countryCode:a.countryCode,groupingKey:a.groupingKey,providerIds:a.providerIds})), followed);
const out=(k,v)=>console.log(`${String(k).padEnd(52)} ${v}`);
console.log('=== DRY RUN — nothing written ===');
out('vendor ranked (top 500)', ranked.length);
out('our tennis athletes', all.length);
out('  WTA women — OUT OF SCOPE, untouched', women);
out('  men considered', men.length);
console.log();
out('KEEP (same doc id, rank+vendor id updated)', plan.keep.length);
out('  of which matched by reversed name order', plan.keep.filter(k=>k.via==='reversed').length);
out('CREATE (ranked, genuinely new)', plan.create.length);
out('KEEP-FOLLOWED (unranked but somebody follows)', plan.keepFollowed.length);
out('REVIEW (neither merged nor created)', plan.review.length);
out('REMOVE (unranked, unfollowed)', plan.remove.length);
console.log();
console.log('the 7 device-followed tennis athletes end up:');
for(const id of followed){
  const a=all.find(x=>x.id===id); if(!a) continue;
  const k=plan.keep.find(k=>k.athleteId===id);
  const f=plan.keepFollowed.find(k=>k.athleteId===id);
  const r=plan.remove.find(k=>k.athleteId===id);
  const w=a.providerIds?.wta!==undefined;
  out(`  ${a.displayName}`, w?'WTA — untouched':k?`KEPT (id unchanged, rank ${k.player.rank})`:f?'KEPT (followed)':r?'*** REMOVED ***':'?');
}
console.log('\nREVIEW list (a human decides, nothing moves):');
for(const r of plan.review) out(`  #${r.player.rank} ${r.player.name} (${r.player.countryCode})`, '~ '+r.candidates.join(' / '));
console.log('\nsample of what REMOVE would delete:');
for(const r of plan.remove.slice(0,8)) out('  '+r.displayName, r.athleteId);
process.exit(0);
