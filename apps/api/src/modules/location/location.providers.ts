import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
LocationProvider,
LocationSuggestion,
NormalizedLocation,
} from './location.types';
const timeout = async (url: string, init?: RequestInit) => {
const controller = new AbortController(),
  timer = setTimeout(() => controller.abort(), 5000);
try {
  const r = await fetch(url, { ...init, signal: controller.signal });
  if (!r.ok) throw new Error('provider');
  return (await r.json()) as unknown;
} catch {
  throw new BadGatewayException('Location provider is unavailable');
} finally {
  clearTimeout(timer);
}
};
type GoogleComponent = {
longText?: string;
shortText?: string;
types?: string[];
};
type GooglePlace = {
id?: string;
formattedAddress?: string;
location?: { latitude?: number; longitude?: number };
addressComponents?: GoogleComponent[];
};
const gc = (p: GooglePlace, type: string, short = false) => {
const x = p.addressComponents?.find((c) => c.types?.includes(type));
return (short ? x?.shortText : x?.longText) ?? '';
};
const googleNormalize = (p: GooglePlace): NormalizedLocation => ({
provider: 'google',
providerPlaceId: p.id ?? null,
formattedAddress: p.formattedAddress ?? '',
addressLine1:
  [gc(p, 'street_number'), gc(p, 'route')].filter(Boolean).join(' ') ||
  gc(p, 'sublocality'),
addressLine2: null,
locality: gc(p, 'locality') || gc(p, 'administrative_area_level_2'),
district: gc(p, 'administrative_area_level_2') || null,
state: gc(p, 'administrative_area_level_1'),
stateCode: gc(p, 'administrative_area_level_1', true) || null,
postalCode: gc(p, 'postal_code'),
country: gc(p, 'country'),
countryCode: gc(p, 'country', true),
latitude: p.location?.latitude ?? 0,
longitude: p.location?.longitude ?? 0,
});
@Injectable()
export class GoogleLocationProvider implements LocationProvider {
private readonly key: string;
constructor(c: ConfigService) {
  this.key = c.get<string>('GOOGLE_MAPS_SERVER_API_KEY') || '';
}
private require() {
  if (!this.key)
    throw new BadGatewayException('Location provider is not configured');
}
async autocomplete(
  input: string,
  country: string,
  latitude?: number,
  longitude?: number,
  sessionToken?: string,
) {
  this.require();
  const body = {
    input,
    includedRegionCodes: [country.toLowerCase()],
    sessionToken,
    ...(latitude != null &&
      longitude != null && {
        locationBias: {
          circle: { center: { latitude, longitude }, radius: 50000 },
        },
      }),
  };
  const x = (await timeout(
    'https://places.googleapis.com/v1/places:autocomplete',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': this.key,
        'X-Goog-FieldMask':
          'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
      },
      body: JSON.stringify(body),
    },
  )) as {
    suggestions?: {
      placePrediction?: { placeId?: string; text?: { text?: string } };
    }[];
  };
  return (x.suggestions ?? [])
    .slice(0, 10)
    .flatMap<LocationSuggestion>((s) =>
      s.placePrediction?.placeId
        ? [
            {
              provider: 'google',
              providerPlaceId: s.placePrediction.placeId,
              description: s.placePrediction.text?.text ?? '',
            },
          ]
        : [],
    );
}
async geocode(address: string) {
  this.require();
  const x = (await timeout(
    `https://geocode.googleapis.com/v4beta/geocode/address/${encodeURIComponent(address)}`,
    { headers: { 'X-Goog-Api-Key': this.key } },
  )) as { results?: GooglePlace[] };
  if (!x.results?.[0])
    throw new BadGatewayException('Location could not be resolved');
  return googleNormalize(x.results[0]);
}
async reverseGeocode(latitude: number, longitude: number) {
  this.require();
  const x = (await timeout(
    `https://geocode.googleapis.com/v4beta/geocode/location/${latitude},${longitude}`,
    { headers: { 'X-Goog-Api-Key': this.key } },
  )) as { results?: GooglePlace[] };
  if (!x.results?.[0])
    throw new BadGatewayException('Location could not be resolved');
  return googleNormalize(x.results[0]);
}
}
type OsmPlace = {
place_id?: number | string;
display_name?: string;
lat?: string;
lon?: string;
address?: Record<string, string>;
};
const osmNormalize = (p: OsmPlace): NormalizedLocation => {
const a = p.address ?? {};
return {
  provider: 'osm',
  providerPlaceId: String(p.place_id ?? ''),
  formattedAddress: p.display_name ?? '',
  addressLine1:
    [a.house_number, a.road].filter(Boolean).join(' ') || a.suburb || '',
  addressLine2: null,
  locality: a.city || a.town || a.village || '',
  district: a.state_district || a.county || null,
  state: a.state || '',
  stateCode: a['ISO3166-2-lvl4'] || null,
  postalCode: a.postcode || '',
  country: a.country || '',
  countryCode: (a.country_code || '').toUpperCase(),
  latitude: Number(p.lat),
  longitude: Number(p.lon),
};
};
@Injectable()
export class OpenStreetMapLocationProvider implements LocationProvider {
private readonly base: string;
constructor(c: ConfigService) {
  this.base = (
    c.get<string>('NOMINATIM_BASE_URL') ||
    'https://nominatim.openstreetmap.org'
  ).replace(/\/$/, '');
}

async autocomplete(
input: string,
country: string,
): Promise<LocationSuggestion[]> {
const x = (await timeout(
  `${this.base}/search?format=jsonv2&addressdetails=1&limit=10&countrycodes=${encodeURIComponent(country)}&q=${encodeURIComponent(input)}`,
  { headers: { 'User-Agent': 'commerce-platform-location/1.0' } },
)) as OsmPlace[];

return x
  .slice(0, 10)
  .map<LocationSuggestion>((p) => ({
    provider: 'osm',
    providerPlaceId: String(p.place_id),
    description: p.display_name ?? '',
  }));
}
async geocode(address: string) {
  const x = (await timeout(
    `${this.base}/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(address)}`,
    { headers: { 'User-Agent': 'commerce-platform-location/1.0' } },
  )) as OsmPlace[];
  if (!x[0]) throw new BadGatewayException('Location could not be resolved');
  return osmNormalize(x[0]);
}
async reverseGeocode(latitude: number, longitude: number) {
  const p = (await timeout(
    `${this.base}/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`,
    { headers: { 'User-Agent': 'commerce-platform-location/1.0' } },
  )) as OsmPlace;
  return osmNormalize(p);
}
}
