const request = require('request'),
express = require('express'),
path = require('path'),
fs = require('fs');
var port,
lidarServer,
accessToken;

// Set the port - defaults to 3001 if the environment variable is not set.
port = typeof process.env.EDT3D_SERVER_PORT != "undefined" ? process.env.EDT3D_SERVER_PORT : 3001;

// The location of the server providing LiDAR data is defined by the environment variable LIDAR_SERVER.
// This allows us to dynamically specify where it is if it is running in a container in a Kubernetes environment.
lidarServer = typeof process.env.LIDAR_SERVER != "undefined" ? process.env.LIDAR_SERVER : "http://localhost";

// Read the Cesium access token from the environment, which means we can configure it in a K8s setup.
accessToken = process.env.EDT3D_ACCESS_TOKEN;

app = express();

// Serve up the content of public, where the HTML/JS client code is.
app.use(express.static(path.join(__dirname, 'public')));

app.get("/lidar_data/*tileset.json", function(req, res) {
	// Request for the 3D Tiles tileset - Redirect to LiDAR server.
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
	// Request for the 3D Tiles point data - Redirect to LiDAR server.
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

app.get("/accessToken", function(req,res) {
	if (typeof accessToken == "undefined") {
		res.status(500).end('No access token configured');
	}
	else {
		res.send(accessToken);
		res.status(200).end();
	}
});

app.listen(port, function () {
	console.log('edt-3d listening on port ' + port + '!');
});
