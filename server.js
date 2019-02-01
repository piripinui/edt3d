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

app.get("/trace", function(req, res) {
	var param = req.url.split("?");
	var id = param[1].split("=")[1];
	console.log("id = " + id);

	var options = { method: 'POST',
	  url: 'https://de-dev.azurefd.net/v1/adms/trace',
	  headers:
	   { 'Postman-Token': '3b7a42dd-bc11-49de-9dca-b628233367ca',
	     'cache-control': 'no-cache',
	     'Content-Type': 'application/json' },
	  body: { type: 'downstream', id: id },
	  json: true };

	request(options, function (error, response, body) {
	  if (error) throw new Error(error);

		console.log(body);

		if (body.hasOwnProperty("status")) {
			if (body.status == 404) {
				res.status(404).end();
			}
		}
		else {
		  var result = {
				meterCount: countMeters(body.trace[0])
			}

			res.send(JSON.stringify(result));
			res.status(200).end();
		}
	});
})

app.get("/getmetercount", function(req, res) {
	var param = req.url.split("?");
	var id = param[1].split("=")[1];
	console.log("id = " + id);

	var result = deviceMeterCount[id];

	if (typeof result != "undefined") {
		var count = {};
		count[id] = result;
		res.send(JSON.stringify(count));
		res.status(200).end();
	}
	else {
		res.status(400).end();
	}
})

var deviceMeterCount = {};

function createTraceResults() {
	var fs = require('fs');
	var obj;
	fs.readFile('public/js/trace_data.json', 'utf8', function (err, data) {
	  if (err) throw err;
	  obj = JSON.parse(data);

		var trace = obj.trace[0];

		populateTraceResults(trace);
	});
}

function populateTraceResults(anElement) {
	var elementType = anElement.root.properties.data.category
	// Only count "significant" elements i.e. circuit breakers, transformers, switches etc.

	if (elementType == "CircuitBreaker" || elementType == "Switch" || elementType == "Transformer" || elementType == "Fuse") {
		deviceMeterCount[anElement.root.id] = countMeters(anElement);
	}
	anElement.children.forEach(function(aChild) {
		populateTraceResults(aChild);
	});
}

function countMeters(anElement) {
	var numMeters = 0;

	if (anElement.root.properties.data.category == "Meter")
		numMeters++;

	anElement.children.forEach(function(aChild) {
		numMeters += countMeters(aChild);
	})

	return numMeters;
}

app.listen(port, function () {
	console.log('edt-3d listening on port ' + port + '!');
	createTraceResults();
});
