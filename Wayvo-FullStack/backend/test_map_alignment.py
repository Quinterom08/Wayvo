"""Comprobar que el dibujo académico no separa puntos de las líneas."""
from pathlib import Path
import re
import unittest
from assistant_chat import DEMO_ROUTES, quick_route

MAP_FILE = Path(__file__).resolve().parents[1] / 'src' / 'app' / 'components' / 'WayvoLeafletMap.tsx'

class MapAlignmentTests(unittest.TestCase):
    def test_frontend_routes_reuse_every_demo_stop_in_backend_order(self):
        text=MAP_FILE.read_text(encoding='utf-8')
        coords_section=text.split('export const DEMO_STOP_COORDS:')[1].split('const DEMO_ROUTE_STOPS:')[0]
        route_section=text.split('const DEMO_ROUTE_STOPS:')[1].split('export const DEMO_PATHS:')[0]
        coords=set(re.findall(r"'([^']+)':\s*\[\s*\d+\.\d+\s*,\s*-\d+\.\d+\s*\]",coords_section))
        front_routes={id:re.findall(r"'([^']+)'",body) for id,body in re.findall(r"'(\d+)':\[(.*?)\]",route_section)}
        for backend_route in DEMO_ROUTES:
            route_id=backend_route['id']
            self.assertIn(route_id,front_routes)
            self.assertEqual(front_routes[route_id],backend_route['stops'])
            self.assertTrue(set(backend_route['stops']).issubset(coords))

    def test_transfer_stop_is_shared_and_present_in_both_paths(self):
        trip=quick_route('Laureles','Envigado')
        self.assertTrue(trip['found'])
        self.assertEqual(trip['segments'][0]['get_off_at'],trip['segments'][1]['board_at'])
        self.assertIn(trip['segments'][0]['get_off_at'],trip['segments'][0]['stops'])
        self.assertIn(trip['segments'][1]['board_at'],trip['segments'][1]['stops'])

if __name__ == '__main__': unittest.main()
