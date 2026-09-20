async function playerAction(action, target) {
  if(playerActionPending)return;
  const context=actionContext();
  playerActionPending=true;actionFeedback={context,target,state:'pending'};paintActionFeedback();
  try {
    const next = await api({ action, code: game.code, id: playerId, playerToken, target });
    if(context!==actionContext())return;
    game=next;actionFeedback={context,target,state:'success'};
    renderPlayer();
  } catch (error) {
    if(context===actionContext()){actionFeedback={context,target,state:'error'};paintActionFeedback();}
  } finally {playerActionPending=false;}
}
function nightAction(target) { return playerAction('act', target); }
let pendingActionConfirmation=null;
function sensitiveActionCopy(kind,target){
  const name=target&&target!=='EXECUTE'?nameOf(String(target).replace(/^(SAVE|POISON):/,'')):'';
  const copies={
    kill:[discussionText('تأكيد الاستهداف','Confirm target'),discussionText('سيُسجل اختيارك على ','Your choice will be recorded for ')+name,discussionText('تأكيد الاختيار','Confirm choice')],
    poison:[discussionText('تأكيد جرعة السم','Confirm poison'),discussionText('ستُستهلك جرعة السم على ','Your poison charge will be used on ')+name,discussionText('استخدام السم','Use poison')],
    save:[discussionText('تأكيد جرعة الحياة','Confirm life potion'),discussionText('ستُستهلك جرعة الحياة لحماية ','Your life potion will be used to protect ')+name,discussionText('استخدام الجرعة','Use potion')],
    shot:[discussionText('تأكيد الطلقة الأخيرة','Confirm final shot'),discussionText('ستستخدم طلقتك الوحيدة على ','You will use your only shot on ')+name,discussionText('إطلاق','Shoot')],
    execute:[discussionText('تأكيد الإعدام','Confirm execution'),discussionText('سيُخصم إعدام واحد وينفذ القرار على السجين.','One execution will be spent and the prisoner will be executed.'),discussionText('تنفيذ الإعدام','Execute')],
  };
  return copies[kind]||copies.kill;
}
function confirmSensitiveAction(action,target,kind='kill'){
  if(playerActionPending)return;
  const [title,message,label]=sensitiveActionCopy(kind,target);
  pendingActionConfirmation={context:actionContext(),action,target};
  openSheet(title,`<div class="action-confirmation" data-no-translate><p>${escapeHtml(message)}</p><div class="actions"><button class="btn" onclick="cancelSensitiveAction()">${discussionText('إلغاء','Cancel')}</button><button class="btn danger" onclick="commitSensitiveAction()">${escapeHtml(label)}</button></div></div>`);
}
function cancelSensitiveAction(){pendingActionConfirmation=null;closeSheet()}
async function commitSensitiveAction(){
  const pending=pendingActionConfirmation;
  if(!pending||pending.context!==actionContext()){cancelSensitiveAction();return;}
  pendingActionConfirmation=null;closeSheet();
  await playerAction(pending.action,pending.target);
}
function confirmNightTarget(target){confirmSensitiveAction('act',target,'kill')}
function confirmShot(target){confirmSensitiveAction('act',target,'shot')}
function confirmPoison(target){confirmSensitiveAction('act',`POISON:${target}`,'poison')}
function confirmLife(target){confirmSensitiveAction('act',`SAVE:${target}`,'save')}
function confirmExecute(){confirmSensitiveAction('act','EXECUTE','execute')}
function witchAction(type, target) { return nightAction(`${type}:${target}`); }
function jailPlayer(target) { return playerAction('jail', target); }
function lawyerProtect(target) { return playerAction('lawyerProtect', target); }
function castVote(target) { return playerAction('vote', target); }

home();
