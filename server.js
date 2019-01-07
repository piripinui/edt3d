const request = require('request'),
express = require('express'),
path = require('path'),
fs = require('fs');
var port = 3001,
lidarServer;

lidarServer = typeof process.env.LIDAR_SERVER != "undefined" ? process.env.LIDAR_SERVER : "http://localhost";

fs.readFile("./config.json", "utf8", function(err, data) {
	configData = JSON.parse(data);
});

app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.get("/lidar_data/*tileset.json", function(req, res) {
	// Redirect to LiDAR server.
	var redirectURL = lidarServer + req.url;

	request({
		url: redirectURL
	},
	function(err, resp, body) {
		if (err) {
			return res.status(500).end('Error');
		}
		else {
			res.send(body);
			res.end(200);
		}
	})
});

app.get("/lidar_data/*.pnts", function(req, res) {
	// Redirect to LiDAR server.
	request({
		url: lidarServer + req.url,
		encoding: null
	},
	function(err, resp, body) {
		if (err) {
			return res.status(500).end('Error');
		}
		else {
			res.send(body);
			res.end(200);
		}
	})
});

app.listen(port, function () {
	console.log('edt-3d listening on port ' + port + '!');
});
