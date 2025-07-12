# Game Logic and Decision-Making Algorithms

This document contains Mermaid diagrams visualizing the core game logic and decision-making algorithms of the AI strategy bot.

## Main Game Loop Flow

```mermaid
flowchart TD
    A[Start Bot] --> B[Initialize Components]
    B --> C[Round Manager Check]
    C --> D{Round Active?}
    D -->|No| E[Wait for Next Round]
    E --> F[Show Countdown Timer]
    F --> G[Auto Register When Available]
    G --> D
    D -->|Yes| H[Game Loop Start]
    
    H --> I[Get Game State via API]
    I --> J[Game Analyzer Process]
    J --> K[Strategy Manager Process]
    K --> L[Decision Making Phase]
    L --> M[Execute Actions]
    M --> N[Send to Visualizer]
    N --> O[Wait for Next Turn]
    O --> P{Round Still Active?}
    P -->|Yes| I
    P -->|No| C
```

## Game Analysis System

```mermaid
flowchart TD
    A[Game State Input] --> B[GameAnalyzer Main Process]
    
    B --> C[Determine Game Phase]
    C --> C1[Early: turns 1-20]
    C --> C2[Mid: turns 21-50] 
    C --> C3[Late: turns 51+]
    
    B --> D[Analyze Units]
    D --> D1[Count My Units by Type]
    D --> D2[Calculate Unit Proportions]
    D --> D3[Identify Enemy Units]
    D --> D4[Locate Anthill Position]
    
    B --> E[Analyze Resources]
    E --> E1[Categorize by Type: Nectar/Bread/Apple]
    E --> E2[Calculate Distances]
    E --> E3[Prioritize by Value/Distance]
    E --> E4[Identify High-Value Resources]
    
    B --> F[Analyze Threats]
    F --> F1[Identify Immediate Threats: Distance ≤ 3 from Anthill]
    F --> F2[Calculate Nearby Threats: Distance ≤ 8 from Anthill]
    F --> F3[Assess Overall Threat Level]
    F --> F4[Calculate Unit Combat Strength]
    
    B --> G[Analyze Territory]
    G --> G1[Calculate Controlled Area]
    G --> G2[Identify Expansion Opportunities]
    G --> G3[Assess Strategic Positions]
    
    B --> H[Analyze Economy]
    H --> H1[Calculate Calories per Turn]
    H --> H2[Track Total Calories]
    H --> H3[Compare with Phase Targets]
    H --> H4[Assess Economic Efficiency]
    
    C1 --> I[Combined Analysis Result]
    C2 --> I
    C3 --> I
    D4 --> I
    E4 --> I
    F4 --> I
    G3 --> I
    H4 --> I
```

## Strategy Decision Tree

```mermaid
flowchart TD
    A[Strategy Manager Input] --> B[Determine Phase Strategy]
    
    B --> C{Game Phase?}
    C -->|Early| D[Economic Expansion Priority: 60% Workers, 30% Scouts, 10% Soldiers]
    C -->|Mid| E[Balanced Expansion: 50% Workers, 25% Scouts, 25% Soldiers]
    C -->|Late| F[Optimization Focus: 30% Workers, 35% Scouts, 35% Soldiers]
    
    D --> G[Strategy Adaptation]
    E --> G
    F --> G
    
    G --> H{Threat Level > 0.7?}
    H -->|Yes| I[Increase Soldiers +15%, Decrease Workers -10%]
    H -->|No| J[Check Resource Conditions]
    
    I --> K[Adapted Strategy]
    J --> L{High-Value Resources > 3?}
    L -->|Yes| M[Increase Scouts +10%, Balanced Reduction]
    L -->|No| N[Check Economy]
    
    M --> K
    N --> O{Economy < 80% Target?}
    O -->|Yes| P[Increase Workers +10%, Reduce Others]
    O -->|No| K
    P --> K
    
    K --> Q[Unit Production Decision]
    Q --> R{Override Conditions?}
    R -->|Nectar within 7 hexes| S[Produce Scout]
    R -->|Immediate Threats| T[Produce Soldier]
    R -->|Low Threat < 0.3| U[Produce Worker]
    R -->|None| V[Follow Proportion Strategy]
    
    S --> W[Final Unit Type]
    T --> W
    U --> W
    V --> W
```

## Intelligent Unit Management Decision Flow

