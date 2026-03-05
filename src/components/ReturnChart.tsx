import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { PortfolioDataPoint } from '../types/PortfolioDataPoint';

interface ReturnChartProps {
  data: PortfolioDataPoint[];
}

export function ReturnChart({ data }: ReturnChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center bg-slate-50 rounded-lg">
        <p className="text-slate-500">No data to display</p>
      </div>
    );
  }

  const formatPercent = (value: number) => `${value.toFixed(0)}%`;

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
            tickFormatter={formatPercent}
            tick={{ fontSize: 12, fontFamily: 'Inter' }}
            stroke="#94a3b8"
            width={60}
          />
          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
          <Tooltip
            formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(2)}%`]}
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
            dataKey="portfolioReturn"
            name="Your Portfolio Return"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'white' }}
          />
          <Line
            type="monotone"
            dataKey="counterfactualReturn"
            name="S&P 500 Return"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'white' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
