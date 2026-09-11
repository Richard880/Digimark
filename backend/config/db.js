const mongoose = require("mongoose");

/**
 * Initializes a resilient connection thread to our remote MongoDB instance
 */
const connectDatabase = async () => {
  try {
    const connStr = process.env.MONGODB_URI;
    if (!connStr) {
      throw new Error("MONGODB_URI_MISSING_FROM_ENVIRONMENT_VARIABLES");
    }

    // Connect to the cluster pool
    const dbConnection = await mongoose.connect(connStr);

    console.log(`📡 ============================================`);
    console.log(`✅ MONGO CLUSTER CONNECTED: ${dbConnection.connection.host}`);
    console.log(`============================================`);
  } catch (err) {
    console.error(`❌ CRITICAL DATABASE CONNECTION UNABLE TO RESOLVE:`, err.message);
    // Exit server processing loop execution with failure code
    process.exit(1); 
  }
};

module.exports = connectDatabase;
