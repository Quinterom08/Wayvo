"""Chat Wayvo: transport demonstration catalog + optional OpenAI general chat.

All transit data below are fictional demo entries, not public transit guidance.
"""
import json
import os
import re
import unicodedata
from collections import deque
from urllib.error import HTTPError, URLError

# Rutas y paraderos de DEMOSTRACIÓN: no constituyen información oficial.
DEMO_ROUTES = [
  {'id':'302','name':'Bello — Envigado','stops':['Bello','Niquía','Madera','Acevedo','Universidad','Centro','El Poblado','Envigado'],'minutes':42,'fare':3200},
  {'id':'306','name':'Laureles — Centro','stops':['Laureles','Estadio','Suramericana','Centro'],'minutes':22,'fare':3200},
  {'id':'311','name':'Belén — Robledo','stops':['Belén','La América','Estadio','Floresta','Robledo'],'minutes':30,'fare':3200},
  {'id':'315','name':'La América — Itagüí','stops':['La América','Suramericana','El Poblado','Sabaneta','Itagüí'],'minutes':36,'fare':3200},
  {'id':'301','name':'Circular Norte','stops':['Aranjuez','Manrique','Santa Cruz','Acevedo','Aranjuez'],'minutes':30,'fare':3200},
]


def normalize(s):
    s=unicodedata.normalize('NFKD', str(s).casefold())
    return re.sub(r'\s+', ' ', ''.join(c for c in s if not unicodedata.combining(c))).strip()


def parse_places(text):
    t=normalize(text)
    patterns=[
        r'(?:desde|de|estoy en|salgo de|salgo desde)\s+(.+?)\s+(?:hasta|hacia|a|para|y quiero (?:ir|llegar) a|y necesito (?:ir|llegar) a)\s+(.+)',
        r'(?:ir|llegar|viajar)\s+de\s+(.+?)\s+(?:a|hasta|hacia)\s+(.+)',
    ]
    for pattern in patterns:
        match=re.search(pattern,t)
        if match:
            origin=match.group(1).strip(' ¿?¡!.,')
            destination=match.group(2).strip(' ¿?¡!.,')
            destination=re.sub(r'\s+(?:en bus|en transporte|por favor|hoy|manana)$','',destination)
            return origin,destination
    return None


def choose_stop(place):
    place=normalize(place)
    if place in ('mi ubicacion','aqui','donde estoy','mi gps'): return None
    stops={normalize(name):name for r in DEMO_ROUTES for name in r['stops']}
    # longest exact stop-name occurrence first, to avoid Centro inside Belén Centro
    found=[(len(key),name) for key,name in stops.items() if key==place or (len(key)>4 and re.search(r'(?<!\w)'+re.escape(key)+r'(?!\w)',place))]
    return max(found, default=(0,None))[1]


def plan_route(origin,destination):
    start=choose_stop(origin);end=choose_stop(destination)
    if not start or not end: return []
    if start==end:return []
    graph={}
    for route in DEMO_ROUTES:
        stops=route['stops']
        for a,b in zip(stops,stops[1:]):
            # Academic routes are assumed bidirectional for this prototype.
            graph.setdefault(a,[]).append((b,route['id']))
            graph.setdefault(b,[]).append((a,route['id']))
    # Minimize transfers first, then number of stops using cost tuple.
    import heapq
    heap=[(0,0,start,None,[])]
    best={}
    while heap:
        transfers,hops,at,last,legs=heapq.heappop(heap)
        key=(at,last)
        if key in best and best[key] <= (transfers,hops):continue
        best[key]=(transfers,hops)
        if at==end:
            segments=[]
            for leg in legs:
                if segments and segments[-1]['id']==leg[0]:segments[-1]['end']=leg[2];segments[-1]['stops'].append(leg[2])
                else:segments.append({'id':leg[0],'start':leg[1],'end':leg[2],'stops':[leg[1],leg[2]]})
            return segments
        for next_stop,route_id in graph.get(at,[]):
            new_transfers=transfers+(1 if last and last!=route_id else 0)
            if new_transfers>2 or hops>20: continue
            heapq.heappush(heap,(new_transfers,hops+1,next_stop,route_id,legs+[(route_id,at,next_stop)]))
    return []


