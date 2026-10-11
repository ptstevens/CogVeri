import { useCallback, useRef, KeyboardEvent } from 'react';
import { LucideIcon } from 'lucide-react';

export interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'underline' | 'pills';
  fullWidth?: boolean;
  className?: string;
}

const Tabs = ({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  fullWidth = false,
  className = '',
}: TabsProps) => {
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      const enabledTabs = tabs.filter((tab) => !tab.disabled);
      const enabledTabIds = enabledTabs.map((tab) => tab.id);
      const currentEnabledIndex = enabledTabIds.indexOf(tabs[currentIndex].id);

      let newIndex: number | null = null;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          if (currentEnabledIndex > 0) {
            newIndex = tabs.findIndex((tab) => tab.id === enabledTabIds[currentEnabledIndex - 1]);
          } else {
            newIndex = tabs.findIndex((tab) => tab.id === enabledTabIds[enabledTabIds.length - 1]);
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (currentEnabledIndex < enabledTabIds.length - 1) {
            newIndex = tabs.findIndex((tab) => tab.id === enabledTabIds[currentEnabledIndex + 1]);
          } else {
            newIndex = tabs.findIndex((tab) => tab.id === enabledTabIds[0]);
          }
          break;
        case 'Home':
          event.preventDefault();
          newIndex = tabs.findIndex((tab) => tab.id === enabledTabIds[0]);
          break;
        case 'End':
          event.preventDefault();
          newIndex = tabs.findIndex((tab) => tab.id === enabledTabIds[enabledTabIds.length - 1]);
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (!tabs[currentIndex].disabled) {
            onChange(tabs[currentIndex].id);
          }
          break;
      }

      if (newIndex !== null && newIndex >= 0) {
        tabsRef.current[newIndex]?.focus();
        onChange(tabs[newIndex].id);
      }
    },
    [tabs, onChange]
  );

  const underlineClasses = {
    container: 'border-b border-gray-200',
    tab: (isActive: boolean, isDisabled: boolean) =>
      `relative py-3 px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-inset ${
        isDisabled
          ? 'text-gray-300 cursor-not-allowed'
          : isActive
            ? 'text-primary-600'
            : 'text-gray-500 hover:text-gray-700'
      }`,
    indicator: 'absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600',
  };

  const pillsClasses = {
    container: 'bg-gray-100 p-1 rounded-lg',
    tab: (isActive: boolean, isDisabled: boolean) =>
      `py-2 px-4 text-sm font-medium rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 ${
        isDisabled
          ? 'text-gray-300 cursor-not-allowed'
          : isActive
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
      }`,
    indicator: '',
  };

  const styles = variant === 'underline' ? underlineClasses : pillsClasses;

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`flex ${fullWidth ? 'w-full' : 'w-fit'} ${styles.container} ${className}`}
    >
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            ref={(el) => (tabsRef.current[index] = el)}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`${styles.tab(isActive, !!tab.disabled)} ${
              fullWidth ? 'flex-1' : ''
            } flex items-center justify-center gap-2`}
          >
            {Icon && (
              <Icon className={`h-4 w-4 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} />
            )}
            <span>{tab.label}</span>
            {variant === 'underline' && isActive && <span className={styles.indicator} />}
          </button>
        );
      })}
    </div>
  );
};

export default Tabs;