```mermaid
flowchart TD
    A[Unit Manager Input] --> B[Get Available Units]
    B --> C[For Each Unit]
    
    C --> D{Central Assignment?}
    D -->|Yes| E[Execute Resource Assignment]
    D -->|No| F{Can Collect Resources?}
    
    F -->|Yes| G[Wait for Central Assignment]
    F -->|No| H[LEVEL 1: Critical Priorities]
    
    E --> I[Calculate Movement]
    G --> I
    H --> J{Should Return to Anthill?}
    I --> MM[Return Movement Command]
    J -->|Cargo ≥80% OR has nectar| K[CRITICAL: Return to Anthill]
    J -->|No| L{End Game Restriction?}
    
    L -->|Turn ≥380| M[Calculate Safe Distance]
    M --> N{Safe Movement Only?}
    N -->|Yes| O[Get Nearby Resource Tasks]
    N -->|No| P[LEVEL 2: Absolute Priorities]
    
    L -->|Turn <380| P
    O --> Q{Found Safe Tasks?}
    Q -->|Yes| R[Execute Safe Tasks]
    Q -->|No| K
    
    P --> S{Nectar Available?}
    S -->|Yes + Compatible| T[ABSOLUTE: Nectar Collection]
    S -->|No| U[LEVEL 3: Cargo Management]
    
    U --> V{Cargo ≥50%?}
    V -->|Yes| W[Should Avoid Distractions]
    V -->|No| X[LEVEL 4: Aggressive Actions]
    
    W --> Y[Get Safe Resource Tasks]
    Y --> Z{Safe Tasks Found?}
    Z -->|Yes| AA[Execute Safe Tasks]
    Z -->|No| K
    
    X --> BB{Enemy Anthills Known?}
    BB -->|Yes| CC[Analyze Raid Feasibility]
    BB -->|No| DD{Immediate Threats?}
    
    CC --> EE{Raid Feasible?}
    EE -->|Yes| FF[PRIORITY: Raid Enemy Anthill]
    EE -->|No| DD
    
    DD -->|Yes| GG[PRIORITY: Immediate Defense]
    DD -->|No| HH[LEVEL 5: Unit Specialization]
    
    HH --> II{Unit Type?}
    II -->|Scout| JJ[1. Find Enemy Anthill<br/>2. Aggressive Exploration]
    II -->|Soldier| KK[1. Hunt Enemies<br/>2. Combat<br/>3. Territory Defense]
    II -->|Worker| LL[1. Assist Raid<br/>2. Construction]
    
    K --> I
    R --> I
    T --> I
    AA --> I
    FF --> I
    GG --> I
    JJ --> I
    KK --> I
    LL --> I
```

## Centralized Resource Assignment System (MANDATORY)

```mermaid
flowchart TD
    A[ResourceAssignmentManager<br/>ЕДИНСТВЕННАЯ система управления] --> B[Unit Requests Resource]
    B --> C{Resource Already Reserved?}
    
    C -->|No| D[Create New Reservation]
    C -->|Yes| E{Priority Check}
    
    E --> F{New Priority > Existing?}
    F -->|Yes| G[Release Old Assignment]
    F -->|No| H[Reject: Lower Priority]
    
    G --> I[Notify Old Unit]
    I --> D
    
    D --> J[Store Reservation with timestamp]
    J --> K[Update Unit Assignment Map]
    K --> L[Success: Resource Reserved]
    
    L --> M[GameBot Turn Update]
    M --> N[Check All Assignments]
    
    N --> O{Unit Still Alive?}
    O -->|No| P[Release Assignment]
    O -->|Yes| Q{Resource Still Exists?}
    
    Q -->|No| P
    Q -->|Yes| R{Assignment Timeout?}
    
    R -->|Yes: >10 min| P
    R -->|No| S[Keep Assignment]
    
    P --> T[Free Resource for Others]
    T --> U[Try Reassign to Waiting Units]
    
    U --> V[Calculate Priorities for Available Units]
    V --> W[Assign to Highest Priority Unit]
    
    H --> X[Unit Waits for Assignment]
    S --> Y[Continue Collection]
    W --> Y
    X --> Y
    
    style A fill:#ff9999,stroke:#333,stroke-width:4px
```

## Resource Management Flow with Reservation System

