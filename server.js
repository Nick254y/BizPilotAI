require("dotenv").config();
const express = require("express");
const cors = require("cors");
const initializeDatabase = require("./database");
const authRoutes = require("./routes/auth");
const projectRoutes = require("./routes/projects");
const aiRoutes = require("./routes/ai");
const agentRoutes = require("./routes/agent");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from .env");
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.get("/briefing", (req, res) => res.sendFile(require("path").join(__dirname, "public", "briefing.html")));

app.get("/api/health", (req, res) => {
  res.json({ status: "success", message: "BizPilot AI backend is running!" });
});

initializeDatabase().then(({ db, saveDatabase }) => {
  const deps = { db, saveDatabase, jwtSecret: JWT_SECRET };
  app.use("/api/auth", authRoutes(deps));
  app.use("/api/projects", projectRoutes(deps));
  app.use("/api/ai", aiRoutes(deps));
  app.use("/api/agent", agentRoutes(deps));
  app.listen(PORT, () => console.log(`Running on port ${PORT}`));
});
