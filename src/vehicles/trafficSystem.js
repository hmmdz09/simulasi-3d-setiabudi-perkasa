import * as THREE from 'three';

export class TrafficSystem {
  constructor(scene, vehicleFactory) {
    this.scene = scene;
    this.factory = vehicleFactory;

    // Traffic settings - Calibrated to dense survey data (5,000 motor & 1,800 mobil/jam)
    this.targetDensity = 58; // Sustained high volume across Setiabudi & Sersan Bajuri
    this.simulationSpeed = 1.0;
    this.isPaused = false;
    this.isNight = false;
    this.isSunset = false;

    // Pedestrian crossing yield state
    this.pedestrianCrossingActive = false;

    // Environment reference (for 3D APILL traffic lights)
    this.environment = null;

    // Simpang 3 Sersan Bajuri - Terusan Setiabudi Traffic Light State Machine
    this.simpangLightPhase = 'SETIABUDI_GREEN';
    this.simpangLightTimer = 0;

    // Pedestrian system reference (for coordinated corridor green wave)
    this.pedestrianSystem = null;

    // Corridor Green Wave Coordination:
    // When Terusan Setiabudi Southbound turns from RED to GREEN, the waiting platoon of vehicles
    // requires a ~14 second green wave progression window to reach and pass Jl. Perkasa Zebra Cross safely
    // without hitting a double red light!
    this.greenWaveActive = false;
    this.greenWaveTimer = 0;
    this.greenWaveDuration = 14.0;

    // Build path curves
    this.paths = this.createPaths();

    // Vehicles pool
    this.activeVehicles = [];
    this.vehiclePool = [];

    // Chased / inspected vehicle
    this.selectedVehicle = null;

    // Spawn timers per path
    this.spawnCooldowns = {};
    Object.keys(this.paths).forEach(k => {
      this.spawnCooldowns[k] = k.includes('Urip') ? (20.0 + Math.random() * 15.0) : (Math.random() * 1.5);
    });

    // Populate initial vehicle pool (increased to 96 units for heavy flow)
    this.initPool(96);
  }

  setEnvironment(env) {
    this.environment = env;
    if (this.environment && this.environment.setSimpangLightPhase) {
      this.environment.setSimpangLightPhase(this.simpangLightPhase);
    }
  }

  setPedestrianSystem(pedSys) {
    this.pedestrianSystem = pedSys;
  }

  activateGreenWave(duration = 14.0) {
    this.greenWaveActive = true;
    this.greenWaveTimer = duration;
    this.greenWaveDuration = duration;
    if (this.pedestrianSystem && typeof this.pedestrianSystem.onGreenWaveActivated === 'function') {
      this.pedestrianSystem.onGreenWaveActivated(duration);
    }
  }

  isGreenWaveActive() {
    return this.greenWaveActive && this.greenWaveTimer > 0;
  }

  getGreenWaveRemainingSeconds() {
    return Math.max(0, Math.ceil(this.greenWaveTimer));
  }

