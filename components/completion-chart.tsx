'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';

interface ChartProps {
  data: { drivers: number; minutes: number }[];
  optimalDrivers?: number;
}

export default function CompletionChart({ data, optimalDrivers }: ChartProps) {
  const safeData = data ?? [];
  if (safeData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No data to display
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={safeData} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
        <XAxis
          dataKey="drivers"
          tickLine={false}
          tick={{ fontSize: 10 }}
          interval="preserveStartEnd"
          label={{ value: 'Drivers', position: 'insideBottom', offset: -15, style: { textAnchor: 'middle', fontSize: 11 } }}
        />
        <YAxis
          tickLine={false}
          tick={{ fontSize: 10 }}
          label={{ value: 'Minutes', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 11 } }}
        />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8 }}
          formatter={(value: any) => [`${value} min`, 'Completion']}
          labelFormatter={(label: any) => `${label} drivers`}
        />
        {optimalDrivers != null && (
          <ReferenceLine
            x={optimalDrivers}
            stroke="hsl(var(--primary))"
            strokeDasharray="4 4"
            label={{ value: 'Optimal', position: 'top', fontSize: 10, fill: 'hsl(var(--primary))' }}
          />
        )}
        <Line
          type="monotone"
          dataKey="minutes"
          stroke="#60B5FF"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, fill: '#60B5FF' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
