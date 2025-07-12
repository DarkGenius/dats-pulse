const https = require("https");
const http = require("http");
const querystring = require("querystring");
const logger = require("../utils/Logger");
const RateLimiter = require("../utils/RateLimiter");

class ApiClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.headers = {
      "Content-Type": "application/json",
    };
    
    // Инициализация rate limiter для 3 запросов в секунду
    this.rateLimiter = new RateLimiter(3, 'GameAPI');

    if (token) {
      this.headers["X-Auth-Token"] = token;
    } else {
      logger.warn("No API token provided. Some requests may fail.");
    }
    logger.debug(`API Client initialized with base URL: ${this.baseUrl}`);
    logger.debug(`Using token: ${token ? "****" : "None"}`);
    if (!baseUrl) {
      throw new Error("Base URL is required for ApiClient");
    }
  }

  async register(teamName) {
    // Регистрация происходит только через токен авторизации без тела запроса
    logger.debug(`API: Registering team via /register endpoint (token-based)`);
    return await this.rateLimiter.execute(() => 
      this.makeRequest("POST", "/register")
    );
  }

  async getGameState() {
    logger.debug("API: Requesting game state from /arena");
    const gameState = await this.rateLimiter.execute(() => 
      this.makeRequest("GET", "/arena")
    );
    if (gameState) {
      // Analyze ant types
      let antDetails = {};
      if (gameState.ants) {
        const antTypes = gameState.ants.reduce((acc, ant) => {
          acc[ant.type] = (acc[ant.type] || 0) + 1;
          return acc;
        }, {});
        antDetails = {
          total: gameState.ants.length,
          byType: antTypes,
          actualUnits: gameState.ants.filter(a => a.type !== 0).length
        };
      }
      
      logger.debug(`API: Received game state - Turn: ${gameState.turnNo || 'unknown'}, Ants: ${JSON.stringify(antDetails)}, MyUnits: ${gameState.myUnits?.length || 0}, Resources: ${gameState.food?.length || 0}`);
      
      // Log more details for debugging
      if (!gameState.ants && !gameState.myUnits) {
        logger.debug('API: No units found in response. Full response structure:', {
          hasHome: !!gameState.home,
          homeCount: gameState.home?.length || 0,
          hasFood: !!gameState.food,
          foodCount: gameState.food?.length || 0,
          hasScores: !!gameState.scores,
          scoresCount: gameState.scores?.length || 0,
          turnNo: gameState.turnNo,
          responseKeys: Object.keys(gameState)
        });
      }
    } else {
      logger.warn("API: Received empty game state");
    }
    return gameState;
  }

  async sendMoves(moves) {
    // Формат по API спецификации: 
    // {
    //   "moves": [
    //     {
    //       "ant": "uuid",
    //       "path": [{"q": 10, "r": 20}]
    //     }
    //   ]
    // }
    const moveCommands = moves.map(move => {
      // Handle different move formats
      const unitId = move.unit_id || move.ant_id || move.antId;
      let movePath;
      
      if (move.path && Array.isArray(move.path)) {
        // New format: { unit_id, path: [{q, r}, ...] }
        movePath = move.path;
      } else if (move.move) {
        // Old format: { unit_id, move: {q, r} }
        movePath = [move.move];
      } else if (move.q !== undefined && move.r !== undefined) {
        // Direct format: { q, r }
        movePath = [{ q: move.q, r: move.r }];
      } else {
        logger.warn('Move has no valid path or position:', move);
        return null;
      }
      
      return {
        ant: unitId,
        path: movePath
      };
    }).filter(Boolean); // Remove null entries
    
    const payload = {
      moves: moveCommands
    };
    
    logger.debug(`API: Sending ${moveCommands.length} moves to /move`);
    logger.debug("API: Move payload:", JSON.stringify(payload, null, 2));
    
    const response = await this.rateLimiter.execute(() => 
      this.makeRequest("POST", "/move", payload)
    );
    logger.debug("API: Move response:", response);
    return response;
  }

  async getLogs() {
    return await this.rateLimiter.execute(() => 
      this.makeRequest("GET", "/logs")
    );
  }

  async getRounds() {
    return await this.rateLimiter.execute(() => 
      this.makeRequest("GET", "/rounds")
    );
  }

  async makeRequest(method, endpoint, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + endpoint);
      const isHttps = url.protocol === "https:";
      const httpModule = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: method,
        headers: { ...this.headers },
      };

      let postData = "";
      if (data) {
        if (method === "GET") {
          const query = querystring.stringify(data);
          options.path += (options.path.includes("?") ? "&" : "?") + query;
        } else {
          postData = JSON.stringify(data);
          options.headers["Content-Length"] = Buffer.byteLength(postData);
        }
      }

      logger.debug(`Making ${method} request to ${options.path}`);
      logger.debug(`Headers:`, options.headers);
      if (postData) {
        logger.debug(`Body:`, postData);
      }

      const req = httpModule.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          logger.debug(`Response ${res.statusCode}:`, body);
          try {
            const response = body ? JSON.parse(body) : {};
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(response);
            } else {
              reject(new Error(`API Error: ${res.statusCode} - ${body}`));
            }
          } catch (error) {
            reject(new Error(`JSON Parse Error: ${error.message}`));
          }
        });
      });

      req.on("error", (error) => {
        reject(new Error(`Request Error: ${error.message}`));
      });

      if (postData) {
        req.write(postData);
      }

      req.end();
    });
  }
}

module.exports = ApiClient;
