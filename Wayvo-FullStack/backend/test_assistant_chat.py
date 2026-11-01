"""Pruebas del asistente académico y de la API de chat autenticada."""
import importlib.util
import json
import os
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from assistant_chat import plan_route, local_answer, chat_reply, quick_route, demo_stops

class RoutePlannerTests(unittest.TestCase):
    def test_bello_envigado_direct(self):
        self.assertEqual([r['id'] for r in plan_route('Bello','Envigado')],['302'])
    def test_belen_robledo_direct(self):
        self.assertEqual([r['id'] for r in plan_route('Belén','Robledo')],['311'])
    def test_laureles_envigado_transfer(self):
        self.assertEqual([r['id'] for r in plan_route('Laureles','Envigado')],['306','302'])
    def test_express_direct_trip_details(self):
        trip=quick_route('Bello','Envigado')
        self.assertTrue(trip['found'])
        self.assertTrue(trip['direct'])
        self.assertEqual(trip['segments'][0]['bus'],'WV-302')
        self.assertEqual(trip['segments'][0]['board_at'],'Bello')
        self.assertEqual(trip['segments'][0]['get_off_at'],'Envigado')
        self.assertEqual(trip['segments'][0]['stop_count'],7)
        self.assertEqual(trip['estimated_fare_cop'],3200)

    def test_express_transfer_and_reverse(self):
        trip=quick_route('Laureles','Envigado')
        self.assertTrue(trip['found'])
        self.assertEqual([s['bus'] for s in trip['segments']],['WV-306','WV-302'])
        self.assertEqual(trip['segments'][0]['get_off_at'],trip['segments'][1]['board_at'])
        self.assertEqual(trip['transfers'],1)
        self.assertEqual(trip['estimated_fare_cop'],6400)
        reverse=quick_route('Envigado','Bello')
        self.assertEqual(reverse['segments'][0]['stops'][0],'Envigado')
        self.assertEqual(reverse['segments'][0]['stops'][-1],'Bello')

    def test_express_no_invented_stops(self):
        self.assertFalse(quick_route('Bogotá','Envigado')['found'])
        self.assertFalse(quick_route('Bello','Bello')['found'])
        self.assertIn('Laureles',demo_stops())
        self.assertEqual(len(demo_stops()),len(set(demo_stops())))

    def test_chat_exposes_structured_map_route(self):
        result=chat_reply([{'role':'user','content':'¿Cómo llego de Bello a Envigado?'}],None,lambda *a: None)
        self.assertTrue(result['trip']['found'])
        self.assertEqual(result['trip']['segments'][0]['bus'],'WV-302')
        self.assertNotIn('¿Cómo llego de Bello a Envigado?',result['answer'])

    def test_chat_transfer_exposes_both_buses(self):
        result=chat_reply([{'role':'user','content':'Quiero ir de Laureles a Envigado'}],None,lambda *a: None)
        self.assertEqual([s['bus'] for s in result['trip']['segments']],['WV-306','WV-302'])
        self.assertNotIn('Quiero ir de Laureles a Envigado',result['answer'])

    def test_chat_without_known_route_has_no_map_cta(self):
        result=chat_reply([{'role':'user','content':'Quiero ir de Bogotá a Cartagena'}],None,lambda *a: None)
        self.assertIsNone(result['trip'])

    def test_unknown_does_not_invent(self):
        self.assertEqual(plan_route('Bogotá','Cartagena'),[])
    def test_destination_without_origin_requests_clarification(self):
        result=chat_reply([{'role':'user','content':'¿Cómo voy a Bello?'}],None,lambda *args:None)
        self.assertIn('dime desde qué',result['answer'].lower())
        self.assertNotIn('OPENAI_API_KEY',result['answer'])
        self.assertIsNone(result.get('trip'))

    def test_gps_without_location_does_not_guess(self):
        self.assertIn('GPS',local_answer('¿Dónde estoy?',None))
    def test_offline_fallback_is_honest(self):
        old=os.environ.pop('OPENAI_API_KEY',None)
        try:
            reply=chat_reply([{'role':'user','content':'¿Quién escribió Don Quijote?'}],None,lambda *args:None)
            self.assertEqual(reply['source'],'demo_local')
            self.assertIn('OPENAI_API_KEY',reply['answer'])
        finally:
            if old is not None:os.environ['OPENAI_API_KEY']=old

if __name__=='__main__':unittest.main()
