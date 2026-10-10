import { formatChip } from '../gameFlow';

export default function FloatingDelta({ amount }) {
  if (amount == null || amount === 0) return null;
  const positive = amount > 0;

  return (
    <span
      className={`pointer-events-none absolute left-1/2 top-0 z-20 whitespace-nowrap text-sm font-bold tabular-nums ${
        positive ? 'text-emerald-400' : 'text-red-400'
      }`}
      style={{ animation: 'float-up 2s ease-out forwards' }}
    >
      {positive ? '+' : ''}
      {formatChip(amount)} chip
    </span>
  );
}
