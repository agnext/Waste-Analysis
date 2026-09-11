import { AlertCircle } from "lucide-react";

import type { NamedValue } from "@/lib/dashboard";


interface AlertsAnomaliesProps {
  foodItems: NamedValue[];
  wasteCategories: NamedValue[];
  anomalies?: Array<{ date: string; value: number }>;
}


export default function AlertsAnomalies({ foodItems, wasteCategories }: AlertsAnomaliesProps) {
  const alertItems = foodItems.slice(0, 4);
  const totalCategoryWaste = wasteCategories.reduce((sum, item) => sum + item.value, 0);
  const threshold = wasteCategories.length ? (totalCategoryWaste / wasteCategories.length) * 1.2 : 0;

  return (
    <div>
      <div className="chart-card">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <h3 className="text-base font-semibold text-foreground">Threshold Alerts</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Threshold = average category waste x 1.2 ({threshold.toFixed(2)} kg)
        </p>
        <div className="space-y-2">
          {alertItems.map((item) => {
            const change = threshold ? ((item.value - threshold) / threshold) * 100 : 0;
            const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
            const tone =
              direction === "up"
                ? "alert-badge-danger"
                : direction === "down"
                  ? "alert-badge-warning"
                  : "bg-muted text-muted-foreground";
            return (
              <div key={item.name} className="flex items-center justify-between py-2 px-3 rounded border border-border bg-background">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.value.toFixed(2)} kg waste</p>
                </div>
                <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded ${tone}`}>
                  {direction} {Math.abs(change).toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
