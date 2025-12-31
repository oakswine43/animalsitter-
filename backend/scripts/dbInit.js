require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db");

(async () => {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  console.log("✅ Database schema applied.");
  process.exit(0);
})().catch((e) => {
  console.error("❌ db:init failed:", e);
  process.exit(1);
});
