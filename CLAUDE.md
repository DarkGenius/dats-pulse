# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Bot
```bash
npm start           # Start the bot with INFO logging (includes visualizer)
npm run dev         # Start with DEBUG logging (includes visualizer)
npm run debug       # Start with DEBUG logging and debug mode (includes visualizer)
npm run test-api    # Test API connection
npm run visualizer  # Start only the visualizer server
```

### Web Visualizer
The bot automatically starts a web-based visualizer at `http://localhost:3001` when running. Features include:
- Interactive hexagonal game map with zoom/pan
- Real-time unit and resource visualization
- Statistics dashboard with threat analysis
- Movement paths and vision range display
- Keyboard shortcuts for quick navigation
- Round waiting overlay with real-time countdown timer
- Automatic round detection and registration

### Environment Setup
Copy `.env.example` to `.env` and configure:
- `API_URL` - Game API endpoint
- `API_TOKEN` - Authentication token
- `TEAM_NAME` - Team identifier
- `LOG_LEVEL` - Logging level (DEBUG, INFO, WARN, ERROR)
- `VISUALIZER_PORT` - Port for visualizer server (default: 3001)

## Architecture Overview

### Core Components

**GameBot** (`src/GameBot.js`) - Main orchestrator running the game loop
- Coordinates all subsystems
- Handles API communication through `ApiClient`
- Executes turn-based decision making
- Manages round lifecycle and automatic registration
- Integrates with web visualizer for real-time updates
- **IMPORTANT**: Uses mandatory centralized ResourceAssignmentManager for all resource assignments

**ApiClient** (`src/api/ApiClient.js`) - HTTP client for game API
- Handles registration, game state retrieval, and move submission
- Round information retrieval via `/api/rounds` endpoint
- Uses custom HTTP implementation with proper error handling

**Game Analysis & Strategy Engine:**
- **GameAnalyzer** - Analyzes game state and calculates metrics
- **StrategyManager** - Implements three-phase strategy with adaptive proportions
- **UnitManager** - Manages unit behavior and movement (units wait for centralized assignments)
- **ResourceManager** - Handles resource collection through centralized assignment system
- **ResourceAssignmentManager** - Mandatory centralized system preventing resource conflicts
- **CombatManager** - Implements combat formations and tactics
- **RoundManager** - Handles round lifecycle, waiting for available rounds, and automatic registration

**Visualization System:**
- **WebSocketServer** (`visualizer/src/WebSocketServer.js`) - Real-time communication server
- **GameRenderer** (`visualizer/public/gameRenderer.js`) - Hexagonal grid rendering and game visualization
- **StatsUpdater** (`visualizer/public/statsUpdater.js`) - Real-time statistics display
- **HexGrid** (`visualizer/public/hexgrid.js`) - Hexagonal coordinate system and grid mathematics

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

## Round Management

### Automatic Round Detection
The bot automatically detects and manages game rounds:
- **Round Status Monitoring** - Checks `/api/rounds` endpoint every 30 seconds
- **Automatic Registration** - Registers for available rounds automatically
- **Lobby Timeout Handling** - Gracefully handles "lobby ended" errors
- **Round Waiting** - Waits for next available round when current lobby is closed

### Round Lifecycle
1. **Check Available Rounds** - Query API for current and upcoming rounds
2. **Register for Active Round** - Attempt registration if round is active
3. **Wait for Next Round** - If no active round, wait for next scheduled round
4. **Automatic Start** - Begin gameplay once successfully registered

### Visualizer Integration
- **Waiting Overlay** - Full-screen overlay during round waiting
- **Real-time Countdown** - Updates every second until round start
- **Round Information** - Displays round name and start time
- **Status Updates** - Shows current round status and connection state

## Key Files

### Core Application
- `index.js` - Application entry point
- `src/GameBot.js` - Main game controller with round management
- `src/api/ApiClient.js` - Game API communication including rounds endpoint
- `src/constants/GameConstants.js` - Game constants and unit stats
- `src/game/RoundManager.js` - Round lifecycle management and waiting logic
- `src/utils/Logger.js` - Logging utility

### Game Logic Modules
- `src/game/GameAnalyzer.js` - Game state analysis and metrics
- `src/game/StrategyManager.js` - Three-phase strategy implementation
- `src/game/UnitManager.js` - Unit behavior and movement (waits for centralized assignments)
- `src/game/ResourceManager.js` - Resource collection through centralized system
- `src/game/ResourceAssignmentManager.js` - Mandatory centralized resource reservation system
- `src/game/CombatManager.js` - Combat formations and tactics

### Visualization System
- `visualizer/src/WebSocketServer.js` - WebSocket server for real-time updates
- `visualizer/public/index.html` - Web interface with round waiting overlay
- `visualizer/public/gameRenderer.js` - Hexagonal grid and game object rendering
- `visualizer/public/statsUpdater.js` - Real-time statistics display
- `visualizer/public/hexgrid.js` - Hexagonal coordinate system
- `visualizer/public/visualizer.js` - Main visualizer controller with countdown timer

### Documentation
- `CONSTANTS.md` - Documentation of game constants
- `strategy.md` - Strategy documentation
- `visualizer/README.md` - Visualizer usage and development guide

## Memories

- Received initial guidance for the AI strategy and implementation details
- Initialized core architecture components for game bot system
- Developed robust unit management and resource optimization strategies