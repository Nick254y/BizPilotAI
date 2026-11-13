const express = require("express");
const jwt = require("jsonwebtoken");
const cron = require("node-cron");

const CRON_TIME = process.env.AGENT_CRON || "0 8 * * *";

module.exports = function ({ db, saveDatabase, jwtSecret }) {
    const router = express.Router();

    db.run(`
        CREATE TABLE IF NOT EXISTS agent_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            report_date TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, report_date),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    saveDatabase();

    function rows(sql, params) {
        const stmt = db.prepare(sql);
        stmt.bind(params || []);
        const out = [];
        while (stmt.step()) out.push(stmt.getAsObject());
        stmt.free();
        return out;
    }

    function today() {
        const d = new Date();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return d.getFullYear() + "-" + m + "-" + day;
    }

    async function askAI(prompt) {
        const apiKey = process.env.AI_API_KEY;
        const baseUrl = process.env.AI_BASE_URL;
        const model = process.env.AI_MODEL;

        if (!apiKey || !baseUrl || !model) {
            throw new Error("AI is not configured.");
        }

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                max_tokens: 1024,
                messages: [
                    {
                        role: "system",
                        content:
                            "You are BizPilot AI, a business assistant. " +
                            "Use only the data you are given. Never invent facts."
                    },
                    { role: "user", content: prompt }
                ]
            }),
            signal: AbortSignal.timeout(90000)
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`AI error ${response.status}: ${body}`);
        }

        const data = await response.json();
        const text = (data.choices?.[0]?.message?.content || "").trim();

        if (!text) throw new Error("Empty AI response.");
        return text;
    }

    // Build and save today's briefing for one user
    async function generateForUser(user, force) {
        const date = today();

        if (!force) {
            const existing = rows(
                "SELECT id FROM agent_reports WHERE user_id = ? AND report_date = ?",
                [user.id, date]
            );
            if (existing.length) return null;
        }

        const projects = rows(
            `SELECT title, description, status,
                    CAST(julianday('now') - julianday(created_at) AS INTEGER) AS age_days
             FROM projects WHERE user_id = ? AND status != 'completed'
             ORDER BY id DESC LIMIT 30`,
            [user.id]
        );

        if (!projects.length) return null;

        const list = projects
            .map((p) =>
                `- ${p.title} (status: ${p.status}, ${p.age_days} days old)` +
                (p.description ? `: ${String(p.description).slice(0, 200)}` : "")
            )
            .join("\n");

        const prompt =
            `Today is ${date}. Write a short daily briefing for ${user.name}.\n` +
            "Use these headings: Priorities today, Needs attention, One suggestion.\n" +
            "Keep it under 150 words. Flag paused projects and old active ones.\n\n" +
            `Open projects:\n${list}`;

        const content = await askAI(prompt);

        db.run(
            `INSERT OR REPLACE INTO agent_reports (user_id, report_date, content)
             VALUES (?, ?, ?)`,
            [user.id, date, content]
        );
        saveDatabase();

        return content;
    }

    // Run for every user, one at a time (keeps within free rate limits)
    async function runForAllUsers() {
        const users = rows("SELECT id, name FROM users");
        console.log(`[agent] Daily summary for ${users.length} user(s)`);

        for (const user of users) {
            try {
                await generateForUser(user, false);
            } catch (error) {
                console.error(`[agent] User ${user.id} failed:`, error.message);
            }
            await new Promise((resolve) => setTimeout(resolve, 2500));
        }

        console.log("[agent] Done");
    }

    cron.schedule(CRON_TIME, runForAllUsers);
    console.log(`[agent] Daily summary scheduled: "${CRON_TIME}"`);

    // Catch-up: if the server starts after the scheduled time, run now
    const parts = CRON_TIME.trim().split(/\s+/);
    const schedMinute = Number(parts[0]);
    const schedHour = Number(parts[1]);

    if (Number.isInteger(schedMinute) && Number.isInteger(schedHour)) {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        if (nowMinutes >= schedHour * 60 + schedMinute) {
            console.log("[agent] Catch-up check in 20 seconds");
            setTimeout(runForAllUsers, 20000);
        }
    }

    // Protect the routes
    router.use((req, res, next) => {
        const header = req.headers.authorization;

        if (!header || !header.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Authentication required." });
        }

        try {
            req.user = jwt.verify(header.split(" ")[1], jwtSecret);
            next();
        } catch {
            return res.status(401).json({ message: "Invalid or expired token." });
        }
    });

    // Run my briefing now (for testing)
    router.post("/run", async (req, res) => {
        try {
            const users = rows("SELECT id, name FROM users WHERE id = ?", [req.user.id]);

            if (!users.length) {
                return res.status(404).json({ message: "User not found." });
            }

            const content = await generateForUser(users[0], true);

            if (!content) {
                return res.json({
                    message: "No open projects to summarize. Create a project first."
                });
            }

            res.json({ report: content });
        } catch (error) {
            console.error("[agent] Run failed:", error.message);
            res.status(502).json({ message: "Could not generate the briefing." });
        }
    });

    // My latest briefings
    router.get("/reports", (req, res) => {
        const reports = rows(
            `SELECT report_date, content FROM agent_reports
             WHERE user_id = ? ORDER BY report_date DESC LIMIT 10`,
            [req.user.id]
        );
        res.json({ reports });
    });

    return router;
};
