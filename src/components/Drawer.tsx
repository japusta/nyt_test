import type { FeedMode } from '../features/news/newsSlice'

interface DrawerProps {
  open: boolean
  onClose: () => void
  onSelectMode: (m: FeedMode) => void
  current: FeedMode
  categories: string[]
  onCategorySelect?: (category: string) => void
}

// Drawer appears as a slide-in panel from the left. It renders a list of
// categories at the top followed by toggles to switch between Archive
// and TimesWire feeds. The categories array is passed down from App
// allowing the UI to be easily customised. Selecting a category calls
// onCategorySelect and closes the drawer.
export default function Drawer({ open, onClose, onSelectMode, current, categories, onCategorySelect }: DrawerProps) {
  return (
    <div className={'drawer' + (open ? ' open' : '')} style={{ display: open ? 'grid' : 'none' }}>
      <div className="drawer__backdrop" onClick={onClose} />
      <div className="drawer__panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>Menu</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6l-12 12" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {/* Category filters */}
        <div style={{ marginBottom: 16 }}>
          {categories.map((cat) => (
            <div
              key={cat}
              className="menu-item"
              role="button"
              onClick={() => {
                onCategorySelect?.(cat)
                onClose()
              }}
            >
              {cat}
            </div>
          ))}
        </div>
        {/* Feed mode toggles */}
        <div
          className="menu-item"
          role="button"
          aria-pressed={current === 'archive'}
          onClick={() => {
            onSelectMode('archive')
            onClose()
          }}
        >
          Load via Archive {current === 'archive' ? '✓' : ''}
        </div>
        <div
          className="menu-item"
          role="button"
          aria-pressed={current === 'timeswire'}
          onClick={() => {
            onSelectMode('timeswire')
            onClose()
          }}
        >
          Load via TimesWire {current === 'timeswire' ? '✓' : ''}
        </div>
        <div className="menu-item">About</div>
      </div>
    </div>
  )
}