import { ChevronDown, ChevronRight, ChevronUp, Replace, Search, X } from 'lucide-react';

interface Props {
  query: string;
  count: number;
  index: number;
  onQuery: (query: string) => void;
  onStep: (delta: 1 | -1) => void;
  onClose: (selectCurrent: boolean) => void;
  /** the replace row is open */
  replacing: boolean;
  replacement: string;
  /** exact (case-insensitive) occurrences of the query, which is what Replace changes */
  occurrences: number;
  onToggleReplace: () => void;
  onReplacement: (text: string) => void;
  onReplace: () => void;
  onReplaceAll: () => void;
}

/**
 * ⌘F search: Enter/↓ next, Shift+Enter/↑ previous, Escape closes and selects the match.
 * ⌥⌘F (or the arrow) opens the replace row: Enter there replaces the current match.
 */
export function SearchBar(props: Props) {
  const { query, count, index, onQuery, onStep, onClose, replacing } = props;
  const keys = (event: React.KeyboardEvent<HTMLInputElement>, enter: () => void) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      enter();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    }
  };
  return (
    <div className={`searchbar${replacing ? ' is-replacing' : ''}`} role="search">
      <div className="searchbar__row">
        <button
          className="icon-button searchbar__toggle"
          onClick={props.onToggleReplace}
          aria-label={replacing ? 'Hide replace' : 'Show replace'}
          aria-expanded={replacing}
          title="Find and replace (⌥⌘F)"
        >
          {replacing ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <Search size={16} className="searchbar__icon" aria-hidden="true" />
        <input
          autoFocus
          className="searchbar__input"
          placeholder="Find in map"
          aria-label="Find in map"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              onStep(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              onStep(-1);
            } else keys(event, () => onStep(event.shiftKey ? -1 : 1));
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
      {replacing && (
        <div className="searchbar__row">
          <Replace size={16} className="searchbar__icon" aria-hidden="true" />
          <input
            autoFocus={!!query}
            className="searchbar__input"
            placeholder="Replace with"
            aria-label="Replace with"
            value={props.replacement}
            onChange={(event) => props.onReplacement(event.target.value)}
            onKeyDown={(event) => keys(event, props.onReplace)}
          />
          <span className="searchbar__count">{query ? `${props.occurrences} to replace` : ''}</span>
          <button
            className="button button--ghost searchbar__button"
            onClick={props.onReplace}
            disabled={!count || !props.occurrences}
          >
            Replace
          </button>
          <button
            className="button searchbar__button"
            onClick={props.onReplaceAll}
            disabled={!props.occurrences}
          >
            Replace all
          </button>
        </div>
      )}
    </div>
  );
}
