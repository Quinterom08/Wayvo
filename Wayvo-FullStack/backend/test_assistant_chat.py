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

    def test_chat_colloquial_departure_arrival_gets_map_button_data(self):
        for question in (
            'Estoy en Laureles, quiero ir a Bello',
            '¿Qué bus me lleva a Bello desde Laureles?',
            '¿Cómo voy a Bello desde Laureles?',
            'Estoy en Laureles y quiero llegar a Bello',
            '¿Cómo llego a Bello si estoy en Laureles?',
        ):
            with self.subTest(question=question):
                reply=chat_reply([{'role':'user','content':question}],None,lambda *args:None)
                self.assertTrue(reply['trip']['found'])
                self.assertEqual(reply['trip']['origin'],'Laureles')
                self.assertEqual(reply['trip']['destination'],'Bello')
                self.assertIn('Ver ruta y paradero en el mapa',reply['answer'])

    def test_chat_followup_origin_gets_structured_route(self):
        messages=[
            {'role':'user','content':'¿Cómo voy a Bello?'},
            {'role':'assistant','content':'¿Desde qué paradero sales?'},
            {'role':'user','content':'Desde Laureles'},
        ]
        reply=chat_reply(messages,None,lambda *args:None)
        self.assertTrue(reply['trip']['found'])
        self.assertEqual(reply['trip']['origin'],'Laureles')
        self.assertEqual(reply['trip']['destination'],'Bello')

    def test_chat_followup_destination_gets_structured_route(self):
        messages=[
            {'role':'user','content':'Estoy en Laureles'},
            {'role':'assistant','content':'¿A dónde quieres ir?'},
            {'role':'user','content':'Quiero ir a Envigado'},
        ]
        reply=chat_reply(messages,None,lambda *args:None)
        self.assertTrue(reply['trip']['found'])
        self.assertEqual(reply['trip']['transfers'],1)

    def test_non_travel_place_question_has_no_map_cta(self):
        reply=chat_reply([{'role':'user','content':'¿Cuál es la historia de Bello y Envigado?'}],None,lambda *args:None)
        self.assertIsNone(reply.get('trip'))

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


class ConversationRegressionTests(unittest.TestCase):
    """Multiple route searches must work during the same chat session."""

    def test_successive_routes_and_short_followups(self):
        questions = [
            ('¿Cómo llego de Bello a Envigado?', 'Bello', 'Envigado'),
            ('¿Y de Envigado a Bello?', 'Envigado', 'Bello'),
            ('Ahora de Laureles a Envigado', 'Laureles', 'Envigado'),
            ('¿Y ahora a Robledo?', 'Laureles', 'Robledo'),
            ('¿Y en sentido contrario?', 'Robledo', 'Laureles'),
            ('¿Me llevas de Belén a Centro?', 'Belén', 'Centro'),
            ('de laureles a envigado', 'Laureles', 'Envigado'),
            ('¿Qué tal de Bello a Niquía?', 'Bello', 'Niquía'),
        ]
        messages = []
        for question, departure, arrival in questions:
            with self.subTest(question=question):
                messages.append({'role':'user', 'content':question})
                result = chat_reply(messages[-20:], None, lambda *args: None)
                self.assertTrue(result.get('trip', {}).get('found'), result)
                self.assertEqual(result['trip']['origin'], departure)
                self.assertEqual(result['trip']['destination'], arrival)
                messages.append({'role':'assistant', 'content':result['answer']})

    def test_clarification_then_new_destination_then_reverse(self):
        messages = []
        for question, expected in [
            ('¿Cómo voy a Bello?', None),
            ('Desde Laureles', ('Laureles', 'Bello')),
            ('Ahora a Envigado', ('Laureles', 'Envigado')),
            ('Y en sentido contrario', ('Envigado', 'Laureles')),
        ]:
            messages.append({'role':'user', 'content':question})
            result = chat_reply(messages[-20:], None, lambda *args: None)
            if expected:
                self.assertTrue(result.get('trip', {}).get('found'), result)
                self.assertEqual((result['trip']['origin'], result['trip']['destination']), expected)
            else:
                self.assertFalse(result.get('trip'))
            messages.append({'role':'assistant', 'content':result['answer']})

    def test_unrelated_question_clears_implicit_route_context(self):
        messages = [
            {'role':'user', 'content':'Cómo voy de Bello a Envigado'},
            {'role':'assistant', 'content':'Ruta WV-302'},
            {'role':'user', 'content':'¿Quién escribió Don Quijote?'},
            {'role':'assistant', 'content':'Miguel de Cervantes'},
            {'role':'user', 'content':'¿Y ahora a Robledo?'},
        ]
        result = chat_reply(messages, None, lambda *args: None)
        self.assertFalse(result.get('trip'))

    def test_does_not_invent_bus_for_unregistered_place(self):
        messages = [
            {'role':'user', 'content':'¿Cómo llego de Bello a Envigado?'},
            {'role':'assistant', 'content':'Viaje de prueba'},
            {'role':'user', 'content':'¿Y de Bogotá a Envigado?'},
        ]
        result = chat_reply(messages, None, lambda *args: None)
        self.assertIsNone(result.get('trip'))

    def test_general_place_question_does_not_give_route(self):
        result = chat_reply([{'role':'user', 'content':'¿Cuál es la historia de Bello y Envigado?'}], None, lambda *a: None)
        self.assertFalse(result.get('trip'))

if __name__ == '__main__':
    unittest.main()
