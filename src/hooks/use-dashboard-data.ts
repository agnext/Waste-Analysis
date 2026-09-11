import { useQueries, useQuery } from "@tanstack/react-query";

import { dashboardApi, type DashboardFilters } from "@/lib/dashboard";


export function useDashboardFilterOptions(customerId?: string) {
  return useQuery({
    queryKey: ["dashboard-filter-options", customerId],
    queryFn: () => dashboardApi.getFilterOptions(customerId),
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
      { queryKey: ["usage-analytics", filters], queryFn: () => dashboardApi.getUsageAnalytics(filters) },
      { queryKey: ["bain-marie-analytics", filters], queryFn: () => dashboardApi.getBainMarieAnalytics(filters) },
      { queryKey: ["daily-avg-by-category", filters], queryFn: () => dashboardApi.getDailyAvgByCategory(filters) },
    ],
  });

  const [summary, foodItems, wasteCategories, meals, trend, weeklyWaste, weekdayWaste, topDevices, insights, usageAnalytics, bainMarieAnalytics, dailyAvgByCategory] = results;
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
    usageAnalytics: usageAnalytics.data,
    bainMarieAnalytics: bainMarieAnalytics.data,
    dailyAvgByCategory: dailyAvgByCategory.data ?? [],
    isLoading: results.some((result) => result.isLoading),
    isError: results.some((result) => result.isError),
    error: (results.find((result) => result.error)?.error as Error | undefined) ?? undefined,
  };
}
