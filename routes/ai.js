const express = require("express");
const jwt = require("jsonwebtoken");

const MAX_HISTORY = 20;
const SYSTEM_PROMPT =
    "You are BizPilot AI, a practical business assistant. " +
    "Help users plan, run and grow their projects. Be clear and concise.";

module.exports = function ({ db, saveDatabase, jwtSecret }) {
    const router = express.Router();

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

    function getHistory(userId, limit) {
        const stmt = db.prepare(
            "SELECT role, content FROM ai_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?"
        );
        stmt.bind([userId, limit]);

        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();

        rows.reverse();
        while (rows.length && rows[0].role !== "user") rows.shift();
        return rows;
    }

    router.post("/chat", async (req, res) => {
        try {
            const apiKey = process.env.AI_API_KEY;
            const baseUrl = process.env.AI_BASE_URL;
            const model = process.env.AI_MODEL;

            if (!apiKey || !baseUrl || !model) {
                return res.status(500).json({ message: "AI is not configured." });
            }

            const { message } = req.body;

            if (typeof message !== "string" || !message.trim()) {
                return res.status(400).json({ message: "Message is required." });
            }

            const text = message.trim();

            if (text.length > 4000) {
                return res.status(400).json({
                    message: "Message is too long (max 4000 characters)."
                });
            }

            const history = getHistory(req.user.id, MAX_HISTORY);
            const messages = [
                { role: "system", content: SYSTEM_PROMPT },
                ...history,
                { role: "user", content: text }
            ];

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({ model, messages, max_tokens: 2048 }),
                signal: AbortSignal.timeout(90000)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("AI API error:", response.status, errorText);

                if (response.status === 429) {
                    return res.status(429).json({
                        message: "AI limit reached. Try again later."
                    });
                }

                return res.status(502).json({
                    message: "The AI service returned an error."
                });
            }

            const data = await response.json();

            if (data.error) {
                console.error("AI API error:", JSON.stringify(data.error));
                return res.status(502).json({
                    message: "The AI service returned an error."
                });
            }

            const reply = (data.choices?.[0]?.message?.content || "").trim();

            if (!reply) {
                return res.status(502).json({ message: "Empty AI response." });
            }

            db.run(
                "INSERT INTO ai_messages (user_id, role, content) VALUES (?, ?, ?)",
                [req.user.id, "user", text]
            );
            db.run(
                "INSERT INTO ai_messages (user_id, role, content) VALUES (?, ?, ?)",
                [req.user.id, "assistant", reply]
            );
            saveDatabase();

            return res.json({ reply });

        } catch (error) {
            console.error("Chat error:", error);
            return res.status(500).json({ message: "Chat failed." });
        }
    });

    router.get("/history", (req, res) => {
        const stmt = db.prepare(
            "SELECT id, role, content, created_at FROM ai_messages WHERE user_id = ? ORDER BY id ASC"
        );
        stmt.bind([req.user.id]);

        const messages = [];
        while (stmt.step()) messages.push(stmt.getAsObject());
        stmt.free();

        res.json({ messages });
    });

    router.delete("/history", (req, res) => {
        db.run("DELETE FROM ai_messages WHERE user_id = ?", [req.user.id]);
        saveDatabase();
        res.json({ message: "Chat history cleared." });
    });

    return router;
};
