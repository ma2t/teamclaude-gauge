// Builds teamclaude-shaped payloads from plain accounts, for the unit tests
// and the README demo. Plain ESM, so node and the Shell can both import it.

export function bucket(utilization, resetAt) {
    return utilization == null ? null : {utilization, remaining: 1 - utilization, resetAt};
}

// Mirrors teamclaude's aggregateBucket for the fields model.js reads.
export function quotaOf(accounts) {
    const aggregate = key => {
        const known = accounts.filter(a => a.buckets[key]);
        if (known.length === 0)
            return null;
        const capacityWeight = known.reduce((sum, a) => sum + a.tier.weight, 0);
        const usedWeight = known.reduce((sum, a) => sum + a.tier.weight * a.buckets[key].utilization, 0);
        return {capacityWeight, usedWeight, utilization: usedWeight / capacityWeight, knownAccounts: known.length};
    };
    return {
        accounts,
        aggregate: {
            fiveHour: aggregate('fiveHour'),
            weeklyShared: aggregate('weeklyShared'),
            weeklyFable: aggregate('weeklyFable'),
        },
    };
}
