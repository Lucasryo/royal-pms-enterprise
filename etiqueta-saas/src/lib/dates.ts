import { addDays, addHours, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ValidityUnit } from './types';

/** Calcula a data de validade a partir da data de manipulacao e da regra do produto. */
export function computeExpiry(
  manipulationAt: Date,
  value: number,
  unit: ValidityUnit,
): Date {
  return unit === 'hours'
    ? addHours(manipulationAt, value)
    : addDays(manipulationAt, value);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'dd/MM/yyyy HH:mm', { locale: ptBR });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

/** Valor para preencher um <input type="datetime-local">. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
