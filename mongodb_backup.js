const {exec} = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

// Config
const MONGO_URI = `mongodb://root:root_password1220@localhost:27017/nomination_tracker?authSource=admin`;
const MONGODUMP_PATH = `"C:\\Program Files\\MongoDB\\Tools\\100\\bin\\mongodump.exe"`; // Adjust path
const BACKUP_DIR = 'C:\\mongo_backup\\backups';

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, {recursive: true});

// Run daily at 2:00 AM
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(BACKUP_DIR, timestamp);
fs.mkdirSync(backupPath, {recursive: true});

const command = `${MONGODUMP_PATH} --uri="${MONGO_URI}" --out="${backupPath}"`;

exec(command, (error, stdout, stderr) => {
    if (error) {
        console.error(`[Mongo Backup Error] ${stderr}`);
    } else {
        console.log(`[Mongo Backup Success] Backup saved to ${backupPath}`);
    }
});
