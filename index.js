require("dotenv").config();

const GameBot = require("./src/GameBot");
const logger = require("./src/utils/Logger");

async function main() {
  try {
    const token = process.env.API_TOKEN;
    if (!token) {
      logger.error("API_TOKEN is required. Please set it in your .env file");
      process.exit(1);
    }

    logger.info("Starting bot with token:", token.substring(0, 8) + "...");

    const bot = new GameBot({
      apiUrl: process.env.API_URL,
      token: token,
      teamName: process.env.TEAM_NAME || "Drive Core",
    });

    await bot.run();
  } catch (error) {
    logger.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
