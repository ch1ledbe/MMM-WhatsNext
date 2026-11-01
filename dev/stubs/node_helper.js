// Minimal stand-in for MagicMirror's node_helper (dev preview only).
module.exports = {
	create (definition) {
		return Object.assign({
			setName (name) { this.name = name; },
			setPath (p) { this.path = p; },
			setExpressApp (app) { this.expressApp = app; },
			sendSocketNotification () {}
		}, definition);
	}
};
