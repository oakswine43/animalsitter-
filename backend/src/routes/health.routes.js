const express = require("express");
const { pool } = require("../db");

const router = express.Router();

router.get("/health", async (req, res) => {
  const [rows] = await pool.query("SELECT 1 AS ok");
  res.json({ ok: true, db: rows?.[0]?.ok === 1 });
});

module.exports = router;
