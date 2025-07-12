const https = require("https");
const http = require("http");
const querystring = require("querystring");
const logger = require("../utils/Logger");

class ApiClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.headers = {
      "Content-Type": "application/json",
    };

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
    const data = { team_name: teamName };
    return await this.makeRequest("POST", "/register", data);
  }

  async getGameState() {
    return await this.makeRequest("GET", "/arena");
  }

  async sendMoves(moves) {
    // Moves должны быть массивом объектов с полями antId, q, r
    const moveCommands = moves.map(move => ({
      antId: move.unit_id || move.antId,
      q: move.move?.q || move.q,
      r: move.move?.r || move.r
    }));
    
    return await this.makeRequest("POST", "/move", moveCommands);
  }

  async getLogs() {
    return await this.makeRequest("GET", "/logs");
  }

  async getRounds() {
    return await this.makeRequest("GET", "/rounds");
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
