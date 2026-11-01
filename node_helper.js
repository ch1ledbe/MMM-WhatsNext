/* MagicMirror²
 * Node Helper: MMM-WhatsNext
 * Persists events/settings in data/whatsnext.json and exposes a small REST API for the web configuration.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const NodeHelper = require("node_helper");
const Core = require("./core.js");

let Log;
try {
	Log = require("logger");
} catch (e) {
	Log = console;
}

const LANGUAGES = ["de", "en", "fr", "it"];
const SETTINGS = {
	maxEvents: { type: "int", min: 0, max: 100 },
	maxDaysAhead: { type: "int", min: 0, max: 3650 },
	countdownFormat: { type: "enum", values: ["auto", "days", "detailed"] },
	showDate: { type: "bool" },
	showIcons: { type: "bool" },
	highlightNext: { type: "bool" },
	showSeconds: { type: "bool" },
	nowWindowMinutes: { type: "int", min: 0, max: 1440 }
};
const MAX_BODY = 64 * 1024;

module.exports = NodeHelper.create({
	start () {
		this.dataFile = path.join(this.path, "data", "whatsnext.json");
		this.hasDataFile = fs.existsSync(this.dataFile);
		this.state = this.load();
		this.ready = false;
		this.apiToken = "";
		this.language = "en";
		this.configDefaults = {};
		this.registerRoutes();
		Log.log(`[MMM-WhatsNext] web configuration available at /whatsnext (${this.state.events.length} events loaded)`);
	},

	load () {
		try {
			const data = JSON.parse(fs.readFileSync(this.dataFile, "utf8"));
			return {
				events: Array.isArray(data.events) ? data.events : [],
				settings: data.settings && typeof data.settings === "object" ? data.settings : {}
			};
		} catch (e) {
			if (e.code !== "ENOENT") Log.error(`[MMM-WhatsNext] could not read ${this.dataFile}: ${e.message}`);
			return { events: [], settings: {} };
		}
	},

	save () {
		fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
		const tmp = `${this.dataFile}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
		fs.renameSync(tmp, this.dataFile);
		this.hasDataFile = true;
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "WHATSNEXT_INIT") return;
		payload = payload || {};
		this.apiToken = typeof payload.apiToken === "string" ? payload.apiToken : "";
		this.language = LANGUAGES.includes(payload.language) ? payload.language : "en";
		this.configDefaults = this.validateSettings(payload.defaults || {}).value || {};

		// Seed events from config.js once, as long as nothing has been saved through the web interface.
		if (!this.hasDataFile && Array.isArray(payload.events) && payload.events.length > 0) {
			this.state.events = payload.events
				.map((ev) => this.validateEvent(ev))
				.filter((res) => res.value)
				.map((res) => Object.assign({ id: this.newId() }, res.value));
			this.save();
		}
		this.ready = true;
		this.broadcast();
	},

	broadcast () {
		this.sendSocketNotification("WHATSNEXT_DATA", this.state);
	},

	newId () {
		return crypto.randomBytes(6).toString("hex");
	},

	registerRoutes () {
		this.expressApp.get("/whatsnext", (req, res) => {
			res.writeHead(302, { Location: "/modules/MMM-WhatsNext/public/config.html" });
			res.end();
		});
		this.expressApp.use("/whatsnext/api", (req, res) => {
			this.handleApi(req, res).catch((e) => {
				Log.error(`[MMM-WhatsNext] ${e.stack || e}`);
				this.send(res, 500, { error: "internal_error" });
			});
		});
	},

	send (res, status, body) {
		if (res.headersSent) return;
		res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
		res.end(body === undefined ? "" : JSON.stringify(body));
	},

	authorized (req) {
		if (!this.apiToken) return true;
		const given = Buffer.from(String(req.headers["x-whatsnext-token"] || ""));
		const expected = Buffer.from(this.apiToken);
		return given.length === expected.length && crypto.timingSafeEqual(given, expected);
	},

	readBody (req) {
		// Express may already have parsed the body (express.json()).
		if (req._body && req.body && typeof req.body === "object") return Promise.resolve(req.body);
		if (req.readableEnded) return Promise.resolve({});
		return new Promise((resolve, reject) => {
			let raw = "";
			req.setEncoding("utf8");
			req.on("data", (chunk) => {
				raw += chunk;
				if (raw.length > MAX_BODY) {
					reject(Object.assign(new Error("body too large"), { status: 413 }));
					req.destroy();
				}
			});
			req.on("end", () => {
				try {
					resolve(raw ? JSON.parse(raw) : {});
				} catch (e) {
					reject(Object.assign(new Error("invalid json"), { status: 400 }));
				}
			});
			req.on("error", reject);
		});
	},

	async handleApi (req, res) {
		const parts = new URL(req.url, "http://localhost").pathname.split("/").filter(Boolean);
		const method = req.method;

		if (parts[0] === "meta" && method === "GET") {
			return this.send(res, 200, { ready: this.ready, needsToken: !!this.apiToken, language: this.language, languages: LANGUAGES });
		}
		if (!this.ready) return this.send(res, 503, { error: "not_ready" });
		if (!this.authorized(req)) return this.send(res, 401, { error: "unauthorized" });

		let body = {};
		if (method === "POST" || method === "PUT") {
			try {
				body = await this.readBody(req);
			} catch (e) {
				return this.send(res, e.status || 400, { error: e.message });
			}
		}

		const [resource, id] = parts;
		if (resource === "state" && method === "GET") {
			return this.send(res, 200, Object.assign({ defaults: this.configDefaults }, this.state));
		}

		if (resource === "settings" && method === "PUT") {
			const result = this.validateSettings(body);
			if (result.error) return this.send(res, 400, { error: result.error });
			this.state.settings = Object.assign({}, this.state.settings, result.value);
			return this.commit(res, 200, this.state.settings);
		}

		if (resource === "events") {
			if (!id && method === "GET") return this.send(res, 200, this.state.events);
			if (!id && method === "POST") {
				const result = this.validateEvent(body);
				if (result.error) return this.send(res, 400, { error: result.error });
				const ev = Object.assign({ id: this.newId() }, result.value);
				this.state.events.push(ev);
				return this.commit(res, 201, ev);
			}
			const index = this.state.events.findIndex((ev) => ev.id === id);
			if (id && index === -1) return this.send(res, 404, { error: "not_found" });
			if (id && method === "PUT") {
				const result = this.validateEvent(body);
				if (result.error) return this.send(res, 400, { error: result.error });
				const ev = Object.assign({ id }, result.value);
				this.state.events[index] = ev;
				return this.commit(res, 200, ev);
			}
			if (id && method === "DELETE") {
				this.state.events.splice(index, 1);
				return this.commit(res, 204);
			}
		}
		return this.send(res, 404, { error: "not_found" });
	},

	commit (res, status, body) {
		this.save();
		this.broadcast();
		this.send(res, status, body);
	},

	validateEvent (input) {
		if (!input || typeof input !== "object") return { error: "invalid_event" };
		const title = typeof input.title === "string" ? input.title.trim() : "";
		if (!title || title.length > 100) return { error: "invalid_title" };
		if (!Core.isValidDate(input.date)) return { error: "invalid_date" };
		const time = typeof input.time === "string" ? input.time.trim() : "";
		if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: "invalid_time" };
		const repeat = input.repeat || "none";
		if (!Core.REPEATS.includes(repeat)) return { error: "invalid_repeat" };
		const icon = typeof input.icon === "string" ? input.icon.trim() : "";
		if (!/^[a-z0-9 -]{0,60}$/i.test(icon)) return { error: "invalid_icon" };
		const color = typeof input.color === "string" ? input.color.trim() : "";
		if (color && !/^#[0-9a-f]{6}$/i.test(color)) return { error: "invalid_color" };

		return {
			value: {
				title,
				date: input.date,
				time,
				repeat,
				icon,
				color,
				showYears: input.showYears === true,
				enabled: input.enabled !== false
			}
		};
	},

	validateSettings (input) {
		if (!input || typeof input !== "object") return { error: "invalid_settings" };
		const value = {};
		for (const [key, rule] of Object.entries(SETTINGS)) {
			if (input[key] === undefined) continue;
			const v = input[key];
			if (rule.type === "bool") {
				if (typeof v !== "boolean") return { error: `invalid_${key}` };
				value[key] = v;
			} else if (rule.type === "int") {
				const n = Number(v);
				if (!Number.isInteger(n) || n < rule.min || n > rule.max) return { error: `invalid_${key}` };
				value[key] = n;
			} else if (!rule.values.includes(v)) {
				return { error: `invalid_${key}` };
			} else {
				value[key] = v;
			}
		}
		return { value };
	}
});
