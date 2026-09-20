const copyJson = (value:any) => JSON.parse(JSON.stringify(value));
// Compute multi-step transitions on a private copy. No partial result is visible
// until the database validates the preimage and commits all changes together.
class TransitionPlan {
  beforeRoom:any; beforePlayers:any[]; room:any; players:any[];
  snapshots:any[]=[]; audits:any[]=[]; stats=false;
  constructor(room:any,players:any[]) {
    this.beforeRoom=copyJson(room);this.beforePlayers=copyJson(players);
    this.room=copyJson(room);this.players=copyJson(players);
  }
  from(table:string) {
    if(!['mafia_rooms','mafia_players','mafia_snapshots','mafia_audit_events'].includes(table))throw Error('UNPLANNED_TABLE '+table);
    const rows=table==='mafia_rooms'?[this.room]:table==='mafia_players'?this.players:table==='mafia_snapshots'?this.snapshots:this.audits;
    let filters:((row:any)=>boolean)[]=[], patch:any, inserted:any, one=false, deleting=false;
    const valueAt=(row:any,key:string)=>key.split(/->>?/).reduce((value:any,k:string)=>value?.[k],row);
    const query:any={
      select(){return query;},order(){return query;},limit(){return query;},
      range(){filters.push(()=>false);return query;},single(){one=true;return query;},maybeSingle(){one=true;return query;},
      update(value:any){patch=copyJson(value);return query;},insert(value:any){inserted=copyJson(value);return query;},
      delete(){deleting=true;return query;},
      eq(key:string,value:any){filters.push(row=>{const actual=valueAt(row,key);return actual!==null&&typeof actual==='object'?JSON.stringify(actual)===value:String(actual)===String(value);});return query;},
      is(key:string,value:any){filters.push(row=>valueAt(row,key)===value);return query;},
      in(key:string,values:any[]){filters.push(row=>values.includes(valueAt(row,key)));return query;},
      then(resolve:any,reject:any){return Promise.resolve().then(()=>{
        if(inserted){if(table!=='mafia_snapshots'&&table!=='mafia_audit_events')throw Error('UNPLANNED_INSERT');rows.push(inserted);}
        const selected=rows.filter(row=>filters.every(filter=>filter(row)));
        if(patch)for(const row of selected)Object.assign(row,patch);
        if(deleting){if(table!=='mafia_snapshots')throw Error('UNPLANNED_DELETE');for(const row of selected)rows.splice(rows.indexOf(row),1);}
        return {data:copyJson(one?selected[0]||null:selected),error:null};
      }).then(resolve,reject);}
    };
    return query;
  }
}
