/* MagicMirror²
 * Module: MMM-WhatsNext
 * Shows upcoming events with a countdown. Events are managed through a web interface (/whatsnext).
 */
Module.register("MMM-WhatsNext", {
	defaults: {
		maxEvents: 5, // 0 = unlimited
		maxDaysAhead: 0, // 0 = unlimited
		countdownFormat: "auto", // "auto" | "days" | "detailed"
		showDate: true,
		showIcons: true,
		highlightNext: true,
		showSeconds: false, // only used by the "detailed" format
		nowWindowMinutes: 60, // how long a timed event is shown as "now" after it started
		defaultIcon: "calendar-day",
		apiToken: "", // optional: protects the web configuration
		events: [] // optional: initial events, used only if no saved data exists yet
	},

	// Options that can be overridden from the web configuration.
	settingKeys: ["maxEvents", "maxDaysAhead", "countdownFormat", "showDate", "showIcons", "highlightNext", "showSeconds", "nowWindowMinutes"],

	getScripts () {
		return [this.file("core.js")];
	},

	getStyles () {
		return ["font-awesome.css", this.file("MMM-WhatsNext.css")];
	},

	getTranslations () {
		return {
			en: "translations/en.json",
			de: "translations/de.json",
			fr: "translations/fr.json",
			it: "translations/it.json"
		};
	},

	start () {
		this.events = [];
		this.settings = {};
		this.loaded = false;
		this.sendSocketNotification("WHATSNEXT_INIT", {
			apiToken: this.config.apiToken,
			events: this.config.events,
			language: config.language,
			defaults: Object.fromEntries(this.settingKeys.map((key) => [key, this.config[key]]))
		});
		this.scheduleTick();
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "WHATSNEXT_DATA") return;
		this.events = payload.events || [];
		this.settings = payload.settings || {};
		this.loaded = true;
		this.updateDom(this.config.animationSpeed || 300);
		this.scheduleTick();
	},

	options () {
		const opts = Object.assign({}, this.config);
		for (const key of this.settingKeys) {
			if (this.settings[key] !== undefined) opts[key] = this.settings[key];
		}
		return opts;
	},

	scheduleTick () {
		clearTimeout(this.timer);
		const opts = this.options();
		const step = opts.countdownFormat === "detailed" && opts.showSeconds ? 1000 : 60000;
		this.timer = setTimeout(() => {
			this.updateDom();
			this.scheduleTick();
		}, step - Date.now() % step + 20);
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "whatsnext";

		if (!this.loaded) {
			wrapper.className += " dimmed light small";
			wrapper.textContent = this.translate("LOADING");
			return wrapper;
		}

		const opts = this.options();
		const now = new Date();
		const list = WhatsNextCore.upcoming(this.events, now, opts);

		if (list.length === 0) {
			wrapper.className += " dimmed light small";
			wrapper.textContent = this.translate("NO_EVENTS");
			return wrapper;
		}

		const table = document.createElement("table");
		table.className = "small";
		list.forEach(({ ev, occ }, index) => table.appendChild(this.createRow(ev, occ, now, opts, index === 0)));
		wrapper.appendChild(table);
		return wrapper;
	},

	createRow (ev, occ, now, opts, isFirst) {
		const row = document.createElement("tr");
		row.className = "wn-row";
		if (isFirst && opts.highlightNext) row.classList.add("wn-next");
		if (occ.running) row.classList.add("wn-running");
		if (ev.color) row.style.setProperty("--wn-color", ev.color);

		if (opts.showIcons) {
			const iconCell = document.createElement("td");
			iconCell.className = "wn-icon";
			const icon = document.createElement("i");
			icon.className = this.iconClass(ev.icon || opts.defaultIcon);
			iconCell.appendChild(icon);
			row.appendChild(iconCell);
		}

		const main = document.createElement("td");
		main.className = "wn-main";
		const title = document.createElement("div");
		title.className = "wn-title bright";
		title.textContent = ev.title;
		if (ev.showYears && occ.years > 0) {
			const years = document.createElement("span");
			years.className = "wn-years";
			years.textContent = occ.years;
			title.appendChild(years);
		}
		main.appendChild(title);
		if (opts.showDate) {
			const date = document.createElement("div");
			date.className = "wn-date xsmall dimmed";
			date.textContent = this.formatDate(occ, now);
			main.appendChild(date);
		}
		row.appendChild(main);

		const countdown = document.createElement("td");
		countdown.className = "wn-countdown";
		this.fillCountdown(countdown, occ, now, opts);
		row.appendChild(countdown);
		return row;
	},

	iconClass (icon) {
		// Accepts "cake-candles", "fa-cake-candles" or a full class list like "fa-solid fa-cake-candles".
		const name = String(icon).trim();
		if (/\s/.test(name)) return `${name} fa-fw`;
		return `fa fa-fw fa-${name.replace(/^fa-/, "")}`;
	},

	formatDate (occ, now) {
		const options = { weekday: "short", day: "numeric", month: "short" };
		if (occ.start.getFullYear() !== now.getFullYear()) options.year = "numeric";
		if (!occ.allDay) {
			options.hour = "2-digit";
			options.minute = "2-digit";
		}
		try {
			return new Intl.DateTimeFormat(config.language, options).format(occ.start);
		} catch (e) {
			return occ.start.toLocaleString();
		}
	},

	plural (key, n, vars) {
		return this.translate(`${key}_${n === 1 ? "ONE" : "OTHER"}`, Object.assign({ n }, vars));
	},

	fillCountdown (cell, occ, now, opts) {
		const days = WhatsNextCore.dayDiff(now, occ.start);
		const ms = occ.start - now;

		if (occ.running) {
			cell.textContent = this.translate(occ.allDay ? "TODAY" : "NOW");
			cell.classList.add("wn-now");
			return;
		}

		if (opts.countdownFormat === "days") {
			if (days === 0) {
				cell.textContent = this.translate("TODAY");
				cell.classList.add("wn-now");
				return;
			}
			const num = document.createElement("span");
			num.className = "wn-num bright";
			num.textContent = days;
			const label = document.createElement("span");
			label.className = "wn-label xsmall dimmed";
			label.textContent = this.plural("DAYS_LABEL", days);
			cell.append(num, label);
			cell.classList.add("wn-days");
			return;
		}

		if (opts.countdownFormat === "detailed") {
			const b = WhatsNextCore.breakdown(ms);
			const pad = (v) => String(v).padStart(2, "0");
			let text = `${pad(b.hours)}:${pad(b.minutes)}`;
			if (opts.showSeconds) text += `:${pad(b.seconds)}`;
			if (b.days > 0) text = `${this.translate("DAYS_SHORT", { n: b.days })} ${text}`;
			cell.textContent = text;
			cell.classList.add("wn-detailed");
			return;
		}

		// auto
		if (occ.allDay || days > 1) {
			if (days === 0) cell.textContent = this.translate("TODAY");
			else if (days === 1) cell.textContent = this.translate("TOMORROW");
			else cell.textContent = this.plural("IN_DAYS", days);
			return;
		}
		const b = WhatsNextCore.breakdown(ms + 59999); // round minutes up: 30s left -> "1 minute"
		const hours = b.days * 24 + b.hours;
		if (hours === 0) cell.textContent = this.plural("IN_MINUTES", b.minutes);
		else if (days === 1 && hours >= 12) cell.textContent = this.translate("TOMORROW");
		else if (b.minutes === 0) cell.textContent = this.plural("IN_HOURS", hours);
		else cell.textContent = this.translate("IN_HOURS_MINUTES", { h: hours, m: b.minutes });
	}
});
