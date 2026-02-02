const mysql = require("mysql2");

// Railway provides a single connection URL
const connectionUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;

let pool;

try {
  if (connectionUrl) {
    // Used in Railway or any managed environment
    console.log("Using MySQL connection URL");

    pool = mysql.createPool(connectionUrl);

  } else {
    // Used for local development
    console.log("Using manual MySQL configuration", {
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      port: process.env.DB_PORT || 5003,
      database: process.env.DB_NAME || "logistics_db",
    });

    pool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "root",
      database: process.env.DB_NAME || "logistics_db",
      port: process.env.DB_PORT || 5003,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
    });
  }

  // Verify database connectivity at startup
  pool.getConnection((err, connection) => {
    if (err) {
      console.error("MySQL connection failed");

      switch (err.code) {
        case "ECONNREFUSED":
          console.error("Connection refused. Check host and port.");
          break;
        case "ER_ACCESS_DENIED_ERROR":
          console.error("Invalid MySQL username or password.");
          break;
        case "ER_BAD_DB_ERROR":
          console.error("Database does not exist.");
          break;
        default:
          console.error(err);
      }

      // Stop the server if database connection fails
      process.exit(1);
    }

    console.log("MySQL connection established");
    connection.release();
  });

} catch (error) {
  console.error("Failed to initialize MySQL pool", error);
  process.exit(1);
}

module.exports = pool.promise();
