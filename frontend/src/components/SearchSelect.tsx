import { useMemo } from "react";

export type SearchOption = {
  id: string;
  label: string;
  disabled?: boolean;
  meta?: string;
};

type SearchSelectProps = {
  query: string;
  value: string;
  placeholder: string;
  emptyLabel: string;
  options: SearchOption[];
  showList: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (option: SearchOption) => void;
  onToggleList: (value: boolean) => void;
};

function filterOptions(options: SearchOption[], query: string) {
  const term = query.trim().toLowerCase();
  if (!term) {
    return options;
  }
  return options
    .filter((option) =>
      option.label.toLowerCase().includes(term) || option.id.toLowerCase().includes(term)
    );
}

export default function SearchSelect({
  query,
  value,
  placeholder,
  emptyLabel,
  options,
  showList,
  onQueryChange,
  onSelect,
  onToggleList
}: SearchSelectProps) {
  const filtered = useMemo(() => filterOptions(options, query), [options, query]);

  return (
    <div
      className={`search-select ${showList ? "is-open" : ""}`}
      onBlur={() => setTimeout(() => onToggleList(false), 150)}
      onFocus={() => onToggleList(true)}
    >
      <input
        className="search-input"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
          }
          if (event.key === "Escape") {
            onToggleList(false);
          }
        }}
        placeholder={placeholder}
      />
      {showList && (
        <div className="search-list">
          {filtered.length === 0 && (
            <div className="search-item search-item--empty">{emptyLabel}</div>
          )}
          {filtered.map((option) => (
            <button
              key={option.id}
              className={`search-item ${option.id === value ? "is-active" : ""} ${
                option.disabled ? "is-disabled" : ""
              }`}
              type="button"
              disabled={option.disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(option)}
            >
              <span>{option.label}</span>
              {option.meta && <span className="search-item-meta">{option.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
