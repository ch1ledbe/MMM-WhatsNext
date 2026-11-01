// Run with: node --test
const test = require("node:test");
const assert = require("node:assert");
const Core = require("../core.js");

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

test("one-off all-day event stays visible during its day", () => {
	const ev = { date: "2026-11-10" };
	assert.deepStrictEqual(Core.nextOccurrence(ev, at(2026, 11, 1)).start, at(2026, 11, 10));
	assert.strictEqual(Core.nextOccurrence(ev, at(2026, 11, 10, 23, 59)).running, true);
	assert.strictEqual(Core.nextOccurrence(ev, at(2026, 11, 11)), null);
});

test("timed event is shown as running within the now window", () => {
	const ev = { date: "2026-11-01", time: "14:00" };
	const opts = { nowWindowMinutes: 60 };
	assert.strictEqual(Core.nextOccurrence(ev, at(2026, 11, 1, 13), opts).running, false);
	assert.strictEqual(Core.nextOccurrence(ev, at(2026, 11, 1, 14, 30), opts).running, true);
	assert.strictEqual(Core.nextOccurrence(ev, at(2026, 11, 1, 15), opts), null);
	assert.strictEqual(Core.nextOccurrence(ev, at(2026, 11, 1, 14, 1)), null);
});

test("yearly event rolls over and counts years", () => {
	const ev = { date: "1986-03-15", repeat: "yearly" };
	const occ = Core.nextOccurrence(ev, at(2026, 11, 1));
	assert.deepStrictEqual(occ.start, at(2027, 3, 15));
	assert.strictEqual(occ.years, 41);
	assert.strictEqual(Core.nextOccurrence(ev, at(2026, 3, 15, 12)).years, 40);
});

test("29 February falls back to 28 February in non-leap years", () => {
	const ev = { date: "2024-02-29", repeat: "yearly" };
	assert.deepStrictEqual(Core.nextOccurrence(ev, at(2026, 11, 1)).start, at(2027, 2, 28));
	assert.deepStrictEqual(Core.nextOccurrence(ev, at(2027, 3, 1)).start, at(2028, 2, 29));
});

test("monthly event on the 31st clamps to month end", () => {
	const ev = { date: "2026-01-31", repeat: "monthly", time: "09:00" };
	assert.deepStrictEqual(Core.nextOccurrence(ev, at(2026, 11, 1)).start, at(2026, 11, 30, 9));
	assert.deepStrictEqual(Core.nextOccurrence(ev, at(2026, 12, 1)).start, at(2026, 12, 31, 9));
	assert.deepStrictEqual(Core.nextOccurrence(ev, at(2026, 12, 31, 10)).start, at(2027, 1, 31, 9));
});

test("weekly event keeps its weekday", () => {
	const ev = { date: "2026-10-06", repeat: "weekly", time: "18:30" }; // Tuesday
	const occ = Core.nextOccurrence(ev, at(2026, 11, 1));
	assert.deepStrictEqual(occ.start, at(2026, 11, 3, 18, 30));
	assert.deepStrictEqual(Core.nextOccurrence(ev, at(2026, 11, 3, 19)).start, at(2026, 11, 10, 18, 30));
});

test("future repeating event uses its original date", () => {
	const ev = { date: "2027-05-01", repeat: "yearly" };
	assert.deepStrictEqual(Core.nextOccurrence(ev, at(2026, 11, 1)).start, at(2027, 5, 1));
});

test("upcoming sorts, filters disabled and applies limits", () => {
	const events = [
		{ title: "c", date: "2026-12-24" },
		{ title: "a", date: "2026-11-05" },
		{ title: "hidden", date: "2026-11-02", enabled: false },
		{ title: "b", date: "2026-11-20" },
		{ title: "past", date: "2026-10-01" }
	];
	const now = at(2026, 11, 1);
	assert.deepStrictEqual(Core.upcoming(events, now).map((x) => x.ev.title), ["a", "b", "c"]);
	assert.deepStrictEqual(Core.upcoming(events, now, { maxEvents: 2 }).map((x) => x.ev.title), ["a", "b"]);
	assert.deepStrictEqual(Core.upcoming(events, now, { maxDaysAhead: 30 }).map((x) => x.ev.title), ["a", "b"]);
});

test("date validation and breakdown", () => {
	assert.strictEqual(Core.isValidDate("2026-02-30"), false);
	assert.strictEqual(Core.isValidDate("2028-02-29"), true);
	assert.strictEqual(Core.isValidDate("26-1-1"), false);
	assert.deepStrictEqual(Core.breakdown(90061000), { days: 1, hours: 1, minutes: 1, seconds: 1 });
	assert.strictEqual(Core.dayDiff(at(2026, 3, 28, 23), at(2026, 3, 30, 1)), 2);
});
