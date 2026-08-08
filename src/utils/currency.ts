/**
 * Cambodian riel. ISO 4217 gives KHR an exponent of 0 — there is no minor unit
 * in circulation — so amounts are formatted and stored as whole riel.
 */
export const CURRENCY_CODE = 'KHR';
export const CURRENCY_SYMBOL = '៛';

const grouped = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

/** 1234567 -> "1,234,567" */
export const formatAmount = (value: number): string => grouped.format(Math.round(value));

/**
 * 1234567 -> "៛1,234,567", -5000 -> "-៛5,000".
 * The sign leads the symbol; the savings tile goes negative when you overspend.
 */
export const formatCurrency = (value: number): string => {
    const rounded = Math.round(value);
    const sign = rounded < 0 ? '-' : '';
    return `${sign}${CURRENCY_SYMBOL} ${grouped.format(Math.abs(rounded))}`;
};

/**
 * Rounds user input to whole riel. Applied before saving so the database never
 * holds a sub-riel fraction that the UI would silently round away on display.
 */
export const normalizeAmount = (value: number): number => Math.round(value);
