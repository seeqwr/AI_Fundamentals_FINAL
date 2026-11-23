import copy
import json
from pathlib import Path
import random
import subprocess
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import GameState


def arena(kind='hunter', hearing=5, vision=4):
    random.seed(12)
    game = GameState(11, 11, hearing, vision, kind)
    game.grid = [[int(x in (0, 10) or y in (0, 10)) for x in range(11)] for y in range(11)]
    game.player, game.monster = (2, 2), (8, 8)
    game.key_pos, game.exit_pos = (8, 1), (9, 9)
    game._init_hmm()
    return game


class GameplayTests(unittest.TestCase):
    def test_robot_spawns_at_varied_reachable_locations_away_from_player(self):
        for size in (11, 15, 21, 27):
            positions = set()
            for seed in range(8):
                random.seed(seed)
                g = GameState(size, size)
                self.assertGreater(g._manhattan(g.player, g.monster), g.player_vision_radius)
                self.assertIn(g.monster, g.floor_set)
                self.assertTrue(g._bfs_reachable(g.player, g.monster))
                self.assertEqual(len({g.player, g.monster, g.exit_pos, g.key_pos}), 4)
                positions.add(g.monster)
            self.assertGreater(len(positions), 2)

    def test_walk_rejects_walls_corner_cuts_and_nonadjacent_targets(self):
        g = arena()
        g.grid[2][3] = 1
        g._init_hmm()
        original = g.to_dict()
        for target in ([3, 2], [3, 3], [4, 2], [2, 2], [1.25, 2], None):
            with self.assertRaises(ValueError):
                g.process_move('walk', target)
            self.assertEqual(g.to_dict(), original)

    def test_silent_diagonal_crossing_suppresses_hearing_only(self):
        for sneaking, vision, expected in ((False, 0, 'INVESTIGATE'), (True, 0, 'PATROL'), (True, 6, 'CHASE')):
            g = arena(vision=vision)
            g.monster = (6, 3)
            g.grid[3][3] = g.NOISE
            state = g.process_move('walk', [3, 3], sneaking)
            self.assertEqual(state['player'], [3, 3])
            self.assertEqual((g.turn, g.footstep, g.stepped_on_noise, g.ai_status),
                             (1, not sneaking, not sneaking, expected))

    def test_walls_and_corners_block_sight(self):
        g = arena()
        g.grid[2][3] = 1
        self.assertTrue(g.line_of_sight((2, 2), (3, 2)))
        self.assertFalse(g.line_of_sight((2, 2), (4, 2)))
        self.assertFalse(g.line_of_sight((2, 2), (3, 3)))
        for start in g._floor_cells():
            for end in [(2, 2), (4, 3), (8, 8)]:
                self.assertEqual(g.line_of_sight(start, end), g.line_of_sight(end, start))

    def test_hidden_player_does_not_trigger_chase(self):
        g = arena(hearing=0)
        g.monster = (4, 2)
        g.grid[2][3] = 1
        g._init_hmm()
        g.process_move('wait')
        self.assertEqual(g.ai_status, 'PATROL')
        self.assertIsNone(g.last_seen)

    def test_decoy_shifts_peak_and_costs_exactly_one_turn(self):
        g = arena('brute')
        g.monster = (7, 2)
        g.process_move('decoy', [2, 4])
        self.assertEqual((g.turn, g.decoys, g.ai_status), (1, 2, 'INVESTIGATE'))
        self.assertEqual(g._hmm_target(), (2, 4))
        self.assertEqual(g.ai_target, (2, 4))
        self.assertAlmostEqual(sum(g.belief.values()), 1)
        self.assertEqual(g.player, (2, 2))

    def test_invalid_decoy_does_not_mutate_state(self):
        g = arena()
        g.grid[2][3] = 1
        g._init_hmm()
        for target in ([3, 2], [4, 2], [9, 9], [-1, 2], [2.5, 2], [True, 2], None):
            before = copy.deepcopy(g.to_dict())
            with self.assertRaises(ValueError):
                g.process_move('decoy', target)
            self.assertEqual(g.to_dict(), before)
        g.decoys = 0
        with self.assertRaises(ValueError):
            g.process_move('decoy', [2, 3])

    def test_decoy_overrides_stale_concentrated_belief(self):
        g = GameState(27, 27, 10, 0, 'brute')
        g.grid = [[int(x in (0, 26) or y in (0, 26)) for x in range(27)] for y in range(27)]
        g.player, g.monster = (2, 2), (10, 2)
        g._init_hmm()
        g.belief = {c: float(c == (2, 2)) for c in g.belief}
        g.process_move('decoy', [4, 2])
        self.assertEqual(g._hmm_target(), (4, 2))
        self.assertEqual(g.ai_target, (4, 2))

    def test_blind_brute_hears_but_never_sees(self):
        g = arena('brute')
        g.monster = (6, 2)
        self.assertEqual((g.vision_radius, g.hearing_radius), (0, 9))
        g.process_move('down')
        self.assertEqual(g.ai_status, 'INVESTIGATE')
        self.assertIsNone(g.last_seen)

    def test_far_noise_is_not_heard(self):
        g = arena(hearing=1, vision=0)
        g.grid[3][2] = 2
        g.process_move('down')
        self.assertEqual(g.ai_status, 'PATROL')

    def test_wait_on_glass_is_silent(self):
        g = arena()
        g.grid[2][2] = 2
        g.process_move('wait')
        self.assertFalse(g.stepped_on_noise)

    def test_visual_contact_beats_decoy(self):
        g = arena()
        g.monster = (5, 2)
        g.process_move('decoy', [2, 4])
        self.assertEqual(g.ai_status, 'CHASE')
        self.assertEqual(g.ai_target, g.player)
        self.assertEqual(g._hmm_target(), g.player)

    def test_lost_sight_searches_last_known_position(self):
        g = arena(hearing=0, vision=8)
        g.monster = (7, 2)
        g.grid[3][3] = 1
        g._init_hmm()
        g.process_move('wait')
        self.assertEqual(g.ai_status, 'CHASE')
        g.process_move('down')
        self.assertEqual(g.ai_status, 'SEARCH')
        self.assertEqual(g.ai_target, (2, 2))
        self.assertNotEqual(g.ai_target, g.player)

    def test_empty_inventory_and_invalid_js_actions(self):
        g = arena('brute')
        g.decoys = 1
        actions = [{'direction': 'decoy', 'target': [2, 3]},
                   {'direction': 'decoy', 'target': [2, 3]},
                   {'direction': 'decoy', 'target': [100, 3]}]
        result = subprocess.run(['node', str(Path(__file__).with_name('engine_runner.js'))],
                                input=json.dumps([{'state': g.to_dict(), 'actions': actions}]),
                                text=True, capture_output=True, check=True)
        states = json.loads(result.stdout)[0]
        self.assertEqual(states[0]['state']['decoys'], 0)
        self.assertEqual(states[0]['state']['turn'], 1)
        self.assertIn('error', states[1])
        self.assertIn('error', states[2])

    def test_silent_observation_does_not_use_hidden_player_position(self):
        first = arena(vision=0)
        second = copy.deepcopy(first)
        second.player = (5, 1)
        first._hmm_update()
        second._hmm_update()
        self.assertEqual(first.belief, second.belief)

    def test_stalker_predicts_and_preserves_distance(self):
        g = arena('stalker', vision=8)
        g.monster = (5, 4)
        g.process_move('right')
        g.process_move('right')
        self.assertEqual(g.ai_status, 'STALK')
        self.assertEqual(g.ai_target, (6, 2))
        g = arena('stalker')
        g.monster = (4, 2)
        g.process_move('wait')
        self.assertEqual(g.monster, (4, 2))
        g.process_move('right')
        self.assertTrue(g.game_over)

    def test_contact_precedes_movement_and_victory(self):
        g = arena()
        g.monster = g.exit_pos = (3, 2)
        g.key_collected = True
        g.process_move('right')
        self.assertTrue(g.game_over)
        self.assertFalse(g.victory)
        before = g.to_dict()
        self.assertEqual(g.process_move('wait'), before)

    def test_key_then_exit(self):
        g = arena(hearing=0, vision=0)
        g.key_pos, g.exit_pos = (3, 2), (4, 2)
        g.process_move('right')
        self.assertTrue(g.key_collected)
        g.process_move('right')
        self.assertTrue(g.victory)

    def test_python_javascript_parity(self):
        cases, expected = [], []
        g = arena(vision=0)
        g.grid[3][3] = g.NOISE
        walks = [{'direction': 'walk', 'target': p, 'sneaking': quiet}
                 for p, quiet in (([3, 3], True), ([4, 3], False), ([3, 3], False))]
        cases.append({'state': g.to_dict(), 'actions': walks})
        expected.append([g.process_move(a['direction'], a['target'], a['sneaking']) for a in walks])
        for kind in ('hunter', 'stalker', 'brute'):
            for seed in range(8):
                random.seed(seed)
                g = GameState(15, 15, 5, 4, kind)
                actions = [{'direction': 'decoy', 'target': [1, 1]}]
                actions += [{'direction': random.choice(['up', 'down', 'left', 'right', 'wait'])} for _ in range(25)]
                cases.append({'state': g.to_dict(), 'actions': actions})
                expected.append([g.process_move(a['direction'], a.get('target')) for a in actions])
        result = subprocess.run(['node', str(Path(__file__).with_name('engine_runner.js'))],
                                input=json.dumps(cases), text=True, capture_output=True, check=True)
        for case, actual in zip(expected, json.loads(result.stdout)):
            for py_state, js_result in zip(case, actual):
                js_state = js_result['state']
                for field in ('player', 'monster', 'ai_status', 'decoys', 'turn', 'game_over', 'victory',
                              'key_collected', 'footstep', 'stepped_on_noise'):
                    self.assertEqual(py_state[field], js_state[field], field)
                self.assertEqual(list(py_state['ai_target']) if py_state['ai_target'] else None, js_state['ai_target'])
                self.assertAlmostEqual(py_state['detection_probability'], js_state['detection_probability'], places=3)
                self.assertAlmostEqual(sum(js_state['belief'].values()), 1)
                for cell, probability in py_state['belief'].items():
                    self.assertAlmostEqual(probability, js_state['belief'][cell], places=10)


if __name__ == '__main__':
    unittest.main()
