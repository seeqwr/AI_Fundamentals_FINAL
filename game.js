/**
 * ══════════════════════════════════════════════════════════════
 *  THE QUIET GRID — Client Game Engine & Visualizer
 *  Supports:
 *    1. Python Backend Mode (REST API -> server.py via localhost:5000)
 *    2. Seamless Offline Client AI Fallback (CSP + HMM + A* in JS)
 * ══════════════════════════════════════════════════════════════
 */

// ── In-Browser Algorithms Fallback (Ensures 100% playable even without Python) ──
class ClientAIEngine {
    static generateLevel(w = 21, h = 21, hearingRadius = 5, visionRadius = 4, monsterType = 'hunter') {
        w = w % 2 === 1 ? w : w - 1;
        h = h % 2 === 1 ? h : h - 1;

        // CSP loop: carve until constraints are met
        let grid, player, keyPos, exitPos, monster;
        for (let attempt = 0; attempt < 80; attempt++) {
            grid = Array.from({ length: h }, () => Array(w).fill(1));
            grid[1][1] = 0;
            const stack = [[1, 1]];
            const visited = new Set(['1,1']);

            while (stack.length > 0) {
                const [cx, cy] = stack[stack.length - 1];
                const nbrs = [];
                for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0]]) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && !visited.has(`${nx},${ny}`)) {
                        nbrs.push([nx, ny, dx, dy]);
                    }
                }
                if (nbrs.length > 0) {
                    const [nx, ny, dx, dy] = nbrs[Math.floor(Math.random() * nbrs.length)];
                    grid[cy + dy / 2][cx + dx / 2] = 0;
                    grid[ny][nx] = 0;
                    visited.add(`${nx},${ny}`);
                    stack.push([nx, ny]);
                } else {
                    stack.pop();
                }
            }

            // Open extra passages for loop gameplay
            for (let i = 0; i < Math.floor((w * h) / 7); i++) {
                const rx = 2 + Math.floor(Math.random() * (w - 4));
                const ry = 2 + Math.floor(Math.random() * (h - 4));
                if (grid[ry][rx] === 1) {
                    let adj = 0;
                    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
                        if (grid[ry + dy][rx + dx] === 0) adj++;
                    }
                    if (adj >= 2) grid[ry][rx] = 0;
                }
            }

            player = [1,1];

            // Floor cells
            const floor = [];
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (grid[y][x] === 0) floor.push([x, y]);
                }
            }

            // Exit: farthest bottom-right
            floor.sort((a, b) => (b[0] + b[1]) - (a[0] + a[1]));
            exitPos = floor.find(c => c[0] !== player[0] || c[1] !== player[1]) || floor[0];
            const unoccupied = floor.filter(c => !this.same(c,player) && !this.same(c,exitPos));
            const distant = unoccupied.filter(c => this.distance(c,player) > 3);
            const spawnCells = distant.length ? distant : unoccupied;
            monster = spawnCells[Math.floor(Math.random() * spawnCells.length)];

            // Key: middle region
            const midCells = floor.filter(([x, y]) =>
                x >= Math.floor(w / 4) && x <= Math.floor(3 * w / 4) &&
                y >= Math.floor(h / 4) && y <= Math.floor(3 * h / 4) &&
                !this.same([x,y],monster) && !(x === player[0] && y === player[1]) && !(x === exitPos[0] && y === exitPos[1])
            );
            const keyCells=midCells.length?midCells:floor.filter(c=>![player,monster,exitPos].some(p=>this.same(c,p)));
            keyPos=keyCells[Math.floor(Math.random()*keyCells.length)];

            // CSP Check: BFS paths
            if (this.bfsReachable(grid, w, h, player, keyPos) &&
                this.bfsReachable(grid, w, h, keyPos, exitPos) &&
                this.bfsReachable(grid, w, h, player, exitPos)) {
                break;
            }
        }

        // Scatter noise tiles (type = 2)
        const reserved = new Set([
            `${player[0]},${player[1]}`, `${keyPos[0]},${keyPos[1]}`,
            `${exitPos[0]},${exitPos[1]}`, `${monster[0]},${monster[1]}`
        ]);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (grid[y][x] === 0 && !reserved.has(`${x},${y}`) && Math.random() < 0.16) {
                    grid[y][x] = 2;
                }
            }
        }

        const state = {
            grid, width: w, height: h, player, monster, key_pos: keyPos, exit_pos: exitPos,
            turn: 0, key_collected: false, game_over: false, victory: false,
            ai_status: "PATROL", detection_probability: 0.05,
            vision_radius: monsterType === 'brute' ? 0 : visionRadius,
            hearing_radius: hearingRadius + (monsterType === 'brute' ? 4 : 0),
            monster_type: monsterType, player_vision_radius: 3, decoys: 3,
            last_decoy: null, ai_target: null, last_seen: null, last_seen_turn: -1,
            observed_velocity: [0, 0], chase_cooldown: 0,
            footstep: false, stepped_on_noise: false, message: "Лабиринт құрылды (CSP). Кілтті тап!",
            belief_top: []
        };
        this.initBelief(state);
        return state;
    }

    static bfsReachable(grid, w, h, start, goal) {
        if (start[0] === goal[0] && start[1] === goal[1]) return true;
        const q = [start];
        const seen = new Set([`${start[0]},${start[1]}`]);
        let head = 0;
        while (head < q.length) {
            const [cx, cy] = q[head++];
            for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
                const nx = cx + dx, ny = cy + dy;
                const key = `${nx},${ny}`;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny][nx] !== 1 && !seen.has(key)) {
                    if (nx === goal[0] && ny === goal[1]) return true;
                    seen.add(key);
                    q.push([nx, ny]);
                }
            }
        }
        return false;
    }

    static astar(grid, w, h, start, goal, occupied = null) {
        if (start[0] === goal[0] && start[1] === goal[1]) return [];
        const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

        const openSet = [{ pos: start, g: 0, f: manhattan(start, goal) }];
        const cameFrom = new Map();
        const gScore = new Map();
        gScore.set(`${start[0]},${start[1]}`, 0);
        const closed = new Set();

        while (openSet.length > 0) {
            openSet.sort((a, b) => a.f - b.f || a.g - b.g || a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1]);
            const current = openSet.shift();
            const [cx, cy] = current.pos;
            const curKey = `${cx},${cy}`;

            if (cx === goal[0] && cy === goal[1]) {
                const path = [];
                let currKey = curKey;
                while (cameFrom.has(currKey)) {
                    const prev = cameFrom.get(currKey);
                    const [px, py] = currKey.split(',').map(Number);
                    path.unshift([px, py]);
                    currKey = `${prev[0]},${prev[1]}`;
                }
                return path;
            }

            if (closed.has(curKey)) continue;
            closed.add(curKey);

            for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
                const nx = cx + dx, ny = cy + dy;
                const nbKey = `${nx},${ny}`;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny][nx] !== 1 && !closed.has(nbKey) && !occupied?.has(nbKey)) {
                    const tg = gScore.get(curKey) + 1;
                    if (tg < (gScore.get(nbKey) ?? Infinity)) {
                        cameFrom.set(nbKey, [cx, cy]);
                        gScore.set(nbKey, tg);
                        openSet.push({ pos: [nx, ny], g: tg, f: tg + manhattan([nx, ny], goal) });
                    }
                }
            }
        }
        return [];
    }

    static distance(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); }
    static same(a, b) { return a && b && a[0] === b[0] && a[1] === b[1]; }
    static floor(s, [x, y]) {
        return x >= 0 && y >= 0 && x < s.width && y < s.height && s.grid[y][x] !== 1;
    }

    // Trace between the actors' actual positions. Integer coordinates are tile centres.
    static openSightSegment(state, [px,py], [rx,ry]) {
        let x=Math.round(px), y=Math.round(py);
        const endX=Math.round(rx), endY=Math.round(ry);
        const dx=rx-px, dy=ry-py, stepX=Math.sign(dx), stepY=Math.sign(dy);
        const strideX=1/Math.abs(dx), strideY=1/Math.abs(dy);
        let crossX=stepX ? (x+.5*stepX-px)/dx : Infinity;
        let crossY=stepY ? (y+.5*stepY-py)/dy : Infinity;
        while (this.floor(state,[x,y])) {
            if (x===endX && y===endY) return true;
            const moveX=x!==endX && (y===endY || crossX<=crossY+1e-10);
            const moveY=y!==endY && (x===endX || crossY<=crossX+1e-10);
            if (moveX && moveY && (!this.floor(state,[x+stepX,y]) || !this.floor(state,[x,y+stepY]))) return false;
            if (moveX) { x+=stepX; crossX+=strideX; }
            if (moveY) { y+=stepY; crossY+=strideY; }
        }
        return false;
    }

    static lineOfSight(s, origin, target) {
        const valid = ([x, y]) => x >= 0 && y >= 0 && x < s.width && y < s.height;
        if (!valid(origin) || !valid(target)) return false;
        let start = origin, end = target;
        if (start[0] > end[0] || (start[0] === end[0] && start[1] > end[1])) [start, end] = [end, start];
        let [x, y] = start;
        const dx = Math.abs(end[0] - x), dy = -Math.abs(end[1] - y);
        const sx = x < end[0] ? 1 : -1, sy = y < end[1] ? 1 : -1;
        let err = dx + dy;
        while (true) {
            if (!this.same([x, y], origin) && !this.same([x, y], target) && s.grid[y][x] === 1) return false;
            if (this.same([x, y], end)) return true;
            const e2 = 2 * err;
            let nx = x, ny = y;
            if (e2 >= dy) { err += dy; nx += sx; }
            if (e2 <= dx) { err += dx; ny += sy; }
            if (nx !== x && ny !== y && (s.grid[y][nx] === 1 || s.grid[ny][x] === 1)) return false;
            x = nx; y = ny;
        }
    }

    static initBelief(s) {
        const cells = [];
        for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
            if (s.grid[y][x] !== 1) cells.push(`${x},${y}`);
        }
        s.belief = Object.fromEntries(cells.map(c => [c, 1 / cells.length]));
        this.beliefSummary(s);
    }

    static beliefSummary(s) {
        s.belief_top = Object.entries(s.belief).map(([key, p]) => [...key.split(',').map(Number), p])
            .sort((a, b) => b[2] - a[2] || a[1] - b[1] || a[0] - b[0]);
        s.detection_probability = Math.max(0.05, Math.min(1, s.belief_top
            .filter(c => this.distance(c, s.player) <= 1).reduce((sum, c) => sum + c[2], 0)));
    }

    static updateBelief(s, source, decoy = false) {
        if (!s.belief) this.initBelief(s);
        const predicted = Object.fromEntries(Object.keys(s.belief).map(c => [c, 0]));
        for (const [key, p] of Object.entries(s.belief)) {
            const [x, y] = key.split(',').map(Number);
            const destinations = [[x,y], [x,y+1], [x,y-1], [x+1,y], [x-1,y]].filter(c => this.floor(s, c));
            for (const c of destinations) predicted[c.join(',')] += p / destinations.length;
        }
        const count = Object.keys(predicted).length;
        let total = 0;
        for (const key of Object.keys(predicted)) {
            const cell = key.split(',').map(Number);
            predicted[key] = source
                ? (decoy ? 1 / count : 0.2 * predicted[key] + 0.8 / count) * (0.18 ** this.distance(cell, source))
                : predicted[key] * (this.distance(cell, s.monster) <= s.hearing_radius ? 0.4 : 1);
            total += predicted[key];
        }
        s.belief = Object.fromEntries(Object.entries(predicted).map(([c, p]) => [c, p / total]));
        this.beliefSummary(s);
    }

    static processMove(state, direction, target = null, sneaking = false) {
        if (state.game_over) return state;
        const deltas = {up: [0,-1], down: [0,1], left: [-1,0], right: [1,0], wait: [0,0]};
        if (direction === 'decoy') {
            if (!Array.isArray(target) || target.length !== 2 || !target.every(Number.isInteger)
                || state.decoys <= 0 || !this.floor(state, target)
                || this.distance(state.player, target) > state.player_vision_radius
                || !this.lineOfSight(state, state.player, target)) throw new Error('Еденнің көрініп тұрған торкөзін таңда.');
        } else if (direction === 'walk') {
            if (!Array.isArray(target) || target.length !== 2 || !target.every(Number.isInteger)
                || typeof sneaking !== 'boolean' || !this.floor(state,target)
                || Math.max(...target.map((n,i)=>Math.abs(n-state.player[i]))) !== 1
                || !this.lineOfSight(state,state.player,target)) throw new Error('Өткел жабық.');
        } else if (!Object.hasOwn(deltas, direction)) throw new Error('Белгісіз әрекет.');
        const s = JSON.parse(JSON.stringify(state));
        s.turn++;
        s.message = null;
        s.last_decoy = null;
        const previous = s.player;
        if (direction === 'decoy') {
            s.decoys--;
            s.last_decoy = target;
            s.message = 'Құты сынды! Оның дыбысы күзетті алаңдатады.';
        } else if (direction === 'walk') {
            s.player = [...target];
        } else {
            const [dx, dy] = deltas[direction];
            const next = [s.player[0] + dx, s.player[1] + dy];
            if (this.floor(s, next)) s.player = next;
        }
        const moved = !this.same(previous, s.player);
        s.footstep = moved && !(direction === 'walk' && sneaking);
        s.stepped_on_noise = s.footstep && s.grid[s.player[1]][s.player[0]] === 2;
        if (s.stepped_on_noise) s.message = 'Аяғыңның астындағы шыны сынықтары сықырлады!';
        if (this.same(s.player, s.monster)) return this.caught(s);
        if (this.same(s.player, s.key_pos) && !s.key_collected) {
            s.key_collected = true;
            s.message = 'Кілт табылды! Шығаберіске асық!';
        }
        if (this.same(s.player, s.exit_pos)) {
            if (s.key_collected) {
                s.victory = s.game_over = true;
                s.message = 'Аман шықтың! Лабиринт артта қалды.';
                return s;
            }
            s.message = 'Шығаберіс жабық! Алдымен кілтті тап.';
        }
        const source = direction === 'decoy' ? target : s.footstep ? s.player : null;
        const range = s.hearing_radius * (direction === 'decoy' || s.stepped_on_noise ? 2 : 1);
        const heard = source && this.distance(s.monster, source) <= range;
        this.updateBelief(s, heard ? source : null, direction === 'decoy');
        const visible = s.vision_radius > 0 && this.distance(s.monster, s.player) <= s.vision_radius
            && this.lineOfSight(s, s.monster, s.player);
        if (visible) {
            if (s.last_seen && s.last_seen_turn === s.turn - 1) {
                const v = [s.player[0] - s.last_seen[0], s.player[1] - s.last_seen[1]];
                s.observed_velocity = Math.max(Math.abs(v[0]),Math.abs(v[1])) <= 1 ? v : [0, 0];
            } else s.observed_velocity = [0, 0];
            s.last_seen = [...s.player];
            s.last_seen_turn = s.turn;
            s.chase_cooldown = 4;
            s.ai_status = s.monster_type === 'stalker' ? 'STALK' : 'CHASE';
            s.belief = Object.fromEntries(Object.keys(s.belief).map(c => [c, c === s.player.join(',') ? 1 : 0]));
            this.beliefSummary(s);
            s.ai_target = [...s.player];
            if (s.monster_type === 'stalker' && this.distance(s.monster, s.player) > 1) for (let i = 0; i < 2; i++) {
                const next = [s.ai_target[0] + s.observed_velocity[0], s.ai_target[1] + s.observed_velocity[1]];
                if (!this.floor(s, next) || !this.lineOfSight(s,s.ai_target,next)) break;
                s.ai_target = next;
            }
        } else if (heard) {
            s.ai_status = 'INVESTIGATE';
            s.chase_cooldown = 4;
            s.ai_target = s.belief_top[0].slice(0, 2);
        } else if (s.chase_cooldown > 0 && s.ai_target && !this.same(s.monster, s.ai_target)) {
            s.chase_cooldown--;
            s.ai_status = 'SEARCH';
        } else {
            s.ai_status = 'PATROL';
            s.ai_target = s.belief_top[0].slice(0, 2);
            if (this.same(s.ai_target, s.monster)) {
                const cells = Object.keys(s.belief).map(c => c.split(',').map(Number)).sort((a,b) => a[1]-b[1] || a[0]-b[0]);
                s.ai_target = cells[(s.turn * 17) % cells.length];
            }
        }
        const path = this.astar(s.grid, s.width, s.height, s.monster, s.ai_target);
        const keepDistance = visible && s.monster_type === 'stalker' && path.length
            && this.distance(s.monster, s.player) > 1 && this.distance(path[0], s.player) < 2;
        if (path.length && !keepDistance) s.monster = path[0];
        if (this.same(s.player, s.monster)) return this.caught(s);
        return s;
    }

    static caught(s) {
        s.game_over = true;
        s.victory = false;
        s.message = 'Ойын аяқталды. Робот сені қараңғыда қуып жетті.';
        return s;
    }

}

