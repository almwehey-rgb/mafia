// One-time migration. Refuses to overwrite an established source tree.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
try{await access('src/build-manifest.json');throw Error('Sources already migrated');}catch(e){if(e.code!=='ENOENT')throw e;}
const manifest={client:[],server:[]};
async function split(target,folder,boundaries,key){
 const input=await readFile(target,'utf8');
 await mkdir(folder,{recursive:true});
 const points=boundaries.map(([name,marker])=>({name,index:marker?input.indexOf(marker):0}));
 for(let i=0;i<points.length;i++){
  if(points[i].index<0||(i&&points[i].index<=points[i-1].index))throw Error('Missing/unsorted boundary '+points[i].name);
  const path=`${folder}/${points[i].name}`;
  await writeFile(path,input.slice(points[i].index,points[i+1]?.index??input.length));manifest[key].push(path);
 }
 const output=(await Promise.all(manifest[key].map(p=>readFile(p,'utf8')))).join('');
 if(input!==output)throw Error('Split changed runtime');
 console.log(target+' preserved SHA256 '+createHash('sha256').update(output).digest('hex'));
}
await split('dist/game.js','src/client',[
 ['state.js',null],['phase-ui.js','function signalPhase()'],['warmup.js','function warmApi()'],['busy-ui.js','function setBusy('],
 ['role-definitions.js','const roleNames ='],['event-definitions.js','const eventText ='],['transport.js','async function api('],['room-tag.js','function setRoomTag('],
 ['session-storage.js','function sessionKey('],['view-helpers.js','function nameOf('],['host-preferences.js','function normalizeEnabledRoles('],
 ['host-entry.js','function renderHostLogin()'],['session-recovery.js','function readSavedSession('],['profile-ui.js','function achievements('],
 ['role-cards.js','function selectRoleView('],['spectator-ui.js','function spectatorForm()'],['room-entry.js','async function createRoom()'],
 ['polling.js','function renderStateKey('],['host-view.js','function syncHistoryMatch()'],['host-actions.js','let lifecycleRequestPending'],
 ['player-view.js','function roleAcknowledged()'],['player-tools.js','function mountPlayerTools()'],['player-chat.js','let unreadChat='],
 ['player-actions.js','async function playerAction('],['journey-ui.js','function eliminationNotice()']
 ],'client');
await split('supabase/functions/mafia-room/index.ts','src/server',[
 ['runtime.ts',null],['transition-plan.ts','const copyJson ='],['database.ts','function currentDatabase()'],['response.ts','const rateBuckets ='],
 ['role-rules.ts','const shuffle ='],['data-access.ts','async function load('],['authority.ts','const detectiveQuestionCount ='],
 ['bots.ts','async function botNightActions('],['statistics.ts','async function recordStats('],['views.ts','function adminPlayerView('],
 ['resolution.ts','async function eliminatePlayers('],['state.ts','function actorRateLimited('],['router.ts','async function handleRequest('],
 ['commit.ts','async function reconcileDeparture(']
 ],'server');
await writeFile('src/build-manifest.json',JSON.stringify(manifest,null,2)+'\n');