  createPaths() {
    const paths = {};

    // Helper to evaluate elevation on Jl. Perkasa
    const getPerkasaElevation = (x) => {
      if (x > -8) return 0;
      const dist = Math.min(97, -8 - x);
      return (dist / 97) * 1.5;
    };

    // 1. Setiabudi Northbound Lane 1 (Jalur Kanan Ke Atas / Terusan Setiabudi, Inner, X = -1.9, Z: 135 -> -160)
    // Jalur kanan ini yang berhenti di stop line Z = -55.5 saat lampu merah lurus
    paths['Setiabudi_North_L1'] = this.buildCurve([
      new THREE.Vector3(-1.9, 0, 135),
      new THREE.Vector3(-1.9, 0, 50),
      new THREE.Vector3(-1.9, 0, -8),
      new THREE.Vector3(-1.9, 0, -50),
      new THREE.Vector3(-1.9, 0, -75),
      new THREE.Vector3(-2.2, 0, -160)
    ], 'Setiabudi ➔ Terusan Setiabudi (Jalur Kanan Ke Atas)');

    // 2. Setiabudi Northbound Lane 2 (Jalur Kiri Ke Atas, X = -5.8, merges to right lane before Simpang)
    paths['Setiabudi_North_L2'] = this.buildCurve([
      new THREE.Vector3(-5.8, 0, 135),
      new THREE.Vector3(-5.8, 0, 50),
      new THREE.Vector3(-5.8, 0, -8),
      new THREE.Vector3(-4.5, 0, -32),
      new THREE.Vector3(-2.4, 0, -48),
      new THREE.Vector3(-2.4, 0, -75),
      new THREE.Vector3(-2.4, 0, -160)
    ], 'Setiabudi Northbound (Jalur Lurus Ke Atas)');

    // 3. Terusan Setiabudi Southbound Lane 1 (Jalur Kanan Ke Bawah / Bandung, Inner, X = +2.0, Z: -160 -> 135)
    paths['Setiabudi_South_L1'] = this.buildCurve([
      new THREE.Vector3(2.0, 0, -160),
      new THREE.Vector3(2.0, 0, -75),
      new THREE.Vector3(2.0, 0, -50),
      new THREE.Vector3(2.0, 0, -8),
      new THREE.Vector3(2.0, 0, 50),
      new THREE.Vector3(2.0, 0, 135)
    ], 'Terusan Setiabudi ➔ Setiabudi Selatan (Jalur Kanan Ke Bawah)');

    // 4. Terusan Setiabudi Southbound Lane 2 (Jalur Kanan Ke Bawah, Outer, X = +6.0, Z: -160 -> 135)
    paths['Setiabudi_South_L2'] = this.buildCurve([
      new THREE.Vector3(6.0, 0, -160),
      new THREE.Vector3(6.0, 0, -75),
      new THREE.Vector3(6.0, 0, -50),
      new THREE.Vector3(6.0, 0, -8),
      new THREE.Vector3(6.0, 0, 50),
      new THREE.Vector3(6.0, 0, 135)
    ], 'Setiabudi Southbound (Jalur Kanan Outer)');

    // 5. Simpang 3: Setiabudi Jalur Kiri (X = -5.8) ➔ Belok Masuk Sersan Bajuri
    // Posisi kendaraan belok ke Sersan Bajuri berada di SEBELAH KIRI (X = -5.8) dan jalan terus walau jalur kanan merah
    paths['Setiabudi_To_Sersan_Bajuri'] = this.buildCurve([
      new THREE.Vector3(-5.8, 0, 135),
      new THREE.Vector3(-5.8, 0, 50),
      new THREE.Vector3(-5.8, 0, -8),
      new THREE.Vector3(-5.8, 0, -36),
      new THREE.Vector3(-6.8, 0, -48),
      new THREE.Vector3(-10.5, 0, -58),
      new THREE.Vector3(-16.0, 0, -68),
      new THREE.Vector3(-22.0, 0, -79),
      new THREE.Vector3(-38.1, 0, -100.4),
      new THREE.Vector3(-62.3, 0, -132.3)
    ], 'Setiabudi (Jalur Kiri) ➔ Sersan Bajuri (Masuk Jalur Kiri Ke Atas)');

    // 6. Simpang 3: Jl. Sersan Bajuri Jalur Kiri Ke Bawah (North-East lane) ➔ Masuk Setiabudi Selatan
    paths['Sersan_Bajuri_To_Setiabudi'] = this.buildCurve([
      new THREE.Vector3(-58.1, 0, -135.4),
      new THREE.Vector3(-33.9, 0, -103.6),
      new THREE.Vector3(-19.0, 0, -84.0),
      new THREE.Vector3(-14.5, 0, -78.0),
      new THREE.Vector3(-7.5, 0, -70.0),
      new THREE.Vector3(2.0, 0, -60.0),
      new THREE.Vector3(2.0, 0, -30.0),
      new THREE.Vector3(2.0, 0, 135)
    ], 'Jl. Sersan Bajuri (Jalur Kiri Ke Bawah) ➔ Setiabudi Selatan');

    // 7. Simpang 3: Setiabudi ➔ Belok Masuk Jl. Sersan Urip
    paths['Setiabudi_To_Sersan_Urip'] = this.buildCurve([
      new THREE.Vector3(-2.0, 0, 135),
      new THREE.Vector3(-2.0, 0, -48),
      new THREE.Vector3(1.0, 0, -60),
      new THREE.Vector3(8.0, 0, -66),
      new THREE.Vector3(30.0, 0, -66),
      new THREE.Vector3(72.0, 0, -66)
    ], 'Setiabudi ➔ Belok Masuk Jl. Sersan Urip');

    // 8. Simpang 3: Jl. Sersan Urip ➔ Masuk Setiabudi Selatan
    paths['Sersan_Urip_To_Setiabudi'] = this.buildCurve([
      new THREE.Vector3(70.0, 0, -70),
      new THREE.Vector3(30.0, 0, -70),
      new THREE.Vector3(12.0, 0, -68),
      new THREE.Vector3(4.0, 0, -62),
      new THREE.Vector3(2.0, 0, -45),
      new THREE.Vector3(2.0, 0, 135)
    ], 'Jl. Sersan Urip ➔ Setiabudi Selatan (Bandung)');

    // 9. Setiabudi Southbound Turn Right into Kawasan Kampus UPI (Jl. Perkasa)
    paths['Setiabudi_South_Turn_Perkasa'] = this.buildCurve([
      new THREE.Vector3(2.0, 0, -160),
      new THREE.Vector3(2.0, 0, -20),
      new THREE.Vector3(1.0, 0, 2),
      new THREE.Vector3(-3.0, 0.02, 8.0),
      new THREE.Vector3(-8.0, 0.08, 9.5),
      new THREE.Vector3(-30.0, 0.45, 9.5),
      new THREE.Vector3(-60.0, 0.95, 9.5),
      new THREE.Vector3(-100.0, 1.5, 9.5)
    ], 'Setiabudi ➔ Masuk Kawasan Kampus UPI (Jl. Perkasa)');

    // 10. Setiabudi Northbound Turn Left into Kawasan Kampus UPI
    paths['Setiabudi_North_Turn_Perkasa'] = this.buildCurve([
      new THREE.Vector3(-6.0, 0, 135),
      new THREE.Vector3(-6.0, 0, 30),
      new THREE.Vector3(-6.0, 0, 20),
      new THREE.Vector3(-7.5, 0.05, 14.0),
      new THREE.Vector3(-12.0, 0.15, 10.5),
      new THREE.Vector3(-30.0, 0.45, 9.5),
      new THREE.Vector3(-100.0, 1.5, 9.5)
    ], 'Setiabudi ➔ Masuk Kawasan Kampus UPI (Belok Kiri)');

    // 11. Keluar Kawasan Kampus UPI Belok Kanan ke Setiabudi Selatan
    paths['Perkasa_Exit_Turn_South'] = this.buildCurve([
      new THREE.Vector3(-100.0, 1.5, 14.5),
      new THREE.Vector3(-30.0, 0.45, 14.5),
      new THREE.Vector3(-12.0, 0.15, 14.5),
      new THREE.Vector3(-4.0, 0.05, 16.0),
      new THREE.Vector3(2.0, 0.01, 22.0),
      new THREE.Vector3(2.0, 0, 35.0),
      new THREE.Vector3(2.0, 0, 135.0)
    ], 'Keluar Kawasan UPI ➔ Setiabudi Selatan (Bandung)');

    // 12. Keluar Kawasan Kampus UPI Belok Kiri ke Terusan Setiabudi Utara
    paths['Perkasa_Exit_Turn_North'] = this.buildCurve([
      new THREE.Vector3(-100.0, 1.5, 14.5),
      new THREE.Vector3(-30.0, 0.45, 14.5),
      new THREE.Vector3(-12.0, 0.15, 14.5),
      new THREE.Vector3(-7.5, 0.05, 12.0),
      new THREE.Vector3(-6.0, 0.01, 5.0),
      new THREE.Vector3(-6.0, 0, -10.0),
      new THREE.Vector3(-6.0, 0, -160.0)
    ], 'Keluar Kawasan UPI ➔ Terusan Setiabudi (Ledeng/Lembang)');

    // 13. Setiabudi Belok Masuk Jl. Moh. Yamin (Akses UPI Selatan)
    paths['Setiabudi_Turn_Moh_Yamin'] = this.buildCurve([
      new THREE.Vector3(2.0, 0, -160),
      new THREE.Vector3(2.0, 0, 50),
      new THREE.Vector3(0.0, 0.01, 70),
      new THREE.Vector3(-8.0, 0.02, 75),
      new THREE.Vector3(-25.0, 0.05, 75),
      new THREE.Vector3(-60.0, 0.1, 75)
    ], 'Setiabudi ➔ Belok Masuk Jl. Moh. Yamin (UPI Selatan)');

    return paths;
  }