```mermaid
flowchart TD
    A[Resource Manager Input] --> B[Get Available Units without assignments]
    B --> C[Get Unreserved Resources]
    
    C --> D[Calculate Resource Priority]
    D --> E{Resource Type?}
    E -->|Nectar| F[Base Priority × 5.0, Distance ≤ 6: × 3.0]
    E -->|Bread| G[Base Priority × 2.5, Distance ≤ 4: × 1.8] 
    E -->|Apple| H[Base Priority × 1.0]
    
    F --> I[Apply Phase Modifiers]
    G --> I
    H --> I
    
    I --> J{Game Phase?}
    J -->|Early| K[Bread Priority × 1.5, Nectar × 1.5]
    J -->|Mid| L[Nectar Priority × 2.0]
    J -->|Late| M[Nectar Priority × 2.5]
    
    K --> N[Calculate Safety Factor]
    L --> N
    M --> N
    
    N --> O[Threats within 5 hexes? Allies within 4 hexes?]
    O --> P[Final Priority Score]
    
    P --> Q[Sort Resources by Priority]
    Q --> R[For Each Resource: Find Best Unit]
    
    R --> S[Calculate Unit-Resource Score]
    S --> T{Unit Cargo Compatible?}
    T -->|Same Type| U[Priority × 1.5 bonus]
    T -->|Different Type| V[Priority × 0.3 penalty]
    T -->|Empty| W[Normal Priority]
    
    U --> X[Attempt Resource Reservation]
    V --> X
    W --> X
    
    X --> Y{Reservation Success?}
    Y -->|Yes| Z[Create Gather Action]
    Y -->|No| AA[Try Next Resource]
    
    Z --> BB[Log Assignment Success]
    AA --> CC[Log Reservation Conflict]
    
    BB --> DD[Return Actions]
    CC --> DD
```

## Cargo Management and Resource Logistics

```mermaid
flowchart TD
    A[Unit with Resources] --> B[Check Cargo Status]
    
    B --> C{Resource Type?}
    C -->|Nectar| D[IMMEDIATE: Return to Anthill]
    C -->|Bread/Apple| E[Check Cargo Percentage]
    
    E --> F{Cargo ≥ 80%?}
    F -->|Yes| G[CRITICAL: Return to Anthill]
    F -->|No| H{Cargo ≥ 50%?}
    
    H -->|Yes| I[Avoid Distractions Mode]
    H -->|No| J[Normal Operations]
    
    I --> K[Search Safe Resources]
    K --> L{Safe Resources Found?}
    L -->|Yes| M[Check Compatibility]
    L -->|No| N[Head to Anthill]
    
    M --> O{Same Resource Type?}
    O -->|Yes| P[Collect if Safe Distance ≤8 & No Threats]
    O -->|No| Q[Cannot Mix: Head to Anthill]
    
    J --> R[Continue Normal Tasks]
    
    D --> S[📦 Log: Heading to anthill with nectar]
    G --> T[📦 Log: Heading to anthill, cargo full]
    N --> U[📦 Log: No safe resources, returning]
    Q --> V[📦 Log: Cannot mix resources, returning]
    P --> W[Continue Collection]
    
    S --> X[At Anthill?]
    T --> X
    U --> X
    V --> X
    
    X -->|Yes| Y[🏠 Log: Unloaded resources at anthill]
    X -->|No| Z[Continue Movement]
    
    Y --> AA[Clear Cargo, Resume Tasks]
    Z --> BB[Next Turn]
```

## Advanced Combat Management System

```mermaid
flowchart TD
    A[Combat Manager Input] --> B[Analyze Combat Situations]
    B --> C[Plan Formations]
    
    C --> D{Combat Readiness?}
    D -->|Attack| E[Plan Offensive Formation]
    D -->|Hold| F[Plan Defensive Formation]
    D -->|Retreat| G[Plan Emergency Formation]
    
    E --> H{Available Units?}
    H -->|3+ Soldiers + 2+ Scouts| I[Create Trileaf Formation]
    H -->|2+ Soldiers| J[Create Wedge Formation]
    H -->|Insufficient| K[Skip Offensive]
    
    F --> L{4+ Combat Units?}
    L -->|Yes| M[Create Concentric Formation]
    L -->|No| N[Create Defensive Ring]
    
    G --> O[Emergency Defense Around Anthill]
    
    I --> P[Expand to Individual Unit Actions]
    J --> P
    K --> Q[Plan Tactical Actions]
    M --> P
    N --> P
    O --> P
    
    P --> R[For Each Unit in Formation]
    R --> S[Create unit_id-specific action]
    S --> T[Formation Action with Position]
    
    Q --> U{Strategy Type?}
    U -->|Attack| V[Plan Attack Tactics]
    U -->|Retreat| W[Plan Retreat Tactics]
    U -->|Hold| X[Plan Hold Tactics]
    
    V --> Y[For Each Target]
    Y --> Z[For Each Assigned Unit]
    Z --> AA[Create unit_id-specific tactical action]
    
    W --> BB[For Each Unit]
    BB --> CC[Create unit_id-specific retreat action]
    
    X --> DD[For Each Combat Unit]
    DD --> EE[Create unit_id-specific hold action]
    
    T --> FF[Combat Actions with unit_id]
    AA --> FF
    CC --> FF
    EE --> FF
    
    FF --> GG[Log: Unit X engaging in combat]
```

