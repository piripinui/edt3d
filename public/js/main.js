var edt;

function init() {
  function correctWidgetHeight() {
    // The Cesium container takes more height than is available to the screen, meaning you'll get scrollbars.
    var titleBarHeight = $("#abb_bar").outerHeight(true);
    var navbarHeight = $("#abb_navi").outerHeight(true);
    var mapContainerHeight = $("#map_container").outerHeight(true);
    var heightInPixels = mapContainerHeight - titleBarHeight - navbarHeight + 120;
    var cesiumWidgetHeight = $(".cesium-widget").outerHeight(true);

    console.log("Correcting height to " + heightInPixels + " from " + cesiumWidgetHeight);
    $(".cesium-widget").css("height", heightInPixels);
  }
  // Instantiate a new instance of the app.
  $.get("/accessToken", function(data) {
    edt = new edt3D(data, "cesiumContainer");
  });

  $(document).on("mapCreated", correctWidgetHeight);
}
