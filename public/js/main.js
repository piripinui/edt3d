var edt;

function init() {
  // Instantiate a new instance of the app.
  $.get("/accessToken", function(data) {
    edt = new edt3D(data, "cesiumContainer");
  });
}
