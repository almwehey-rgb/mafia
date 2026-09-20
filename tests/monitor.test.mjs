import test from 'node:test';
import assert from 'node:assert/strict';
import {MonitorRules} from '../scripts/monitor-rules.mjs';
test('alerts require repeated evidence and suppress duplicates until recovery',()=>{
 const rules=new MonitorRules({staleMs:100,slowMs:50,cooldownMs:1000});
 const bad={ok:false,durationMs:0};
 assert.deepEqual(rules.inspect(bad,1000),[]);assert.deepEqual(rules.inspect(bad,1001),[]);
 assert.equal(rules.inspect(bad,1002)[0].key,'requests.failed');
 assert.deepEqual(rules.inspect(bad,1003),[]);
 assert.equal(rules.inspect({ok:true,durationMs:10},1004)[0].event,'mafia.recovered');
 const slow={ok:true,durationMs:80,rooms:[{code:'1234',phase:'night',phase_started_at:new Date(0).toISOString()}]};
 rules.inspect(slow,1100);rules.inspect(slow,1101);
 assert.deepEqual(rules.inspect(slow,1102).map(e=>e.key),['requests.slow','room.stalled.1234']);
 assert.deepEqual(rules.inspect(slow,1103),[]);
 assert.equal(rules.inspect({ok:true,durationMs:1,rooms:[{code:'1234',phase:'paused'}]},1104).length,2);
});
