import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze} from '../scripts/analyze-human-playtests.mjs';
const match=(id,extra={})=>({matchId:id,release:'test-only',date:'2026-09-13',human:true,completed:true,validForBalance:true,devicesAndBrowsers:['test fixture'],experienceMix:'mixed',playerCount:4,roleCounts:{mafia_boss:1,detective:1,citizen:2},settings:{full_trial:false},durationMinutes:20,rounds:3,winner:'village',issues:[],...extra});
test('No human evidence is reported when records are empty',()=>assert.equal(analyze([]).eligible,0));
test('Bot, duplicate, incomplete, invalid roster and outcome-affected matches are excluded',()=>{
 const r=analyze([match('one'),match('one'),match('bot',{human:false}),match('incomplete',{completed:false}),match('roster',{playerCount:5}),match('broken',{issues:[{affectsOutcome:true}]})]);
 assert.equal(r.eligible,1);assert.equal(r.excluded.length,5);assert.equal(r.groups[0].reviewStatus,'INSUFFICIENT_SAMPLE');
});
test('Different releases, roles and settings are not pooled; even ten matches require review',()=>{
 const records=Array.from({length:10},(_,i)=>match('m'+i,{winner:i<7?'village':'mafia',durationMinutes:i+1}));
 records.push(match('new-release',{release:'next'}),match('different-rules',{settings:{full_trial:true}}),match('different-roles',{roleCounts:{mafia_boss:1,citizen:3}}));
 const r=analyze(records);assert.equal(r.groups.length,4);assert.equal(r.groups[0].medianMinutes,5.5);assert.deepEqual(r.groups[0].wins,{village:7,mafia:3});assert.equal(r.groups[0].reviewStatus,'HUMAN_REVIEW_REQUIRED');assert.equal(r.automaticRoleChanges,false);
});
