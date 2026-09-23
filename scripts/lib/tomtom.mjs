const AIRPORT = { latitude: 53.3537, longitude: -2.275 };
const RADIUS_KM = 40;

function distanceKm(a, b) {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * radians) *
    Math.cos(b.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function points(geometry) {
  const coordinates = geometry?.type === 'Point' ? [geometry.coordinates] :
    geometry?.type === 'LineString' ? geometry.coordinates : [];
  if (!Array.isArray(coordinates)) return [];
  return coordinates.filter((pair) => Array.isArray(pair) && pair.length >= 2 &&
    Number.isFinite(pair[0]) && Number.isFinite(pair[1]) &&
    Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90)
    .map(([longitude, latitude]) => ({ latitude, longitude }));
}

function category(icon) {
  if (icon === 'roadClosed') return 'closure';
  if (icon === 'roadWorks') return 'roadworks';
  if (['accident', 'jam', 'laneClosed', 'laneRestriction'].includes(icon)) return 'incident';
  return 'other';
}

export function normalizeTomTom(payload, generatedAt = Date.now()) {
  if (!Array.isArray(payload?.incidents)) throw new Error('TomTom response has no incidents array');
  const disruptions = [];
  for (const feature of payload.incidents) {
    const props = feature?.properties;
    const vertices = points(feature?.geometry);
    if (!props?.id || !vertices.length) continue;
    const nearest = vertices.reduce((best, point) =>
      distanceKm(AIRPORT, point) < distanceKm(AIRPORT, best) ? point : best);
    const distanceFromAirportKm = distanceKm(AIRPORT, nearest);
    if (distanceFromAirportKm > RADIUS_KM) continue;
    const kind = category(props.iconCategory);
    if (kind === 'other') continue;
    const rawDescription = props.events?.find((event) => typeof event.description === 'string')?.description;
    const description = (rawDescription || props.iconCategory).slice(0, 180);
    const road = (Array.isArray(props.roadNumbers) && props.roadNumbers[0]) || props.from || 'Road near Manchester Airport';
    disruptions.push({
      id: `tomtom:${props.id}`,
      road: String(road).slice(0, 80),
      category: kind,
      description,
      coordinate: nearest,
      coordinates: vertices.length > 1 ? vertices.filter((_, index) => index % Math.max(1, Math.ceil(vertices.length / 100)) === 0) : undefined,
      distanceFromAirportKm: Math.round(distanceFromAirportKm * 10) / 10,
      startedAt: Number.isFinite(Date.parse(props.startTime)) ? Date.parse(props.startTime) : null,
      expectedEndAt: Number.isFinite(Date.parse(props.endTime)) ? Date.parse(props.endTime) : null,
      active: props.timeValidity === 'present' || props.timeValidity === undefined,
    });
  }
  return {
    generatedAt,
    source: 'tomtom-orbis-incidents-v2',
    attribution: 'Traffic incident data © TomTom',
    searchRadiusKm: RADIUS_KM,
    disruptions,
  };
}
