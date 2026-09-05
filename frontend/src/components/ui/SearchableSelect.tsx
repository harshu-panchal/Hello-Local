import React, { useState, useRef, useEffect, useMemo } from "react";

export interface SearchableOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface SearchableSelectProps {
  id?: string;
  name?: string;
  options: SearchableOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  hasError?: boolean;
  clearLabel?: string; // e.g. "None (Root Category)" or "-- Select Header Category --"
  clearValue?: string | null; // Value to set when clearLabel option is clicked (default: null)
  className?: string;
  dropdownPlacement?: "bottom" | "auto";
}

export default function SearchableSelect({
  id,
  name,
  options,
  value,
  onChange,
  placeholder = "-- Select an option --",
  searchPlaceholder = "Search...",
  emptyMessage = "No matching options",
  disabled = false,
  hasError = false,
  clearLabel,
  clearValue = null,
  className = "",
  dropdownPlacement = "bottom",
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Find currently selected option
  const selectedOption = useMemo(() => {
    if (!value) return null;
    return options.find((opt) => opt.value === value) || null;
  }, [options, value]);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(query))
    );
  }, [options, searchQuery]);

  // Handle outside clicks to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("touchstart", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [isOpen]);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure render is complete
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSelect = (val: string | null) => {
    onChange(val);
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full text-left ${className}`}
      id={id ? `${id}-container` : undefined}
    >
      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => !prev);
            setSearchQuery("");
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full px-3 py-2 text-sm bg-white border rounded-lg flex items-center justify-between transition-all outline-none text-left min-h-[40px] ${
          hasError
            ? "border-red-400 focus:ring-2 focus:ring-red-500/20"
            : isOpen
            ? "border-rose-600 ring-2 ring-rose-600/20"
            : "border-neutral-300 hover:border-neutral-400 focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600"
        } ${disabled ? "bg-neutral-100 text-neutral-400 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`truncate pr-2 ${
            selectedOption ? "text-neutral-900 font-medium" : "text-neutral-500"
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>

        <span className="flex items-center gap-1.5 shrink-0 text-neutral-400">
          {/* Chevron Icon */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${
              isOpen ? "rotate-180 text-rose-600" : ""
            }`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          role="listbox"
          className={`absolute left-0 right-0 z-50 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${
            dropdownPlacement === "bottom" ? "top-full mt-1.5" : "top-full mt-1.5"
          }`}
        >
          {/* Integrated Search Bar */}
          <div className="p-2 border-b border-neutral-100 bg-neutral-50/80">
            <div className="relative flex items-center">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-2.5 text-neutral-400 pointer-events-none"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-neutral-800 placeholder:text-neutral-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-neutral-400 hover:text-neutral-600 p-0.5 rounded"
                  title="Clear search"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Options List */}
          <div className="max-h-56 overflow-y-auto py-1 overscroll-contain">
            {/* Clear / Default Option if provided and no search query */}
            {clearLabel && !searchQuery.trim() && (
              <button
                type="button"
                onClick={() => handleSelect(clearValue)}
                className={`w-full px-3.5 py-2 text-xs text-left flex items-center justify-between transition-colors ${
                  !value || value === clearValue
                    ? "bg-rose-50/80 font-semibold text-rose-700"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                }`}
              >
                <span>{clearLabel}</span>
                {(!value || value === clearValue) && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-rose-600 shrink-0"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )}

            {/* Filtered Options */}
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full px-3.5 py-2 text-xs text-left flex items-center justify-between transition-colors ${
                      isSelected
                        ? "bg-rose-50 font-semibold text-rose-700"
                        : "text-neutral-700 hover:bg-rose-50/50 hover:text-rose-700"
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="truncate">{opt.label}</div>
                      {opt.sublabel && (
                        <div className="text-[10px] text-neutral-400 font-normal">
                          {opt.sublabel}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-rose-600 shrink-0"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="py-6 px-4 text-center">
                <p className="text-xs text-neutral-500 font-medium">{emptyMessage}</p>
                {searchQuery && (
                  <p className="text-[11px] text-neutral-400 mt-1">
                    No results for &ldquo;{searchQuery}&rdquo;
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
