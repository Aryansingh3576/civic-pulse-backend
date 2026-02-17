const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS complaint_timeline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_id INTEGER REFERENCES issues(id),
            user_id INTEGER REFERENCES users(id),
            action TEXT,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error("Error creating table:", err);
        } else {
            console.log("complaint_timeline table created successfully");
        }
    });
});

db.close();
