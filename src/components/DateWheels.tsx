'use client';

import { useMemo } from 'react';
import { WheelPicker } from './WheelPicker';
import { clampMonthYear, currentMonthYear, monthNames, yearRange, type MonthYear } from '@/lib/date';
import { ageAt, seasonIcon } from '@/lib/partners';
import { useI18n } from './I18nProvider';

/** Partners: labels a child can read. Same values, new labels (season icon + 🎂 on months, age on years). */
export type WheelDecor = { birth: MonthYear | null; south: boolean };

type Props = { value: MonthYear; onChange: (v: MonthYear) => void; rows?: 3 | 5; disabled?: boolean; decor?: WheelDecor };

/**
 * The two independent month / year wheels. Logical month+year only (no day, no Date objects).
 * Future months are disabled in the current year; any year earlier than the current one allows all 12 months.
 */
export function DateWheels({ value, onChange, rows = 5, disabled, decor }: Props) {
  const { t, intl } = useI18n();
  const max = useMemo(() => currentMonthYear(), []);
  const months = useMemo(
    () =>
      monthNames(intl).map((name, i) => ({
        value: i + 1,
        label: decor ? `${seasonIcon(i + 1, decor.south)} ${name}${decor.birth && decor.birth.month === i + 1 ? ' 🎂' : ''}` : name,
        disabled: value.year === max.year && i + 1 > max.month,
      })),
    [intl, value.year, max, decor],
  );
  const years = useMemo(
    () =>
      yearRange(max).map((y) => {
        // The age is computed at the currently selected month: "2022 · age 4", "2018 · 🍼" in the first year, just the year before birth.
        const age = decor?.birth ? ageAt(decor.birth, { month: value.month, year: y }) : -1;
        return { value: y, label: age > 0 ? `${y} · ${t('partners.age', { n: age })}` : age === 0 ? `${y} · 🍼` : String(y) };
      }),
    [max, decor, value.month, t],
  );

  return (
    <div className={`grid gap-3 ${decor ? 'grid-cols-[1.1fr_1fr]' : 'grid-cols-[1.35fr_1fr]'}`} data-testid="date-wheels">
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
