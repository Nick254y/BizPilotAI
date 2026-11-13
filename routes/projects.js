const express = require("express");
const jwt = require("jsonwebtoken");

module.exports = function ({ db, saveDatabase, jwtSecret }) {
    const router = express.Router();

    router.use((req, res, next) => {
        const header = req.headers.authorization;

        if (!header || !header.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Authentication required."
            });
        }

        try {
            const token = header.split(" ")[1];
            req.user = jwt.verify(token, jwtSecret);
            next();
        } catch {
            return res.status(401).json({
                message: "Invalid or expired token."
            });
        }
    });

    router.get("/", (req, res) => {
        const stmt = db.prepare("SELECT * FROM projects WHERE user_id = ?");
        stmt.bind([req.user.id]);

        const projects = [];
        while (stmt.step()) {
            projects.push(stmt.getAsObject());
        }
        stmt.free();

        res.json({ projects });
    });

    router.post("/", (req, res) => {
        const { title, description } = req.body;

        if (typeof title !== "string" || !title.trim()) {
            return res.status(400).json({
                message: "Project title is required."
            });
        }

        db.run(
            `INSERT INTO projects (user_id, title, description)
             VALUES (?, ?, ?)`,
            [
                req.user.id,
                title.trim(),
                typeof description === "string" ? description.trim() : ""
            ]
        );

        const result = db.exec("SELECT last_insert_rowid() AS id");
        const id = result[0].values[0][0];

        saveDatabase();

        res.status(201).json({
            message: "Project created successfully.",
            id
        });
    });

    router.put("/:id", (req, res) => {
        const { title, description, status } = req.body;
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({ message: "Invalid project ID." });
        }

        if (
            (title !== undefined &&
                (typeof title !== "string" || !title.trim())) ||
            (description !== undefined && typeof description !== "string") ||
            (status !== undefined &&
                !["active", "completed", "paused"].includes(status))
        ) {
            return res.status(400).json({
                message: "Invalid project details."
            });
        }

        const existing = db.prepare(
            "SELECT id FROM projects WHERE id = ? AND user_id = ?"
        );
        existing.bind([id, req.user.id]);
        const found = existing.step();
        existing.free();

        if (!found) {
            return res.status(404).json({ message: "Project not found." });
        }

        const updates = [];
        const values = [];

        if (title !== undefined) {
            updates.push("title = ?");
            values.push(title.trim());
        }
        if (description !== undefined) {
            updates.push("description = ?");
            values.push(description.trim());
        }
        if (status !== undefined) {
            updates.push("status = ?");
            values.push(status);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: "No changes provided." });
        }

        values.push(id, req.user.id);

        db.run(
            `UPDATE projects SET ${updates.join(", ")}
             WHERE id = ? AND user_id = ?`,
            values
        );

        saveDatabase();

        res.json({ message: "Project updated successfully." });
    });

    router.delete("/:id", (req, res) => {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({ message: "Invalid project ID." });
        }

        db.run(
            "DELETE FROM projects WHERE id = ? AND user_id = ?",
            [id, req.user.id]
        );

        if (db.getRowsModified() === 0) {
            return res.status(404).json({ message: "Project not found." });
        }

        saveDatabase();

        res.json({ message: "Project deleted successfully." });
    });

    return router;
};
