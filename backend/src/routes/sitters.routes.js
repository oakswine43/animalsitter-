const express = require("express");
const { pool } = require("../db");
const { authRequired } = require("../middleware/auth");
const { roleGate } = require("../middleware/roleGate");

const router = express.Router();

router.put("/sitter/profile", authRequired, roleGate("sitter"), async (req, res) => {
  const { experienceYears, bio, profilePhotoUrl } = req.body || {};
  await pool.query(
    `UPDATE sitter_profiles
     SET experience_years = COALESCE(?, experience_years),
         bio = COALESCE(?, bio),
         profile_photo_url = COALESCE(?, profile_photo_url)
     WHERE user_id = ?`,
    [Number.isFinite(experienceYears) ? experienceYears : null, bio || null, profilePhotoUrl || null, req.user.id]
  );
  res.json({ ok: true });
});

router.post("/sitter/active", authRequired, roleGate("sitter"), async (req, res) => {
  const { isActive, lat, lng } = req.body || {};

  const [prof] = await pool.query(
    "SELECT status FROM sitter_profiles WHERE user_id = ?",
    [req.user.id]
  );
  if (!prof.length) return res.status(400).json({ error: "Sitter profile missing" });
  if (prof[0].status !== "approved") return res.status(403).json({ error: "Sitter not approved yet" });

  await pool.query(
    "UPDATE sitter_profiles SET is_active = ?, last_lat = ?, last_lng = ?, last_active_at = NOW() WHERE user_id = ?",
    [isActive ? 1 : 0, lat ?? null, lng ?? null, req.user.id]
  );

  res.json({ ok: true });
});

router.get("/sitters/active", async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, sp.experience_years, sp.bio, sp.profile_photo_url,
            sp.last_lat, sp.last_lng, sp.last_active_at
     FROM sitter_profiles sp
     JOIN users u ON u.id = sp.user_id
     WHERE sp.status = 'approved' AND sp.is_active = 1
     ORDER BY sp.last_active_at DESC
     LIMIT 50`
  );
  res.json({ ok: true, sitters: rows });
});

router.get("/admin/sitters/pending", authRequired, roleGate("admin", "employee"), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, sp.status, sp.experience_years, sp.bio, sp.profile_photo_url
     FROM sitter_profiles sp
     JOIN users u ON u.id = sp.user_id
     WHERE sp.status = 'pending'
     ORDER BY u.created_at ASC`
  );
  res.json({ ok: true, pending: rows });
});

router.post("/admin/sitters/:id/approve", authRequired, roleGate("admin", "employee"), async (req, res) => {
  const sitterId = Number(req.params.id);
  await pool.query("UPDATE sitter_profiles SET status = 'approved' WHERE user_id = ?", [sitterId]);
  res.json({ ok: true });
});

router.post("/admin/sitters/:id/deny", authRequired, roleGate("admin", "employee"), async (req, res) => {
  const sitterId = Number(req.params.id);
  await pool.query("UPDATE sitter_profiles SET status = 'denied', is_active = 0 WHERE user_id = ?", [sitterId]);
  res.json({ ok: true });
});

module.exports = router;
