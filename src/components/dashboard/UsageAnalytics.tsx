import { Activity, Calendar, Cpu, ScanLine } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { UsageAnalytics } from "@/lib/dashboard";


const COLORS = ["hsl(155,43%,21%)", "hsl(38,92%,50%)", "hsl(200,70%,50%)", "hsl(270,60%,55%)", "hsl(0,84%,60%)", "hsl(160,60%,40%)", "hsl(30,80%,55%)"];


interface UsageAnalyticsProps {
  data?: UsageAnalytics;
}


export default function UsageAnalyticsCard({ data }: UsageAnalyticsProps) {
  const kpis = [
    { label: "Total Scans", value: (data?.total_scans ?? 0).toLocaleString(), icon: ScanLine },
    { label: "Active Days", value: (data?.active_days ?? 0).toLocaleString(), icon: Calendar },
    { label: "Scans / Day", value: (data?.scans_per_day ?? 0).toString(), icon: Activity },
    { label: "Devices", value: (data?.total_devices ?? 0).toString(), icon: Cpu },
  ];

  return (
    <div className="chart-card space-y-4">
      <h3 className="section-title">Usage Analytics</h3>

      <div className="grid grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-muted/40 rounded p-3 flex items-center gap-3">
            <kpi.icon className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="text-base font-bold text-foreground">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h4 className="text-sm font-medium text-foreground mb-2">Scans by Meal</h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data?.scans_by_meal ?? []} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,90%)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4 }} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {(data?.scans_by_meal ?? []).map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