def demo_stops():
    """List only stops that are actually present in the demonstration network."""
    return sorted({stop for route in DEMO_ROUTES for stop in route['stops']}, key=normalize)


def quick_route(origin, destination):
    """Structured, deterministic, *fictional* route for the express UI."""
    names = {normalize(stop): stop for stop in demo_stops()}
    start, finish = names.get(normalize(origin)), names.get(normalize(destination))
    if not start or not finish:
        return {'found': False, 'message': 'Selecciona dos paraderos del catálogo de demostración.'}
    if start == finish:
        return {'found': False, 'message': 'Elige un destino diferente al origen.'}
    legs = plan_route(start, finish)
    if not legs:
        return {'found': False, 'message': 'No existe una conexión entre estos paraderos en las rutas simuladas de Wayvo.'}

    result = []
    for leg in legs:
        route = next(item for item in DEMO_ROUTES if item['id'] == leg['id'])
        # plan_route provides the ordered stops traversed, not just the end points.
        visited = leg['stops']
        count = max(1, len(visited) - 1)
        total_edges = max(1, len(route['stops']) - 1)
        estimated = max(1, round(route['minutes'] * count / total_edges))
        result.append({
            'bus': 'WV-' + route['id'],
            'name': route['name'],
            'board_at': leg['start'],
            'get_off_at': leg['end'],
            'stops': visited,
            'stop_count': count,
            'estimated_minutes': estimated,
            'fare_cop': route['fare'],
        })
    transfers = len(result) - 1
    return {
        'found': True,
        'demo': True,
        'origin': start,
        'destination': finish,
        'direct': transfers == 0,
        'transfers': transfers,
        'segments': result,
        'estimated_minutes': sum(part['estimated_minutes'] for part in result) + 7 * transfers,
        'estimated_fare_cop': sum(part['fare_cop'] for part in result),
        'disclaimer': 'Datos ficticios para el proyecto de grado. No son indicaciones de transporte real.',
    }


def format_plan(segments):
    if not segments:return None
    bits=[]
    for segment in segments:
        route=next(r for r in DEMO_ROUTES if r['id']==segment['id'])
        bits.append(f"bus WV-{route['id']} ({route['name']}), desde {segment['start']} hasta {segment['end']}")
    return ' → '.join(bits)


def local_answer(question, location=None):
    t=normalize(question)
    if any(q in t for q in ('donde estoy','mi ubicacion','ubicacion actual','donde me encuentro')):
        if isinstance(location,dict) and isinstance(location.get('latitude'),(float,int)) and isinstance(location.get('longitude'),(float,int)):
            lat=location['latitude'];lng=location['longitude']
            if -90<=lat<=90 and -180<=lng<=180:
                return f'Tu GPS indica aproximadamente {lat:.5f}, {lng:.5f}. No puedo identificar una calle o paradero cercano sin un servicio de geocodificación. Puedes usar el mapa para visualizar tu posición.'
        return 'Para conocer tu ubicación, toca el botón de GPS del chat y permite el acceso. Nunca inventaré tu ubicación.'
    if any(word in t for word in ('hola','buenas','buenos dias','hey','que puedes hacer','ayuda')):
        return '¡Hola! Soy Wayvo IA 🚌. Puedo ayudarte a explorar nuestras rutas de demostración, tarifas de ejemplo, paraderos y cómo funciona Wayvo. Prueba: «¿Cómo llego de Bello a Envigado?». Con la API de OpenAI configurada también puedes conversar sobre otros temas.'
    places=parse_places(question)
    if places:
        origin,dest=places
        steps=plan_route(origin,dest)
        if steps:
            label=format_plan(steps)
            return f'Para ir de {origin.title()} a {dest.title()}, mi propuesta es: {label}. {"Necesitas un transbordo." if len(steps)>1 else "Es un trayecto directo en la simulación."} Tarifa de referencia ficticia: $3.200 COP por bus. Estos recorridos y tiempos son académicos, no rutas oficiales ni servicios en vivo.'
        return ('No encuentro una conexión verificable en las rutas de prueba para esos dos lugares. '
                'En esta demostración puedes consultar Bello, Envigado, Laureles, Centro, Belén, Robledo, Itagüí, La América, Aranjuez y zonas conectadas. '
                'No te inventaré un bus que no esté en el catálogo.')
    if 'tarifa' in t or 'cuanto cuesta' in t or 'pasaje' in t or 'precio' in t:
        return 'En nuestra simulación académica, cada bus cuesta $3.200 COP (valor ficticio). No representa las tarifas reales de Medellín.'
    if any(x in t for x in ('rutas','buses','paraderos','lineas','bus puedo','que bus')):
        return 'Tenemos 5 rutas simuladas: WV-302 Bello–Envigado, WV-306 Laureles–Centro, WV-311 Belén–Robledo, WV-315 La América–Itagüí y WV-301 Circular Norte. Dime desde dónde sales y a dónde quieres ir para comparar opciones.'
    if any(x in t for x in ('wayvo','aplicacion','app','proyecto')):
        return 'Wayvo es un proyecto académico de movilidad urbana. Integra un mapa, rutas de prueba, GPS y un chat de orientación. Las ubicaciones reales de buses y las rutas oficiales todavía no están conectadas.'
    return ('Puedes preguntarme sobre las rutas y funciones de Wayvo. Para responder preguntas generales libremente, '
            'debemos configurar OPENAI_API_KEY en el backend. No voy a simular una respuesta de IA externa que no está conectada.')


