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

## Unit Management Decision Flow

```mermaid
flowchart TD
    A[Unit Manager Input] --> B[Get Available Units]
    B --> C[For Each Unit]
    
    C --> D{Unit Has Assignment?}
    D -->|Yes| E{Assignment Still Valid?}
    E -->|Yes| F[Continue Assignment]
    E -->|No| G[Clear Assignment]
    
    D -->|No| G
    F --> H[Calculate Movement]
    G --> I[Determine Task Priority]
    
    I --> J{Immediate Threats?}
    J -->|Yes| K[Priority: Immediate Defense]
    J -->|No| L{Unit Type?}
    
    L -->|Scout| M[Priorities: 1. Nectar Collection, 2. Exploration, 3. Resource Scouting]
    L -->|Soldier| N[Priorities: 1. Combat, 2. Convoy Protection, 3. Territory Defense]
    L -->|Worker| O[Priorities: 1. Bread Collection, 2. Apple Collection, 3. Construction]
    
    K --> P[Execute Task]
    M --> P
    N --> P
    O --> P
    
    P --> Q{Task Successful?}
    Q -->|Yes| H
    Q -->|No| R[Default Behavior: Patrol around Anthill]
    R --> H
    
    H --> S[Return Movement Command]
```

## Resource Management Flow

```mermaid
flowchart TD
    A[Resource Manager Input] --> B[Get Available Units]
    B --> C[Prioritize Resources]
    
    C --> D[Calculate Resource Priority]
    D --> E{Resource Type?}
    E -->|Nectar| F[Base Priority × 3.0, Distance ≤ 6: × 2.0]
    E -->|Bread| G[Base Priority × 2.0, Distance ≤ 4: × 1.5] 
    E -->|Apple| H[Base Priority × 1.0]
    
    F --> I[Apply Phase Modifiers]
    G --> I
    H --> I
    
    I --> J{Game Phase?}
    J -->|Early| K[Bread Priority × 1.5]
    J -->|Mid| L[Nectar Priority × 1.3]
    J -->|Late| M[Nectar Priority × 1.8]
    
    K --> N[Calculate Safety Factor]
    L --> N
    M --> N
    
    N --> O[Threats within 5 hexes? Allies within 4 hexes?]
    O --> P[Final Priority Score]
    
    P --> Q[Sort Resources by Priority]
    Q --> R[Assign Best Units to Resources]
    
    R --> S[For Each Resource Assignment]
    S --> T[Select Optimal Unit Count]
    T --> U{Resource Type?}
    U -->|Nectar| V[Max 2 Units]
    U -->|Bread| W[Max 3 Units]
    U -->|Apple| X[Max 4 Units]
    
    V --> Y[Calculate Collection Strategy]
    W --> Y
    X --> Y
    
    Y --> Z{Distance > 8 OR Threats?}
    Z -->|Yes| AA[Convoy Formation with Escort Protection]
    Z -->|No| BB[Standard Collection]
    
    AA --> CC[Return Assignment]
    BB --> CC
```

## Combat Management System

```mermaid
flowchart TD
    A[Combat Manager Input] --> B[Analyze Combat Situations]
    B --> C[Identify Engagements]
    C --> D[Plan Formations]
    
    D --> E{Combat Readiness?}
    E -->|Attack Recommended| F[Plan Offensive Formation]
    E -->|Hold Position| G[Plan Defensive Formation]  
    E -->|Retreat| H[Plan Emergency Formation]
    
    F --> I{Available Units?}
    I -->|3+ Fighters + 2+ Scouts| J[Create Trileaf Formation]
    I -->|2+ Fighters| K[Create Wedge Formation]
    I -->|Insufficient| L[Skip Offensive]
    
    G --> M{4+ Combat Units?}
    M -->|Yes| N[Create Concentric Formation]
    M -->|No| O[Create Defensive Ring]
    
    H --> P[Emergency Defense]
    
    J --> Q[Plan Tactical Actions]
    K --> Q
    L --> Q
    N --> Q
    O --> Q
    P --> Q
    
    Q --> R{Strategy Type?}
    R -->|Attack| S[Plan Attack Tactics]
    R -->|Retreat| T[Plan Retreat Tactics]
    R -->|Hold| U[Plan Hold Tactics]
    
    S --> V{Combat Advantage?}
    V -->|> 2.0| W[Direct Assault]
    V -->|> 1.2| X[Coordinated Attack]
    V -->|≤ 1.2| Y[Hit and Run]
    
    T --> Z[Organized Retreat]
    U --> AA[Hold Positions]
    
    W --> BB[Execute Combat Actions]
    X --> BB
    Y --> BB
    Z --> BB
    AA --> BB
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

## Decision Priority Matrix

```mermaid
flowchart TD
    A[Decision Context] --> B{Immediate Threats?}
    B -->|Yes| C[CRITICAL PRIORITY: Defense Actions]
    B -->|No| D{Resource Opportunities?}
    
    C --> C1[All units defend anthill]
    C --> C2[Emergency formations]
    C --> C3[Produce soldiers]
    
    D -->|High-value nearby| E[HIGH PRIORITY: Resource Collection]
    D -->|Limited resources| F{Economic Status?}
    
    E --> E1[Assign best units to nectar]
    E --> E2[Protect resource gatherers]
    E --> E3[Optimize collection efficiency]
    
    F -->|Below targets| G[MEDIUM PRIORITY: Economic Focus]
    F -->|Meeting targets| H{Combat Readiness?}
    
    G --> G1[Increase worker production]
    G --> G2[Focus on bread/apple collection]
    G --> G3[Expand controlled territory]
    
    H -->|Superior forces| I[LOW PRIORITY: Expansion]
    H -->|Balanced/weak| J[MAINTENANCE: Hold Position]
    
    I --> I1[Aggressive expansion]
    I --> I2[Attack enemy units]
    I --> I3[Control high-value areas]
    
    J --> J1[Maintain current strategy]
    J --> J2[Defensive positioning]
    J --> J3[Efficient resource flow]
```

## Algorithm Complexity and Performance

The decision-making system operates with the following characteristics:

- **Game State Analysis**: O(n) where n is the number of units + resources
- **Strategy Calculation**: O(1) constant time for phase-based decisions  
- **Unit Assignment**: O(n×m) where n is units and m is available tasks
- **Pathfinding**: O(k) where k is the direct path length (simplified approach)
- **Combat Analysis**: O(n²) for threat assessment between all unit pairs
- **Resource Prioritization**: O(r log r) where r is the number of resources

The system is designed to handle real-time decision making with typical game states of 50-100 units and 20-50 resources efficiently.