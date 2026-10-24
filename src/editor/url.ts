/**
 * Turns user input into a safe link target: adds https:// when no scheme is given and allows
 * only web and email links (never javascript: or data: URLs). Returns '' if unusable.
 */
export function safeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}
