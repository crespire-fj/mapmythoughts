import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Monitor, Moon, Search, Sparkles, Sun, X } from 'lucide-react';
import { MARKER_INFO } from '../editor/markers';
import { SHORTCUT_GROUPS } from '../editor/ShortcutHelp';
import { Artwork } from '../maps/Artwork';
import { TEMPLATES } from '../maps/templates';
import { MARKERS, THEME_IDS } from '../model/schema';
import { useColorMode } from '../theme/colorMode';
import { THEMES } from '../theme/themes';
import { APP_NAME, Wordmark } from '../ui/Brand';
import { GUIDE, QUICK_START, type Feature, type GuideVisual } from './content';

interface Props {
  /** section to scroll to on arrival, from #/guide/<section> */
  section: string | null;
  onExit: () => void;
}

/** Text with `backticked` keys drawn as keycaps. */
function Rich({ text }: { text: string }) {
  return <>{text.split('`').map((part, i) => (i % 2 ? <kbd key={i}>{part}</kbd> : part))}</>;
}

const plain = (text: string) => text.replaceAll('`', '');

function Visual({ kind }: { kind: GuideVisual }) {
  switch (kind) {
    case 'templates':
      return (
        <ul className="guide-visual guide-templates">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <span className="guide-templates__art">
                <Artwork
                  theme={t.settings.theme ?? 'lagoon'}
                  seed={t.id}
                  branches={Math.max(3, t.outline.length)}
                />
              </span>
              {t.name}
            </li>
          ))}
        </ul>
      );
    case 'themes':
      return (
        <ul className="guide-visual guide-themes">
          {THEME_IDS.map((id) => {
            const theme = THEMES[id];
            return (
              <li key={id}>
                <span
                  className="guide-themes__root"
                  style={{
                    background: `linear-gradient(135deg, ${theme.root[0]}, ${theme.root[1]})`,
                  }}
                />
                <span className="guide-themes__branches" aria-hidden="true">
                  {theme.branches.slice(0, 5).map((color) => (
                    <span key={color} style={{ background: color }} />
                  ))}
                </span>
                <span className="guide-themes__text">
                  <strong>{theme.name}</strong>
                  <small>{theme.description}</small>
                </span>
              </li>
            );
          })}
        </ul>
      );
    case 'shapes':
      return (
        <ul className="guide-visual guide-shapes" aria-label="Shapes">
          {(['rounded', 'pill', 'rect', 'underline'] as const).map((shape) => (
            <li key={shape} className={`guide-shape guide-shape--${shape}`}>
              {{ rounded: 'Rounded', pill: 'Pill', rect: 'Square', underline: 'Underline' }[shape]}
            </li>
          ))}
        </ul>
      );
    case 'markers':
      return (
        <ul className="guide-visual guide-markers">
          {MARKERS.map((marker) => {
            const { Icon, label, color } = MARKER_INFO[marker];
            return (
              <li key={marker}>
                <Icon size={16} color={color} aria-hidden="true" />
                {label}
              </li>
            );
          })}
        </ul>
      );
    case 'keyboard':
      return (
        <div className="guide-visual guide-keys">
          {SHORTCUT_GROUPS.map(([title, rows]) => (
            <section key={title}>
              <h4>{title}</h4>
              <dl>
                {rows.map(([keys, action]) => (
                  <div key={keys}>
                    <dt>
                      <kbd>{keys}</kbd>
                    </dt>
                    <dd>{action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      );
  }
}

/** A feature matches when every word is in its text, its pictures or its section's title. */
function matches(feature: Feature, section: string, words: string[]): boolean {
  if (!words.length) return true;
  let haystack = `${section} ${feature.title} ${plain(feature.text)}`;
  if (feature.visual === 'keyboard') haystack += SHORTCUT_GROUPS.flat(2).join(' ');
  if (feature.visual === 'themes') haystack += THEME_IDS.map((id) => THEMES[id].name).join(' ');
  if (feature.visual === 'templates') haystack += TEMPLATES.map((t) => t.name).join(' ');
  if (feature.visual === 'markers') haystack += MARKERS.map((m) => MARKER_INFO[m].label).join(' ');
  haystack = haystack.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** Everything the app can do, grouped by task, searchable, with pictures drawn from the app's own data. */
export function Guide({ section, onExit }: Props) {
  const [query, setQuery] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [active, setActive] = useState(GUIDE[0]!.id);
  const { preference, cycle } = useColorMode();
  const ColorIcon = preference === 'dark' ? Moon : preference === 'light' ? Sun : Monitor;
  const sectionRefs = useRef(new Map<string, HTMLElement>());

  const sections = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return GUIDE.map((s) => ({
      ...s,
      features: s.features.filter((f) => (!onlyNew || f.isNew) && matches(f, s.title, words)),
    })).filter((s) => s.features.length > 0);
  }, [query, onlyNew]);
  const total = sections.reduce((sum, s) => sum + s.features.length, 0);
  const filtering = query.trim() !== '' || onlyNew;

  useEffect(() => {
    document.title = `Guide · ${APP_NAME}`;
    return () => {
      document.title = APP_NAME;
    };
  }, []);

  // Arriving at #/guide/<section> scrolls there.
  useEffect(() => {
    if (section) sectionRefs.current.get(section)?.scrollIntoView({ block: 'start' });
  }, [section]);

  // The contents list highlights the section being read.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) {
          const top = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
          );
          setActive((top.target as HTMLElement).dataset.section!);
        }
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );
    for (const element of sectionRefs.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [sections]);

  const jump = (id: string) => {
    sectionRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#/guide/${id}`);
    setActive(id);
  };

  return (
    <div className="home guide">
      <header className="home__bar">
        <Wordmark />
        <div className="home__bar-actions">
          <button className="button" onClick={onExit}>
            <ArrowLeft size={16} /> Your maps
          </button>
          <button
            className="icon-button"
            onClick={cycle}
            aria-label={`Colour mode: ${preference}`}
            title={`Colour mode: ${preference}`}
          >
            <ColorIcon size={18} />
          </button>
        </div>
      </header>

      <section className="hero guide__hero">
        <p className="guide__eyebrow">Guide</p>
        <h1>Everything Map My Thoughts can do.</h1>
        <p>
          A tour of every feature, grouped by what you’re trying to do. Search for something, or
          start with the five keys below. They cover most of the work.
        </p>
        <ol className="guide-quick" aria-label="Quick start">
          {QUICK_START.map((step) => (
            <li key={step.keys}>
              <kbd>{step.keys}</kbd>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="guide__tools">
        <label className="filter guide__search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search features, e.g. “share”, “undo” or “⌥”"
            aria-label="Search features"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={15} />
            </button>
          )}
        </label>
        <button
          className={`chip guide__new-toggle${onlyNew ? ' is-active' : ''}`}
          aria-pressed={onlyNew}
          onClick={() => setOnlyNew((v) => !v)}
        >
          <Sparkles size={14} /> What’s new
        </button>
        {filtering && (
          <span className="guide__count" role="status">
            {total} feature{total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="home__layout guide__layout">
        <nav className="sidebar guide__toc" aria-label="Guide sections">
          {sections.map((s) => (
            <button
              key={s.id}
              className={`sidebar__item${active === s.id ? ' is-active' : ''}`}
              aria-current={active === s.id ? 'location' : undefined}
              onClick={() => jump(s.id)}
            >
              <s.Icon size={17} />
              <span className="sidebar__name">{s.title}</span>
              {filtering && <span className="sidebar__count">{s.features.length}</span>}
            </button>
          ))}
        </nav>

        <main className="home__main guide__main">
          {sections.length === 0 && (
            <div className="empty">
              <p>
                Nothing matches “{query}”. Try a shorter word, or{' '}
                <button
                  className="button button--ghost"
                  onClick={() => {
                    setQuery('');
                    setOnlyNew(false);
                  }}
                >
                  show everything
                </button>
              </p>
            </div>
          )}
          {sections.map((s) => (
            <section
              key={s.id}
              className="guide-section"
              data-section={s.id}
              aria-labelledby={`guide-${s.id}`}
              ref={(element) => {
                if (element) sectionRefs.current.set(s.id, element);
                else sectionRefs.current.delete(s.id);
              }}
            >
              <header className="guide-section__head">
                <span className="guide-section__icon" aria-hidden="true">
                  <s.Icon size={20} />
                </span>
                <div>
                  <h2 id={`guide-${s.id}`}>{s.title}</h2>
                  <p>
                    <Rich text={s.intro} />
                  </p>
                </div>
              </header>
              <div className="guide-grid">
                {s.features.map((f) => (
                  <article
                    key={f.title}
                    className={`guide-card${f.visual === 'keyboard' || f.visual === 'themes' || f.visual === 'templates' ? ' guide-card--wide' : ''}`}
                  >
                    <h3>
                      <span className="guide-card__icon" aria-hidden="true">
                        <f.Icon size={17} />
                      </span>
                      {f.title}
                      {f.isNew && <span className="guide-card__new">New</span>}
                    </h3>
                    <p>
                      <Rich text={f.text} />
                    </p>
                    {f.visual && <Visual kind={f.visual} />}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
