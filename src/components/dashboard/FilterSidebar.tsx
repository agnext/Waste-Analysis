import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format, subMonths } from "date-fns";
import { CalendarIcon, ChevronDown, Filter, RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DashboardFilters, FilterOptions } from "@/lib/dashboard";
import { getDeviceLocationMap, getInitialDevices, getDeviceDetails } from "@/lib/device-utils";


interface DropdownOption {
  label: string;
  value: string;
  tooltip?: string;
}

interface MultiSelectDropdownProps {
  label: string;
  placeholder: string;
  options: DropdownOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchPlaceholder?: string;
  enableSearch?: boolean;
}

function TruncatedOptionText({
  fullText,
  customTooltip,
  children,
  className = "",
}: {
  fullText: string;
  customTooltip?: string;
  children: ReactNode;
  className?: string;
}) {
  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  const checkOverflow = () => {
    if (textRef.current) {
      setIsOverflowing(textRef.current.scrollWidth > textRef.current.clientWidth);
    }
  };

  const title = customTooltip || (isOverflowing ? fullText : undefined);

  return (
    <span
      ref={textRef}
      onMouseEnter={checkOverflow}
      title={title}
      className={`truncate ${className}`}
    >
      {children}
    </span>
  );
}


function MultiSelectDropdown({
  label,
  placeholder,
  options,
  selected,
  onChange,
  searchPlaceholder = "Search...",
  enableSearch = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!enableSearch || !search) return options;
    return options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));
  }, [options, search, enableSearch]);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);
  };

  const selectAll = () => onChange(options.map((o) => o.value));
  const clearAll = () => onChange([]);

  const summaryText = useMemo(() => {
    if (!selected.length) return placeholder;
    if (selected.length === options.length) return "All selected";
    if (selected.length <= 2) {
      return selected
        .map((val) => options.find((o) => o.value === val)?.label || val)
        .join(", ");
    }
    return `${selected.length} selected`;
  }, [selected, options, placeholder]);

  const renderLabelWithSmallParens = (labelStr: string) => {
    const match = labelStr.match(/^(.*?)(\s*\([^)]+\))$/);
    if (match) {
      return (
        <>
          <span>{match[1]}</span>
          <span className="text-[10.5px] text-muted-foreground ml-1 font-normal opacity-90">
            {match[2]}
          </span>
        </>
      );
    }
    return labelStr;
  };

  const summaryDisplay = useMemo(() => {
    if (!selected.length) return placeholder;
    if (selected.length === options.length) return "All selected";
    if (selected.length <= 2) {
      return selected.map((val, idx) => {
        const opt = options.find((o) => o.value === val);
        const labelStr = opt?.label || val;
        return (
          <span key={val}>
            {idx > 0 && ", "}
            {renderLabelWithSmallParens(labelStr)}
          </span>
        );
      });
    }
    return `${selected.length} selected`;
  }, [selected, options, placeholder]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between text-left text-xs bg-muted/50 hover:bg-muted border border-border/60 rounded-md px-2.5 py-1.5 transition-colors"
        >
          <TruncatedOptionText fullText={summaryText} className="text-foreground font-normal">
            {summaryDisplay}
          </TruncatedOptionText>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-1 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-2 bg-popover text-popover-foreground border border-border shadow-md rounded-md z-50"
        align="start"
      >
        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/50 text-[11px]">
          <span className="font-medium text-foreground">{label}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={selectAll}
              className="text-primary hover:underline"
            >
              All
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>

        {enableSearch && (
          <div className="relative mb-1.5">
            <Search className="w-3 h-3 absolute left-2 top-2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-7 text-xs pl-6 bg-background border-border/60"
            />
          </div>
        )}

        <div className="max-h-48 overflow-y-auto space-y-1">
          {filtered.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-0 py-1 rounded text-xs hover:bg-muted/60 cursor-pointer select-none"
            >
              <Checkbox
                checked={selected.includes(opt.value)}
                onCheckedChange={() => toggle(opt.value)}
                className="h-3.5 w-3.5 shrink-0"
              />
              <TruncatedOptionText
                fullText={opt.label}
                customTooltip={opt.tooltip}
                className="text-foreground font-normal"
              >
                {renderLabelWithSmallParens(opt.label)}
              </TruncatedOptionText>
            </label>
          ))}
          {!filtered.length && (
            <p className="text-[11px] text-muted-foreground text-center py-2">No matching {label.toLowerCase()} found.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface SingleSelectDropdownProps {
  label: string;
  placeholder?: string;
  options: DropdownOption[];
  selected: string;
  onChange: (selected: string) => void;
}

function SingleSelectDropdown({
  label,
  placeholder = "Select...",
  options,
  selected,
  onChange,
}: SingleSelectDropdownProps) {
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((o) => o.value === selected);
  const displayText = selectedOption ? selectedOption.label : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between text-left text-xs bg-muted/50 hover:bg-muted border border-border/60 rounded-md px-2.5 py-1.5 transition-colors"
        >
          <TruncatedOptionText fullText={displayText} className="text-foreground font-normal">
            {displayText}
          </TruncatedOptionText>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-1 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-2 bg-popover text-popover-foreground border border-border shadow-md rounded-md z-50"
        align="start"
      >
        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/50 text-[11px]">
          <span className="font-medium text-foreground">{label}</span>
          <button
            type="button"
            onClick={() => {
              onChange("All Days");
              setOpen(false);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>

        <div className="space-y-1">
          {options.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left transition-colors ${
                  isSelected
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted/60 text-foreground"
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface FilterSidebarProps {
  options?: FilterOptions;
  onApply: (filters: DashboardFilters) => void;
}


export default function FilterSidebar({ options, onApply }: FilterSidebarProps) {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => subMonths(new Date(), 1));
  const [dateTo, setDateTo] = useState<Date | undefined>(() => new Date());
  const [devices, setDevices] = useState<string[]>(getInitialDevices());
  const [meals, setMeals] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [wasteTypes, setWasteTypes] = useState<string[]>([]);
  const [dayType, setDayType] = useState<string>("All Days");

  useEffect(() => {
    if (!options) return;
    setDateFrom(subMonths(new Date(), 1));
    setDateTo(new Date());
    setDevices(getInitialDevices());
    setMeals([]);
    setCategories([]);
    setWeeks([]);
    setWasteTypes([]);
    setDayType("All Days");
  }, [options]);

  const deviceOptions = useMemo<DropdownOption[]>(() => {
    const deviceMap = getDeviceLocationMap();
    const searchStr = typeof window !== "undefined" ? window.location.search : "";
    const searchParams = new URLSearchParams(searchStr);
    const urlDevice = searchParams.get("device") || searchParams.get("devices");

    if (urlDevice) {
      return getInitialDevices(deviceMap).map((id) => {
        const details = getDeviceDetails(id, deviceMap);
        return {
          label: details.label,
          value: id,
          tooltip: details.tooltip,
        };
      });
    }

    const backendDevices = options?.devices || [];
    const available = Array.from(new Set([...backendDevices, ...getInitialDevices(deviceMap)]));
    return available.map((id) => {
      const details = getDeviceDetails(id, deviceMap);
      return {
        label: details.label,
        value: id,
        tooltip: details.tooltip,
      };
    });
  }, [options?.devices, typeof window !== "undefined" ? window.location.search : ""]);
  const mealOptions = useMemo<DropdownOption[]>(() => (options?.meal_types ?? []).map((item) => ({ label: item, value: item })), [options?.meal_types]);
  const categoryOptions = useMemo<DropdownOption[]>(() => (options?.categories ?? []).map((item) => ({ label: item, value: item })), [options?.categories]);
  const wasteTypeOptions = useMemo<DropdownOption[]>(() => (options?.waste_types ?? []).map((item) => ({ label: item, value: item })), [options?.waste_types]);
  const dayTypeOptions = useMemo<DropdownOption[]>(() => [
    { label: "All Days", value: "All Days" },
    { label: "WeekDays", value: "WeekDays" },
    { label: "Weekend", value: "Weekend" },
  ], []);
  const weekOptions = useMemo<DropdownOption[]>(() => (options?.weeks ?? []).map((item) => ({ label: item.label, value: item.value })), [options?.weeks]);

  const apply = () => {
    let finalDateFrom = dateFrom ? format(dateFrom, "yyyy-MM-dd") : undefined;
    let finalDateTo = dateTo ? format(dateTo, "yyyy-MM-dd") : undefined;
    if (weeks.length && options?.weeks?.length) {
      const selected = options.weeks.filter((item) => weeks.includes(item.value));
      if (selected.length) {
        const sorted = selected
          .map((item) => ({ start: item.start_date, end: item.end_date }))
          .sort((a, b) => a.start.localeCompare(b.start));
        finalDateFrom = sorted[0].start;
        finalDateTo = sorted[sorted.length - 1].end;
      }
    }
    onApply({
      dateFrom: finalDateFrom,
      dateTo: finalDateTo,
      devices: devices.length ? devices : getInitialDevices(),
      mealTypes: meals,
      categories,
      weeks,
      wasteTypes,
      dayTypes: dayType && dayType !== "All Days" ? [dayType] : [],
    });
  };

  const reset = () => {
    const defaultFrom = subMonths(new Date(), 1);
    const defaultTo = new Date();
    setDateFrom(defaultFrom);
    setDateTo(defaultTo);
    setDevices(getInitialDevices());
    setMeals([]);
    setCategories([]);
    setWeeks([]);
    setWasteTypes([]);
    setDayType("All Days");
    onApply({
      dateFrom: format(defaultFrom, "yyyy-MM-dd"),
      dateTo: format(defaultTo, "yyyy-MM-dd"),
      devices: getInitialDevices(),
      mealTypes: [],
      categories: [],
      weeks: [],
      wasteTypes: [],
      dayTypes: [],
    });
  };

  return (
    <aside className="w-64 shrink-0 bg-card border-r border-border h-screen sticky top-0 flex flex-col no-print">
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Filters</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Device</label>
          <MultiSelectDropdown
            label="Devices"
            placeholder="All devices"
            options={deviceOptions}
            selected={devices}
            onChange={setDevices}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Date Range</label>
          <div className="space-y-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center justify-between px-3 py-2 text-sm border border-border rounded bg-card text-foreground hover:bg-muted/50 transition-colors">
                  <span className={dateFrom ? "text-foreground" : "text-muted-foreground"}>{dateFrom ? format(dateFrom, "MMM d, yyyy") : "Select start date"}</span>
                  <CalendarIcon className="h-3.5 w-3.5 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center justify-between px-3 py-2 text-sm border border-border rounded bg-card text-foreground hover:bg-muted/50 transition-colors">
                  <span className={dateTo ? "text-foreground" : "text-muted-foreground"}>{dateTo ? format(dateTo, "MMM d, yyyy") : "Select end date"}</span>
                  <CalendarIcon className="h-3.5 w-3.5 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Meal Type</label>
          <MultiSelectDropdown
            label="Meal types"
            placeholder="All meal types"
            options={mealOptions}
            selected={meals}
            onChange={setMeals}
            searchPlaceholder="Search meal types..."
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
          <MultiSelectDropdown
            label="Categories"
            placeholder="All categories"
            options={categoryOptions}
            selected={categories}
            onChange={setCategories}
            searchPlaceholder="Search categories..."
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Waste Type</label>
          <MultiSelectDropdown
            label="Waste types"
            placeholder="All waste types"
            options={wasteTypeOptions}
            selected={wasteTypes}
            onChange={setWasteTypes}
            searchPlaceholder="Search waste types..."
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Day Type</label>
          <SingleSelectDropdown
            label="Day type"
            placeholder="All Days"
            options={dayTypeOptions}
            selected={dayType}
            onChange={setDayType}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Week</label>
          <MultiSelectDropdown
            label="Weeks"
            placeholder="Search and select weeks"
            options={weekOptions}
            selected={weeks}
            onChange={setWeeks}
            searchPlaceholder="Search weeks..."
            enableSearch
          />
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border space-y-2">
        <Button onClick={apply} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-sm">
          Apply Filters
        </Button>
        <Button onClick={reset} variant="outline" className="w-full h-9 text-sm">
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Reset
        </Button>
      </div>
    </aside>
  );
}
