import React, { useEffect, useId, useRef, useState } from 'react';
import { Building2, Check, Loader2, MapPin, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export interface AgencyOption {
  id: string;
  name: string;
  branch_name: string | null;
  address: string | null;
  postcode: string | null;
}

const place = (a: AgencyOption) => [a.address, a.postcode].filter(Boolean).join(', ');

/**
 * Search agencies by name, branch or postcode and pick one (search_agencies in 010).
 * Shows name, branch, address and postcode; never the agency code.
 */
const AgencyPicker: React.FC<{
  value: AgencyOption | null;
  onChange: (a: AgencyOption | null) => void;
  invalid?: boolean;
  id?: string;
}> = ({ value, onChange, invalid, id }) => {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AgencyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Search as the person types (short pause so we don't query on every key).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_agencies', { p_query: q });
      if (cancelled) return;
      setFailed(!!error);
      setResults((data as AgencyOption[] | null) ?? []);
      setActive(0);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Close the list when tapping elsewhere.
  useEffect(() => {
    const close = (e: MouseEvent | TouchEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, []);

  const pick = (a: AgencyOption) => {
    onChange(a);
    setOpen(false);
    setQuery('');
  };

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 p-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-accent">
          <Building2 className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-medium text-gray-900">
            <Check className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="truncate">{value.name}</span>
          </span>
          {value.branch_name && <span className="block text-sm text-gray-700">{value.branch_name} branch</span>}
          {place(value) && <span className="block truncate text-xs text-gray-500">{place(value)}</span>}
        </span>
        <button type="button" onClick={() => onChange(null)} className="text-sm font-medium text-primary hover:underline flex-shrink-0">
          Change
        </button>
      </div>
    );
  }

  const q = query.trim();
  const showList = open && q.length >= 2;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!showList || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        id={id}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Type the agency name, branch or postcode"
        className={cn('pl-9 pr-9', invalid && 'border-destructive')}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {showList && (
        <div id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 p-3 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Searching...</div>
          ) : failed ? (
            <div className="p-3 text-sm text-red-700">Could not search agencies. Please try again.</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">No agency matches "{q}". Check the spelling or try the postcode.</div>
          ) : (
            results.map((a, i) => (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(a)}
                className={cn('flex w-full items-start gap-3 border-b last:border-b-0 p-3 text-left', i === active && 'bg-gray-50')}
              >
                <Building2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <span className="min-w-0">
                  <span className="block font-medium text-gray-900">
                    {a.name}
                    {a.branch_name && <span className="font-normal text-gray-600"> · {a.branch_name}</span>}
                  </span>
                  {place(a) && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{place(a)}</span>
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}
      {!showList && !q && <p className="mt-1 text-xs text-gray-500">Start typing at least 2 letters.</p>}
    </div>
  );
};

export default AgencyPicker;
