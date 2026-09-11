import { useEffect, useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import { Printer } from "lucide-react";

import AlertsAnomalies from "@/components/dashboard/AlertsAnomalies";
import BainMarieAnalyticsCard from "@/components/dashboard/BainMarieAnalytics";
import ChatBar from "@/components/dashboard/ChatBar";
import CoreAnalysis from "@/components/dashboard/CoreAnalysis";
import DailyAvgByCategory from "@/components/dashboard/DailyAvgByCategory";
import FilterSidebar from "@/components/dashboard/FilterSidebar";
import FinalInsights from "@/components/dashboard/FinalInsights";
import KpiStrip from "@/components/dashboard/KpiStrip";
import PatternDetection from "@/components/dashboard/PatternDetection";
import TimeAnalysis from "@/components/dashboard/TimeAnalysis";
import TrendAnalysis from "@/components/dashboard/TrendAnalysis";
import UsageAnalyticsCard from "@/components/dashboard/UsageAnalytics";
import { Button } from "@/components/ui/button";
import { useDashboardData, useDashboardFilterOptions } from "@/hooks/use-dashboard-data";
import type { DashboardFilters } from "@/lib/dashboard";
import { getInitialDevices } from "@/lib/device-utils";

export default function Index() {
  const searchParams = new URLSearchParams(window.location.search);
  const urlCustomerId = searchParams.get("customer_id") || undefined;
  
  const { data: filterOptions } = useDashboardFilterOptions(urlCustomerId);
  
  const dashboardDevices = getInitialDevices();

  const [appliedFilters, setAppliedFilters] = useState<DashboardFilters>(() => {
    const to = new Date();
    const from = subMonths(to, 1);
    return {
      dateFrom: format(from, "yyyy-MM-dd"),
      dateTo: format(to, "yyyy-MM-dd"),
      devices: dashboardDevices,
      mealTypes: [],
      categories: [],
      weeks: [],
      wasteTypes: [],
      dayTypes: [],
      customerId: urlCustomerId,
    };
  });

  useEffect(() => {
    if (!filterOptions) return;
    const to = new Date();
    const from = subMonths(to, 1);
    setAppliedFilters({
      dateFrom: format(from, "yyyy-MM-dd"),
      dateTo: format(to, "yyyy-MM-dd"),
      devices: dashboardDevices,
      mealTypes: [],
      categories: [],
      weeks: [],
      wasteTypes: [],
      dayTypes: [],
      customerId: urlCustomerId,
    });
  }, [filterOptions, urlCustomerId]);

  const filters = useMemo(() => appliedFilters, [appliedFilters]);
  const dashboard = useDashboardData(filters);

  const handlePrint = () => window.print();

  return (
    <div className="flex min-h-screen bg-background">
      <FilterSidebar options={filterOptions} onApply={(newFilters) => setAppliedFilters(prev => ({ ...newFilters, customerId: prev.customerId }))} />

      <main className="flex-1 overflow-y-auto">
        <div className="px-8 pt-6 pb-4 border-b border-border bg-card print:hidden-header">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">Waste Analysis</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Real-time food waste intelligence dashboard</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handlePrint} className="no-print flex items-center gap-1.5 text-sm">
                <Printer className="h-4 w-4" />
                Download PDF
              </Button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
                Waste Analysis
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">
          <ChatBar filters={filters} />

          {dashboard.isError ? (
            <div className="rounded border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {dashboard.error?.message ?? "Dashboard data could not be loaded."}
            </div>
          ) : null}

          <KpiStrip summary={dashboard.summary} />

          <CoreAnalysis
            filters={filters}
            foodItems={dashboard.foodItems}
            wasteCategories={dashboard.wasteCategories}
            topDevices={dashboard.topDevices}
          />

          <TrendAnalysis trend={dashboard.trend} />

          <TimeAnalysis filters={filters} options={filterOptions} />

          <AlertsAnomalies foodItems={dashboard.foodItems} wasteCategories={dashboard.wasteCategories} />

          <UsageAnalyticsCard data={dashboard.usageAnalytics} />

          <BainMarieAnalyticsCard data={dashboard.bainMarieAnalytics} />

          <DailyAvgByCategory data={dashboard.dailyAvgByCategory} />

          <PatternDetection insights={dashboard.insights} />

          <FinalInsights insights={dashboard.insights} />
        </div>
      </main>
    </div>
  );
}
