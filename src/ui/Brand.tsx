import { useId } from 'react';

export const APP_NAME = 'Map My Thoughts';

/** The app mark: a thought bubble with a small mind map inside. Same artwork as /favicon.svg. */
export function Logo({ size = 32 }: { size?: number }) {
  // Gradient ids must be unique when the logo appears more than once on a page.
  const gradient = `mmt-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <defs>
        <linearGradient id={gradient} x1="6" y1="4" x2="58" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5B3FD9" />
          <stop offset="0.55" stopColor="#C2449B" />
          <stop offset="1" stopColor="#FF8C42" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${gradient})`} />
      <g fill="#fff">
        <circle cx="20" cy="31" r="8.5" />
        <circle cx="29" cy="22" r="10" />
        <circle cx="41" cy="21.5" r="9.5" />
        <circle cx="48.5" cy="31.5" r="8" />
        <circle cx="40" cy="38" r="8.5" />
        <circle cx="27" cy="38" r="8.5" />
        <rect x="20" y="24" width="29" height="18" rx="6" />
        <circle cx="15.5" cy="49" r="3.6" />
        <circle cx="9.5" cy="55" r="2.2" />
      </g>
      <path
        d="M34 30 23.5 26.5M34 30 44 24.5M34 30 45 35.5M34 30 26 37"
        stroke="#5B3FD9"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="34" cy="30" r="5" fill="#5B3FD9" />
      <circle cx="23.5" cy="26.5" r="3" fill="#FF8C42" />
      <circle cx="44" cy="24.5" r="3" fill="#C2449B" />
      <circle cx="45" cy="35.5" r="3" fill="#2EC4B6" />
      <circle cx="26" cy="37" r="3" fill="#4D96FF" />
    </svg>
  );
}

/** Logo and name, as shown in the top bar. */
export function Wordmark() {
  return (
    <span className="brand">
      <Logo size={34} />
      <span className="brand__name">
        Map My <span className="brand__spark">Thoughts</span>
      </span>
    </span>
  );
}
