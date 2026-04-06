'use client';

export type MobileTab = 'grid' | 'frame' | 'feedback' | 'menu';

interface MobileNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  annotationCount?: number;
  isDesigner?: boolean;
}

export function MobileNav({ activeTab, onTabChange, annotationCount = 0, isDesigner }: MobileNavProps) {
  const tabs: { id: MobileTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: 'grid',
      label: 'Grid',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      id: 'frame',
      label: 'View',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="20" height="18" rx="2" />
          <line x1="2" y1="7" x2="22" y2="7" />
        </svg>
      ),
    },
    {
      id: 'feedback',
      label: 'Feedback',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
      badge: annotationCount > 0 ? annotationCount : undefined,
    },
    {
      id: 'menu',
      label: 'More',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="5" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="19" r="1" fill="currentColor" />
        </svg>
      ),
    },
  ];

  // In client mode, hide grid tab
  const visibleTabs = isDesigner ? tabs : tabs.filter(t => t.id !== 'grid');

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-end justify-around border-t"
      style={{
        background: 'var(--background)',
        borderColor: 'var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom, 8px)',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      {visibleTabs.map(tab => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex flex-col items-center gap-0.5 py-2 px-4 relative"
            style={{
              color: active ? 'var(--foreground)' : 'var(--muted)',
              opacity: active ? 1 : 0.6,
              minWidth: 64,
              minHeight: 44,
            }}
          >
            <div className="relative">
              {tab.icon}
              {tab.badge && (
                <span
                  className="absolute -top-1 -right-2 flex items-center justify-center rounded-full text-white"
                  style={{
                    background: 'var(--accent-orange)',
                    fontSize: 8,
                    fontWeight: 700,
                    width: 14,
                    height: 14,
                  }}
                >
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              )}
            </div>
            <span className="text-[9px] tracking-wide uppercase">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
