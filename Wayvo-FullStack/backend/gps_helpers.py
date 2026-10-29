"""Validate small, explicitly saved GPS traces; never automatically collect them."""
import math


def valid_track(points):
    if not isinstance(points, list) or not 2 <= len(points) <= 1500:
        return None
    parsed = []
    for point in points:
        if not isinstance(point, dict): return None
        a, b, t = point.get('lat'), point.get('lng'), point.get('time')
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in (a, b, t)):
            return None
        if not (-90 <= a <= 90 and -180 <= b <= 180 and 0 <= t <= 4102444800000):
            return None
        if parsed and (t < parsed[-1]['time'] or t - parsed[0]['time'] > 8 * 3600_000):
            return None
        parsed.append({'lat': round(a, 6), 'lng': round(b, 6), 'time': int(t)})
    return parsed
