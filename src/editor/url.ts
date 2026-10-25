/** A link to another map, or to one node in a map, inside this app. */
export interface InternalLink {
  mapId: string;
  nodeId: string | null;
}

const INTERNAL = /^#\/map\/([\w-]+)(?:\/node\/([\w-]+))?$/;

/** `#/map/<id>` or `#/map/<id>/node/<nodeId>`: kept relative so it survives a port change. */
export function internalLink(mapId: string, nodeId?: string | null): string {
  return nodeId ? `#/map/${mapId}/node/${nodeId}` : `#/map/${mapId}`;
}

export function parseInternalLink(link: string): InternalLink | null {
  const match = INTERNAL.exec(link.trim());
  return match ? { mapId: match[1]!, nodeId: match[2] ?? null } : null;
}

/**
 * Turns user input into a safe link target: an in-app link (`#/map/…`, or a full address of this
 * app, which is shortened to one), or a web or email address, adding https:// when no scheme is
 * given. Never javascript: or data: URLs. Returns '' if unusable.
 */
export function safeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (parseInternalLink(trimmed)) return trimmed;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const here = typeof window === 'undefined' ? null : window.location.origin;
    if (here && url.origin === here && parseInternalLink(url.hash)) return url.hash;
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}
