import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { dashboardApi, type DashboardFilters } from "@/lib/dashboard";


const WASTE_TYPE_OPTIONS = ["Plate Waste", "Production Waste", "Bain Marie Waste", "Spoilage", "Other"];


interface MealTypeBreakdownProps {
  filters: DashboardFilters;
}


export default function MealTypeBreakdown({ filters }: MealTypeBreakdownProps) {
  const [selectedWasteType, setSelectedWasteType] = useState("Plate Waste");
  const { data = [] } = useQuery({
    queryKey: ["meal-type-breakdown", filters, selectedWasteType],
    queryFn: () => dashboardApi.getMealBreakdown(filters, [selectedWasteType]),
  });

  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  const mealNames = ["Breakfast", "Lunch", "Dinner", "Snacks", "Other"];
  const rows = mealNames.map((meal) => {
    const item = data.find((entry) => entry.name === meal);
    const value = item?.value ?? 0;
    return { name: meal, percentage: (value / total) * 100 };
  });

  return (
    <div className="chart-card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Waste Distribution by Meal Type</h3>
          <p className="text-xs text-muted-foreground mt-1">Select a waste type to see when it happens most.</p>
        </div>
        <select
          value={selectedWasteType}
          onChange={(event) => setSelectedWasteType(event.target.value)}
          className="text-sm border border-border rounded px-2 py-1 bg-card text-foreground"
        >
          {WASTE_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.name}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-foreground">{row.name}</span>
              <span className="text-muted-foreground font-medium">{row.percentage.toFixed(1)}%</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${row.percentage}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
