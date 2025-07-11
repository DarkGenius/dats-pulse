# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Bot
```bash
npm start           # Start the bot with INFO logging
npm run dev         # Start with DEBUG logging
npm run debug       # Start with DEBUG logging and debug mode
npm run test-api    # Test API connection
```

### Environment Setup
Copy `.env.example` to `.env` and configure:
- `API_URL` - Game API endpoint
- `API_TOKEN` - Authentication token
- `TEAM_NAME` - Team identifier
- `LOG_LEVEL` - Logging level (DEBUG, INFO, WARN, ERROR)

## Architecture Overview

### Core Components

**GameBot** (`src/GameBot.js`) - Main orchestrator running the game loop
- Coordinates all subsystems
- Handles API communication through `ApiClient`
- Executes turn-based decision making

**ApiClient** (`src/api/ApiClient.js`) - HTTP client for game API
- Handles registration, game state retrieval, and move submission
- Uses custom HTTP implementation with proper error handling

**Game Analysis & Strategy Engine:**
- **GameAnalyzer** - Analyzes game state and calculates metrics
- **StrategyManager** - Implements three-phase strategy with adaptive proportions
- **UnitManager** - Manages unit behavior and movement
- **ResourceManager** - Handles resource collection and logistics
- **CombatManager** - Implements combat formations and tactics

### Strategic Framework

**Three-Phase Strategy:**
1. **Early Game (turns 1-20)**: Economic expansion (60% workers, 30% scouts, 10% soldiers)
2. **Mid Game (turns 21-50)**: Balanced expansion (50% workers, 25% scouts, 25% soldiers)
3. **Late Game (turns 51+)**: Adaptive optimization based on game state

**Decision Logic:**
- Nectar detected within 7 hexes → produce scout
- Low threat level → produce worker
- High threat level → produce soldier

### Unit System

**Unit Types** (numeric constants in `src/constants/GameConstants.js`):
- Worker (1): High cargo capacity (8), optimal for bread/apple collection
- Soldier (2): High attack (70), defensive specialist
- Scout (3): High speed (7) and vision (4), optimal for nectar collection

**Resource Types** (numeric constants):
- Apple (1): 10 calories
- Bread (2): 25 calories  
- Nectar (3): 60 calories

### Combat System

**Formations:**
- **Trileaf Formation**: Offensive formation with fighters supported by scouts
- **Concentric Defense**: Defensive rings around anthill

**Threat Assessment:**
- Calculates threat levels based on unit type, distance to anthill, and ally support
- Adapts unit production based on threat level

### Hexagonal Grid System

Uses axial coordinates (q, r) with cubic coordinate distance calculation:
```javascript
distance = Math.max(Math.abs(q1-q2), Math.abs(r1-r2), Math.abs(s1-s2))
```

### Resource Optimization

**Collection Priorities:**
1. Nectar within 6 hexes (60 calories)
2. Bread within 4 hexes (25 calories)
3. Apples at any distance (10 calories)

**Unit Specialization:**
- Scouts: Most efficient for nectar collection
- Workers: Most efficient for bread/apple collection
- Unit assignment based on distance and collection efficiency

### Logging System

Custom logger (`src/utils/Logger.js`) with levels:
- DEBUG: Detailed game state analysis
- INFO: Strategic decisions and actions
- WARN: API issues and game state problems
- ERROR: Critical failures

Set `LOG_LEVEL=DEBUG` in environment for detailed debugging.

## Key Files

- `index.js` - Application entry point
- `src/GameBot.js` - Main game controller
- `src/api/ApiClient.js` - Game API communication
- `src/constants/GameConstants.js` - Game constants and unit stats
- `src/game/` - Game logic modules (strategy, analysis, management)
- `src/utils/Logger.js` - Logging utility
- `CONSTANTS.md` - Documentation of game constants
- `strategy.md` - Strategy documentation