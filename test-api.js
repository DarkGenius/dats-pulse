require("dotenv").config();
const ApiClient = require("./src/api/ApiClient");
const logger = require("./src/utils/Logger");
const { FOOD_TYPE_NAMES, UNIT_TYPE_NAMES } = require("./src/constants/GameConstants");

logger.setLevel("DEBUG");

function getFoodTypeName(type) {
  return FOOD_TYPE_NAMES[type] || `unknown_food_${type}`;
}

function getUnitTypeName(type) {
  return UNIT_TYPE_NAMES[type] || `unknown_unit_${type}`;
}

async function testApi() {
  const token = process.env.API_TOKEN;
  if (!token) {
    logger.error("API_TOKEN is required");
    return;
  }

  logger.info("Testing API with token:", token.substring(0, 8) + "...");

  const apiClient = new ApiClient(process.env.API_URL, token);

  try {
    logger.info("Testing registration...");
    const registration = await apiClient.register(
      process.env.TEAM_NAME || "Drive Core"
    );
    logger.info("Registration:", registration);
    
    logger.info("Testing game state request...");
    const gameState = await apiClient.getGameState();
    logger.info("Game state structure:");
    logger.info("- turnNo:", gameState.turnNo);
    logger.info("- score:", gameState.score);
    logger.info("- ants count:", gameState.ants?.length || 0);
    logger.info("- enemies count:", gameState.enemies?.length || 0);
    logger.info("- food count:", gameState.food?.length || 0);
    logger.info("- home:", gameState.home);
    logger.info("- nextTurnIn:", gameState.nextTurnIn);
    
    if (gameState.ants && gameState.ants.length > 0) {
      const firstAnt = gameState.ants[0];
      logger.info("First ant:", firstAnt);
      logger.info("Ant type meaning:", getUnitTypeName(firstAnt.type));
    }
    
    if (gameState.food && gameState.food.length > 0) {
      const firstFood = gameState.food[0];
      logger.info("First food:", firstFood);
      logger.info("Food type meaning:", getFoodTypeName(firstFood.type));
    }
    
  } catch (error) {
    logger.error("API test failed:", error.message);
  }
}
testApi();
