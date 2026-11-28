// Friendly names for IANA time zone ids. Pure helpers; ids stay the stored value.

/** "America/Los_Angeles" gives "Los Angeles"; "Etc/GMT+5" gives "GMT+5"; never empty. */
export function zoneCity(id: string): string {
  const last = id.split('/').pop() ?? '';
  return last.replace(/_/g, ' ').trim() || id;
}

function zoneName(id: string, style: 'longGeneric' | 'long'): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: style }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** "Pacific Time" for America/Los_Angeles; '' when the browser can't say. */
export function zoneGeneric(id: string): string {
  return zoneName(id, 'longGeneric') || zoneName(id, 'long');
}

/** "Los Angeles (Pacific Time)", or just the city when the generic name adds nothing. */
export function zoneFriendly(id: string): string {
  const city = zoneCity(id);
  const generic = zoneGeneric(id);
  return !generic || generic === city || zoneRegion(id) === 'Other' ? city : `${city} (${generic})`;
}

/** The first segment, for grouping; UTC and Etc go under "Other". */
export function zoneRegion(id: string): string {
  const first = id.includes('/') ? id.split('/')[0] : '';
  return !first || first === 'Etc' ? 'Other' : first;
}
