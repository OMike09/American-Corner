'use strict';
const {workerData}=require('node:worker_threads');
const {Client,types}=require('pg');
types.setTypeParser(20,value=>Number(value));types.setTypeParser(1700,value=>Number(value));
let client=null,ready=false;
async function connect(){client=new Client({connectionString:workerData.url,connectionTimeoutMillis:12000,query_timeout:20000});client.on('error',()=>{ready=false});await client.connect();ready=true}
let chain=Promise.resolve();
workerData.port.on('message',item=>{chain=chain.then(async()=>{
 try{
  if(!ready)await connect();
  const args=(item.args||[]).map(x=>x instanceof Uint8Array?Buffer.from(x):x);
  const result=await client.query(item.sql,args);
  workerData.port.postMessage({rows:result.rows||[],rowCount:result.rowCount||0});
 }catch(e){workerData.port.postMessage({error:{message:e.message,code:e.code||'',detail:e.detail||''}})}
 Atomics.store(workerData.signal,0,1);Atomics.notify(workerData.signal,0);
 }).catch(e=>{console.error('PostgreSQL worker failed:',e.message)})});
