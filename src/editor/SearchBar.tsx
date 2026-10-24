import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';

interface Props {
  query: string;
  count: number;
  index: number;
  onQuery: (query: string) => void;
  onStep: (delta: 1 | -1) => void;
  onClose: (selectCurrent: boolean) => void;
}

/** ⌘F search: Enter/↓ next, Shift+Enter/↑ previous, Escape closes and selects the match. */
export function SearchBar({ query, count, index, onQuery, onStep, onClose }: Props) {
  return (
    <div className="searchbar" role="search">
      <Search size={16} className="searchbar__icon" aria-hidden="true" />
      <input
        autoFocus
        className="searchbar__input"
        placeholder="Find in map"
        aria-label="Find in map"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'ArrowDown') {
            event.preventDefault();
            onStep(event.shiftKey ? -1 : 1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            onStep(-1);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose(true);
          }
        }}
      />
      <span className="searchbar__count" aria-live="polite">
        {query ? (count ? `${index + 1} of ${count}` : 'No matches') : ''}
      </span>
      <button
        className="icon-button"
        onClick={() => onStep(-1)}
        disabled={!count}
        aria-label="Previous match"
      >
        <ChevronUp size={16} />
      </button>
      <button
        className="icon-button"
        onClick={() => onStep(1)}
        disabled={!count}
        aria-label="Next match"
      >
        <ChevronDown size={16} />
      </button>
      <button className="icon-button" onClick={() => onClose(false)} aria-label="Close search">
        <X size={16} />
      </button>
    </div>
  );
}
