const mysql = require("mysql2/promise");

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(\`Missing required env var: \${name}\`);
  return v;
}

const pool = mysql.createPool({
  host: required("MYSQLHOST"),
  port: Number(required("MYSQLPORT")),
  user: required("MYSQLUSER"),
  password: required("MYSQLPASSWORD"),
  database: required("MYSQLDATABASE"),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = { pool };
