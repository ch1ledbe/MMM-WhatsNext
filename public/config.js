/* MMM-WhatsNext – web configuration */
(function () {
	const API = "/whatsnext/api";
	const LANGS = ["de", "en", "fr", "it"];
	const DEFAULTS = { maxEvents: 5, maxDaysAhead: 0, countdownFormat: "auto", showDate: true, showIcons: true, highlightNext: true, showSeconds: false, nowWindowMinutes: 60 };
	const ICON_PICKS = ["calendar-day", "cake-candles", "gift", "heart", "plane", "umbrella-beach", "tree", "champagne-glasses", "graduation-cap", "baby", "car", "music", "futbol", "star"];

	const $ = (sel) => document.querySelector(sel);
	let T = {};
	let lang = "en";
	let state = { events: [], settings: {}, defaults: {} };
	let editingId = null;

	const store = {
		get (key) {
			try { return localStorage.getItem(key); } catch (e) { return null; }
		},
		set (key, value) {
			try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
		}
	};
	let token = store.get("whatsnext-token") || "";

	function t (key, vars) {
		let text = T[key] || key;
		for (const [k, v] of Object.entries(vars || {})) text = text.split(`{${k}}`).join(v);
		return text;
	}

	function toast (message, isError) {
		const el = $("#toast");
		el.textContent = message;
		el.classList.toggle("err", !!isError);
		el.classList.add("show");
		clearTimeout(toast.timer);
		toast.timer = setTimeout(() => el.classList.remove("show"), 2500);
	}

	function iconClass (icon) {
		const name = String(icon || "calendar-day").trim();
		if (/\s/.test(name)) return `${name} fa-fw`;
		return `fa-solid fa-fw fa-${name.replace(/^fa-/, "")}`;
	}

	// ---------- i18n ----------

	async function setLanguage (code) {
		lang = LANGS.includes(code) ? code : "en";
		const res = await fetch(`../translations/${lang}.json`);
		T = await res.json();
		document.documentElement.lang = lang;
		document.title = t("UI_TITLE");
		document.querySelectorAll("[data-i18n]").forEach((el) => {
			el.textContent = t(el.dataset.i18n);
		});
		$("#lang-select").value = lang;
		renderEvents();
	}

	function detectLanguage (mirrorLanguage) {
		const saved = store.get("whatsnext-lang");
		if (LANGS.includes(saved)) return saved;
		for (const l of navigator.languages || [navigator.language]) {
			const short = String(l).slice(0, 2).toLowerCase();
			if (LANGS.includes(short)) return short;
		}
		return LANGS.includes(mirrorLanguage) ? mirrorLanguage : "en";
	}

	// ---------- API ----------

	function askToken () {
		return new Promise((resolve) => {
			const dialog = $("#token-dialog");
			const form = $("#token-form");
			form.elements.token.value = "";
			form.onsubmit = () => {
				token = form.elements.token.value.trim();
				store.set("whatsnext-token", token);
				resolve();
			};
			dialog.showModal();
		});
	}

	async function api (method, path, body) {
		const headers = { "Content-Type": "application/json" };
		if (token) headers["X-WhatsNext-Token"] = token;
		const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
		if (res.status === 401) {
			await askToken();
			return api(method, path, body);
		}
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.error || `HTTP ${res.status}`);
		}
		return res.status === 204 ? null : res.json();
	}

	async function reload () {
		state = await api("GET", "/state");
		renderEvents();
		renderSettings();
	}

	// ---------- events ----------

	function countdownText (occ, now) {
		if (occ.running) return t(occ.allDay ? "TODAY" : "NOW");
		const days = WhatsNextCore.dayDiff(now, occ.start);
		if (days === 0) {
			if (occ.allDay) return t("TODAY");
			const b = WhatsNextCore.breakdown(occ.start - now + 59999);
			return b.hours === 0 ? t(`IN_MINUTES_${b.minutes === 1 ? "ONE" : "OTHER"}`, { n: b.minutes }) : t("IN_HOURS_MINUTES", { h: b.hours, m: b.minutes });
		}
		if (days === 1) return t("TOMORROW");
		return t("IN_DAYS_OTHER", { n: days });
	}

	function formatDate (date, allDay) {
		const options = { weekday: "short", day: "numeric", month: "short", year: "numeric" };
		if (!allDay) Object.assign(options, { hour: "2-digit", minute: "2-digit" });
		return new Intl.DateTimeFormat(lang, options).format(date);
	}

	function renderEvents () {
		const list = $("#event-list");
		if (!T.UI_TITLE) return;
		const now = new Date();
		const opts = { nowWindowMinutes: currentSettings().nowWindowMinutes };
		const items = state.events.map((ev) => ({ ev, occ: WhatsNextCore.nextOccurrence(ev, now, opts) }));
		// upcoming first (by date), then past events
		items.sort((a, b) => (a.occ ? a.occ.start : Infinity) - (b.occ ? b.occ.start : Infinity) || a.ev.title.localeCompare(b.ev.title));

		list.replaceChildren(...items.map(({ ev, occ }) => {
			const li = document.createElement("li");
			li.className = "ev";
			if (!occ || ev.enabled === false) li.classList.add("inactive");
			if (ev.color) li.style.setProperty("--c", ev.color);

			const icon = document.createElement("span");
			icon.className = "ev-icon";
			icon.innerHTML = `<i class="${iconClass(ev.icon)}"></i>`;

			const body = document.createElement("div");
			const title = document.createElement("div");
			title.className = "ev-title";
			title.textContent = ev.title;
			const badges = [];
			if (ev.showYears && occ && occ.years > 0) badges.push(String(occ.years));
			if (ev.enabled === false) badges.push(t("UI_HIDDEN"));
			for (const text of badges) {
				const badge = document.createElement("span");
				badge.className = "badge";
				badge.textContent = text;
				title.appendChild(badge);
			}
			const meta = document.createElement("div");
			meta.className = "ev-meta";
			const parts = WhatsNextCore.parseParts(ev);
			const shown = occ ? occ.start : new Date(parts.y, parts.mo, parts.d, parts.h, parts.mi);
			meta.textContent = [
				formatDate(shown, !ev.time),
				ev.time ? null : t("UI_ALL_DAY"),
				ev.repeat && ev.repeat !== "none" ? t(`UI_REPEAT_${ev.repeat.toUpperCase()}`) : null
			].filter(Boolean).join(" · ");
			body.append(title, meta);

			const when = document.createElement("div");
			when.className = "ev-when";
			when.textContent = occ ? countdownText(occ, now) : t("UI_PAST");

			const actions = document.createElement("div");
			actions.className = "ev-actions";
			actions.append(
				actionButton("fa-pen", t("UI_EDIT"), () => openEditor(ev)),
				actionButton("fa-trash", t("UI_DELETE"), () => removeEvent(ev), "danger")
			);

			li.append(icon, body, when, actions);
			return li;
		}));
		$("#empty").hidden = state.events.length > 0;
	}

	function actionButton (icon, label, onClick, extra) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = `btn icon ${extra || ""}`;
		btn.title = label;
		btn.setAttribute("aria-label", label);
		btn.innerHTML = `<i class="fa-solid ${icon}"></i>`;
		btn.addEventListener("click", onClick);
		return btn;
	}

	function openEditor (ev) {
		const form = $("#event-form");
		editingId = ev ? ev.id : null;
		$("#event-dialog-title").textContent = ev ? t("UI_EDIT") : t("UI_ADD");
		form.elements.title.value = ev ? ev.title : "";
		form.elements.date.value = ev ? ev.date : new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
		form.elements.time.value = ev ? ev.time : "";
		form.elements.repeat.value = ev ? ev.repeat || "none" : "none";
		form.elements.icon.value = ev ? ev.icon : "";
		form.elements.color.value = ev && ev.color ? ev.color : "#ffffff";
		form.elements.showYears.checked = ev ? !!ev.showYears : false;
		form.elements.enabled.checked = ev ? ev.enabled !== false : true;
		$("#event-error").hidden = true;
		updateIconPreview();
		$("#event-dialog").showModal();
		form.elements.title.focus();
	}

	function updateIconPreview () {
		$("#icon-preview").className = iconClass($("#event-form").elements.icon.value);
	}

	async function saveEvent (e) {
		e.preventDefault();
		const form = e.target;
		const data = {
			title: form.elements.title.value.trim(),
			date: form.elements.date.value,
			time: form.elements.time.value,
			repeat: form.elements.repeat.value,
			icon: form.elements.icon.value.trim(),
			color: form.elements.color.value,
			showYears: form.elements.showYears.checked,
			enabled: form.elements.enabled.checked
		};
		if (!data.title || !WhatsNextCore.isValidDate(data.date)) {
			showFormError(t("UI_REQUIRED"));
			return;
		}
		try {
			if (editingId) await api("PUT", `/events/${encodeURIComponent(editingId)}`, data);
			else await api("POST", "/events", data);
			$("#event-dialog").close();
			toast(t("UI_SAVED"));
			await reload();
		} catch (err) {
			showFormError(t("UI_ERROR", { msg: err.message }));
		}
	}

	function showFormError (message) {
		const el = $("#event-error");
		el.textContent = message;
		el.hidden = false;
	}

	async function removeEvent (ev) {
		if (!confirm(t("UI_CONFIRM_DELETE", { title: ev.title }))) return;
		try {
			await api("DELETE", `/events/${encodeURIComponent(ev.id)}`);
			await reload();
		} catch (err) {
			toast(t("UI_ERROR", { msg: err.message }), true);
		}
	}

	// ---------- settings ----------

	function currentSettings () {
		return Object.assign({}, DEFAULTS, state.defaults, state.settings);
	}

	function renderSettings () {
		const form = $("#settings-form");
		const s = currentSettings();
		for (const [key, value] of Object.entries(s)) {
			const input = form.elements[key];
			if (!input) continue;
			if (input.type === "checkbox") input.checked = !!value;
			else input.value = value;
		}
	}

	async function saveSettings (e) {
		e.preventDefault();
		const form = e.target;
		const data = {};
		for (const key of Object.keys(DEFAULTS)) {
			const input = form.elements[key];
			data[key] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
		}
		try {
			state.settings = await api("PUT", "/settings", data);
			toast(t("UI_SAVED"));
			renderEvents();
		} catch (err) {
			toast(t("UI_ERROR", { msg: err.message }), true);
		}
	}

	// ---------- init ----------

	async function init () {
		$("#add-btn").addEventListener("click", () => openEditor(null));
		$("#event-cancel").addEventListener("click", () => $("#event-dialog").close());
		$("#event-form").addEventListener("submit", saveEvent);
		$("#event-form").elements.icon.addEventListener("input", updateIconPreview);
		$("#settings-form").addEventListener("submit", saveSettings);
		$("#lang-select").addEventListener("change", (e) => {
			store.set("whatsnext-lang", e.target.value);
			setLanguage(e.target.value);
		});
		$("#icon-picks").replaceChildren(...ICON_PICKS.map((name) => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.title = name;
			btn.innerHTML = `<i class="${iconClass(name)}"></i>`;
			btn.addEventListener("click", () => {
				$("#event-form").elements.icon.value = name;
				updateIconPreview();
			});
			return btn;
		}));

		let meta = { ready: false, language: "en" };
		try {
			meta = await fetch(`${API}/meta`).then((r) => r.json());
		} catch (e) { /* handled below */ }
		await setLanguage(detectLanguage(meta.language));

		if (!meta.ready) {
			const banner = $("#banner");
			banner.textContent = t("UI_NOT_READY");
			banner.hidden = false;
			return;
		}
		try {
			await reload();
		} catch (err) {
			toast(t("UI_ERROR", { msg: err.message }), true);
		}
		setInterval(renderEvents, 60000);
	}

	init();
})();
