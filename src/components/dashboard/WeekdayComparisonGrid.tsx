import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dashboardApi, type DashboardFilters, type FilterOptions } from "@/lib/dashboard";


const WASTE_TYPE_OPTIONS = ["Plate Waste", "Production Waste", "Bain Marie Waste", "Spoilage", "Other"];

interface WeekdayComparisonGridProps {
  filters: DashboardFilters;
  options?: FilterOptions;
}

export default function WeekdayComparisonGrid({ filters, options }: WeekdayComparisonGridProps) {
  const defaultWeeks = useMemo(() => options?.weeks.slice(-3).map((week) => week.value) ?? [], [options]);
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>(defaultWeeks);
  const [selectedWasteTypes, setSelectedWasteTypes] = useState<string[]>([]);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [weekSearch, setWeekSearch] = useState("");

  useEffect(() => {
    if (!defaultWeeks.length) return;
    setSelectedWeeks((current) => (current.length ? current : defaultWeeks));
  }, [defaultWeeks]);

  const { data } = useQuery({
    queryKey: ["weekday-comparison-grid", filters, selectedWeeks, selectedWasteTypes],
    queryFn: () => dashboardApi.getWeekdayComparisonGrid(filters, selectedWeeks, selectedWasteTypes),
    enabled: selectedWeeks.length > 0,
  });

  const weeks = data?.weeks ?? [];
  const rows = data?.rows ?? [];
  const availableWeeks = options?.weeks ?? [];
  const allWeeksSelected = availableWeeks.length > 0 && selectedWeeks.length === availableWeeks.length;
  const filteredWeeks = useMemo(() => {
    const query = weekSearch.trim().toLowerCase();
    if (!query) return availableWeeks;
    return availableWeeks.filter((week) => week.label.toLowerCase().includes(query));
  }, [availableWeeks, weekSearch]);

  const toggleWeek = (value: string) => {
    setSelectedWeeks((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  };

  const toggleAllWeeks = () => {
    setSelectedWeeks(allWeeksSelected ? [] : availableWeeks.map((week) => week.value));
  };

  const toggleWasteType = (value: string) => {
    setSelectedWasteTypes((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  };

  const weekTriggerText = selectedWeeks.length === 0
    ? "Search and select weeks"
    : allWeeksSelected
      ? "All weeks"
      : `${selectedWeeks.length} weeks selected`;

  return (
    <div className="chart-card space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Weekday Waste Comparison Grid</h3>
          <p className="text-xs text-muted-foreground mt-1">Compare weekday waste across selected weeks and waste types.</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Waste Type</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedWasteTypes([])}
              className={`rounded-full border px-3 py-1.5 text-xs ${selectedWasteTypes.length === 0 ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}
            >
              All Waste
            </button>
            {WASTE_TYPE_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => toggleWasteType(option)}
                className={`rounded-full border px-3 py-1.5 text-xs ${selectedWasteTypes.includes(option) ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Weeks</p>
          <Popover
            open={weekPickerOpen}
            onOpenChange={(nextOpen) => {
              setWeekPickerOpen(nextOpen);
              if (!nextOpen) setWeekSearch("");
            }}
          >
            <PopoverTrigger asChild>
              <button className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors hover:bg-muted/50">
                <span className={selectedWeeks.length ? "text-foreground" : "text-muted-foreground"}>{weekTriggerText}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-2" align="start">
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={weekSearch}
                  onChange={(event) => setWeekSearch(event.target.value)}
                  placeholder="Search weeks..."
                  className="h-9 pl-8 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-muted rounded">
                <Checkbox checked={allWeeksSelected} onCheckedChange={toggleAllWeeks} />
                <span className="font-medium">Select all</span>
              </label>
              <div className="my-1 h-px bg-border" />
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {filteredWeeks.length ? (
                  filteredWeeks.map((week) => (
                    <label key={week.value} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-muted rounded">
                      <Checkbox checked={selectedWeeks.includes(week.value)} onCheckedChange={() => toggleWeek(week.value)} />
                      <span>{week.label}</span>
                    </label>
                  ))
                ) : (
                  <p className="px-2 py-3 text-sm text-muted-foreground">No matching weeks found.</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.day} className="rounded-xl bg-background border border-border px-4 py-3">
            <div className="grid gap-3" style={{ gridTemplateColumns: `120px repeat(${Math.max(weeks.length, 1)}, minmax(0, 1fr))` }}>
              <div className="text-sm font-semibold text-foreground flex items-center">{row.day}</div>
              {weeks.map((week, index) => {
                const value = row.values[week.value] ?? 0;
                const isLatest = index === weeks.length - 1;
                return (
                  <div key={week.value} className={`rounded-lg px-3 py-2 ${isLatest ? "bg-primary/10" : "bg-card"}`}>
                    <p className="text-[11px] leading-snug text-muted-foreground">{week.label}</p>
                    <p className="mt-1 text-sm font-bold text-foreground">{value.toFixed(2)} kg</p>
                    {isLatest && row.latest_change_pct !== null ? (
                      <p className={`mt-1 text-xs font-medium ${row.latest_change_pct > 0 ? "text-destructive" : row.latest_change_pct < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                        {row.latest_change_pct > 0 ? "up" : row.latest_change_pct < 0 ? "down" : "flat"} {Math.abs(row.latest_change_pct).toFixed(1)}%
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
