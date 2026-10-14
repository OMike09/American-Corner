'use strict';
const {createPostgres}=require('./postgres-adapter'),{restoreBackup}=require('./postgres-backup');
const file=process.argv[2];if(!process.env.DATABASE_URL||!file||process.argv[3]!=='--confirm-empty-destination'){console.error('Usage: DATABASE_URL=<secret> node restore-postgres.js <backup.pg.json.gz> --confirm-empty-destination');process.exit(2)}const db=createPostgres(process.env.DATABASE_URL);try{console.log(JSON.stringify(restoreBackup(db,file),null,2))}finally{db.close()}
