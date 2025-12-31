require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("../src/db");

async function upsertUser({ email, password, firstName, lastName, phone, role }) {
  const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
  const passwordHash = await bcrypt.hash(password, 12);

  if (!existing.length) {
    const [r] = await pool.query(
      "INSERT INTO users (email, password_hash, first_name, last_name, phone, role) VALUES (?, ?, ?, ?, ?, ?)",
      [email, passwordHash, firstName, lastName, phone || null, role]
    );

    if (role === "sitter") {
      await pool.query(
        "INSERT INTO sitter_profiles (user_id, status, experience_years, bio, profile_photo_url) VALUES (?, 'approved', 3, 'Experienced sitter', '')",
        [r.insertId]
      );
    }
    return r.insertId;
  }

  await pool.query(
    "UPDATE users SET password_hash = ?, first_name=?, last_name=?, phone=?, role=? WHERE email=?",
    [passwordHash, firstName, lastName, phone || null, role, email]
  );
  return existing[0].id;
}

(async () => {
  await upsertUser({
    email: "admin@animalsitter.co",
    password: "Admin123!",
    firstName: "Admin",
    lastName: "User",
    phone: "",
    role: "admin"
  });

  await upsertUser({
    email: "employee@animalsitter.co",
    password: "Employee123!",
    firstName: "Employee",
    lastName: "User",
    phone: "",
    role: "employee"
  });

  await upsertUser({
    email: "client@animalsitter.co",
    password: "Client123!",
    firstName: "Client",
    lastName: "User",
    phone: "",
    role: "client"
  });

  await upsertUser({
    email: "sitter@animalsitter.co",
    password: "Sitter123!",
    firstName: "Sitter",
    lastName: "User",
    phone: "",
    role: "sitter"
  });

  console.log("✅ Seed complete.");
  process.exit(0);
})().catch((e) => {
  console.error("❌ seed failed:", e);
  process.exit(1);
});
