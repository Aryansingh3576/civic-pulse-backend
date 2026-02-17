const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../database.sqlite');

function initDb() {
    const db = new sqlite3.Database(dbPath);
    const schemaPath = path.join(__dirname, '../schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Initializing SQLite database at:', dbPath);

    db.exec(schemaSql, (err) => {
        if (err) {
            console.error('Error initializing database:', err);
            process.exit(1);
        } else {
            console.log('Database initialized successfully!');
            process.exit(0);
        }
    });
}

initDb();