def chat_reply(messages, location, fetch_json):
    """Return one natural-language answer; the external API is optional and server-side only."""
    question=messages[-1]['content']
    local=local_answer(question,location)
    # Public transport route choices and GPS are deterministic: the model may not change or invent them.
    if parse_places(question) or any(x in normalize(question) for x in ('donde estoy','mi ubicacion','ubicacion actual','donde me encuentro')):
        return {'answer':local,'source':'demo_route_engine','demo':True}
    if not os.environ.get('OPENAI_API_KEY'):
        return {'answer':local,'source':'demo_local','demo':True}
    # Coordinates are not needed for general chat, so never forward GPS data to OpenAI.
    location_note='No se proporcionan coordenadas GPS al modelo. No deduzcas direcciones ni paraderos.'
    instructions=(
        'Eres Wayvo IA, asistente amable y claro en español de una app de movilidad urbana y un chat de uso general. '
        'Puedes conversar sobre temas generales si te preguntan, con honestidad e incertidumbre apropiada. '
        'Sobre transporte público, SOLO recomienda rutas presentes en este catálogo SIMULADO. '
        'Nunca presentes rutas de prueba, tarifas de prueba, horarios ni buses como reales o en vivo. '
        'Nunca inventes transbordos, direcciones ni paraderos. Para consultas de origen y destino utiliza este resultado '\
        f'determinista si aplica: {local}. Catálogo de prueba: {json.dumps(DEMO_ROUTES,ensure_ascii=False)}. '
        +location_note+' Responde preferiblemente en 2-5 frases, salvo que pidan más detalle.'
    )
    payload={
        'model':os.environ.get('WAYVO_AI_MODEL','gpt-4.1-mini'),
        'instructions':instructions,
        'input':[{'role':m['role'],'content':('[Ubicación GPS omitida por privacidad]' if 'tu gps indica aproximadamente' in normalize(m['content']) else m['content'])} for m in messages[-12:]],
        'max_output_tokens':400,
        'store':False,
    }
    try:
        response=fetch_json('https://api.openai.com/v1/responses', json.dumps(payload).encode('utf-8'),
            {'Authorization':'Bearer '+os.environ['OPENAI_API_KEY'],'Content-Type':'application/json'})
        output='\n'.join(block.get('text','') for item in response.get('output',[])
                         for block in item.get('content',[]) if block.get('type')=='output_text').strip()
        if output:return {'answer':output,'source':'openai','demo':True}
    except (HTTPError,URLError,OSError,ValueError,KeyError,TimeoutError):
        pass
    return {'answer':local+'\n\n(La IA externa no está disponible; respuesta local de demostración.)','source':'demo_local','demo':True}
