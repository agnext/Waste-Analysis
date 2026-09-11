import { useQueries, useQuery } from "@tanstack/react-query";

import { dashboardApi, type DashboardFilters } from "@/lib/dashboard";


export function useDashboardFilterOptions() {
  return useQuery({
    queryKey: ["dashboard-filter-options"],
    queryFn: dashboardApi.getFilterOptions,
  });
}


export function useDashboardData(filters: DashboardFilters) {
  const results = useQueries({
    queries: [
      { queryKey: ["dashboard-summary", filters], queryFn: () => dashboardApi.getSummary(filters) },
      { queryKey: ["dashboard-food-items", filters], queryFn: () => dashboardApi.getFoodItems(filters) },
      { queryKey: ["dashboard-waste-categories", filters], queryFn: () => dashboardApi.getWasteCategories(filters) },
      { queryKey: ["dashboard-meals", filters], queryFn: () => dashboardApi.getMeals(filters) },
      { queryKey: ["dashboard-trend", filters], queryFn: () => dashboardApi.getTrend(filters) },
      { queryKey: ["dashboard-weekly", filters], queryFn: () => dashboardApi.getWeeklyWaste(filters) },
      { queryKey: ["dashboard-weekday", filters], queryFn: () => dashboardApi.getWeekdayWaste(filters) },
      { queryKey: ["dashboard-top-devices", filters], queryFn: () => dashboardApi.getTopDevices(filters) },
      { queryKey: ["dashboard-insights", filters], queryFn: () => dashboardApi.getInsights(filters) },
    ],
  });

  const [summary, foodItems, wasteCategories, meals, trend, weeklyWaste, weekdayWaste, topDevices, insights] = results;
  return {
    summary: summary.data,
    foodItems: foodItems.data ?? [],
    wasteCategories: wasteCategories.data ?? [],
    meals: meals.data ?? [],
    trend: trend.data ?? [],
    weeklyWaste: weeklyWaste.data ?? [],
    weekdayWaste: weekdayWaste.data ?? [],
    topDevices: topDevices.data ?? [],
    insights: insights.data,
    isLoading: results.some((result) => result.isLoading),
    isError: results.some((result) => result.isError),
    error: (results.find((result) => result.error)?.error as Error | undefined) ?? undefined,
  };
}
