// Amounts are integers in grosze everywhere; złoty only appear at the UI edge.

const formatter = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatGrosze(grosze: number): string {
  return `${formatter.format(grosze / 100)} zł`;
}

/** Parses user input such as "3,50", "3.5", "12 zł", "0,50 PLN" into grosze. */
export function parseZlotyInput(input: string): number | null {
  const cleaned = input
    .replace(/\s| /g, '')
    .replace(/(zł|zl|pln)$/i, '')
    .replace(',', '.');
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [zl, gr = ''] = cleaned.split('.');
  return Number(zl) * 100 + Number(gr.padEnd(2, '0'));
}

/** Grosze -> "3,50" for editable text fields. */
export function groszeToInput(grosze: number): string {
  return `${Math.floor(grosze / 100)},${String(grosze % 100).padStart(2, '0')}`;
}
