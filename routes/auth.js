const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

module.exports = function ({ db, saveDatabase, jwtSecret }) {
    const router = express.Router();

    function findUser(email) {
        const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
        stmt.bind([email]);
        const user = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
        return user;
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
                return res.status(400).json({
                    message: "All fields are required."
                });
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
                return res.status(400).json({
                    message: "Enter a valid email address."
                });
            }

            if (password.length < 8) {
                return res.status(400).json({
                    message: "Password must contain at least 8 characters."
                });
            }

            if (findUser(cleanEmail)) {
                return res.status(409).json({
                    message: "This email is already registered."
                });
            }

            const passwordHash = await bcrypt.hash(password, 12);

            db.run(
                `INSERT INTO users (name, email, password_hash)
                 VALUES (?, ?, ?)`,
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

            const cleanEmail = email.trim().toLowerCase();
            const user = findUser(cleanEmail);

            if (!user) {
                return res.status(401).json({
                    message: "Invalid email or password."
                });
            }

            const passwordMatch = await bcrypt.compare(
                password,
                user.password_hash
            );

            if (!passwordMatch) {
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

    return router;
};
