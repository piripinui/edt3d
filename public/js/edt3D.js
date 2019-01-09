class edt3D {

  /** Creates a new instance.
   * @constructor
   * @param {string} accessToken - A Cesium access token string.
   * @param {string} cesiumContainer - The DOM id to put used by the Cesium container.
   */
  constructor(accessToken, cesiumContainer) {
    this.accessToken = accessToken;
    this.cesiumContainer = cesiumContainer;
    this.tilesets = [];
    this.shadingSet = false;

    this.initialise();
  }

  /** Initialises the map.
   */
  initMap() {
    Cesium.Ion.defaultAccessToken = this.accessToken;
    var extent = Cesium.Rectangle.fromDegrees(this.configData.startExtent.minLongitude,
      this.configData.startExtent.maxLatitude,
      this.configData.startExtent.maxLongitude,
      this.configData.startExtent.minLatitude);

    Cesium.Camera.DEFAULT_VIEW_RECTANGLE = extent;
    Cesium.Camera.DEFAULT_VIEW_FACTOR = 0;

    this.cesiumTerrainProvider = Cesium.createWorldTerrain();

    this.cesiumViewer = new Cesium.Viewer(this.cesiumContainer, {
        terrainProvider: this.cesiumTerrainProvider,
        timeline: this.configData.cesiumParams.timeline,
        navigationHelpButton: this.configData.cesiumParams.navigationHelpButton,
        animation: this.configData.cesiumParams.animation,
        projectionPicker: this.configData.cesiumParams.projectionPicker,
        sceneModePicker: this.configData.cesiumParams.sceneModePicker,
        geocoder: false
    });

    this.cesiumViewer.scene.globe.depthTestAgainstTerrain = true;

    this.extrudedEntities = this.cesiumViewer.entities.add(new Cesium.Entity());
    this.extrudedEntities.show = true;

    this.geocoder = new Cesium.Geocoder({
      container: "abb_navi",
      scene: this.cesiumViewer.scene
    });

    $(document).trigger("mapCreated");
  }

  /** Performs general initialisation, including the map, layer and LiDAR data loading.
   * @param {function} prerenderFunction - An optional function to run when pre-render event occurs.
   */
  initialise() {
    const edt = this;
    // Load the configuration data.
    $.get("config.json", function(data) {
      edt.configData = data;
      edt.initMap();
      edt.loadLayers();
      edt.loadLidarTiles();
      edt.tidyUp();
      edt.addTXModelAtCoordinate(-98.499700, 29.545947, 10.0);
    })
  }

  /** Loads the vector data from the Data Fabric instance and converts to extruded
   * 3D polygons (with labels) for both linear and point features.
   */
  loadLayers() {
    // Read the configuration data and create layers from it.
    const edt = this;

    this.configData.layers.forEach(function(featureClassDef) {
      var featureType = featureClassDef.featureType;

      featureClassDef.featureClasses.forEach(function(aLayerDef) {
        var layerName = aLayerDef.layerName;

        $.get(edt.configData.dataFabricURL + featureType + "?types=" + layerName, function(data) {
          switch(layerName) {
            case "Links":
              console.log("Loading Links...");
              for (var i =0; i < data.features.features.length; i++) {
                var aFeature = data.features.features[i];
                // Buffer the linear feature by 1 metre using Turf.js in order to create the polygon extrusion.
                var poly = turf.buffer(aFeature, 0.001);
                var degArray = [];

                poly.geometry.coordinates[0].forEach(function(aCoordinate) {
                  degArray.push(aCoordinate[0]);
                  degArray.push(aCoordinate[1]);
                });

                var linkPolygon = edt.cesiumViewer.entities.add({
                    name : 'Topology Link',
                    parent: edt.extrudedEntitiess,
                    polygon : {
                      hierarchy : Cesium.Cartesian3.fromDegreesArray(degArray),
                      material : new Cesium.Color(edt.configData.cesiumParams.linkColor.red, edt.configData.cesiumParams.linkColor.green, edt.configData.cesiumParams.linkColor.blue, edt.configData.cesiumParams.linkColor.alpha),
                      height : edt.configData.cesiumParams.extrusionHeight,
                      heightReference : Cesium.HeightReference.RELATIVE_TO_GROUND,
                      extrudedHeight : 0.0,
                      extrudedHeightReference : Cesium.HeightReference.CLAMP_TO_GROUND
                    }
                });
              };
              break;
            case "CircuitBreaker":
              edt.createAPMVisualisationForPoints(data, "CircuitBreaker");
              edt.createLabelForPoints(data, "CircuitBreaker");
              break;
            case "Fuse":
              edt.createAPMVisualisationForPoints(data, "Fuse");
              edt.createLabelForPoints(data, "Fuse");
              break;
            case "Transformer":
              edt.createAPMVisualisationForPoints(data, "Transformer");
              edt.createLabelForPoints(data, "Transformer");
              edt.createTXModelsAtPoints(data);
              break;
            case "Switch":
              edt.createAPMVisualisationForPoints(data, "Switch");
              edt.createLabelForPoints(data, "Switch");
              break;
            default:
              break;
          }
        });
      });
    });
  }

  /** Helper function that creates 3D labels from the supplied GeoJSON point feature set.
   * @param {object} pointGeoJSONData - An object containing a GeoJSON feature collection.
   * @param {string} type - The asset type to display as a string.
   */
  createLabelForPoints(pointGeoJSONData, type) {
    for (var i =0; i < pointGeoJSONData.features.features.length; i++) {
      var aFeature = pointGeoJSONData.features.features[i],
      props = aFeature.properties.data,
      sd = edt.configData.cesiumParams.labelStyle.scaleByDistances,
      td = edt.configData.cesiumParams.labelStyle.translucentByDistances;

      if (props.apm.assetRiskIndicator == "1" || props.apm.assetRiskIndicator == "2") {
        edt.cesiumViewer.entities.add({
            parent: edt.extrudedEntities,
            position : Cesium.Cartesian3.fromDegrees(
              aFeature.geometry.coordinates[0],
              aFeature.geometry.coordinates[1],
              edt.configData.cesiumParams.extrusionHeight * Number(props.apm.assetImportance) * edt.configData.cesiumParams.extrusionFactor + 8
            ),
            label: {
              text : type + " " + props.assetId + "\nPhasing: " + props.adms.normal + "\nAsset Importance: " + props.apm.assetImportance,
              font : edt.configData.cesiumParams.labelStyle.font,
              fillColor : new Cesium.Color(edt.configData.cesiumParams.labelStyle.fill.red, edt.configData.cesiumParams.labelStyle.fill.green, edt.configData.cesiumParams.labelStyle.fill.blue, edt.configData.cesiumParams.labelStyle.fill.alpha),
              outlineColor : new Cesium.Color(edt.configData.cesiumParams.labelStyle.outline.red, edt.configData.cesiumParams.labelStyle.outline.green, edt.configData.cesiumParams.labelStyle.outline.blue, edt.configData.cesiumParams.labelStyle.outline.alpha),
              outlineWidth : edt.configData.cesiumParams.labelStyle.outlineWidth,
              style : Cesium.LabelStyle.FILL_AND_OUTLINE,
              scaleByDistance : new Cesium.NearFarScalar(sd[0], sd[1], sd[2], sd[3]),
              translucencyByDistance: new Cesium.NearFarScalar(td[0], td[1], td[2], td[3]),
              heightReference : Cesium.HeightReference.RELATIVE_TO_GROUND,
              extrudedHeight : 0.0,
              extrudedHeightReference : Cesium.HeightReference.CLAMP_TO_GROUND
            }
        });
      }
    }
  }

  /** Helper function that creates extruded 3D polygons from the supplied GeoJSON point feature set.
   * @param {object} pointGeoJSONData - An object containing a GeoJSON feature collection.
   * @param {string} name - The name of the feature type as a string.
   */
  createAPMVisualisationForPoints(pointGeoJSONData, name) {
    for (var i =0; i < pointGeoJSONData.features.features.length; i++) {
      var aFeature = pointGeoJSONData.features.features[i];
      var props = aFeature.properties.data;

      if (typeof props.apm != "undefined") {
        if (props.apm.assetRiskIndicator == 1 || props.apm.assetRiskIndicator == 2) {
          var mat = Cesium.Color.BLACK.withAlpha(1.0), outlineMat = Cesium.Color.BLACK.withAlpha(1.0), outlineWidth = 2;

          switch(props.apm.assetRiskIndicator) {
            case "1":
              mat = new Cesium.Color(edt.configData.cesiumParams.highRiskStyle.fill.red, edt.configData.cesiumParams.highRiskStyle.fill.green, edt.configData.cesiumParams.highRiskStyle.fill.blue, edt.configData.cesiumParams.highRiskStyle.fill.alpha);
              outlineMat = new Cesium.Color(edt.configData.cesiumParams.highRiskStyle.outline.red, edt.configData.cesiumParams.highRiskStyle.outline.green, edt.configData.cesiumParams.highRiskStyle.outline.blue, edt.configData.cesiumParams.highRiskStyle.outline.alpha);
              outlineWidth = edt.configData.cesiumParams.highRiskStyle.outlineWidth;
              break;
            case "2":
              mat = new Cesium.Color(edt.configData.cesiumParams.mediumRiskStyle.fill.red, edt.configData.cesiumParams.mediumRiskStyle.fill.green, edt.configData.cesiumParams.mediumRiskStyle.fill.blue, edt.configData.cesiumParams.mediumRiskStyle.fill.alpha);
              outlineMat = new Cesium.Color(edt.configData.cesiumParams.mediumRiskStyle.outline.red, edt.configData.cesiumParams.mediumRiskStyle.outline.green, edt.configData.cesiumParams.mediumRiskStyle.outline.blue, edt.configData.cesiumParams.mediumRiskStyle.outline.alpha);
              outlineWidth = edt.configData.cesiumParams.mediumRiskStyle.outlineWidth;
              break;
            default:
              mat = Cesium.Color.PURPLE.withAlpha(1.0);
              outlineMat = Cesium.Color.PURPLE.withAlpha(1.0);
              break;
          }

          edt.cesiumViewer.entities.add({
              parent: edt.extrudedEntities,
              name: name,
              position : Cesium.Cartesian3.fromDegrees(
                aFeature.geometry.coordinates[0],
                aFeature.geometry.coordinates[1]),
              properties: new Cesium.PropertyBag(props),
              box : {
                  dimensions : new Cesium.Cartesian3(5.0, 5.0, edt.configData.cesiumParams.extrusionHeight * Number(props.apm.assetImportance) * edt.configData.cesiumParams.extrusionFactor),
                  outline : true,
                  outlineColor : outlineMat,
                  outlineWidth : outlineWidth,
                  material : mat,
                  height : edt.configData.cesiumParams.extrusionHeight * Number(props.apm.assetImportance),
                  heightReference : Cesium.HeightReference.RELATIVE_TO_GROUND,
                  extrudedHeight : 0.0,
                  extrudedHeightReference : Cesium.HeightReference.CLAMP_TO_GROUND
              }
          });
        }
      }
    }
  }

  /** Load the LiDAR data from a pre-configured static service. The data is expected to be in 3D tiles format
   * (see https://cesium.com/blog/2015/08/10/introducing-3d-tiles/)
   */
  loadLidarTiles() {
    var edt = this;

    ["a", "b"].forEach(function(index) {
      for (var i = 0; i < 10; i++) {
        var url = "lidar_data/cesium/10MM/" + index + "/split_000000" + i.toString() + "/tileset.json";
        var tileset = edt.cesiumViewer.scene.primitives.add(new Cesium.Cesium3DTileset({
            url: url
        }));

        edt.tilesets.push(tileset);
      }
    });

    edt.setNoShading();
  }

  /** Helper function used by the 3D Tiles to retrieve relevant parameters.
   * @param {string} name - The name of the parameter to try and retrieve.
   */
  getQueryParam(name) {
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(window.location.href);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
  };

  /** Turns on shading for LiDAR data.
   */
  setShaded() {
    console.log("Set shaded");
    var edt = this;

    this.tilesets.forEach(function(tileset) {
      edt.setShadingStyle(tileset);
      tileset.show = true;
    })
  }

  /** Turns off shading for LiDAR data.
   */
  setNoShading() {
    this.tilesets.forEach(function(tileset) {
      tileset.show = false;
    })
  }

  /** Sets the shading style for 3D tiles for LiDAR.
   */
  setShadingStyle(tileset) {
    tileset.style = null;
    tileset.maximumScreenSpaceError = 2.5;
    tileset.pointCloudShading.maximumAttenuation = undefined; // Will be based on maximumScreenSpaceError instead
    tileset.pointCloudShading.baseResolution = undefined;
    tileset.pointCloudShading.geometricErrorScale = 1.2;
    tileset.pointCloudShading.attenuation = true;
    tileset.pointCloudShading.eyeDomeLighting = true;
    tileset.pointCloudShading.eyeDomeLightingStrength = 3.0;
    tileset.pointCloudShading.eyeDomeLightingRadius = 1.5;
  }

  getTerrainHeightAtLocation() {
    var promise = Cesium.sampleTerrainMostDetailed(this.cesiumTerrainProvider, positions);
    Cesium.when(promise, function(updatedPositions) {
        // positions[0].height and positions[1].height have been updated.
        // updatedPositions is just a reference to positions.
    });
  }

  createTXModelsAtPoints(pointGeoJSONData) {
    var edt = this;
    for (var i =0; i < pointGeoJSONData.features.features.length; i++) {
      var aFeature = pointGeoJSONData.features.features[i];
      var props = aFeature.properties.data;

      var positions = [
          Cesium.Cartographic.fromDegrees(aFeature.geometry.coordinates[0], aFeature.geometry.coordinates[1])
      ];
      var promise = Cesium.sampleTerrainMostDetailed(this.cesiumTerrainProvider, positions);
      Cesium.when(promise, function(updatedPositions) {
          // positions[0].height and positions[1].height have been updated.
          // updatedPositions is just a reference to positions.
          var height = updatedPositions[0].height,
          longitude = Cesium.Math.toDegrees(updatedPositions[0].longitude),
          latitude = Cesium.Math.toDegrees(updatedPositions[0].latitude);
          edt.addTXModelAtCoordinate(longitude, latitude, height);
      });
    }
  }

  addTXModelAtCoordinate(longitude, latitude, height) {
    console.log("Adding transformer model at " + longitude + ", " + latitude + " at height " + height);
    var modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(longitude, latitude, height));
    var model = this.cesiumViewer.scene.primitives.add(Cesium.Model.fromGltf({
        url : '../3d/Transphormator N121015.glb',
        modelMatrix : modelMatrix,
        scale : 2000.0
    }));
  }

  tidyUp() {
    $(".cesium-credit-textContainer")[0].remove();
  }

  addPreRenderListener(aFunction) {

  }
}
