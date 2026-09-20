import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
export function analyze(records){
 if(!Array.isArray(records))throw Error('Playtests must be an array');
 const groups=new Map(),excluded=[],seen=new Set();
 for(const record of records){
  const invalid=[];
  if(!record.matchId||seen.has(record.matchId))invalid.push('missing/duplicate matchId');
  if(record.matchId)seen.add(record.matchId);
  if(record.templateOnly||record.human!==true||record.completed!==true||record.validForBalance!==true)invalid.push('not a valid completed human match');
  if(!record.release||!record.date||!Array.isArray(record.devicesAndBrowsers)||!record.devicesAndBrowsers.length||!record.experienceMix)invalid.push('missing release/date/devices/experience');
  if(!Number.isInteger(record.playerCount)||record.playerCount<2||record.playerCount>20)invalid.push('invalid player count');
  const roles=Object.entries(record.roleCounts||{}).sort(([a],[b])=>a.localeCompare(b));
  if(!roles.length||roles.some(([,n])=>!Number.isInteger(n)||n<0)||roles.reduce((n,[,v])=>n+v,0)!==record.playerCount)invalid.push('role counts do not match players');
  if(!Number.isFinite(record.durationMinutes)||record.durationMinutes<=0||!Number.isInteger(record.rounds)||record.rounds<1)invalid.push('invalid duration/rounds');
  if(!['village','mafia','serial_killer','jester','lovers','draw'].includes(record.winner))invalid.push('missing/unknown winner');
  if(!Array.isArray(record.issues)||record.issues.some(issue=>issue.affectsOutcome||issue.blocksGame||issue.revealsRoles))invalid.push('missing issues or match affected by a blocker');
  if(!record.settings||typeof record.settings!=='object'||Array.isArray(record.settings))invalid.push('missing settings');
  if(invalid.length){excluded.push({matchId:record.matchId||null,reasons:invalid});continue;}
  const settings=Object.entries(record.settings).sort(([a],[b])=>a.localeCompare(b));
  const key=JSON.stringify({release:record.release,players:record.playerCount,roles,settings,experience:record.experienceMix});
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(record);
 }
 const median=values=>{const v=values.toSorted((a,b)=>a-b),m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;};
 return {humanMatches:records.length,eligible:records.length-excluded.length,excluded,groups:[...groups].map(([key,matches])=>({configuration:JSON.parse(key),matches:matches.length,wins:Object.fromEntries([...new Set(matches.map(m=>m.winner))].map(w=>[w,matches.filter(m=>m.winner===w).length])),medianMinutes:median(matches.map(m=>m.durationMinutes)),medianRounds:median(matches.map(m=>m.rounds)),reviewStatus:matches.length<10?'INSUFFICIENT_SAMPLE':'HUMAN_REVIEW_REQUIRED'})),automaticRoleChanges:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'))){
 const report=analyze(JSON.parse(await readFile(process.argv[2]||'docs/human-playtests.json','utf8')));
 await writeFile(process.argv[3]||'artifacts/human-balance-report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
