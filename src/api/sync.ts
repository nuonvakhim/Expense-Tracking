import type { Expense, RecurrenceFrequency, RecurringExpense } from '../../types';
import { api } from './client';

/** Returns a new Date advanced by one period — never mutates its argument. */
function advance(from: Date, frequency: RecurrenceFrequency): Date {
    const d = new Date(from);
    if (frequency === 'DAILY') d.setDate(d.getDate() + 1);
    else if (frequency === 'WEEKLY') d.setDate(d.getDate() + 7);
    else if (frequency === 'MONTHLY') d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    return d;
}

/**
 * A rule left untouched for a long time (or with a bad nextDueDate) would
 * otherwise generate an unbounded number of rows on the next load.
 */
const MAX_CATCH_UP = 60;

/**
 * Posts a transaction for every occurrence a rule has missed, then advances the
 * rule's nextDueDate. All writes go through the storage layer so React's
 * StrictMode double-invoke cannot duplicate rows.
 */
export async function processDueRecurring(
    rules: RecurringExpense[],
): Promise<{ created: Expense[]; rules: RecurringExpense[] }> {
    const now = new Date();
    const created: Expense[] = [];
    const nextRules: RecurringExpense[] = [];

    for (const rule of rules) {
        let next = new Date(rule.nextDueDate);
        if (Number.isNaN(next.getTime()) || next > now) {
            nextRules.push(rule);
            continue;
        }

        const due: string[] = [];
        while (next <= now && due.length < MAX_CATCH_UP) {
            due.push(next.toISOString());
            next = advance(next, rule.frequency);
        }

        for (const when of due) {
            created.push(
                await api.createTransaction({
                    amount: rule.amount,
                    category: rule.category,
                    description: `${rule.description} (Recurring)`,
                    date: when,
                    type: rule.type,
                }),
            );
        }

        nextRules.push(await api.updateRecurring(rule.id, { nextDueDate: next.toISOString() }));
    }

    return { created, rules: nextRules };
}
