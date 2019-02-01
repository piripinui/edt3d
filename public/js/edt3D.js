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
    this.cesiumTerrainReadyPromise = this.cesiumTerrainProvider.readyPromise;

    var contextOptions =  {
      webgl : {
        alpha : false,
        depth : false,
        stencil : false,
        antialias : false,
        premultipliedAlpha : false,
        preserveDrawingBuffer : false,
        failIfMajorPerformanceCaveat : false },
      allowTextureFilterAnisotropic : false
    };

    this.cesiumViewer = new Cesium.Viewer(this.cesiumContainer, {
        terrainProvider: this.cesiumTerrainProvider,
        timeline: this.configData.cesiumParams.timeline,
        navigationHelpButton: this.configData.cesiumParams.navigationHelpButton,
        animation: this.configData.cesiumParams.animation,
        projectionPicker: this.configData.cesiumParams.projectionPicker,
        sceneModePicker: this.configData.cesiumParams.sceneModePicker,
        geocoder: false,
        requestRenderMode: this.configData.cesiumParams.requestRenderMode,
        maximumRenderTimeChange: Infinity,
        contextOptions: contextOptions
    });

    this.cesiumViewer.scene.globe.depthTestAgainstTerrain = true;

    this.extrudedEntities = this.cesiumViewer.entities.add(new Cesium.Entity());
    this.extrudedEntities.show = true;

    this.modelEntities = this.cesiumViewer.entities.add(new Cesium.Entity());
    this.modelEntities.show = false;

    this.networkEntities = this.cesiumViewer.entities.add(new Cesium.Entity());
    this.networkEntities.show = true;

    this.assetHealthEntities = this.cesiumViewer.entities.add(new Cesium.Entity());
    this.assetHealthEntities.show = true;

    this.loadEntities = this.cesiumViewer.entities.add(new Cesium.Entity());
    this.loadEntities.show = false;

    this.geocoder = new Cesium.Geocoder({
      container: "abb_navi",
      scene: this.cesiumViewer.scene
    });

    // Prevent default behaviour for WebGL lost context events.
    var canvas = this.cesiumViewer.scene.canvas;
    canvas.addEventListener("webglcontextlost", function(event) {
        console.log("WebGL lost context event detected");
        event.preventDefault();
    }, false);

    this.cesiumViewer.scene.canvas.addEventListener("webglcontextrestored", function() {
      console.log("WebGL Context Restored");
    }, false);

    $(document).trigger("mapCreated");
  }

  /** Performs general initialisation, including the map, layer and LiDAR data loading.
   */
  initialise() {
    const edt = this;
    // Load the configuration data.
    $.get("config.json", function(data) {
      edt.configData = data;
      edt.initMap();

      setTimeout(function () {
        // Workaround to give time for terrain to render before loading layers.
        console.log("Loading layers...");
        edt.loadLidarTiles();
        edt.loadLayers();
        edt.tidyUp();
        edt.addSubstationAtHarmonyHills();
      }, edt.configData.cesiumParams.loadLayerWaitTime);
    })
  }

  /** Adds a pre-defined model of a substation at the Harmony Hills location.
   */
  addSubstationAtHarmonyHills() {
    var positions = [
        Cesium.Cartographic.fromDegrees(-98.506406, 29.554146)
    ];
    var promise = Cesium.sampleTerrainMostDetailed(edt.cesiumTerrainProvider, positions);
    Cesium.when(promise, function(updatedPositions) {
        var height = updatedPositions[0].height,
        longitude = Cesium.Math.toDegrees(updatedPositions[0].longitude),
        latitude = Cesium.Math.toDegrees(updatedPositions[0].latitude);

        edt.addModelAtCoordinate(longitude, latitude, height, 'substation_gltf.glb', 1.0, 135);
    });
  }

  /** Loads the vector data from the Data Fabric instance and converts to extruded
   * 3D polygons (with labels) for both linear and point features.
   */
  loadLayers() {
    // Read the configuration data and create layers from it.
    const edt = this;
    const linkMaterial = new Cesium.Color(
      edt.configData.cesiumParams.linkColor.red,
      edt.configData.cesiumParams.linkColor.green,
      edt.configData.cesiumParams.linkColor.blue,
      edt.configData.cesiumParams.linkColor.alpha
    );
    const corridorColor = new Cesium.ColorGeometryInstanceAttribute(
      edt.configData.cesiumParams.linkColor.red,
      edt.configData.cesiumParams.linkColor.green,
      edt.configData.cesiumParams.linkColor.blue,
      edt.configData.cesiumParams.linkColor.alpha
    );

    this.configData.layers.forEach(function(featureClassDef) {
      var featureType = featureClassDef.featureType;

      featureClassDef.featureClasses.forEach(function(aLayerDef) {
        var layerName = aLayerDef.layerName;

        $.get(edt.configData.dataFabricURL + featureType + "?types=" + layerName, function(data) {
          switch(layerName) {
            case "Links":
              console.log("Loading Links...");

              var dataLinkLength = data.features.features.length;

              if (edt.configData.renderNetworkLinksAsPolygons) {
                // Draw the network lines as extruded polygons. Note: this is resource intensive and
                // requires a more capable machine to display when there are a lot of links.
                for (var i = 0; i < dataLinkLength; i++) {
                  var options = {tolerance: 0.01, highQuality: false};
                  var aFeature = data.features.features[i];

                  var pb = new Cesium.PropertyBag({
                    value: aFeature.properties
                  });

                  // Buffer the linear feature by 1 metre using Turf.js in order to create the polygon extrusion.
                  var poly = turf.buffer(aFeature, 0.0005, { units: 'kilometers', steps: 16 });
                  var degArray = [];

                  poly.geometry.coordinates[0].forEach(function(aCoordinate) {
                    degArray.push(aCoordinate[0]);
                    degArray.push(aCoordinate[1]);
                  });

                  edt.cesiumViewer.entities.add({
                      name : 'Topology Link',
                      parent: edt.networkEntities,
                      properties: pb,
                      polygon : {
                        hierarchy : Cesium.Cartesian3.fromDegreesArray(degArray),
                        material : linkMaterial,
                        height : edt.configData.cesiumParams.extrusionHeight,
                        heightReference : Cesium.HeightReference.RELATIVE_TO_GROUND,
                        extrudedHeight : 0.0,
                        extrudedHeightReference : Cesium.HeightReference.CLAMP_TO_GROUND
                      }
                  });
                }
              }
              else {
                  // Instead of drawing extruded polygons, draw corridor geometry clamped to the terrain.
                  // This is less demanding on the machine rendering the links.
                  var geomInstances = [];

                  for (var i = 0; i < dataLinkLength; i++) {
                    var options = {tolerance: 0.01, highQuality: false};
                    var aFeature = data.features.features[i];

                    var pb = new Cesium.PropertyBag({
                      value: aFeature.properties
                    });

                    var degArray = [];
                    aFeature.geometry.coordinates.forEach(function(aCoordinate) {
                      degArray.push(aCoordinate[0]);
                      degArray.push(aCoordinate[1]);
                    });

                    var corridor = new Cesium.CorridorGeometry({
                      vertexFormat : Cesium.VertexFormat.POSITION_ONLY,
                      positions : Cesium.Cartesian3.fromDegreesArray(degArray),
                      width : 1
                    });
                    var corridorInstance = new Cesium.GeometryInstance({
                      geometry : corridor,
                      id : aFeature.id,
                      attributes : {
                        color : corridorColor
                      }
                    });
                    geomInstances.push(corridorInstance);
                }

                edt.linkCorridorPrimitive = edt.cesiumViewer.scene.primitives.add(new Cesium.GroundPrimitive({
                  geometryInstances : geomInstances
                }));
              };
              break;
            case "CircuitBreaker":
              edt.createAPMVisualisationForPoints(data, "CircuitBreaker");
              edt.createMeterCountVisualisationForPoints(data, "CircuitBreaker");
              edt.createLabelForPoints(data, "CircuitBreaker");
              break;
            case "Fuse":
              edt.createAPMVisualisationForPoints(data, "Fuse");
              edt.createMeterCountVisualisationForPoints(data, "Fuse");
              edt.createLabelForPoints(data, "Fuse");
              break;
            case "Transformer":
              edt.createAPMVisualisationForPoints(data, "Transformer");
              edt.createMeterCountVisualisationForPoints(data, "Transformer");
              edt.createLabelForPoints(data, "Transformer");
              //edt.createTXModelsAtPoints(data);
              break;
            case "Switch":
              edt.createAPMVisualisationForPoints(data, "Switch");
              edt.createMeterCountVisualisationForPoints(data, "Switch");
              edt.createLabelForPoints(data, "Switch");
              // edt.createLoadVisualisation(data, "Switch");
              break;
            default:
              break;
          };

          edt.requestRender();
        });
      });
    });
  }

  /** helper function that makes a request render request if requestRenderMode is on.
   */
  requestRender() {
    if (this.configData.cesiumParams.requestRenderMode)
      this.cesiumViewer.scene.requestRender();
  }

  /** Helper function that creates 3D labels from the supplied GeoJSON point feature set.
   * @param {object} pointGeoJSONData - An object containing a GeoJSON feature collection.
   * @param {string} type - The asset type to display as a string.
   */
  createLabelForPoints(pointGeoJSONData, type) {
    for (var i =0; i < pointGeoJSONData.features.features.length; i++) {
      var aFeature = pointGeoJSONData.features.features[i],
      props = aFeature.properties.data;

      if (typeof props.apm != "undefined") {
        var labelText = type + " " + props.assetId + "\nPhasing: " + props.adms.normal + "\nAsset Importance: " + props.apm.assetImportance,
        sd = edt.configData.cesiumParams.labelStyle.scaleByDistances,
        td = edt.configData.cesiumParams.labelStyle.translucentByDistances;

        if (typeof props.apm != "undefined") {
          if (props.apm.assetRiskIndicator == "1" || props.apm.assetRiskIndicator == "2") {
            edt.cesiumViewer.entities.add({
                parent: edt.assetHealthEntities,
                position : Cesium.Cartesian3.fromDegrees(
                  aFeature.geometry.coordinates[0],
                  aFeature.geometry.coordinates[1],
                  edt.configData.cesiumParams.extrusionHeight * Number(props.apm.assetImportance) * edt.configData.cesiumParams.extrusionFactor + edt.configData.cesiumParams.labelHeightOffset
                ),
                label: {
                  text : labelText,
                  font : edt.configData.cesiumParams.labelStyle.font,
                  fillColor : new Cesium.Color(edt.configData.cesiumParams.labelStyle.fill.red, edt.configData.cesiumParams.labelStyle.fill.green, edt.configData.cesiumParams.labelStyle.fill.blue, edt.configData.cesiumParams.labelStyle.fill.alpha),
                  outlineColor : new Cesium.Color(edt.configData.cesiumParams.labelStyle.outline.red, edt.configData.cesiumParams.labelStyle.outline.green, edt.configData.cesiumParams.labelStyle.outline.blue, edt.configData.cesiumParams.labelStyle.outline.alpha),
                  outlineWidth : edt.configData.cesiumParams.labelStyle.outlineWidth,
                  style : Cesium.LabelStyle.FILL_AND_OUTLINE,
                  scaleByDistance : new Cesium.NearFarScalar(sd[0], sd[1], sd[2], sd[3]),
                  translucencyByDistance: new Cesium.NearFarScalar(td[0], td[1], td[2], td[3]),
                  heightReference : Cesium.HeightReference.RELATIVE_TO_GROUND
                }
            });
          }
        }
      }
    }
    edt.requestRender();
  }

  /** Helper function that creates extruded 3D polygons from the supplied GeoJSON point feature set.
   * @param {object} pointGeoJSONData - An object containing a GeoJSON feature collection.
   * @param {string} name - The name of the feature type as a string.
   */
  createAPMVisualisationForPoints(pointGeoJSONData, name) {
    console.log("Creating APM visualisations for " + name);

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

          var extrusionHeight = edt.configData.cesiumParams.extrusionHeight * Number(props.apm.assetImportance) * edt.configData.cesiumParams.extrusionFactor;
          var anInstance = edt.createExtrudedPoint(aFeature, name, outlineMat, outlineWidth, mat, props, edt.assetHealthEntities, extrusionHeight);
        }
      }
      else {
        // Create a default representation of the asset.
        var mat = new Cesium.Color(edt.configData.cesiumParams.unknownRiskStyle.fill.red, edt.configData.cesiumParams.unknownRiskStyle.fill.green, edt.configData.cesiumParams.unknownRiskStyle.fill.blue, edt.configData.cesiumParams.unknownRiskStyle.fill.alpha);
        var outlineMat = new Cesium.Color(edt.configData.cesiumParams.unknownRiskStyle.outline.red, edt.configData.cesiumParams.unknownRiskStyle.outline.green, edt.configData.cesiumParams.unknownRiskStyle.outline.blue, edt.configData.cesiumParams.unknownRiskStyle.outline.alpha);
        var outlineWidth = edt.configData.cesiumParams.unknownRiskStyle.outlineWidth;

        var anInstance = edt.createExtrudedPoint(aFeature, name, outlineMat, outlineWidth, mat, props, edt.assetHealthEntities, edt.configData.cesiumParams.defaultHeight);
      }
    }
    edt.requestRender();
  }

  /** Helper function that creates extruded 3D polygons from the supplied GeoJSON point feature set based on meter count.
   * @param {object} pointGeoJSONData - An object containing a GeoJSON feature collection.
   * @param {string} name - The name of the feature type as a string.
   */
  createMeterCountVisualisationForPoints(pointGeoJSONData, name) {
    console.log("Creating Meter Count visualisations for " + name);

    pointGeoJSONData.features.features.forEach(function(aFeature) {
      var props = aFeature.properties.data;
      var id = props.assetId;
      $.get("/getmetercount?id=" + id, function(data) {

        var results = JSON.parse(data), count;

        for (var key in results) {
          count = results[key];
        }

        console.log("Creating load rep for " + key + " with " + count);

        // var mat = new Cesium.Color(edt.configData.cesiumParams.highRiskStyle.fill.red, edt.configData.cesiumParams.highRiskStyle.fill.green, edt.configData.cesiumParams.highRiskStyle.fill.blue, edt.configData.cesiumParams.highRiskStyle.fill.alpha);
        var mat = Cesium.Color.GREEN.withAlpha(1.0);
        // var outlineMat = new Cesium.Color(edt.configData.cesiumParams.highRiskStyle.outline.red, edt.configData.cesiumParams.highRiskStyle.outline.green, edt.configData.cesiumParams.highRiskStyle.outline.blue, edt.configData.cesiumParams.highRiskStyle.outline.alpha);
        var outlineMat = Cesium.Color.GREEN.withAlpha(1.0);
        var outlineWidth = edt.configData.cesiumParams.highRiskStyle.outlineWidth;

        var extrusionHeight = count * edt.configData.cesiumParams.extrusionFactor;
        var anInstance = edt.createExtrudedPoint(aFeature, name, outlineMat, outlineWidth, mat, props, edt.loadEntities, extrusionHeight);
      })
    })

    edt.requestRender();
  }

  /** Helper function that creates an extruded polygon based clamped to the terrain based on point coordinates.
    * @param {object} aPointFeature - A GeoJSON point feature.
    * @param {string} name - A string representing the type of object this is.
    * @param {object} outlineMaterial - The material used to render the outline.
    * @param {object} outlineWidth - The width of the outline.
    * @param {object} fillMaterial - The material used to render the fill of the entity.
    * @param {object} properties - An object containing properties that you wish to associate with the entity.
    * @param {object} parent - The parent entity the created entity will be associated with.
    * @param {object} extrudedHeight - The height to extrude to.
   */
  createExtrudedPoint(aPointFeature, name, outlineMaterial, outlineWidth, fillMaterial, properties, parent, extrudedHeight) {
    var anEntity = this.cesiumViewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(aPointFeature.geometry.coordinates[0], aPointFeature.geometry.coordinates[1], 0.0),
        parent: parent,
        name : name,
        properties: new Cesium.PropertyBag(properties),
        ellipse : {
            semiMinorAxis : this.configData.cesiumParams.ellipseMinorAxis,
            semiMajorAxis : this.configData.cesiumParams.ellipseMajorAxis,
            extrudedHeight : extrudedHeight,
            rotation : Cesium.Math.toRadians(45),
            material : fillMaterial,
            outline : true,
            outlineColor: outlineMaterial,
            heightReference : Cesium.HeightReference.RELATIVE_TO_GROUND
        }
    });

    return anEntity;
  }

  sampleTerrain(aPosition) {
    var terrainProvider = this.cesiumViewer.terrainProvider;
    var positions = [
        Cesium.Cartographic.fromDegrees(aPosition[0], aPosition[1])
    ];
    var promise = Cesium.sampleTerrain(terrainProvider, 11, positions);

    return promise;
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
    edt.requestRender();
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

  /** Toggles LiDAR data on and off.
   */
  setLidar() {
    console.log("Setting lidar visibility");
    var on = $("#lidar_toggle").prop("checked");

    if (on)
      this.setShaded()
    else {
      this.setNoShading();
    }

    if (this.configData.cesiumParams.requestRenderMode)
      this.cesiumViewer.scene.requestRender();
  }

  /** Toggles 3dModel data on and off.
   */
  setModel() {
    console.log("Setting model visibility");
    var on = $("#model_toggle").prop("checked");

    if (on)
      this.set3dModels()
    else {
      this.setNo3dModels();
    }
    edt.requestRender();
  }

  /** Toggles Network data on and off.
   */
  setNetwork() {
    console.log("Setting network visibility");
    var on = $("#network_toggle").prop("checked");

    if (on)
      this.setNetworkOn()
    else {
      this.setNetworkOff();
    }
    edt.requestRender();
  }

  /** Toggles Health data on and off.
   */
  setHealth() {
    console.log("Setting health visibility");
    var on = $("#health_toggle").prop("checked");

    if (on)
      this.setAssetHealthOn()
    else {
      this.setAssetHealthOff();
    }
    edt.requestRender();
  }

  /** Toggles Load visualisations on and off.
   */
  setLoad() {
    console.log("Setting load visibility");
    var on = $("#load_toggle").prop("checked");

    if (on)
      this.setLoadOn()
    else {
      this.setLoadOff();
    }
    edt.requestRender();
  }

  /** Turns off the 3D Models.
   */
  setNo3dModels() {
    this.modelEntities.show = false;
  }

  /** Turns on the 3D Models.
   */
  set3dModels() {
    this.modelEntities.show = true;
  }

  /** Turns on the Network.
   */
  setNetworkOn() {
    this.linkCorridorPrimitive.show = true;
  }

  /** Turns off the Network.
   */
  setNetworkOff() {
    this.linkCorridorPrimitive.show = false;
  }

  /** Turns on Asset Health.
   */
  setAssetHealthOn() {
    this.assetHealthEntities.show = true;
  }

  /** Turns off Asset Health.
   */
  setAssetHealthOff() {
    this.assetHealthEntities.show = false;
  }

  /** Turns on Load Visualisations.
   */
  setLoadOn() {
    this.loadEntities.show = true;
  }

  /** Turns off Load Visualisations.
   */
  setLoadOff() {
    this.loadEntities.show = false;
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

  /** Places a transformer 3D model at the locations provided.
   * @param {object} pointGeoJSONData - An object containing a GeoJSON feature collection.
   */
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

    edt.requestRender();
  }

  /** Places a gLTF model at the location provided.
   * @param {number} longitude - The longitude to place the transformer model at.
   * @param {number} latitude - The latitude to place the transformer model at.
   * @param {number} height - The height to place the transformer model at.
   * @param {string} modelName - The filename of the gLTF model to load.
   */
  addModelAtCoordinate(longitude, latitude, height, modelName, scale, angleInDegrees) {
    console.log("Adding model " + modelName + " at " + longitude + ", " + latitude + " at height " + height);

    scale = typeof scale != "undefined" ? scale : 1.0;
    angleInDegrees = typeof angleInDegrees != "undefined" ? angleInDegrees : 0.0;

    var url = '../3d/' + modelName;

    var position = Cesium.Cartesian3.fromDegrees(longitude, latitude, height + 1.0);
    var heading = Cesium.Math.toRadians(angleInDegrees);
    var pitch = 0;
    var roll = 0;
    var hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);
    var orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpr);
    var entity = this.cesiumViewer.entities.add({
        name : url,
        position : position,
        orientation : orientation,
        parent: this.modelEntities,
        model : {
            uri : url,
            minimumPixelSize : 128,
            maximumScale : 20000,
            scale: scale
        }
    });

    edt.requestRender();
  }

  /** Post-initialisation tidy up actions.
   */
  tidyUp() {
    $(".cesium-credit-textContainer")[0].remove();
  }
}
