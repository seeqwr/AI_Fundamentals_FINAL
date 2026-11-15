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

            // Floor cells
            const floor = [];
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (grid[y][x] === 0) floor.push([x, y]);
                }
            }

            player = [1, 1];
            // Exit: farthest bottom-right
            floor.sort((a, b) => (b[0] + b[1]) - (a[0] + a[1]));
            exitPos = floor.find(c => c[0] !== player[0] || c[1] !== player[1]) || floor[0];

            // Key: middle region
            const midCells = floor.filter(([x, y]) =>
                x >= Math.floor(w / 4) && x <= Math.floor(3 * w / 4) &&
                y >= Math.floor(h / 4) && y <= Math.floor(3 * h / 4) &&
                !(x === player[0] && y === player[1]) && !(x === exitPos[0] && y === exitPos[1])
            );
            keyPos = midCells.length > 0 ? midCells[Math.floor(Math.random() * midCells.length)] : floor[Math.floor(floor.length / 2)];

            // Monster: far away (min dist = w/2)
            const minDist = Math.floor(Math.max(w, h) / 2);
            const farCells = floor.filter(([x, y]) =>
                (Math.abs(x - player[0]) + Math.abs(y - player[1])) >= minDist &&
                !(x === player[0] && y === player[1]) &&
                !(x === keyPos[0] && y === keyPos[1]) &&
                !(x === exitPos[0] && y === exitPos[1])
            );
            monster = farCells.length > 0 ? farCells[Math.floor(Math.random() * farCells.length)] : [w - 2, h - 2];

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
            stepped_on_noise: false, message: "Лабиринт сгенерирован (CSP). Найдите ключ!",
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

    static astar(grid, w, h, start, goal) {
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
                if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny][nx] !== 1 && !closed.has(nbKey)) {
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

    static processMove(state, direction, target = null) {
        if (state.game_over) return state;
        const deltas = {up: [0,-1], down: [0,1], left: [-1,0], right: [1,0], wait: [0,0]};
        if (direction === 'decoy') {
            if (!Array.isArray(target) || target.length !== 2 || !target.every(Number.isInteger)
                || state.decoys <= 0 || !this.floor(state, target)
                || this.distance(state.player, target) > state.player_vision_radius
                || !this.lineOfSight(state, state.player, target)) throw new Error('Выберите видимую клетку пола.');
        } else if (!Object.hasOwn(deltas, direction)) throw new Error('Неизвестное действие.');
        const s = JSON.parse(JSON.stringify(state));
        s.turn++;
        s.message = null;
        s.last_decoy = null;
        const previous = s.player;
        if (direction === 'decoy') {
            s.decoys--;
            s.last_decoy = target;
            s.message = 'Колба разбилась. Акустическая приманка активирована!';
        } else {
            const [dx, dy] = deltas[direction];
            const next = [s.player[0] + dx, s.player[1] + dy];
            if (this.floor(s, next)) s.player = next;
        }
        const moved = !this.same(previous, s.player);
        s.stepped_on_noise = moved && s.grid[s.player[1]][s.player[0]] === 2;
        if (s.stepped_on_noise) s.message = 'Шумная клетка! Осколки загремели под ногами!';
        if (this.same(s.player, s.monster)) return this.caught(s);
        if (this.same(s.player, s.key_pos) && !s.key_collected) {
            s.key_collected = true;
            s.message = 'Ключ найден! Бегите к выходу!';
        }
        if (this.same(s.player, s.exit_pos)) {
            if (s.key_collected) {
                s.victory = s.game_over = true;
                s.message = 'YOU SURVIVED! Вы выбрались из сетки!';
                return s;
            }
            s.message = 'Выход заперт! Сначала найдите ключ!';
        }
        const source = direction === 'decoy' ? target : moved ? s.player : null;
        const range = s.hearing_radius * (direction === 'decoy' || s.stepped_on_noise ? 2 : 1);
        const heard = source && this.distance(s.monster, source) <= range;
        this.updateBelief(s, heard ? source : null, direction === 'decoy');
        const visible = s.vision_radius > 0 && this.distance(s.monster, s.player) <= s.vision_radius
            && this.lineOfSight(s, s.monster, s.player);
        if (visible) {
            if (s.last_seen && s.last_seen_turn === s.turn - 1) {
                const v = [s.player[0] - s.last_seen[0], s.player[1] - s.last_seen[1]];
                s.observed_velocity = Math.abs(v[0]) + Math.abs(v[1]) <= 1 ? v : [0, 0];
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
                if (!this.floor(s, next)) break;
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
        s.message = 'GAME OVER — Монстр настиг вас в темноте.';
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

        this.minimapCanvas = document.getElementById('minimapCanvas');
        this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

        this.soundCanvas = document.getElementById('soundCanvas');
        this.soundCtx = this.soundCanvas ? this.soundCanvas.getContext('2d') : null;

        this.state = null;
        this.isServerMode = false;
        this.serverUrl = location.protocol.startsWith('http') ? '' : 'http://localhost:5000';
        this.explored = new Set();
        this.isLoading = false;
        this.gameStarted = false;

        this.playerSmooth = { x: 0, y: 0 };
        this.monsterSmooth = { x: 0, y: 0 };
        this.animFrame = 0;
        this.screenShake = 0;
        this.flashColor = null;
        this.flashAlpha = 0;

        this.targetingDecoy = false;
        this.hoverCell = null;
        this.particles = [];
        this.decoyPulse = null;
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.stressLevel = 0.05;
        this.stressPhase = 0;
        this.stressLine = document.querySelector('#stressGraph .stress-line');
        this._setupInput();
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
                    if (state.belief && Number.isInteger(state.decoys)) {
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
        this.isLoading = true;
        clearTimeout(this._endTimer);
        const monsterType = opts.monsterType || 'hunter';
        const w = opts.width || 21;
        const h = opts.height || 21;
        const hr = opts.hearing || 5;
        const vr = opts.vision || 4;

        this.isServerMode = await this.testServer();
        this._updateEngineBadge();

        if (this.isServerMode) {
            try {
                const url = `${this.serverUrl}/start_game?width=${w}&height=${h}&hearing_radius=${hr}&vision_radius=${vr}&monster_type=${encodeURIComponent(monsterType)}`;
                const resp = await fetch(url, {signal: AbortSignal.timeout(4000)});
                if (!resp.ok) throw new Error('Не удалось создать игру');
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

        this.targetingDecoy = false;
        this.hoverCell = null;
        this.particles = [];
        this.decoyPulse = null;
        this.stressLevel = 0.05;
        this.stressPhase = 0;
        this.explored = new Set();
        this._updateExplored();
        this.playerSmooth = { x: this.state.player[0], y: this.state.player[1] };
        this.monsterSmooth = { x: this.state.monster[0], y: this.state.monster[1] };
        this.gameStarted = true;
        this.flashColor = null;
        this.flashAlpha = 0;
        this.screenShake = 0;

        // Hide overlay and game over
        const overlay = document.getElementById('canvasOverlay');
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.pointerEvents = 'none';
        }
        const go = document.getElementById('gameOverOverlay');
        if (go) go.classList.remove('active');

        this._updateUI();
        this._resizeCanvas();
        this.isLoading = false;
    }

    async sendMove(direction, target = null) {
        if (!this.gameStarted || this.isLoading || this.state?.game_over) return;
        this.isLoading = true;
        const prev = this.state;
        try {
            if (this.isServerMode) {
                const resp = await fetch(`${this.serverUrl}/move`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ direction, target }), signal: AbortSignal.timeout(4000)
                });
                const result = await resp.json();
                if (!resp.ok) throw new Error(result.error || 'Действие отклонено');
                this.state = result;
            } else {
                this.state = ClientAIEngine.processMove(this.state, direction, target);
            }
            this.targetingDecoy = false;
            this._updateExplored();
            this._animateTransition(prev);
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
                    this._updateUI();
                    if (this.state.game_over) this._onGameEnd();
                    this._showToast('Связь восстановлена. Состояние игры обновлено.');
                } catch {
                    this.isServerMode = false;
                    this._updateEngineBadge();
                    this._showToast('Связь потеряна. Продолжение в браузере с последнего подтверждённого хода; повторите действие.');
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
            ? 'Выберите подсвеченную клетку. Esc / E — отмена.'
            : 'E или колба → клик по видимой клетке. Бросок занимает ход.';
        this.canvas.classList.toggle('targeting', this.targetingDecoy);
    }

    _pointerCell(event) {
        const rect = this.canvas.getBoundingClientRect();
        const cell = Math.min(this.dispW / this.state.width, this.dispH / this.state.height);
        const offX = (this.dispW - this.state.width * cell) / 2;
        const offY = (this.dispH - this.state.height * cell) / 2;
        return [Math.floor(((event.clientX - rect.left) * this.dispW / rect.width - offX) / cell),
                Math.floor(((event.clientY - rect.top) * this.dispH / rect.height - offY) / cell)];
    }

    _updateEngineBadge() {
        const badge = document.getElementById('engineBadge');
        if (badge) {
            if (this.isServerMode) {
                badge.textContent = "● PYTHON SERVER (PORT 5000)";
                badge.className = "engine-badge badge-python";
            } else {
                badge.textContent = "● BROWSER AI ENGINE (CSP/HMM/A*)";
                badge.className = "engine-badge badge-client";
            }
        }
    }

    _setupInput() {
        document.addEventListener('keydown', (e) => {
            if (!this.gameStarted) return;
            if (e.code === 'Escape') { this.targetingDecoy = false; this._updateDecoyUI(); return; }
            if (e.target.closest('input, select, textarea, [contenteditable]')) return;
            if (e.code === 'KeyE' && !e.repeat) { e.preventDefault(); this.toggleDecoy(); return; }
            const keyMap = {
                'KeyW': 'up', 'ArrowUp': 'up',
                'KeyS': 'down', 'ArrowDown': 'down',
                'KeyA': 'left', 'ArrowLeft': 'left',
                'KeyD': 'right', 'ArrowRight': 'right',
                'Space': 'wait'
            };
            if (e.code === 'Space' && e.target.closest('button')) return;
            const dir = keyMap[e.code];
            if (dir) {
                e.preventDefault();
                if (!this.targetingDecoy) this.sendMove(dir);
            }
        });
        document.getElementById('invDecoySlot')?.addEventListener('click', () => this.toggleDecoy());
        this.canvas.addEventListener('pointermove', event => {
            if (this.state) this.hoverCell = this._pointerCell(event);
        });
        this.canvas.addEventListener('pointerleave', () => { this.hoverCell = null; });
        this.canvas.addEventListener('click', event => {
            if (!this.targetingDecoy || !this.state) return;
            const target = this._pointerCell(event);
            if (ClientAIEngine.floor(this.state, target) && this._visibility(...target) === 2) {
                this.sendMove('decoy', target);
            } else this._showToast('Бросать можно только на видимый пол, в пределах света фонарика.');
        });
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

    _animateTransition(prev) {
        if (!this.reducedMotion && !ClientAIEngine.same(prev.player, this.state.player)) {
            for (let i = 0; i < 12; i++) this.particles.push({
                x: prev.player[0] + 0.5, y: prev.player[1] + 0.5,
                vx: (Math.random() - 0.5) * 0.012, vy: -0.004 - Math.random() * 0.01,
                life: 1, radius: 0.03 + Math.random() * 0.06
            });
            this.particles = this.particles.slice(-96);
        }
        if (this.state.last_decoy) this.decoyPulse = {pos: this.state.last_decoy, life: 1};
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
        this._endTimer = setTimeout(() => {
            const overlay = document.getElementById('gameOverOverlay');
            if (!overlay) return;
            overlay.classList.add('active');
            const title = document.getElementById('gameOverTitle');
            const sub = document.getElementById('gameOverSub');
            if (this.state.victory) {
                overlay.className = 'game-over-overlay active victory';
                if (title) title.textContent = 'YOU SURVIVED';
                if (sub) sub.textContent = `Вы выбрались из Сетки за ${this.state.turn} ходов!`;
            } else {
                overlay.className = 'game-over-overlay active defeat';
                if (title) title.textContent = 'GAME OVER';
                if (sub) sub.textContent = 'Монстр настиг вас в лабиринте.';
            }
        }, 500);
    }

    _tick(now = performance.now()) {
        this.deltaTime = Math.min((now - (this.lastFrameTime ?? now)) / 1000, 0.05);
        this.lastFrameTime = now;
        if (!this.reducedMotion && !this.state?.game_over) this.animFrame += this.deltaTime * 60;
        if (this.state) {
            this._lerpEntities();
            this._render();
            this._renderMinimap();
            this._renderSoundScanner();
            this._renderStress();
        }
        requestAnimationFrame(this._tick);
    }

    _lerpEntities() {
        const speed = this.reducedMotion ? 1 : 1 - Math.exp(-20 * this.deltaTime);
        this.playerSmooth.x += (this.state.player[0] - this.playerSmooth.x) * speed;
        this.playerSmooth.y += (this.state.player[1] - this.playerSmooth.y) * speed;
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
        const h = Math.min(rect.width * 0.75, 540);

        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.dispW = w;
        this.dispH = h;
    }

    _render() {
        const ctx = this.ctx;
        const gw = this.state.width;
        const gh = this.state.height;

        if (!this.dispW) this._resizeCanvas();

        const cellW = this.dispW / gw;
        const cellH = this.dispH / gh;
        const cell = Math.min(cellW, cellH);
        const offX = (this.dispW - gw * cell) / 2;
        const offY = (this.dispH - gh * cell) / 2;

        ctx.save();

        // Screen Shake
        if (this.screenShake > 0.4) {
            const sx = (Math.random() - 0.5) * this.screenShake;
            const sy = (Math.random() - 0.5) * this.screenShake;
            ctx.translate(sx, sy);
        }

        // Background
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, this.dispW, this.dispH);

        // Grid Cells & Fog of War
        for (let y = 0; y < gh; y++) {
            for (let x = 0; x < gw; x++) {
                const vis = this._visibility(x, y);
                if (vis === 0) continue; // Pure Fog

                const px = offX + x * cell;
                const py = offY + y * cell;
                const tile = this.state.grid[y][x];
                const isDim = (vis === 1);

                if (tile === 1) {
                    // Wall
                    ctx.fillStyle = isDim ? '#121212' : '#1c1c1c';
                    ctx.fillRect(px, py, cell, cell);
                    ctx.fillStyle = isDim ? '#171717' : '#272727';
                    ctx.fillRect(px, py, cell, cell * 0.35);
                } else if (tile === 2) {
                    // Noisy Tile (Glass / Grating)
                    ctx.fillStyle = isDim ? '#15120e' : '#241a10';
                    ctx.fillRect(px, py, cell, cell);
                    ctx.strokeStyle = isDim ? 'rgba(255,170,0,0.1)' : 'rgba(255,170,0,0.4)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px + 2, py + 2, cell - 4, cell - 4);

                    // Cross hatching
                    ctx.beginPath();
                    ctx.moveTo(px + 3, py + 3);
                    ctx.lineTo(px + cell - 3, py + cell - 3);
                    ctx.moveTo(px + cell - 3, py + 3);
                    ctx.lineTo(px + 3, py + cell - 3);
                    ctx.stroke();
                } else {
                    // Normal Floor
                    ctx.fillStyle = isDim ? '#090909' : '#111111';
                    ctx.fillRect(px, py, cell, cell);
                    ctx.strokeStyle = 'rgba(0, 255, 65, 0.04)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(px, py, cell, cell);
                }

                // Dim overlay for remembered cells
                if (isDim) {
                    ctx.fillStyle = 'rgba(5, 5, 5, 0.75)';
                    ctx.fillRect(px, py, cell, cell);
                }
            }
        }

        // Educational overlay: full posterior, scaled relative to its current peak.
        if (document.getElementById('heatmapToggle')?.checked && this.state.belief_top?.length) {
            const peak = Math.max(...this.state.belief_top.map(c => c[2]), 0.0001);
            for (const [bx, by, prob] of this.state.belief_top) {
                if (prob <= 0) continue;
                const px = offX + bx * cell, py = offY + by * cell;
                const gradient = ctx.createRadialGradient(px + cell/2, py + cell/2, 0, px + cell/2, py + cell/2, cell * 0.7);
                gradient.addColorStop(0, `rgba(255, 45, 60, ${0.6 * Math.sqrt(prob / peak)})`);
                gradient.addColorStop(1, 'rgba(255, 30, 30, 0)');
                ctx.fillStyle = gradient;
                ctx.fillRect(px, py, cell, cell);
            }
        }
        if (this.targetingDecoy) {
            for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
                if (this.state.grid[y][x] === 1 || this._visibility(x, y) !== 2) continue;
                const hovered = ClientAIEngine.same(this.hoverCell, [x, y]);
                ctx.fillStyle = hovered ? 'rgba(0,220,255,0.3)' : 'rgba(0,220,255,0.08)';
                ctx.fillRect(offX + x*cell + 1, offY + y*cell + 1, cell-2, cell-2);
                ctx.strokeStyle = hovered ? '#fff' : 'rgba(0,220,255,0.5)';
                ctx.strokeRect(offX + x*cell + 1, offY + y*cell + 1, cell-2, cell-2);
            }
        }

        // Key (Yellow Diamond)
        if (!this.state.key_collected) {
            const [kx, ky] = this.state.key_pos;
            const kv = this._visibility(kx, ky);
            if (kv > 0) {
                const cx = offX + kx * cell + cell / 2;
                const cy = offY + ky * cell + cell / 2;
                const pulse = Math.sin(this.animFrame * 0.1) * 0.3 + 0.7;

                ctx.save();
                ctx.globalAlpha = kv === 1 ? 0.35 : 1.0;
                ctx.shadowColor = '#ffcc00';
                ctx.shadowBlur = 14 * pulse;
                ctx.fillStyle = '#ffcc00';

                ctx.beginPath();
                const ks = cell * 0.32;
                ctx.moveTo(cx, cy - ks);
                ctx.lineTo(cx + ks, cy);
                ctx.lineTo(cx, cy + ks);
                ctx.lineTo(cx - ks, cy);
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = '#000';
                ctx.font = `bold ${Math.floor(cell * 0.32)}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🔑', cx, cy);
                ctx.restore();
            }
        }

        // Exit Portal (Blue)
        {
            const [ex, ey] = this.state.exit_pos;
            const ev = this._visibility(ex, ey);
            if (ev > 0) {
                const px = offX + ex * cell;
                const py = offY + ey * cell;
                const isUnlocked = this.state.key_collected;

                ctx.save();
                ctx.globalAlpha = ev === 1 ? 0.35 : 1.0;
                ctx.fillStyle = isUnlocked ? 'rgba(0, 136, 255, 0.35)' : 'rgba(50, 50, 70, 0.4)';
                ctx.fillRect(px + 2, py + 2, cell - 4, cell - 4);

                ctx.strokeStyle = isUnlocked ? '#0088ff' : '#444455';
                ctx.lineWidth = 2;
                if (isUnlocked) {
                    ctx.shadowColor = '#0088ff';
                    ctx.shadowBlur = 12;
                }
                ctx.strokeRect(px + 2, py + 2, cell - 4, cell - 4);

                ctx.fillStyle = isUnlocked ? '#00e5ff' : '#666';
                ctx.font = `${Math.floor(cell * 0.42)}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(isUnlocked ? '🚪' : '🔒', px + cell / 2, py + cell / 2);
                ctx.restore();
            }
        }

        // Monster (Red Entity + Vision Cone)
        {
            const mx = Math.round(this.monsterSmooth.x);
            const my = Math.round(this.monsterSmooth.y);
            const mv = this._visibility(mx, my);

            if (mv === 2 && this._visibility(...this.state.monster) === 2) {
                const cx = offX + this.monsterSmooth.x * cell + cell / 2;
                const cy = offY + this.monsterSmooth.y * cell + cell / 2;
                const pulse = Math.sin(this.animFrame * 0.15) * 0.2 + 0.8;

                ctx.save();
                ctx.globalAlpha = mv === 1 ? 0.35 : 1.0;

                // Only show the monster's actual visible tiles, clipped to player sight.
                ctx.fillStyle = 'rgba(255, 30, 30, 0.08)';
                for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
                    if (this._visibility(x, y) === 2 && this.state.vision_radius > 0
                        && ClientAIEngine.distance(this.state.monster, [x,y]) <= this.state.vision_radius
                        && ClientAIEngine.lineOfSight(this.state, this.state.monster, [x,y])) {
                        ctx.fillRect(offX + x*cell, offY + y*cell, cell, cell);
                    }
                }

                // Monster Body
                const monsterColor = {hunter: '#ff1e1e', stalker: '#ba88ff', brute: '#ffaa44'}[this.state.monster_type];
                ctx.shadowColor = monsterColor;
                ctx.shadowBlur = 18 * pulse;
                ctx.fillStyle = monsterColor;
                ctx.beginPath();
                ctx.arc(cx, cy, cell * 0.34, 0, Math.PI * 2);
                ctx.fill();

                // Inner Eye
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(cx, cy, cell * (this.state.monster_type === 'brute' ? 0.06 : 0.14), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // Player (Green Cyberpunk Avatar)
        {
            const cx = offX + this.playerSmooth.x * cell + cell / 2;
            const cy = offY + this.playerSmooth.y * cell + cell / 2;

            // Light Cone radial glow
            const lightRad = (3.2 + Math.sin(this.animFrame * 0.045) * 0.18) * cell;
            ctx.save();
            this._clipVisible(ctx, offX, offY, cell);
            const grad = ctx.createRadialGradient(cx, cy, cell * 0.2, cx, cy, lightRad);
            grad.addColorStop(0, 'rgba(0, 255, 65, 0.12)');
            grad.addColorStop(0.7, 'rgba(0, 255, 65, 0.03)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(cx - lightRad, cy - lightRad, lightRad * 2, lightRad * 2);

            ctx.restore();

            // Player Dot
            ctx.save();
            ctx.shadowColor = '#00ff41';
            ctx.shadowBlur = 14;
            ctx.fillStyle = '#00ff41';
            ctx.beginPath();
            ctx.arc(cx, cy, cell * 0.32, 0, Math.PI * 2);
            ctx.fill();

            // Core
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, cy, cell * 0.12, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.save();
        this._clipVisible(ctx, offX, offY, cell);
        for (const particle of this.particles) {
            particle.life -= this.deltaTime * 0.8;
            particle.x += particle.vx * this.deltaTime * 60;
            particle.y += particle.vy * this.deltaTime * 60;
            ctx.fillStyle = `rgba(180, 210, 190, ${Math.max(0, particle.life) * 0.35})`;
            ctx.beginPath();
            ctx.arc(offX + particle.x * cell, offY + particle.y * cell, particle.radius * cell, 0, Math.PI * 2);
            ctx.fill();
        }
        this.particles = this.particles.filter(p => p.life > 0);
        if (this.decoyPulse) {
            const pulse = this.decoyPulse;
            pulse.life -= this.deltaTime * 0.7;
            const radius = this.reducedMotion ? cell * 0.4 : cell * (0.2 + (1 - pulse.life) * 2.5);
            ctx.strokeStyle = `rgba(0, 220, 255, ${Math.max(0, pulse.life)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(offX + (pulse.pos[0] + 0.5) * cell, offY + (pulse.pos[1] + 0.5) * cell, radius, 0, Math.PI*2);
            ctx.stroke();
            if (pulse.life <= 0) this.decoyPulse = null;
        }
        ctx.restore();

        // Screamer / Jumpscare Flash
        if (this.flashColor && this.flashAlpha > 0.01) {
            ctx.fillStyle = this.flashColor + this.flashAlpha + ')';
            ctx.fillRect(0, 0, this.dispW, this.dispH);
        }

        ctx.restore();
    }

    _clipVisible(ctx, offX, offY, cell) {
        ctx.beginPath();
        for (let y = 0; y < this.state.height; y++) for (let x = 0; x < this.state.width; x++) {
            if (this._visibility(x, y) === 2) ctx.rect(offX + x * cell, offY + y * cell, cell, cell);
        }
        ctx.clip();
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
        const color = this.stressLevel > 0.65 ? '#ff4040' : this.stressLevel > 0.3 ? '#ffaa00' : '#00ff41';
        this.stressLine.style.stroke = color;
        this.stressLine.style.filter = `drop-shadow(0 0 4px ${color})`;
        const graph = document.getElementById('stressGraph');
        graph.setAttribute('aria-label', `Когнитивный стресс: ${Math.round(target * 100)}%`);
    }

    _renderMinimap() {
        if (!this.minimapCtx || !this.state) return;
        const mctx = this.minimapCtx;
        const mw = this.minimapCanvas.width;
        const mh = this.minimapCanvas.height;
        const gw = this.state.width;
        const gh = this.state.height;
        const cw = mw / gw;
        const ch = mh / gh;

        mctx.fillStyle = '#060606';
        mctx.fillRect(0, 0, mw, mh);

        for (let y = 0; y < gh; y++) {
            for (let x = 0; x < gw; x++) {
                if (this.explored.has(`${x},${y}`)) {
                    const tile = this.state.grid[y][x];
                    mctx.fillStyle = tile === 1 ? '#222' : '#0e1a12';
                    mctx.fillRect(x * cw, y * ch, cw, ch);
                }
            }
        }

        // Key on minimap
        if (!this.state.key_collected && this.explored.has(`${this.state.key_pos[0]},${this.state.key_pos[1]}`)) {
            mctx.fillStyle = '#ffcc00';
            mctx.fillRect(this.state.key_pos[0] * cw, this.state.key_pos[1] * ch, cw * 1.5, ch * 1.5);
        }

        // Exit on minimap
        if (this.explored.has(`${this.state.exit_pos[0]},${this.state.exit_pos[1]}`)) {
            mctx.fillStyle = '#0088ff';
            mctx.fillRect(this.state.exit_pos[0] * cw, this.state.exit_pos[1] * ch, cw * 1.5, ch * 1.5);
        }

        // Player on minimap
        mctx.fillStyle = '#00ff41';
        mctx.beginPath();
        mctx.arc((this.state.player[0] + 0.5) * cw, (this.state.player[1] + 0.5) * ch, cw * 1.2, 0, Math.PI * 2);
        mctx.fill();

        // Monster on minimap if in vision
        if (this._visibility(this.state.monster[0], this.state.monster[1]) === 2) {
            mctx.fillStyle = '#ff1e1e';
            mctx.beginPath();
            mctx.arc((this.state.monster[0] + 0.5) * cw, (this.state.monster[1] + 0.5) * ch, cw * 1.2, 0, Math.PI * 2);
            mctx.fill();
        }
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

        // Status Indicator
        const dot = document.querySelector('#aiStatus .status-dot');
        const text = document.getElementById('aiStatusText');
        const modeBadge = document.getElementById('aiStatusMode');
        const isChase = ['CHASE', 'STALK'].includes(s.ai_status);
        const modes = {PATROL: 'ПАТРУЛЬ · HMM', CHASE: 'ПОГОНЯ · A*', STALK: 'ПЕРЕХВАТ · A*', INVESTIGATE: 'НА ЗВУК · HMM', SEARCH: 'ПОИСК · A*'};

        if (dot) dot.className = `status-dot ${isChase ? 'chase' : 'patrol'}`;
        if (text) {
            text.textContent = modes[s.ai_status];
            text.style.color = isChase ? '#ff1e1e' : '#00ff41';
        }
        if (modeBadge) {
            modeBadge.textContent = s.ai_status;
            modeBadge.className = isChase ? 'mode-pill chase' : 'mode-pill patrol';
        }

        this._updateDecoyUI();
        const details = document.getElementById('monsterDetails');
        const names = {hunter: 'Охотник', stalker: 'Сталкер', brute: 'Слепой брут'};
        if (details) details.textContent = `${names[s.monster_type]} · слух ${s.hearing_radius} · зрение ${s.vision_radius}`;
        const peak = s.belief_top?.[0];
        const legend = document.getElementById('beliefLegend');
        if (legend && peak) legend.textContent = `Пик HMM: (${peak[0]}, ${peak[1]}) · ${(peak[2] * 100).toFixed(1)}%. Яркость относительно пика; режим демонстрации раскрывает распределение во всём лабиринте.`;

        // Alert Level
        ['alertLevel', 'alertLevelRight'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (isChase) {
                    el.textContent = 'CRITICAL';
                    el.className = 'metric-value status-critical';
                } else if (s.detection_probability > 0.4 || ['SEARCH', 'INVESTIGATE'].includes(s.ai_status)) {
                    el.textContent = 'ELEVATED';
                    el.className = 'metric-value status-elevated';
                } else {
                    el.textContent = 'LOW';
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
        if (turnEl) turnEl.textContent = s.turn;

        // Key Inventory Slot
        const keySlot = document.getElementById('invKeySlot');
        if (keySlot) {
            if (s.key_collected) {
                keySlot.classList.add('has-key');
                keySlot.innerHTML = '🔑 <span class="slot-tag">KEY</span>';
            } else {
                keySlot.classList.remove('has-key');
                keySlot.innerHTML = '<span class="slot-empty">🔒</span>';
            }
        }

        // Event Log / Message Toast
        if (s.message) {
            this._showToast(s.message);
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

function initGame() {
    const size = parseInt(document.getElementById('gridSize')?.value || 21);
    const hearing = parseInt(document.getElementById('hearingRadius')?.value || 5);
    const vision = parseInt(document.getElementById('visionRadius')?.value || 4);

    window.quietGrid.startGame({
        width: size % 2 === 1 ? size : size + 1,
        height: size % 2 === 1 ? size : size + 1,
        hearing: hearing,
        vision: vision,
        monsterType: document.getElementById('monsterType')?.value || 'hunter'
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
