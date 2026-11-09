import { Tabs } from '@care/ui';
import { createContext, useContext, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

/** How many tab levels wrap the current content (0 = a page of its own). */
const SectionDepth = createContext(0);

/**
 * True inside a tab: a page shown there renders a section header instead of its
 * own page header, because the page around it already has the title.
 */
export function useEmbedded() {
  return useContext(SectionDepth) > 0;
}

/**
 * Splits a page that holds several separate jobs into tabs, one job at a time.
 * The open tab lives in the URL so a link or reload returns to it: `?tab=` for
 * the page's tabs and `?section=` for tabs inside a tab. Switching keeps other
 * URL state (filters, an import preview) and drops only paging and inner tabs.
 */
export function AdminSections({
  label,
  sections,
}: {
  label: string;
  sections: { value: string; label: string; content: ReactNode }[];
}) {
  const depth = useContext(SectionDepth);
  const param = depth === 0 ? 'tab' : 'section';
  const [searchParams, setSearchParams] = useSearchParams();
  const first = sections[0]!.value;
  const requested = searchParams.get(param);
  const value = sections.some((section) => section.value === requested) ? requested! : first;
  return (
    <div className="admin-sections" data-depth={depth}>
      <Tabs
        label={label}
        defaultValue={first}
        value={value}
        onValueChange={(next) => {
          const params = new URLSearchParams(searchParams);
          params.delete('cursor');
          params.delete('cursorHistory');
          if (param === 'tab') params.delete('section');
          if (next !== first) params.set(param, next);
          else params.delete(param);
          setSearchParams(params, { replace: true });
        }}
        items={sections.map((section) => ({
          ...section,
          content: (
            <SectionDepth.Provider value={depth + 1}>{section.content}</SectionDepth.Provider>
          ),
        }))}
      />
    </div>
  );
}
