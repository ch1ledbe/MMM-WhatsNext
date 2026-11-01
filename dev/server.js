/* Standalone preview server – runs the module without a full MagicMirror installation.
 *   node dev/server.js [port] [language]
 * Mirror preview:     http://localhost:8090/
 * Web configuration:  http://localhost:8090/whatsnext
 * Data is stored in dev/data/ so a real installation is not touched.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const PORT = Number(process.argv[2]) || 8090;
const LANGUAGE = process.argv[3] || "de";
const ROOT = path.resolve(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

// Provide MagicMirror's "node_helper" and "logger" modules.
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	if (request === "node_helper") return path.join(__dirname, "stubs", "node_helper.js");
	if (request === "logger") return path.join(__dirname, "stubs", "logger.js");
	return resolve.call(this, request, ...args);
};

const routes = [];
const app = {
	get: (p, fn) => routes.push({ method: "GET", path: p, exact: true, fn }),
	use: (p, fn) => routes.push({ path: p, exact: false, fn })
};

const helper = require("../node_helper.js");
helper.setName("MMM-WhatsNext");
helper.setPath(path.join(__dirname)); // data/ ends up in dev/data
helper.setExpressApp(app);
helper.start();

// The preview page polls this endpoint instead of using socket.io.
let lastPayload = null;
helper.sendSocketNotification = (notification, payload) => {
	lastPayload = { notification, payload };
};

function serveStatic (res, file) {
	if (!file.startsWith(ROOT)) {
		res.writeHead(403);
		return res.end();
	}
	fs.readFile(file, (err, data) => {
		if (err) {
			res.writeHead(404);
			return res.end("not found");
		}
		res.writeHead(200, { "Content-Type": `${MIME[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
		res.end(data);
	});
}

http.createServer((req, res) => {
	const url = new URL(req.url, "http://localhost");
	const pathname = decodeURIComponent(url.pathname);

	for (const route of routes) {
		if (route.method && route.method !== req.method) continue;
		const match = route.exact ? pathname === route.path : pathname === route.path || pathname.startsWith(`${route.path}/`);
		if (!match) continue;
		if (!route.exact) req.url = req.url.slice(route.path.length) || "/";
		return route.fn(req, res);
	}

	if (pathname === "/dev/socket" && req.method === "POST") {
		let raw = "";
		req.on("data", (c) => (raw += c));
		req.on("end", () => {
			const { notification, payload } = JSON.parse(raw || "{}");
			helper.socketNotificationReceived(notification, payload);
			res.writeHead(204);
			res.end();
		});
		return;
	}
	if (pathname === "/dev/socket") {
		res.writeHead(200, { "Content-Type": "application/json" });
		return res.end(JSON.stringify(lastPayload));
	}
	if (pathname === "/") return serveStatic(res, path.join(__dirname, "index.html"));
	if (pathname === "/dev/config.js") {
		res.writeHead(200, { "Content-Type": "text/javascript" });
		return res.end(`var config = { language: ${JSON.stringify(LANGUAGE)} };`);
	}
	if (pathname.startsWith("/modules/MMM-WhatsNext/")) {
		return serveStatic(res, path.join(ROOT, pathname.slice("/modules/MMM-WhatsNext/".length)));
	}
	if (pathname.startsWith("/dev/")) return serveStatic(res, path.join(__dirname, pathname.slice(5)));
	res.writeHead(404);
	res.end("not found");
}).listen(PORT, () => {
	console.log(`MMM-WhatsNext preview: http://localhost:${PORT}/  –  configuration: http://localhost:${PORT}/whatsnext`);
});
