import * as THREE from 'three';

export class CityEnvironment {
  constructor(scene, materialManager) {
    this.scene = scene;
    this.mm = materialManager;
    this.nightLights = [];
    this.nightWindows = [];
    this.dayObjects = [];
    this.pedestrianSignalMesh = null;
    this.flashingBeaconMesh = null;
    this.sidewalkPedestrians = []; // Animated pedestrians walking on sidewalks

    // Centralized soft night illumination (replaces 25 heavy PointLights for 60 FPS!)
    this.centralNight1 = new THREE.PointLight(0xffe6a3, 0, 75, 1.4);
    this.centralNight1.position.set(0, 11, 12);
    this.scene.add(this.centralNight1);

    this.centralNight2 = new THREE.PointLight(0xffe6a3, 0, 75, 1.4);
    this.centralNight2.position.set(0, 11, -8);
    this.scene.add(this.centralNight2);

    this.buildWorld();
  }

  buildWorld() {
    this.createGround();
    this.createSetiabudiRoad();
    this.createPerkasaRoad();
    this.createSimpangBajuriUrip();
    this.createMohYaminRoad();
    this.createSidewalksAndCurbs();
    this.createSidewalkFences();
    this.createSidewalkPedestrians();
    this.createZebraCrossing();
    this.createSimpangTrafficLights();
    this.createStreetFurniture();
    this.createBuildings();
    this.createVegetation();
    this.createDistantMountains();
  }

  createGround() {
    // Large terrain base
    const groundGeo = new THREE.PlaneGeometry(350, 350);
    const ground = new THREE.Mesh(groundGeo, this.mm.materials.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  createSetiabudiRoad() {
    // Jl. Dr. Setiabudi: Width 16m (from X = -8 to X = +8), Length 260m (Z = -130 to +130)
    const roadGeo = new THREE.PlaneGeometry(16, 260);
    const road = new THREE.Mesh(roadGeo, this.mm.materials.asphalt);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, 0);
    road.receiveShadow = true;
    this.scene.add(road);

    // Center Double Yellow Lines (with small break at Perkasa intersection Z: [7, 17])
    this.createCenterDoubleYellow();

    // Lane Dividers (Dashed white lines between L1 and L2)
    this.createLaneDividers();

    // Road Edge Fog Lines (Solid white lines near curbs)
    this.createEdgeLines();
  }

  createCenterDoubleYellow() {
    // Double yellow lines along Setiabudi (X = -0.18 and X = +0.18)
    // Section 1: North of Perkasa (Z: -130 to 6)
    const lenNorth = 136;
    const zNorth = -130 + lenNorth / 2; // -62

    // Section 2: South of Perkasa (Z: 18 to 130)
    const lenSouth = 112;
    const zSouth = 18 + lenSouth / 2; // 74

    const yellowMat = this.mm.materials.doubleYellow;
    const yellowWidth = 0.16;

    [-0.18, 0.18].forEach(offsetX => {
      // North segment
      const geoN = new THREE.PlaneGeometry(yellowWidth, lenNorth);
      const lineN = new THREE.Mesh(geoN, yellowMat);
      lineN.rotation.x = -Math.PI / 2;
      lineN.position.set(offsetX, 0.02, zNorth);
      this.scene.add(lineN);

      // South segment
      const geoS = new THREE.PlaneGeometry(yellowWidth, lenSouth);
      const lineS = new THREE.Mesh(geoS, yellowMat);
      lineS.rotation.x = -Math.PI / 2;
      lineS.position.set(offsetX, 0.02, zSouth);
      this.scene.add(lineS);
    });
  }

  createLaneDividers() {
    // Dashed white lines at X = -4.0 (Southbound) and X = +4.0 (Northbound)
    const dashLength = 3.0;
    const gapLength = 3.0;
    const dashWidth = 0.15;
    const whiteMat = this.mm.materials.whiteMarking;

    const dashGeo = new THREE.PlaneGeometry(dashWidth, dashLength);

    for (let z = -126; z <= 126; z += (dashLength + gapLength)) {
      // Skip the T-junction conflict box (Z between 6 and 18 for Southbound lane 2)
      // Northbound side (X = +4)
      const dashNorth = new THREE.Mesh(dashGeo, whiteMat);
      dashNorth.rotation.x = -Math.PI / 2;
      dashNorth.position.set(4.0, 0.02, z);
      this.scene.add(dashNorth);

      // Southbound side (X = -4) - omit directly in front of Perkasa mouth
      if (z < 6 || z > 18) {
        const dashSouth = new THREE.Mesh(dashGeo, whiteMat);
        dashSouth.rotation.x = -Math.PI / 2;
        dashSouth.position.set(-4.0, 0.02, z);
        this.scene.add(dashSouth);
      }
    }
  }

  createEdgeLines() {
    const whiteMat = this.mm.materials.whiteMarking;
    const edgeWidth = 0.18;

    // East Edge Line (continuous full length at X = 7.8)
    const eastGeo = new THREE.PlaneGeometry(edgeWidth, 260);
    const eastLine = new THREE.Mesh(eastGeo, whiteMat);
    eastLine.rotation.x = -Math.PI / 2;
    eastLine.position.set(7.8, 0.02, 0);
    this.scene.add(eastLine);

    // West Edge Line (broken at Jl. Perkasa entrance Z: [6.5, 17.5])
    const westLenN = 136.5;
    const geoWN = new THREE.PlaneGeometry(edgeWidth, westLenN);
    const lineWN = new THREE.Mesh(geoWN, whiteMat);
    lineWN.rotation.x = -Math.PI / 2;
    lineWN.position.set(-7.8, 0.02, -130 + westLenN / 2);
    this.scene.add(lineWN);

    const westLenS = 112.5;
    const geoWS = new THREE.PlaneGeometry(edgeWidth, westLenS);
    const lineWS = new THREE.Mesh(geoWS, whiteMat);
    lineWS.rotation.x = -Math.PI / 2;
    lineWS.position.set(-7.8, 0.02, 17.5 + westLenS / 2);
    this.scene.add(lineWS);
  }

  createPerkasaRoad() {
    // Jl. Perkasa branches West from X = -8 to X = -105, centered at Z = 12, width 10m (Z: 7 to 17)
    // Subtle elevation: slopes upward to Y = 1.4m at X = -105
    const length = 97;
    const width = 10;
    const perkasaGeo = new THREE.PlaneGeometry(length, width, 16, 1);

    // Apply gentle incline elevation along X
    const pos = perkasaGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const localX = pos.getX(i); // ranges from -length/2 to +length/2
      // World X will be (-8 - length/2) + localX
      const worldX = -8 - length / 2 + localX;
      // Incline: rising as X becomes more negative
      const distFromJunction = Math.max(0, -8 - worldX);
      const elevation = (distFromJunction / length) * 1.5;
      pos.setZ(i, elevation); // In unrotated plane, Z is normal; when rotated x = -PI/2, this becomes Y
    }
    perkasaGeo.computeVertexNormals();

    const perkasaRoad = new THREE.Mesh(perkasaGeo, this.mm.materials.asphalt);
    perkasaRoad.rotation.x = -Math.PI / 2;
    perkasaRoad.position.set(-8 - length / 2, 0.01, 12);
    perkasaRoad.receiveShadow = true;
    this.scene.add(perkasaRoad);

    // Center Dashed Line along Perkasa (at Z = 12)
    const dashLength = 2.5;
    const gapLength = 2.5;
    const dashGeo = new THREE.PlaneGeometry(dashLength, 0.15);
    for (let x = -13; x >= -95; x -= (dashLength + gapLength)) {
      const dist = -8 - x;
      const elev = (dist / length) * 1.5;
      const dash = new THREE.Mesh(dashGeo, this.mm.materials.whiteMarking);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.02 + elev, 12);
      this.scene.add(dash);
    }

