"""GPS simulated automatic transmitter for a registered demo bus (NOT a real device).
Run: WAYVO_DEVICE_KEY=... python backend/demo_bus_gps.py
Env: WAYVO_GPS_API=https://your-domain/api or http://127.0.0.1:8000/api for LOCAL tests.
Samples every 4 seconds; Ctrl-C to stop. Does not expose key in the URL.
"""
import json
import os
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

PATH=[(6.334,-75.558),(6.300,-75.560),(6.273,-75.566),(6.251,-75.569),(6.240,-75.572),(6.210,-75.573),(6.174,-75.591)]

def between(a,b,steps=12):
    for i in range(steps):
        f=i/steps
        yield {'lat':round(a[0]+(b[0]-a[0])*f,6),'lng':round(a[1]+(b[1]-a[1])*f,6),'accuracy':12.0}

if __name__=='__main__':
    token=os.getenv('WAYVO_DEVICE_KEY','')
    base=os.getenv('WAYVO_GPS_API','http://127.0.0.1:8000/api').rstrip('/')
    if len(token)<30 or not (base.startswith('https://') or base.startswith('http://127.0.0.1:') or base.startswith('http://localhost:')):
        sys.exit('Configura WAYVO_DEVICE_KEY (generada por administrador) y WAYVO_GPS_API HTTPS (o localhost durante pruebas).')
    print('Publicando GPS simulado en el bus. Se interrumpe con Ctrl+C.')
    try:
        while True:
            for a,b in zip(PATH,PATH[1:]):
                for point in between(a,b):
                    request=Request(base+'/gps/device/position',json.dumps(point).encode(),headers={'Content-Type':'application/json','X-Wayvo-Device-Key':token},method='POST')
                    try:
                        with urlopen(request, timeout=8) as response:
                            print('GPS enviado:',point['lat'],point['lng'],response.status)
                    except (HTTPError, URLError) as exc:
                        print('Sin envío GPS:',type(exc).__name__)
                    time.sleep(4)
    except KeyboardInterrupt:
        print('Simulador terminado.')