## Round Management Lifecycle

```mermaid
flowchart TD
    A[Round Manager Start] --> B[Check Rounds API]
    B --> C[Parse Round Data]
    
    C --> D{Current Round Active?}
    D -->|Yes| E[Try Register for Current]
    D -->|No| F{Next Round Available?}
    
    E --> G{Registration Success?}
    G -->|Yes| H[Start Game Loop]
    G -->|No| I{Lobby Ended Error?}
    
    I -->|Yes| J[Clear Current Round and Wait for Next]
    I -->|No| K[Throw Error]
    
    F -->|Yes| L[Calculate Wait Time]
    F -->|No| M[No Rounds Available]
    
    L --> N{Should Start Soon?}
    N -->|Wait Time ≤ 0| O[Check Round Status]
    N -->|Wait Time > 0| P[Display Countdown]
    
    P --> Q[Update Every 10 seconds]
    Q --> R[Check Round Status]
    R --> S{Round Now Active?}
    S -->|Yes| E
    S -->|No| Q
    
    O --> S
    J --> B
    M --> T[Wait 30 seconds]
    T --> B
    
    H --> U[Game Active]
    U --> V{Round Still Active?}
    V -->|Yes| U
    V -->|No| B
```

## Visualizer Real-time Updates

```mermaid
flowchart TD
    A[Game State Change] --> B[WebSocket Server]
    B --> C[Broadcast to Client]
    
    C --> D[Update Game Renderer]
    D --> E[Clear Canvas]
    E --> F[Draw Hexagonal Grid]
    F --> G[Render Units]
    
    G --> H{Unit Type?}
    H -->|Worker| I[Yellow Circle with Cargo capacity display]
    H -->|Soldier| J[Red Circle with Attack indicators]
    H -->|Scout| K[Blue Circle with Vision range]
    H -->|Anthill| L[Large Brown Hexagon]
    
    I --> M[Draw Resources]
    J --> M
    K --> M
    L --> M
    
    M --> N{Resource Type?}
    N -->|Nectar| O[Purple Diamond: 60 calories]
    N -->|Bread| P[Brown Square: 25 calories]
    N -->|Apple| Q[Green Circle: 10 calories]
    
    O --> R[Update Statistics Panel]
    P --> R
    Q --> R
    
    R --> S[Unit Counts by Type]
    S --> T[Resource Summary]
    T --> U[Threat Analysis]
    U --> V[Economy Metrics]
    
    V --> W[Round Status Display]
    W --> X{Round State?}
    X -->|Active| Y[Show Game Statistics]
    X -->|Waiting| Z[Show Countdown Overlay]
    
    Y --> AA[Update Complete]
    Z --> BB[Real-time Countdown: Update every second]
    BB --> AA
```

## End-Game Strategy and Safety Calculations

```mermaid
flowchart TD
    A[Check Current Turn] --> B{Turn ≥ 380?}
    B -->|No| C[Normal Operations]
    B -->|Yes| D[End-Game Mode Activated]
    
    D --> E[Calculate Remaining Turns: 420 - currentTurn]
    E --> F[For Each Unit: Calculate Safe Distance]
    
    F --> G[Get Unit Speed by Type]
    G --> H{Unit Type?}
    H -->|Worker| I[Speed = 3]
    H -->|Soldier| J[Speed = 4] 
    H -->|Scout| K[Speed = 7]
    
    I --> L[Calculate: maxSafeDistance = (turnsLeft × 3) ÷ 2 - 2]
    J --> M[Calculate: maxSafeDistance = (turnsLeft × 4) ÷ 2 - 2]
    K --> N[Calculate: maxSafeDistance = (turnsLeft × 7) ÷ 2 - 2]
    
    L --> O[Check Current Distance to Anthill]
    M --> O
    N --> O
    
    O --> P{Distance > maxSafeDistance?}
    P -->|Yes| Q[RESTRICT: Must return to anthill area]
    P -->|No| R[Allow limited nearby resource collection]
    
    R --> S[Find Resources within maxSafeDistance]
    S --> T{Nearby Resources Found?}
    T -->|Yes| U[Allow Collection of Safe Resources]
    T -->|No| V[Return to Anthill Area]
    
    Q --> W[Force Return to Anthill]
    U --> X[Continue with Restricted Movement]
    V --> X
    W --> X
    
    X --> Y[Log End-Game Decision]
    Y --> Z[🏁 End-Game restrictions active: Turn currentTurn/420]
    
    C --> AA[Normal Decision Tree]
```

