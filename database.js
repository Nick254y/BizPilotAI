const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "bizpilot.sqlite");

async function initializeDatabase() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const SQL = await initSqlJs();
    let db;

    if (fs.existsSync(DB_PATH)) {
        const file = fs.readFileSync(DB_PATH);
        db = new SQL.Database(new Uint8Array(file));
    } else {
        db = new SQL.Database();
    }

    db.run("PRAGMA foreign_keys = ON");

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id)
                REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ai_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id)
                REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    function saveDatabase() {
        const data = db.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
        db.run("PRAGMA foreign_keys = ON");
    }

    saveDatabase();
    console.log("BizPilot AI database initialized!");

    return { db, saveDatabase };
}

module.exports = initializeDatabase;
