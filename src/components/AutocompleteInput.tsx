import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { debounce } from '../utils/stockSearch';
import { ios } from './iosStyles';

export interface Suggestion {
  symbol: string;
  name: string;
  exchange?: string;
  marketCap?: number;
}

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: Suggestion) => void;
  placeholder?: string;
  fetchSuggestions: (query: string) => Promise<Suggestion[]>;
  minChars?: number;
  className?: string;
}

export default function AutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder = 'Search...',
  fetchSuggestions,
  minChars = 2,
  className = '',
}: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounced search function.
  // debounce() wraps the callback, so eslint can't statically see its deps;
  // memoizing on fetchSuggestions + minChars is the intended behavior.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce(async (query: string) => {
      if (query.length < minChars) {
        setSuggestions([]);
        setIsLoading(false);
        setShowSuggestions(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const results = await fetchSuggestions(query);
        setSuggestions(results);
        setShowSuggestions(true);
        setSelectedIndex(-1);
      } catch (err) {
        console.error('Error fetching suggestions:', err);
        setError('Failed to fetch suggestions');
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300),
    [fetchSuggestions, minChars]
  );

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    if (newValue.length >= minChars) {
      debouncedSearch(newValue);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Handle suggestion selection
  const handleSelect = (suggestion: Suggestion) => {
    onChange(suggestion.symbol);
    onSelect(suggestion);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter' && value.length >= minChars) {
        // Trigger search on Enter if no suggestions shown
        debouncedSearch(value);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelect(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && dropdownRef.current) {
      const selectedElement = dropdownRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [selectedIndex]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          placeholder={placeholder}
          className={`${ios.input} pr-10`}
          autoComplete="off"
          autoCapitalize="characters"
          inputMode="text"
        />
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
          {isLoading ? (
            <Loader2 size={18} className="text-ios-tertiary animate-spin" />
          ) : (
            <Search size={18} className="text-ios-tertiary" />
          )}
        </div>
      </div>

      {showSuggestions && (suggestions.length > 0 || error) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1.5 bg-ios-card rounded-xl shadow-lg ring-1 ring-ios-separator max-h-60 overflow-auto"
        >
          {error ? (
            <div className="px-4 py-3 text-ios-subhead text-ios-red">{error}</div>
          ) : suggestions.length === 0 ? (
            <div className="px-4 py-3 text-ios-subhead text-ios-secondary">
              No results found
            </div>
          ) : (
            suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.symbol}-${index}`}
                type="button"
                onClick={() => handleSelect(suggestion)}
                className={`ios-row block w-full text-left pl-4 active:bg-ios-fill focus:bg-ios-fill focus:outline-none ${index === selectedIndex ? 'bg-ios-fill' : ''}`}
              >
                <div className="ios-row-content flex items-center justify-between py-2 pr-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-ios-headline text-ios-label">
                      {suggestion.symbol}
                    </div>
                    <div className="text-ios-footnote text-ios-secondary truncate">
                      {suggestion.name}
                    </div>
                  </div>
                  {suggestion.exchange && (
                    <div className="ml-2 text-ios-caption text-ios-tertiary shrink-0">
                      {suggestion.exchange}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

