const db = require('../config/db');

async function run() {
    try {
        console.log("Attempting to add sla_deadline column...");
        await db.query("ALTER TABLE issues ADD COLUMN sla_deadline DATETIME;");
        console.log("✅ Column sla_deadline added successfully.");
    } catch (err) {
        if (err.message.includes("duplicate column name")) {
            console.log("ℹ️ Column sla_deadline already exists.");
        } else {
            console.error("❌ Error adding column:", err.message);
        }
    }
    process.exit();
}

run();
