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

from assistant_chat import plan_route, local_answer, chat_reply

class RoutePlannerTests(unittest.TestCase):
    def test_bello_envigado_direct(self):
        self.assertEqual([r['id'] for r in plan_route('Bello','Envigado')],['302'])
    def test_belen_robledo_direct(self):
        self.assertEqual([r['id'] for r in plan_route('Belén','Robledo')],['311'])
    def test_laureles_envigado_transfer(self):
        self.assertEqual([r['id'] for r in plan_route('Laureles','Envigado')],['306','302'])
    def test_unknown_does_not_invent(self):
        self.assertEqual(plan_route('Bogotá','Cartagena'),[])
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
