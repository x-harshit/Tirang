/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GpsLocation } from '../types';

// Default realistic tactical fallback coordinates (Mission Sector Alpha)
const DEFAULT_LAT = 37.7749;
const DEFAULT_LON = -122.4194;

let currentLocation: GpsLocation = {
  lat: DEFAULT_LAT,
  lon: DEFAULT_LON,
  accuracy: 12,
  isRealGps: false,
  status: 'SEARCHING',
  lastFixTime: Date.now(),
};

type LocationSubscriber = (loc: GpsLocation) => void;
const subscribers: Set<LocationSubscriber> = new Set();

function notifySubscribers() {
  subscribers.forEach((cb) => cb({ ...currentLocation }));
}

let watchId: number | null = null;
let simulatedIntervalId: ReturnType<typeof setInterval> | null = null;

export function initGpsTracking(): void {
  if (typeof window === 'undefined') return;

  if ('geolocation' in navigator) {
    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          currentLocation = {
            lat: Number(position.coords.latitude.toFixed(6)),
            lon: Number(position.coords.longitude.toFixed(6)),
            accuracy: Math.round(position.coords.accuracy),
            isRealGps: true,
            status: 'LOCKED',
            lastFixTime: Date.now(),
          };
          notifySubscribers();
        },
        (error) => {
          console.warn('Real GPS unavailable or denied, switching to simulated tactical coordinates:', error.message);
          enableSimulatedGps();
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 15000,
        }
      );
    } catch {
      enableSimulatedGps();
    }
  } else {
    enableSimulatedGps();
  }
}

function enableSimulatedGps(): void {
  if (simulatedIntervalId) return;

  currentLocation = {
    lat: DEFAULT_LAT,
    lon: DEFAULT_LON,
    accuracy: 8,
    isRealGps: false,
    status: 'SIMULATED',
    lastFixTime: Date.now(),
  };
  notifySubscribers();

  // Subtle tactical drift simulation every 5s
  simulatedIntervalId = setInterval(() => {
    // Drifts +/- 0.0001 (approx 10 meters)
    const dLat = (Math.random() - 0.5) * 0.00015;
    const dLon = (Math.random() - 0.5) * 0.00015;
    currentLocation = {
      ...currentLocation,
      lat: Number((currentLocation.lat + dLat).toFixed(6)),
      lon: Number((currentLocation.lon + dLon).toFixed(6)),
      accuracy: Math.floor(6 + Math.random() * 5),
      lastFixTime: Date.now(),
    };
    notifySubscribers();
  }, 5000);
}

export function getCurrentLocation(): GpsLocation {
  return { ...currentLocation };
}

export function subscribeToGps(cb: LocationSubscriber): () => void {
  subscribers.add(cb);
  cb({ ...currentLocation });
  return () => {
    subscribers.delete(cb);
  };
}

export function formatCoordinates(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir} ${Math.abs(lon).toFixed(4)}°${lonDir}`;
}
