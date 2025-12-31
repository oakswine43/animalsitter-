const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/me", authRequired, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, email, first_name, last_name, phone, role, created_at FROM users WHERE id = ?",
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: "User not found" });
  res.json({ ok: true, me: rows[0] });
});

// role is locked - cannot be changed here
router.put("/me", authRequired, async (req, res) => {
  const { firstName, lastName, phone } = req.body || {};
  await pool.query(
    "UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), phone = COALESCE(?, phone) WHERE id = ?",
    [firstName || null, lastName || null, phone || null, req.user.id]
  );
  res.json({ ok: true });
});

module.exports = router;
