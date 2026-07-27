import { memo, useMemo, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { PortfolioDataPoint } from '../types/PortfolioDataPoint';
import { calculateAnnualReturns } from '../utils/calculations';

export interface DateRange {
  start: string;
  end: string;
}

interface ReturnChartProps {
  data: PortfolioDataPoint[];
  selectedRange: DateRange | null;
  onSelectRange: (start: string, end: string) => void;
  onClearRange: () => void;
}

// Stable helpers at module scope so they never invalidate the chart memos below.
const formatPercent = (value: number) => `${value.toFixed(0)}%`;

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const tooltipStyle = {
  backgroundColor: 'white',
  border: 'none',
  borderRadius: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
};

export const ReturnChart = memo(function ReturnChart({
  data,
  selectedRange,
  onSelectRange,
  onClearRange,
}: ReturnChartProps) {
  const [showAnnual, setShowAnnual] = useState(false);
  const [showAvgLines, setShowAvgLines] = useState(true);
  // Track the in-progress drag in refs so moving the mouse never re-renders the
  // 500-point line chart mid-drag (that lag was interrupting/dropping the drag).
  // The selection is committed once, on release.
  const dragStartRef = useRef<string | null>(null);
  const dragCurrentRef = useRef<string | null>(null);
  // Pixel bounds of the live drag band. Updating this re-renders only the small
  // HTML overlay below — the memoized line chart is reused, so recharts doesn't
  // re-render and the drag stays snappy.
  const [dragBand, setDragBand] = useState<{ x1: number; x2: number } | null>(null);

  const annual = useMemo(() => calculateAnnualReturns(data), [data]);
  const partialYears = useMemo(
    () => new Set(annual.filter(a => a.partial).map(a => a.year)),
    [annual]
  );
  // Simple (unweighted) average of each year's return, one per series.
  const avgReturn = useMemo(() => {
    if (annual.length === 0) return { portfolio: 0, counterfactual: 0 };
    const n = annual.length;
    return {
      portfolio: annual.reduce((sum, a) => sum + a.portfolioReturn, 0) / n,
      counterfactual: annual.reduce((sum, a) => sum + a.counterfactualReturn, 0) / n,
    };
  }, [annual]);

  // Memoize the cumulative line chart (front face). It carries up to 500 points,
  // so re-rendering it on every average-line toggle is what made show/hide feel
  // laggy. It depends only on `data` and the selection/drag state — crucially NOT
  // on showAvgLines — so toggling the averages never rebuilds it.
  const lineChart = useMemo(() => {
    // Split each series into two complementary segments so the period outside
    // the selection can be drawn faded while the selection stays full-opacity.
    // Both include the boundary dates so the segments join without a gap. With
    // no selection, `inside` is the whole series and `outside` is empty.
    const sel = selectedRange;
    const inside = (date: string) => !sel || (date >= sel.start && date <= sel.end);
    const outside = (date: string) => !!sel && (date <= sel.start || date >= sel.end);

    const eventX = (e: { chartX?: number; activeCoordinate?: { x?: number } }) =>
      typeof e?.chartX === 'number' ? e.chartX : e?.activeCoordinate?.x;

    const commitDrag = () => {
      const s = dragStartRef.current;
      const e = dragCurrentRef.current;
      dragStartRef.current = null;
      dragCurrentRef.current = null;
      setDragBand(null);
      if (s !== null && e !== null && s !== e) {
        const [lo, hi] = [s, e].sort((a, b) => a.localeCompare(b));
        onSelectRange(lo, hi);
      }
    };

    type MouseState = { activeLabel?: string | number; chartX?: number; activeCoordinate?: { x?: number } };

    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          onMouseDown={(e: MouseState) => {
            if (e?.activeLabel != null) {
              dragStartRef.current = String(e.activeLabel);
              dragCurrentRef.current = String(e.activeLabel);
              const x = eventX(e);
              if (typeof x === 'number') setDragBand({ x1: x, x2: x });
            }
          }}
          onMouseMove={(e: MouseState) => {
            if (dragStartRef.current !== null && e?.activeLabel != null) {
              dragCurrentRef.current = String(e.activeLabel);
              const x = eventX(e);
              if (typeof x === 'number') setDragBand(prev => (prev ? { x1: prev.x1, x2: x } : null));
            }
          }}
          onMouseUp={commitDrag}
          onMouseLeave={commitDrag}
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
            contentStyle={tooltipStyle}
          />
          <Legend />

          {/* Faded segments outside the selection (only when a period is selected). */}
          {sel && (
            <Line
              type="monotone"
              name="Your Portfolio Return"
              dataKey={(d: PortfolioDataPoint) => (outside(d.date) ? d.portfolioReturn : null)}
              stroke="#3b82f6"
              strokeWidth={2}
              strokeOpacity={0.2}
              dot={false}
              legendType="none"
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
          {sel && (
            <Line
              type="monotone"
              name="S&P 500 Return"
              dataKey={(d: PortfolioDataPoint) => (outside(d.date) ? d.counterfactualReturn : null)}
              stroke="#10b981"
              strokeWidth={2}
              strokeOpacity={0.2}
              dot={false}
              legendType="none"
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {/* Full-opacity segments within the selection (full series when unselected). */}
          <Line
            type="monotone"
            name="Your Portfolio Return"
            dataKey={(d: PortfolioDataPoint) => (inside(d.date) ? d.portfolioReturn : null)}
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'white' }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            name="S&P 500 Return"
            dataKey={(d: PortfolioDataPoint) => (inside(d.date) ? d.counterfactualReturn : null)}
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'white' }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }, [data, selectedRange, onSelectRange]);

  // Memoize the per-year bar chart (back face) too, so only the average-line
  // opacity change triggers its rebuild — a cheap 9-bar render, animation off.
  const barChart = useMemo(() => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={annual} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" strokeOpacity={0.8} />
        <XAxis
          dataKey="year"
          tickFormatter={(year: number) => (partialYears.has(year) ? `${year}*` : String(year))}
          tick={{ fontSize: 12, fontFamily: 'Inter' }}
          stroke="#94a3b8"
        />
        <YAxis
          tickFormatter={formatPercent}
          tick={{ fontSize: 12, fontFamily: 'Inter' }}
          stroke="#94a3b8"
          width={60}
        />
        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
        <ReferenceLine
          y={avgReturn.portfolio}
          stroke="#3b82f6"
          strokeDasharray="6 4"
          strokeWidth={1.5}
          strokeOpacity={showAvgLines ? 1 : 0}
        />
        <ReferenceLine
          y={avgReturn.counterfactual}
          stroke="#10b981"
          strokeDasharray="6 4"
          strokeWidth={1.5}
          strokeOpacity={showAvgLines ? 1 : 0}
        />
        <Tooltip
          formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(2)}%`]}
          labelFormatter={(year) =>
            partialYears.has(year as number) ? `${year} (partial year)` : String(year)
          }
          contentStyle={tooltipStyle}
          cursor={{ fill: '#f1f5f9' }}
        />
        <Legend />
        <Bar dataKey="portfolioReturn" name="Your Portfolio Return" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="counterfactualReturn" name="S&P 500 Return" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  ), [annual, partialYears, avgReturn, showAvgLines]);

  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center bg-slate-50 rounded-lg">
        <p className="text-slate-500">No data to display</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end items-center gap-2 mb-2">
        {!showAnnual && !selectedRange && (
          <span className="mr-auto text-xs text-slate-400">Drag on the chart to select a period</span>
        )}
        {selectedRange && (
          <span className="mr-auto text-xs text-slate-500">
            Filtered: {formatDate(selectedRange.start)} – {formatDate(selectedRange.end)}
          </span>
        )}
        {selectedRange && (
          <button
            onClick={onClearRange}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] rounded-lg transition-all duration-150"
          >
            Clear filter
          </button>
        )}
        <button
          onClick={() => setShowAnnual(v => !v)}
          className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] rounded-lg transition-all duration-150"
        >
          {showAnnual ? 'Over Time' : 'By Year'}
        </button>
      </div>

      {/* Flip between the cumulative line (front) and per-year bars (back).
          recharts' SVG doesn't honor backface-visibility, so instead of hiding
          the away-facing face that way we gate each face's opacity and snap the
          swap at the flip's midpoint (250ms of the 500ms rotate). Each face is
          therefore only ever visible while it's upright — a mirrored face is
          never shown. */}
      <div className="relative h-80" style={{ perspective: '1400px' }}>
        <div
          className="relative h-full w-full transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: showAnnual ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              opacity: showAnnual ? 0 : 1,
              pointerEvents: showAnnual ? 'none' : 'auto',
              transition: 'opacity 0s linear 250ms',
            }}
          >
            {lineChart}
            {/* Live drag highlight — a plain overlay driven by pixel state, so it
                tracks the cursor without re-rendering the chart underneath. */}
            {dragBand && (
              <div
                className="absolute top-0 bottom-0 bg-blue-500/10 border-x border-blue-400/40 pointer-events-none"
                style={{
                  left: Math.min(dragBand.x1, dragBand.x2),
                  width: Math.abs(dragBand.x2 - dragBand.x1),
                }}
              />
            )}
          </div>

          <div
            className="absolute inset-0"
            style={{
              transform: 'rotateY(180deg)',
              opacity: showAnnual ? 1 : 0,
              pointerEvents: showAnnual ? 'auto' : 'none',
              transition: 'opacity 0s linear 250ms',
            }}
          >
            {barChart}
          </div>
        </div>
      </div>

      {/* pr matches the BarChart's right margin (30px) so the box lines up
          with the right edge of the plotted area, not the card. */}
      {showAnnual && (
        <div className="mt-2 flex items-end justify-between gap-4 pr-[30px]">
          <p className="text-xs text-slate-400">
            {partialYears.size > 0
              ? '* partial year — return covers only the months with data, not annualized'
              : ''}
          </p>
          <button
            type="button"
            onClick={() => setShowAvgLines(v => !v)}
            title={showAvgLines ? 'Hide average lines' : 'Show average lines'}
            className={`text-right text-xs leading-5 shrink-0 cursor-pointer rounded-md px-2 py-1 hover:bg-slate-50 transition-opacity ${
              showAvgLines ? 'opacity-100' : 'opacity-40'
            }`}
          >
            <div className="font-medium" style={{ color: '#3b82f6' }}>
              Avg portfolio {avgReturn.portfolio.toFixed(1)}%
            </div>
            <div className="font-medium" style={{ color: '#10b981' }}>
              Avg S&amp;P 500 {avgReturn.counterfactual.toFixed(1)}%
            </div>
          </button>
        </div>
      )}
    </div>
  );
});
