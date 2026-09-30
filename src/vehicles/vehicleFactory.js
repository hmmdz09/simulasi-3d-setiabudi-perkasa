import * as THREE from 'three';

export class VehicleFactory {
  constructor(materialManager) {
    this.mm = materialManager;
    this.carPaints = this.mm.getVehiclePaints();
    this.motorcyclePaints = this.mm.getMotorcyclePaints();
    this.angkotMaterials = this.mm.getAngkotMaterials();
    this.busMaterials = this.mm.getBusMaterials();
    this.truckMaterials = this.mm.getTruckMaterials();
    this.jacketColors = ['#e63946', '#457b9d', '#1d3557', '#2a9d8f', '#f4a261', '#333333'];
    this.helmetColors = ['#f8f9fa', '#212529', '#e63946', '#ffb703', '#4361ee'];

    // Reusable shared geometries to maximize GPU cache and eliminate GC lag
    this.geos = {
      sedanBody: new THREE.BoxGeometry(1.85, 0.65, 4.4),
      sedanCabin: new THREE.BoxGeometry(1.6, 0.62, 2.3),
      suvBody: new THREE.BoxGeometry(1.95, 0.8, 4.65),
      suvCabin: new THREE.BoxGeometry(1.72, 0.78, 3.1),
      angkotLower: new THREE.BoxGeometry(1.8, 0.75, 4.2),
      angkotStripe: new THREE.BoxGeometry(1.82, 0.14, 4.22),
      angkotUpper: new THREE.BoxGeometry(1.68, 0.9, 3.8),
      motoBody: new THREE.BoxGeometry(0.52, 0.45, 1.2),
      motoCowl: new THREE.BoxGeometry(0.48, 0.6, 0.5),
      motoSeat: new THREE.BoxGeometry(0.4, 0.16, 0.8),
      motoFloor: new THREE.BoxGeometry(0.46, 0.08, 0.5),
      motoHandle: new THREE.CylinderGeometry(0.025, 0.025, 0.72, 8),
      // Bus geometries
      busLowerBody: new THREE.BoxGeometry(2.45, 1.35, 9.4),
      busStripe: new THREE.BoxGeometry(2.47, 0.22, 9.42),
      busUpperCabin: new THREE.BoxGeometry(2.42, 1.25, 9.35),
      busWindowGlass: new THREE.BoxGeometry(2.44, 0.85, 7.8),
      busAcUnit: new THREE.BoxGeometry(1.6, 0.35, 2.6),
      busMarquee: new THREE.BoxGeometry(1.6, 0.3, 0.08),
      // Truck geometries
      truckCabin: new THREE.BoxGeometry(2.15, 1.45, 1.9),
      truckBox: new THREE.BoxGeometry(2.25, 2.1, 4.8),
      truckChassis: new THREE.BoxGeometry(1.6, 0.35, 6.2),
      truckBumper: new THREE.BoxGeometry(2.18, 0.3, 0.2),
      truckDeflector: new THREE.BoxGeometry(1.8, 0.4, 0.8),
      // Wheels
      wheelTire: new THREE.CylinderGeometry(0.35, 0.35, 0.22, 12),
      wheelRim: new THREE.CylinderGeometry(0.24, 0.24, 0.24, 8),
      wheelHeavyTire: new THREE.CylinderGeometry(0.46, 0.46, 0.28, 12),
      wheelHeavyRim: new THREE.CylinderGeometry(0.32, 0.32, 0.3, 8),
      wheelMotoTire: new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10),
      wheelMotoRim: new THREE.CylinderGeometry(0.2, 0.2, 0.12, 8),
      hlBox: new THREE.BoxGeometry(0.3, 0.15, 0.08),
      tlBox: new THREE.BoxGeometry(0.28, 0.14, 0.08),
      turnBox: new THREE.BoxGeometry(0.12, 0.1, 0.08),
      platePlane: new THREE.PlaneGeometry(0.55, 0.2)
    };
  }

  createVehicle(type = 'sedan') {
    switch (type) {
      case 'bus':
        return this.createBus();
      case 'truck':
        return this.createTruck();
      case 'sedan':
        return this.createSedan();
      case 'suv':
        return this.createSUV();
      case 'angkot':
        return this.createAngkot();
      case 'motorcycle':
      default:
        return this.createMotorcycle();
    }
  }

  createSedan() {
    const root = new THREE.Group();
    const paintMat = this.carPaints[Math.floor(Math.random() * this.carPaints.length)];

    // 1. Lower chassis / body
    const body = new THREE.Mesh(this.geos.sedanBody, paintMat);
    body.position.y = 0.55;
    root.add(body);

    // 2. Cabin
    const cabin = new THREE.Mesh(this.geos.sedanCabin, paintMat);
    cabin.position.set(0, 1.15, -0.2);
    root.add(cabin);

    // Windshields
    const frontWindshieldGeo = new THREE.PlaneGeometry(1.48, 0.72);
    const frontWindshield = new THREE.Mesh(frontWindshieldGeo, this.mm.materials.carGlass);
    frontWindshield.position.set(0, 1.08, 0.98);
    frontWindshield.rotation.x = -Math.PI / 4.2;
    root.add(frontWindshield);

    const rearWindshieldGeo = new THREE.PlaneGeometry(1.48, 0.68);
    const rearWindshield = new THREE.Mesh(rearWindshieldGeo, this.mm.materials.carGlass);
    rearWindshield.position.set(0, 1.1, -1.38);
    rearWindshield.rotation.x = Math.PI / 3.8;
    rearWindshield.rotation.y = Math.PI;
    root.add(rearWindshield);

    // 3. Headlights (Glowing emissive, NO expensive SpotLights!)
    const headlights = [];
    [-0.68, 0.68].forEach(x => {
      const hl = new THREE.Mesh(this.geos.hlBox, this.mm.materials.headlightOff);
      hl.position.set(x, 0.6, 2.2);
      root.add(hl);
      headlights.push(hl);
    });

    // 4. Projected Ground Beam (Fast Additive Texture Quad)
    const beamPlaneGeo = new THREE.PlaneGeometry(3.6, 12.0);
    const beamMat = this.mm.materials.headlightBeam.clone();
    const groundBeam = new THREE.Mesh(beamPlaneGeo, beamMat);
    groundBeam.rotation.x = -Math.PI / 2;
    groundBeam.position.set(0, 0.04, 7.5);
    root.add(groundBeam);

    // 5. Ambient Contact Shadow Quad under car
    const shadowGeo = new THREE.PlaneGeometry(2.3, 4.8);
    const shadowMesh = new THREE.Mesh(shadowGeo, this.mm.materials.carShadow);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, 0.02, 0);
    root.add(shadowMesh);

    // 6. Taillights
    const taillights = [];
    [-0.68, 0.68].forEach(x => {
      const tl = new THREE.Mesh(this.geos.tlBox, this.mm.materials.taillightOff);
      tl.position.set(x, 0.65, -2.2);
      root.add(tl);
      taillights.push(tl);
    });

    // 7. Turn Signals
    const turnLeft = [];
    const turnRight = [];
    [-0.85, 0.85].forEach((x, idx) => {
      const sFront = new THREE.Mesh(this.geos.turnBox, new THREE.MeshBasicMaterial({ color: '#553300' }));
      sFront.position.set(x, 0.6, 2.18);
      root.add(sFront);

      const sRear = new THREE.Mesh(this.geos.turnBox, new THREE.MeshBasicMaterial({ color: '#553300' }));
      sRear.position.set(x, 0.65, -2.18);
      root.add(sRear);

      if (idx === 0) turnLeft.push(sFront, sRear);
      else turnRight.push(sFront, sRear);
    });

    // 8. Wheels (Front steerable, Rear fixed)
    const frontWheels = [];
    const rearWheels = [];
    [-0.92, 0.92].forEach(x => {
      const wgF = new THREE.Group();
      wgF.position.set(x, 0.35, 1.35);
      wgF.add(this.createFastWheel());
      root.add(wgF);
      frontWheels.push(wgF);

      const wgR = new THREE.Group();
      wgR.position.set(x, 0.35, -1.35);
      wgR.add(this.createFastWheel());
      root.add(wgR);
      rearWheels.push(wgR);
    });

    this.addLicensePlate(root, 2.22, 0.38, 0);
    this.addLicensePlate(root, -2.22, 0.42, Math.PI);

    return this.wrapVehicle(root, 'sedan', 4.5, 2.0, frontWheels, rearWheels, headlights, taillights, turnLeft, turnRight, groundBeam);
  }

  createSUV() {
    const root = new THREE.Group();
    const paintMat = this.carPaints[Math.floor(Math.random() * this.carPaints.length)];

    const body = new THREE.Mesh(this.geos.suvBody, paintMat);
    body.position.y = 0.68;
    root.add(body);

    const cabin = new THREE.Mesh(this.geos.suvCabin, paintMat);
    cabin.position.set(0, 1.42, -0.3);
    root.add(cabin);

    // Windshield
    const frontWindshieldGeo = new THREE.PlaneGeometry(1.58, 0.8);
    const frontWindshield = new THREE.Mesh(frontWindshieldGeo, this.mm.materials.carGlass);
    frontWindshield.position.set(0, 1.34, 1.28);
    frontWindshield.rotation.x = -Math.PI / 4.8;
    root.add(frontWindshield);

    // Headlights
    const headlights = [];
    [-0.72, 0.72].forEach(x => {
      const hl = new THREE.Mesh(this.geos.hlBox, this.mm.materials.headlightOff);
      hl.position.set(x, 0.75, 2.34);
      root.add(hl);
      headlights.push(hl);
    });

    // Projected Ground Beam
    const beamPlaneGeo = new THREE.PlaneGeometry(3.8, 13.0);
    const beamMat = this.mm.materials.headlightBeam.clone();
    const groundBeam = new THREE.Mesh(beamPlaneGeo, beamMat);
    groundBeam.rotation.x = -Math.PI / 2;
    groundBeam.position.set(0, 0.04, 8.0);
    root.add(groundBeam);

    // Ground Shadow
    const shadowGeo = new THREE.PlaneGeometry(2.4, 5.0);
    const shadowMesh = new THREE.Mesh(shadowGeo, this.mm.materials.carShadow);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, 0.02, 0);
    root.add(shadowMesh);

    // Taillights
    const taillights = [];
    [-0.72, 0.72].forEach(x => {
      const tl = new THREE.Mesh(this.geos.tlBox, this.mm.materials.taillightOff);
      tl.position.set(x, 1.05, -2.34);
      root.add(tl);
      taillights.push(tl);
    });

    // Turn Signals
    const turnLeft = [];
    const turnRight = [];
    [-0.92, 0.92].forEach((x, idx) => {
      const sFront = new THREE.Mesh(this.geos.turnBox, new THREE.MeshBasicMaterial({ color: '#553300' }));
      sFront.position.set(x, 0.75, 2.3);
      root.add(sFront);
      const sRear = new THREE.Mesh(this.geos.turnBox, new THREE.MeshBasicMaterial({ color: '#553300' }));
      sRear.position.set(x, 1.05, -2.32);
      root.add(sRear);

      if (idx === 0) turnLeft.push(sFront, sRear);
      else turnRight.push(sFront, sRear);
    });

    // Wheels
    const frontWheels = [];
    const rearWheels = [];
    [-0.98, 0.98].forEach(x => {
      const wgF = new THREE.Group();
      wgF.position.set(x, 0.42, 1.45);
      wgF.add(this.createFastWheel(0.42, 0.28));
      root.add(wgF);
      frontWheels.push(wgF);

      const wgR = new THREE.Group();
      wgR.position.set(x, 0.42, -1.45);
      wgR.add(this.createFastWheel(0.42, 0.28));
      root.add(wgR);
      rearWheels.push(wgR);
    });

    this.addLicensePlate(root, 2.36, 0.44, 0);
    this.addLicensePlate(root, -2.36, 0.48, Math.PI);

    return this.wrapVehicle(root, 'suv', 4.8, 2.1, frontWheels, rearWheels, headlights, taillights, turnLeft, turnRight, groundBeam);
  }

  createAngkot() {
    const root = new THREE.Group();

    // Bandung green lower body
    const lowerBody = new THREE.Mesh(this.geos.angkotLower, this.angkotMaterials.bodyGreen);
    lowerBody.position.y = 0.65;
    root.add(lowerBody);

    // Orange stripe
    const stripe = new THREE.Mesh(this.geos.angkotStripe, this.angkotMaterials.stripeOrange);
    stripe.position.y = 0.88;
    root.add(stripe);

    // Cream roof
    const upper = new THREE.Mesh(this.geos.angkotUpper, this.angkotMaterials.roofCream);
    upper.position.set(0, 1.45, -0.15);
    root.add(upper);

    // Headlights
    const headlights = [];
    [-0.65, 0.65].forEach(x => {
      const hl = new THREE.Mesh(this.geos.hlBox, this.mm.materials.headlightOff);
      hl.position.set(x, 0.68, 2.12);
      root.add(hl);
      headlights.push(hl);
    });

    // Projected Ground Beam
    const beamPlaneGeo = new THREE.PlaneGeometry(3.5, 11.0);
    const beamMat = this.mm.materials.headlightBeam.clone();
    const groundBeam = new THREE.Mesh(beamPlaneGeo, beamMat);
    groundBeam.rotation.x = -Math.PI / 2;
    groundBeam.position.set(0, 0.04, 7.2);
    root.add(groundBeam);

    // Ground Shadow
    const shadowGeo = new THREE.PlaneGeometry(2.2, 4.6);
    const shadowMesh = new THREE.Mesh(shadowGeo, this.mm.materials.carShadow);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, 0.02, 0);
    root.add(shadowMesh);

    // Taillights
    const taillights = [];
    [-0.65, 0.65].forEach(x => {
      const tl = new THREE.Mesh(this.geos.tlBox, this.mm.materials.taillightOff);
      tl.position.set(x, 0.68, -2.12);
      root.add(tl);
      taillights.push(tl);
    });

    const turnLeft = [];
    const turnRight = [];
    [-0.8, 0.8].forEach((x, idx) => {
      const sFront = new THREE.Mesh(this.geos.turnBox, new THREE.MeshBasicMaterial({ color: '#553300' }));
      sFront.position.set(x, 0.68, 2.1);
      root.add(sFront);
      if (idx === 0) turnLeft.push(sFront);
      else turnRight.push(sFront);
    });

    // Wheels
    const frontWheels = [];
    const rearWheels = [];
    [-0.88, 0.88].forEach(x => {
      const wgF = new THREE.Group();
      wgF.position.set(x, 0.35, 1.25);
      wgF.add(this.createFastWheel(0.35, 0.22));
      root.add(wgF);
      frontWheels.push(wgF);

      const wgR = new THREE.Group();
      wgR.position.set(x, 0.35, -1.25);
      wgR.add(this.createFastWheel(0.35, 0.22));
      root.add(wgR);
      rearWheels.push(wgR);
    });

    this.addLicensePlate(root, 2.14, 0.36, 0, 'D 1982 AM');
    this.addLicensePlate(root, -2.14, 0.4, Math.PI, 'D 1982 AM');

    return this.wrapVehicle(root, 'angkot', 4.3, 1.9, frontWheels, rearWheels, headlights, taillights, turnLeft, turnRight, groundBeam);
  }

  createBus() {
    const root = new THREE.Group();
    const isTeal = Math.random() > 0.5;
    const bodyMat = isTeal ? this.busMaterials.bodyTeal : this.busMaterials.bodyBlue;

    // 1. Lower chassis / body
    const lowerBody = new THREE.Mesh(this.geos.busLowerBody, bodyMat);
    lowerBody.position.y = 1.05;
    root.add(lowerBody);

    // 2. White stripe accent
    const stripe = new THREE.Mesh(this.geos.busStripe, this.busMaterials.stripeWhite);
    stripe.position.y = 1.62;
    root.add(stripe);

    // 3. Upper cabin & roof
    const upper = new THREE.Mesh(this.geos.busUpperCabin, this.busMaterials.roofGrey);
    upper.position.set(0, 2.3, 0);
    root.add(upper);

    // 4. Passenger windows band (dark tinted glass)
    const windows = new THREE.Mesh(this.geos.busWindowGlass, this.busMaterials.busGlass);
    windows.position.set(0, 2.22, -0.2);
    root.add(windows);

    // 5. Front windshield
    const frontWindshieldGeo = new THREE.PlaneGeometry(2.35, 1.25);
    const frontWindshield = new THREE.Mesh(frontWindshieldGeo, this.mm.materials.carGlass);
    frontWindshield.position.set(0, 2.05, 4.71);
    frontWindshield.rotation.x = -0.12;
    root.add(frontWindshield);

    // Rear window
    const rearWindshieldGeo = new THREE.PlaneGeometry(2.2, 0.85);
    const rearWindshield = new THREE.Mesh(rearWindshieldGeo, this.mm.materials.carGlass);
    rearWindshield.position.set(0, 2.25, -4.71);
    rearWindshield.rotation.y = Math.PI;
    root.add(rearWindshield);

    // 6. LED Destination Marquee Display
    const marquee = new THREE.Mesh(this.geos.busMarquee, this.busMaterials.marqueeLed);
    marquee.position.set(0, 2.75, 4.71);
    root.add(marquee);

    // 7. Roof AC Unit
    const ac = new THREE.Mesh(this.geos.busAcUnit, this.busMaterials.acUnit);
    ac.position.set(0, 3.1, -0.5);
    root.add(ac);

    // 8. Headlights
    const headlights = [];
    [-0.92, 0.92].forEach(x => {
      const hl = new THREE.Mesh(this.geos.hlBox, this.mm.materials.headlightOff);
      hl.position.set(x, 0.72, 4.72);
      root.add(hl);
      headlights.push(hl);
    });

    // 9. Projected Ground Beam
    const beamPlaneGeo = new THREE.PlaneGeometry(4.2, 16.0);
    const beamMat = this.mm.materials.headlightBeam.clone();
    const groundBeam = new THREE.Mesh(beamPlaneGeo, beamMat);
    groundBeam.rotation.x = -Math.PI / 2;
    groundBeam.position.set(0, 0.04, 11.5);
    root.add(groundBeam);

    // 10. Ambient Contact Shadow under bus
    const shadowGeo = new THREE.PlaneGeometry(2.9, 10.2);
    const shadowMesh = new THREE.Mesh(shadowGeo, this.mm.materials.carShadow);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, 0.02, 0);
    root.add(shadowMesh);

    // 11. Taillights
    const taillights = [];
    [-0.92, 0.92].forEach(x => {
      const tl = new THREE.Mesh(this.geos.tlBox, this.mm.materials.taillightOff);
      tl.position.set(x, 0.95, -4.72);
      root.add(tl);
      taillights.push(tl);
    });

    // 12. Turn Signals
    const turnLeft = [];
    const turnRight = [];
    [-1.05, 1.05].forEach((x, idx) => {
      const sFront = new THREE.Mesh(this.geos.turnBox, new THREE.MeshBasicMaterial({ color: '#553300' }));
      sFront.position.set(x, 0.72, 4.68);
      root.add(sFront);

      const sRear = new THREE.Mesh(this.geos.turnBox, new THREE.MeshBasicMaterial({ color: '#553300' }));
      sRear.position.set(x, 0.95, -4.68);
      root.add(sRear);

      if (idx === 0) turnLeft.push(sFront, sRear);
      else turnRight.push(sFront, sRear);
    });

    // 13. Heavy Wheels (Front steerable, dual rear axles)
    const frontWheels = [];
    const rearWheels = [];
    [-1.12, 1.12].forEach(x => {
      const wgF = new THREE.Group();
      wgF.position.set(x, 0.46, 2.7);
      wgF.add(this.createFastHeavyWheel());
      root.add(wgF);
      frontWheels.push(wgF);

      const wgR1 = new THREE.Group();
      wgR1.position.set(x, 0.46, -2.2);
      wgR1.add(this.createFastHeavyWheel());
      root.add(wgR1);
      rearWheels.push(wgR1);

      const wgR2 = new THREE.Group();
      wgR2.position.set(x, 0.46, -3.2);
      wgR2.add(this.createFastHeavyWheel());
      root.add(wgR2);
      rearWheels.push(wgR2);
    });

    this.addLicensePlate(root, 4.73, 0.45, 0, isTeal ? 'D 7618 TMP' : 'D 7520 DMR');
    this.addLicensePlate(root, -4.73, 0.55, Math.PI, isTeal ? 'D 7618 TMP' : 'D 7520 DMR');

    return this.wrapVehicle(root, 'bus', 9.6, 2.5, frontWheels, rearWheels, headlights, taillights, turnLeft, turnRight, groundBeam);
  }

  createTruck() {
    const root = new THREE.Group();
    const cabinPaints = [this.truckMaterials.cabinYellow, this.truckMaterials.cabinWhite, this.truckMaterials.cabinBlue];
    const cabinMat = cabinPaints[Math.floor(Math.random() * cabinPaints.length)];

    // 1. Heavy dark chassis rails
    const chassis = new THREE.Mesh(this.geos.truckChassis, this.truckMaterials.chassisDark);
    chassis.position.set(0, 0.58, 0.2);
    root.add(chassis);

    // 2. Front bumper
    const bumper = new THREE.Mesh(this.geos.truckBumper, this.truckMaterials.bumperMetal);
    bumper.position.set(0, 0.52, 3.25);
    root.add(bumper);

    // 3. Cabin
    const cabin = new THREE.Mesh(this.geos.truckCabin, cabinMat);
    cabin.position.set(0, 1.48, 2.15);
    root.add(cabin);

    // Windshield
    const frontWindshieldGeo = new THREE.PlaneGeometry(1.95, 0.85);
    const frontWindshield = new THREE.Mesh(frontWindshieldGeo, this.mm.materials.carGlass);
    frontWindshield.position.set(0, 1.68, 3.12);
    frontWindshield.rotation.x = -0.12;
    root.add(frontWindshield);

    // Aerodynamic roof deflector
    const deflector = new THREE.Mesh(this.geos.truckDeflector, cabinMat);
    deflector.position.set(0, 2.38, 2.05);
    deflector.rotation.x = 0.28;
    root.add(deflector);

    // 4. Aluminum Logistics Cargo Box
    const cargoBox = new THREE.Mesh(this.geos.truckBox, this.truckMaterials.boxSilver);
    cargoBox.position.set(0, 1.9, -0.95);
    root.add(cargoBox);

    // 5. Headlights
    const headlights = [];
    [-0.85, 0.85].forEach(x => {
      const hl = new THREE.Mesh(this.geos.hlBox, this.mm.materials.headlightOff);
      hl.position.set(x, 0.65, 3.28);
      root.add(hl);
      headlights.push(hl);
    });

    // 6. Projected Ground Beam
    const beamPlaneGeo = new THREE.PlaneGeometry(3.9, 13.5);
    const beamMat = this.mm.materials.headlightBeam.clone();
    const groundBeam = new THREE.Mesh(beamPlaneGeo, beamMat);
    groundBeam.rotation.x = -Math.PI / 2;
    groundBeam.position.set(0, 0.04, 9.5);
    root.add(groundBeam);

    // 7. Ambient Contact Shadow
    const shadowGeo = new THREE.PlaneGeometry(2.6, 7.5);
    const shadowMesh = new THREE.Mesh(shadowGeo, this.mm.materials.carShadow);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, 0.02, 0);
    root.add(shadowMesh);

    // 8. Taillights
    const taillights = [];
    [-0.9, 0.9].forEach(x => {
      const tl = new THREE.Mesh(this.geos.tlBox, this.mm.materials.taillightOff);
      tl.position.set(x, 0.75, -3.38);
      root.add(tl);
      taillights.push(tl);
    });

    // 9. Turn Signals
    const turnLeft = [];
    const turnRight = [];
    [-1.0, 1.0].forEach((x, idx) => {
      const sFront = new THREE.Mesh(this.geos.turnBox, new THREE.MeshBasicMaterial({ color: '#553300' }));
      sFront.position.set(x, 0.65, 3.24);
      root.add(sFront);

      const sRear = new THREE.Mesh(this.geos.turnBox, new THREE.MeshBasicMaterial({ color: '#553300' }));
      sRear.position.set(x, 0.75, -3.35);
      root.add(sRear);

      if (idx === 0) turnLeft.push(sFront, sRear);
      else turnRight.push(sFront, sRear);
    });

    // 10. Wheels (Front steerable, Rear heavy dual wheels)
    const frontWheels = [];
    const rearWheels = [];
    [-1.02, 1.02].forEach(x => {
      const wgF = new THREE.Group();
      wgF.position.set(x, 0.46, 2.2);
      wgF.add(this.createFastHeavyWheel());
      root.add(wgF);
      frontWheels.push(wgF);

      const wgR = new THREE.Group();
      wgR.position.set(x, 0.46, -1.6);
      wgR.add(this.createFastHeavyWheel());
      root.add(wgR);
      rearWheels.push(wgR);
    });

    this.addLicensePlate(root, 3.28, 0.38, 0, 'D 8912 TK');
    this.addLicensePlate(root, -3.38, 0.48, Math.PI, 'D 8912 TK');

    return this.wrapVehicle(root, 'truck', 7.0, 2.3, frontWheels, rearWheels, headlights, taillights, turnLeft, turnRight, groundBeam);
  }

  createMotorcycle() {
    const root = new THREE.Group();
    const paintMat = this.motorcyclePaints[Math.floor(Math.random() * this.motorcyclePaints.length)];

    // 1. Scooter Chassis
    const body = new THREE.Mesh(this.geos.motoBody, paintMat);
    body.position.set(0, 0.52, -0.1);
    root.add(body);

    const cowl = new THREE.Mesh(this.geos.motoCowl, paintMat);
    cowl.position.set(0, 0.82, 0.55);
    cowl.rotation.x = -0.25;
    root.add(cowl);

    const handle = new THREE.Mesh(this.geos.motoHandle, this.mm.materials.metalPole);
    handle.position.set(0, 1.08, 0.45);
    handle.rotation.z = Math.PI / 2;
    root.add(handle);

    const seat = new THREE.Mesh(this.geos.motoSeat, new THREE.MeshLambertMaterial({ color: '#1a1a1a' }));
    seat.position.set(0, 0.78, -0.22);
    root.add(seat);

    // Headlight
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.06), this.mm.materials.headlightOff);
    hl.position.set(0, 0.82, 0.82);
    root.add(hl);
    const headlights = [hl];

    // Projected Ground Beam (slimmer for bike)
    const beamPlaneGeo = new THREE.PlaneGeometry(2.4, 9.5);
    const beamMat = this.mm.materials.headlightBeam.clone();
    const groundBeam = new THREE.Mesh(beamPlaneGeo, beamMat);
    groundBeam.rotation.x = -Math.PI / 2;
    groundBeam.position.set(0, 0.04, 5.5);
    root.add(groundBeam);

    // Bike Ground Shadow
    const shadowGeo = new THREE.PlaneGeometry(1.0, 2.2);
    const shadowMesh = new THREE.Mesh(shadowGeo, this.mm.materials.carShadow);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, 0.02, 0);
    root.add(shadowMesh);

    // Taillight
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.06), this.mm.materials.taillightOff);
    tl.position.set(0, 0.72, -0.72);
    root.add(tl);
    const taillights = [tl];

    // Wheels
    const frontWheels = [];
    const rearWheels = [];

    const wgF = new THREE.Group();
    wgF.position.set(0, 0.28, 0.75);
    wgF.add(this.createFastMotorcycleWheel());
    root.add(wgF);
    frontWheels.push(wgF);

    const wgR = new THREE.Group();
    wgR.position.set(0, 0.28, -0.65);
    wgR.add(this.createFastMotorcycleWheel());
    root.add(wgR);
    rearWheels.push(wgR);

    // 2. Rider
    this.addRider(root);

    return this.wrapVehicle(root, 'motorcycle', 2.0, 0.8, frontWheels, rearWheels, headlights, taillights, [], [], groundBeam);
  }

  addRider(vehicleRoot) {
    const riderGroup = new THREE.Group();
    const jacketColor = this.jacketColors[Math.floor(Math.random() * this.jacketColors.length)];
    const helmetColor = this.helmetColors[Math.floor(Math.random() * this.helmetColors.length)];

    const jacketMat = new THREE.MeshLambertMaterial({ color: jacketColor });
    const helmetMat = new THREE.MeshStandardMaterial({ color: helmetColor, roughness: 0.2, metalness: 0.4 });
    const pantsMat = new THREE.MeshLambertMaterial({ color: '#2b2d42' });
    const skinMat = new THREE.MeshLambertMaterial({ color: '#d4a373' });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.38, 0.52, 0.25);
    const torso = new THREE.Mesh(torsoGeo, jacketMat);
    torso.position.set(0, 1.15, -0.15);
    torso.rotation.x = 0.2;
    riderGroup.add(torso);

    // Helmet
    const helmetGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.set(0, 1.55, -0.05);
    riderGroup.add(helmet);

    // Visor
    const visorGeo = new THREE.BoxGeometry(0.24, 0.1, 0.08);
    const visorMat = new THREE.MeshBasicMaterial({ color: '#111111' });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.54, 0.1);
    riderGroup.add(visor);

    // Arms
    [-0.22, 0.22].forEach(x => {
      const armGeo = new THREE.BoxGeometry(0.1, 0.42, 0.1);
      const arm = new THREE.Mesh(armGeo, jacketMat);
      arm.position.set(x, 1.18, 0.12);
      arm.rotation.x = Math.PI / 3.2;
      riderGroup.add(arm);
    });

    vehicleRoot.add(riderGroup);
  }

  createFastWheel(radius = 0.35, width = 0.22) {
    const group = new THREE.Group();
    const tire = new THREE.Mesh(this.geos.wheelTire, this.mm.materials.rubberTire);
    tire.rotation.z = Math.PI / 2;
    group.add(tire);

    const rim = new THREE.Mesh(this.geos.wheelRim, this.mm.materials.wheelRimChrome);
    rim.rotation.z = Math.PI / 2;
    group.add(rim);
    return group;
  }

  createFastMotorcycleWheel() {
    const group = new THREE.Group();
    const tire = new THREE.Mesh(this.geos.wheelMotoTire, this.mm.materials.rubberTire);
    tire.rotation.z = Math.PI / 2;
    group.add(tire);

    const rim = new THREE.Mesh(this.geos.wheelMotoRim, this.mm.materials.wheelRimChrome);
    rim.rotation.z = Math.PI / 2;
    group.add(rim);
    return group;
  }

  createFastHeavyWheel() {
    const group = new THREE.Group();
    const tire = new THREE.Mesh(this.geos.wheelHeavyTire, this.mm.materials.rubberTire);
    tire.rotation.z = Math.PI / 2;
    group.add(tire);

    const rim = new THREE.Mesh(this.geos.wheelHeavyRim, this.mm.materials.wheelRimChrome);
    rim.rotation.z = Math.PI / 2;
    group.add(rim);
    return group;
  }

  addLicensePlate(group, z, y, rotY, text = null) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#111418';
    ctx.fillRect(0, 0, 128, 48);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 124, 44);

    const randomNumbers = Math.floor(1000 + Math.random() * 8999);
    const letters = ['UPI', 'BDG', 'STB', 'PKS', 'MTR', 'LKM'];
    const randomLetters = letters[Math.floor(Math.random() * letters.length)];
    const plateText = text || `D ${randomNumbers} ${randomLetters}`;

    ctx.fillStyle = '#f8f9fa';
    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(plateText, 64, 24);

    const texture = new THREE.CanvasTexture(canvas);
    const plate = new THREE.Mesh(this.geos.platePlane, new THREE.MeshBasicMaterial({ map: texture }));
    plate.position.set(0, y, z);
    plate.rotation.y = rotY;
    group.add(plate);
  }

  wrapVehicle(root, type, length, width, frontWheels, rearWheels, headlights, taillights, turnLeft, turnRight, groundBeam) {
    return {
      mesh: root,
      type,
      length,
      width,
      frontWheels,
      rearWheels,
      headlights,
      taillights,
      turnLeft,
      turnRight,
      groundBeam,
      steeringAngle: 0,
      isBraking: false,
      turnSignalState: null,
      isNight: false,

      setSteering(angle) {
        this.steeringAngle = angle;
        this.frontWheels.forEach(w => {
          w.rotation.y = angle;
        });
        if (this.type === 'motorcycle') {
          this.mesh.rotation.z = -angle * 0.35;
        }
      },

      setBraking(braking) {
        if (this.isBraking === braking) return;
        this.isBraking = braking;
        this.taillights.forEach(tl => {
          if (braking) {
            tl.material = new THREE.MeshBasicMaterial({ color: '#ff0033' });
          } else {
            tl.material = this.isNight ? new THREE.MeshBasicMaterial({ color: '#aa1111' }) : new THREE.MeshLambertMaterial({ color: '#590000' });
          }
        });
      },

      setTurnSignal(direction) {
        this.turnSignalState = direction;
      },

      setLights(isNight, isSunset) {
        this.isNight = isNight;
        this.headlights.forEach(hl => {
          hl.material = isNight ? new THREE.MeshBasicMaterial({ color: '#ffffff' }) : (isSunset ? new THREE.MeshBasicMaterial({ color: '#fff9e6' }) : new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.2, metalness: 0.8 }));
        });

        if (this.groundBeam) {
          this.groundBeam.material.opacity = isNight ? 0.75 : (isSunset ? 0.2 : 0);
        }

        this.setBraking(this.isBraking);
      },

      update(dt, time) {
        if (this.turnSignalState) {
          const blink = Math.sin(time * 8.0) > 0;
          const activeList = this.turnSignalState === 'left' ? this.turnLeft : this.turnRight;
          activeList.forEach(s => {
            s.material = blink ? new THREE.MeshBasicMaterial({ color: '#ffaa00' }) : new THREE.MeshBasicMaterial({ color: '#442200' });
          });
        }
      }
    };
  }
}