## Intelligent Decision Priority Matrix

```mermaid
flowchart TD
    A[Decision Context] --> B[LEVEL 1: Critical Life & Death]
    B --> B1{Cargo ≥80% OR Nectar?}
    B1 -->|Yes| B2[CRITICAL: Return to Anthill]
    B1 -->|No| B3{Turn ≥380?}
    B3 -->|Yes| B4[CRITICAL: End-Game Restrictions]
    B3 -->|No| C[LEVEL 2: Absolute Resource Priority]
    
    C --> C1{Nectar Available?}
    C1 -->|Yes| C2[ABSOLUTE: Nectar Collection Overrides All]
    C1 -->|No| D[LEVEL 3: Risk Management]
    
    D --> D1{Cargo ≥50%?}
    D1 -->|Yes| D2[Avoid Distractions: Safe Resources Only]
    D1 -->|No| E[LEVEL 4: Strategic Expansion]
    
    E --> E1{Enemy Anthills Known?}
    E1 -->|Yes| E2[Analyze Raid Feasibility]
    E2 --> E3{Raid Score ≥120?}
    E3 -->|Yes| E4[HIGH: Raid Enemy Anthill]
    E3 -->|No| F[LEVEL 5: Defensive Operations]
    E1 -->|No| F
    
    F --> F1{Immediate Threats?}
    F1 -->|Yes| F2[HIGH: Immediate Defense]
    F1 -->|No| G[LEVEL 6: Unit Specialization]
    
    G --> G1{Unit Type?}
    G1 -->|Scout| G2[Find Enemies → Explore → Resources]
    G1 -->|Soldier| G3[Hunt Enemies → Combat → Resources]
    G1 -->|Worker| G4[Bread → Apples → Support]
    
    B2 --> H[Execute with CRITICAL Priority]
    B4 --> H
    C2 --> H
    D2 --> I[Execute with SAFE Priority]
    E4 --> J[Execute with HIGH Priority]
    F2 --> J
    G2 --> K[Execute with NORMAL Priority]
    G3 --> K
    G4 --> K
    
    H --> L[💼 Log Critical Decision]
    I --> M[⚠️ Log Safety Decision]
    J --> N[⚔️ Log Combat Decision]
    K --> O[📋 Log Normal Decision]
```

## Algorithm Complexity and Performance

The enhanced decision-making system operates with the following characteristics:

### Core Systems
- **Game State Analysis**: O(n) where n = units + resources + threats
- **Intelligent Priority System**: O(1) constant time hierarchical checks
- **Cargo Management**: O(1) per unit for cargo status and compatibility
- **End-Game Calculations**: O(n) where n = number of units (distance calculations)
- **Resource Compatibility**: O(1) per resource type check
- **Safe Resource Search**: O(r×t) where r = resources, t = threats (safety validation)
- **Resource Assignment Manager**: O(1) for reservation checks, O(u) for cleanup where u = dead units
- **Centralized Reservations**: O(r) space for resource reservations, O(1) priority comparisons

### Combat Systems  
- **Formation Planning**: O(u) where u = combat units
- **Individual Unit Actions**: O(u×a) where u = units, a = actions per unit
- **Raid Feasibility**: O(1) mathematical scoring per enemy anthill
- **Threat Assessment**: O(n²) for all unit-vs-unit threat calculations

### Optimization Features
- **Pathfinding**: O(k) where k = direct path length (hexagonal grid)
- **Resource Prioritization**: O(r log r) where r = number of resources  
- **Unit Assignment**: O(n×p) where n = units, p = priority levels (max 6)
- **Logging System**: O(1) per decision with structured event categorization

### Real-Time Performance
The system maintains **sub-100ms decision times** for typical scenarios:
- 50-100 units: ~50-80ms total processing
- 20-50 resources: ~10-20ms resource analysis  
- 10-30 threats: ~15-25ms threat assessment
- End-game calculations: ~5-10ms per unit

### Memory Efficiency
- **Cargo tracking**: O(n) space for unit resource states
- **Assignment cache**: O(n) space for unit task assignments
- **Path validation**: O(k) temporary space per pathfinding operation
- **Combat formations**: O(u) space for unit positioning data

The enhanced system prioritizes critical decisions (cargo management, end-game safety) with O(1) complexity while maintaining comprehensive strategic analysis for complex scenarios.