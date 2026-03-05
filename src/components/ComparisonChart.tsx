import { memo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { PortfolioDataPoint } from '../types/PortfolioDataPoint';

interface ComparisonChartProps {
  data: PortfolioDataPoint[];
}

export const ComparisonChart = memo(function ComparisonChart({ data }: ComparisonChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center bg-slate-50 rounded-lg">
        <p className="text-slate-500">No data to display</p>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" strokeOpacity={0.8} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 12, fontFamily: 'Inter' }}
            stroke="#94a3b8"
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatCurrency}
            tick={{ fontSize: 12, fontFamily: 'Inter' }}
            stroke="#94a3b8"
            width={80}
          />
          <Tooltip
            formatter={(value) => [formatCurrency(value as number)]}
            labelFormatter={(label) => new Date(label).toLocaleDateString()}
            contentStyle={{
              backgroundColor: 'white',
              border: 'none',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="portfolioValue"
            name="Your Portfolio"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'white' }}
          />
          <Line
            type="monotone"
            dataKey="counterfactualValue"
            name="Deposits in S&P 500"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'white' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
