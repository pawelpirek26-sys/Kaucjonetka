// Traffic-light mapping shared by the map, point cards and reports. Mirrors
// public.report_type_level() in the database.
import type { Packaging, ReportType, StatusLevel } from '@/lib/api';

export const STATUS_COLORS: Record<StatusLevel, string> = {
  ok: '#2E9D4F',
  warning: '#E8A317',
  broken: '#D64545',
  unknown: '#9AA0A6',
};

export const STATUS_LABELS: Record<StatusLevel, string> = {
  ok: 'Działa',
  warning: 'Działa z problemami',
  broken: 'Nie działa',
  unknown: 'Brak aktualnych zgłoszeń',
};

export const REPORT_TYPES: readonly ReportType[] = ['ok', 'queue', 'rejects', 'full', 'no_print', 'off'];

export const REPORT_LABELS: Record<ReportType, string> = {
  ok: 'Działa bez problemu',
  queue: 'Długa kolejka',
  rejects: 'Odrzuca opakowania',
  full: 'Pełny, nie przyjmuje',
  no_print: 'Nie drukuje kuponu',
  off: 'Wyłączony / awaria',
};

/** Question asked to other users near the machine ("still the case?"). */
export const STILL_QUESTIONS: Record<ReportType, string> = {
  ok: 'Automat nadal działa?',
  queue: 'Nadal jest kolejka?',
  rejects: 'Nadal odrzuca opakowania?',
  full: 'Nadal pełny?',
  no_print: 'Nadal nie drukuje kuponów?',
  off: 'Nadal nie działa?',
};

export function reportLevel(type: ReportType): StatusLevel {
  switch (type) {
    case 'ok':
      return 'ok';
    case 'queue':
    case 'rejects':
      return 'warning';
    default:
      return 'broken';
  }
}

export const PACKAGING_LABELS: Record<Packaging, string> = {
  pet: 'Butelki PET',
  can: 'Puszki',
  glass: 'Szkło',
};

export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'przed chwilą';
  if (minutes < 60) return `${minutes} min temu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} godz. temu`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'wczoraj' : `${days} dni temu`;
}
