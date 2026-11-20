'use client';

import { useMemo } from 'react';
import { WheelPicker } from './WheelPicker';
import { clampMonthYear, currentMonthYear, monthNames, yearRange, type MonthYear } from '@/lib/date';
import { useI18n } from './I18nProvider';

type Props = { value: MonthYear; onChange: (v: MonthYear) => void; rows?: 3 | 5; disabled?: boolean };

/**
 * The two independent month / year wheels. Logical month+year only (no day, no Date objects).
 * Future months are disabled in the current year; any year earlier than the current one allows all 12 months.
 */
export function DateWheels({ value, onChange, rows = 5, disabled }: Props) {
  const { t, intl } = useI18n();
  const max = useMemo(() => currentMonthYear(), []);
  const months = useMemo(
    () => monthNames(intl).map((label, i) => ({ value: i + 1, label, disabled: value.year === max.year && i + 1 > max.month })),
    [intl, value.year, max],
  );
  const years = useMemo(() => yearRange(max).map((y) => ({ value: y, label: String(y) })), [max]);

  return (
    <div className="grid grid-cols-[1.35fr_1fr] gap-3" data-testid="date-wheels">
      <div>
        <div className="mb-1 text-center text-xs font-semibold uppercase tracking-wide text-muted">{t('stage.month')}</div>
        <WheelPicker items={months} value={value.month} rows={rows} label={t('stage.month')} testId="month-wheel" disabled={disabled} onChange={(month) => onChange(clampMonthYear({ month, year: value.year }, max))} />
      </div>
      <div>
        <div className="mb-1 text-center text-xs font-semibold uppercase tracking-wide text-muted">{t('stage.year')}</div>
        <WheelPicker items={years} value={value.year} rows={rows} label={t('stage.year')} testId="year-wheel" disabled={disabled} onChange={(year) => onChange(clampMonthYear({ month: value.month, year }, max))} />
      </div>
    </div>
  );
}

/** Neutral initial value: the current month/year. Never derived from photo metadata. */
export const neutralMonthYear = (): MonthYear => currentMonthYear();
