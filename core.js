/* MMM-WhatsNext
 * Shared date logic, used by the mirror frontend, the web configuration and the node helper.
 */
(function (root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) {
		module.exports = api;
	} else {
		root.WhatsNextCore = api;
	}
})(typeof self !== "undefined" ? self : this, function () {
	const DAY = 86400000;
	const REPEATS = ["none", "weekly", "monthly", "yearly"];

	function parseParts (ev) {
		const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ev && ev.date || "");
		if (!d) return null;
		const t = /^(\d{2}):(\d{2})$/.exec(ev.time || "");
		return {
			y: Number(d[1]),
			mo: Number(d[2]) - 1,
			d: Number(d[3]),
			h: t ? Number(t[1]) : 0,
			mi: t ? Number(t[2]) : 0,
			allDay: !t
		};
	}

	// Builds a local date and clamps the day to the month length (31st -> 30th, 29.02. -> 28.02.).
	function build (y, mo, d, h, mi) {
		const last = new Date(y, mo + 1, 0).getDate();
		return new Date(y, mo, Math.min(d, last), h, mi);
	}

	function startOfDay (date) {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate());
	}

	// Calendar days between two dates (rounding absorbs DST shifts).
	function dayDiff (from, to) {
		return Math.round((startOfDay(to) - startOfDay(from)) / DAY);
	}

	function isValidDate (str) {
		const p = parseParts({ date: str });
		if (!p) return false;
		const date = new Date(p.y, p.mo, p.d);
		return date.getFullYear() === p.y && date.getMonth() === p.mo && date.getDate() === p.d;
	}

	/**
	 * Returns the next relevant occurrence of an event or null if it is over.
	 * All-day events stay visible for the whole day, timed events for `nowWindowMinutes` after their start.
	 */
	function nextOccurrence (ev, now, opts) {
		const p = parseParts(ev);
		if (!p) return null;
		const win = Math.max(0, Number(opts && opts.nowWindowMinutes) || 0);
		const repeat = REPEATS.includes(ev.repeat) ? ev.repeat : "none";
		const over = (s) => {
			const end = p.allDay ? new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1) : new Date(s.getTime() + win * 60000);
			return end <= now;
		};

		let start = build(p.y, p.mo, p.d, p.h, p.mi);
		if (over(start) && repeat !== "none") {
			if (repeat === "yearly") {
				start = build(now.getFullYear(), p.mo, p.d, p.h, p.mi);
				if (over(start)) start = build(now.getFullYear() + 1, p.mo, p.d, p.h, p.mi);
			} else if (repeat === "monthly") {
				start = build(now.getFullYear(), now.getMonth(), p.d, p.h, p.mi);
				if (over(start)) start = build(now.getFullYear(), now.getMonth() + 1, p.d, p.h, p.mi);
			} else {
				const weeks = Math.max(0, Math.floor(dayDiff(start, now) / 7));
				start = new Date(p.y, p.mo, p.d + weeks * 7, p.h, p.mi);
				while (over(start)) start = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7, p.h, p.mi);
			}
		}
		if (over(start)) return null;

		return {
			start,
			allDay: p.allDay,
			running: start <= now,
			years: repeat === "yearly" ? start.getFullYear() - p.y : null
		};
	}

	/** Sorted list of upcoming { ev, occ } entries, honouring enabled, maxDaysAhead and maxEvents. */
	function upcoming (events, now, opts) {
		opts = opts || {};
		const horizon = Number(opts.maxDaysAhead) > 0 ? Number(opts.maxDaysAhead) : Infinity;
		const limit = Number(opts.maxEvents) > 0 ? Number(opts.maxEvents) : undefined;
		return (events || [])
			.filter((ev) => ev && ev.enabled !== false)
			.map((ev) => ({ ev, occ: nextOccurrence(ev, now, opts) }))
			.filter((x) => x.occ && dayDiff(now, x.occ.start) <= horizon)
			.sort((a, b) => a.occ.start - b.occ.start)
			.slice(0, limit);
	}

	function breakdown (ms) {
		const total = Math.max(0, Math.floor(ms / 1000));
		return {
			days: Math.floor(total / 86400),
			hours: Math.floor(total % 86400 / 3600),
			minutes: Math.floor(total % 3600 / 60),
			seconds: total % 60
		};
	}

	return { REPEATS, parseParts, isValidDate, dayDiff, nextOccurrence, upcoming, breakdown };
});
