import { Upload } from 'lucide-react';

export type WorkspaceTab = 'analyse' | 'rapport' | 'export' | 'harness';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onTriggerUpload: () => void;
}

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'analyse', label: 'Analyse' },
  { id: 'rapport', label: 'Rapport' },
  { id: 'export', label: 'Export Pro' },
  { id: 'harness', label: 'DeepSeek Harness' },
];

export function TopBar({ activeTab, onSelectTab, onTriggerUpload }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 h-14 bg-[#0B0E14]/95 backdrop-blur-sm border-b border-[#1E2636] px-4 md:px-6 flex items-center justify-between gap-4 md:gap-8">
      {/* Zone 1: Single text wordmark */}
      <button
        type="button"
        onClick={() => onSelectTab('analyse')}
        className="text-lg font-bold tracking-tight text-slate-100 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
      >
        AcoustiqLab
      </button>

      {/* Zone 2: 4 clean single-line navigation links */}
      <nav
        aria-label="Navigation principale"
        className="flex items-center gap-4 md:gap-7 overflow-x-auto"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative py-4 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500 ${
                isActive ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-amber-500"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single primary action button */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={onTriggerUpload}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
        >
          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Importer un média</span>
        </button>
      </div>
    </header>
  );
}
