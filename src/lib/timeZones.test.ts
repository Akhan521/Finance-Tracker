import { afterEach, describe, expect, test, vi } from 'vitest';
import { zoneCity, zoneFriendly, zoneGeneric, zoneRegion } from './timeZones';

afterEach(() => vi.restoreAllMocks());

describe('timeZones', () => {
  test.each([
    ['America/Los_Angeles', 'Los Angeles'],
    ['America/Argentina/Buenos_Aires', 'Buenos Aires'],
    ['UTC', 'UTC'],
    ['Etc/GMT+5', 'GMT+5'],
    ['America/', 'America/'],
  ])('zoneCity(%s)', (id, city) => expect(zoneCity(id)).toBe(city));

  test('zoneGeneric names the zone, and is empty for an unknown id', () => {
    expect(zoneGeneric('America/Los_Angeles')).toBe('Pacific Time');
    expect(zoneGeneric('Not/AZone')).toBe('');
  });

  test('zoneGeneric falls back to the long name', () => {
    const real = Intl.DateTimeFormat;
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (l: string, o: Intl.DateTimeFormatOptions) {
      return o.timeZoneName === 'longGeneric' ? { formatToParts: () => [] } : new real(l, o);
    } as unknown as typeof Intl.DateTimeFormat);
    expect(zoneGeneric('America/Los_Angeles')).toMatch(/Pacific/);
  });

  test('zoneFriendly', () => {
    expect(zoneFriendly('America/Los_Angeles')).toBe('Los Angeles (Pacific Time)');
    expect(zoneFriendly('UTC')).toBe('UTC');
    expect(zoneFriendly('Not/AZone')).toBe('AZone');
  });

  test.each([
    ['America/Los_Angeles', 'America'],
    ['Europe/Paris', 'Europe'],
    ['UTC', 'Other'],
    ['Etc/GMT+5', 'Other'],
  ])('zoneRegion(%s)', (id, region) => expect(zoneRegion(id)).toBe(region));
});
