'use strict';
/** Explicit offline import. Never run at web startup; never mutates its SQLite source. */
const Database=require('better-sqlite3'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createPostgres}=require('./postgres-adapter');
const args=process.argv.slice(2);function arg(name){const i=args.indexOf('--'+name);return i<0?'':args[i+1]||''}
const sourcePath=arg('source'),uploads=arg('uploads'),backupDir=arg('backup-dir'),dryRun=args.includes('--dry-run');
if(!sourcePath||!uploads||!backupDir||!process.env.DATABASE_URL){console.error('Usage: DATABASE_URL=<secret dans environnement> node migrate-sqlite-to-postgres.js --source <american_corner.sqlite3> --uploads <dossier uploads> --backup-dir <dossier de sauvegarde hors service> [--dry-run]');process.exit(2)}
if(!fs.existsSync(sourcePath)||!fs.statSync(sourcePath).isFile()||!fs.existsSync(uploads)||!fs.statSync(uploads).isDirectory())throw Error('Base source ou dossier uploads absent. Import interrompu.');
if(path.resolve(backupDir).startsWith(path.resolve(uploads)+path.sep))throw Error('Le dossier de sauvegarde ne doit pas se trouver dans uploads.');
fs.mkdirSync(backupDir,{recursive:true});
function hash(file){const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buf=Buffer.alloc(65536);try{for(let n;(n=fs.readSync(fd,buf,0,buf.length,null))>0;)h.update(buf.subarray(0,n));return h.digest('hex')}finally{fs.closeSync(fd)}}
function safeFile(name){if(typeof name!=='string'||!name||name!==path.basename(name))throw Error('Nom de fichier invalide dans les métadonnées : '+name);const file=path.join(uploads,name);if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw Error('Fichier référencé absent : '+name);return file}
async function main(){
 let src=new Database(sourcePath,{readonly:true,fileMustExist:true});if(src.pragma('quick_check',{simple:true})!=='ok')throw Error('Source SQLite non intègre. Import interdit.');
 const preTables=src.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
 const required=['users','roles','user_roles','years','results','documents','settings'];if(required.some(x=>!preTables.includes(x)))throw Error('Schéma SQLite incomplet ou inattendu. Import interdit.');
 if(src.pragma('foreign_key_check').length)throw Error('Relations SQLite invalides. Import interdit.');
 const backup=path.join(backupDir,'pre-postgres-'+new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)+'-'+crypto.randomBytes(4).toString('hex')+'.sqlite3');await src.backup(backup);src.close();src=new Database(backup,{readonly:true,fileMustExist:true});if(src.pragma('quick_check',{simple:true})!=='ok'||src.pragma('foreign_key_check').length)throw Error('Sauvegarde SQLite non restaurable ou relations invalides.');
 const existing=src.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name),tables=new Set(existing),counts=Object.fromEntries(existing.map(t=>[t,src.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n]));
 const references=[...src.prepare('SELECT storage_name,size,mime FROM documents').all(),...(tables.has('video_posts')?src.prepare('SELECT storage_name,size,mime FROM video_posts').all():[]),...(tables.has('publication_media')?src.prepare('SELECT storage_name,size,mime FROM publication_media').all():[]),...(tables.has('publication_media_history')?src.prepare('SELECT storage_name,size,mime FROM publication_media_history').all():[]),...(tables.has('enrollment_documents')?src.prepare("SELECT storage_name,size,'application/pdf' mime FROM enrollment_documents WHERE deleted_at IS NULL").all():[])];const files=[...new Map(references.map(x=>[x.storage_name,x])).values()].map(x=>({name:x.storage_name,file:safeFile(x.storage_name),size:x.size,mime:x.mime}));for(const f of files)if(fs.statSync(f.file).size!==f.size)throw Error('Taille du fichier incohérente : '+f.name);
 const backupHash=hash(backup);
 // Copy referenced assets into the backup folder, preserving each original name and hash.
 const assetBackup=path.join(backupDir,path.basename(backup,'.sqlite3')+'-uploads');fs.mkdirSync(assetBackup,{recursive:true});for(const f of files){const target=path.join(assetBackup,f.name);fs.copyFileSync(f.file,target);if(hash(target)!==hash(f.file))throw Error('Copie de fichier incohérente : '+f.name);f.file=target}
 const manifest={created_at:new Date().toISOString(),source:path.basename(sourcePath),backup:path.basename(backup),backup_sha256:backupHash,counts,files:files.map(f=>({name:f.name,size:f.size,sha256:hash(f.file)})),source_foreign_key_violations:0};const manifestFile=path.join(backupDir,path.basename(backup,'.sqlite3')+'-manifest.json');fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2),{mode:0o600});
 const pg=createPostgres(process.env.DATABASE_URL);try{
  const remote=pg.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('schema_migrations','file_blobs')").rows.map(x=>x.tablename);
  for(const t of remote)if(pg.query(`SELECT COUNT(*) AS n FROM "${t}"`).rows[0].n)throw Error('Destination PostgreSQL non vide ('+t+'). Import refusé pour éviter d’écraser des comptes.');
  if(pg.query('SELECT COUNT(*) n FROM file_blobs').rows[0].n)throw Error('Fichiers déjà présents dans PostgreSQL. Import refusé.');
  if(dryRun){console.log(JSON.stringify({dry_run:true,backup,manifest:manifestFile,source_counts:counts,file_count:files.length,postgres_empty:true},null,2));return}
  const row_hashes={};pg.query('BEGIN');try{
   pg.query('SET CONSTRAINTS ALL DEFERRED');
   for(const t of existing){const rows=src.prepare(`SELECT * FROM "${t}"`).all();for(const row of rows){const cols=Object.keys(row),labels=cols.map((_,i)=>'$'+(i+1)).join(','),sql=`INSERT INTO "${t}" (${cols.map(c=>'"'+c+'"').join(',')}) VALUES (${labels})`;pg.query(sql,cols.map(c=>row[c]))}}
   for(const f of files){pg.query('INSERT INTO file_blobs(storage_name,data,mime,size,created_at) VALUES ($1,$2,$3,$4,$5)',[f.name,fs.readFileSync(f.file),f.mime,f.size,new Date().toISOString()])}
   for(const [table,n] of Object.entries(counts)){const actual=pg.query(`SELECT COUNT(*) n FROM "${table}"`).rows[0].n;if(actual!==n)throw Error('Différence de lignes '+table+': '+n+' -> '+actual);
    const cols=src.pragma(`table_info(${table})`).map(x=>x.name),projection=cols.map(c=>'"'+c.replace(/"/g,'""')+'"').join(','),sourceRows=src.prepare(`SELECT ${projection} FROM "${table}"`).all(),destRows=pg.query(`SELECT ${projection} FROM "${table}"`).rows;
    const digest=rows=>crypto.createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(row)).sort())).digest('hex');const before=digest(sourceRows),after=digest(destRows);if(before!==after)throw Error('Contenu différent malgré les décomptes : '+table);row_hashes[table]=before;
   }
   for(const t of remote){const columns=pg.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_identity='YES'",[t]).rows;for(const col of columns){pg.query(`SELECT setval(pg_get_serial_sequence('"${t}"','${col.column_name}'), COALESCE(MAX("${col.column_name}"),1), COUNT(*)>0) FROM "${t}"`)}}
   pg.query('COMMIT');
  }catch(e){pg.query('ROLLBACK');throw e}
  for(const f of manifest.files){const b=pg.query('SELECT data FROM file_blobs WHERE storage_name=$1',[f.name]).rows[0]?.data;if(!b||crypto.createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error('Fichier importé non vérifié : '+f.name)}
  const report={imported:true,backup,manifest:manifestFile,source_counts:counts,verified_row_hashes:row_hashes,postgres_counts:Object.fromEntries(existing.map(t=>[t,pg.query(`SELECT COUNT(*) n FROM "${t}"`).rows[0].n])),file_count:files.length,verified_file_hashes:files.length};const reportFile=path.join(backupDir,path.basename(backup,'.sqlite3')+'-report.json');fs.writeFileSync(reportFile,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));
 }finally{pg.close();src.close()}
}
main().catch(e=>{console.error('IMPORT INTERROMPU (aucun effacement de la source) :',e.message);process.exitCode=1});