// ══════════════════════════════════════════════════════════════
//  GAME CLIENT (UI, AUDIO SCANNER, MINIMAP, CANVAS RENDERER)
// ══════════════════════════════════════════════════════════════

class QuietGridClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.sceneCanvas = document.getElementById('sceneCanvas');
        this.viewMode = '2d';
        this.mazePosition = null;
        try {
            if (window.THREE && window.QuietGrid3D && this.sceneCanvas) {
                this.scene3d = new QuietGrid3D(this.sceneCanvas);
                this.viewMode = '3d';
            }
        } catch (error) {
            console.warn('3D renderer unavailable; using the top-down view.', error);
        }
        this.selectedMission = 0;
        this.completedMissions = {};
        try { this.completedMissions = JSON.parse(localStorage.getItem('quiet-grid-missions-layout-2') || '{}') || {}; } catch { /* Optional progress. */ }
        if (typeof this.completedMissions!=='object' || Array.isArray(this.completedMissions)) this.completedMissions={};
        this.showPatrolRoutes = document.getElementById('routesToggle')?.checked ?? true;
        this.previewState = window.TacticalCampaign ? TacticalCampaign.generateSector() : this.scene3d?.previewState || ClientAIEngine.generateLevel(15,15);
        this._styleField(this.previewState);
        if(this.previewState.live){
            document.getElementById('currentMissionName').textContent=this.previewState.design.name;
            document.getElementById('crystalCount').textContent=`0 / ${this.previewState.crystals.length}`;
        }
        if (this.scene3d && this.previewState.mode === 'campaign') {
            this.scene3d.previewState = this.previewState;
            this.scene3d.setLevel(this.previewState,true,true);
        }
        this.canvas.tabIndex = 0;
        if (this.sceneCanvas) this.sceneCanvas.tabIndex = 0;

        this.minimapCanvas = document.getElementById('minimapCanvas');
        this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

        this.soundCanvas = document.getElementById('soundCanvas');
        this.soundCtx = this.soundCanvas ? this.soundCanvas.getContext('2d') : null;

        this.state = null;
        this.audio = window.QuietGridAudio ? new QuietGridAudio() : null;
        this.showFullMap = document.getElementById('fullMapToggle')?.checked ?? true;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.audio?.stop();
            this._clearMovementInput();
            this.nextPatrolAt=performance.now()+this.patrolInterval;
        });
        this.isServerMode = false;
        this.serverUrl = location.protocol.startsWith('http') ? '' : 'http://localhost:5000';
        this.explored = new Set();
        this.isLoading = false;
        this.gameStarted = false;
        this.heldDirections = new Map();
        this.sneaking = false;
        this.patrolInterval = 460;
        this.nextPatrolAt = 0;
        window.addEventListener('blur',()=>this._clearMovementInput());

        this.playerSmooth = { x: 0, y: 0 };
        this.monsterSmooth = { x: 0, y: 0 };
        this.animFrame = 0;
        this.screenShake = 0;
        this.flashColor = null;
        this.flashAlpha = 0;

        this.targetingDecoy = false;
        this.hoverCell = null;
        this.floorPulses = [];
        this.visualRings = [];
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.stressLevel = 0.05;
        this.stressPhase = 0;
        this.stressLine = document.querySelector('#stressGraph .stress-line');
        this.setView(this.viewMode);
        this._setupInput();
        this.resizeObserver = new ResizeObserver(() => this._resizeCanvas());
        this.resizeObserver.observe(this.canvas.parentElement);
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { this.reducedMotion = event.matches; });
        this._tick = this._tick.bind(this);
        requestAnimationFrame(this._tick);
    }

    async testServer() {
        const urls = [...new Set([this.serverUrl, 'http://localhost:5000'])];
        for (const url of urls) {
            try {
                const response = await fetch(`${url}/state`, {signal: AbortSignal.timeout(1200)});
                if (response.ok) {
                    const state = await response.json();
                    if (state.belief && Number.isInteger(state.decoys) && typeof state.footstep==='boolean') {
                        this.serverUrl = url;
                        return true;
                    }
                }
            } catch { /* Static hosting and file:// continue with the browser engine. */ }
        }
        return false;
    }

    async startGame(opts = {}) {
        if (this.isLoading) return;
        this.audio?.stop();
        this.audio?.unlock();
        this.isLoading = true;
        const startButton = document.getElementById('startGameButton');
        if (startButton) { startButton.disabled = true; startButton.setAttribute('aria-busy', 'true'); }
        clearTimeout(this._endTimer);
        const monsterType = opts.monsterType || 'hunter';
        const w = opts.width || 21;
        const h = opts.height || 21;
        const hr = opts.hearing || 5;
        const vr = opts.vision || 4;
        const mode = opts.mode || 'sector';
        const campaign = mode !== 'classic' && window.TacticalCampaign;

        this.isServerMode = campaign ? false : await this.testServer();
        this._updateEngineBadge();

        if (campaign && mode==='sector') {
            if (opts.regenerate || !this.sectorStartState) {
                const previousSector=this.sectorStartState??this.previewState;
                this.sectorStartState = !opts.regenerate && !this.gameStarted && this.previewState.live
                    ? this.previewState
                    : TacticalCampaign.generateSector(Math.random,previousSector.sectorPlan,previousSector.design?.id);
            }
            this.state = this.sectorStartState;
        } else if (campaign) {
            this.selectedMission = Math.max(0,Math.min(TacticalCampaign.missions.length-1,opts.missionIndex ?? this.selectedMission));
            this.state = TacticalCampaign.createLevel(this.selectedMission);
        } else if (this.isServerMode) {
            try {
                const url = `${this.serverUrl}/start_game?width=${w}&height=${h}&hearing_radius=${hr}&vision_radius=${vr}&monster_type=${encodeURIComponent(monsterType)}`;
                const resp = await fetch(url, {signal: AbortSignal.timeout(4000)});
                if (!resp.ok) throw new Error('Ойынды бастау мүмкін болмады.');
                this.state = await resp.json();
            } catch (err) {
                console.warn("Python server failed, using client engine:", err);
                this.isServerMode = false;
                this._updateEngineBadge();
                this.state = ClientAIEngine.generateLevel(w, h, hr, vr, monsterType);
            }
        } else {
            this.state = ClientAIEngine.generateLevel(w, h, hr, vr, monsterType);
        }

        const previousMaze = !!this.mazePosition;
        this.mazePosition = mode === 'classic' ? [...this.state.player] : null;
        this.setRobotOnMap(!!this.mazePosition);
        this.targetingDecoy = false;
        this._clearMovementInput();
        this.hoverCell = null;
        this.floorPulses.length = 0;
        this.visualRings.length = 0;
        this.stressLevel = 0.05;
        this.stressPhase = 0;
        this.explored = new Set();
        this._updateExplored();
        this.playerSmooth = { x: this.state.player[0], y: this.state.player[1] };
        this.monsterSmooth = { x: this.state.monster[0], y: this.state.monster[1] };
        this.gameStarted = true;
        this._styleField(this.state);
        const enterMaze=mode==='classic' && this.scene3d && !this.scene3d.firstPerson && !this.scene3d.renderer.getContext().isContextLost();
        this.scene3d?.setLevel(this.state, false, this.showFullMap, mode==='classic');
        document.querySelector('.scene-panel')?.classList.add('game-playing');
        const sceneStatus = document.getElementById('sceneStatus');
        if (sceneStatus) sceneStatus.textContent = 'ЗЕРТХАНА / СИМУЛЯЦИЯ ЖҮРІП ЖАТЫР';
        this.flashColor = null;
        this.flashAlpha = 0;
        this.screenShake = 0;

        // Hide overlay and game over
        const overlay = document.getElementById('canvasOverlay');
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.pointerEvents = 'none';
            overlay.hidden = true;
        }
        const go = document.getElementById('gameOverOverlay');
        if (go) go.classList.remove('active');

        this._updateEngineBadge();
        this._updateUI();
        this.setView(enterMaze?'3d':this.viewMode);
        if(this.mazePosition || previousMaze)this.setMinimapOpen(!!this.mazePosition && this.firstPerson);
        this.isLoading = false;
        this.nextPatrolAt = performance.now()+this.patrolInterval;
        this.sightPolygons = new Map();
        this.audio?.play('start');
        if (startButton) { startButton.disabled = false; startButton.removeAttribute('aria-busy'); }
        (this.viewMode === '3d' ? this.sceneCanvas : this.canvas).focus({preventScroll:true});
    }

    async sendMove(direction, target = null, sneaking = false) {
        if (!this.gameStarted || this.isLoading || this.state?.game_over) return;
        if (this.freeMovement && (document.hidden || document.querySelector('dialog[open]'))) return;
        this.audio?.unlock();
        const step=QuietGridClient.axes[direction];
        if (this.mazePosition && step) return this._walkMaze(...step,.15);
        this.isLoading = true;
        const prev = this.state;
        try {
            if (this.state.live && step) {
                this.state=TacticalCampaign.walk(this.state,...step,.15,this.sneaking);
                if(this.state.turn===prev.turn)return;
            } else if (this.state.mode === 'campaign') {
                this.state = TacticalCampaign.processMove(this.state,direction,target);
            } else if (this.isServerMode) {
                const resp = await fetch(`${this.serverUrl}/move`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ direction, target, sneaking }), signal: AbortSignal.timeout(4000)
                });
                const result = await resp.json();
                if (!resp.ok) throw new Error(result.error || 'Әрекет қабылданбады.');
                this.state = result;
            } else {
                this.state = ClientAIEngine.processMove(this.state, direction, target, sneaking);
            }
            this.targetingDecoy = false;
            this._updateExplored();
            this._animateTransition(prev);
            this._playTurnAudio(prev);
            this._updateUI();
            if (this.state.game_over) this._onGameEnd();
        } catch (error) {
            // A lost POST response may already have committed: reconcile before continuing.
            if (this.isServerMode && (error instanceof TypeError || error.name === 'TimeoutError')) {
                try {
                    const response = await fetch(`${this.serverUrl}/state`, {signal: AbortSignal.timeout(2000)});
                    if (!response.ok) throw new Error('State unavailable');
                    this.state = await response.json();
                    this.targetingDecoy = false;
                    this._updateExplored();
                    this._playTurnAudio(prev);
                    this._updateUI();
                    if (this.state.game_over) this._onGameEnd();
                    this._showToast('Байланыс қалпына келді. Ойын күйі жаңартылды.');
                } catch {
                    this.isServerMode = false;
                    this._updateEngineBadge();
                    this._showToast('Байланыс үзілді. Ойын соңғы расталған жүрістен бастап браузерде жалғасады. Соңғы әрекетті қайтала.');
                }
            } else this._showToast(error.message);
        } finally { this.isLoading = false; }
    }

    toggleDecoy() {
        if (!this.gameStarted || this.isLoading || this.state.game_over || this.state.decoys <= 0) return;
        this.targetingDecoy = !this.targetingDecoy;
        this._updateDecoyUI();
    }

    _updateDecoyUI() {
        const button = document.getElementById('invDecoySlot');
        if (button) {
            button.disabled = !this.gameStarted || this.state?.game_over || !this.state?.decoys;
            button.setAttribute('aria-pressed', String(this.targetingDecoy));
            button.classList.toggle('targeting', this.targetingDecoy);
        }
        const count = document.getElementById('decoyCount');
        if (count) count.textContent = this.state?.decoys ?? 3;
        const hint = document.getElementById('decoyHint');
        if (hint) hint.textContent = this.targetingDecoy
            ? 'Белгіленген торкөзді таңда. Бас тарту үшін Esc пернесін бас.'
            : '';
        this.canvas.classList.toggle('targeting', this.targetingDecoy);
        this.sceneCanvas?.classList.toggle('targeting', this.targetingDecoy);
    }

    _pointerCell(event) {
        if (this.viewMode === '3d' && this.scene3d) return this.scene3d.pick(event);
        const rect = this.canvas.getBoundingClientRect();
        const {cell, ox, oy} = this.mapTransform || {
            cell:Math.min((this.dispW-44)/this.state.width,(this.dispH-44)/this.state.height),ox:0,oy:0
        };
        return [Math.floor(((event.clientX-rect.left)*this.dispW/rect.width-ox)/cell),
                Math.floor(((event.clientY-rect.top)*this.dispH/rect.height-oy)/cell)];
    }

    _styleField(state){
        const field=document.getElementById('game');
        document.getElementById('sneakHint').hidden=!(state.live || this.mazePosition);
        field.toggleAttribute('data-sector',!!state.design);
        if(state.design){
            field.style.setProperty('--field-accent',state.design.trim);
            field.style.setProperty('--sector-void',state.design.void);
        }else{
            field.style.removeProperty('--field-accent');
            field.style.removeProperty('--sector-void');
        }
    }

    _updateEngineBadge() {
        const badge = document.getElementById('engineBadge');
        if (badge) {
            if (this.state?.mode === 'campaign') {
                badge.textContent = 'ТАКТИКАЛЫҚ ТАПСЫРМАЛАР · HMM / A*';
                badge.className = 'engine-badge badge-client';
            } else if (this.isServerMode) {
                badge.textContent = 'PYTHON / СЕРВЕРГЕ ҚОСЫЛҒАН';
                badge.className = "engine-badge badge-python";
            } else {
                badge.textContent = 'БРАУЗЕР / ДЕРБЕС РЕЖИМ';
                badge.className = "engine-badge badge-client";
            }
        }
    }

    static axes = {up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};

    get freeMovement(){
        return !!(this.mazePosition || this.state?.live);
    }

    get firstPerson(){
        return this.viewMode==='3d' && !!this.scene3d?.firstPerson;
    }

    _setSneaking(active){
        if(this.sneaking===active)return;
        this.sneaking=active;
        document.getElementById('sneakHint').textContent=active?'Дыбыссыз жүріс':'Shift · дыбыссыз жүру';
    }

    _clearMovementInput(){
        this.heldDirections.clear();
        this._setSneaking(false);
    }

    _setupInput() {
        const directions = {
            KeyW:'up', ArrowUp:'up', KeyS:'down', ArrowDown:'down',
            KeyA:'left', ArrowLeft:'left', KeyD:'right', ArrowRight:'right', Space:'wait'
        };
        document.addEventListener('keyup',event=>{
            this.heldDirections.delete(event.code);
            if(event.key==='Shift'&&!event.shiftKey)this._setSneaking(false);
        });
        document.addEventListener('keydown', (e) => {
            if (document.querySelector('dialog[open]')) return;
            if (!this.gameStarted) return;
            const endOverlay = document.getElementById('gameOverOverlay');
            if (endOverlay?.classList.contains('active')) {
                if (e.code === 'Tab') {
                    e.preventDefault();const buttons=[...endOverlay.querySelectorAll('button')].filter(b=>!b.hidden);
                    const current=buttons.indexOf(document.activeElement),next=(current+(e.shiftKey?-1:1)+buttons.length)%buttons.length;
                    buttons[next]?.focus();
                }
                return;
            }
            if (e.code === 'Escape') { this.targetingDecoy = false; this._updateDecoyUI(); return; }
            if (e.target.closest('input, select, textarea, [contenteditable]')) return;
            if(this.firstPerson&&(e.code==='ArrowLeft'||e.code==='ArrowRight')){
                e.preventDefault();
                if(!e.repeat&&!this.state.game_over)this.scene3d.rotate(e.code==='ArrowLeft'?1:-1);
                return;
            }
            if(this.freeMovement && !this.state.game_over)this._setSneaking(e.shiftKey);
            if (e.code === 'KeyE' && !e.repeat) { e.preventDefault(); this.toggleDecoy(); return; }
            if (e.code === 'Space' && e.target.closest('button')) return;
            const dir = directions[e.code];
            if (dir) {
                e.preventDefault();
                if(this.freeMovement){
                    if(dir!=='wait')this.heldDirections.set(e.code,QuietGridClient.axes[dir]);
                    else if(this.mazePosition && !e.repeat && !this.targetingDecoy)this.sendMove('wait');
                    return;
                }
                if (this.state?.mode==='campaign' && e.repeat && performance.now()-(this._lastInputAt||0)<170) return;
                this._lastInputAt=performance.now();
                if (!this.targetingDecoy) this.sendMove(dir);
            }
        });
        for(const button of document.querySelectorAll('[data-move]')){
            const direction=button.dataset.move;
            button.addEventListener('pointerdown',event=>{
                if(!this.freeMovement||this.state.game_over||this.targetingDecoy||event.button!==0||direction==='wait')return;
                button.setPointerCapture(event.pointerId);
                this.heldDirections.set('pointer'+event.pointerId,QuietGridClient.axes[direction]);
            });
            button.addEventListener('pointermove',event=>{
                const key='pointer'+event.pointerId;
                if(!this.heldDirections.has(key))return;
                const pad=button.closest('.mobile-controls').getBoundingClientRect();
                const dx=event.clientX-pad.left-pad.width/2,dy=event.clientY-pad.top-pad.height/2;
                const length=Math.hypot(dx,dy);
                this.heldDirections.set(key,length>8?[dx/length,dy/length]:[0,0]);
            });
            for(const name of ['pointerup','pointercancel','lostpointercapture']){
                button.addEventListener(name,event=>this.heldDirections.delete('pointer'+event.pointerId));
            }
            button.addEventListener('click',event=>{
                if(!this.targetingDecoy && (!this.freeMovement || event.detail===0 || (direction==='wait'&&this.mazePosition)))
                    this.sendMove(direction);
            });
        }
        document.getElementById('invDecoySlot')?.addEventListener('click', () => this.toggleDecoy());
        for (const canvas of [this.canvas, this.sceneCanvas].filter(Boolean)) {
            canvas.addEventListener('pointermove', event => {
                if (this.state && this.targetingDecoy) this.hoverCell = this._pointerCell(event);
            });
            canvas.addEventListener('pointerleave', () => { this.hoverCell = null; });
            canvas.addEventListener('click', event => {
                if (!this.targetingDecoy || !this.state || (canvas===this.sceneCanvas && this.scene3d?.didDrag)) return;
                const target = this._pointerCell(event);
                if (ClientAIEngine.floor(this.state, target) && this._visibility(...target) === 2) {
                    this.sendMove('decoy', target);
                } else this._showToast('Құтыны еденнің өзіңе көрініп тұрған торкөзіне лақтыр.');
            });
        }
    }

    _updateExplored() {
        if (!this.state) return;
        const [px, py] = this.state.player;
        const radius = this.state.player_vision_radius;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) + Math.abs(dy) > radius) continue;
                const x = px + dx, y = py + dy;
                if (x >= 0 && x < this.state.width && y >= 0 && y < this.state.height) {
                    if (ClientAIEngine.lineOfSight(this.state, this.state.player, [x, y])) this.explored.add(`${x},${y}`);
                }
            }
        }
    }

    _visibility(x, y) {
        if (!this.state) return 0;
        const [px, py] = this.state.player;
        if (Math.abs(x - px) + Math.abs(y - py) <= this.state.player_vision_radius
            && ClientAIEngine.lineOfSight(this.state, this.state.player, [x, y])) return 2; // In light cone
        if (this.explored.has(`${x},${y}`)) return 1;          // Fog memory
        return 0;                                             // Pure dark
    }

    _mapKnown(x, y) {
        if (!this.state || x<0 || y<0 || x>=this.state.width || y>=this.state.height) return false;
        return this.showFullMap || this._visibility(x, y)>0;
    }

    get mazeRobotInSight() {
        return !!this.mazePosition && ClientAIEngine.openSightSegment(this.state,this.mazePosition,
            [this.monsterSmooth.x,this.monsterSmooth.y]);
    }

    get mappedMazeRobot() {
        return this.mazePosition && this.showRobotOnMap ? [this.monsterSmooth.x,this.monsterSmooth.y] : null;
    }

    setRobotOnMap(show) {
        this.showRobotOnMap=show;
        const button=document.getElementById('toggleMapRobot');
        button.hidden=!this.mazePosition;
        button.setAttribute('aria-pressed',String(show));
        button.title=show?'Роботты картадан жасыру':'Роботты картада көрсету';
    }

    setMinimapOpen(open){
        const panel=document.getElementById('minimapPanel');
        const button=document.getElementById('toggleMinimap');
        panel.hidden=!open;
        button.setAttribute('aria-expanded',String(open));
        button.setAttribute('aria-label',open?'Шағын картаны жасыру':'Шағын картаны көрсету');
        if(open)this._renderMinimap();
    }

    setFullMap(enabled) {
        this.showFullMap = !!enabled;
        const toggle = document.getElementById('fullMapToggle');
        if (toggle) toggle.checked = this.showFullMap;
        if (this.gameStarted) {
            this.scene3d?.setOverview(this.showFullMap);
            this._updateUI();
        }
    }

    _playTurnAudio(previous) {
        const state = this.state;
        if (!this.audio || !state || previous.game_over) return;
        if (state.turn<=previous.turn && !(state.live && state.patrol_ticks>previous.patrol_ticks)) return;
        if (state.game_over) { this.audio.play(state.victory ? 'victory' : 'defeat'); return; }
        if (state.last_decoy) this.audio.play('decoy');
        else if (state.footstep ?? !ClientAIEngine.same(previous.player,state.player)) this.audio.play(state.stepped_on_noise ? 'glass' : 'step');
        if (state.live ? state.crystalsCollected>previous.crystalsCollected : state.key_collected && !previous.key_collected) this.audio.play('key');
        const alerting = ['CHASE','STALK'].includes(state.ai_status) && state.ai_status!==previous.ai_status;
        if (alerting) this.audio.play('alert');
        else {
            let origin, cue='drone';
            for(const guard of state.guards??[]){
                if(this._visibility(...guard.position)!==2)continue;
                const old=previous.guards?.find(g=>g.id===guard.id);
                if(!old)continue;
                if(state.live&&guard.status!==old.status&&['SCAN','INVESTIGATE'].includes(guard.status)){
                    origin=guard.position;cue=guard.status==='SCAN'?'scan':'listen';break;
                }
                if(!origin&&!ClientAIEngine.same(old.position,guard.position))origin=guard.position;
            }
            if(!state.guards&&!ClientAIEngine.same(previous.monster,state.monster)&&this._visibility(...state.monster)===2)origin=state.monster;
            if (!origin) return;
            const dx=origin[0]-state.player[0], dy=origin[1]-state.player[1];
            const angle=this.viewMode==='3d' ? (this.scene3d?.azimuth ?? Math.PI/4) : 0;
            const pan=(dx*Math.cos(angle)-dy*Math.sin(angle))/5;
            this.audio.play(cue,{pan,gain:.60/(1+.18*Math.hypot(dx,dy))});
        }
    }

    _animateTransition(prev) {
        const now = performance.now();
        if (this.state.footstep ?? !ClientAIEngine.same(prev.player,this.state.player)) {
            const glass = this.state.stepped_on_noise;
            this.floorPulses.push({cell:this.state.playerPosition??this.state.player, now, duration:glass?730:440,
                size:glass?1.45:.52, color:glass?'#ffb44e':'#11e4b9', count:2});
        }
        if (this.state.last_decoy) this.floorPulses.push({
            cell:this.state.last_decoy, now, duration:1080, size:2.1, color:'#02d5ff', count:3
        });
        if (this.reducedMotion) return;
        if (this.state.game_over && !this.state.victory) {
            // Jumpscare screamer
            this.screenShake = 28;
            this.flashColor = 'rgba(255, 0, 0, ';
            this.flashAlpha = 0.85;
        } else if (this.state.victory) {
            // Victory pulse
            this.flashColor = 'rgba(0, 255, 65, ';
            this.flashAlpha = 0.6;
        } else if (prev && prev.ai_status !== this.state.ai_status && this.state.ai_status === 'CHASE') {
            // Alert spike
            this.screenShake = 10;
            this.flashColor = 'rgba(255, 30, 30, ';
            this.flashAlpha = 0.4;
        } else if (this.state.stepped_on_noise) {
            this.screenShake = 4;
            this.flashColor = 'rgba(255, 170, 0, ';
            this.flashAlpha = 0.25;
        }
    }

    _onGameEnd() {
        this._clearMovementInput();
        if (this.state.mode==='campaign' && !this.state.live && this.state.victory) {
            const id=String(this.state.mission_index),best=Number(this.completedMissions[id]);
            this.completedMissions[id]=best>0 ? Math.min(best,this.state.turn) : this.state.turn;
            try { localStorage.setItem('quiet-grid-missions-layout-2',JSON.stringify(this.completedMissions)); } catch { /* Optional progress. */ }
            this._updateUI();
        }
        this._endTimer = setTimeout(() => {
            const overlay = document.getElementById('gameOverOverlay');
            if (!overlay) return;
            overlay.classList.add('active');
            const sceneStatus = document.getElementById('sceneStatus');
            if (sceneStatus) sceneStatus.textContent = 'ЗЕРТХАНА / СИМУЛЯЦИЯ АЯҚТАЛДЫ';
            const title = document.getElementById('gameOverTitle');
            const sub = document.getElementById('gameOverSub');
            const next = document.getElementById('nextMission');
            if (next) next.hidden = !(this.state.mode==='campaign' && !this.state.live && this.state.victory && this.selectedMission<TacticalCampaign.missions.length-1);
            if (this.state.victory) {
                overlay.className = 'game-over-overlay active victory';
                if (title) title.textContent = 'Шығаберіс табылды!';
                if (sub) sub.textContent = this.state.live
                    ? `Барлық ${this.state.crystals.length} кристалды жинадың. Сектордан өткен уақытың — ${this._sectorTime()}.`
                    : this.state.mode==='campaign'
                    ? `«${this.state.mission_name}» тапсырмасын ${this.state.turn} жүрісте орындадың. Үздік нәтижең — ${this.completedMissions[String(this.selectedMission)]} жүріс.`
                    : `Лабиринттен ${this.state.turn} жүрісте шықтың!`;
            } else {
                overlay.className = 'game-over-overlay active defeat';
                if (title) title.textContent = 'Байланыс үзілді.';
                if (sub) sub.textContent = this.state.live ? 'Күзет сені ұстап алды. Жаңа сектор құрып, қайта ойнап көр.'
                    : `Дрон сені ${this.state.turn}-жүрісте байқап қалды. Басқа жолмен өтіп көр.`;
            }
            [...overlay.querySelectorAll('button')].find(button=>!button.hidden)?.focus({preventScroll:true});
        }, 500);
    }

    _tick(now = performance.now()) {
        const elapsed=Math.max(0,(now-(this.lastFrameTime??now))/1000);
        this.deltaTime = Math.min(elapsed, 0.05);
        this.lastFrameTime = now;
        if (!this.reducedMotion && !this.state?.game_over) this.animFrame += this.deltaTime * 60;
        if (this.state) {
            this._runMovement(now,Math.min(elapsed,.2));
            this._lerpEntities();
            this._sampleFloorPulses(now);
            this._render();
            this._renderMinimap();
            this._renderSoundScanner();
            this._renderStress();
        } else if (this.viewMode === '3d' && this.scene3d) {
            this.scene3d.renderPreview(this.deltaTime, this.reducedMotion);
        } else {
            this._render2D(this.previewState, true);
        }
        requestAnimationFrame(this._tick);
    }

    _sampleFloorPulses(now) {
        this.visualRings.length = 0;
        if (!this.floorPulses.length) return;
        this.floorPulses = this.floorPulses.filter(pulse => now - pulse.now < pulse.duration);
        for (const {cell, now:started, duration, size, color, count} of this.floorPulses) {
            const elapsed = Math.max(0, (now - started) / duration);
            for (let i = 0; i < count; i++) {
                const phase = this.reducedMotion ? elapsed : (elapsed - i * .16) / (1 - i * .16);
                if (phase < 0) continue;
                this.visualRings.push({
                    x:cell[0]+.5, y:cell[1]+.5, color,
                    radius:.17 + size * (this.reducedMotion ? .72 - i * .22 : phase),
                    opacity:(1-phase) * .8
                });
            }
        }
    }

    _runMovement(now,seconds) {
        if (!this.freeMovement || this.state.game_over || this.isLoading) return;
        if (document.hidden || document.querySelector('dialog[open]')) {
            this._clearMovementInput();
            this.nextPatrolAt=now+this.patrolInterval;
            return;
        }
        if(this.state.live && now>=this.nextPatrolAt){
            const previous=this.state;
            this.state=TacticalCampaign.tick(previous);
            this.nextPatrolAt=now+this.patrolInterval;
            this._playTurnAudio(previous);
            this._updateUI();
            if(this.state.game_over){this._onGameEnd();return;}
        }
        if(!this.targetingDecoy && this.heldDirections.size){
            let dx=0,dy=0;
            for(const [x,y] of new Set(this.heldDirections.values())){dx+=x;dy+=y;}
            if(this.mazePosition)return this._walkMaze(dx,dy,seconds);
            const previous=this.state;
            this.state=TacticalCampaign.walk(previous,dx,dy,seconds,this.sneaking);
            if(this.state.turn!==previous.turn){
                this._updateExplored();
                this._animateTransition(previous);
                this._playTurnAudio(previous);
                this._updateUI();
                if(this.state.game_over)this._onGameEnd();
            }
        }
    }

    async _walkMaze(dx,dy,seconds){
        if(this.firstPerson)[dx,dy]=this.scene3d.movementVector(dx,dy);
        const sneaking=this.sneaking;
        for(const {point} of TacticalCampaign.walkPath(this.state,this.mazePosition,dx,dy,seconds,sneaking)){
            const cell=point.map(Math.round);
            if(!ClientAIEngine.same(cell,this.state.player)){
                await this.sendMove('walk',cell,sneaking);
                if(!ClientAIEngine.same(cell,this.state.player)){
                    if(!ClientAIEngine.same(this.mazePosition.map(Math.round),this.state.player))
                        this.mazePosition=[...this.state.player];
                    return;
                }
            }
            this.mazePosition=point;
            if(this.state.game_over)return;
        }
    }

    _sectorTime(){
        const seconds=Math.floor(this.state.patrol_ticks*this.patrolInterval/1000);
        return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    }

    _lerpEntities() {
        const speed = this.reducedMotion ? 1 : 1 - Math.exp(-20 * this.deltaTime);
        if(this.freeMovement){
            [this.playerSmooth.x,this.playerSmooth.y]=this.mazePosition??this.state.playerPosition??this.state.player;
        }else{
            this.playerSmooth.x += (this.state.player[0] - this.playerSmooth.x) * speed;
            this.playerSmooth.y += (this.state.player[1] - this.playerSmooth.y) * speed;
        }
        this.monsterSmooth.x += (this.state.monster[0] - this.monsterSmooth.x) * speed;
        this.monsterSmooth.y += (this.state.monster[1] - this.monsterSmooth.y) * speed;

        if (this.screenShake > 0.3) this.screenShake *= 0.88;
        if (this.flashAlpha > 0.01) this.flashAlpha *= 0.90;
    }

    _resizeCanvas() {
        const wrapper = this.canvas.parentElement;
        const rect = wrapper.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = rect.width;
        const h = rect.height;
        if (!w || !h) return;

        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.dispW = w;
        this.dispH = h;
        this.scene3d?.resize(w, h);
    }

    setView(mode) {
        this.viewMode = mode === '3d' && this.scene3d ? '3d' : '2d';
        this.canvas.hidden = this.viewMode !== '2d';
        if (this.sceneCanvas) this.sceneCanvas.hidden = this.viewMode !== '3d';
        for (const view of ['3d', '2d']) {
            const button = document.getElementById('view' + view);
            if (!button) continue;
            button.classList.toggle('selected', this.viewMode === view);
            button.setAttribute('aria-pressed', String(this.viewMode === view));
            if (view === '3d') {
                button.disabled = !this.scene3d;
                button.title = !this.scene3d ? 'Бұл браузерде WebGL қолжетімсіз' : this.scene3d.firstPerson ? 'Кейіпкердің көзімен қарау' : 'Изометриялық 3D көрініс';
            }
        }
        const toolbar = document.getElementById('cameraToolbar');
        if (toolbar) toolbar.hidden = this.viewMode !== '3d' || this.firstPerson;
        document.getElementById('lookHint').hidden=!this.firstPerson;
        document.getElementById('game').toggleAttribute('data-first-person',this.firstPerson);
        this.hoverCell=null;
        if (this.scene3d?.compass) this.scene3d.compass.hidden = this.viewMode !== '3d';
        const hint = document.getElementById('cameraHint');
        if (hint) hint.textContent = this.firstPerson ? 'КЕЙІПКЕРДІҢ КӨЗІМЕН · АЙНАЛАҒА ҚАРАУ ҮШІН СҮЙРЕ' : this.viewMode === '3d'
            ? 'ИЗОМЕТРИЯ · БҰРУ ҮШІН СҮЙРЕ'
            : 'ҮСТІНЕН КӨРІНІС · WASD / БАҒЫТТАУЫШТАР';
        this._resizeCanvas();
    }

    _render() {
        if (this.viewMode === '3d' && this.scene3d) {
            this.scene3d.render(this, this.deltaTime, this.reducedMotion);
        } else this._render2D(this.state);
    }

    _render2D(s, preview = false) {
        if (!s) return;
        if (!this.dispW) this._resizeCanvas();
        const ctx = this.ctx, w = this.dispW, h = this.dispH;
        const cell = Math.min((w - 44) / s.width, (h - (h > 520 ? 200 : 150)) / s.height);
        const ox = (w - s.width * cell) / 2, oy = (h - s.height * cell) / 2;
        this.mapTransform = {cell, ox, oy};
        ctx.clearRect(0, 0, w, h);
        const design=s.design;
        ctx.fillStyle = design?.void??'#a5b4bf'; ctx.fillRect(0, 0, w, h);
        const visibility = (x, y) => preview ? 2 : this._visibility(x, y);
        const heatmap = !preview && document.getElementById('heatmapToggle')?.checked;
        const peak = Math.max(1e-9, ...Object.values(s.belief || {}));
        for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
            if (s.footprint && !s.footprint[y][x]) continue;
            const v = visibility(x, y), known = v > 0 || this.showFullMap || heatmap, tile = s.grid[y][x];
            const tx = ox + x * cell, ty = oy + y * cell;
            ctx.fillStyle = !known ? '#536677' : tile === 1 ? (v === 2 ? '#dae2e8' : '#b7c5d0') : v === 2 ? '#758994' : '#6d818e';
            if(design)ctx.fillStyle=!known?'#19222b':tile===1?design.wall:(x*3+y*5)%7<2?design.floorAlt:design.floor;
            ctx.fillRect(tx, ty, cell - .7, cell - .7);
            if (known && tile === 1) {
                ctx.fillStyle = design?.edge??(v === 2 ? '#e7edf2' : '#cbd5dd');
                ctx.fillRect(tx, ty, cell - .7, Math.max(2, cell * .13));
            } else if (known) {
                ctx.fillStyle = '#f0f7ff17';
                ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx+cell-.7,ty);ctx.lineTo(tx,ty+cell-.7);ctx.fill();
            }
            if (known && tile === 2) {
                ctx.strokeStyle = '#8d9eb1'; ctx.lineWidth = .8;
                for (let n = .2; n < .9; n += .15) {
                    ctx.beginPath(); ctx.moveTo(tx + cell * .15, ty + cell * n);
                    ctx.lineTo(tx + cell * .85, ty + cell * n); ctx.stroke();
                }
            }
            if (heatmap && tile !== 1) {
                const amount = (s.belief?.[`${x},${y}`] || 0) / peak;
                ctx.fillStyle = `rgba(233,112,83,${amount * .65})`;ctx.fillRect(tx,ty,cell-.7,cell-.7);
            }
            if (this.targetingDecoy && v === 2 && tile !== 1) {
                ctx.fillStyle = '#11b79c30';ctx.fillRect(tx+1,ty+1,cell-2,cell-2);
                if (this.hoverCell?.[0] === x && this.hoverCell?.[1] === y) {
                    ctx.strokeStyle = '#54b6ae';ctx.lineWidth = 2;ctx.strokeRect(tx+2,ty+2,cell-4,cell-4);
                }
            }
        }
        if(design){
            const stencil=SectorArt.stencil(design);
            for(const [x,y] of s.roomMarks){
                ctx.save();ctx.beginPath();
                for(let j=y-1;j<=y+1;j++)for(let i=x-1;i<=x+1;i++){
                    if(s.grid[j]?.[i]!==1&&(preview||this.showFullMap||visibility(i,j)>0))ctx.rect(ox+i*cell,oy+j*cell,cell,cell);
                }
                ctx.clip();ctx.globalAlpha=.42;
                ctx.drawImage(stencil,ox+(x-1)*cell,oy+(y-1)*cell,cell*3,cell*3);ctx.restore();
            }
        }
        if (s.mode==='campaign') this._renderTactical2D(s,preview,ctx,ox,oy,cell);
        const center = pos => [ox + (pos[0] + .5) * cell, oy + (pos[1] + .5) * cell];
        if (preview || this._mapKnown(...s.exit_pos)) {
            const [x, y] = center(s.exit_pos);
            ctx.fillStyle = s.live && !s.key_collected ? '#785133' : '#275a73';
            ctx.fillRect(x-cell*.34,y-cell*.34,cell*.68,cell*.68);
            ctx.strokeStyle = s.live && !s.key_collected ? '#ffca79' : '#8beeff';
            ctx.lineWidth = 2;ctx.strokeRect(x-cell*.29,y-cell*.29,cell*.58,cell*.58);
        }
        if(s.live){
            ctx.fillStyle=design?.crystal??'#c8fc83';
            for(const crystal of s.crystals){
                if(!crystal || (!preview && !this._mapKnown(...crystal))) continue;
                const [x,y]=center(crystal),radius=Math.max(4,cell*.24);
                ctx.beginPath();ctx.moveTo(x,y-radius);ctx.lineTo(x+radius,y);ctx.lineTo(x,y+radius);ctx.lineTo(x-radius,y);ctx.closePath();ctx.fill();
            }
        }else if (!s.key_collected && (preview || this._mapKnown(...s.key_pos))) {
            const [x, y] = center(s.key_pos);
            ctx.strokeStyle = '#d3a544';ctx.lineWidth = Math.max(2,cell*.09);
            ctx.beginPath();ctx.arc(x-cell*.1,y-cell*.15,cell*.16,0,Math.PI*2);ctx.stroke();
            ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+cell*.22,y+cell*.24);ctx.lineTo(x+cell*.3,y+cell*.14);ctx.stroke();
        }
        const robot=preview && s.mode!=='campaign' ? s.monster : this.mappedMazeRobot;
        if (robot) {
            const [x,y]=center(robot);
            ctx.fillStyle='#e35c6d';ctx.beginPath();ctx.roundRect(x-cell*.25,y-cell*.22,cell*.5,cell*.44,cell*.12);ctx.fill();
            ctx.fillStyle='#ffe4e6';ctx.beginPath();ctx.arc(x+cell*.12,y,cell*.07,0,Math.PI*2);ctx.fill();
        }
        const pos = preview ? s.player : [this.playerSmooth.x,this.playerSmooth.y];
        const [x,y] = center(pos);
        const glow = ctx.createRadialGradient(x,y,1,x,y,cell*1.3);glow.addColorStop(0,'#12c6ac44');glow.addColorStop(1,'#12c6ac00');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,cell*1.3,0,Math.PI*2);ctx.fill();
        const orb=ctx.createRadialGradient(x-cell*.1,y-cell*.12,1,x,y,cell*.28);
        orb.addColorStop(0,'#85f9e5');orb.addColorStop(.4,'#19bea4');orb.addColorStop(1,'#078f84');
        ctx.fillStyle=orb;ctx.beginPath();ctx.arc(x,y,cell*.28,0,Math.PI*2);ctx.fill();
        if(!preview) {
            ctx.save();
            for (const {x,y,radius,opacity,color} of this.visualRings) {
                ctx.globalAlpha=opacity;ctx.strokeStyle=color;ctx.lineWidth=1.7;
                ctx.beginPath();ctx.arc(ox+x*cell,oy+y*cell,cell*radius,0,Math.PI*2);ctx.stroke();
            }
            ctx.restore();
        }
    }

    _clipVisible(ctx, offX, offY, cell) {
        ctx.beginPath();
        for (let y = 0; y < this.state.height; y++) for (let x = 0; x < this.state.width; x++) {
            if (this._visibility(x, y) === 2) ctx.rect(offX + x * cell, offY + y * cell, cell, cell);
        }
        ctx.clip();
    }

    _renderTactical2D(state,preview,ctx,ox,oy,cell) {
        for (const guard of state.guards) {
            if (!preview && !this.showFullMap && this._visibility(...guard.position)!==2) continue;
            if (this.showPatrolRoutes && (preview || this.showFullMap)) {
                ctx.save();ctx.strokeStyle='#8aa3bd77';ctx.lineWidth=1.2;ctx.setLineDash([3,4]);ctx.beginPath();
                guard.route.forEach((p,i)=>{const x=ox+(p[0]+.5)*cell,y=oy+(p[1]+.5)*cell;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
                ctx.closePath();ctx.stroke();ctx.restore();
            }
            const cache=this.sightPolygons || (this.sightPolygons=new Map());
            const pose=guard.position.join(',')+'/'+guard.facing.join(',');
            if(cache.get(guard.id)?.pose!==pose){
                cache.set(guard.id,{pose,polygon:TacticalCampaign.visionPolygon(state,guard)});
            }
            const {polygon}=cache.get(guard.id);
            const x=ox+(guard.position[0]+.5)*cell,y=oy+(guard.position[1]+.5)*cell;
            const danger=guard.status==='CHASE';
            ctx.beginPath();polygon.forEach((p,i)=>{const x=ox+p[0]*cell,y=oy+p[1]*cell;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();
            const color=danger?'#ff836b':guard.status==='INVESTIGATE'?'#ffbc70':guard.status==='SCAN'?'#fff6c7':state.design?.cone??'#d6ff60';
            ctx.fillStyle=color+'30';ctx.fill();
            ctx.strokeStyle=danger?'#ac421f':'#566e19';ctx.lineWidth=1.25;ctx.stroke();
            ctx.save();
            ctx.clip();
            const range=guard.vision*cell;
            ctx.beginPath();
            for(let offset=-2*range;offset<=2*range;offset+=Math.max(6,cell*.32)){
                ctx.moveTo(x+offset,y-range);ctx.lineTo(x+offset-2*range,y+range);
            }
            ctx.strokeStyle=color+'b0';
            ctx.lineWidth=Math.max(2,cell*.11);ctx.stroke();ctx.restore();
            const r=Math.max(3,cell*.26);
            ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();
            ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#354955';ctx.lineWidth=1.25;ctx.stroke();
            ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+guard.facing[0]*cell*.4,y+guard.facing[1]*cell*.4);ctx.stroke();
        }
    }

    _renderStress() {
        if (!this.stressLine) return;
        const alert = {PATROL: 0, SEARCH: 0.2, INVESTIGATE: 0.35, STALK: 0.65, CHASE: 0.8}[this.state.ai_status] || 0;
        const target = Math.min(1, this.state.detection_probability * 0.7 + alert * 0.3);
        this.stressLevel += (target - this.stressLevel) * (this.reducedMotion ? 1 : 1 - Math.exp(-4 * this.deltaTime));
        if (!this.reducedMotion && !this.state.game_over) this.stressPhase += this.deltaTime * (0.6 + this.stressLevel * 2.4);
        const amplitude = 3 + this.stressLevel * 14;
        const frequency = 2 + this.stressLevel * 5;
        const points = [];
        for (let x = 0; x <= 200; x += 2) {
            const phase = ((x / 200 * frequency + this.stressPhase) % 1 + 1) % 1;
            const spike = Math.max(0, 1 - Math.abs(phase - 0.35) / 0.065)
                - 0.45 * Math.max(0, 1 - Math.abs(phase - 0.46) / 0.05);
            points.push(`${x},${(22 - spike * amplitude + Math.sin(x * 0.12 + this.stressPhase) * 1.2).toFixed(2)}`);
        }
        this.stressLine.setAttribute('points', points.join(' '));
        const color = this.stressLevel > 0.65 ? '#df5c68' : this.stressLevel > 0.3 ? '#bd9649' : '#58aaa4';
        this.stressLine.style.stroke = color;
        this.stressLine.style.filter = 'none';
        const graph = document.getElementById('stressGraph');
        graph.setAttribute('aria-label', `Ойыншының ширығу деңгейі — ${Math.round(target * 100)}%`);
    }

    _renderMinimap() {
        if (!this.minimapCtx || !this.state) return;
        if (document.getElementById('minimapPanel')?.hidden) return;
        const mctx = this.minimapCtx;
        const mw = this.minimapCanvas.width;
        const mh = this.minimapCanvas.height;
        const gw = this.state.width;
        const gh = this.state.height;
        const cw = mw / gw;
        const ch = mh / gh;

        mctx.fillStyle = '#14273e';
        mctx.fillRect(0, 0, mw, mh);

        for (let y = 0; y < gh; y++) {
            for (let x = 0; x < gw; x++) {
                if ((!this.state.footprint || this.state.footprint[y][x]) && this._mapKnown(x,y)) {
                    const tile = this.state.grid[y][x];
                    mctx.fillStyle = tile === 1 ? '#3a5675' : '#2b4864';
                    mctx.fillRect(x * cw, y * ch, cw, ch);
                }
            }
        }

        // Key on minimap
        if (this.state.live) {
            mctx.fillStyle='#d9e59c';
            for (const crystal of this.state.crystals) {
                if(crystal && this._mapKnown(...crystal))mctx.fillRect(crystal[0]*cw,crystal[1]*ch,cw,ch);
            }
        } else if (!this.state.key_collected && this._mapKnown(...this.state.key_pos)) {
            mctx.fillStyle = '#cda34e';
            mctx.fillRect(this.state.key_pos[0] * cw, this.state.key_pos[1] * ch, cw * 1.5, ch * 1.5);
        }

        // Exit on minimap
        if (this._mapKnown(...this.state.exit_pos)) {
            mctx.fillStyle = '#69b5dd';
            mctx.fillRect(this.state.exit_pos[0] * cw, this.state.exit_pos[1] * ch, cw * 1.5, ch * 1.5);
        }

        // Player on minimap
        mctx.fillStyle = '#089e8e';
        mctx.beginPath();
        mctx.arc((this.playerSmooth.x + 0.5) * cw, (this.playerSmooth.y + 0.5) * ch, cw * 1.2, 0, Math.PI * 2);
        mctx.fill();

        const robot=this.mappedMazeRobot;
        const positions=robot ? [robot] : [];
        for (const guard of this.state.guards??[]) {
            if(this.showFullMap || this._visibility(...guard.position)===2)positions.push(guard.position);
        }
        for (const position of positions) {
            mctx.fillStyle = '#df5c68';
            mctx.beginPath();
            mctx.arc((position[0] + 0.5) * cw, (position[1] + 0.5) * ch, cw * 1.2, 0, Math.PI * 2);
            mctx.fill();
        }
        let label=this.showFullMap ? 'Бүкіл лабиринттің шағын картасы' : 'Лабиринттің зерттелген бөлігінің шағын картасы';
        if(robot)label+=`. Роботтың орны — ${Math.round(robot[0])+1}-баған, ${Math.round(robot[1])+1}-қатар.`;
        if(this.minimapCanvas.getAttribute('aria-label')!==label)this.minimapCanvas.setAttribute('aria-label',label);
    }

    _renderSoundScanner() {
        if (!this.soundCtx || !this.state) return;
        const sctx = this.soundCtx;
        const sw = this.soundCanvas.width;
        const sh = this.soundCanvas.height;

        sctx.fillStyle = '#0a0a0a';
        sctx.fillRect(0, 0, sw, sh);

        // Center line
        sctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        sctx.lineWidth = 1;
        sctx.beginPath();
        sctx.moveTo(0, sh / 2);
        sctx.lineTo(sw, sh / 2);
        sctx.stroke();

        // Acoustic waveform
        const isAlert = this.state.ai_status === 'CHASE';
        const isNoisy = this.state.stepped_on_noise;
        const amp = isAlert ? 22 : (isNoisy ? 18 : 6 + this.state.detection_probability * 14);

        sctx.strokeStyle = isAlert ? '#ff1e1e' : (isNoisy ? '#ffaa00' : '#00ff41');
        sctx.lineWidth = 1.5;
        sctx.beginPath();

        for (let x = 0; x < sw; x += 3) {
            const freq = isAlert ? 0.15 : 0.08;
            const y = sh / 2 + Math.sin(x * freq + this.animFrame * 0.1) * amp * Math.cos(x * 0.02);
            if (x === 0) sctx.moveTo(x, y);
            else sctx.lineTo(x, y);
        }
        sctx.stroke();
    }

    _updateUI() {
        if (!this.state) return;
        const s = this.state;
        const tactical=s.mode==='campaign';
        document.querySelectorAll('[data-mission]').forEach(button=>{
            const index=Number(button.dataset.mission),done=Number(this.completedMissions[String(index)])>0;
            const selected=tactical&&!s.live&&index===this.selectedMission;
            button.classList.toggle('selected',selected);
            button.classList.toggle('completed',done);button.setAttribute('aria-pressed',String(selected));
            const best=button.querySelector('.mission-best');if(best)best.textContent=done?`${this.completedMissions[String(index)]} жүріс`:'Орындалмаған';
        });
        const briefing=document.getElementById('missionBrief');if(briefing)briefing.textContent=tactical?s.brief:'Кездейсоқ лабиринтте кілтті тауып, шығаберіске жет.';
        const currentMission=document.getElementById('currentMissionName');
        if(currentMission)currentMission.textContent=s.live?s.design.name:tactical?s.mission_name:'Кездейсоқ лабиринт';
        const mapButton = document.getElementById('toggleMinimap');
        if (mapButton) { mapButton.disabled = false; mapButton.title = this.showFullMap ? 'Лабиринттің толық картасы' : 'Зерттелген дәліздердің картасы'; }
        const sceneStatus = document.getElementById('sceneStatus');
        if (sceneStatus) sceneStatus.textContent = s.game_over ? 'ЗЕРТХАНА / СИМУЛЯЦИЯ АЯҚТАЛДЫ'
            : this.showFullMap ? 'ЗЕРТХАНА / ТОЛЫҚ КАРТА' : 'ЗЕРТХАНА / ШЕКТЕУЛІ КӨРІНІС';

        // Status Indicator
        const dot = document.querySelector('#aiStatus .status-dot');
        const text = document.getElementById('aiStatusText');
        const modeBadge = document.getElementById('aiStatusMode');
        const isChase = ['CHASE', 'STALK'].includes(s.ai_status);
        const fieldAlert = document.getElementById('fieldAlert');
        if (fieldAlert) {
            fieldAlert.textContent = isChase ? 'Сені байқап қалды' : {PATROL:'Патруль', SCAN:'Айналаны шолуда',SEARCH:'Іздеуде', INVESTIGATE:'Дыбысты тексеруде'}[s.ai_status] || 'Патруль';
            fieldAlert.classList.toggle('danger',isChase);
        }
        const fieldObjective = document.getElementById('fieldObjective');
        const objective=s.victory ? 'Тапсырма орындалды' : s.live
            ? (s.key_collected?'Шығаберіс ашық · порталға жет':'Барлық кристалды жина')
            : s.key_collected ? 'Шығаберіске жет' : 'Кілтті алып, шығаберіске жет';
        if (fieldObjective && fieldObjective.textContent!==objective) fieldObjective.textContent=objective;
        const crystalCount=document.getElementById('crystalCount');
        if(crystalCount){
            crystalCount.hidden=!s.live;
            const count=s.live?`${s.crystalsCollected} / ${s.crystals.length}`:'';
            if(crystalCount.textContent!==count)crystalCount.textContent=count;
        }
        const clockLabel=document.getElementById('clockLabel');
        if(clockLabel)clockLabel.textContent=s.live?'Уақыт':'Жүріс';
        const waitHint=document.getElementById('waitHint');
        if(waitHint)waitHint.hidden=s.live;
        const waitControl=document.querySelector('[data-move="wait"]');
        if(waitControl)waitControl.hidden=s.live;
        const modes = {PATROL: 'ПАТРУЛЬ · HMM', SCAN:'ШОЛУ', CHASE: 'ҚУҒЫН · A*', STALK: 'ЖОЛЫН КЕСУ · A*', INVESTIGATE: 'ДЫБЫСТЫ ТЕКСЕРУ · HMM', SEARCH: 'ІЗДЕУ · A*'};

        if (dot) dot.className = `status-dot ${isChase ? 'chase' : 'patrol'}`;
        if (text) {
            text.textContent = modes[s.ai_status];
            text.style.color = isChase ? '#df5c68' : '#54b6ae';
        }
        if (modeBadge) {
            modeBadge.textContent = {PATROL:'ПАТРУЛЬ',SCAN:'ШОЛУ',CHASE:'ҚУҒЫН',STALK:'ЖОЛЫН КЕСУ',INVESTIGATE:'ДЫБЫСТЫ ТЕКСЕРУ',SEARCH:'ІЗДЕУ'}[s.ai_status] || s.ai_status;
            modeBadge.className = isChase ? 'mode-pill chase' : 'mode-pill patrol';
        }

        this._updateDecoyUI();
        const details = document.getElementById('monsterDetails');
        const names = {hunter: 'Аңшы', stalker: 'Ізкесер', brute: 'Соқыр дәу'};
        if (details) details.textContent = s.live ? `${s.guards.length} патруль · көру бұрышы 90° · нақты уақыт`
            : tactical ? `${s.guards.length} патруль · көру бұрышы 90° · қабырға тасасында ойыншы көрінбейді`
            : `${names[s.monster_type]} · есту қашықтығы ${s.hearing_radius} · көру қашықтығы ${s.vision_radius}`;
        const peak = s.belief_top?.[0];
        const legend = document.getElementById('beliefLegend');
        if (legend && peak) legend.textContent = `HMM бойынша ең ықтимал торкөз — (${peak[0]}, ${peak[1]}), ықтималдығы ${(peak[2] * 100).toLocaleString('kk-KZ',{minimumFractionDigits:1,maximumFractionDigits:1})}%. Ықтималдық жоғарылаған сайын торкөз жарығырақ көрінеді. Көрсету режимі бүкіл лабиринтті қамтиды.`;

        // Alert Level
        ['alertLevel', 'alertLevelRight'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (isChase) {
                    el.textContent = 'ӨТЕ ЖОҒАРЫ';
                    el.className = 'metric-value status-critical';
                } else if (s.detection_probability > 0.4 || ['SEARCH', 'INVESTIGATE'].includes(s.ai_status)) {
                    el.textContent = 'ЖОҒАРЫ';
                    el.className = 'metric-value status-elevated';
                } else {
                    el.textContent = 'ТӨМЕН';
                    el.className = 'metric-value status-low';
                }
            }
        });

        // Detection Bar & Percent
        const bar = document.getElementById('alertBar');
        const pctVal = Math.round(s.detection_probability * 100);
        if (bar) bar.style.width = pctVal + '%';

        const probText = document.getElementById('detectionProb');
        if (probText) probText.textContent = pctVal + '%';

        // Turn Counter
        const turnEl = document.getElementById('turnCounter');
        if (turnEl) turnEl.textContent = s.live ? this._sectorTime() : String(s.turn).padStart(2,'0');

        // Key Inventory Slot
        const keySlot = document.getElementById('invKeySlot');
        if (keySlot) {
            if (s.key_collected) {
                keySlot.classList.add('has-key');
                keySlot.innerHTML = '<svg class="icon"><use href="#i-key"/></svg><span>Кілт табылды</span>';
                keySlot.title = 'Шығаберістің кілті табылды';
            } else {
                keySlot.classList.remove('has-key');
                keySlot.innerHTML = '<svg class="icon"><use href="#i-lock"/></svg><span>Кілт жоқ</span>';
                keySlot.title = 'Кілт әлі табылған жоқ';
            }
        }

        document.getElementById('keyObjective')?.classList.toggle('complete', s.key_collected);
        document.getElementById('exitObjective')?.classList.toggle('complete', s.victory);
        const keyHint = document.getElementById('keyObjectiveHint');
        if (keyHint) keyHint.textContent = s.key_collected ? 'Кілт қолыңда' : this.showFullMap ? 'Картадан алтын кілтті тап' : 'Лабиринтті зертте';
        const exitHint = document.getElementById('exitObjectiveHint');
        if (exitHint) exitHint.textContent = s.victory ? 'Лабиринттен шықтың' : s.key_collected ? 'Порталды ашуға болады' : 'Ашу үшін кілт керек';
        if (bar) bar.style.backgroundColor = isChase ? '#df5c68' : ['SEARCH','INVESTIGATE'].includes(s.ai_status) ? '#bd9649' : '#32b09e';

        // Event Log / Message Toast
        if (s.message) {
            if ((!tactical || s.turn>0) && this._lastMessage !== s.message) this._showToast(s.message);
            this._lastMessage = s.message;
            const eventLog = document.getElementById('gameEventLog');
            if (eventLog) eventLog.textContent = s.message;
        }
    }

    _showToast(msg) {
        let toast = document.getElementById('gameToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'gameToast';
            toast.className = 'game-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.remove('show');
        void toast.offsetWidth;
        toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
    }
}

// ══════════════════════════════════════════════════════════════
//  INITIALIZE ON PAGE LOAD
// ══════════════════════════════════════════════════════════════

window.quietGrid = new QuietGridClient();

window.addEventListener('resize', () => {
    if (window.quietGrid.gameStarted) window.quietGrid._resizeCanvas();
});

function initGame({regenerate=false}={}) {
    const size = parseInt(document.getElementById('gridSize')?.value || 21);
    const hearing = parseInt(document.getElementById('hearingRadius')?.value || 5);
    const vision = parseInt(document.getElementById('visionRadius')?.value || 4);

    window.quietGrid.startGame({
        width: size % 2 === 1 ? size : size + 1,
        height: size % 2 === 1 ? size : size + 1,
        hearing: hearing,
        vision: vision,
        monsterType: document.getElementById('monsterType')?.value || 'hunter',
        mode: document.getElementById('gameMode')?.value || 'sector',
        regenerate,
        missionIndex: window.quietGrid.selectedMission
    });
}

function startSurvivalNow() {
    const gameSection = document.getElementById('game');
    if (gameSection) {
        gameSection.scrollIntoView({ behavior: 'smooth' });
    }
    setTimeout(() => {
        initGame();
    }, 400);
}
