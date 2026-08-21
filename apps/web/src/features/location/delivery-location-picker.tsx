'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api/client';
import { useCurrentLocation } from './use-current-location';

export interface SelectedDeliveryLocation {
  provider: 'google' | 'osm';
  providerPlaceId: string | null;
  formattedAddress: string;
  addressLine1: string;
  addressLine2: string | null;
  locality: string;
  state: string;
  stateCode: string | null;
  postalCode: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

interface Suggestion {
  provider: 'google' | 'osm';
  providerPlaceId: string;
  description: string;
}

export default function DeliveryLocationPicker({
  onLocationSelected,
}: {
  onLocationSelected?: (location: SelectedDeliveryLocation) => void;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<SelectedDeliveryLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionToken = useRef(crypto.randomUUID());
  const current = useCurrentLocation();

  const choose = useCallback((location: SelectedDeliveryLocation) => {
    setSelected(location);
    setQuery(location.formattedAddress);
    setSuggestions([]);
    setError(null);
    sessionToken.current = crypto.randomUUID();
    onLocationSelected?.(location);
  }, [onLocationSelected]);

  useEffect(() => {
    if (query.trim().length < 3 || selected?.formattedAddress === query) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        input: query.trim(),
        country: 'IN',
        sessionToken: sessionToken.current,
      });
      void apiRequest<Suggestion[]>(`/location/autocomplete?${params}`, {
        signal: controller.signal,
      })
        .then(setSuggestions)
        .catch((caught: unknown) => {
          if ((caught as Error).name !== 'AbortError') {
            setError(caught instanceof Error ? caught.message : 'Address search failed.');
          }
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected?.formattedAddress]);

  useEffect(() => {
    if (!current.location) return;
    void apiRequest<SelectedDeliveryLocation>('/location/reverse-geocode', {
      method: 'POST',
      body: JSON.stringify(current.location),
    })
      .then(choose)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Current location could not be resolved.'))
      .finally(() => setBusy(false));
  }, [choose, current.location]);

  const selectSuggestion = async (suggestion: Suggestion) => {
    setBusy(true);
    setError(null);
    try {
      const location = await apiRequest<SelectedDeliveryLocation>('/location/geocode', {
        method: 'POST',
        body: JSON.stringify({ address: suggestion.description }),
      });
      choose(location);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Address could not be resolved.');
    } finally {
      setBusy(false);
    }
  };

  const mapUrl = selected
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${selected.longitude - 0.01}%2C${selected.latitude - 0.01}%2C${selected.longitude + 0.01}%2C${selected.latitude + 0.01}&marker=${selected.latitude}%2C${selected.longitude}&layer=mapnik`
    : null;

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-labelledby="delivery-location-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="delivery-location-heading" className="font-semibold">Pin delivery location</h3>
        <button type="button" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold" disabled={busy || current.loading} onClick={current.request}>
          {current.loading ? 'Locating…' : 'Use current location'}
        </button>
      </div>
      <div className="relative mt-3">
        <label htmlFor="delivery-location-search" className="text-sm font-medium">Search your address</label>
        <input
          id="delivery-location-search"
          className="form-input mt-1"
          value={query}
          autoComplete="street-address"
          placeholder="Start typing an Indian address"
          onChange={(event) => { setQuery(event.target.value); setSelected(null); setSuggestions([]); }}
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white shadow-lg" role="listbox">
            {suggestions.map((suggestion) => (
              <li key={`${suggestion.provider}-${suggestion.providerPlaceId}`}>
                <button type="button" className="w-full px-3 py-3 text-left text-sm hover:bg-blue-50" onClick={() => void selectSuggestion(suggestion)}>
                  {suggestion.description}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {(error || current.error) && <p role="alert" className="mt-2 text-sm text-red-700">{error ?? current.error}</p>}
      {busy && <p role="status" className="mt-2 text-sm text-slate-600">Resolving location…</p>}
      {selected && mapUrl && (
        <div className="mt-4 overflow-hidden rounded-lg border bg-white">
          <iframe title="Selected delivery location" src={mapUrl} className="h-52 w-full" loading="lazy" referrerPolicy="no-referrer" />
          <p className="p-3 text-sm"><strong>Selected pin:</strong> {selected.formattedAddress}</p>
        </div>
      )}
    </section>
  );
}
