"""
══════════════════════════════════════════════════════════════════
  THE QUIET GRID — Standalone Backend Server
  AI Fundamentals Final Project · QAIRU 2026
  
  Algorithms:
    • CSP  (Week 3) — Level generation with constraint satisfaction
    • HMM  (Week 7) — Monster hearing / patrol via Hidden Markov Models
    • A*   (Week 2) — Monster pursuit via A-Star pathfinding
    
  No third-party packages required! Uses Python standard library.
══════════════════════════════════════════════════════════════════
"""

import http.server
import json
import urllib.parse
import os
import random
import heapq
from collections import deque
import mimetypes

# ═══════════════════════════════════════════════════════════════
#  GAME STATE & ALGORITHMS
# ═══════════════════════════════════════════════════════════════

class GameState:
    """Holds grid, entities, and all AI state for one game session."""

    FLOOR = 0
    WALL  = 1
    NOISE = 2  # Noisy tile (broken glass / metallic grating)

    def __init__(self, width=21, height=21, hearing_radius=5, vision_radius=4, monster_type="hunter"):
        # Odd dimensions required for maze carver
        self.width  = width if width % 2 == 1 else width - 1
        self.height = height if height % 2 == 1 else height - 1
        self.monster_type = monster_type if monster_type in ("hunter", "stalker", "brute") else "hunter"
        self.hearing_radius = hearing_radius + (4 if self.monster_type == "brute" else 0)
        self.vision_radius = 0 if self.monster_type == "brute" else vision_radius
        self.player_vision_radius = 3
        self.decoys = 3
        self.last_decoy = None
        self.ai_target = None
        self.last_seen = None
        self.observed_velocity = (0, 0)
        self.last_seen_turn = -1

        self.turn = 0
        self.key_collected = False
        self.game_over = False
        self.victory = False
        self.ai_status = "PATROL"  # PATROL (HMM) | CHASE (A*)
        self.detection_probability = 0.05
        self.message = "Сетка инициализирована. Найдите ключ и доберитесь до выхода."
        self.chase_cooldown = 0
        self.stepped_on_noise = False

        # CSP Level Generation
        self._generate_level()

        # HMM Initialization
        self._init_hmm()

    # ───────────────────────────────────────────────────────────
    #  CSP — LEVEL GENERATION (Week 3)
    # ───────────────────────────────────────────────────────────
    def _generate_level(self):
        """Build random maze enforcing Constraint Satisfaction:
           C1: start -> key path exists
           C2: key -> exit path exists
           C3: start -> exit path exists
           C4: monster spawns far from player
           C5: all entities placed on valid floor tiles
        """
        min_monster_dist = max(self.width, self.height) // 2

        for attempt in range(100):
            self.grid = self._carve_maze()
            self._open_passages()
            floor = self._floor_cells()

            self.player = (1, 1)
            self.exit_pos = self._find_corner_cell(floor, bottom_right=True)

            mid = [(x, y) for x, y in floor
                   if self.height // 4 <= y <= 3 * self.height // 4
                   and self.width // 4 <= x <= 3 * self.width // 4
                   and (x, y) not in (self.player, self.exit_pos)]
            if not mid:
                mid = [c for c in floor if c not in (self.player, self.exit_pos)]
            self.key_pos = random.choice(mid)

            far = [c for c in floor
                   if self._manhattan(c, self.player) >= min_monster_dist
                   and c not in (self.player, self.exit_pos, self.key_pos)]
            if not far:
                far = sorted([c for c in floor if c not in (self.player, self.exit_pos, self.key_pos)],
                             key=lambda c: -self._manhattan(c, self.player))[:10]
            self.monster = random.choice(far) if far else (self.width - 2, self.height - 2)

            # CSP Check: Verify paths exist
            if (self._bfs_reachable(self.player, self.key_pos) and
                self._bfs_reachable(self.key_pos, self.exit_pos) and
                self._bfs_reachable(self.player, self.exit_pos)):
                break

        self._scatter_noise()

    def _carve_maze(self):
        g = [[self.WALL] * self.width for _ in range(self.height)]
        g[1][1] = self.FLOOR
        stack = [(1, 1)]
        visited = {(1, 1)}

        while stack:
            x, y = stack[-1]
            nbrs = []
            for dx, dy in ((0, -2), (0, 2), (-2, 0), (2, 0)):
                nx, ny = x + dx, y + dy
                if 1 <= nx < self.width - 1 and 1 <= ny < self.height - 1 and (nx, ny) not in visited:
                    nbrs.append((nx, ny, dx, dy))
            if nbrs:
                nx, ny, dx, dy = random.choice(nbrs)
                g[y + dy // 2][x + dx // 2] = self.FLOOR
                g[ny][nx] = self.FLOOR
                visited.add((nx, ny))
                stack.append((nx, ny))
            else:
                stack.pop()
        return g

    def _open_passages(self):
        """Open loops in the maze for stealth gameplay maneuvers."""
        for _ in range((self.width * self.height) // 7):
            x = random.randint(2, self.width - 3)
            y = random.randint(2, self.height - 3)
            if self.grid[y][x] == self.WALL:
                adj = sum(1 for dx, dy in ((0,1),(0,-1),(1,0),(-1,0))
                          if self.grid[y+dy][x+dx] != self.WALL)
                if adj >= 2:
                    self.grid[y][x] = self.FLOOR

    def _scatter_noise(self):
        reserved = {self.player, self.exit_pos, self.key_pos, self.monster}
        candidates = [c for c in self._floor_cells() if c not in reserved]
        count = max(5, len(candidates) // 6)
        for x, y in random.sample(candidates, min(count, len(candidates))):
            self.grid[y][x] = self.NOISE

    def _find_corner_cell(self, floor, bottom_right=True):
        cells = sorted(floor, key=lambda c: (c[0] + c[1]) * (1 if bottom_right else -1), reverse=True)
        for c in cells:
            if c != self.player:
                return c
        return floor[-1]

    def _floor_cells(self):
        return [(x, y) for y in range(self.height) for x in range(self.width) if self.grid[y][x] != self.WALL]

    def _bfs_reachable(self, start, goal):
        if start == goal:
            return True
        q = deque([start])
        seen = {start}
        while q:
            x, y = q.popleft()
            for dx, dy in ((0,1),(0,-1),(1,0),(-1,0)):
                n = (x+dx, y+dy)
                if (0 <= n[0] < self.width and 0 <= n[1] < self.height
                        and self.grid[n[1]][n[0]] != self.WALL
                        and n not in seen):
                    if n == goal:
                        return True
                    seen.add(n)
                    q.append(n)
        return False

    @staticmethod
    def _manhattan(a, b):
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    def line_of_sight(self, start, end):
        """Bresenham ray; endpoint walls are visible, but block cells behind them.

        Check both side cells on diagonal steps to prevent corner peeking.
        Canonical endpoint ordering keeps visibility symmetric.
        """
        if not all(0 <= x < self.width and 0 <= y < self.height for x, y in (start, end)):
            return False
        origin, target = start, end
        if start > end:
            start, end = end, start
        x, y = start
        dx, dy = abs(end[0] - x), -abs(end[1] - y)
        sx, sy = (1 if x < end[0] else -1), (1 if y < end[1] else -1)
        err = dx + dy
        while True:
            if (x, y) not in (origin, target) and self.grid[y][x] == self.WALL:
                return False
            if (x, y) == end:
                return True
            e2 = 2 * err
            nx, ny = x, y
            if e2 >= dy:
                err += dy
                nx += sx
            if e2 <= dx:
                err += dx
                ny += sy
            if nx != x and ny != y and (self.grid[y][nx] == self.WALL or self.grid[ny][x] == self.WALL):
                return False
            x, y = nx, ny

    def _can_see_player(self):
        return (self.vision_radius > 0
                and self._manhattan(self.monster, self.player) <= self.vision_radius
                and self.line_of_sight(self.monster, self.player))

    # ───────────────────────────────────────────────────────────
    #  A* — PURSUIT PATHFINDING (Week 2)
    # ───────────────────────────────────────────────────────────
    def astar(self, start, goal):
        """A* algorithm finding optimal path from start to goal."""
        if start == goal:
            return []
        open_set = [(self._manhattan(start, goal), 0, start)]
        came_from = {}
        g_score = {start: 0}
        closed = set()

        while open_set:
            _, g, cur = heapq.heappop(open_set)
            if cur == goal:
                path = []
                while cur in came_from:
                    path.append(cur)
                    cur = came_from[cur]
                path.reverse()
                return path

            if cur in closed:
                continue
            closed.add(cur)

            cx, cy = cur
            for dx, dy in ((0,1),(0,-1),(1,0),(-1,0)):
                nb = (cx+dx, cy+dy)
                if (0 <= nb[0] < self.width and 0 <= nb[1] < self.height
                        and self.grid[nb[1]][nb[0]] != self.WALL
                        and nb not in closed):
                    tg = g_score[cur] + 1
                    if tg < g_score.get(nb, float("inf")):
                        came_from[nb] = cur
                        g_score[nb] = tg
                        heapq.heappush(open_set, (tg + self._manhattan(nb, goal), tg, nb))
        return []

    # ───────────────────────────────────────────────────────────
    #  HMM — MONSTER ACOUSTIC SENSING (Week 7)
    # ───────────────────────────────────────────────────────────
    def _init_hmm(self):
        cells = self._floor_cells()
        n = len(cells) if cells else 1
        self.floor_set = set(cells)
        self.belief = {c: 1.0 / n for c in cells}

    def _hmm_update(self, sound_source=None, decoy=False):
        """HMM forward filter: random walk, acoustic observation, normalization.

        Quiet observations depend on the listener's position, never on the
        hidden player coordinate. A localized sound is a noisy sensor reading.
        """
        predicted = {c: 0.0 for c in self.belief}
        for (x, y), probability in self.belief.items():
            destinations = [c for c in ((x, y), (x, y+1), (x, y-1), (x+1, y), (x-1, y))
                            if c in self.floor_set]
            for cell in destinations:
                predicted[cell] += probability / len(destinations)
        for cell in predicted:
            if sound_source is not None:
                distance = self._manhattan(cell, sound_source)
                # Sensor-reset mixture lets strong new evidence overcome stale belief.
                prior = 1.0 / len(predicted) if decoy else 0.2 * predicted[cell] + 0.8 / len(predicted)
                predicted[cell] = prior * (0.18 ** distance)
            else:
                predicted[cell] *= 0.4 if self._manhattan(cell, self.monster) <= self.hearing_radius else 1.0
        total = sum(predicted.values())
        self.belief = {c: p / total for c, p in predicted.items()}
        self._update_detection()

    def _update_detection(self):
        # Ground-truth evaluation metric only: this never selects the AI's target.
        local = sum(p for c, p in self.belief.items() if self._manhattan(c, self.player) <= 1)
        self.detection_probability = min(1.0, max(0.05, local))

    def _hmm_target(self):
        """Target with maximum posterior probability."""
        if not self.belief:
            return self.monster
        return min(self.belief, key=lambda c: (-self.belief[c], c[1], c[0]))

    def _belief_top(self, n=20):
        top = sorted(self.belief.items(), key=lambda kv: -kv[1])[:n]
        return [[c[0], c[1], round(p, 4)] for c, p in top]

    # ───────────────────────────────────────────────────────────
    #  TURN-BASED GAME LOOP
    # ───────────────────────────────────────────────────────────
    def process_move(self, direction="wait", target=None):
        if self.game_over:
            return self.to_dict()
        directions = {"up": (0,-1), "down": (0,1), "left": (-1,0), "right": (1,0), "wait": (0,0)}
        if direction == "decoy":
            if (not isinstance(target, (list, tuple)) or len(target) != 2
                    or any(type(v) is not int for v in target)):
                raise ValueError("Invalid decoy target")
            target = tuple(target)
            if (self.decoys <= 0 or target not in self.floor_set
                    or self._manhattan(self.player, target) > self.player_vision_radius
                    or not self.line_of_sight(self.player, target)):
                raise ValueError("Choose a visible floor tile; decoys must remain")
        elif not isinstance(direction, str) or direction not in directions:
            raise ValueError("Invalid direction")

        self.turn += 1
        self.message = None
        self.last_decoy = None
        previous_player = self.player
        if direction == "decoy":
            self.decoys -= 1
            self.last_decoy = list(target)
            self.message = "Колба разбилась. Акустическая приманка активирована!"
        else:
            dx, dy = directions[direction]
            candidate = (self.player[0] + dx, self.player[1] + dy)
            if candidate in self.floor_set:
                self.player = candidate
        moved = self.player != previous_player
        self.stepped_on_noise = moved and self.grid[self.player[1]][self.player[0]] == self.NOISE
        if self.stepped_on_noise:
            self.message = "Шумная клетка! Осколки загремели под ногами!"

        # Contact is lethal before the monster gets a chance to move away.
        if self.player == self.monster:
            return self._caught()
        if self.player == self.key_pos and not self.key_collected:
            self.key_collected = True
            self.message = "Ключ найден! Бегите к выходу!"
        if self.player == self.exit_pos:
            if self.key_collected:
                self.victory = self.game_over = True
                self.message = "YOU SURVIVED! Вы выбрались из сетки!"
                return self.to_dict()
            self.message = "Выход заперт! Сначала найдите ключ!"

        # Sound has a finite range; walls block sight, but not this acoustic sensor.
        source = target if direction == "decoy" else (self.player if moved else None)
        sound_range = self.hearing_radius * (2 if direction == "decoy" or self.stepped_on_noise else 1)
        heard = source is not None and self._manhattan(self.monster, source) <= sound_range
        self._hmm_update(source if heard else None, decoy=direction == "decoy")
        visible = self._can_see_player()
        if visible:
            if self.last_seen is not None and self.last_seen_turn == self.turn - 1:
                velocity = (self.player[0] - self.last_seen[0], self.player[1] - self.last_seen[1])
                self.observed_velocity = velocity if sum(map(abs, velocity)) <= 1 else (0, 0)
            else:
                self.observed_velocity = (0, 0)
            self.last_seen = self.player
            self.last_seen_turn = self.turn
            self.chase_cooldown = 4
            self.ai_status = "STALK" if self.monster_type == "stalker" else "CHASE"
            self.belief = {c: float(c == self.player) for c in self.belief}
            self.detection_probability = 1.0
            self.ai_target = self.player
            if self.monster_type == "stalker" and self._manhattan(self.monster, self.player) > 1:
                # Extrapolate only consecutive visual observations, then route with A*.
                for _ in range(2):
                    candidate = (self.ai_target[0] + self.observed_velocity[0],
                                 self.ai_target[1] + self.observed_velocity[1])
                    if candidate not in self.floor_set:
                        break
                    self.ai_target = candidate
        elif heard:
            self.ai_status = "INVESTIGATE"
            self.chase_cooldown = 4
            self.ai_target = self._hmm_target()
        elif self.chase_cooldown > 0 and self.ai_target is not None and self.monster != self.ai_target:
            self.chase_cooldown -= 1
            self.ai_status = "SEARCH"
        else:
            self.ai_status = "PATROL"
            self.ai_target = self._hmm_target()
            if self.ai_target == self.monster:
                # Deterministic exploration avoids parking forever on a belief peak.
                cells = sorted(self.floor_set, key=lambda c: (c[1], c[0]))
                self.ai_target = cells[(self.turn * 17) % len(cells)]

        path = self.astar(self.monster, self.ai_target)
        keep_distance = (visible and self.monster_type == "stalker" and path
                         and self._manhattan(self.monster, self.player) > 1
                         and self._manhattan(path[0], self.player) < 2)
        if path and not keep_distance:
            self.monster = path[0]
        if self.player == self.monster:
            return self._caught()
        return self.to_dict()

    def _caught(self):
        self.game_over = True
        self.victory = False
        self.message = "GAME OVER — Монстр настиг вас в темноте."
        return self.to_dict()

    def to_dict(self):
        return {
            "grid": self.grid,
            "player": list(self.player),
            "monster": list(self.monster),
            "key_pos": list(self.key_pos),
            "exit_pos": list(self.exit_pos),
            "width": self.width,
            "height": self.height,
            "turn": self.turn,
            "key_collected": self.key_collected,
            "game_over": self.game_over,
            "victory": self.victory,
            "ai_status": self.ai_status,
            "detection_probability": round(self.detection_probability, 3),
            "vision_radius": self.vision_radius,
            "hearing_radius": self.hearing_radius,
            "stepped_on_noise": self.stepped_on_noise,
            "message": self.message,
            "belief_top": self._belief_top(len(self.belief)),
            "belief": {f"{x},{y}": p for (x, y), p in self.belief.items()},
            "monster_type": self.monster_type,
            "player_vision_radius": self.player_vision_radius,
            "decoys": self.decoys,
            "last_decoy": self.last_decoy,
            "ai_target": self.ai_target,
            "last_seen": self.last_seen,
            "last_seen_turn": self.last_seen_turn,
            "observed_velocity": self.observed_velocity,
            "chase_cooldown": self.chase_cooldown,
        }


# ═══════════════════════════════════════════════════════════════
#  HTTP SERVER HANDLER (STANDARD LIBRARY)
# ═══════════════════════════════════════════════════════════════

game_instance: GameState = GameState()
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

class QuietGridHandler(http.server.BaseHTTPRequestHandler):

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        global game_instance
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        if path == "/start_game":
            w = int(qs.get("width", [21])[0])
            h = int(qs.get("height", [21])[0])
            hr = int(qs.get("hearing_radius", [5])[0])
            vr = int(qs.get("vision_radius", [4])[0])
            game_instance = GameState(w, h, hr, vr, qs.get("monster_type", ["hunter"])[0])
            data = json.dumps(game_instance.to_dict()).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_cors_headers()
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if path == "/state":
            data = json.dumps(game_instance.to_dict()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_cors_headers()
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        # Static file delivery
        filename = "index.html" if path in ("/", "") else path.lstrip("/")
        filepath = os.path.join(SCRIPT_DIR, filename)

        if os.path.isfile(filepath):
            mime_type, _ = mimetypes.guess_type(filepath)
            if not mime_type:
                mime_type = "application/octet-stream"
            try:
                with open(filepath, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", mime_type)
                self.send_cors_headers()
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            except Exception as e:
                self.send_error(500, f"Read error: {e}")
        else:
            self.send_error(404, "File Not Found")

    def do_POST(self):
        global game_instance
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/move":
            content_len = int(self.headers.get("Content-Length", 0))
            post_body = self.rfile.read(content_len).decode("utf-8")
            try:
                payload = json.loads(post_body)
                if not isinstance(payload, dict):
                    raise ValueError("Expected an action object")
                result = game_instance.process_move(payload.get("direction", "wait"), payload.get("target"))
            except (ValueError, TypeError) as error:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(error)}).encode("utf-8"))
                return
            data = json.dumps(result).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_cors_headers()
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        self.send_error(404, "Unknown POST route")

    def log_message(self, format, *args):
        # Clean terminal logging
        pass


def run_server(port=5000):
    server_address = ("", port)
    httpd = http.server.HTTPServer(server_address, QuietGridHandler)
    print()
    print("  +-------------------------------------------------------+")
    print(f"  |   THE QUIET GRID -- Python Server Online              |")
    print(f"  |   URL: http://localhost:{port}                         |")
    print(f"  |   CSP (Week 3) + HMM (Week 7) + A* (Week 2) Active   |")
    print("  +-------------------------------------------------------+")
    print()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == "__main__":
    run_server(5000)
