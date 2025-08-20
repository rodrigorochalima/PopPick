import {formatDate} from './utils.js';

const DB_NAME='poppick-db', DB_VERSION=1;
const S_USERS='users', S_CONTENT='content', S_EVENTS='events', S_MESSAGES='messages', S_META='meta';

let dbPromise = IDB.openDB(DB_NAME, DB_VERSION, (db)=>{
  if(!db.objectStoreNames.contains(S_USERS)) db.createObjectStore(S_USERS,{keyPath:'id'});
  if(!db.objectStoreNames.contains(S_CONTENT)) db.createObjectStore(S_CONTENT,{keyPath:'id'});
  if(!db.objectStoreNames.contains(S_EVENTS)) db.createObjectStore(S_EVENTS,{keyPath:'id',autoIncrement:true});
  if(!db.objectStoreNames.contains(S_MESSAGES)) db.createObjectStore(S_MESSAGES,{keyPath:'id',autoIncrement:true});
  if(!db.objectStoreNames.contains(S_META)) db.createObjectStore(S_META,{keyPath:'key'});
});
async function db(){ return dbPromise; }

export async function init(){
  const d=await db(); const meta=await IDB.get(d,S_META,'seeded');
  if(!meta){
    const admin={id:'rodrigo',role:'admin',email:'',whatsapp:'',avatar:'',createdAt:new Date().toISOString()};
    await IDB.set(d,S_USERS,admin);
    await IDB.set(d,S_META,{key:'seeded',at:new Date().toISOString()});
    await IDB.set(d,S_META,{key:'categories',value:['disney','universal','nasa']});
  }
}
export async function usersAll(){const d=await db();return IDB.all(d,S_USERS)}
export async function userGet(id){const d=await db();return IDB.get(d,S_USERS,id)}
export async function userSave(u){const d=await db();return IDB.set(d,S_USERS,u)}
export async function userDelete(id){const d=await db();return IDB.del(d,S_USERS,id)}
export async function contentAll(){const d=await db();return IDB.all(d,S_CONTENT)}
export async function contentSave(c){const d=await db();return IDB.set(d,S_CONTENT,c)}
export async function contentGet(id){const d=await db();return IDB.get(d,S_CONTENT,id)}
export async function watchAdd(e){const d=await db();return IDB.set(d,S_EVENTS,e)}
export async function watchAll(){const d=await db();return IDB.all(d,S_EVENTS)}
export async function msgSend(m){const d=await db();return IDB.set(d,S_MESSAGES,m)}
export async function msgInbox(userId){const d=await db();const all=await IDB.all(d,S_MESSAGES);return all.filter(x=>x.to===userId)}
export async function exportUserCSV(userId){
  const events=(await watchAll()).filter(e=>e.userId===userId);
  const rows=[['username','contentId','date','score']];
  for(const e of events){ rows.push([userId,e.contentId,formatDate(e.date),e.score??'']); }
  return rows;
}
export async function backupAll(){
  const d=await db();
  const [users,content,events,messages]=await Promise.all([IDB.all(d,S_USERS),IDB.all(d,S_CONTENT),IDB.all(d,S_EVENTS),IDB.all(d,S_MESSAGES)]);
  return {users,content,events,messages,exportedAt:new Date().toISOString()};
}
export async function restoreAll(obj){
  const d=await db();
  for(const u of (obj.users||[])) await IDB.set(d,S_USERS,u);
  for(const c of (obj.content||[])) await IDB.set(d,S_CONTENT,c);
  for(const e of (obj.events||[])) await IDB.set(d,S_EVENTS,e);
  for(const m of (obj.messages||[])) await IDB.set(d,S_MESSAGES,m);
}