    // Stop Bar at the mouth of Jl. Perkasa before entering Setiabudi
    const stopBarGeo = new THREE.PlaneGeometry(0.5, 4.5);
    const stopBar = new THREE.Mesh(stopBarGeo, this.mm.materials.whiteMarking);
    stopBar.rotation.x = -Math.PI / 2;
    // Outbound lane is at Z ~ 14.2
    stopBar.position.set(-8.5, 0.025, 14.3);
    this.scene.add(stopBar);
  }

  createRoadArrow(x, z, rotZ) {
    // Road surface arrows removed per user request
  }

  createSimpangBajuriUrip() {
    // SIMPANG 3 SERSAN BAJURI - SERSAN URIP - TERUSAN SETIABUDI
    // Positioned at Z = -68 (80m north of Jl. Perkasa at Z = 12, and 60m north of zebra cross at Z = -8)

    // 1. TERUSAN JL. DR. SETIABUDI (North extension from Z = -68 to Z = -195, width 15.6m)
    const terusanLen = 127.0;
    const terusanGeo = new THREE.PlaneGeometry(15.6, terusanLen);
    const terusan = new THREE.Mesh(terusanGeo, this.mm.materials.asphalt);
    terusan.rotation.x = -Math.PI / 2;
    terusan.position.set(0, 0.012, -68 - terusanLen / 2);
    terusan.receiveShadow = true;
    this.scene.add(terusan);

    // Center double yellow lines on Terusan Setiabudi
    const yellowMat = this.mm.materials.doubleYellow;
    [-0.18, 0.18].forEach(offsetX => {
      const yellowGeo = new THREE.PlaneGeometry(0.16, terusanLen - 4);
      const yellowLine = new THREE.Mesh(yellowGeo, yellowMat);
      yellowLine.rotation.x = -Math.PI / 2;
      yellowLine.position.set(offsetX, 0.022, -68 - terusanLen / 2 - 2);
      this.scene.add(yellowLine);
    });

    // 2. JL. SERSAN BAJURI (North-West angled branch towards Parongpong / Lembang)
    // 2 Distinct Lanes: Jalur kanan ke atas (into Bajuri), Jalur kiri ke bawah (into Setiabudi)
    const bajuriWidth = 10.5;
    const bajuriLen = 95.0;
    const bajuriGeo = new THREE.PlaneGeometry(bajuriWidth, bajuriLen);
    const bajuriRoad = new THREE.Mesh(bajuriGeo, this.mm.materials.asphalt);
    bajuriRoad.rotation.x = -Math.PI / 2;
    bajuriRoad.rotation.z = 0.65; // Angled North-West
    bajuriRoad.position.set(-36, 0.014, -102);
    bajuriRoad.receiveShadow = true;
    this.scene.add(bajuriRoad);

    // Double Yellow Center Divider on Sersan Bajuri
    [-0.14, 0.14].forEach(offset => {
      const bDashGeo = new THREE.PlaneGeometry(0.14, bajuriLen - 6);
      const bDash = new THREE.Mesh(bDashGeo, yellowMat);
      bDash.rotation.x = -Math.PI / 2;
      bDash.rotation.z = 0.65;
      const cosA = Math.cos(0.65);
      const sinA = Math.sin(0.65);
      bDash.position.set(-36 + offset * cosA, 0.024, -102 - offset * sinA);
      this.scene.add(bDash);
    });

    // White Stop Bar at mouth of Sersan Bajuri on the left lane ke bawah (North-East lane)
    const bStopGeo = new THREE.PlaneGeometry(4.8, 0.45);
    const bStop = new THREE.Mesh(bStopGeo, this.mm.materials.whiteMarking);
    bStop.rotation.x = -Math.PI / 2;
    bStop.rotation.z = 0.65 + Math.PI / 2;
    bStop.position.set(-14.5, 0.025, -78.0);
    this.scene.add(bStop);

    // White Stop Line for Setiabudi Northbound Through Traffic at Simpang 3 (Jalur Kanan: X = -3.8 to 0 at Z = -55.5)
    // Jalur kanan yang berhenti saat lampu merah lurus
    const sStopNorthGeo = new THREE.PlaneGeometry(3.8, 0.45);
    const sStopNorth = new THREE.Mesh(sStopNorthGeo, this.mm.materials.whiteMarking);
    sStopNorth.rotation.x = -Math.PI / 2;
    sStopNorth.position.set(-1.9, 0.025, -55.5);
    this.scene.add(sStopNorth);

    // White Stop Line for Setiabudi Southbound at Simpang 3 (East side: X = 0 to 7.8 at Z = -80.5)
    const sStopSouthGeo = new THREE.PlaneGeometry(7.8, 0.45);
    const sStopSouth = new THREE.Mesh(sStopSouthGeo, this.mm.materials.whiteMarking);
    sStopSouth.rotation.x = -Math.PI / 2;
    sStopSouth.position.set(3.9, 0.025, -80.5);
    this.scene.add(sStopSouth);

    // 3. JL. SERSAN URIP (East branch towards Sukasari, from X = 7.8 to 78, Z = -68, width 10.2m)
    const uripLen = 70.0;
    const uripGeo = new THREE.PlaneGeometry(uripLen, 10.2);
    const uripRoad = new THREE.Mesh(uripGeo, this.mm.materials.asphalt);
    uripRoad.rotation.x = -Math.PI / 2;
    uripRoad.position.set(7.8 + uripLen / 2, 0.013, -68);
    uripRoad.receiveShadow = true;
    this.scene.add(uripRoad);

    // Center yellow line on Urip
    const uLineGeo = new THREE.PlaneGeometry(uripLen - 6, 0.16);
    const uLine = new THREE.Mesh(uLineGeo, yellowMat);
    uLine.rotation.x = -Math.PI / 2;
    uLine.position.set(7.8 + uripLen / 2 + 3, 0.023, -68);
    this.scene.add(uLine);

    // Stop line on Urip
    const uStopGeo = new THREE.PlaneGeometry(0.45, 4.8);
    const uStop = new THREE.Mesh(uStopGeo, this.mm.materials.whiteMarking);
    uStop.rotation.x = -Math.PI / 2;
    uStop.position.set(9.0, 0.025, -65.5);
    this.scene.add(uStop);

    // Central junction blending apron mesh so all branches connect with no gaps
    const apronGeo = new THREE.PlaneGeometry(20, 24);
    const apron = new THREE.Mesh(apronGeo, this.mm.materials.asphalt);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(-1.0, 0.0125, -70);
    this.scene.add(apron);

    // Dedicated Simpang Bajuri Corner Turning Apron (South-West corner)
    // Seamlessly paves the turning corridor between Setiabudi interior (X = -7.8) and the curved curb return
    // Ensures vehicles turning left into Sersan Bajuri always drive on solid asphalt with zero grass gaps!
    const turnApronGeo = new THREE.BufferGeometry();
    const apronVertices = [];
    const apronUvs = [];
    const apronIndices = [];

    const cornerApronCurbNodes = [
      { x: -8.00,  z: -47.00 },
      { x: -8.70,  z: -49.50 },
      { x: -10.20, z: -53.00 },
      { x: -12.60, z: -57.50 },
      { x: -15.80, z: -63.00 },
      { x: -19.60, z: -69.50 },
      { x: -24.12, z: -77.12 }
    ];

    for (let i = 0; i < cornerApronCurbNodes.length; i++) {
      const c = cornerApronCurbNodes[i];
      // Vertex 2*i: interior road point along Setiabudi (X = -7.8)
      const mX = -7.8;
      const mZ = c.z;
      apronVertices.push(mX, 0.0125, mZ);
      apronUvs.push(mX * 0.2, mZ * 0.2);

      // Vertex 2*i + 1: road curb edge point
      apronVertices.push(c.x, 0.0125, c.z);
      apronUvs.push(c.x * 0.2, c.z * 0.2);
    }

    for (let i = 0; i < cornerApronCurbNodes.length - 1; i++) {
      const i0 = 2 * i;
      const i1 = 2 * i + 1;
      const i2 = 2 * (i + 1);
      const i3 = 2 * (i + 1) + 1;
      apronIndices.push(i0, i2, i3);
      apronIndices.push(i0, i3, i1);
    }

    turnApronGeo.setAttribute('position', new THREE.Float32BufferAttribute(apronVertices, 3));
    turnApronGeo.setAttribute('uv', new THREE.Float32BufferAttribute(apronUvs, 2));
    turnApronGeo.setIndex(apronIndices);
    turnApronGeo.computeVertexNormals();

    const turnApronMesh = new THREE.Mesh(turnApronGeo, this.mm.materials.asphalt);
    turnApronMesh.receiveShadow = true;
    this.scene.add(turnApronMesh);
  }

  createMohYaminRoad() {
    // JL. MOH. YAMIN (South area branching West into UPI Campus & small East alley at Z = 75)
    const yaminWestLen = 60.0;
    const yaminWestGeo = new THREE.PlaneGeometry(yaminWestLen, 9.5);
    const yaminWest = new THREE.Mesh(yaminWestGeo, this.mm.materials.asphalt);
    yaminWest.rotation.x = -Math.PI / 2;
    yaminWest.position.set(-8 - yaminWestLen / 2, 0.012, 75);
    yaminWest.receiveShadow = true;
    this.scene.add(yaminWest);

    // Small East street across from Yamin
    const yaminEastLen = 35.0;
    const yaminEastGeo = new THREE.PlaneGeometry(yaminEastLen, 8.0);
    const yaminEast = new THREE.Mesh(yaminEastGeo, this.mm.materials.asphalt);
    yaminEast.rotation.x = -Math.PI / 2;
    yaminEast.position.set(8 + yaminEastLen / 2, 0.012, 75);
    yaminEast.receiveShadow = true;
    this.scene.add(yaminEast);
  }

  createSidewalksAndCurbs() {
    const curbHeight = 0.22;
    const curbWidth = 0.35;
    const sidewalkWidth = 4.0;

    // 1. East Sidewalk & Curb along Setiabudi (broken at Jl. Sersan Urip mouth Z: [-74, -62])
    // 1a. East Sidewalk - South of Urip (Z: 130 to -62, length 192m)
    const lenES = 192.0;
    const zES = -62 + lenES / 2; // 34
    const eastSwS = new THREE.Mesh(new THREE.BoxGeometry(sidewalkWidth, curbHeight, lenES), this.mm.materials.sidewalk);
    eastSwS.position.set(8 + sidewalkWidth / 2, curbHeight / 2, zES);
    eastSwS.receiveShadow = true;
    this.scene.add(eastSwS);

    const eastCurbS = new THREE.Mesh(new THREE.BoxGeometry(curbWidth, curbHeight + 0.01, lenES), this.mm.materials.curb);
    eastCurbS.position.set(8 + curbWidth / 2, curbHeight / 2, zES);
    this.scene.add(eastCurbS);

    // 1b. East Sidewalk - North of Urip along Terusan Setiabudi (Z: -74 to -185, length 111m)
    const lenEN = 111.0;
    const zEN = -74 - lenEN / 2; // -129.5
    const eastSwN = new THREE.Mesh(new THREE.BoxGeometry(sidewalkWidth, curbHeight, lenEN), this.mm.materials.sidewalk);
    eastSwN.position.set(8 + sidewalkWidth / 2, curbHeight / 2, zEN);
    eastSwN.receiveShadow = true;
    this.scene.add(eastSwN);

    const eastCurbN = new THREE.Mesh(new THREE.BoxGeometry(curbWidth, curbHeight + 0.01, lenEN), this.mm.materials.curb);
    eastCurbN.position.set(8 + curbWidth / 2, curbHeight / 2, zEN);
    this.scene.add(eastCurbN);

    // 2. West Sidewalk & Curb along Setiabudi (broken at Perkasa Z: [6.5, 17.5] and Simpang Bajuri Z: [-78, -53])
    // 2a. West Sidewalk - Mid section between Perkasa & Simpang (stops at Z = -47.0 before corner curve)
    const lenWMid = 53.5; // Z: -47.0 to 6.5
    const zWMid = 6.5 - lenWMid / 2; // -20.25
    const westSwMid = new THREE.Mesh(new THREE.BoxGeometry(sidewalkWidth, curbHeight, lenWMid), this.mm.materials.sidewalk);
    westSwMid.position.set(-8 - sidewalkWidth / 2, curbHeight / 2, zWMid);
    westSwMid.receiveShadow = true;
    this.scene.add(westSwMid);

    const westCurbMid = new THREE.Mesh(new THREE.BoxGeometry(curbWidth, curbHeight + 0.01, lenWMid), this.mm.materials.curb);
    westCurbMid.position.set(-8 - curbWidth / 2, curbHeight / 2, zWMid);
    this.scene.add(westCurbMid);

    // 2b. West Sidewalk - North of Bajuri along Terusan Setiabudi (Z: -78 to -185, length 107m)
    const lenWN = 107.0;
    const zWN = -78 - lenWN / 2; // -131.5
    const westSwN = new THREE.Mesh(new THREE.BoxGeometry(sidewalkWidth, curbHeight, lenWN), this.mm.materials.sidewalk);
    westSwN.position.set(-8 - sidewalkWidth / 2, curbHeight / 2, zWN);
    westSwN.receiveShadow = true;
    this.scene.add(westSwN);

    const westCurbN = new THREE.Mesh(new THREE.BoxGeometry(curbWidth, curbHeight + 0.01, lenWN), this.mm.materials.curb);
    westCurbN.position.set(-8 - curbWidth / 2, curbHeight / 2, zWN);
    this.scene.add(westCurbN);

    // 2c. West Sidewalk - South of Perkasa (X = -12.5 to -8, Z: 17.5 to 130, length 112.5m)
    const lenWS = 112.5;
    const zWS = 17.5 + lenWS / 2;
    const westSwS = new THREE.Mesh(new THREE.BoxGeometry(sidewalkWidth, curbHeight, lenWS), this.mm.materials.sidewalk);
    westSwS.position.set(-8 - sidewalkWidth / 2, curbHeight / 2, zWS);
    westSwS.receiveShadow = true;
    this.scene.add(westSwS);

    const westCurbS = new THREE.Mesh(new THREE.BoxGeometry(curbWidth, curbHeight + 0.01, lenWS), this.mm.materials.curb);
    westCurbS.position.set(-8 - curbWidth / 2, curbHeight / 2, zWS);
    this.scene.add(westCurbS);

    // 3. Sidewalks along Jl. Perkasa (North side at Z = 5.0, South side at Z = 19.0)
    const perkasaSwLen = 95;
    const pSwN = new THREE.Mesh(new THREE.BoxGeometry(perkasaSwLen, curbHeight, 2.5), this.mm.materials.sidewalk);
    pSwN.position.set(-8 - perkasaSwLen / 2, curbHeight / 2 + 0.6, 5.75);
    pSwN.receiveShadow = true;
    this.scene.add(pSwN);

    const pSwS = new THREE.Mesh(new THREE.BoxGeometry(perkasaSwLen, curbHeight, 2.5), this.mm.materials.sidewalk);
    pSwS.position.set(-8 - perkasaSwLen / 2, curbHeight / 2 + 0.6, 18.25);
    pSwS.receiveShadow = true;
    this.scene.add(pSwS);

    // 4. Sidewalks along Jl. Sersan Urip
    const uripSwLen = 65.0;
    const uSwN = new THREE.Mesh(new THREE.BoxGeometry(uripSwLen, curbHeight, 2.5), this.mm.materials.sidewalk);
    uSwN.position.set(8 + uripSwLen / 2, curbHeight / 2, -61.5);
    this.scene.add(uSwN);

    const uSwS = new THREE.Mesh(new THREE.BoxGeometry(uripSwLen, curbHeight, 2.5), this.mm.materials.sidewalk);
    uSwS.position.set(8 + uripSwLen / 2, curbHeight / 2, -74.5);
    this.scene.add(uSwS);

    // 5. Sidewalks & Curbs along Jl. Sersan Bajuri (Left & Right Sides)
    // Sersan Bajuri orientation: angled at 0.65 rad (rotation.y = 0.65 + Math.PI)
    const bajuriSwGroup = new THREE.Group();
    bajuriSwGroup.position.set(-36, 0, -102);
    bajuriSwGroup.rotation.y = 0.65 + Math.PI;

    const bRoadHalfW = 5.25; // bajuriWidth (10.5) / 2
    const bSwWidth = 2.4;

    // --- South-West Sidewalk (Left Side / Samping Kiri, local +X) ---
    // Starts at local Z = -27.0 (seamlessly meets the curved corner at world X = -24.12, Z = -77.12) to Parongpong end (local Z = 47.5) -> length 74.5m
    const swLenLeft = 74.5;
    const bSwS = new THREE.Mesh(new THREE.BoxGeometry(bSwWidth, curbHeight, swLenLeft), this.mm.materials.sidewalk);
    bSwS.position.set(bRoadHalfW + curbWidth + bSwWidth / 2, curbHeight / 2, 10.25);
    bSwS.receiveShadow = true;
    bajuriSwGroup.add(bSwS);

    const bCurbS = new THREE.Mesh(new THREE.BoxGeometry(curbWidth, curbHeight + 0.01, swLenLeft), this.mm.materials.curb);
    bCurbS.position.set(bRoadHalfW + curbWidth / 2, (curbHeight + 0.01) / 2, 10.25);
    bajuriSwGroup.add(bCurbS);

    // --- North-East Sidewalk (Right Side / Samping Kanan, local -X) ---
    // Runs from Terusan Setiabudi mouth corner (local Z = -38.0) to Parongpong end (local Z = 47.5) -> length 85.5m
    const swLenRight = 85.5;
    const bSwN = new THREE.Mesh(new THREE.BoxGeometry(bSwWidth, curbHeight, swLenRight), this.mm.materials.sidewalk);
    bSwN.position.set(-(bRoadHalfW + curbWidth + bSwWidth / 2), curbHeight / 2, 4.75);
    bSwN.receiveShadow = true;
    bajuriSwGroup.add(bSwN);

    const bCurbN = new THREE.Mesh(new THREE.BoxGeometry(curbWidth, curbHeight + 0.01, swLenRight), this.mm.materials.curb);
    bCurbN.position.set(-(bRoadHalfW + curbWidth / 2), (curbHeight + 0.01) / 2, 4.75);
    bajuriSwGroup.add(bCurbN);

    // Green Ivy Fence along Sersan Bajuri sidewalks (Left & Right)
    const denseIvyTex = this.createDenseIvyTexture();
    const foliageMat = new THREE.MeshStandardMaterial({
      map: denseIvyTex,
      transparent: true,
      alphaTest: 0.25,
      roughness: 0.65,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    const postMat = new THREE.MeshStandardMaterial({ color: '#222629', roughness: 0.55, metalness: 0.65 });
    const railMat = new THREE.MeshStandardMaterial({ color: '#2c3034', roughness: 0.5, metalness: 0.6 });

    // Left side ivy fence panels (along local X = 5.55, from Z = -26 to 44)
    for (let lz = -26; lz <= 44; lz += 2.4) {
      const pMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), postMat);
      pMesh.position.set(5.55, curbHeight + 0.8, lz);
      bajuriSwGroup.add(pMesh);

      const fMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 1.45), foliageMat);
      fMesh.rotation.y = Math.PI / 2;
      fMesh.position.set(5.55, curbHeight + 0.8, lz + 1.2);
      bajuriSwGroup.add(fMesh);
    }
    // Continuous top & mid rails (Left)
    [curbHeight + 0.75, curbHeight + 1.55].forEach(ry => {
      const rMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 71), railMat);
      rMesh.position.set(5.55, ry, 9.5);
      bajuriSwGroup.add(rMesh);
    });

    // Right side ivy fence panels (along local X = -5.55)
    for (let rz = -34; rz <= 44; rz += 2.4) {
      const pMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), postMat);
      pMesh.position.set(-5.55, curbHeight + 0.8, rz);
      bajuriSwGroup.add(pMesh);

      const fMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 1.45), foliageMat);
      fMesh.rotation.y = -Math.PI / 2;
      fMesh.position.set(-5.55, curbHeight + 0.8, rz + 1.2);
      bajuriSwGroup.add(fMesh);
    }
    // Continuous top & mid rails (Right)
    [curbHeight + 0.75, curbHeight + 1.55].forEach(ry => {
      const rMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 79), railMat);
      rMesh.position.set(-5.55, ry, 5.5);
      bajuriSwGroup.add(rMesh);
    });

    this.scene.add(bajuriSwGroup);

    // --- 6. Seamless Curved Corner Sidewalk & Curb (Simpang Bajuri South-West) ---
    // Smoothly sweeps around the corner connecting Setiabudi (Z = -47.0) to Sersan Bajuri (Z = -77.12)
    // Completely open turning corridor with generous 2.5m - 4.5m safety margin from the vehicle turning trajectory:
    //   Car path: (-6.8, -48) -> (-10.5, -58) -> (-16.0, -68) -> (-22.0, -79)
    // Never cuts into road, lane, or vehicle paths!
    const cornerCurbNodes = [
      { x: -8.00,  z: -47.00 },
      { x: -8.70,  z: -49.50 },
      { x: -10.20, z: -53.00 },
      { x: -12.60, z: -57.50 },
      { x: -15.80, z: -63.00 },
      { x: -19.60, z: -69.50 },
      { x: -24.12, z: -77.12 }
    ];

    const cornerOuterNodes = [
      { x: -12.00, z: -47.00 },
      { x: -12.20, z: -49.50 },
      { x: -13.20, z: -53.00 },
      { x: -15.20, z: -57.50 },
      { x: -18.00, z: -63.00 },
      { x: -21.60, z: -69.50 },
      { x: -26.03, z: -75.66 }
    ];

    const cornerSwGroup = new THREE.Group();

    // 6a. Continuous Sidewalk Paving Mesh (BufferGeometry)
    // Perfectly bridges Setiabudi sidewalk (width 4m) to Sersan Bajuri sidewalk (width 2.4m) with zero cracks
    const swGeo = new THREE.BufferGeometry();
    const swVertices = [];
    const swUvs = [];
    const swIndices = [];

    for (let i = 0; i < cornerCurbNodes.length; i++) {
      const c = cornerCurbNodes[i];
      const o = cornerOuterNodes[i];

      // Inner vertex (at curb edge)
      swVertices.push(c.x, curbHeight, c.z);
      swUvs.push((c.x + 30) / 4.0, (c.z + 100) / 4.0);

      // Outer vertex (boundary along houses / corner garden)
      swVertices.push(o.x, curbHeight, o.z);
      swUvs.push((o.x + 30) / 4.0, (o.z + 100) / 4.0);
    }

    for (let i = 0; i < cornerCurbNodes.length - 1; i++) {
      const i0 = 2 * i;          // c0
      const i1 = 2 * i + 1;      // o0
      const i2 = 2 * (i + 1);     // c1
      const i3 = 2 * (i + 1) + 1; // o1

      // Counter-clockwise triangles with normal facing straight UP (+Y)
      swIndices.push(i0, i2, i3);
      swIndices.push(i0, i3, i1);
    }

    swGeo.setAttribute('position', new THREE.Float32BufferAttribute(swVertices, 3));
    swGeo.setAttribute('uv', new THREE.Float32BufferAttribute(swUvs, 2));
    swGeo.setIndex(swIndices);
    swGeo.computeVertexNormals();

    const swMesh = new THREE.Mesh(swGeo, this.mm.materials.sidewalk);
    swMesh.receiveShadow = true;
    cornerSwGroup.add(swMesh);

    // 6b. Curved Curb Blocks & Protective Hedera Helix Ivy Railing along each segment
    for (let i = 0; i < cornerCurbNodes.length - 1; i++) {
      const p0 = cornerCurbNodes[i];
      const p1 = cornerCurbNodes[i + 1];
      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const segLen = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz) + Math.PI;

      // Normal unit vector pointing outward towards sidewalk/houses
      const nx = dz / segLen;
      const nz = -dx / segLen;

      const midX = (p0.x + p1.x) / 2;
      const midZ = (p0.z + p1.z) / 2;

      // Raised striped curb block
      const cMesh = new THREE.Mesh(
        new THREE.BoxGeometry(curbWidth, curbHeight + 0.01, segLen + 0.06),
        this.mm.materials.curb
      );
      cMesh.position.set(midX + nx * (curbWidth / 2), (curbHeight + 0.01) / 2, midZ + nz * (curbWidth / 2));
      cMesh.rotation.y = angle;
      cornerSwGroup.add(cMesh);

      // Steel fence post
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), postMat);
      post.position.set(p0.x + nx * (curbWidth + 0.04), curbHeight + 0.8, p0.z + nz * (curbWidth + 0.04));
      cornerSwGroup.add(post);

      // 2 horizontal steel safety rails along the curve
      [curbHeight + 0.35, curbHeight + 1.25].forEach(ry => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, segLen + 0.04), railMat);
        rail.position.set(midX + nx * (curbWidth + 0.04), ry, midZ + nz * (curbWidth + 0.04));
        rail.rotation.y = angle;
        cornerSwGroup.add(rail);
      });

      // Dense Hedera Helix ivy foliage panel
      const fol = new THREE.Mesh(new THREE.PlaneGeometry(segLen * 0.98, 1.45), foliageMat);
      fol.position.set(midX + nx * (curbWidth + 0.04), curbHeight + 0.8, midZ + nz * (curbWidth + 0.04));
      fol.rotation.y = angle + Math.PI / 2;
      cornerSwGroup.add(fol);
    }

    // Terminal post at the corner junction end
    const lastNode = cornerCurbNodes[cornerCurbNodes.length - 1];
    const prevNode = cornerCurbNodes[cornerCurbNodes.length - 2];
    const ldx = lastNode.x - prevNode.x;
    const ldz = lastNode.z - prevNode.z;
    const lLen = Math.sqrt(ldx * ldx + ldz * ldz);
    const endPost = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), postMat);
    endPost.position.set(lastNode.x + (ldz / lLen) * (curbWidth + 0.04), curbHeight + 0.8, lastNode.z + (-ldx / lLen) * (curbWidth + 0.04));
    cornerSwGroup.add(endPost);

    this.scene.add(cornerSwGroup);

    // Rounded Corner Curbs at other T-Junction corners
    const cornerCylinderGeo = new THREE.CylinderGeometry(1.5, 1.5, curbHeight + 0.02, 16, 1, false, 0, Math.PI / 2);
    // Perkasa corners
    const cNorth = new THREE.Mesh(cornerCylinderGeo, this.mm.materials.curb);
    cNorth.position.set(-8.5, curbHeight / 2, 7.0);
    this.scene.add(cNorth);

    const cSouth = new THREE.Mesh(cornerCylinderGeo, this.mm.materials.curb);
    cSouth.position.set(-8.5, curbHeight / 2, 17.0);
    cSouth.rotation.y = -Math.PI / 2;
    this.scene.add(cSouth);

    // Urip corners
    const cUripSouth = new THREE.Mesh(cornerCylinderGeo, this.mm.materials.curb);
    cUripSouth.position.set(8.5, curbHeight / 2, -32.5);
    cUripSouth.rotation.y = Math.PI;
    this.scene.add(cUripSouth);

    const cUripNorth = new THREE.Mesh(cornerCylinderGeo, this.mm.materials.curb);
    cUripNorth.position.set(8.5, curbHeight / 2, -43.5);
    cUripNorth.rotation.y = Math.PI / 2;
    this.scene.add(cUripNorth);
  }

  // =========================================================================
  // SIDEWALK FENCES WITH HEDERA HELIX (IVY) CLIMBING PLANTS (1.8m HEIGHT)
  // Installed along the road-facing curb edge of sidewalks ("samping jalan")
  // =========================================================================
  // =========================================================================
  // ULTRA-DENSE HEDERA HELIX (IVY) 1.8m FENCE SYSTEM
  // High-performance architecture: Continuous lush procedural foliage panels
  // + THREE.InstancedMesh for 3D leaves (drops draw calls from 8500 to ~40!)
  // =========================================================================
  createDenseIvyTexture() {
    if (this.denseIvyTexture) return this.denseIvyTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');

    // 1. Transparent base
    ctx.clearRect(0, 0, 512, 384);

    // 2. Underlying steel diamond wire mesh grid (visible through natural ivy gaps)
    ctx.strokeStyle = 'rgba(50, 55, 60, 0.45)';
    ctx.lineWidth = 1.5;
    for (let x = -384; x < 512 + 384; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 384, 384);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, 384);
      ctx.lineTo(x + 384, 0);
      ctx.stroke();
    }

    // 3. Thick woody vine tendrils climbing up the fence
    ctx.strokeStyle = '#3e2a16';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const vineColumns = [35, 95, 160, 225, 290, 355, 420, 480];
    vineColumns.forEach(bx => {
      ctx.lineWidth = 4.5 + Math.random() * 2.0;
      ctx.beginPath();
      ctx.moveTo(bx, 384);
      let cx = bx;
      for (let cy = 350; cy >= 15; cy -= 35) {
        const nextX = cx + (Math.sin(cy * 0.04 + bx) * 26);
        ctx.lineTo(nextX, cy);
        cx = nextX;
        // Lateral climbing branches
        if (Math.random() > 0.35) {
          ctx.save();
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (Math.random() - 0.5) * 65, cy - 15 - Math.random() * 30);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.stroke();
    });

    // Helper: draw single detailed Hedera Helix leaf
    const drawIvyLeaf = (lx, ly, scale, angle, colorType) => {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(angle);
      ctx.scale(scale, scale);

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(10, -4, 24, -10, 28, -24);
      ctx.bezierCurveTo(26, -32, 16, -35, 14, -42);
      ctx.bezierCurveTo(16, -52, 10, -64, 0, -70);
      ctx.bezierCurveTo(-10, -64, -16, -52, -14, -42);
      ctx.bezierCurveTo(-16, -35, -26, -32, -28, -24);
      ctx.bezierCurveTo(-24, -10, -10, -4, 0, 0);
      ctx.closePath();

      // Rich multi-shade Hedera Helix gradients
      const grad = ctx.createRadialGradient(0, -38, 2, 0, -38, 38);
      if (colorType === 0) {
        // Deep background dark leaf
        grad.addColorStop(0, '#1c4820');
        grad.addColorStop(0.7, '#103014');
        grad.addColorStop(1, '#07170a');
      } else if (colorType === 1) {
        // Lush emerald mature leaf
        grad.addColorStop(0, '#2d7a34');
        grad.addColorStop(0.7, '#195221');
        grad.addColorStop(1, '#0e2e13');
      } else if (colorType === 2) {
        // Fresh green leaf
        grad.addColorStop(0, '#429e4b');
        grad.addColorStop(0.7, '#26732d');
        grad.addColorStop(1, '#15451a');
      } else {
        // Bright young leaf tips
        grad.addColorStop(0, '#66bf6f');
        grad.addColorStop(0.7, '#388e3f');
        grad.addColorStop(1, '#1e5e24');
      }

      ctx.fillStyle = grad;
      ctx.fill();

      // Leaf edge stroke
      ctx.strokeStyle = colorType >= 2 ? '#3fa846' : '#236e29';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      // Creamy pale-green radiating leaf veins
      ctx.strokeStyle = colorType >= 2 ? '#a5e8ad' : '#72c27b';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -66);
      ctx.moveTo(0, -14);
      ctx.lineTo(24, -26);
      ctx.moveTo(0, -14);
      ctx.lineTo(-24, -26);
      ctx.moveTo(0, -30);
      ctx.lineTo(12, -40);
      ctx.moveTo(0, -30);
      ctx.lineTo(-12, -40);
      ctx.stroke();

      ctx.restore();
    };

    // LAYER 1: Deep background leaves (thick wall base) - 320 leaves
    for (let i = 0; i < 320; i++) {
      const lx = Math.random() * 512;
      const ly = 10 + Math.random() * 370;
      const s = 0.55 + Math.random() * 0.45;
      const a = (Math.random() - 0.5) * 2.5;
      drawIvyLeaf(lx, ly, s, a, 0);
    }

    // LAYER 2: Lush mid-layer leaves (dense emerald body) - 380 leaves
    for (let i = 0; i < 380; i++) {
      const lx = Math.random() * 512;
      const ly = Math.random() * 380;
      const s = 0.65 + Math.random() * 0.45;
      const a = (Math.random() - 0.5) * 2.8;
      drawIvyLeaf(lx, ly, s, a, 1);
    }

    // LAYER 3: Vibrant foreground leaves - 280 leaves
    for (let i = 0; i < 280; i++) {
      const lx = Math.random() * 512;
      const ly = Math.random() * 380;
      const s = 0.70 + Math.random() * 0.40;
      const a = (Math.random() - 0.5) * 3.0;
      drawIvyLeaf(lx, ly, s, a, 2);
    }

    // LAYER 4: Top rail cascading overhangs (spilling over 1.8m top rail) - 180 leaves
    for (let i = 0; i < 180; i++) {
      const lx = Math.random() * 512;
      const ly = Math.random() * 75; // Top crest
      const s = 0.60 + Math.random() * 0.50;
      const a = Math.PI * 0.6 + (Math.random() - 0.5) * 1.6; // cascading downwards
      drawIvyLeaf(lx, ly, s, a, (Math.random() > 0.4 ? 3 : 2));
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    this.denseIvyTexture = tex;
    return tex;
  }

  createIvySingleLeafTexture() {
    if (this.ivySingleLeafTexture) return this.ivySingleLeafTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.save();
    ctx.translate(64, 114);

    // 5-Pointed English Ivy leaf
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(16, -6, 38, -16, 44, -38);
    ctx.bezierCurveTo(42, -50, 26, -54, 22, -64);
    ctx.bezierCurveTo(24, -78, 16, -98, 0, -108);
    ctx.bezierCurveTo(-16, -98, -24, -78, -22, -64);
    ctx.bezierCurveTo(-26, -54, -42, -50, -44, -38);
    ctx.bezierCurveTo(-38, -16, -16, -6, 0, 0);
    ctx.closePath();

    const grad = ctx.createRadialGradient(0, -60, 4, 0, -60, 60);
    grad.addColorStop(0, '#2d7a32');
    grad.addColorStop(0.65, '#1b4d20');
    grad.addColorStop(1, '#0e2e13');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#3e9c45';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.strokeStyle = '#8ade93';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -104);
    ctx.moveTo(0, -22);
    ctx.lineTo(38, -42);
    ctx.moveTo(0, -22);
    ctx.lineTo(-38, -42);
    ctx.moveTo(0, -46);
    ctx.lineTo(18, -64);
    ctx.moveTo(0, -46);
    ctx.lineTo(-18, -64);
    ctx.stroke();

    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    this.ivySingleLeafTexture = tex;
    return tex;
  }

  createSidewalkFences() {
    const fenceHeight = 1.8; // Exactly 1.8m height as requested
    const fencePostWidth = 0.08;
    const curbH = 0.22;

    // Materials for fence (posts & rails)
    const fencePostMat = new THREE.MeshStandardMaterial({
      color: '#222629', roughness: 0.55, metalness: 0.65
    });
    const fenceRailMat = new THREE.MeshStandardMaterial({
      color: '#2c3034', roughness: 0.5, metalness: 0.6
    });

    // High-density foliage wall material (replaces thousands of individual quads with 1 continuous texture!)
    const denseIvyTex = this.createDenseIvyTexture();
    const foliageWallMat = new THREE.MeshStandardMaterial({
      map: denseIvyTex,
      transparent: true,
      alphaTest: 0.25,
      roughness: 0.65,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    // Instanced 3D leaf material for leaves that pop out with real depth (ZERO FPS LAG: 1 draw call!)
    const singleLeafTex = this.createIvySingleLeafTexture();
    const instancedLeafMat = new THREE.MeshStandardMaterial({
      map: singleLeafTex,
      transparent: true,
      alphaTest: 0.3,
      roughness: 0.6,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    const instancedLeafGeo = new THREE.PlaneGeometry(0.22, 0.20);
    const maxInstancedLeaves = 1500;
    const instancedLeavesMesh = new THREE.InstancedMesh(instancedLeafGeo, instancedLeafMat, maxInstancedLeaves);
    instancedLeavesMesh.castShadow = false;
    instancedLeavesMesh.receiveShadow = true;
    let leafInstanceCount = 0;
    const dummyObj = new THREE.Object3D();

    // Shared geometries
    const postGeo = new THREE.BoxGeometry(fencePostWidth, fenceHeight, fencePostWidth);
    const postCapGeo = new THREE.BoxGeometry(fencePostWidth + 0.03, 0.04, fencePostWidth + 0.03);

    // Fence segments on the road curb edge ("samping jalan"):
    // East side: X = 8.35 (curb at 8.0 - 8.35)
    // West side: X = -8.35 (curb at -8.0 - -8.35)
    // Openings left for Zebra cross, Perkasa, Bajuri, Urip, Moh Yamin
    const fenceSegments = [
      // === EAST SIDE (X = 8.35) ===
      { x: 8.35, zStart: 82, zEnd: 128, side: 'east' },
      { x: 8.35, zStart: 68, zEnd: -4, side: 'east' },
      { x: 8.35, zStart: -12, zEnd: -58, side: 'east' },
      { x: 8.35, zStart: -78, zEnd: -180, side: 'east' },

      // === WEST SIDE (X = -8.35) ===
      { x: -8.35, zStart: 82, zEnd: 128, side: 'west' },
      { x: -8.35, zStart: 19, zEnd: 68, side: 'west' },
      { x: -8.35, zStart: -4, zEnd: 5, side: 'west' },
      { x: -8.35, zStart: -47, zEnd: -12, side: 'west' },
      { x: -8.35, zStart: -82, zEnd: -180, side: 'west' },
    ];

    for (const seg of fenceSegments) {
      const zMin = Math.min(seg.zStart, seg.zEnd);
      const zMax = Math.max(seg.zStart, seg.zEnd);
      const totalLength = zMax - zMin;

      const targetSpacing = 2.4;
      const numBays = Math.max(1, Math.round(totalLength / targetSpacing));
      const postSpacing = totalLength / numBays;
      const numPosts = numBays + 1;

      const fenceGroup = new THREE.Group();

      for (let i = 0; i < numPosts; i++) {
        const z = zMin + i * postSpacing;

        // Vertical Fence Post (1.8m)
        const post = new THREE.Mesh(postGeo, fencePostMat);
        post.position.set(seg.x, curbH + fenceHeight / 2, z);
        post.castShadow = true;
        fenceGroup.add(post);

        // Decorative Post Cap
        const cap = new THREE.Mesh(postCapGeo, fencePostMat);
        cap.position.set(seg.x, curbH + fenceHeight + 0.02, z);
        fenceGroup.add(cap);

        // Bay panels between posts
        if (i < numPosts - 1) {
          const railLen = postSpacing;
          const midZ = z + railLen / 2;
          const scaledRailGeo = new THREE.BoxGeometry(0.045, 0.045, railLen);

          // 3 Horizontal Steel Rails: Bottom (0.2m), Middle (0.95m), Top (1.8m)
          for (const rh of [0.20, 0.95, fenceHeight]) {
            const rail = new THREE.Mesh(scaledRailGeo, fenceRailMat);
            rail.position.set(seg.x, curbH + rh, midZ);
            fenceGroup.add(rail);
          }

          // Ultra-dense Hedera Helix climbing foliage wall panel (1.8m tall, full bay width)
          const panelGeo = new THREE.PlaneGeometry(railLen, fenceHeight);
          const panelMesh = new THREE.Mesh(panelGeo, foliageWallMat);
          panelMesh.rotation.y = Math.PI / 2;
          panelMesh.position.set(seg.x, curbH + fenceHeight / 2, midZ);
          panelMesh.receiveShadow = true;
          panelMesh.castShadow = false;
          fenceGroup.add(panelMesh);

          // Scatter 3D popping instanced leaves for authentic physical depth (over top rail, front & back)
          if (leafInstanceCount < maxInstancedLeaves - 8) {
            // 1. Leaves cascading over the 1.8m top rail
            for (let tl = 0; tl < 3; tl++) {
              const lx = seg.x + (Math.random() - 0.5) * 0.14;
              const ly = curbH + fenceHeight + 0.04 + (Math.random() - 0.5) * 0.08;
              const lz = z + 0.3 + Math.random() * (railLen - 0.6);
              dummyObj.position.set(lx, ly, lz);
              dummyObj.rotation.set(
                (Math.random() - 0.5) * 0.6,
                Math.random() * Math.PI * 2,
                (Math.random() - 0.5) * 0.8
              );
              const s = 0.9 + Math.random() * 0.45;
              dummyObj.scale.set(s, s, 1);
              dummyObj.updateMatrix();
              instancedLeavesMesh.setMatrixAt(leafInstanceCount++, dummyObj.matrix);
            }

            // 2. Leaves protruding from the face of the fence towards road and sidewalk
            for (let fl = 0; fl < 4; fl++) {
              const sideOffset = (Math.random() > 0.5 ? 0.06 : -0.06) + (Math.random() - 0.5) * 0.04;
              const lx = seg.x + sideOffset;
              const ly = curbH + 0.35 + Math.random() * (fenceHeight - 0.5);
              const lz = z + 0.2 + Math.random() * (railLen - 0.4);
              dummyObj.position.set(lx, ly, lz);
              dummyObj.rotation.set(
                (Math.random() - 0.5) * 0.8,
                (seg.side === 'east' ? -Math.PI / 2 : Math.PI / 2) + (Math.random() - 0.5) * 1.2,
                (Math.random() - 0.5) * 0.7
              );
              const s = 0.85 + Math.random() * 0.5;
              dummyObj.scale.set(s, s, 1);
              dummyObj.updateMatrix();
              instancedLeavesMesh.setMatrixAt(leafInstanceCount++, dummyObj.matrix);
            }
          }
        }
      }

      this.scene.add(fenceGroup);
    }

    // Finalize 3D instanced leaves
    instancedLeavesMesh.count = leafInstanceCount;
    instancedLeavesMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(instancedLeavesMesh);
  }

  // =========================================================================
  // ANIMATED PEDESTRIANS WALKING ON SIDEWALKS (WITH UPI STUDENTS & LOCALS)
  // =========================================================================
  createSidewalkPedestrians() {
    // Defined walking routes along the sidewalks:
    // East sidewalk (X ~ 10.2, between fence at X=8.35 and buildings at X=12.0)
    // West sidewalk (X ~ -10.2, between fence at X=-8.35 and buildings at X=-12.0)
    // Jl. Perkasa sidewalks (heading to/from UPI campus)
    const routes = [
      // East sidewalk - South of Zebra Crossing (length ~120m)
      { startX: 10.2, startZ: 120, endX: 10.2, endZ: -3, baseY: 0.22, name: 'East South' },
      // East sidewalk - Mid section between Zebra & Urip
      { startX: 10.2, startZ: -13, endX: 10.2, endZ: -56, baseY: 0.22, name: 'East Mid' },
      // East sidewalk - North section along Terusan Setiabudi
      { startX: 10.2, startZ: -80, endX: 10.2, endZ: -170, baseY: 0.22, name: 'East North' },

      // West sidewalk - South of Perkasa
      { startX: -10.2, startZ: 120, endX: -10.2, endZ: 21, baseY: 0.22, name: 'West South' },
      // West sidewalk - Mid section between Perkasa & Zebra
      { startX: -10.2, startZ: 4, endX: -10.2, endZ: -3, baseY: 0.22, name: 'West Perkasa-Zebra' },
      // West sidewalk - Section between Zebra & Bajuri (extended past new houses)
      { startX: -10.2, startZ: -13, endX: -10.2, endZ: -45.0, baseY: 0.22, name: 'West Bajuri-Zebra' },
      // West sidewalk - North section along Terusan Setiabudi
      { startX: -10.2, startZ: -84, endX: -10.2, endZ: -170, baseY: 0.22, name: 'West North' },

      // Jl. Sersan Bajuri sidewalks (Left / South-West side)
      { startX: -25.5, startZ: -78.0, endX: -68.0, endZ: -132.9, baseY: 0.22, name: 'Bajuri Left SW' },
      // Jl. Sersan Bajuri sidewalks (Right / North-East side)
      { startX: -10.0, startZ: -79.0, endX: -57.2, endZ: -141.1, baseY: 0.22, name: 'Bajuri Right NE' },

      // Jl. Perkasa sidewalks (Students and pedestrians entering/exiting UPI campus)
      { startX: -9.5, startZ: 5.75, endX: -45.0, endZ: 5.75, baseY: 0.82, name: 'Perkasa North UPI' },
      { startX: -9.5, startZ: 18.25, endX: -45.0, endZ: 18.25, baseY: 0.82, name: 'Perkasa South UPI' },
    ];

    // Indonesian skin tones & attire
    const skinTones = ['#c8956c', '#a67b5b', '#d4a574', '#8d5e3c', '#e8c4a0', '#b98054'];
    const shirtColors = [
      '#e74c3c', '#2980b9', '#27ae60', '#f39c12', '#8e44ad',
      '#16a085', '#d35400', '#34495e', '#ecf0f1', '#2c3e50',
      '#c0392b', '#1abc9c', '#7f8c8d'
    ];
    const pantsColors = ['#2c3e50', '#34495e', '#1a1a2e', '#4a4a5a', '#2d2d3d', '#1c3144', '#3e2723'];

    let pedId = 0;
    for (const route of routes) {
      // 2-4 pedestrians per route segment (~22-28 pedestrians total)
      const numPeds = (route.name.includes('Perkasa') || route.name.includes('Mid')) ?
        (2 + Math.floor(Math.random() * 2)) :
        (3 + Math.floor(Math.random() * 2));

      for (let i = 0; i < numPeds; i++) {
        // 35% chance to be a UPI student wearing Jas Almamater UPI (navy blazer + gold crest)
        const isUPIStudent = Math.random() < 0.35 || route.name.includes('UPI');

        const skinColor = skinTones[Math.floor(Math.random() * skinTones.length)];
        const shirtColor = isUPIStudent ? '#1e3a8a' : shirtColors[Math.floor(Math.random() * shirtColors.length)];
        const pantsColor = pantsColors[Math.floor(Math.random() * pantsColors.length)];

        const mesh = this.createSidewalkPedestrianMesh(skinColor, shirtColor, pantsColor, isUPIStudent);

        // Staggered progress along route (0 to 1)
        const progress = (i + Math.random() * 0.6) / numPeds;
        const direction = Math.random() > 0.5 ? 1 : -1;
        const speed = 0.9 + Math.random() * 0.55; // 0.9 - 1.45 m/s

        const ped = {
          mesh,
          route,
          progress: Math.min(0.95, Math.max(0.05, progress)),
          direction,
          speed,
          id: pedId++
        };

        // Position mesh along route
        const x = THREE.MathUtils.lerp(route.startX, route.endX, ped.progress);
        const z = THREE.MathUtils.lerp(route.startZ, route.endZ, ped.progress);
        mesh.position.set(x, route.baseY, z);

        // Face walking direction
        const dz = route.endZ - route.startZ;
        const dx = route.endX - route.startX;
        const baseAngle = Math.atan2(dx, dz);
        mesh.rotation.y = baseAngle + (direction === -1 ? Math.PI : 0);

        this.scene.add(mesh);
        this.sidewalkPedestrians.push(ped);
      }
    }
  }

  createSidewalkPedestrianMesh(skinColor, shirtColor, pantsColor, isUPIStudent = false) {
    const root = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.75 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.85 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: '#181818', roughness: 0.9 });
    const hairMat = new THREE.MeshStandardMaterial({
      color: ['#120d08', '#241910', '#1c140c', '#332316'][Math.floor(Math.random() * 4)],
      roughness: 0.85
    });

    // Torso / Upper Body
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.19), shirtMat);
    torso.position.y = 1.14;
    torso.castShadow = true;
    root.add(torso);

    // UPI Student Almamater crest & collared shirt detail
    if (isUPIStudent) {
      // Inner white shirt collar
      const collar = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, 0.12),
        new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 })
      );
      collar.position.set(0, 1.28, 0.10);
      root.add(collar);

      // Gold UPI crest patch on left chest
      const crest = new THREE.Mesh(
        new THREE.PlaneGeometry(0.045, 0.045),
        new THREE.MeshStandardMaterial({ color: '#f5c518', roughness: 0.4, metalness: 0.4 })
      );
      crest.position.set(0.09, 1.22, 0.10);
      root.add(crest);
    }

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), skinMat);
    head.position.y = 1.50;
    head.castShadow = true;
    root.add(head);

    // Hair
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), hairMat);
    hair.position.y = 1.53;
    hair.scale.set(1.0, 0.72, 1.05);
    root.add(hair);

    // Left Leg
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.50, 0.12), pantsMat);
    leftLeg.position.set(-0.08, 0.58, 0);
    leftLeg.castShadow = true;
    root.leftLeg = leftLeg;
    root.add(leftLeg);

    // Right Leg
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.50, 0.12), pantsMat);
    rightLeg.position.set(0.08, 0.58, 0);
    rightLeg.castShadow = true;
    root.rightLeg = rightLeg;
    root.add(rightLeg);

    // Left Arm
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, 0.09), shirtMat);
    leftArm.position.set(-0.22, 1.10, 0);
    leftArm.castShadow = true;
    root.leftArm = leftArm;
    root.add(leftArm);

    // Right Arm
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, 0.09), shirtMat);
    rightArm.position.set(0.22, 1.10, 0);
    rightArm.castShadow = true;
    root.rightArm = rightArm;
    root.add(rightArm);

    // Shoes
    const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.18), shoeMat);
    leftShoe.position.set(-0.08, 0.31, 0.02);
    root.add(leftShoe);

    const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.18), shoeMat);
    rightShoe.position.set(0.08, 0.31, 0.02);
    root.add(rightShoe);

    // Backpack for students / sling bags for locals
    if (isUPIStudent || Math.random() > 0.45) {
      const bagMat = new THREE.MeshStandardMaterial({
        color: isUPIStudent ? '#1c1c1c' : ['#8b4513', '#2f4f4f', '#800020', '#1a3a5c'][Math.floor(Math.random() * 4)],
        roughness: 0.85
      });
      // Backpack on back
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.12), bagMat);
      bag.position.set(0, 1.12, -0.14);
      bag.castShadow = true;
      root.add(bag);
    }

    return root;
  }

  createZebraCrossing() {
    // Zebra crossing on Setiabudi across all 4 lanes (X = -7.8 to +7.8)
    // Located at Z = -8.0 (width 4m, from Z = -10 to -6)
    const stripeWidth = 0.7;
    const stripeLength = 4.0;
    const stripeGap = 0.55;
    const zebraGeo = new THREE.PlaneGeometry(stripeWidth, stripeLength);
    const zebraMat = this.mm.materials.zebraStripe;

    for (let x = -7.4; x <= 7.4; x += (stripeWidth + stripeGap)) {
      const stripe = new THREE.Mesh(zebraGeo, zebraMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, 0.025, -8.0);
      this.scene.add(stripe);
    }

    // Stop Lines before zebra crossing (painted on asphalt)
    // Southbound stop line at Z = -12.5 (East side: X = 0 to 7.8, center = 3.9)
    const stopSouthGeo = new THREE.PlaneGeometry(7.8, 0.45);
    const stopSouth = new THREE.Mesh(stopSouthGeo, this.mm.materials.whiteMarking);
    stopSouth.rotation.x = -Math.PI / 2;
    stopSouth.position.set(3.9, 0.025, -12.5);
    this.scene.add(stopSouth);

    // Northbound stop line at Z = -3.5 (West side: X = -7.8 to 0, center = -3.9)
    const stopNorthGeo = new THREE.PlaneGeometry(7.8, 0.45);
    const stopNorth = new THREE.Mesh(stopNorthGeo, this.mm.materials.whiteMarking);
    stopNorth.rotation.x = -Math.PI / 2;
    stopNorth.position.set(-3.9, 0.025, -3.5);
    this.scene.add(stopNorth);

    // Tactile warning paving (yellow embossed pads) on sidewalk curbs facing zebra crossing
    const tactileGeo = new THREE.PlaneGeometry(1.8, 4.0);
    // East side sidewalk ramp
    const tactileEast = new THREE.Mesh(tactileGeo, this.mm.materials.tactile);
    tactileEast.rotation.x = -Math.PI / 2;
    tactileEast.position.set(8.9, 0.23, -8.0);
    this.scene.add(tactileEast);

    // West side sidewalk ramp
    const tactileWest = new THREE.Mesh(tactileGeo, this.mm.materials.tactile);
    tactileWest.rotation.x = -Math.PI / 2;
    tactileWest.position.set(-8.9, 0.23, -8.0);
    this.scene.add(tactileWest);

    // Pedestrian Crossing Signposts (Indonesian blue square signs with walking person)
    this.createCrossingSign(9.2, -10.5, 0); // East side
    this.createCrossingSign(-9.2, -10.5, Math.PI); // West side

    // Pelican Signal Light & Flashing Warning Beacon Poles on BOTH sides
    this.pelicanSignals = [];
    this.createPelicanSignalPole(-9.0, -5.5, Math.PI / 2);  // West side
    this.createPelicanSignalPole(9.0, -10.5, -Math.PI / 2); // East side
    this.setPedestrianSignalLight(false);
  }

  createCrossingSign(x, z, rotY) {
    const group = new THREE.Group();

    // Steel pole
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.2, 12);
    const pole = new THREE.Mesh(poleGeo, this.mm.materials.metalPole);
    pole.position.y = 1.6;
    pole.castShadow = true;
    group.add(pole);

    // Sign plate
    const signPlateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.04);
    const sign = new THREE.Mesh(signPlateGeo, [
      this.mm.materials.metalPole,
      this.mm.materials.metalPole,
      this.mm.materials.metalPole,
      this.mm.materials.metalPole,
      this.mm.materials.signZebra,
      this.mm.materials.metalPole
    ]);
    sign.position.set(0, 2.7, 0);
    group.add(sign);

    group.position.set(x, 0.22, z);
    group.rotation.y = rotY;
    this.scene.add(group);
  }

  createSignalGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.4)');
    grad.addColorStop(0.85, 'rgba(255, 255, 255, 0.08)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }

  createSignalGlowMesh(colorHex, size = 1.25) {
    if (!this.signalGlowTexture) {
      this.signalGlowTexture = this.createSignalGlowTexture();
    }
    const mat = new THREE.MeshBasicMaterial({
      map: this.signalGlowTexture,
      color: colorHex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const geo = new THREE.PlaneGeometry(size, size);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    return mesh;
  }

  createPelicanSignalPole(x, z, rotY = Math.PI / 2) {
    const group = new THREE.Group();

    // Mast pole
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.8, 12);
    const pole = new THREE.Mesh(poleGeo, this.mm.materials.metalPole);
    pole.position.y = 1.9;
    group.add(pole);

    // Signal housing
    const boxGeo = new THREE.BoxGeometry(0.48, 1.05, 0.38);
    const box = new THREE.Mesh(boxGeo, this.mm.materials.streetLampFixture);
    box.position.set(0, 2.6, 0);
    group.add(box);

    // Push button box on side (yellow box with stainless button)
    const btnBoxGeo = new THREE.BoxGeometry(0.18, 0.28, 0.16);
    const btnBox = new THREE.Mesh(btnBoxGeo, new THREE.MeshLambertMaterial({ color: '#ffcc00' }));
    btnBox.position.set(0.1, 1.2, 0);
    group.add(btnBox);

    // Acoustic speaker grill box for visually impaired (APS speaker)
    const speakerGeo = new THREE.BoxGeometry(0.22, 0.22, 0.12);
    const speakerMat = new THREE.MeshLambertMaterial({ color: '#2c3e50' });
    const speaker = new THREE.Mesh(speakerGeo, speakerMat);
    speaker.position.set(-0.1, 1.55, 0);
    group.add(speaker);

    // Red light (upper - Pedestrian STOP) - Large protruding dome
    const redGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const redLight = new THREE.Mesh(redGeo, this.mm.materials.tlRedOn);
    redLight.position.set(0, 2.85, 0.18);
    group.add(redLight);

    const redGlow = this.createSignalGlowMesh('#ff0033', 0.85);
    redGlow.position.set(0, 2.85, 0.24);
    redGlow.visible = true;
    group.add(redGlow);

    // Green light (lower - Pedestrian GO) - Large protruding dome
    const greenGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const greenLight = new THREE.Mesh(greenGeo, this.mm.materials.tlGreenOff);
    greenLight.position.set(0, 2.35, 0.18);
    group.add(greenLight);

    const greenGlow = this.createSignalGlowMesh('#00ff44', 0.85);
    greenGlow.position.set(0, 2.35, 0.24);
    greenGlow.visible = false;
    group.add(greenGlow);

    // Flashing amber beacon on top
    const beaconGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.26, 12);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: '#ff9900',
      emissive: '#ff9900',
      emissiveIntensity: 1.2,
      toneMapped: false
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 3.25, 0);
    group.add(beacon);

    const signalData = { redLight, greenLight, redGlow, greenGlow, beaconMat, speaker };
    this.pelicanSignals.push(signalData);
    this.pedestrianSignalMesh = signalData;

    group.position.set(x, 0.22, z);
    group.rotation.y = rotY;
    this.scene.add(group);
  }

  setPedestrianSignalLight(isCrossing) {
    if (!this.pelicanSignals || this.pelicanSignals.length === 0) return;
    this.pelicanSignals.forEach(sig => {
      if (isCrossing) {
        // Pedestrian GREEN ON (Cross safely!)
        sig.redLight.material = this.mm.materials.tlRedOff;
        sig.greenLight.material = this.mm.materials.tlGreenOn;
        if (sig.redGlow) sig.redGlow.visible = false;
        if (sig.greenGlow) sig.greenGlow.visible = true;
      } else {
        // Pedestrian RED ON (Wait on sidewalk)
        sig.redLight.material = this.mm.materials.tlRedOn;
        sig.greenLight.material = this.mm.materials.tlGreenOff;
        if (sig.redGlow) sig.redGlow.visible = true;
        if (sig.greenGlow) sig.greenGlow.visible = false;
      }
    });
  }

  createSimpangTrafficLights() {
    this.simpangSignalHeads = {
      setiabudi: [],
      bajuri: []
    };

    // Concrete median island at Simpang 3 center (divides Northbound & Southbound lanes)
    const medGeo = new THREE.BoxGeometry(0.7, 0.24, 4.0);
    const medIsland = new THREE.Mesh(medGeo, this.mm.materials.curb);
    medIsland.position.set(0.0, 0.12, -55.5);
    this.scene.add(medIsland);

    // 1. Setiabudi Northbound Traffic Light Mast
    // Positioned on center median at X = 0.0, Z = -55.5 (completely safe from turning vehicles on left lane!)
    // Arm extends leftward (armDirection = -1) to X = -2.8 directly over the straight lane!
    const mastNorth = this.createTrafficLightMast(0.0, -55.5, 0, 2.8, -1);
    this.simpangSignalHeads.setiabudi.push(mastNorth.overhead);
    this.simpangSignalHeads.setiabudi.push(mastNorth.post);

    // 2. Setiabudi Southbound Traffic Light Mast (East sidewalk, X = 8.5, Z = -81.0, facing North -Z)
    const mastSouth = this.createTrafficLightMast(8.5, -81.0, Math.PI, 4.5, 1);
    this.simpangSignalHeads.setiabudi.push(mastSouth.overhead);
    this.simpangSignalHeads.setiabudi.push(mastSouth.post);

    // 3. Sersan Bajuri Traffic Light Mast (Mounted on corner sidewalk curb, X = -11.0, Z = -80.5)
    const mastBajuri = this.createTrafficLightMast(-11.0, -80.5, 0.65 + Math.PI, 4.2, 1);
    this.simpangSignalHeads.bajuri.push(mastBajuri.overhead);
    this.simpangSignalHeads.bajuri.push(mastBajuri.post);

    // 4. Sersan Urip Traffic Light Post (East sidewalk near Urip mouth, X = 9.2, Z = -61.5, facing East towards Urip)
    const uripHead = this.createTrafficLightHead(9.2, 3.2, -61.5, -Math.PI / 2);
    const uPoleGeo = new THREE.CylinderGeometry(0.08, 0.1, 4.2, 10);
    const uPole = new THREE.Mesh(uPoleGeo, this.mm.materials.tlPole);
    uPole.position.set(9.2, 2.1, -61.5);
    uPole.castShadow = true;
    this.scene.add(uPole);
    this.simpangSignalHeads.bajuri.push(uripHead); // shares phase with Bajuri

    // Default initialization
    this.setSimpangLightPhase('SETIABUDI_GREEN');
  }

  createTrafficLightMast(x, z, rotY, armLength = 4.5, armDirection = 1) {
    const group = new THREE.Group();

    // Vertical mast pole (height 6.8m)
    const poleH = 6.8;
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, poleH, 12);
    const pole = new THREE.Mesh(poleGeo, this.mm.materials.tlPole);
    pole.position.y = poleH / 2;
    pole.castShadow = true;
    group.add(pole);

    // Horizontal cantilever arm extending towards street center
    const armGeo = new THREE.CylinderGeometry(0.08, 0.08, armLength, 10);
    const arm = new THREE.Mesh(armGeo, this.mm.materials.tlPole);
    arm.rotation.z = Math.PI / 2;
    arm.position.set((armLength / 2) * armDirection, poleH - 0.4, 0);
    group.add(arm);

    // Angled support brace strut
    const braceGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8);
    const brace = new THREE.Mesh(braceGeo, this.mm.materials.tlPole);
    brace.position.set(1.0 * armDirection, poleH - 1.2, 0);
    brace.rotation.z = (Math.PI / 4) * armDirection;
    group.add(brace);

    group.position.set(x, 0.22, z);
    group.rotation.y = rotY;
    this.scene.add(group);

    // Post-mounted head (at Y = 3.2 on pole)
    const postHead = this.createTrafficLightHead(x, 3.2, z, rotY);

    // Overhead suspended head (at end of arm over road)
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const headX = x + armLength * armDirection * cosY;
    const headZ = z - armLength * armDirection * sinY;
    const overheadHead = this.createTrafficLightHead(headX, poleH - 0.7, headZ, rotY);

    return { post: postHead, overhead: overheadHead };
  }

  createTrafficLightHead(x, y, z, rotY) {
    const headGroup = new THREE.Group();

    // 1. Black backplate
    const bpGeo = new THREE.BoxGeometry(0.82, 1.88, 0.04);
    const bp = new THREE.Mesh(bpGeo, this.mm.materials.tlBackplate);
    headGroup.add(bp);

    // High-contrast yellow safety border
    const borderGeo = new THREE.BoxGeometry(0.92, 1.98, 0.02);
    const border = new THREE.Mesh(borderGeo, this.mm.materials.tlBackplateBorder);
    border.position.z = -0.015;
    headGroup.add(border);

    // 2. Heavy-duty black aluminum housing body
    const houseGeo = new THREE.BoxGeometry(0.62, 1.76, 0.38);
    const house = new THREE.Mesh(houseGeo, this.mm.materials.tlHousing);
    house.position.z = 0.18;
    headGroup.add(house);

    // 3. Protruding Convex Lenses (Prominent 0.22 radius = 44cm diameter!)
    const lensRadius = 0.22;
    const lensGeo = new THREE.CylinderGeometry(lensRadius, lensRadius * 1.05, 0.10, 24);
    lensGeo.rotateX(Math.PI / 2);

    const visorGeo = new THREE.CylinderGeometry(lensRadius * 1.14, lensRadius * 1.25, 0.32, 16, 1, false, 0, Math.PI);

    // Red lens (top: y = 0.52)
    const redMesh = new THREE.Mesh(lensGeo, this.mm.materials.tlRedOff);
    redMesh.position.set(0, 0.52, 0.38);
    headGroup.add(redMesh);

    const visorRed = new THREE.Mesh(visorGeo, this.mm.materials.tlVisor);
    visorRed.position.set(0, 0.56, 0.38);
    visorRed.rotation.x = -Math.PI / 2;
    headGroup.add(visorRed);

    // Red additive halo glow plane
    const redGlow = this.createSignalGlowMesh('#ff0033', 1.25);
    redGlow.position.set(0, 0.52, 0.46);
    headGroup.add(redGlow);

    // Yellow lens (middle: y = 0.0)
    const yellowMesh = new THREE.Mesh(lensGeo, this.mm.materials.tlYellowOff);
    yellowMesh.position.set(0, 0.0, 0.38);
    headGroup.add(yellowMesh);

    const visorYellow = new THREE.Mesh(visorGeo, this.mm.materials.tlVisor);
    visorYellow.position.set(0, 0.04, 0.38);
    visorYellow.rotation.x = -Math.PI / 2;
    headGroup.add(visorYellow);

    // Yellow additive halo glow plane
    const yellowGlow = this.createSignalGlowMesh('#ffbb00', 1.25);
    yellowGlow.position.set(0, 0.0, 0.46);
    headGroup.add(yellowGlow);

    // Green lens (bottom: y = -0.52)
    const greenMesh = new THREE.Mesh(lensGeo, this.mm.materials.tlGreenOff);
    greenMesh.position.set(0, -0.52, 0.38);
    headGroup.add(greenMesh);

    const visorGreen = new THREE.Mesh(visorGeo, this.mm.materials.tlVisor);
    visorGreen.position.set(0, -0.48, 0.38);
    visorGreen.rotation.x = -Math.PI / 2;
    headGroup.add(visorGreen);

    // Green additive halo glow plane
    const greenGlow = this.createSignalGlowMesh('#00ff44', 1.25);
    greenGlow.position.set(0, -0.52, 0.46);
    headGroup.add(greenGlow);

    headGroup.position.set(x, y, z);
    headGroup.rotation.y = rotY;
    this.scene.add(headGroup);

    return { redMesh, yellowMesh, greenMesh, redGlow, yellowGlow, greenGlow };
  }

  setSimpangLightPhase(phase) {
    if (!this.simpangSignalHeads) return;

    const sHeads = this.simpangSignalHeads.setiabudi || [];
    const bHeads = this.simpangSignalHeads.bajuri || [];

    // Setiabudi phase
    let sRed = true, sYellow = false, sGreen = false;
    if (phase === 'SETIABUDI_GREEN') {
      sRed = false; sYellow = false; sGreen = true;
    } else if (phase === 'SETIABUDI_YELLOW') {
      sRed = false; sYellow = true; sGreen = false;
    }

    sHeads.forEach(head => {
      head.redMesh.material = sRed ? this.mm.materials.tlRedOn : this.mm.materials.tlRedOff;
      head.yellowMesh.material = sYellow ? this.mm.materials.tlYellowOn : this.mm.materials.tlYellowOff;
      head.greenMesh.material = sGreen ? this.mm.materials.tlGreenOn : this.mm.materials.tlGreenOff;
      if (head.redGlow) head.redGlow.visible = sRed;
      if (head.yellowGlow) head.yellowGlow.visible = sYellow;
      if (head.greenGlow) head.greenGlow.visible = sGreen;
    });

    // Bajuri & Urip phase
    let bRed = true, bYellow = false, bGreen = false;
    if (phase === 'BAJURI_GREEN') {
      bRed = false; bYellow = false; bGreen = true;
    } else if (phase === 'BAJURI_YELLOW') {
      bRed = false; bYellow = true; bGreen = false;
    }

    bHeads.forEach(head => {
      head.redMesh.material = bRed ? this.mm.materials.tlRedOn : this.mm.materials.tlRedOff;
      head.yellowMesh.material = bYellow ? this.mm.materials.tlYellowOn : this.mm.materials.tlYellowOff;
      head.greenMesh.material = bGreen ? this.mm.materials.tlGreenOn : this.mm.materials.tlGreenOff;
      if (head.redGlow) head.redGlow.visible = bRed;
      if (head.yellowGlow) head.yellowGlow.visible = bYellow;
      if (head.greenGlow) head.greenGlow.visible = bGreen;
    });
  }

  createStreetFurniture() {
    // 1. Grand Ceremonial Gateway of Universitas Pendidikan Indonesia over Jl. Perkasa
    this.createUPIGateway();

    // 2. Security Post at UPI entrance
    this.createUPISecurityPost(-15.5, 4.8);

    // 3. Directional Road Signboards (Green arterial signs)
    this.createDirectionGantry(-10.2, 5.0, 0, this.mm.materials.signToUPI);
    this.createDirectionGantry(9.8, -16.0, 0, this.mm.materials.signToLedeng);
    this.createDirectionGantry(-10.2, 24.0, Math.PI, this.mm.materials.signToBandung);
    // Overhead gantry well in advance before Simpang 3 (Z = -26.0 on West sidewalk, safe clearance)
    this.createDirectionGantry(-9.8, -26.0, 0, this.mm.materials.signToBajuri);
    this.createDirectionGantry(9.8, -54.0, 0, this.mm.materials.signToLedeng);
    this.createDirectionGantry(9.8, -60.0, Math.PI / 2, this.mm.materials.signToUrip);

    // Street Name Signs:
    // 1. "JL. DR. SETIABUDI" on East Sidewalk
    this.createStreetNameSign(9.5, 5.0, 0, this.mm.materials.signSetiabudi);
    // 2. "JL. PERKASA (AKSES UPI)" at the corner of Perkasa & Setiabudi
    this.createStreetNameSign(-9.5, 5.5, -Math.PI / 2, this.mm.materials.signPerkasa);
    // 3. "JL. SERSAN BAJURI" set safely on outer sidewalk curb of Bajuri
    this.createStreetNameSign(-22.0, -88.0, 0.65 - Math.PI / 2, this.mm.materials.signSersanBajuri);
    // 4. "JL. SERSAN URIP" at the corner of Urip
    this.createStreetNameSign(9.8, -60.0, -Math.PI / 2, this.mm.materials.signSersanUrip);
    // 5. "TERUSAN JL. SETIABUDI"
    this.createStreetNameSign(9.8, -78.0, 0, this.mm.materials.signTerusanSetiabudi);
    // 6. "JL. MOH. YAMIN"
    this.createStreetNameSign(-9.8, 73.0, -Math.PI / 2, this.mm.materials.signMohYamin);

    // Street Lamps (PJU - Penerangan Jalan Umum)
    // East side of Setiabudi (every 32m)
    for (let z = -140; z <= 130; z += 32) {
      if (Math.abs(z - (-75)) > 12 && Math.abs(z - 75) > 12) {
        this.createStreetLamp(9.2, z, Math.PI / 2);
      }
    }
    // West side of Setiabudi (avoiding intersection opening Z: [-105, -28], Perkasa Z: [0, 24], Moh Yamin Z: [62, 88])
    for (let z = -140; z <= 130; z += 32) {
      if (z >= -105 && z <= -28) continue; // Leaves entire Sersan Bajuri branch and turning path unobstructed!
      if (z >= 0 && z <= 24) continue;
      if (Math.abs(z - 75) < 14) continue;
      this.createStreetLamp(-9.2, z, -Math.PI / 2);
    }
    // Jl. Perkasa street lamps (sloping upwards with road)
    for (let x = -25; x >= -85; x -= 28) {
      const dist = -8 - x;
      const elev = (dist / 97) * 1.5;
      this.createStreetLamp(x, 4.8, 0, elev);
    }

    // Concrete utility poles with wire crossarms
    for (let z = -140; z <= 140; z += 40) {
      if (Math.abs(z - (-75)) > 15 && Math.abs(z - 75) > 15) {
        this.createUtilityPole(10.8, z);
      }
    }
  }

  createDirectionGantry(x, z, rotY, material) {
    const group = new THREE.Group();

    // Steel support pole
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.4, 10);
    const pole = new THREE.Mesh(poleGeo, this.mm.materials.metalPole);
    pole.position.y = 2.7;
    group.add(pole);

    // Overhanging arm
    const armGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8);
    const arm = new THREE.Mesh(armGeo, this.mm.materials.metalPole);
    arm.position.set(1.4, 5.2, 0);
    arm.rotation.z = Math.PI / 2;
    group.add(arm);

    // Sign plate
    const plateGeo = new THREE.BoxGeometry(3.6, 1.3, 0.06);
    const plate = new THREE.Mesh(plateGeo, [
      this.mm.materials.metalPole,
      this.mm.materials.metalPole,
      this.mm.materials.metalPole,
      this.mm.materials.metalPole,
      material,
      material
    ]);
    plate.position.set(1.6, 4.8, 0);
    group.add(plate);

    group.position.set(x, 0.22, z);
    group.rotation.y = rotY;
    this.scene.add(group);
  }

  createStreetNameSign(x, z, rotY, material) {
    const group = new THREE.Group();
    const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.2, 10);
    const post = new THREE.Mesh(postGeo, this.mm.materials.metalPole);
    post.position.y = 1.6;
    group.add(post);

    const plateGeo = new THREE.BoxGeometry(1.6, 0.45, 0.04);
    const plate = new THREE.Mesh(plateGeo, [
      this.mm.materials.metalPole,
      this.mm.materials.metalPole,
      this.mm.materials.metalPole,
      this.mm.materials.metalPole,
      material,
      material
    ]);
    plate.position.set(0, 2.8, 0);
    group.add(plate);

    group.position.set(x, 0.22, z);
    group.rotation.y = rotY;
    this.scene.add(group);
  }

  createStreetLamp(x, z, rotY = 0, elev = 0) {
    const group = new THREE.Group();

    // Vertical metal pole (height 6.5m)
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 6.5, 10);
    const pole = new THREE.Mesh(poleGeo, this.mm.materials.metalPole);
    pole.position.y = 3.25;
    pole.castShadow = true;
    group.add(pole);

    // Curved horizontal overhanging arm extending towards street (length 2.2m)
    const armGeo = new THREE.CylinderGeometry(0.05, 0.07, 2.2, 8);
    const arm = new THREE.Mesh(armGeo, this.mm.materials.metalPole);
    arm.position.set(0.9, 6.3, 0);
    arm.rotation.z = Math.PI / 2.3;
    group.add(arm);

    // Lamp fixture head
    const fixtureGeo = new THREE.BoxGeometry(0.8, 0.18, 0.35);
    const fixture = new THREE.Mesh(fixtureGeo, this.mm.materials.streetLampFixture);
    fixture.position.set(1.9, 6.6, 0);
    group.add(fixture);

    // Glowing LED luminaire underside
    const bulbGeo = new THREE.PlaneGeometry(0.65, 0.25);
    const bulb = new THREE.Mesh(bulbGeo, this.mm.materials.streetLampBulb);
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(1.9, 6.5, 0);
    group.add(bulb);

    group.position.set(x, 0.22 + elev, z);
    group.rotation.y = rotY;
    this.scene.add(group);
  }

  createUtilityPole(x, z) {
    const group = new THREE.Group();

    // Concrete utility pole (height 8.5m)
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 8.5, 8);
    const pole = new THREE.Mesh(poleGeo, this.mm.materials.metalPole);
    pole.position.y = 4.25;
    group.add(pole);

    // Upper crossarm (wooden/steel horizontal beam)
    const arm1Geo = new THREE.BoxGeometry(0.12, 0.12, 2.4);
    const arm1 = new THREE.Mesh(arm1Geo, this.mm.materials.metalPole);
    arm1.position.set(0, 7.8, 0);
    group.add(arm1);

    // Lower crossarm
    const arm2Geo = new THREE.BoxGeometry(0.12, 0.12, 1.8);
    const arm2 = new THREE.Mesh(arm2Geo, this.mm.materials.metalPole);
    arm2.position.set(0, 6.6, 0);
    group.add(arm2);

    // Insulator pins
    const insGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.2, 6);
    const insMat = this.mm.materials.buildingWallWhite;
    [-1.0, 0, 1.0].forEach(offsetZ => {
      const ins = new THREE.Mesh(insGeo, insMat);
      ins.position.set(0, 7.95, offsetZ);
      group.add(ins);
    });
    [-0.7, 0.7].forEach(offsetZ => {
      const ins = new THREE.Mesh(insGeo, insMat);
      ins.position.set(0, 6.75, offsetZ);
      group.add(ins);
    });

    group.position.set(x, 0.22, z);
    this.scene.add(group);
  }

  createUPIGateway() {
    const group = new THREE.Group();

    // Two monumental maroon-and-gold brick pillars spanning across Jl. Perkasa (Z = 5.0 to 19.0)
    const pillarGeo = new THREE.BoxGeometry(1.8, 7.8, 1.8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: '#800000', roughness: 0.4 }); // UPI Maroon

    // North Pillar
    const pNorth = new THREE.Mesh(pillarGeo, pillarMat);
    pNorth.position.set(-13.0, 3.9, 5.2);
    group.add(pNorth);

    // South Pillar
    const pSouth = new THREE.Mesh(pillarGeo, pillarMat);
    pSouth.position.set(-13.0, 3.9, 18.8);
    group.add(pSouth);

    // Gold decorative caps on pillars
    const capGeo = new THREE.BoxGeometry(2.1, 0.4, 2.1);
    const goldMat = new THREE.MeshStandardMaterial({ color: '#f5c518', roughness: 0.3, metalness: 0.7 });
    const capN = new THREE.Mesh(capGeo, goldMat);
    capN.position.set(-13.0, 7.9, 5.2);
    group.add(capN);

    const capS = new THREE.Mesh(capGeo, goldMat);
    capS.position.set(-13.0, 7.9, 18.8);
    group.add(capS);

    // Overhead Arch Beam spanning 14.5m across Jl. Perkasa
    const archBeamGeo = new THREE.BoxGeometry(1.2, 1.8, 14.5);
    const archBeam = new THREE.Mesh(archBeamGeo, pillarMat);
    archBeam.position.set(-13.0, 7.2, 12.0);
    group.add(archBeam);

    // Large UPI Grand Signboard facing Setiabudi (East +X)
    const signGeo = new THREE.PlaneGeometry(12.5, 2.8);
    const signMesh = new THREE.Mesh(signGeo, this.mm.materials.upiGate);
    signMesh.rotation.y = Math.PI / 2; // Facing +X (towards Setiabudi road)
    signMesh.position.set(-12.35, 7.2, 12.0);
    group.add(signMesh);

    // Signboard facing West (exiting campus)
    const signMeshWest = new THREE.Mesh(signGeo, this.mm.materials.upiGate);
    signMeshWest.rotation.y = -Math.PI / 2;
    signMeshWest.position.set(-13.65, 7.2, 12.0);
    group.add(signMeshWest);

    this.scene.add(group);
  }

  createUPISecurityPost(x, z) {
    const group = new THREE.Group();

    // Security booth
    const boothGeo = new THREE.BoxGeometry(2.6, 3.0, 2.2);
    const boothMat = new THREE.MeshLambertMaterial({ color: '#f8f9fa' });
    const booth = new THREE.Mesh(boothGeo, boothMat);
    booth.position.y = 1.5;
    group.add(booth);

    // Tinted windows
    const winGeo = new THREE.PlaneGeometry(1.8, 1.0);
    const win = new THREE.Mesh(winGeo, this.mm.materials.carGlass);
    win.position.set(0, 1.8, 1.11);
    group.add(win);

    // Red roof
    const roofGeo = new THREE.BoxGeometry(3.0, 0.35, 2.6);
    const roofMat = new THREE.MeshLambertMaterial({ color: '#800000' });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 3.15;
    group.add(roof);

    // Sign "POS SATPAM UPI"
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 256;
    signCanvas.height = 64;
    const sCtx = signCanvas.getContext('2d');
    sCtx.fillStyle = '#800000';
    sCtx.fillRect(0, 0, 256, 64);
    sCtx.fillStyle = '#ffffff';
    sCtx.font = 'bold 20px "Outfit", sans-serif';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText('POS SATPAM UPI', 128, 32);

    const sTex = new THREE.CanvasTexture(signCanvas);
    const sMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: sTex }));
    sMesh.position.set(0, 2.6, 1.12);
    group.add(sMesh);

    // Barrier gate arm (black & yellow stripes)
    const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.8, 8);
    const arm = new THREE.Mesh(armGeo, this.mm.materials.curb);
    arm.position.set(1.4, 0.9, 1.2);
    arm.rotation.z = Math.PI / 2;
    group.add(arm);

    group.position.set(x, 0.22, z);
    this.scene.add(group);
  }

  createBuildings() {
    // 1. East Side Shophouses (Ruko) & Establishments (X > 13)
    let signIndex = 0;
    for (let z = -140; z <= 130; z += 18) {
      // Skip openings for Jl. Sersan Urip (Z ~ -50 to -90) and Jl. Moh Yamin East (Z ~ 75)
      if ((z > -90 && z < -50) || Math.abs(z - 75) < 14) continue;

      const width = 14;
      const depth = 16;
      const floors = Math.floor(Math.random() * 2) + 2; // 2 or 3 floors
      const height = floors * 3.4;

      const shopSignTexture = this.mm.textures.shopSigns[signIndex % this.mm.textures.shopSigns.length];
      signIndex++;

      this.createShophouse(
        21, // X center
        z,  // Z center
        width,
        depth,
        height,
        -Math.PI / 2, // Facing West towards Setiabudi
        shopSignTexture
      );
    }

    // 2. West Side Buildings - North of Perkasa (X < -13, Z < 0)
    for (let z = -140; z <= -8; z += 18) {
      // Skip opening for Jl. Sersan Bajuri mouth (Z ~ -66 to -115) and custom residential houses (Z ~ -64 to -48)
      if (z > -115 && z < -46) continue;

      const width = 14;
      const depth = 16;
      const height = (Math.floor(Math.random() * 2) + 2) * 3.4;
      this.createShophouse(
        -21,
        z,
        width,
        depth,
        height,
        Math.PI / 2, // Facing East towards Setiabudi
        this.mm.textures.shopSigns[signIndex % this.mm.textures.shopSigns.length]
      );
      signIndex++;
    }

    // 2b. Gedung Rumah & Bangunan Residensial in former stub road area (Z: -48 to -64)
    this.createWestBajuriHouses();

    // 2c. Bangunan & Gedung Rumah along Jl. Sersan Bajuri (Left & Right Sides)
    this.createSersanBajuriBuildings();

    // 3. West Side Buildings - South of Perkasa (X < -13, Z > 22)
    for (let z = 26; z <= 130; z += 18) {
      // Skip opening for Jl. Moh Yamin (Z ~ 75)
      if (Math.abs(z - 75) < 14) continue;

      const width = 14;
      const depth = 16;
      const height = (Math.floor(Math.random() * 2) + 2) * 3.4;
      this.createShophouse(
        -21,
        z,
        width,
        depth,
        height,
        Math.PI / 2,
        this.mm.textures.shopSigns[signIndex % this.mm.textures.shopSigns.length]
      );
      signIndex++;
    }

    // 4. KAWASAN KAMPUS UNIVERSITAS PENDIDIKAN INDONESIA (UPI) ALONG JL. PERKASA
    this.createUPICampusZone();
  }

  createUPICampusZone() {
    // North side of Perkasa: FPMIPA & Gedung Kuliah Bersama UPI
    this.createUPIFacultyBuilding(-36, -4, 22, 14, 16, 0.45, 'FAKULTAS PENDIDIKAN MIPA (FPMIPA UPI)');
    this.createUPIFacultyBuilding(-72, -6, 26, 16, 18, 0.95, 'GEDUNG KULIAH BERSAMA & LAB UPI');

    // South side of Perkasa: Asrama Mahasiswa UPI & PKM
    this.createUPIDormitoryBuilding(-36, 28, 22, 14, 14, 0.45, 'ASRAMA MAHASISWA BUMI SILIWANGI');
    this.createUPIDormitoryBuilding(-72, 30, 26, 15, 14, 0.95, 'PUSAT KEGIATAN MAHASISWA (PKM UPI)');

    // Iconic silhouette of Villa Isola (UPI's world-famous heritage landmark building)
    this.createVillaIsola(-105, 42, 1.4);
  }

  createUPIFacultyBuilding(x, z, width, depth, height, elev, label) {
    const group = new THREE.Group();

    // Modernist academic building
    const wallGeo = new THREE.BoxGeometry(width, height, depth);
    const wallMat = new THREE.MeshLambertMaterial({ color: '#e2e8f0' });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = height / 2;
    group.add(wall);

    // Blue accent panels (UPI Academic theme)
    const panelGeo = new THREE.BoxGeometry(width + 0.1, 0.8, depth + 0.1);
    const blueMat = new THREE.MeshLambertMaterial({ color: '#1e3a8a' });
    for (let y = 3.6; y < height; y += 3.6) {
      const panel = new THREE.Mesh(panelGeo, blueMat);
      panel.position.y = y;
      group.add(panel);
    }

    // Horizontal continuous ribbon windows
    const winGeo = new THREE.PlaneGeometry(width * 0.9, 1.2);
    for (let y = 2.0; y < height - 1; y += 3.6) {
      const win = new THREE.Mesh(winGeo, this.mm.materials.windowGlass);
      win.position.set(0, y, depth / 2 + 0.06);
      group.add(win);
      this.nightWindows.push(win);
    }

    // Rooftop sign with Faculty name
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 96;
    const ctx = signCanvas.getContext('2d');
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, 0, 512, 96);
    ctx.strokeStyle = '#f5c518';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 504, 88);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 256, 48);

    const sTex = new THREE.CanvasTexture(signCanvas);
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.7, 1.4), new THREE.MeshBasicMaterial({ map: sTex }));
    signMesh.position.set(0, height + 1.0, depth / 2 + 0.08);
    group.add(signMesh);

    group.position.set(x, elev, z);
    this.scene.add(group);
  }

  createUPIDormitoryBuilding(x, z, width, depth, height, elev, label) {
    const group = new THREE.Group();

    // Asrama Mahasiswa (Multi-unit student residence)
    const wallGeo = new THREE.BoxGeometry(width, height, depth);
    const wallMat = new THREE.MeshLambertMaterial({ color: '#fef3c7' });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = height / 2;
    group.add(wall);

    // Terracotta roof
    const roofH = 2.4;
    const roofGeo = new THREE.ConeGeometry(Math.max(width, depth) * 0.75, roofH, 4);
    const roof = new THREE.Mesh(roofGeo, this.mm.materials.roofTileGenteng);
    roof.position.y = height + roofH / 2;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(width / depth, 1, 1);
    group.add(roof);

    // Windows
    for (let y = 2.5; y < height - 1; y += 3.0) {
      [-width * 0.35, -width * 0.12, width * 0.12, width * 0.35].forEach(wx => {
        const wMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), this.mm.materials.windowGlass);
        wMesh.position.set(wx, y, depth / 2 + 0.06);
        group.add(wMesh);
        this.nightWindows.push(wMesh);
      });
    }

    group.position.set(x, elev, z);
    this.scene.add(group);
  }

  createVillaIsola(x, z, elev = 0) {
    // Iconic Villa Isola Art-Deco tiered architectural landmark of UPI
    const group = new THREE.Group();
    const isolaMat = new THREE.MeshLambertMaterial({ color: '#f1f5f9' });

    // Tier 1 Base
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(16, 18, 5, 20), isolaMat);
    t1.position.y = 2.5;
    group.add(t1);

    // Tier 2 Middle
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(12, 14, 5, 20), isolaMat);
    t2.position.y = 7.5;
    group.add(t2);

    // Tier 3 Upper Observatory
    const t3 = new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 4, 20), isolaMat);
    t3.position.y = 12.0;
    group.add(t3);

    // Central Art-Deco Tower / Cupola
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.0, 5, 16), isolaMat);
    tower.position.y = 16.5;
    group.add(tower);

    // Flagpole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 8), this.mm.materials.metalPole);
    pole.position.y = 21.0;
    group.add(pole);

    const flagGeo = new THREE.PlaneGeometry(1.5, 1.0);
    const flagMat = new THREE.MeshBasicMaterial({ color: '#dd0000', side: THREE.DoubleSide });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(0.75, 22.5, 0);
    group.add(flag);

    // Villa Isola Banner
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 512;
    labelCanvas.height = 128;
    const lCtx = labelCanvas.getContext('2d');
    lCtx.fillStyle = '#800000';
    lCtx.fillRect(0, 0, 512, 128);
    lCtx.fillStyle = '#ffffff';
    lCtx.font = 'bold 36px "Outfit", sans-serif';
    lCtx.textAlign = 'center';
    lCtx.textBaseline = 'middle';
    lCtx.fillText('GEDUNG VILLA ISOLA UPI', 256, 50);
    lCtx.font = '600 20px "Plus Jakarta Sans", sans-serif';
    lCtx.fillStyle = '#f5c518';
    lCtx.fillText('HERITAGE LANDMARK KAMPUS BUMI SILIWANGI', 256, 92);

    const lTex = new THREE.CanvasTexture(labelCanvas);
    const lMesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: lTex }));
    lMesh.position.set(0, 5.0, 18.2);
    group.add(lMesh);

    group.position.set(x, elev, z);
    this.scene.add(group);
  }

  createShophouse(x, z, width, depth, height, rotY, signTexture) {
    const group = new THREE.Group();

    // Main wall body
    const wallMats = [
      this.mm.materials.buildingWallWhite,
      this.mm.materials.buildingWallBeige,
      this.mm.materials.buildingWallGrey,
      this.mm.materials.buildingWallBlue
    ];
    const wallMat = wallMats[Math.floor(Math.random() * wallMats.length)];

    const bodyGeo = new THREE.BoxGeometry(width, height, depth);
    const body = new THREE.Mesh(bodyGeo, wallMat);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Ground floor roll-up shutter / storefront
    const shutterGeo = new THREE.PlaneGeometry(width * 0.75, 2.7);
    const shutter = new THREE.Mesh(shutterGeo, this.mm.materials.shutterDoor);
    shutter.position.set(0, 1.45, depth / 2 + 0.05);
    group.add(shutter);

    // Store awning over entrance
    const awningGeo = new THREE.BoxGeometry(width * 0.85, 0.15, 1.6);
    const awningMat = new THREE.MeshLambertMaterial({
      color: Math.random() > 0.5 ? '#b02a37' : '#0d6efd'
    });
    const awning = new THREE.Mesh(awningGeo, awningMat);
    awning.position.set(0, 3.1, depth / 2 + 0.8);
    awning.rotation.x = 0.12;
    group.add(awning);

    // Commercial Billboard / Sign above awning
    if (signTexture) {
      const signMat = new THREE.MeshBasicMaterial({ map: signTexture });
      const signGeo = new THREE.PlaneGeometry(width * 0.7, 1.4);
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(0, 4.3, depth / 2 + 0.08);
      group.add(sign);
    }

    // Upper floor windows with glowing panes for night mode
    for (let floorY = 5.8; floorY < height - 1.2; floorY += 3.0) {
      [-width * 0.25, width * 0.25].forEach(winX => {
        const winGeo = new THREE.PlaneGeometry(2.2, 1.6);
        const win = new THREE.Mesh(winGeo, this.mm.materials.windowGlass);
        win.position.set(winX, floorY, depth / 2 + 0.06);
        group.add(win);
        this.nightWindows.push(win);
      });
    }

    // Parapet roof edge
    const parapetGeo = new THREE.BoxGeometry(width + 0.4, 0.7, depth + 0.4);
    const parapet = new THREE.Mesh(parapetGeo, this.mm.materials.buildingWallGrey);
    parapet.position.y = height + 0.35;
    group.add(parapet);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    this.scene.add(group);
  }

  createHouseWithRoof(x, z, width, depth, wallHeight, rotY, elev = 0) {
    const group = new THREE.Group();

    // House walls
    const wallGeo = new THREE.BoxGeometry(width, wallHeight, depth);
    const wall = new THREE.Mesh(wallGeo, this.mm.materials.buildingWallBeige);
    wall.position.y = wallHeight / 2;
    wall.castShadow = true;
    group.add(wall);

    // Indonesian Hip Roof (Limasan genteng)
    const roofH = 2.6;
    const roofGeo = new THREE.ConeGeometry(Math.max(width, depth) * 0.75, roofH, 4);
    const roof = new THREE.Mesh(roofGeo, this.mm.materials.roofTileGenteng);
    roof.position.y = wallHeight + roofH / 2;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(width / depth, 1, 1);
    roof.castShadow = true;
    group.add(roof);

    // Front yard wall / pagar
    const fenceGeo = new THREE.BoxGeometry(width + 2, 1.2, 0.3);
    const fence = new THREE.Mesh(fenceGeo, this.mm.materials.buildingWallGrey);
    fence.position.set(0, 0.6, depth / 2 + 2.5);
    group.add(fence);

    group.position.set(x, elev, z);
    group.rotation.y = rotY;
    this.scene.add(group);
  }

  createWestBajuriHouses() {
    // Replaces the circled stub road at Z = -58 with authentic Bandung residential houses
    // Strictly positioned behind Setiabudi sidewalk (X <= -13.0) and south of Sersan Bajuri curve (Z >= -56.5)

    // 1. Modern Tropical Residence (House 1 - Setiabudi No. 288)
    this.createDetailedResidentialHouse(
      -20.5,
      -47.2,
      5.8,
      8.6,
      2,
      Math.PI / 2, // Facing East towards Setiabudi
      {
        frontX: -13.0,
        wallMat: this.mm.materials.buildingWallBeige,
        accentColor: '#4e342e',
        roofMat: this.mm.materials.roofTileGenteng
      }
    );

    // 2. Contemporary Minimalist Residence (House 2 - Setiabudi No. 290)
    this.createDetailedResidentialHouse(
      -20.5,
      -53.4,
      5.8,
      8.6,
      2,
      Math.PI / 2, // Facing East towards Setiabudi
      {
        frontX: -13.0,
        wallMat: this.mm.materials.buildingWallWhite,
        accentColor: '#263238',
        roofMat: this.mm.materials.roofTileGenteng
      }
    );

    // 3. Deep-lot Family Pavilion Residence (House 3 - situated in the quiet rear courtyard)
    this.createDetailedResidentialHouse(
      -31.5,
      -50.5,
      9.0,
      7.5,
      2,
      Math.PI / 2, // Facing East into private driveway courtyard
      {
        frontX: -23.5,
        wallMat: this.mm.materials.buildingWallWhite,
        accentColor: '#37474f',
        roofMat: this.mm.materials.roofTileGenteng
      }
    );

    // 4. Landscaped Corner Park & Angled Boundary Wall (Taman Sudut Simpang Sersan Bajuri)
    // Seamlessly buffers the corner between Setiabudi and Sersan Bajuri without encroaching the road
    const cornerGroup = new THREE.Group();

    // Corner lawn patch
    const cornerLawn = new THREE.Mesh(
      new THREE.BoxGeometry(7.5, 0.14, 7.5),
      new THREE.MeshLambertMaterial({ color: '#2d6a4f' })
    );
    cornerLawn.position.set(-17.0, 0.07, -59.8);
    cornerGroup.add(cornerLawn);

    // Angled decorative stone perimeter wall following street curve (from X=-13.0, Z=-56.5 to X=-19.0, Z=-63.0)
    const wallLen = 9.0;
    const wallAngle = Math.atan2(-63.0 - (-56.5), -19.0 - (-13.0));
    const angledWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallLen, 1.1, 0.25),
      new THREE.MeshStandardMaterial({ color: '#455a64', roughness: 0.7 })
    );
    angledWall.position.set(-16.0, 0.55, -59.75);
    angledWall.rotation.y = -wallAngle;
    cornerGroup.add(angledWall);

    // Decorative stone pillars along the corner boundary
    const pillarMat = new THREE.MeshStandardMaterial({ color: '#263238', roughness: 0.6 });
    [-wallLen / 2, 0, wallLen / 2].forEach(d => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.35, 0.4), pillarMat);
      p.position.set(-16.0 + Math.cos(-wallAngle) * d, 0.67, -59.75 - Math.sin(-wallAngle) * d);
      cornerGroup.add(p);
    });

    this.scene.add(cornerGroup);

    // Ornamental trees inside corner park and yards (safely set back from road curb)
    this.createTree(-16.5, -58.5, 'ketapang');
    this.createTree(-18.5, -61.5, 'palm');
    this.createTree(-27.0, -50.5, 'ketapang');
  }

  createDetailedResidentialHouse(x, z, width, depth, stories = 2, rotY = 0, options = {}) {
    const group = new THREE.Group();
    const wallHeight = stories * 3.2;

    const cpW = width * 0.46;
    const cpD = 3.6;

    // 1. Foundation / Plinth
    const plinthH = 0.22;
    const plinthGeo = new THREE.BoxGeometry(width, plinthH, depth);
    const plinth = new THREE.Mesh(plinthGeo, this.mm.materials.buildingWallGrey);
    plinth.position.y = plinthH / 2;
    group.add(plinth);

    // 2. Main Wall Body
    const wallMats = [
      this.mm.materials.buildingWallWhite,
      this.mm.materials.buildingWallBeige,
      this.mm.materials.buildingWallGrey
    ];
    const mainWallMat = options.wallMat || wallMats[Math.floor(Math.random() * wallMats.length)];
    const bodyGeo = new THREE.BoxGeometry(width, wallHeight, depth);
    const body = new THREE.Mesh(bodyGeo, mainWallMat);
    body.position.y = plinthH + wallHeight / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Architectural accent panel (wood slats / charcoal texture) on one side
    const accentW = width * 0.42;
    const accentGeo = new THREE.BoxGeometry(accentW, wallHeight * 0.95, 0.15);
    const accentMat = new THREE.MeshStandardMaterial({
      color: options.accentColor || '#3e2723',
      roughness: 0.7,
      metalness: 0.1
    });
    const accent = new THREE.Mesh(accentGeo, accentMat);
    accent.position.set(-width * 0.25, plinthH + wallHeight / 2, depth / 2 + 0.08);
    group.add(accent);

    // 3. Limasan / Hip Roof (Indonesian clay genteng)
    const roofH = 2.6;
    const roofOverhang = 0.5;
    const roofGeo = new THREE.ConeGeometry(Math.max(width, depth) * 0.76, roofH, 4);
    const roofMat = options.roofMat || this.mm.materials.roofTileGenteng;
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = plinthH + wallHeight + roofH / 2;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set((width + roofOverhang) / Math.max(width, depth), 1, (depth + roofOverhang) / Math.max(width, depth));
    roof.castShadow = true;
    group.add(roof);

    // Fascia board under roof eaves
    const fasciaGeo = new THREE.BoxGeometry(width + roofOverhang, 0.16, depth + roofOverhang);
    const fasciaMat = new THREE.MeshLambertMaterial({ color: '#2c3034' });
    const fascia = new THREE.Mesh(fasciaGeo, fasciaMat);
    fascia.position.y = plinthH + wallHeight + 0.08;
    group.add(fascia);

    // 4. Ground Floor Porch (Teras Depan)
    const porchW = width * 0.48;
    const porchD = 1.8;
    const porchFloor = new THREE.Mesh(
      new THREE.BoxGeometry(porchW, 0.16, porchD),
      this.mm.materials.sidewalk
    );
    porchFloor.position.set(width * 0.24, 0.08, depth / 2 + porchD / 2);
    group.add(porchFloor);

    // Porch canopy
    const canopyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(porchW + 0.2, 0.12, porchD + 0.2),
      new THREE.MeshLambertMaterial({ color: '#222629' })
    );
    canopyMesh.position.set(width * 0.24, 3.0, depth / 2 + porchD / 2);
    group.add(canopyMesh);

    // Porch pillars
    [-porchW / 2 + 0.15, porchW / 2 - 0.15].forEach(px => {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.9, 8),
        this.mm.materials.metalPole
      );
      pillar.position.set(width * 0.24 + px, 1.45, depth / 2 + porchD - 0.12);
      group.add(pillar);
    });

    // Front entrance door
    const doorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 2.2),
      new THREE.MeshStandardMaterial({ color: '#4e342e', roughness: 0.6 })
    );
    doorMesh.position.set(width * 0.24, plinthH + 1.15, depth / 2 + 0.05);
    group.add(doorMesh);

    // 5. 2nd Floor Balcony with modern railing
    if (stories >= 2) {
      const balcW = width * 0.46;
      const balcD = 1.4;
      const balcSlab = new THREE.Mesh(
        new THREE.BoxGeometry(balcW, 0.18, balcD),
        this.mm.materials.buildingWallGrey
      );
      balcSlab.position.set(-width * 0.24, 3.3, depth / 2 + balcD / 2);
      group.add(balcSlab);

      // Balcony black steel railing
      const railMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5, metalness: 0.6 });
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(balcW, 0.04, 0.04), railMat);
      topRail.position.set(-width * 0.24, 4.25, depth / 2 + balcD);
      group.add(topRail);

      // Glass railing infill
      const glassRail = new THREE.Mesh(new THREE.PlaneGeometry(balcW - 0.15, 0.8), this.mm.materials.windowGlass);
      glassRail.position.set(-width * 0.24, 3.85, depth / 2 + balcD);
      group.add(glassRail);

      // Sliding balcony door
      const balcDoor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.0), this.mm.materials.windowGlass);
      balcDoor.position.set(-width * 0.24, 4.4, depth / 2 + 0.05);
      group.add(balcDoor);
      this.nightWindows.push(balcDoor);
    }

    // Windows (Ground floor & Upper floor)
    const win1 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), this.mm.materials.windowGlass);
    win1.position.set(-width * 0.25, plinthH + 1.5, depth / 2 + 0.18);
    group.add(win1);
    this.nightWindows.push(win1);

    if (stories >= 2) {
      const win2 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), this.mm.materials.windowGlass);
      win2.position.set(width * 0.24, plinthH + 4.6, depth / 2 + 0.05);
      group.add(win2);
      this.nightWindows.push(win2);
    }

    // 6. Carport & Pergola
    const cpFloor = new THREE.Mesh(
      new THREE.BoxGeometry(cpW, 0.06, cpD),
      this.mm.materials.asphalt
    );
    cpFloor.position.set(-width * 0.24, 0.03, depth / 2 + cpD / 2);
    group.add(cpFloor);

    // Carport steel pergola trellis
    const pergolaMat = new THREE.MeshStandardMaterial({ color: '#263238', metalness: 0.7, roughness: 0.4 });
    [-cpW / 2 + 0.12, cpW / 2 - 0.12].forEach(postX => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), pergolaMat);
      post.position.set(-width * 0.24 + postX, 1.3, depth / 2 + cpD - 0.12);
      group.add(post);
    });
    for (let bz = depth / 2 + 0.8; bz <= depth / 2 + cpD; bz += 0.8) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(cpW + 0.1, 0.06, 0.06), pergolaMat);
      beam.position.set(-width * 0.24, 2.6, bz);
      group.add(beam);
    }

    // 7. Front Perimeter Wall & Gate (strictly bounded to house width)
    const fenceMat = new THREE.MeshStandardMaterial({ color: '#455a64', roughness: 0.7 });
    const fWall = new THREE.Mesh(new THREE.BoxGeometry(width, 1.1, 0.22), fenceMat);
    fWall.position.set(0, 0.55, depth / 2 + cpD + 0.15);
    group.add(fWall);

    // Gate pillars
    const gatePostMat = new THREE.MeshStandardMaterial({ color: '#263238', roughness: 0.6 });
    [-width * 0.42, 0, width * 0.42].forEach(gpx => {
      const gPost = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.35, 0.35), gatePostMat);
      gPost.position.set(gpx, 0.67, depth / 2 + cpD + 0.15);
      group.add(gPost);
    });

    // Set position ensuring front fence is at options.frontX (if provided)
    const posX = (options.frontX !== undefined && rotY === Math.PI / 2)
      ? (options.frontX - (depth / 2 + cpD + 0.15))
      : x;

    group.position.set(posX, 0, z);
    group.rotation.y = rotY;
    this.scene.add(group);
    return group;
  }

  createSersanBajuriBuildings() {
    // Residential buildings and shophouses along both sides of Jl. Sersan Bajuri
    // Road orientation: angle 0.65 rad. Center: (-36, 0, -102).
    const bajuriBldgGroup = new THREE.Group();
    bajuriBldgGroup.position.set(-36, 0, -102);
    bajuriBldgGroup.rotation.y = 0.65 + Math.PI;

    // --- South-West Side (Left Side, local +X = 16.0m behind sidewalk) ---
    // Facing road (rotation.y = -Math.PI / 2)
    const leftHouses = [
      { z: -14, w: 12, d: 13, h: 2, mat: this.mm.materials.buildingWallBeige },
      { z: 10, w: 13, d: 14, h: 2, mat: this.mm.materials.buildingWallWhite },
      { z: 34, w: 12, d: 13, h: 2, mat: this.mm.materials.buildingWallGrey }
    ];
    for (const item of leftHouses) {
      const hMesh = this.createBajuriHouseModel(item.w, item.d, item.h, item.mat);
      hMesh.position.set(16.5, 0, item.z);
      hMesh.rotation.y = -Math.PI / 2;
      bajuriBldgGroup.add(hMesh);
    }

    // --- North-East Side (Right Side, local -X = -16.0m behind sidewalk) ---
    // Facing road (rotation.y = Math.PI / 2)
    const rightHouses = [
      { z: -8, w: 12, d: 13, h: 2, mat: this.mm.materials.buildingWallWhite },
      { z: 14, w: 13, d: 14, h: 2, mat: this.mm.materials.buildingWallBeige },
      { z: 36, w: 12, d: 13, h: 2, mat: this.mm.materials.buildingWallGrey }
    ];
    for (const item of rightHouses) {
      const hMesh = this.createBajuriHouseModel(item.w, item.d, item.h, item.mat);
      hMesh.position.set(-16.5, 0, item.z);
      hMesh.rotation.y = Math.PI / 2;
      bajuriBldgGroup.add(hMesh);
    }

    // Street Lamps (PJU) along Sersan Bajuri sidewalks (Left & Right)
    for (let lz = -36; lz <= 40; lz += 26) {
      // Left sidewalk lamp (pole at X = 7.5, arm points towards road -X)
      const lampL = this.createBajuriPjuLamp();
      lampL.position.set(7.5, 0.22, lz);
      lampL.rotation.y = Math.PI; // arm points -X (towards road)
      bajuriBldgGroup.add(lampL);

      // Right sidewalk lamp (pole at X = -7.5, arm points towards road +X)
      const lampR = this.createBajuriPjuLamp();
      lampR.position.set(-7.5, 0.22, lz);
      lampR.rotation.y = 0; // arm points +X (towards road)
      bajuriBldgGroup.add(lampR);
    }

    // Shady trees along Sersan Bajuri sidewalks
    for (let tz = -30; tz <= 38; tz += 22) {
      const treeL = this.createTreeModel('ketapang');
      treeL.position.set(7.6, 0.22, tz);
      bajuriBldgGroup.add(treeL);

      const treeR = this.createTreeModel('ketapang');
      treeR.position.set(-7.6, 0.22, tz + 11);
      bajuriBldgGroup.add(treeR);
    }

    this.scene.add(bajuriBldgGroup);
  }

  createBajuriHouseModel(width, depth, stories = 2, wallMat) {
    const group = new THREE.Group();
    const wallHeight = stories * 3.3;

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, wallHeight, depth),
      wallMat || this.mm.materials.buildingWallWhite
    );
    body.position.y = wallHeight / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Hip Roof (Genteng)
    const roofH = 2.6;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(width, depth) * 0.78, roofH, 4),
      this.mm.materials.roofTileGenteng
    );
    roof.position.y = wallHeight + roofH / 2;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set((width + 0.8) / Math.max(width, depth), 1, (depth + 0.8) / Math.max(width, depth));
    roof.castShadow = true;
    group.add(roof);

    // Balcony / Porch canopy
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.55, 0.16, 2.0),
      new THREE.MeshLambertMaterial({ color: '#2c3034' })
    );
    canopy.position.set(0, 3.2, depth / 2 + 1.0);
    group.add(canopy);

    // Door
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 2.2),
      new THREE.MeshStandardMaterial({ color: '#3e2723', roughness: 0.6 })
    );
    door.position.set(0, 1.15, depth / 2 + 0.05);
    group.add(door);

    // Front Windows
    [-width * 0.28, width * 0.28].forEach(wx => {
      const win1 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), this.mm.materials.windowGlass);
      win1.position.set(wx, 1.6, depth / 2 + 0.05);
      group.add(win1);
      this.nightWindows.push(win1);

      if (stories >= 2) {
        const win2 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), this.mm.materials.windowGlass);
        win2.position.set(wx, 4.6, depth / 2 + 0.05);
        group.add(win2);
        this.nightWindows.push(win2);
      }
    });

    // Front yard fence
    const fenceMat = new THREE.MeshStandardMaterial({ color: '#455a64', roughness: 0.7 });
    const fence = new THREE.Mesh(new THREE.BoxGeometry(width + 1.0, 1.1, 0.25), fenceMat);
    fence.position.set(0, 0.55, depth / 2 + 4.0);
    group.add(fence);

    return group;
  }

  createBajuriPjuLamp() {
    const group = new THREE.Group();
    // Vertical metal pole (height 6.5m)
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 6.5, 10);
    const pole = new THREE.Mesh(poleGeo, this.mm.materials.metalPole);
    pole.position.y = 3.25;
    pole.castShadow = true;
    group.add(pole);

    // Curved horizontal overhanging arm extending towards street (length 2.2m)
    const armGeo = new THREE.CylinderGeometry(0.05, 0.07, 2.2, 8);
    const arm = new THREE.Mesh(armGeo, this.mm.materials.metalPole);
    arm.position.set(0.9, 6.3, 0);
    arm.rotation.z = Math.PI / 2.3;
    group.add(arm);

    // Lamp fixture head
    const fixtureGeo = new THREE.BoxGeometry(0.8, 0.18, 0.35);
    const fixture = new THREE.Mesh(fixtureGeo, this.mm.materials.streetLampFixture);
    fixture.position.set(1.9, 6.6, 0);
    group.add(fixture);

    // Glowing LED luminaire underside
    const bulbGeo = new THREE.PlaneGeometry(0.65, 0.25);
    const bulb = new THREE.Mesh(bulbGeo, this.mm.materials.streetLampBulb);
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(1.9, 6.5, 0);
    group.add(bulb);

    return group;
  }

  createTreeModel(type = 'ketapang') {
    const group = new THREE.Group();
    if (type === 'ketapang') {
      const trunkH = 5.2;
      const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, trunkH, 8);
      const trunk = new THREE.Mesh(trunkGeo, this.mm.materials.trunk);
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      group.add(trunk);

      const tiers = [
        { y: 3.5, r: 1.7, h: 0.65, mat: this.mm.materials.foliageGreen1 },
        { y: 4.5, r: 1.3, h: 0.55, mat: this.mm.materials.foliageGreen2 },
        { y: 5.4, r: 0.9, h: 0.45, mat: this.mm.materials.foliageGreen3 }
      ];

      tiers.forEach(tier => {
        const fGeo = new THREE.CylinderGeometry(tier.r * 0.45, tier.r, tier.h, 9);
        const fMesh = new THREE.Mesh(fGeo, tier.mat);
        fMesh.position.y = tier.y;
        fMesh.castShadow = true;
        group.add(fMesh);
      });
    }
    return group;
  }

  createVegetation() {
    // Trees along East Sidewalk (set back at X = 13.5, safe from curb at X = 8.0)
    for (let z = -120; z <= 120; z += 24) {
      // Exclude openings for Sersan Urip (Z: -85 to -52), Moh Yamin East (Z: 62 to 88), and Zebra crossing (Z: -14 to -2)
      if ((z >= -85 && z <= -52) || (z >= 62 && z <= 88) || (z >= -14 && z <= -2)) continue;
      this.createTree(13.5, z, 'ketapang');
    }

    // Trees along West Sidewalk (set back at X = -13.5, safe from curb at X = -8.0)
    for (let z = -140; z <= 120; z += 24) {
      // Exclude openings for Sersan Bajuri (Z: -125 to -65), Perkasa (Z: 0 to 24), Moh Yamin West (Z: 62 to 88), and Zebra crossing (Z: -14 to -2)
      if ((z >= -125 && z <= -65) || (z >= 0 && z <= 24) || (z >= 62 && z <= 88) || (z >= -14 && z <= -2)) continue;
      this.createTree(-13.5, z, z < 0 ? 'ketapang' : 'angsana');
    }

    // Tropical Palms safely placed behind sidewalks
    this.createTree(-14.0, 26.0, 'palm');
    this.createTree(13.5, -20.0, 'palm');
  }

  createTree(x, z, type = 'ketapang', elev = 0) {
    const group = new THREE.Group();

    if (type === 'ketapang') {
      // Tiered horizontal foliage canopy (characteristic Ketapang Kencana, sized to never encroach road)
      const trunkH = 5.2;
      const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, trunkH, 8);
      const trunk = new THREE.Mesh(trunkGeo, this.mm.materials.trunk);
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      group.add(trunk);

      // 3 Tiered flat disc foliage canopies (max r = 1.7m, stays > 3.8m away from road curb)
      const tiers = [
        { y: 3.5, r: 1.7, h: 0.65, mat: this.mm.materials.foliageGreen1 },
        { y: 4.5, r: 1.3, h: 0.55, mat: this.mm.materials.foliageGreen2 },
        { y: 5.4, r: 0.9, h: 0.45, mat: this.mm.materials.foliageGreen3 }
      ];

      tiers.forEach(tier => {
        const fGeo = new THREE.CylinderGeometry(tier.r * 0.45, tier.r, tier.h, 9);
        const fMesh = new THREE.Mesh(fGeo, tier.mat);
        fMesh.position.y = tier.y;
        fMesh.castShadow = true;
        group.add(fMesh);
      });
    } else if (type === 'palm') {
      // Tropical palm tree
      const trunkH = 5.8;
      const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, trunkH, 8);
      const trunk = new THREE.Mesh(trunkGeo, this.mm.materials.trunk);
      trunk.position.y = trunkH / 2;
      trunk.rotation.z = (Math.random() - 0.5) * 0.08;
      trunk.castShadow = true;
      group.add(trunk);

      // Palm fronds (length 2.0m, angle 0.85 rad)
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2;
        const frondGeo = new THREE.ConeGeometry(0.5, 2.0, 5);
        const frond = new THREE.Mesh(frondGeo, this.mm.materials.foliageGreen2);
        frond.position.set(0, trunkH, 0);
        frond.rotation.y = angle;
        frond.rotation.z = 0.85;
        frond.castShadow = true;
        group.add(frond);
      }
    } else {
      // Fluffy Angsana shade tree (compact radius 1.6m)
      const trunkH = 4.2;
      const trunkGeo = new THREE.CylinderGeometry(0.24, 0.35, trunkH, 8);
      const trunk = new THREE.Mesh(trunkGeo, this.mm.materials.trunk);
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      group.add(trunk);

      const foliageGeo = new THREE.DodecahedronGeometry(1.6, 1);
      const foliage = new THREE.Mesh(foliageGeo, this.mm.materials.foliageGreen1);
      foliage.position.y = trunkH + 1.2;
      foliage.castShadow = true;
      group.add(foliage);
    }

    group.position.set(x, 0.22 + elev, z);
    this.scene.add(group);
  }

  createDistantMountains() {
    // Tangkuban Parahu distant horizon silhouette far in the background (Z ~ -350 to -380)
    const mountainGeo = new THREE.ConeGeometry(140, 38, 8);
    const mountainMat = new THREE.MeshLambertMaterial({ color: '#162e20' });

    const m1 = new THREE.Mesh(mountainGeo, mountainMat);
    m1.position.set(-100, 16, -360);
    this.scene.add(m1);

    const m2 = new THREE.Mesh(mountainGeo, mountainMat);
    m2.scale.set(1.4, 1.1, 1.2);
    m2.position.set(40, 20, -380);
    this.scene.add(m2);

    const m3 = new THREE.Mesh(mountainGeo, mountainMat);
    m3.scale.set(1.0, 0.85, 1.0);
    m3.position.set(170, 15, -350);
    this.scene.add(m3);
  }

  setLightingMode(mode) {
    // mode: 'day' | 'sunset' | 'night'
    const isNight = mode === 'night';
    const isSunset = mode === 'sunset';

    // Central intersection illumination (zero lag)
    if (this.centralNight1) this.centralNight1.intensity = isNight ? 14 : (isSunset ? 3.5 : 0);
    if (this.centralNight2) this.centralNight2.intensity = isNight ? 14 : (isSunset ? 3.5 : 0);

    // Building upper windows emissive glow
    this.nightWindows.forEach(win => {
      win.material = isNight ? this.mm.materials.windowGlassNight : this.mm.materials.windowGlass;
    });

    // Flashing yellow beacon on Pelican pole
    if (this.pedestrianSignalMesh && this.pedestrianSignalMesh.beaconMat) {
      this.pedestrianSignalMesh.beaconMat.emissiveIntensity = isNight ? 1.5 : (isSunset ? 1.0 : 0.4);
    }
  }

  update(time, dt = 0.016) {
    // Blink pelican beacon
    if (this.pedestrianSignalMesh && this.pedestrianSignalMesh.beaconMat) {
      const flash = (Math.sin(time * 5.0) > 0.1) ? 1.2 : 0.1;
      this.pedestrianSignalMesh.beaconMat.emissiveIntensity = flash;
    }

    // Animate sidewalk pedestrians with real delta time
    const frameDt = Math.min(0.05, Math.max(0.001, dt));
    for (const ped of this.sidewalkPedestrians) {
      const route = ped.route;
      const dx = route.endX - route.startX;
      const dz = route.endZ - route.startZ;
      const routeLen = Math.sqrt(dx * dx + dz * dz);

      // Advance progress
      const step = (ped.speed * frameDt) / routeLen;
      ped.progress += step * ped.direction;

      const baseAngle = Math.atan2(dx, dz);

      // Bounce and turn around at endpoints
      if (ped.progress >= 1.0) {
        ped.progress = 1.0;
        ped.direction = -1;
        ped.mesh.rotation.y = baseAngle + Math.PI;
      } else if (ped.progress <= 0.0) {
        ped.progress = 0.0;
        ped.direction = 1;
        ped.mesh.rotation.y = baseAngle;
      }

      // Update position
      const x = THREE.MathUtils.lerp(route.startX, route.endX, ped.progress);
      const z = THREE.MathUtils.lerp(route.startZ, route.endZ, ped.progress);

      // Walking rhythm based on speed
      const cadence = ped.speed * 5.8;
      const walkPhase = time * cadence + ped.id * 3.14;
      const bob = Math.abs(Math.sin(walkPhase)) * 0.024;
      ped.mesh.position.set(x, route.baseY + bob, z);

      // Limb swing animation
      const limbSwing = Math.sin(walkPhase) * 0.48;
      if (ped.mesh.leftLeg) ped.mesh.leftLeg.rotation.x = limbSwing;
      if (ped.mesh.rightLeg) ped.mesh.rightLeg.rotation.x = -limbSwing;
      if (ped.mesh.leftArm) ped.mesh.leftArm.rotation.x = -limbSwing * 0.65;
      if (ped.mesh.rightArm) ped.mesh.rightArm.rotation.x = limbSwing * 0.65;
    }
  }
}
