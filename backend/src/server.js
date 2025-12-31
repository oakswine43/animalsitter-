require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const sittersRoutes = require("./routes/sitters.routes");

const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("combined"));

const allowed = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl/server-to-server
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true
  })
);

app.use(rateLimit({ windowMs: 60 * 1000, limit: 120 }));

app.get("/", (req, res) => res.json({ ok: true, name: "animalsitter api" }));

app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use("/api", usersRoutes);
app.use("/api", sittersRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`✅ API listening on :${port}`));
