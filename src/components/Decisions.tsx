import { memo, useState } from 'react';
import type { Decision, DecisionsResult } from '../types/Decision';

interface DecisionsProps {
  data: DecisionsResult;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

interface GroupConfig {
  key: keyof DecisionsResult;
  title: string;
  dot: string;    // tailwind bg color for the marker
  accent: string; // tailwind text color for the amount
}

const GROUPS: GroupConfig[] = [
  { key: 'deposits', title: 'Deposits', dot: 'bg-emerald-500', accent: 'text-emerald-600' },
  { key: 'withdrawals', title: 'Withdrawals', dot: 'bg-amber-500', accent: 'text-amber-600' },
  { key: 'buys', title: 'Buys', dot: 'bg-blue-500', accent: 'text-blue-600' },
  { key: 'sells', title: 'Sells', dot: 'bg-rose-500', accent: 'text-rose-600' },
];

function DecisionRow({ decision, accent }: { decision: Decision; accent: string }) {
  const { kind, ticker, shares, amount } = decision;

  if (kind === 'deposit' || kind === 'withdrawal') {
    return (
      <div className="flex justify-between items-baseline text-sm py-1">
        <span className="text-slate-500">{formatDate(decision.date)}</span>
        <span className={`font-medium ${accent}`}>{formatCurrency(Math.abs(amount ?? 0))}</span>
      </div>
    );
  }

  // buy / sell
  return (
    <div className="flex justify-between items-baseline text-sm py-1 gap-3">
      <span className="text-slate-500 shrink-0">{formatDate(decision.date)}</span>
      <span className="font-medium text-slate-800 truncate">{ticker}</span>
      <span className="text-slate-500 shrink-0 ml-auto">
        {shares?.toLocaleString(undefined, { maximumFractionDigits: 4 })} sh
      </span>
      <span className={`font-medium shrink-0 ${accent}`}>{formatCurrency(amount ?? 0)}</span>
    </div>
  );
}

function DecisionGroup({ group, items }: { group: GroupConfig; items: Decision[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-slate-100">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-slate-50 rounded-xl transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
            clipRule="evenodd"
          />
        </svg>
        <span className={`w-2 h-2 rounded-full ${group.dot}`} />
        <h4 className="text-sm font-semibold text-slate-800">{group.title}</h4>
        <span className="ml-auto text-xs text-slate-400">{items.length}</span>
      </button>

      {open && (
        <div className="px-5 pb-4 divide-y divide-slate-100">
          {items.map((decision, i) => (
            <DecisionRow
              key={`${decision.kind}-${decision.ticker ?? ''}-${decision.date}-${i}`}
              decision={decision}
              accent={group.accent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const Decisions = memo(function Decisions({ data }: DecisionsProps) {
  const activeGroups = GROUPS.filter(g => data[g.key].length > 0);

  if (activeGroups.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 bg-white rounded-2xl shadow-sm ring-1 ring-slate-100">
        No decisions in this period
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {activeGroups.map(group => (
        <DecisionGroup key={group.key} group={group} items={data[group.key]} />
      ))}
    </div>
  );
});
