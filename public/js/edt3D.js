class edt3D {

  constructor(accessToken, cesiumContainer) {
    this.accessToken = accessToken;
    this.cesiumContainer = cesiumContainer;
    this.tilesets = [];
    this.shadingSet = false;

    this.initialise();
  }

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
        sceneModePicker: this.configData.cesiumParams.sceneModePicker
    });

    this.cesiumViewer.scene.globe.depthTestAgainstTerrain = true;

    this.extrudedEntities = this.cesiumViewer.entities.add(new Cesium.Entity());
    this.extrudedEntities.show = true;
  }

  initialise() {
    const edt = this;
    // Load the configuration data.
    $.get("config.json", function(data) {
      edt.configData = data;
      edt.initMap();
      edt.initDefaultStyles();
      edt.loadLayers();
      edt.loadLidarTiles();
    })
  }

  initDefaultStyles() {
    this.defaultStroke = Cesium.Color.HOTPINK;
    this.defaultStrokeWidth = 3;
    this.defaultMarkerSize = 10;
    this.defaultMarkerSymbol = "?";
    this.fillStyle = Cesium.Color.PINK;
  }

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
                var poly = turf.buffer(aFeature, 0.001);
                var degArray = [];

                poly.geometry.coordinates[0].forEach(function(aCoordinate) {
                  degArray.push(aCoordinate[0]);
                  degArray.push(aCoordinate[1]);
                });

                var greenPolygon = edt.cesiumViewer.entities.add({
                    name : 'Green extruded polygon',
                    parent: edt.extrudedEntitiess,
                    polygon : {
                      hierarchy : Cesium.Cartesian3.fromDegreesArray(degArray),
                      material : Cesium.Color.GREEN.withAlpha(0.7),
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

  createLabelForPoints(pointGeoJSONData, type) {
    for (var i =0; i < pointGeoJSONData.features.features.length; i++) {
      var aFeature = pointGeoJSONData.features.features[i];
      var props = aFeature.properties.data;

      edt.cesiumViewer.entities.add({
          parent: edt.extrudedEntities,
          position : Cesium.Cartesian3.fromDegrees(
            aFeature.geometry.coordinates[0],
            aFeature.geometry.coordinates[1],
            edt.configData.cesiumParams.extrusionHeight * Number(props.apm.assetImportance) * 0.05 + 8
          ),
          label: {
            text : type + " " + props.assetId + "\nAsset Importance: " + props.apm.assetImportance,
            font : '18px Arial',
            fillColor : Cesium.Color.WHITE,
            outlineColor : Cesium.Color.WHITE,
            outlineWidth : 1,
            style : Cesium.LabelStyle.FILL_AND_OUTLINE,
            scaleByDistance : new Cesium.NearFarScalar(300, 1.0, 800, 0.0),
            translucencyByDistance: new Cesium.NearFarScalar(300, 1.0, 800, 0.0),
            // height : edt.configData.cesiumParams.extrusionHeight * Number(props.apm.assetImportance),
            heightReference : Cesium.HeightReference.RELATIVE_TO_GROUND,
            extrudedHeight : 0.0,
            extrudedHeightReference : Cesium.HeightReference.CLAMP_TO_GROUND
          }
      });
    }
  }

  createAPMVisualisationForPoints(pointGeoJSONData, name) {
    for (var i =0; i < pointGeoJSONData.features.features.length; i++) {
      var aFeature = pointGeoJSONData.features.features[i];
      var props = aFeature.properties.data;

      if (typeof props.apm != "undefined") {
        if (props.apm.assetRiskIndicator == 1 || props.apm.assetRiskIndicator == 2) {
          var mat = Cesium.Color.BLACK.withAlpha(1.0);

          switch(props.apm.assetRiskIndicator) {
            case "1":
              mat = Cesium.Color.RED.withAlpha(1.0);
              break;
            case "2":
              mat = Cesium.Color.ORANGE.withAlpha(1.0);
              break;
            default:
              mat = Cesium.Color.PURPLE.withAlpha(1.0);
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
                  dimensions : new Cesium.Cartesian3(5.0, 5.0, edt.configData.cesiumParams.extrusionHeight * Number(props.apm.assetImportance) * 0.05),
                  outline : true,
                  outlineColor : Cesium.Color.BLACK,
                  outlineWidth : 2,
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

  getQueryParam(name) {
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(window.location.href);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
  };

  setShaded() {
    console.log("Set shaded");
    var edt = this;

    this.tilesets.forEach(function(tileset) {
      edt.setShadingStyle(tileset);
      tileset.show = true;
    })
  }

  setNoShading() {
    console.log("No shading");

    this.tilesets.forEach(function(tileset) {
      tileset.show = false;
    })
  }

  setPointsOnly() {
    console.log("Points only");

    this.tilesets.forEach(function(tileset) {
      edt.setPointStyle(tileset);
      tileset.show = true;
    })
  }

  setNoExtrusions() {
    this.extrudedEntities.show = false;
  }

  setExtrusions() {
    this.extrudedEntities.show = true;
  }

  setShadingStyle(tileset) {
    //if (!this.shadingSet) {
    tileset.style = null;
      tileset.maximumScreenSpaceError = 2.5;
      tileset.pointCloudShading.maximumAttenuation = undefined; // Will be based on maximumScreenSpaceError instead
      tileset.pointCloudShading.baseResolution = undefined;
      tileset.pointCloudShading.geometricErrorScale = 1.2;
      tileset.pointCloudShading.attenuation = true;
      tileset.pointCloudShading.eyeDomeLighting = true;
      tileset.pointCloudShading.eyeDomeLightingStrength = 2.0;
      tileset.pointCloudShading.eyeDomeLightingRadius = 1.0;
    //}
  }

  setPointStyle(tileset) {
    tileset.style = new Cesium.Cesium3DTileStyle({
        pointSize: this.getQueryParam('pointSize') || 2,
        color : 'rgba(0, 80, 0, 0.10)'
    });
  }

  createStrokeStyle(params) {
    return new Cesium.Color(params.red, params.green, params.blue, params.alpha);
  }

  createFillStyle(params) {
    return new Cesium.Color(params.red, params.green, params.blue, params.alpha);
  }

  createStrokeWidth(params) {
    return Number(params.strokeWidth);
  }

  createMarkerSize(markerSize) {
    return Number(markerSize);
  }
}
