require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const http = require("http");
const app = require("./app");
const connectDatabase = require("./config/database");

const PORT = Number(process.env.PORT || 3000);

async function start() {
  await connectDatabase();
  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`🚀 SokoDigi API running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("❌ Failed to start SokoDigi API:", error);
  process.exit(1);
});
