var edt;

function init() {
  function correctWidgetHeight() {
    var titleBarHeight = $("#abb_bar").outerHeight(true);
    var navbarHeight = $("#abb_navi").outerHeight(true);
    var heightInPixels = $("#map_container").outerHeight(true) - titleBarHeight - navbarHeight;
    console.log("Correcting height to " + heightInPixels);
    $(".cesium-widget").css("height", heightInPixels);
  }
  // Instantiate a new instance of the app.
  $.get("/accessToken", function(data) {
    edt = new edt3D(data, "cesiumContainer");
  });

  $(document).on("mapCreated", correctWidgetHeight);
}