  buildCurve(points, label) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.2);
    const length = curve.getLength();
    return {
      curve,
      length,
      label,
      startPoint: points[0],
      endPoint: points[points.length - 1]
    };
  }

  initPool(count = 110) {
    // Calibrated vehicle fleet with ample passenger cars for Jl. Perkasa (UPI access)
    const vehicleDistribution = [
      'motorcycle', 'sedan', 'motorcycle', 'suv',
      'motorcycle', 'sedan', 'motorcycle', 'suv',
      'motorcycle', 'angkot', 'motorcycle', 'sedan',
      'motorcycle', 'bus', 'motorcycle', 'suv',
      'motorcycle', 'sedan', 'motorcycle', 'truck',
      'motorcycle', 'suv', 'motorcycle', 'sedan',
      'motorcycle', 'angkot', 'motorcycle', 'suv',
      'motorcycle', 'sedan', 'motorcycle', 'suv'
    ];

    for (let i = 0; i < count; i++) {
      const type = vehicleDistribution[i % vehicleDistribution.length];

      const vehicleObj = this.factory.createVehicle(type);
      vehicleObj.mesh.visible = false;
      this.scene.add(vehicleObj.mesh);

      // Wrapper state
      const agent = {
        vehicle: vehicleObj,
        pathKey: null,
        pathData: null,
        distance: 0,
        speed: 0,
        desiredSpeed: 10,
        maxSpeed: 14,
        acceleration: 2.0,
        deceleration: 4.5,
        isActive: false,
        leadVehicle: null,
        leadDistance: 999,
        heading: 0,
        id: `veh_${i + 1}`,
        plate: `D ${1000 + i} ${type === 'motorcycle' ? 'BDG' : (type === 'bus' ? 'DMR' : (type === 'truck' ? 'LOG' : 'UPI'))}`
      };

      this.vehiclePool.push(agent);
    }
  }

  spawnVehicle(pathKey) {
    const pathData = this.paths[pathKey];
    if (!pathData) return null;

    const isPerkasaPath = pathKey.includes('Perkasa');

    // Get an idle vehicle from pool matching path requirements:
    // Jl. Perkasa (entering or exiting UPI): ONLY CARS (sedan/suv) - NO motorcycles, NO trucks/buses!
    const agent = this.vehiclePool.find(v => {
      if (v.isActive) return false;
      if (isPerkasaPath) {
        return v.vehicle.type === 'sedan' || v.vehicle.type === 'suv';
      }
      return true;
    });
    if (!agent) return null;

    // Dynamic headway check: motorcycles only need 5.2m, larger vehicles need 9.0m
    const minSpawnHeadway = agent.vehicle.type === 'motorcycle' ? 5.2 : 9.0;
    const isBlocked = this.activeVehicles.some(v => v.pathKey === pathKey && v.distance < minSpawnHeadway);
    if (isBlocked) return null;

    // Spatial start-point check to prevent spawning onto any vehicle
    const startPt = pathData.startPoint;
    const isSpatialBlocked = this.activeVehicles.some(v =>
      v.vehicle.mesh.position.distanceTo(startPt) < minSpawnHeadway
    );
    if (isSpatialBlocked) return null;

    agent.isActive = true;
    agent.pathKey = pathKey;
    agent.pathData = pathData;
    agent.distance = 0;

    // Speed configuration per type
    if (agent.vehicle.type === 'motorcycle') {
      agent.desiredSpeed = 10.5 + Math.random() * 3.5; // ~38 - 50 km/h
      agent.acceleration = 3.2;
      agent.deceleration = 5.5;
    } else if (agent.vehicle.type === 'angkot') {
      agent.desiredSpeed = 7.5 + Math.random() * 2.0; // ~27 - 34 km/h
      agent.acceleration = 1.6;
      agent.deceleration = 4.0;
    } else if (agent.vehicle.type === 'bus') {
      agent.desiredSpeed = 7.5 + Math.random() * 1.8; // ~27 - 33 km/h
      agent.acceleration = 1.2;
      agent.deceleration = 3.2;
    } else if (agent.vehicle.type === 'truck') {
      agent.desiredSpeed = 8.0 + Math.random() * 2.0; // ~28 - 36 km/h
      agent.acceleration = 1.4;
      agent.deceleration = 3.5;
    } else {
      // Sedan / SUV
      agent.desiredSpeed = 9.2 + Math.random() * 2.5; // ~33 - 42 km/h
      agent.acceleration = 2.2;
      agent.deceleration = 4.5;
    }

    agent.speed = agent.desiredSpeed * 0.7; // enter at moderate speed
    agent.vehicle.mesh.visible = true;
    agent.vehicle.setLights(this.isNight, this.isSunset);

    // Initial position & heading
    const initialPt = pathData.curve.getPointAt(0);
    const initialTangent = pathData.curve.getTangentAt(0);
    agent.vehicle.mesh.position.copy(initialPt);
    agent.heading = Math.atan2(initialTangent.x, initialTangent.z);
    agent.vehicle.mesh.rotation.y = agent.heading;

    // Turn signal if path is a turning path
    if (pathKey.includes('Turn_Perkasa') || pathKey.includes('Turn_North') || pathKey.includes('Turn_South')) {
      if (pathKey.includes('Turn_Right') || pathKey === 'Setiabudi_South_Turn_Perkasa' || pathKey === 'Perkasa_Exit_Turn_South') {
        agent.vehicle.setTurnSignal('right');
      } else {
        agent.vehicle.setTurnSignal('left');
      }
    } else {
      agent.vehicle.setTurnSignal(null);
    }

    this.activeVehicles.push(agent);
    return agent;
  }

  despawnVehicle(agent) {
    agent.isActive = false;
    agent.vehicle.mesh.visible = false;
    agent.vehicle.setBraking(false);
    agent.vehicle.setTurnSignal(null);

    const idx = this.activeVehicles.indexOf(agent);
    if (idx !== -1) {
      this.activeVehicles.splice(idx, 1);
    }

    if (this.selectedVehicle === agent) {
      this.selectedVehicle = this.activeVehicles[0] || null;
    }
  }

  update(dt, time) {
    if (this.isPaused) return;

    const scaledDt = dt * this.simulationSpeed;

    // Simpang 3 Traffic Light System Cycle Timer
    this.simpangLightTimer += scaledDt;
    let newPhase = this.simpangLightPhase;
    if (this.simpangLightPhase === 'SETIABUDI_GREEN') {
      if (this.simpangLightTimer >= 18.0) {
        newPhase = 'SETIABUDI_YELLOW';
        this.simpangLightTimer = 0;
      }
    } else if (this.simpangLightPhase === 'SETIABUDI_YELLOW') {
      if (this.simpangLightTimer >= 3.0) {
        newPhase = 'ALL_RED_1';
        this.simpangLightTimer = 0;
      }
    } else if (this.simpangLightPhase === 'ALL_RED_1') {
      if (this.simpangLightTimer >= 1.5) {
        newPhase = 'BAJURI_GREEN';
        this.simpangLightTimer = 0;
      }
    } else if (this.simpangLightPhase === 'BAJURI_GREEN') {
      if (this.simpangLightTimer >= 14.0) {
        newPhase = 'BAJURI_YELLOW';
        this.simpangLightTimer = 0;
      }
    } else if (this.simpangLightPhase === 'BAJURI_YELLOW') {
      if (this.simpangLightTimer >= 3.0) {
        newPhase = 'ALL_RED_2';
        this.simpangLightTimer = 0;
      }
    } else if (this.simpangLightPhase === 'ALL_RED_2') {
      if (this.simpangLightTimer >= 1.5) {
        newPhase = 'SETIABUDI_GREEN';
        this.simpangLightTimer = 0;
      }
    }

    if (newPhase !== this.simpangLightPhase) {
      // Detect the critical transition: ALL_RED_2 -> SETIABUDI_GREEN
      // This means Setiabudi Southbound vehicles (from Terusan Setiabudi heading to Bandung)
      // were stopped at the Simpang 3 red light, and NOW released to flow South.
      // These vehicles will arrive at the Jl. Perkasa Zebra Cross in about 10-14 seconds.
      // We must block the zebra cross button during this green wave window so pedestrians
      // don't cause a double red-light situation for these vehicles!
      if (this.simpangLightPhase === 'ALL_RED_2' && newPhase === 'SETIABUDI_GREEN') {
        this.activateGreenWave(14.0);
      }

      this.simpangLightPhase = newPhase;
      if (this.environment && this.environment.setSimpangLightPhase) {
        this.environment.setSimpangLightPhase(this.simpangLightPhase);
      }
    }

    // Green Wave Corridor countdown
    if (this.greenWaveActive) {
      this.greenWaveTimer -= scaledDt;
      if (this.greenWaveTimer <= 0) {
        this.greenWaveTimer = 0;
        this.greenWaveActive = false;
        // Notify pedestrian system that green wave is over
        if (this.pedestrianSystem && typeof this.pedestrianSystem.onGreenWaveEnded === 'function') {
          this.pedestrianSystem.onGreenWaveEnded();
        }
      }
    }

    // 1. Spawning logic to maintain target density
    this.manageSpawning(scaledDt);

    // 2. Physics & Autonomous Car-Following Update
    for (let i = 0; i < this.activeVehicles.length; i++) {
      const agent = this.activeVehicles[i];
      this.updateAgent(agent, scaledDt, time);
    }

    // 3. Clean up finished vehicles
    for (let i = this.activeVehicles.length - 1; i >= 0; i--) {
      const agent = this.activeVehicles[i];
      if (agent.distance >= agent.pathData.length) {
        this.despawnVehicle(agent);
      }
    }
  }

  manageSpawning(dt) {
    const activeCount = this.activeVehicles.length;
    if (activeCount >= this.targetDensity) return;

    // Count down cooldown timers on all paths
    const pathKeys = Object.keys(this.paths);
    pathKeys.forEach(k => {
      this.spawnCooldowns[k] -= dt;
    });

    // Real-world survey calibrated distribution:
    // Terusan Setiabudi arah bawah dilarang belok ke Sersan Bajuri (removed)
    // Sersan Urip dibuat sedikit/jarang sesuai permintaan
    const weightedKeys = [
      // 1. Sersan Bajuri Flow (heavy flow, belok masuk via Jalur Kiri Setiabudi)
      'Sersan_Bajuri_To_Setiabudi', 'Sersan_Bajuri_To_Setiabudi', 'Sersan_Bajuri_To_Setiabudi', 'Sersan_Bajuri_To_Setiabudi',
      'Setiabudi_To_Sersan_Bajuri', 'Setiabudi_To_Sersan_Bajuri', 'Setiabudi_To_Sersan_Bajuri', 'Setiabudi_To_Sersan_Bajuri',

      // 2. Jl. Dr. Setiabudi Arterial (Bandung ⇄ Lembang, 4 lanes)
      'Setiabudi_North_L1', 'Setiabudi_North_L1', 'Setiabudi_North_L1', 'Setiabudi_North_L1',
      'Setiabudi_North_L2', 'Setiabudi_North_L2', 'Setiabudi_North_L2',
      'Setiabudi_South_L1', 'Setiabudi_South_L1', 'Setiabudi_South_L1', 'Setiabudi_South_L1',
      'Setiabudi_South_L2', 'Setiabudi_South_L2', 'Setiabudi_South_L2',

      // 3. Perkasa / Akses Kampus UPI
      'Setiabudi_South_Turn_Perkasa',
      'Setiabudi_North_Turn_Perkasa',
      'Perkasa_Exit_Turn_South',
      'Perkasa_Exit_Turn_North',

      // 4. Sersan Urip (dibuat sangat sedikit/jarang)
      'Setiabudi_To_Sersan_Urip',
      'Sersan_Urip_To_Setiabudi'
    ];

    // Spawn up to 2 vehicles per tick when capacity allows
    const maxSpawns = Math.min(2, this.targetDensity - activeCount);
    for (let s = 0; s < maxSpawns; s++) {
      const candidateKey = weightedKeys[Math.floor(Math.random() * weightedKeys.length)];
      if (this.spawnCooldowns[candidateKey] <= 0) {
        const spawned = this.spawnVehicle(candidateKey);
        if (spawned) {
          const isUrip = candidateKey.includes('Urip');
          const isHighPriority = candidateKey.includes('Bajuri') || candidateKey.includes('Setiabudi_North') || candidateKey.includes('Setiabudi_South');
          const baseRate = isHighPriority ? 26 : 50;
          const baseCooldown = Math.max(0.65, baseRate / this.targetDensity);
          // Sersan Urip gets very high cooldown (26 to 45 seconds) so it remains quiet
          this.spawnCooldowns[candidateKey] = isUrip ? (28.0 + Math.random() * 15.0) : baseCooldown * (0.7 + Math.random() * 0.6);
        }
      }
    }
  }

  updateAgent(agent, dt, time) {
    const curve = agent.pathData.curve;
    const totalLength = agent.pathData.length;

    // Universal 3D Spatial Lane-Following (No deadlocks, zero mutual freezing)
    let leadAgent = null;
    let minGap = 999;

    const agentPos = agent.vehicle.mesh.position;
    const forwardX = Math.sin(agent.heading);
    const forwardZ = Math.cos(agent.heading);
    const rightX = Math.cos(agent.heading);
    const rightZ = -Math.sin(agent.heading);
    const halfLenA = agent.vehicle.length * 0.5;

    for (let j = 0; j < this.activeVehicles.length; j++) {
      const other = this.activeVehicles[j];
      if (other === agent || !other.isActive) continue;

      const otherPos = other.vehicle.mesh.position;
      const dx = otherPos.x - agentPos.x;
      const dz = otherPos.z - agentPos.z;
      const distSq = dx * dx + dz * dz;

      // Only evaluate within 40m proximity
      if (distSq > 1600) continue;

      const halfLenB = other.vehicle.length * 0.5;

      // 1. Same-path lead vehicle ahead
      if (other.pathKey === agent.pathKey && other.distance > agent.distance) {
        const pathGap = (other.distance - agent.distance) - (halfLenA + halfLenB);
        if (pathGap < minGap) {
          minGap = Math.max(0.1, pathGap);
          leadAgent = other;
        }
        continue;
      }

      // 2. Spatial vehicle ahead in the same lane (merging or multi-path)
      // Must be traveling in the SAME general direction (headingDot > 0.65)
      // This strictly avoids mutual deadlocks between cross-traffic!
      const dForward = dx * forwardX + dz * forwardZ;
      if (dForward > 0.15 && dForward < 36.0) {
        const otherForwardX = Math.sin(other.heading);
        const otherForwardZ = Math.cos(other.heading);
        const headingDot = forwardX * otherForwardX + forwardZ * otherForwardZ;

        if (headingDot > 0.65) {
          const dLateral = Math.abs(dx * rightX + dz * rightZ);
          const latTolerance = (agent.vehicle.type === 'motorcycle' && other.vehicle.type === 'motorcycle') ? 1.25 : 1.75;
          if (dLateral < latTolerance) {
            const spatialGap = dForward - (halfLenA + halfLenB);
            if (spatialGap < minGap) {
              minGap = Math.max(0.1, spatialGap);
              leadAgent = other;
            }
          }
        }
      }
    }

    agent.leadVehicle = leadAgent;
    agent.leadDistance = minGap;

    // Intelligent Driver Model (IDM) acceleration calculation
    const v = agent.speed;
    const v0 = agent.desiredSpeed;
    const aMax = agent.acceleration;
    const b = agent.deceleration;
    const s0 = agent.vehicle.type === 'motorcycle' ? 2.0 : (agent.vehicle.type === 'bus' ? 5.5 : (agent.vehicle.type === 'truck' ? 4.8 : 3.5));
    const T = 1.1;

    let deltaV = 0;
    if (leadAgent) {
      deltaV = v - leadAgent.speed;
    }

    // Desired dynamical distance s*
    const sStar = s0 + Math.max(0, v * T + (v * deltaV) / (2 * Math.sqrt(aMax * b)));
    let accel = aMax * (1 - Math.pow(v / v0, 4) - Math.pow(sStar / Math.max(0.4, minGap), 2));

    // Yield logic 1: Zebra Crossing Stop Line
    if (this.pedestrianCrossingActive) {
      accel = this.applyZebraYield(agent, accel);
    }

    // Yield logic 2: Simpang 3 Traffic Light System
    accel = this.applySimpangTrafficLightYield(agent, accel);

    // Yield logic 3: T-Junction Conflict Yielding
    accel = this.applyIntersectionYield(agent, accel);

    // Proportional collision avoidance: if closing in on lead vehicle, match its speed
    if (leadAgent && minGap < s0 * 0.8 && agent.speed > 0) {
      const targetSpeed = Math.max(0, leadAgent.speed);
      if (agent.speed > targetSpeed) {
        agent.speed = THREE.MathUtils.lerp(agent.speed, targetSpeed, dt * 6.0);
      }
    }

    // Bumper safety buffer: only zero velocity if lead vehicle is genuinely stopped and we haven't been stuck
    if (leadAgent && minGap < 0.65 && leadAgent.speed === 0 && (agent.stuckTimer || 0) < 1.5) {
      agent.speed = 0;
    }

    // Bulletproof Anti-Freeze Watchdog: Prevents any vehicle from getting stuck in the middle of the road
    if (agent.speed < 0.4) {
      agent.stuckTimer = (agent.stuckTimer || 0) + dt;

      // Check if stopped legitimately at an active red light stop line
      let isLegitimateRedLight = false;

      // 1. Simpang 3 Setiabudi North L1 stop line (Z ~ -55.5)
      if (this.simpangLightPhase !== 'SETIABUDI_GREEN' && (agent.pathKey === 'Setiabudi_North_L1' || agent.pathKey === 'Setiabudi_North_L2')) {
        if (agentPos.z > -68.0 && agentPos.z < -53.0) isLegitimateRedLight = true;
      }
      // 2. Simpang 3 Sersan Bajuri stop bar (X ~ -14.5)
      if (this.simpangLightPhase !== 'BAJURI_GREEN' && agent.pathKey === 'Sersan_Bajuri_To_Setiabudi') {
        if (agentPos.x < -13.5 && agentPos.x > -26.0) isLegitimateRedLight = true;
      }
      // 3. Simpang 3 Setiabudi South stop line (Z ~ -80.5)
      if (this.simpangLightPhase !== 'SETIABUDI_GREEN' && agent.pathKey.startsWith('Setiabudi_South')) {
        if (agentPos.z > -96.0 && agentPos.z < -78.0) isLegitimateRedLight = true;
      }
      // 4. Zebra Crossing Setiabudi South stop line (Z ~ -12.5)
      if (this.pedestrianCrossingActive && agent.pathKey.startsWith('Setiabudi_South')) {
        if (agentPos.z > -28.0 && agentPos.z < -10.5) isLegitimateRedLight = true;
      }
      // 5. Zebra Crossing Setiabudi North stop line (Z ~ -3.5)
      if (this.pedestrianCrossingActive && agent.pathKey.startsWith('Setiabudi_North')) {
        if (agentPos.z > -5.0 && agentPos.z < 15.0) isLegitimateRedLight = true;
      }

      if (!isLegitimateRedLight) {
        // If stopped in the middle of the road for > 1.8s, force forward acceleration to break deadlock
        if (agent.stuckTimer > 1.8) {
          accel = Math.max(2.2, accel);
          agent.speed = Math.max(2.5, agent.speed);
        }
        // If stuck for > 5.5s (e.g. mutual head-on pinch), cleanly recycle vehicle so the road clears
        if (agent.stuckTimer > 5.5) {
          agent.distance = totalLength;
        }
      }
    } else {
      agent.stuckTimer = 0;
    }

    // Apply acceleration
    agent.speed += accel * dt;
    if (agent.speed < 0) agent.speed = 0;
    if (agent.speed > agent.maxSpeed) agent.speed = agent.maxSpeed;

    // Update braking lights
    const isBraking = accel < -0.8 || (agent.speed === 0 && minGap < 6.0);
    agent.vehicle.setBraking(isBraking);

    // Update distance traveled
    agent.distance += agent.speed * dt;
    const clampedDist = Math.min(totalLength, agent.distance);
    const t = clampedDist / totalLength;
    // Sample position on curve
    const currentPt = curve.getPointAt(t);
    agent.vehicle.mesh.position.copy(currentPt);

    // Look-ahead for steering angle and smooth heading
    const lookAheadDist = Math.min(totalLength, agent.distance + 2.5);
    const lookAheadPt = curve.getPointAt(lookAheadDist / totalLength);
    const lookAheadDir = new THREE.Vector3().subVectors(lookAheadPt, currentPt).normalize();

    const targetHeading = Math.atan2(lookAheadDir.x, lookAheadDir.z);
    // Smooth angle interpolation
    let diff = targetHeading - agent.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    agent.heading += diff * Math.min(1.0, 10.0 * dt);
    agent.vehicle.mesh.rotation.y = agent.heading;

    // Steering wheel angle for front wheels
    const steerAngle = THREE.MathUtils.clamp(diff * 2.8, -0.55, 0.55);
    agent.vehicle.setSteering(steerAngle);

    // Internal vehicle updates (wheel roll, turn signals)
    agent.vehicle.update(dt, time);
  }

  applyZebraYield(agent, currentAccel) {
    // Zebra crossing on Setiabudi is at Z = -8.0
    // Southbound lanes (traveling on East side X > 0, from negative Z to positive Z): stop line at Z = -12.5
    // Northbound lanes (traveling on West side X < 0, from positive Z to negative Z): stop line at Z = -3.5
    const pos = agent.vehicle.mesh.position;

    if (agent.pathKey.startsWith('Setiabudi_South')) {
      // Approaching zebra crossing from North: Z in [-35, -12.0]
      if (pos.z > -35 && pos.z < -11.5) {
        const distToStop = -12.5 - pos.z;
        if (distToStop > 0.5) {
          const decel = (agent.speed * agent.speed) / (2 * distToStop);
          return Math.min(currentAccel, -decel - 0.5);
        } else {
          return -agent.deceleration;
        }
      }
    } else if (agent.pathKey.startsWith('Setiabudi_North')) {
      // Approaching zebra crossing from South: Z in [15, -2.5]
      if (pos.z < 20 && pos.z > -3.0) {
        const distToStop = pos.z - (-3.2);
        if (distToStop > 0.5) {
          const decel = (agent.speed * agent.speed) / (2 * distToStop);
          return Math.min(currentAccel, -decel - 0.5);
        } else {
          return -agent.deceleration;
        }
      }
    }

    return currentAccel;
  }

  applySimpangTrafficLightYield(agent, currentAccel) {
    const pos = agent.vehicle.mesh.position;
    const isSetiabudiGreen = this.simpangLightPhase === 'SETIABUDI_GREEN';
    const isBajuriGreen = this.simpangLightPhase === 'BAJURI_GREEN';

    // 1. Setiabudi Northbound right lane (through traffic L1 on X = -1.9) approaching Simpang 3 (Stop line at Z = -55.5)
    // Moving from positive Z to negative Z
    // IMPORTANT: Kendaraan yang belok ke Sersan Bajuri ('Setiabudi_To_Sersan_Bajuri') berada di JALUR KIRI (X = -5.8)
    // dan BISA JALAN TERUS belok ke Sersan Bajuri walau jalur kanan (Setiabudi North L1) merah!
    if (agent.pathKey === 'Setiabudi_North_L1' || agent.pathKey === 'Setiabudi_North_L2' || agent.pathKey === 'Setiabudi_To_Sersan_Urip') {
      if (!isSetiabudiGreen) {
        // Approaching stop line from South: pos.z in [-28, -54.5]
        if (pos.z < -28 && pos.z > -55.0) {
          const distToStop = pos.z - (-55.2);
          if (distToStop > 0.5) {
            const decel = (agent.speed * agent.speed) / (2 * distToStop);
            return Math.min(currentAccel, -decel - 0.6);
          } else {
            return -agent.deceleration;
          }
        }
      }
    }

    // 2. Setiabudi Southbound approaching Simpang 3 (Stop line at Z = -80.5)
    // Moving from negative Z to positive Z
    if (agent.pathKey.startsWith('Setiabudi_South')) {
      if (!isSetiabudiGreen) {
        // Approaching stop line from North: pos.z in [-108, -81.0]
        if (pos.z > -108 && pos.z < -81.0) {
          const distToStop = -80.8 - pos.z;
          if (distToStop > 0.5) {
            const decel = (agent.speed * agent.speed) / (2 * distToStop);
            return Math.min(currentAccel, -decel - 0.6);
          } else {
            return -agent.deceleration;
          }
        }
      }
    }

    // 3. Sersan Bajuri exiting into Setiabudi (Stop bar at X = -14.5, Z = -78.0)
    // Moving from negative X towards Setiabudi (X = -32 -> -14.5)
    if (agent.pathKey === 'Sersan_Bajuri_To_Setiabudi') {
      if (!isBajuriGreen) {
        if (pos.x < -14.5 && pos.x > -32.0) {
          const distToStop = -14.5 - pos.x;
          if (distToStop > 0.5) {
            const decel = (agent.speed * agent.speed) / (2 * distToStop);
            return Math.min(currentAccel, -decel - 0.6);
          } else {
            return -agent.deceleration;
          }
        }
      }
    }

    // 4. Sersan Urip exiting into Setiabudi (Stop bar at X = 9.2)
    // Moving from positive X towards Setiabudi (X = 30 -> 9.5)
    if (agent.pathKey === 'Sersan_Urip_To_Setiabudi') {
      if (!isBajuriGreen) {
        if (pos.x > 9.5 && pos.x < 32.0) {
          const distToStop = pos.x - 9.5;
          if (distToStop > 0.5) {
            const decel = (agent.speed * agent.speed) / (2 * distToStop);
            return Math.min(currentAccel, -decel - 0.6);
          } else {
            return -agent.deceleration;
          }
        }
      }
    }

    return currentAccel;
  }

  applyIntersectionYield(agent, currentAccel) {
    const pos = agent.vehicle.mesh.position;

    // Case A: Southbound turning right across oncoming into Jl. Perkasa
    // Yield ONLY before crossing the center line (pos.x > 0.6 and pos.z < 6.0).
    // Once it initiates the turn and crosses center (pos.x <= 0.6), it MUST CLEAR THE INTERSECTION!
    if (agent.pathKey === 'Setiabudi_South_Turn_Perkasa') {
      if (pos.z > -10.0 && pos.z < 6.0 && pos.x > 0.6) {
        const oncomingPresent = this.activeVehicles.some(v =>
          v.pathKey.startsWith('Setiabudi_North') &&
          v.vehicle.mesh.position.z > 6.0 &&
          v.vehicle.mesh.position.z < 30.0
        );
        if (oncomingPresent) {
          const distToConflict = 6.0 - pos.z;
          if (distToConflict > 1.0) {
            const decel = (agent.speed * agent.speed) / (2 * distToConflict);
            return Math.min(currentAccel, -decel - 0.8);
          } else {
            return -agent.deceleration;
          }
        }
      }
    }

    // Case B: Exiting Jl. Perkasa at stop line (X = -8.5)
    // Yield ONLY while behind the stop line (pos.x < -9.2).
    // Once it passes pos.x >= -9.2, it has entered Setiabudi and MUST NOT STOP IN THE ROADWAY!
    if (agent.pathKey.startsWith('Perkasa_Exit')) {
      if (pos.x < -9.2 && pos.x > -22.0) {
        const setiabudiTrafficPresent = this.activeVehicles.some(v =>
          (v.pathKey.startsWith('Setiabudi_South') || v.pathKey.startsWith('Setiabudi_North')) &&
          Math.abs(v.vehicle.mesh.position.z - 12.0) < 16.0
        );
        if (setiabudiTrafficPresent) {
          const distToStop = -9.2 - pos.x;
          if (distToStop > 1.0) {
            const decel = (agent.speed * agent.speed) / (2 * distToStop);
            return Math.min(currentAccel, -decel - 0.8);
          } else {
            return -agent.deceleration;
          }
        }
      }
    }

    // Case C: Exiting Sersan Bajuri yields before entering Setiabudi Southbound
    // Yield ONLY behind the stop bar (pos.x < -14.2).
    // CRITICAL: Once pos.x >= -14.2, the vehicle has entered the apron/roadway.
    // It MUST NOT stop inside Setiabudi (which causes mutual deadlocks with Southbound traffic)!
    // It merges smoothly using regular car-following dynamics (IDM).
    if (agent.pathKey === 'Sersan_Bajuri_To_Setiabudi') {
      if (pos.x < -14.2 && pos.x > -28.0) {
        const setiabudiSouthPresent = this.activeVehicles.some(v =>
          v !== agent &&
          v.pathKey.startsWith('Setiabudi_South') &&
          v.vehicle.mesh.position.z > -86.0 &&
          v.vehicle.mesh.position.z < -66.0
        );
        if (setiabudiSouthPresent) {
          const distToMerge = -14.2 - pos.x;
          if (distToMerge > 0.8) {
            const decel = (agent.speed * agent.speed) / (2 * distToMerge);
            return Math.min(currentAccel, -decel - 0.7);
          } else {
            return -agent.deceleration;
          }
        }
      }
    }

    return currentAccel;
  }

  setDensity(density) {
    this.targetDensity = density;
  }

  setSpeed(mult) {
    this.simulationSpeed = mult;
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    return this.isPaused;
  }

  setLightingMode(mode) {
    this.isNight = mode === 'night';
    this.isSunset = mode === 'sunset';
    this.activeVehicles.forEach(a => {
      a.vehicle.setLights(this.isNight, this.isSunset);
    });
  }

  setPedestrianCrossing(isActive) {
    this.pedestrianCrossingActive = isActive;
  }

  getVehicleUnderMouse(raycaster) {
    const meshes = this.activeVehicles.map(a => a.vehicle.mesh);
    const intersects = raycaster.intersectObjects(meshes, true);
    if (intersects.length > 0) {
      let current = intersects[0].object;
      while (current.parent && current.parent !== this.scene) {
        const found = this.activeVehicles.find(a => a.vehicle.mesh === current);
        if (found) return found;
        current = current.parent;
      }
    }
    return null;
  }

  selectNextVehicle() {
    if (this.activeVehicles.length === 0) return null;
    const currentIndex = this.activeVehicles.indexOf(this.selectedVehicle);
    const nextIndex = (currentIndex + 1) % this.activeVehicles.length;
    this.selectedVehicle = this.activeVehicles[nextIndex];
    return this.selectedVehicle;
  }

  getStats() {
    let cars = 0;
    let bikes = 0;
    let angkots = 0;
    let buses = 0;
    let trucks = 0;
    let totalSpeed = 0;

    this.activeVehicles.forEach(a => {
      if (a.vehicle.type === 'motorcycle') bikes++;
      else if (a.vehicle.type === 'angkot') angkots++;
      else if (a.vehicle.type === 'bus') buses++;
      else if (a.vehicle.type === 'truck') trucks++;
      else cars++;
      totalSpeed += a.speed;
    });

    const avgSpeedKmh = this.activeVehicles.length > 0 ? (totalSpeed / this.activeVehicles.length) * 3.6 : 0;

    let los = 'C (Ramai Lancar • Arus Stabil)';
    if (this.targetDensity > 50 || avgSpeedKmh < 18) los = 'D (Mendekati Jenuh • Jam Sibuk)';
    else if (this.targetDensity < 20 && avgSpeedKmh > 38) los = 'B (Sangat Lancar)';

    return {
      total: this.activeVehicles.length,
      cars,
      bikes,
      angkots,
      buses,
      trucks,
      avgSpeedKmh: Math.round(avgSpeedKmh),
      los
    };
  }
}
