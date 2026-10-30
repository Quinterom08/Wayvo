"""Run: python -m unittest discover -s backend -v. Uses local-only email outbox."""
import email
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]

class AuthenticationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.port=18871
        cls.outbox=Path(cls.temp.name)/'outbox'
        env={**os.environ,'WAYVO_DB':str(Path(cls.temp.name)/'test.sqlite3'),
             'WAYVO_PORT':str(cls.port),'WAYVO_HOST':'127.0.0.1',
             'WAYVO_ADMIN_EMAIL':'admin@wayvo.test','WAYVO_ADMIN_PASSWORD':'Segura9!X',
             'WAYVO_MAIL_MODE':'outbox','WAYVO_MAIL_OUTBOX':str(cls.outbox),'WAYVO_SMTP_FROM':'Wayvo <test@example.org>'}
        cls.server=subprocess.Popen([sys.executable,str(ROOT/'backend/server.py')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(70):
            try: cls.call('GET','/api/health');break
            except Exception: time.sleep(.1)
        else: raise RuntimeError('API no arrancó')
    @classmethod
    def tearDownClass(cls):
        cls.server.terminate();cls.server.wait();cls.temp.cleanup()
    @classmethod
    def call(cls,method,path,data=None,token=None,extra_headers=None):
        headers={'Content-Type':'application/json'}
        if extra_headers: headers.update(extra_headers)
        if token:headers['Authorization']='Bearer '+token
        req=Request(f'http://127.0.0.1:{cls.port}'+path,method=method,data=json.dumps(data).encode() if data is not None else None,headers=headers)
        try:
            with urlopen(req,timeout=5) as r:return r.status,json.load(r)
        except HTTPError as e:return e.code,json.load(e)
    @classmethod
    def code(cls, recipient):
        messages=[]
        for file in cls.outbox.glob('*.eml'):
            msg=email.message_from_bytes(file.read_bytes())
            if msg['To']==recipient:
                plain=next((p.get_payload(decode=True).decode() for p in msg.walk() if p.get_content_type()=='text/plain'),'')
                match=re.search(r'Tu código:\s*(\d{6})',plain)
                if match:messages.append((file.stat().st_mtime_ns,match.group(1)))
        if not messages:raise AssertionError(f'No mail for {recipient}')
        return max(messages)[1]
    @classmethod
    def register_verified(cls,email):
        status,_=cls.call('POST','/api/auth/register',{'name':'Wayvo user','email':email,'password':'Seguro8!A'})
        assert status==201,status
        status,body=cls.call('POST','/api/auth/verify',{'email':email,'purpose':'register','code':cls.code(email)})
        assert status==200,body
        return body['token']
    @classmethod
    def login_verified(cls,email):
        status,res=cls.call('POST','/api/auth/login',{'email':email,'password':'Seguro8!A'})
        assert status==200,res
        assert res.get('requires_verification')
        status,body=cls.call('POST','/api/auth/verify',{'email':email,'purpose':'login','code':cls.code(email)})
        assert status==200,body
        return body['token']

    def test_register_requires_code_and_login_requires_a_fresh_code(self):
        address='verify@example.com'
        status,result=self.call('POST','/api/auth/register',{'name':'Prueba','email':address,'password':'Seguro8!A'})
        self.assertEqual(status,201)
        self.assertNotIn('token',result)
        self.assertEqual(self.call('GET','/api/auth/me')[0],401)
        self.assertEqual(self.call('POST','/api/auth/verify',{'email':address,'purpose':'register','code':'000000'})[0],400)
        status,verified=self.call('POST','/api/auth/verify',{'email':address,'purpose':'register','code':self.code(address)})
        self.assertEqual(status,200);self.assertTrue(verified['token'])
        self.assertEqual(self.call('GET','/api/auth/me',token=verified['token'])[0],200)
        self.assertEqual(self.call('POST','/api/auth/login',{'email':address,'password':'bad'})[0],401)
        status,challenge=self.call('POST','/api/auth/login',{'email':address,'password':'Seguro8!A'})
        self.assertEqual(status,200);self.assertNotIn('token',challenge)
        status,login=self.call('POST','/api/auth/verify',{'email':address,'purpose':'login','code':self.code(address)})
        self.assertEqual(status,200);self.assertTrue(login['token'])
        self.assertEqual(self.call('POST','/api/auth/verify',{'email':address,'purpose':'login','code':self.code(address)})[0],400)

    def test_password_strength_and_recovery_revokes_sessions(self):
        for p in ('aaaaaaaa','password1!','a'*13,'aA123456','Aaa 123!','Wayvo1234!'):
            status,_=self.call('POST','/api/auth/register',{'name':'User','email':'weak'+str(abs(hash(p)))+'@example.com','password':p})
            self.assertEqual(status,400,p)
        address='recover@example.com';token=self.register_verified(address)
        status,result=self.call('POST','/api/auth/forgot',{'email':address})
        self.assertEqual(status,200)
        self.assertEqual(self.call('POST','/api/auth/reset',{'email':address,'code':'123456','new_password':'Nuevo8!Aa'})[0],400)
        status,result=self.call('POST','/api/auth/reset',{'email':address,'code':self.code(address),'new_password':'Nuevo8!Aa'})
        self.assertEqual(status,200,result)
        self.assertEqual(self.call('GET','/api/auth/me',token=token)[0],401)
        self.assertEqual(self.call('POST','/api/auth/login',{'email':address,'password':'Seguro8!A'})[0],401)
        self.assertEqual(self.call('POST','/api/auth/login',{'email':address,'password':'Nuevo8!Aa'})[0],200)

    def test_chat_requires_authentication_and_recommends_demo_route(self):
        payload={'messages':[{'role':'user','content':'¿Cómo llego de Bello a Envigado?'}]}
        self.assertEqual(self.call('POST','/api/assistant/chat',payload)[0],401)
        token=self.register_verified('chat@example.com')
        status,answer=self.call('POST','/api/assistant/chat',payload,token=token)
        self.assertEqual(status,200);self.assertIn('WV-302',answer['answer']);self.assertTrue(answer['demo'])

    def test_express_endpoints_require_login_and_return_structured_trip(self):
        self.assertEqual(self.call('GET','/api/assistant/stops')[0],401)
        self.assertEqual(self.call('POST','/api/assistant/quick-route',{'origin':'Bello','destination':'Envigado'})[0],401)
        token=self.register_verified('express@example.com')
        status,stops=self.call('GET','/api/assistant/stops',token=token)
        self.assertEqual(status,200);self.assertIn('Bello',stops['stops'])
        status,trip=self.call('POST','/api/assistant/quick-route',{'origin':'Laureles','destination':'Envigado'},token=token)
        self.assertEqual(status,200);self.assertTrue(trip['found']);self.assertEqual(trip['transfers'],1)
        self.assertEqual(trip['estimated_fare_cop'],6400)
        status,bad=self.call('POST','/api/assistant/quick-route',{'origin':'Bogotá','destination':'Envigado'},token=token)
        self.assertEqual(status,200);self.assertFalse(bad['found'])
        self.assertEqual(self.call('POST','/api/assistant/quick-route',{'origin':'Bello','destination':''},token=token)[0],400)

    @classmethod
    def admin_token(cls):
        status,response=cls.call('POST','/api/auth/login',{'email':'admin@wayvo.test','password':'Segura9!X'})
        assert status==200,response
        status,response=cls.call('POST','/api/auth/verify',{'email':'admin@wayvo.test','purpose':'login','code':cls.code('admin@wayvo.test')})
        assert status==200,response
        return response['token']

    def test_gps_tracks_admin_only(self):
        regular=self.register_verified('passenger@example.com')
        admin=self.admin_token()
        points=[{'lat':6.25,'lng':-75.57,'time':1759000000000},{'lat':6.26,'lng':-75.58,'time':1759000010000}]
        self.assertEqual(self.call('POST','/api/gps/tracks',{'points':points},token=regular)[0],403)
        self.assertEqual(self.call('GET','/api/gps/tracks',token=regular)[0],403)
        self.assertEqual(self.call('POST','/api/gps/tracks',{'points':points},token=admin)[0],201)
        status,result=self.call('GET','/api/gps/tracks',token=admin)
        self.assertEqual(status,200);self.assertEqual(len(result['tracks']),1)
        self.assertEqual(self.call('DELETE',f"/api/gps/tracks/{result['tracks'][0]['id']}",token=regular)[0],403)

    def test_devices_require_admin_key_and_publish_auto(self):
        regular=self.register_verified('observer@example.com')
        admin=self.admin_token()
        payload={'label':'Bus académico 01','route_id':'302'}
        self.assertEqual(self.call('POST','/api/admin/gps/devices',payload,token=regular)[0],403)
        status,result=self.call('POST','/api/admin/gps/devices',payload,token=admin)
        self.assertEqual(status,201,result)
        key=result['device_key'];dev=result['id']
        self.assertNotIn(key,str(self.call('GET','/api/admin/gps/devices',token=admin)[1]))
        self.assertEqual(self.call('POST','/api/gps/device/position',{'lat':6.3,'lng':-75.56})[0],401)
        self.assertEqual(self.call('POST','/api/gps/device/position',{'lat':999,'lng':-75.56},extra_headers={'X-Wayvo-Device-Key':key})[0],400)
        self.assertEqual(self.call('POST','/api/gps/device/position',{'lat':6.3,'lng':-75.56,'accuracy':10},extra_headers={'X-Wayvo-Device-Key':key})[0],202)
        self.assertEqual(self.call('POST','/api/gps/device/position',{'lat':6.31,'lng':-75.57},extra_headers={'X-Wayvo-Device-Key':key})[0],429)
        status,read=self.call('GET','/api/gps/buses',token=regular)
        self.assertEqual(status,200)
        sample=next(d for d in read['buses'] if d['id']==dev)
        self.assertEqual(sample['label'],'Bus académico 01');self.assertTrue(sample['active'])
        self.assertEqual(sample['trail'][0]['lat'],6.3)
        self.assertNotIn('device_key',sample)
        self.assertEqual(self.call('DELETE',f'/api/admin/gps/devices/{dev}',token=regular)[0],403)
        self.assertEqual(self.call('DELETE',f'/api/admin/gps/devices/{dev}',token=admin)[0],200)
        self.assertEqual(self.call('POST','/api/gps/device/position',{'lat':6.3,'lng':-75.56},extra_headers={'X-Wayvo-Device-Key':key})[0],401)

    def test_social_status_without_secrets(self):
        status,body=self.call('GET','/api/auth/oauth/google/status')
        self.assertEqual(status,200);self.assertFalse(body['configured'])
        # Microsoft is intentionally not offered by Wayvo anymore.
        self.assertEqual(self.call('GET','/api/auth/oauth/microsoft/status')[0],503)
if __name__=='__main__':unittest.main()
