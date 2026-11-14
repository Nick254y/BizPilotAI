const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

module.exports = function ({ db, saveDatabase, jwtSecret }) {
    const router = express.Router();

    function queryUser(sql, value) {
        const stmt = db.prepare(sql);
        stmt.bind([value]);
        const user = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
        return user;
    }

    function findUser(email) {
        return queryUser("SELECT * FROM users WHERE email = ?", email);
    }

    function findUserById(id) {
        return queryUser("SELECT * FROM users WHERE id = ?", id);
    }

    function validPassword(password) {
        return typeof password === "string" &&
            password.length >= 8 && password.length <= 72;
    }

    function requireAuth(req, res, next) {
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
    }

    router.post("/register", async (req, res) => {
        try {
            const { name, email, password } = req.body;

            if (
                typeof name !== "string" ||
                typeof email !== "string" ||
                typeof password !== "string"
            ) {
                return res.status(400).json({
                    message: "Please provide valid registration details."
                });
            }

            const cleanName = name.trim();
            const cleanEmail = email.trim().toLowerCase();

            if (!cleanName || !cleanEmail || !password) {
                return res.status(400).json({ message: "All fields are required." });
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
                return res.status(400).json({ message: "Enter a valid email address." });
            }

            if (!validPassword(password)) {
                return res.status(400).json({
                    message: "Password must be 8 to 72 characters."
                });
            }

            if (findUser(cleanEmail)) {
                return res.status(409).json({
                    message: "This email is already registered."
                });
            }

            const passwordHash = await bcrypt.hash(password, 12);

            db.run(
                "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                [cleanName, cleanEmail, passwordHash]
            );

            const result = db.exec("SELECT last_insert_rowid() AS id");
            const userId = result[0].values[0][0];

            saveDatabase();

            const token = jwt.sign(
                { id: userId, email: cleanEmail },
                jwtSecret,
                { expiresIn: "1d" }
            );

            return res.status(201).json({
                message: "Account created successfully.",
                token,
                user: { id: userId, name: cleanName, email: cleanEmail }
            });

        } catch (error) {
            console.error("Registration error:", error);
            return res.status(500).json({ message: "Registration failed." });
        }
    });

    router.post("/login", async (req, res) => {
        try {
            const { email, password } = req.body;

            if (typeof email !== "string" || typeof password !== "string") {
                return res.status(400).json({
                    message: "Email and password are required."
                });
            }

            const user = findUser(email.trim().toLowerCase());

            if (!user || !(await bcrypt.compare(password, user.password_hash))) {
                return res.status(401).json({
                    message: "Invalid email or password."
                });
            }

            const token = jwt.sign(
                { id: user.id, email: user.email },
                jwtSecret,
                { expiresIn: "1d" }
            );

            return res.json({
                message: "Login successful.",
                token,
                user: { id: user.id, name: user.name, email: user.email }
            });

        } catch (error) {
            console.error("Login error:", error);
            return res.status(500).json({ message: "Login failed." });
        }
    });

    router.post("/change-password", requireAuth, async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;

            if (typeof currentPassword !== "string" || !validPassword(newPassword)) {
                return res.status(400).json({
                    message: "New password must be 8 to 72 characters."
                });
            }

            const user = findUserById(req.user.id);

            if (!user) {
                return res.status(404).json({ message: "Account not found." });
            }

            if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
                return res.status(403).json({
                    message: "Current password is incorrect."
                });
            }

            const hash = await bcrypt.hash(newPassword, 12);
            db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, user.id]);
            saveDatabase();

            return res.json({ message: "Password changed." });

        } catch (error) {
            console.error("Change password error:", error);
            return res.status(500).json({ message: "Could not change password." });
        }
    });

    router.delete("/account", requireAuth, async (req, res) => {
        try {
            const password = req.body && req.body.password;

            if (typeof password !== "string" || !password) {
                return res.status(400).json({
                    message: "Password is required to delete your account."
                });
            }

            const user = findUserById(req.user.id);

            if (!user) {
                return res.status(404).json({ message: "Account not found." });
            }

            if (!(await bcrypt.compare(password, user.password_hash))) {
                return res.status(403).json({ message: "Password is incorrect." });
            }

            db.run("DELETE FROM ai_messages WHERE user_id = ?", [user.id]);
            db.run("DELETE FROM projects WHERE user_id = ?", [user.id]);

            try {
                db.run("DELETE FROM agent_reports WHERE user_id = ?", [user.id]);
            } catch (e) {}

            db.run("DELETE FROM users WHERE id = ?", [user.id]);
            saveDatabase();

            return res.json({ message: "Account deleted." });

        } catch (error) {
            console.error("Delete account error:", error);
            return res.status(500).json({ message: "Could not delete account." });
        }
    });

    // Owner-only password reset (needs ADMIN_KEY in the environment)
    router.post("/admin-reset", async (req, res) => {
        try {
            const adminKey = process.env.ADMIN_KEY;

            if (!adminKey || adminKey.length < 16) {
                return res.status(404).json({ message: "Not found." });
            }

            const supplied = String(req.headers["x-admin-key"] || "");
            const a = crypto.createHash("sha256").update(supplied).digest();
            const b = crypto.createHash("sha256").update(adminKey).digest();

            if (!crypto.timingSafeEqual(a, b)) {
                return res.status(403).json({ message: "Forbidden." });
            }

            const { email, newPassword } = req.body;

            if (typeof email !== "string" || !validPassword(newPassword)) {
                return res.status(400).json({
                    message: "Email and a password of 8 to 72 characters are required."
                });
            }

            const user = findUser(email.trim().toLowerCase());

            if (!user) {
                return res.status(404).json({ message: "User not found." });
            }

            const hash = await bcrypt.hash(newPassword, 12);
            db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, user.id]);
            saveDatabase();

            return res.json({ message: "Password reset." });

        } catch (error) {
            console.error("Admin reset error:", error);
            return res.status(500).json({ message: "Reset failed." });
        }
    });

    return router;
};
