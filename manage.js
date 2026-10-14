'use strict';
/** Offline verification/restoration. Stop the web service before restoring. */
const fs=require('node:fs'),path=require('node:path'),Database=require('better-sqlite3');
const DATA=path.resolve(process.env.AC_DATA||path.join(__dirname,'data'));
const DB=path.join(DATA,'american_corner.sqlite3');
async function main(){
 const [action,filename,confirm]=process.argv.slice(2);
 if(!['verify','restore'].includes(action)||!filename||path.basename(filename)!==filename||!filename.endsWith('.sqlite3'))throw Error('Usage : node manage.js verify|restore NOM.sqlite3 [--confirm]');
 const source=path.join(DATA,filename);if(!fs.existsSync(source))throw Error('Sauvegarde introuvable.');
 const check=new Database(source,{readonly:true,fileMustExist:true});
 try{if(check.pragma('integrity_check',{simple:true})!=='ok')throw Error('Intégrité de la sauvegarde invalide.');for(const table of ['users','roles','audit','results'])if(!check.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))throw Error('Sauvegarde incomplète : '+table)}finally{check.close()}
 if(action==='verify'){console.log('Sauvegarde valide :',filename);return}
 if(confirm!=='--confirm')throw Error('Restauration : arrêter le serveur puis ajouter --confirm.');
 if(fs.existsSync(DB)){
  const current=new Database(DB);try{
   const safety=path.join(DATA,'before-restore-'+new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15)+'.sqlite3');
   await current.backup(safety);console.log('Copie de sécurité créée :',path.basename(safety));
  }finally{current.close()}
 }
 if(fs.existsSync(DB+'-wal')||fs.existsSync(DB+'-shm'))throw Error('Fichier WAL détecté : arrêter le serveur avant la restauration.');
 const temporary=path.join(DATA,'.restore.tmp');fs.copyFileSync(source,temporary);fs.renameSync(temporary,DB);console.log('Base restaurée depuis :',filename);
}
main().catch(e=>{console.error('Erreur :',e.message);process.exitCode=1});
