import * as THREE from 'three';
import { AcousticSignalAudio } from '../audio/acousticSignalAudio.js';

export class PedestrianSystem {
  constructor(scene, trafficSystem, environment = null) {
    this.scene = scene;
    this.trafficSystem = trafficSystem;
    this.environment = environment;

    // Crossing state & modes: 'normal' | 'tunanetra'
    this.crossingMode = 'normal';
    this.isCrossing = false;
    this.crossingDirection = 1; // 1: East to West (8.5 -> -8.5), -1: West to East
    this.crossingSpeed = 3.10; // m/s walking speed (crosses 17m in ~5.5 seconds)
    this.totalCrossingDistance = 17.0; // from X = +8.5 to X = -8.5

    // Active crossing duration: 11 detik (rombongan menyeberang ~5.5s, sisa ~5.5s fase hijau untuk membubarkan diri ke segala arah)
    this.crossingDuration = 11.0;
    this.crossingRemaining = 0;

    // Delay sebelum rombongan antrean baru muncul di trotoar agar tidak menumpuk dengan orang yang baru menyeberang
    this.waitingQueueSpawnDelay = 0;

    // 2-Minute (120 Detik) Button Lockdown / Cooldown Phase
    this.buttonLockdownDuration = 120.0;
    this.buttonLockdownRemaining = 0;
    this.isButtonLocked = false;

    // Corridor Green Wave Integration
    this.isGreenWaveBlocking = false;
    this.greenWaveRemaining = 0;
    this.pendingCrossingRequest = false;
    this.pendingCrossingMode = null;

    // System Switcher: 'after' (Pake Sistem) vs 'before' (Tanpa Sistem)
    this.systemMode = 'after';

    // Data Empiris Lapangan (Survei 30 Menit Simpang Setiabudi - Jl. Perkasa)
    // Sore: 53 orang di Mupenas, 116 orang ilegal sembarangan
    // Pagi: 84 orang di Mupenas, 195 orang ilegal sembarangan
    this.sessions = {
      morning: {
        id: 'morning',
        name: 'Sesi Pagi (07:00 - 07:30)',
        period: '07:00 - 07:30 WIB (30 Menit)',
        mupenas: 84,
        illegal: 195,
        total: 279,
        illegalRatio: 195 / 279, // 69.89%
        avgDelayBefore: '14.8 detik/kendaraan',
        avgDelayAfter: '3.2 detik/kendaraan',
        riskBefore: 'Kritis (Puncak Jam Sekolah & Kampus)',
        riskAfter: 'Sangat Rendah (Tertib Jalur Zebra Cross)'
      },
      evening: {
        id: 'evening',
        name: 'Sesi Sore (16:30 - 17:00)',
        period: '16:30 - 17:00 WIB (30 Menit)',
        mupenas: 53,
        illegal: 116,
        total: 169,
        illegalRatio: 116 / 169, // 68.64%
        avgDelayBefore: '12.4 detik/kendaraan',
        avgDelayAfter: '2.8 detik/kendaraan',
        riskBefore: 'Tinggi (Arus Balik Sore Hari)',
        riskAfter: 'Sangat Rendah (Lampu Pelican Terkendali)'
      }
    };
    this.currentSessionId = 'evening';

    // Autonomous jaywalker pedestrians (active during 'before' mode)
    this.autonomousPedestrians = [];
    this.autoSpawnTimer = 0;
    this.autoSpawnInterval = 2.4; // spawn new pedestrian every ~2.4s

    // Realtime simulation statistics
    this.stats = {
      illegalCrossed: 0,
      mupenasCrossed: 0,
      conflictsCount: 0, // pengereman mendadak
      lastHonkTime: 0
    };

    // Acoustic audio & Indonesian voice guidance synthesizer
    this.audio = new AcousticSignalAudio();

    // Multilateral Queue & Platoon Crossing System
    // Consolidates both Mupenas zebra crossers and illegal jaywalkers into 1 organized crossing
    this.waitingQueue = [];
    this.activeCrossingGroup = [];

    // Pedestrians who finished crossing and are dispersing / walking along sidewalks (turning left/right)
    this.dispersingPedestrians = [];
    this.dispersalCounter = 0;

    // Create 3D pedestrian character (kept for backward compatibility)
    this.pedestrianMesh = this.createPedestrianCharacter();
    this.pedestrianMesh.visible = false;
    this.scene.add(this.pedestrianMesh);

    // Initialize waiting queue on sidewalk for 'after' mode
    this.initWaitingQueue();

    // Callbacks for UI updates: onStateChange(...)
    this.onStateChange = null;
  }

  setEnvironment(env) {
    this.environment = env;
  }

  setCrossingMode(mode) {
    this.crossingMode = mode;
    this.updateCharacterAccessories();
  }

  getRemainingCrossingSeconds() {
    return Math.max(0, Math.ceil(this.crossingRemaining));
  }

  getRemainingLockdownSeconds() {
    return Math.max(0, Math.ceil(this.buttonLockdownRemaining));
  }

  getRemainingGreenWaveSeconds() {
    return Math.max(0, Math.ceil(this.greenWaveRemaining));
  }

  // Called by TrafficSystem when Simpang 3 releases Setiabudi GREEN (green wave starts)
  onGreenWaveActivated(duration) {
    this.isGreenWaveBlocking = true;
    this.greenWaveRemaining = duration;
    this.notifyState();
  }

  // Called by TrafficSystem when green wave window has elapsed (vehicles have passed)
  onGreenWaveEnded() {
    this.isGreenWaveBlocking = false;
    this.greenWaveRemaining = 0;

    // If a crossing was queued during green wave, execute it now!
    if (this.pendingCrossingRequest) {
      this.pendingCrossingRequest = false;
      const mode = this.pendingCrossingMode || this.crossingMode;
      this.pendingCrossingMode = null;
      this.executeCrossing(mode);
    } else {
      this.notifyState();
    }
  }

  createPedestrianCharacter(options = {}) {
    const root = new THREE.Group();

    const skinColor = options.skinColor || '#e0ac69';
    const shirtColor = options.shirtColor || '#1e3a8a';
    const pantsColor = options.pantsColor || '#334155';
    const shoesColor = options.shoesColor || '#0f172a';
    const hairColor = options.hairColor || '#1e293b';
    const scale = options.scale || 1.0;
    const isTunaNetra = !!options.isTunaNetra;

    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const clothesMat = new THREE.MeshLambertMaterial({ color: shirtColor });
    const pantsMat = new THREE.MeshLambertMaterial({ color: pantsColor });
    const shoesMat = new THREE.MeshLambertMaterial({ color: shoesColor });
    const hairMat = new THREE.MeshLambertMaterial({ color: hairColor });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.36, 0.52, 0.22);
    const torso = new THREE.Mesh(torsoGeo, clothesMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    root.add(torso);

    // Head
    const headGeo = new THREE.SphereGeometry(0.14, 10, 10);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.48;
    head.castShadow = true;
    root.add(head);

    // Hair
    const hairGeo = new THREE.SphereGeometry(0.145, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 1.49;
    root.add(hair);

    // Dark Sunglasses (for Tuna Netra mode)
    const glassesGeo = new THREE.BoxGeometry(0.24, 0.05, 0.06);
    const glassesMat = new THREE.MeshBasicMaterial({ color: '#111111' });
    const glasses = new THREE.Mesh(glassesGeo, glassesMat);
    glasses.position.set(0, 1.48, 0.13);
    glasses.visible = isTunaNetra;
    root.add(glasses);
    root.glasses = glasses;

    // Left Arm
    const armGeo = new THREE.BoxGeometry(0.1, 0.42, 0.1);
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.24, 1.25, 0);
    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.y = -0.18;
    leftArmGroup.add(leftArm);
    root.add(leftArmGroup);

    // Right Arm (holds White Cane in Tuna Netra mode)
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.24, 1.25, 0);
    const rightArm = new THREE.Mesh(armGeo, skinMat);
    rightArm.position.y = -0.18;
    rightArmGroup.add(rightArm);

    // White Cane (Tongkat Tunanetra) attached to right hand
    const caneGroup = new THREE.Group();
    caneGroup.position.set(0, -0.38, 0.08);

    // Long white shaft
    const caneGeo = new THREE.CylinderGeometry(0.014, 0.014, 1.25, 8);
    const caneMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const caneMesh = new THREE.Mesh(caneGeo, caneMat);
    caneMesh.position.y = -0.45;
    caneMesh.rotation.x = 0.35;
    caneGroup.add(caneMesh);

    // Red reflective section near cane tip (Standard Indonesian & International White Cane)
    const redTipGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.25, 8);
    const redTipMat = new THREE.MeshLambertMaterial({ color: '#dd0000' });
    const redTip = new THREE.Mesh(redTipGeo, redTipMat);
    redTip.position.y = -0.85;
    redTip.rotation.x = 0.35;
    caneGroup.add(redTip);

    caneGroup.visible = isTunaNetra;
    rightArmGroup.add(caneGroup);
    root.cane = caneGroup;
    root.add(rightArmGroup);

    // Left Leg
    const legGeo = new THREE.BoxGeometry(0.12, 0.65, 0.12);
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.1, 0.72, 0);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.y = -0.3;
    leftLegGroup.add(leftLeg);

    // Left Shoe
    const shoeGeo = new THREE.BoxGeometry(0.12, 0.08, 0.2);
    const leftShoe = new THREE.Mesh(shoeGeo, shoesMat);
    leftShoe.position.set(0, -0.62, 0.04);
    leftLegGroup.add(leftShoe);
    root.add(leftLegGroup);

    // Right Leg
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.1, 0.72, 0);
    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.y = -0.3;
    rightLegGroup.add(rightLeg);

    // Right Shoe
    const rightShoe = new THREE.Mesh(shoeGeo, shoesMat);
    rightShoe.position.set(0, -0.62, 0.04);
    rightLegGroup.add(rightShoe);
    root.add(rightLegGroup);

    root.leftArm = leftArmGroup;
    root.rightArm = rightArmGroup;
    root.leftLeg = leftLegGroup;
    root.rightLeg = rightLegGroup;

    if (scale !== 1.0) {
      root.scale.set(scale, scale, scale);
    }

    return root;
  }

  getPlatoonTargetSize() {
    // Sesi Pagi: 84 Mupenas + 195 Ilegal = 279 orang (~9.3 orang/menit) -> 10 orang per rombongan
    // Sesi Sore: 53 Mupenas + 116 Ilegal = 169 orang (~5.6 orang/menit) -> 7 orang per rombongan
    return this.currentSessionId === 'morning' ? 10 : 7;
  }

  initWaitingQueue() {
    this.clearWaitingQueue();
    if (this.systemMode !== 'after') return;

    const targetCount = this.getPlatoonTargetSize();
    const isEastToWest = this.crossingDirection === 1;
    const baseCurbX = isEastToWest ? 8.8 : -8.8;
    const depthDir = isEastToWest ? 1 : -1;

    // Visual diversity palette: students, lecturers, residents, commuters
    const characterConfigs = [
      // 0. Lead person (or Tuna Netra)
      { shirt: '#1e3a8a', pants: '#334155', zOffset: 0.0, depth: 0.0, speed: 3.10 },
      // 1. Student UPI (Royal Blue)
      { shirt: '#2563eb', pants: '#1e293b', zOffset: 0.55, depth: 0.45, speed: 3.05 },
      // 2. Dosen / Resident (Emerald Green)
      { shirt: '#10b981', pants: '#334155', zOffset: -0.55, depth: 0.35, speed: 2.95 },
      // 3. Mahasiswa (Orange)
      { shirt: '#f97316', pants: '#475569', zOffset: 1.10, depth: 0.75, speed: 3.15 },
      // 4. Mahasiswi (Denim Blue)
      { shirt: '#1d4ed8', pants: '#1e293b', zOffset: -1.05, depth: 0.65, speed: 3.20 },
      // 5. Warga Sipil (Slate Grey)
      { shirt: '#64748b', pants: '#334155', zOffset: 0.30, depth: 1.15, speed: 2.85 },
      // 6. Mahasiswa (Violet)
      { shirt: '#8b5cf6', pants: '#1e293b', zOffset: -0.30, depth: 1.05, speed: 3.00 },
      // 7. Pelajar (Sky Blue, extra for morning peak)
      { shirt: '#0284c7', pants: '#334155', zOffset: 0.80, depth: 1.45, speed: 3.10 },
      // 8. Warga (Amber)
      { shirt: '#d97706', pants: '#475569', zOffset: -0.80, depth: 1.55, speed: 2.90 },
      // 9. Mahasiswa (Rose Red)
      { shirt: '#e11d48', pants: '#1e293b', zOffset: 0.05, depth: 1.85, speed: 3.05 }
    ];

    for (let i = 0; i < targetCount; i++) {
      const cfg = characterConfigs[i % characterConfigs.length];
      const isLead = (i === 0);
      const isTunaNetra = isLead && (this.crossingMode === 'tunanetra');

      const mesh = this.createPedestrianCharacter({
        shirtColor: cfg.shirt,
        pantsColor: cfg.pants,
        isTunaNetra,
        scale: 0.95 + (i % 3) * 0.04
      });

      const standX = baseCurbX + (cfg.depth * depthDir);
      const standZ = -8.0 + cfg.zOffset;
      const destX = isEastToWest ? -8.8 : 8.8;

      mesh.position.set(standX, 0.22, standZ);
      mesh.rotation.y = isEastToWest ? -Math.PI / 2 : Math.PI / 2;
      mesh.visible = true;
      this.scene.add(mesh);

      this.waitingQueue.push({
        id: `wait_${i}`,
        mesh,
        startX: standX,
        destX,
        currentX: standX,
        zPos: standZ,
        speed: (isTunaNetra ? 2.65 : cfg.speed),
        progress: 0,
        totalDist: Math.abs(destX - standX),
        isTunaNetra,
        legLeft: mesh.leftLeg,
        legRight: mesh.rightLeg,
        armLeft: mesh.leftArm,
        armRight: mesh.rightArm,
        cane: mesh.cane,
        glasses: mesh.glasses,
        animOffset: i * 0.85,
        routeType: i % 3 // 0: Masuk Gerbang Kampus UPI / Jl. Perkasa, 1: Belok Utara (Ledeng), 2: Belok Selatan (Bandung)
      });
    }

    this.notifyState();
  }

  clearWaitingQueue() {
    for (const p of this.waitingQueue) {
      if (p.mesh) this.scene.remove(p.mesh);
    }
    this.waitingQueue = [];
  }

  clearActiveCrossingGroup() {
    for (const p of this.activeCrossingGroup) {
      if (p.mesh) this.scene.remove(p.mesh);
    }
    this.activeCrossingGroup = [];
  }

  clearDispersingPedestrians() {
    for (const p of this.dispersingPedestrians) {
      if (p.mesh) this.scene.remove(p.mesh);
    }
    this.dispersingPedestrians = [];
  }

  transitionToSidewalk(pedData, crossingDirOverride = null) {
    if (!pedData || !pedData.mesh) return;

    const crossDir = (crossingDirOverride !== null) ? crossingDirOverride : this.crossingDirection;
    const isEastToWest = (crossDir === 1);
    const arrivedWest = isEastToWest;

    const disperseIndex = this.dispersalCounter++;
    const currentZ = (pedData.zPos !== undefined) ? pedData.zPos : (pedData.mesh ? pedData.mesh.position.z : -8.0);
    const currentX = (pedData.destX !== undefined) ? pedData.destX : (pedData.currentX !== undefined ? pedData.currentX : pedData.mesh.position.x);

    // 3-Way Natural Dispersal (Anti-Numpuk & Anti-Freeze):
    // Rute 0 (40%): Lanjut lurus masuk Gerbang Kampus UPI / Jl. Perkasa (arah Barat) atau Gang Mupenas (arah Timur)
    // Rute 1 (30%): Belok Kanan / ke Trotoar Utara menuju Terminal Ledeng (-Z)
    // Rute 2 (30%): Belok Kiri / ke Trotoar Selatan menuju Gegerkalong & Bandung (+Z)
    const routeType = (pedData.routeType !== undefined) ? pedData.routeType : (disperseIndex % 3);

    let isStraight = false;
    let walkDirX = 0;
    let walkDirZ = 0;
    let targetHeading = 0;
    let targetSidewalkX = currentX;
    let targetZ = currentZ;

    if (routeType === 0) {
      // Rute 0: Lurus masuk ke kawasan gerbang kampus / jalan perkasa
      isStraight = true;
      walkDirX = arrivedWest ? -1 : 1;
      walkDirZ = 0;
      targetHeading = arrivedWest ? -Math.PI / 2 : Math.PI / 2;
      targetZ = currentZ;
    } else if (routeType === 1) {
      // Rute 1: Belok ke trotoar utara (Ledeng, -Z)
      isStraight = false;
      walkDirX = 0;
      walkDirZ = -1;
      targetHeading = arrivedWest ? -Math.PI : Math.PI;
      this.northDispersalCount = (this.northDispersalCount || 0) + 1;
      const lanes = arrivedWest ? [-9.40, -10.10, -10.80] : [9.40, 10.10, 10.80];
      targetSidewalkX = lanes[this.northDispersalCount % lanes.length];
    } else {
      // Rute 2: Belok ke trotoar selatan (Bandung, +Z)
      isStraight = false;
      walkDirX = 0;
      walkDirZ = 1;
      targetHeading = 0;
      this.southDispersalCount = (this.southDispersalCount || 0) + 1;
      const lanes = arrivedWest ? [-9.40, -10.10, -10.80] : [9.40, 10.10, 10.80];
      targetSidewalkX = lanes[this.southDispersalCount % lanes.length];
    }

    const mesh = pedData.mesh;
    const initialScale = (mesh.scale && mesh.scale.x) ? mesh.scale.x : 1.0;

    mesh.position.x = currentX;
    mesh.position.z = currentZ;

    // Kecepatan langkah sigap & lincah (2.30 - 2.85 m/s) agar langsung bubar tanpa kesan freeze
    const speedVariation = ((disperseIndex * 7) % 5) * 0.08;
    const walkSpeed = (pedData.isTunaNetra ? 2.30 : 2.58) + speedVariation;

    const dispersingPed = {
      mesh,
      currentX,
      zPos: currentZ,
      baseY: 0.22,
      isStraight,
      walkDirX,
      walkDirZ,
      targetHeading,
      targetSidewalkX,
      targetZ,
      walkSpeed,
      walkedDistance: 0,
      maxWalkDistance: 28.0 + (disperseIndex % 4) * 4.0, // Berjalan 28 s.d 40 meter
      initialScale,
      isTunaNetra: !!pedData.isTunaNetra,
      legLeft: pedData.legLeft || mesh.leftLeg,
      legRight: pedData.legRight || mesh.rightLeg,
      armLeft: pedData.armLeft || mesh.leftArm,
      armRight: pedData.armRight || mesh.rightArm,
      cane: pedData.cane || mesh.cane,
      animOffset: pedData.animOffset || (disperseIndex * 0.85),
      walkPhase: (pedData.walkPhase !== undefined) ? pedData.walkPhase : (disperseIndex * 0.85)
    };

    // Langkah awal langsung dieksekusi agar tidak ada jeda 1 frame pun saat menyentuh trotoar
    const initialDt = 1 / 60;
    if (isStraight) {
      dispersingPed.currentX += walkDirX * walkSpeed * initialDt;
      mesh.position.x = dispersingPed.currentX;
    } else {
      dispersingPed.zPos += walkDirZ * walkSpeed * initialDt;
      mesh.position.z = dispersingPed.zPos;
    }
    dispersingPed.walkedDistance += walkSpeed * initialDt;

    mesh.visible = true;
    if (!mesh.parent) {
      this.scene.add(mesh);
    }

    this.dispersingPedestrians.push(dispersingPed);

    // Batasi maksimum pejalan kaki dispersi agar hemat drawcalls
    if (this.dispersingPedestrians.length > 30) {
      const oldest = this.dispersingPedestrians.shift();
      if (oldest && oldest.mesh) {
        this.scene.remove(oldest.mesh);
      }
    }
  }

  updateDispersingPedestrians(dt, time) {
    if (!this.dispersingPedestrians || this.dispersingPedestrians.length === 0) return;

    const toRemove = [];
    for (let i = 0; i < this.dispersingPedestrians.length; i++) {
      const p = this.dispersingPedestrians[i];
      if (!p || !p.mesh) {
        toRemove.push(p);
        continue;
      }

      // 1. Perputaran sudut badan halus menuju arah tujuan (rotasi terpendek)
      const angleDiff = Math.atan2(Math.sin(p.targetHeading - p.mesh.rotation.y), Math.cos(p.targetHeading - p.mesh.rotation.y));
      p.mesh.rotation.y += angleDiff * Math.min(1.0, dt * 10.0);

      // 2. Pergerakan posisi sesuai rute (lurus ke kampus atau menyusuri trotoar)
      if (p.isStraight) {
        p.currentX += p.walkDirX * p.walkSpeed * dt;
        p.zPos = THREE.MathUtils.lerp(p.zPos, p.targetZ, dt * 4.0);
      } else {
        p.currentX = THREE.MathUtils.lerp(p.currentX, p.targetSidewalkX, dt * 6.0);
        p.zPos += p.walkDirZ * p.walkSpeed * dt;
      }

      const stepDist = p.walkSpeed * dt;
      p.walkedDistance += stepDist;

      // 3. Ayunan tangan dan kaki terus aktif dan dinamis tanpa freeze
      const walkFreq = p.isTunaNetra ? 13.0 : 15.5;
      p.walkPhase = (p.walkPhase !== undefined ? p.walkPhase : (time * walkFreq + p.animOffset)) + dt * walkFreq;
      const limbSwing = Math.sin(p.walkPhase) * 0.70;

      if (p.legLeft) p.legLeft.rotation.x = limbSwing;
      if (p.legRight) p.legRight.rotation.x = -limbSwing;
      if (p.armLeft) p.armLeft.rotation.x = -limbSwing;

      if (p.isTunaNetra) {
        if (p.armRight) p.armRight.rotation.x = 0.35 + Math.sin(p.walkPhase * 0.7) * 0.12;
        if (p.cane) p.cane.rotation.z = Math.sin(p.walkPhase * 0.5) * 0.35;
      } else {
        if (p.armRight) p.armRight.rotation.x = limbSwing;
      }

      // Bobbing naik-turun langkah alami di trotoar
      const bob = Math.abs(Math.sin(p.walkPhase * 2)) * 0.035;
      p.mesh.position.set(p.currentX, (p.baseY || 0.22) + bob, p.zPos);

      // 4. Fade-out mengecil halus ketika sudah jauh dari area simpang
      if (p.walkedDistance > p.maxWalkDistance - 5.0) {
        const remaining = Math.max(0, p.maxWalkDistance - p.walkedDistance);
        const scaleRatio = remaining / 5.0;
        const currentScale = p.initialScale * Math.max(0.01, scaleRatio);
        p.mesh.scale.set(currentScale, currentScale, currentScale);
      }

      // 5. Bersihkan mesh saat mencapai akhir perjalanan
      if (p.walkedDistance >= p.maxWalkDistance) {
        this.scene.remove(p.mesh);
        toRemove.push(p);
      }
    }

    if (toRemove.length > 0) {
      for (const p of toRemove) {
        const idx = this.dispersingPedestrians.indexOf(p);
        if (idx !== -1) {
          this.dispersingPedestrians.splice(idx, 1);
        }
      }
    }
  }

  updateCharacterAccessories() {
    const isTunaNetra = this.crossingMode === 'tunanetra';
    if (this.pedestrianMesh) {
      if (this.pedestrianMesh.cane) this.pedestrianMesh.cane.visible = isTunaNetra;
      if (this.pedestrianMesh.glasses) this.pedestrianMesh.glasses.visible = isTunaNetra;
    }
    if (this.waitingQueue && this.waitingQueue[0]) {
      this.waitingQueue[0].isTunaNetra = isTunaNetra;
      if (this.waitingQueue[0].glasses) this.waitingQueue[0].glasses.visible = isTunaNetra;
      if (this.waitingQueue[0].cane) this.waitingQueue[0].cane.visible = isTunaNetra;
      this.waitingQueue[0].speed = isTunaNetra ? 2.65 : 3.10;
    }
  }

  requestCrossing(mode = null) {
    if (this.isCrossing || this.isButtonLocked) return false;

    if (mode) {
      this.crossingMode = mode;
      this.updateCharacterAccessories();
    }

    // Check if green wave from Simpang 3 is currently active
    // If so, queue the request and wait until the vehicle platoon has passed
    if (this.isGreenWaveBlocking) {
      this.pendingCrossingRequest = true;
      this.pendingCrossingMode = this.crossingMode;

      // Give audio feedback that request is accepted but delayed
      if (this.crossingMode === 'tunanetra') {
        this.audio.playButtonFeedback();
        this.audio.speakWaitGreenWave();
      }

      this.notifyState();
      return true; // Request accepted but queued
    }

    // No green wave blocking - execute immediately
    return this.executeCrossing(this.crossingMode);
  }

  executeCrossing(mode) {
    if (this.isCrossing) return false;

    this.crossingMode = mode || this.crossingMode;
    this.isCrossing = true;
    this.crossingRemaining = this.crossingDuration;
    this.isButtonLocked = true;
    this.buttonLockdownRemaining = this.buttonLockdownDuration; // 120 seconds!

    // Ensure waiting queue is initialized; if empty, create it now
    if (this.waitingQueue.length === 0) {
      this.initWaitingQueue();
    }

    // Synchronize tuna netra accessories on lead character
    if (this.waitingQueue[0]) {
      const isTunaNetra = (this.crossingMode === 'tunanetra');
      this.waitingQueue[0].isTunaNetra = isTunaNetra;
      if (this.waitingQueue[0].glasses) this.waitingQueue[0].glasses.visible = isTunaNetra;
      if (this.waitingQueue[0].cane) this.waitingQueue[0].cane.visible = isTunaNetra;
      this.waitingQueue[0].speed = isTunaNetra ? 2.65 : 3.10;
    }

    // Transition waiting queue into active platoon crossing group!
    this.activeCrossingGroup = [...this.waitingQueue];
    this.waitingQueue = [];

    // Recompute exact totalDist for each person from their starting curb
    const isEastToWest = this.crossingDirection === 1;
    const destX = isEastToWest ? -8.8 : 8.8;
    for (const p of this.activeCrossingGroup) {
      p.progress = 0;
      p.startX = p.mesh.position.x;
      p.currentX = p.startX;
      p.destX = destX;
      p.totalDist = Math.abs(destX - p.startX);
    }

    // Hide legacy single mesh
    if (this.pedestrianMesh) this.pedestrianMesh.visible = false;

    // Adjust walking speed: 17 meters crossed briskly within 5 - 7 seconds
    this.crossingSpeed = (this.crossingMode === 'tunanetra') ? 2.65 : 3.10;

    // 1. Notify traffic system to stop approaching vehicles for zebra cross
    this.trafficSystem.setPedestrianCrossing(true);

    // 2. Switch 3D Pelican Signal lights to GREEN
    if (this.environment && typeof this.environment.setPedestrianSignalLight === 'function') {
      this.environment.setPedestrianSignalLight(true);
    }

    // 3. Audio & Voice Guidance for Tuna Netra
    if (this.crossingMode === 'tunanetra') {
      this.audio.playButtonFeedback();
      this.audio.startCrossingAudio(() => this.getRemainingCrossingSeconds(), true);
    }

    this.notifyState();
    return true;
  }

  cancelCrossing() {
    this.isButtonLocked = false;
    this.buttonLockdownRemaining = 0;
    this.pendingCrossingRequest = false;
    this.pendingCrossingMode = null;
    if (this.isCrossing) {
      this.crossingRemaining = 0;
      this.finishCrossing();
    } else {
      if (this.systemMode === 'after' && this.waitingQueue.length === 0) {
        this.initWaitingQueue();
      }
      this.notifyState();
    }
  }

  finishCrossing() {
    this.isCrossing = false;

    // Transition any remaining active crossing pedestrians to sidewalk dispersal
    if (this.activeCrossingGroup && this.activeCrossingGroup.length > 0) {
      for (const p of this.activeCrossingGroup) {
        this.stats.mupenasCrossed++;
        this.transitionToSidewalk(p, this.crossingDirection);
      }
      this.activeCrossingGroup = [];
    }

    // Alternate crossing direction: next crossing will be from the opposite sidewalk!
    this.crossingDirection *= -1;

    // Clear waiting queue during cooldown: sidewalk remains clean and open for dispersing walkers!
    this.waitingQueue = [];
    this.waitingQueueSpawnDelay = 0;

    // Reset dispersal lane allocation counters for next group
    this.northDispersalCount = 0;
    this.southDispersalCount = 0;

    // Release traffic: vehicles resume normal movement!
    this.trafficSystem.setPedestrianCrossing(false);

    // Revert 3D Pelican Signal lights to RED for pedestrians
    if (this.environment && typeof this.environment.setPedestrianSignalLight === 'function') {
      this.environment.setPedestrianSignalLight(false);
    }

    // Stop acoustic audio
    if (this.crossingMode === 'tunanetra') {
      this.audio.stopCrossingAudio(true);
    }

    this.notifyState();
  }

  setSystemMode(mode) {
    if (this.systemMode === mode) return;
    this.systemMode = mode;

    if (this.systemMode === 'after') {
      // Re-enable curb fences & Ivy plants
      if (this.environment && typeof this.environment.setFencesVisible === 'function') {
        this.environment.setFencesVisible(true);
      }
      // Remove all autonomous jaywalkers from scene
      for (const ped of this.autonomousPedestrians) {
        if (ped.mesh) this.scene.remove(ped.mesh);
      }
      this.autonomousPedestrians = [];
      this.clearDispersingPedestrians();

      // Initialize orderly waiting queue at Mupenas zebra cross
      this.initWaitingQueue();
    } else {
      // "Tanpa Sistem": Remove sidewalk fences (open sidewalks)
      if (this.environment && typeof this.environment.setFencesVisible === 'function') {
        this.environment.setFencesVisible(false);
      }
      // Cancel active pelican crossing & clear waiting queue
      if (this.isCrossing) {
        this.finishCrossing();
      }
      this.clearWaitingQueue();
      this.clearActiveCrossingGroup();
      this.clearDispersingPedestrians();
    }

    this.notifyState();
  }

  setSession(sessionId) {
    if (this.sessions[sessionId]) {
      this.currentSessionId = sessionId;
      if (this.systemMode === 'after' && !this.isCrossing) {
        this.initWaitingQueue();
      }
      this.notifyState();
    }
  }

  getActiveCrossingPedestrians() {
    const list = [];
    if (this.isCrossing && this.activeCrossingGroup && this.activeCrossingGroup.length > 0) {
      for (let i = 0; i < this.activeCrossingGroup.length; i++) {
        const p = this.activeCrossingGroup[i];
        if (p && p.mesh && p.mesh.visible) {
          list.push({
            x: p.currentX,
            z: p.zPos,
            speed: p.speed,
            raw: p
          });
        }
      }
    }
    // Fallback if legacy single mesh is used
    if (list.length === 0 && this.isCrossing && this.pedestrianMesh && this.pedestrianMesh.visible) {
      list.push({
        x: this.pedestrianMesh.position.x,
        z: this.pedestrianMesh.position.z,
        speed: this.crossingSpeed,
        raw: null
      });
    }
    return list;
  }

  getCurrentSession() {
    return this.sessions[this.currentSessionId] || this.sessions.evening;
  }

  getStats() {
    return {
      ...this.stats,
      activeJaywalkers: this.autonomousPedestrians.length
    };
  }

  createAutonomousPedestrianMesh(isIllegal) {
    const group = new THREE.Group();

    // Random civilian shirt colors
    const shirtColors = isIllegal
      ? ['#ef4444', '#f97316', '#dc2626', '#b91c1c', '#f59e0b']
      : ['#3b82f6', '#10b981', '#64748b', '#0284c7', '#0d9488'];

    const shirtColor = shirtColors[Math.floor(Math.random() * shirtColors.length)];
    const skinMat = new THREE.MeshLambertMaterial({ color: '#e0ac69' });
    const clothesMat = new THREE.MeshLambertMaterial({ color: shirtColor });
    const pantsMat = new THREE.MeshLambertMaterial({ color: '#334155' });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.38, 0.54, 0.22);
    const torso = new THREE.Mesh(torsoGeo, clothesMat);
    torso.position.y = 0.92;
    group.add(torso);

    // Head
    const headGeo = new THREE.BoxGeometry(0.22, 0.24, 0.22);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.35;
    group.add(head);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.14, 0.62, 0.14);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(0.10, 0.33, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(-0.10, 0.33, 0);
    group.add(rightLeg);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.10, 0.48, 0.10);
    const leftArm = new THREE.Mesh(armGeo, clothesMat);
    leftArm.position.set(0.26, 0.92, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, clothesMat);
    rightArm.position.set(-0.26, 0.92, 0);
    group.add(rightArm);

    group.leftLeg = leftLeg;
    group.rightLeg = rightLeg;
    group.leftArm = leftArm;
    group.rightArm = rightArm;

    // Overhead 3D Warning Cone Marker for illegal crossings
    if (isIllegal) {
      const markerGeo = new THREE.ConeGeometry(0.16, 0.28, 4);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.y = 1.82;
      marker.rotation.x = Math.PI;
      group.add(marker);
      group.cautionMarker = marker;
    }

    return group;
  }

  spawnAutonomousPedestrian() {
    if (this.autonomousPedestrians.length >= 8) return;

    const session = this.getCurrentSession();
    const isIllegal = Math.random() < session.illegalRatio;

    // Direction: 1 = East to West (8.6 -> -8.6), -1 = West to East (-8.6 -> 8.6)
    const direction = Math.random() > 0.5 ? 1 : -1;
    const startX = direction === 1 ? 8.6 : -8.6;
    const endX = direction === 1 ? -8.6 : 8.6;

    let zPos = -8.0;
    if (isIllegal) {
      if (Math.random() > 0.5) {
        zPos = -22 - Math.random() * 45; // North of zebra cross
      } else {
        zPos = 12 + Math.random() * 50;  // South of zebra cross
      }
    } else {
      zPos = -8.0 + (Math.random() - 0.5) * 2.2; // At Mupenas zebra cross
    }

    const speed = 1.30 + Math.random() * 0.45;
    const mesh = this.createAutonomousPedestrianMesh(isIllegal);
    mesh.position.set(startX, 0.22, zPos);
    mesh.rotation.y = direction === 1 ? -Math.PI / 2 : Math.PI / 2;
    this.scene.add(mesh);

    this.autonomousPedestrians.push({
      mesh,
      direction,
      currentX: startX,
      targetX: endX,
      zPos,
      speed,
      isIllegal,
      progress: 0,
      totalDist: 17.2,
      legLeft: mesh.leftLeg,
      legRight: mesh.rightLeg,
      armLeft: mesh.leftArm,
      armRight: mesh.rightArm,
      cautionMarker: mesh.cautionMarker
    });
  }

  isPathBlockedByVehicle(pedX, pedZ, direction) {
    if (!this.trafficSystem || !this.trafficSystem.activeVehicles) return false;

    // Predicted position for next step
    const moveStep = direction === 1 ? -0.8 : 0.8;
    const nextX = pedX + moveStep;

    for (let i = 0; i < this.trafficSystem.activeVehicles.length; i++) {
      const v = this.trafficSystem.activeVehicles[i];
      if (!v.isActive) continue;

      // If vehicle is stopped or yielding to pedestrian, it is granting right of way!
      // The pedestrian should cross smoothly without freezing in front of the vehicle!
      if (v.speed < 1.0 || v.isYieldingPedestrian) continue;

      const vPos = v.vehicle.mesh.position;
      const vLen = v.vehicle.length || 4.2;
      const vWid = v.vehicle.width || 1.8;

      const halfLen = vLen * 0.5 + 0.35;
      const halfWid = vWid * 0.5 + 0.35;

      // Check if pedestrian Z intersects vehicle length bounding box
      const dz = Math.abs(vPos.z - pedZ);
      if (dz < halfLen) {
        // Direct overlap or proximate contact
        const dxCurrent = Math.abs(vPos.x - pedX);
        if (dxCurrent < halfWid) {
          return true;
        }

        // Stepping into vehicle path/body on next step
        const dxNext = Math.abs(vPos.x - nextX);
        if (dxNext < halfWid) {
          return true;
        }
      }
    }
    return false;
  }

  handleAutonomousPedestrians(dt, time) {
    if (this.systemMode !== 'before') return;

    this.autoSpawnTimer += dt;
    if (this.autoSpawnTimer >= this.autoSpawnInterval) {
      this.autoSpawnTimer = 0;
      this.spawnAutonomousPedestrian();
    }

    const toRemove = [];
    for (const ped of this.autonomousPedestrians) {
      // Check if path is blocked by vehicle in front
      const isBlocked = this.isPathBlockedByVehicle(ped.currentX, ped.zPos, ped.direction);

      if (isBlocked) {
        // Halt and stand in place, return limbs smoothly to standing stance
        ped.legLeft.rotation.x = THREE.MathUtils.lerp(ped.legLeft.rotation.x, 0, dt * 8.0);
        ped.legRight.rotation.x = THREE.MathUtils.lerp(ped.legRight.rotation.x, 0, dt * 8.0);
        ped.armLeft.rotation.x = THREE.MathUtils.lerp(ped.armLeft.rotation.x, 0, dt * 8.0);
        ped.armRight.rotation.x = THREE.MathUtils.lerp(ped.armRight.rotation.x, 0, dt * 8.0);
      } else {
        ped.progress += (ped.speed * dt) / ped.totalDist;
        ped.currentX = THREE.MathUtils.lerp(
          ped.direction === 1 ? 8.6 : -8.6,
          ped.direction === 1 ? -8.6 : 8.6,
          ped.progress
        );

        const walkPhase = time * 14.0 + (ped.zPos * 0.5);
        const limbSwing = Math.sin(walkPhase) * 0.65;
        ped.legLeft.rotation.x = limbSwing;
        ped.legRight.rotation.x = -limbSwing;
        ped.armLeft.rotation.x = -limbSwing;
        ped.armRight.rotation.x = limbSwing;

        const bob = Math.abs(Math.sin(walkPhase * 2)) * 0.03;
        let y = 0.02;
        if (ped.progress < 0.08 || ped.progress > 0.92) {
          y = 0.22;
        }
        ped.mesh.position.set(ped.currentX, y + bob, ped.zPos);
      }

      if (ped.cautionMarker) {
        ped.cautionMarker.rotation.y = time * 4.0;
        ped.cautionMarker.position.y = 1.82 + Math.sin(time * 6.0) * 0.06;
      }

      if (ped.progress >= 1.0) {
        toRemove.push(ped);
        if (ped.isIllegal) {
          this.stats.illegalCrossed++;
        } else {
          this.stats.mupenasCrossed++;
        }

        // Remove warning cone marker if present
        if (ped.cautionMarker) {
          ped.mesh.remove(ped.cautionMarker);
          ped.cautionMarker = null;
        }

        // Transition to sidewalk dispersal walking (turning right/left along sidewalk)
        this.transitionToSidewalk({
          mesh: ped.mesh,
          animOffset: Math.random() * 2.0,
          legLeft: ped.legLeft,
          legRight: ped.legRight,
          armLeft: ped.armLeft,
          armRight: ped.armRight,
          isTunaNetra: false,
          routeType: Math.floor(Math.random() * 3)
        }, ped.direction);
      }
    }

    for (const p of toRemove) {
      // Retain mesh in scene as it transitioned to dispersingPedestrians
      const idx = this.autonomousPedestrians.indexOf(p);
      if (idx !== -1) this.autonomousPedestrians.splice(idx, 1);
    }
  }

  applyJaywalkerYield(agent, currentAccel, dt) {
    if (this.systemMode !== 'before' || this.autonomousPedestrians.length === 0) {
      return currentAccel;
    }

    const vehPos = agent.vehicle.mesh.position;
    const isSetiabudi = agent.pathKey && agent.pathKey.startsWith('Setiabudi');
    if (!isSetiabudi) return currentAccel;

    const isSouthbound = agent.pathKey.startsWith('Setiabudi_South');
    const isNorthbound = agent.pathKey.startsWith('Setiabudi_North');

    for (const ped of this.autonomousPedestrians) {
      if (ped.currentX < -7.4 || ped.currentX > 7.4) continue;

      const latDiff = Math.abs(vehPos.x - ped.currentX);
      if (latDiff > 2.2) continue;

      // Check if pedestrian has already passed our vehicle's lane
      const moveDir = ped.direction === 1 ? -1 : 1;
      const isMovingAway = (moveDir < 0 && ped.currentX < vehPos.x - 0.8) || (moveDir > 0 && ped.currentX > vehPos.x + 0.8);
      if (isMovingAway) continue; // Already crossed past our lane!

      let gap = 999;
      if (isSouthbound && ped.zPos > vehPos.z) {
        gap = ped.zPos - vehPos.z;
      } else if (isNorthbound && ped.zPos < vehPos.z) {
        gap = vehPos.z - ped.zPos;
      }

      if (gap > 0.4 && gap < 13.5) {
        if (gap < 4.8) {
          this.recordConflict(agent, ped);
          return -6.5;
        } else {
          const decel = (agent.speed * agent.speed) / (2 * gap);
          return Math.min(currentAccel, -decel - 1.2);
        }
      }
    }

    return currentAccel;
  }

  recordConflict(agent, ped) {
    const now = performance.now();
    if (now - this.stats.lastHonkTime > 2200) {
      this.stats.lastHonkTime = now;
      this.stats.conflictsCount++;
      if (this.audio && typeof this.audio.playHonk === 'function') {
        this.audio.playHonk();
      }
      this.notifyState();
    }
  }

  notifyState() {
    if (this.onStateChange) {
      const greenWaveInfo = {
        isBlocking: this.isGreenWaveBlocking,
        remaining: this.getRemainingGreenWaveSeconds(),
        isPending: this.pendingCrossingRequest
      };
      const empiricalInfo = {
        systemMode: this.systemMode,
        currentSession: this.getCurrentSession(),
        stats: this.stats,
        activeJaywalkers: this.autonomousPedestrians.length,
        waitingQueueCount: this.waitingQueue ? this.waitingQueue.length : 0,
        activePlatoonCount: (this.activeCrossingGroup ? this.activeCrossingGroup.length : 0) + (this.dispersingPedestrians ? this.dispersingPedestrians.length : 0),
        platoonTargetSize: this.getPlatoonTargetSize()
      };
      this.onStateChange(
        this.isCrossing,
        this.isButtonLocked,
        this.getRemainingCrossingSeconds(),
        this.getRemainingLockdownSeconds(),
        this.crossingMode,
        greenWaveInfo,
        empiricalInfo
      );
    }
  }

  update(dt, time) {
    let stateChanged = false;

    // Handle autonomous pedestrians in 'before' mode
    if (this.systemMode === 'before') {
      this.handleAutonomousPedestrians(dt, time);
    }

    // Always update pedestrians who reached the sidewalk and are dispersing (turning right/left)
    this.updateDispersingPedestrians(dt, time);

    // Waiting queue replenishment logic:
    // When in lockdown (120s cooldown), the destination sidewalk remains 100% clean and clear of frozen crowds.
    // The next waiting queue only spawns when cooldown is nearly over (<= 10s) or finished.
    if (this.systemMode === 'after' && !this.isCrossing && this.waitingQueue.length === 0) {
      if (!this.isButtonLocked || this.buttonLockdownRemaining <= 10.0) {
        this.initWaitingQueue();
        stateChanged = true;
      }
    }

    // 0. Green Wave Corridor countdown (synced with trafficSystem)
    if (this.isGreenWaveBlocking) {
      this.greenWaveRemaining -= dt;
      if (this.greenWaveRemaining <= 0) {
        this.greenWaveRemaining = 0;
      }
      stateChanged = true;
    }

    // 1. Active Pedestrian Platoon Crossing Phase
    if (this.isCrossing) {
      this.crossingRemaining -= dt;

      if (this.crossingRemaining <= 0) {
        this.crossingRemaining = 0;
        this.finishCrossing();
      } else {
        // Animate all active pedestrians in the crossing platoon
        let allFinished = true;
        const toDisperse = [];
        const group = (this.activeCrossingGroup && this.activeCrossingGroup.length > 0)
          ? this.activeCrossingGroup
          : [];

        for (let i = 0; i < group.length; i++) {
          const p = group[i];
          // Hanya cek halangan kendaraan jika masih berada di badan jalan (belum sampai trotoar)
          const isOnRoad = Math.abs(p.currentX) < 7.8;
          const isBlocked = isOnRoad && this.isPathBlockedByVehicle(p.currentX, p.zPos, this.crossingDirection);

          if (isBlocked) {
            // Pause standing safely for fast-moving vehicle
            if (p.legLeft) p.legLeft.rotation.x = THREE.MathUtils.lerp(p.legLeft.rotation.x, 0, dt * 8.0);
            if (p.legRight) p.legRight.rotation.x = THREE.MathUtils.lerp(p.legRight.rotation.x, 0, dt * 8.0);
            if (p.armLeft) p.armLeft.rotation.x = THREE.MathUtils.lerp(p.armLeft.rotation.x, 0, dt * 8.0);
            if (p.armRight) p.armRight.rotation.x = THREE.MathUtils.lerp(p.armRight.rotation.x, 0, dt * 8.0);
            allFinished = false;
          } else {
            p.progress += (p.speed * dt) / (p.totalDist || 17.0);

            // Maintain continuous walking limb phase
            const walkFreq = p.isTunaNetra ? 13.5 : 16.0;
            p.walkPhase = (p.walkPhase !== undefined ? p.walkPhase : (time * walkFreq + (p.animOffset || 0))) + dt * walkFreq;
            const limbSwing = Math.sin(p.walkPhase) * 0.70;

            if (p.legLeft) p.legLeft.rotation.x = limbSwing;
            if (p.legRight) p.legRight.rotation.x = -limbSwing;
            if (p.armLeft) p.armLeft.rotation.x = -limbSwing;

            if (p.isTunaNetra) {
              if (p.armRight) p.armRight.rotation.x = 0.35 + Math.sin(p.walkPhase * 0.7) * 0.12;
              if (p.cane) p.cane.rotation.z = Math.sin(p.walkPhase * 0.5) * 0.38;
            } else {
              if (p.armRight) p.armRight.rotation.x = limbSwing;
            }

            if (p.progress >= 1.0) {
              p.progress = 1.0;
              p.currentX = p.destX;
              p.mesh.position.set(p.destX, 0.22, p.zPos);
              toDisperse.push(p);
            } else {
              allFinished = false;
              p.currentX = THREE.MathUtils.lerp(p.startX, p.destX, p.progress);

              // Smooth curved turn approach when nearing sidewalk (progress >= 0.85)
              let headingAngle = (this.crossingDirection === 1) ? -Math.PI / 2 : Math.PI / 2;
              if (p.progress >= 0.85) {
                const turnFactor = (p.progress - 0.85) / 0.15; // 0 to 1
                if (p.routeType === 1) {
                  const targetTurn = (this.crossingDirection === 1) ? -Math.PI : Math.PI;
                  headingAngle = THREE.MathUtils.lerp(headingAngle, targetTurn, turnFactor);
                } else if (p.routeType === 2) {
                  headingAngle = THREE.MathUtils.lerp(headingAngle, 0, turnFactor);
                }
              }
              p.mesh.rotation.y = headingAngle;

              // Vertical walking bob
              const bob = Math.abs(Math.sin(p.walkPhase * 2)) * 0.035;
              let y = 0.02;
              if (p.progress < 0.05 || p.progress > 0.95) {
                y = 0.22; // on sidewalk curb
              }
              p.mesh.position.set(p.currentX, y + bob, p.zPos);
            }
          }
        }

        // Transition pedestrians who reached destination curb into sidewalk walk (turning right/left)
        if (toDisperse.length > 0) {
          for (const p of toDisperse) {
            const idx = this.activeCrossingGroup.indexOf(p);
            if (idx !== -1) {
              this.activeCrossingGroup.splice(idx, 1);
            }
            this.stats.mupenasCrossed++;
            this.transitionToSidewalk(p, this.crossingDirection);
          }
        }

        // Fase penyeberangan tetap aktif penuh sampai waktu crossingRemaining habis (11.0s)
        // agar seluruh pejalan kaki terlihat jelas membubarkan diri ke trotoar dan gerbang kampus
      }
      stateChanged = true;
    } else if (this.systemMode === 'after') {
      // Idle waiting queue standing on sidewalk near zebra cross (gentle breathing & weight shifts, not frozen statues)
      if (this.waitingQueue && this.waitingQueue.length > 0) {
        for (let i = 0; i < this.waitingQueue.length; i++) {
          const p = this.waitingQueue[i];
          const idlePhase = time * 2.2 + p.animOffset;
          if (p.legLeft) p.legLeft.rotation.x = Math.sin(idlePhase * 0.5) * 0.03;
          if (p.legRight) p.legRight.rotation.x = -Math.sin(idlePhase * 0.5) * 0.03;
          if (p.armLeft) p.armLeft.rotation.x = Math.sin(idlePhase) * 0.06;
          if (p.isTunaNetra) {
            if (p.armRight) p.armRight.rotation.x = 0.35 + Math.sin(idlePhase * 0.4) * 0.04;
            if (p.cane) p.cane.rotation.z = Math.sin(idlePhase * 0.3) * 0.05;
          } else {
            if (p.armRight) p.armRight.rotation.x = -Math.sin(idlePhase) * 0.06;
          }
          const idleBob = Math.sin(idlePhase) * 0.006;
          p.mesh.position.set(p.startX, 0.22 + idleBob, p.zPos);
          p.mesh.rotation.y = this.crossingDirection === 1 ? -Math.PI / 2 : Math.PI / 2;
        }
      }
    }

    // 2. Button Lockdown / Cooldown Phase (120 seconds countdown)
    if (this.isButtonLocked) {
      this.buttonLockdownRemaining -= dt;
      if (this.buttonLockdownRemaining <= 0) {
        this.buttonLockdownRemaining = 0;
        this.isButtonLocked = false;
        // Inisialisasi antrean baru setelah masa lockdown selesai
        if (this.systemMode === 'after' && !this.isCrossing && this.waitingQueue.length === 0) {
          this.initWaitingQueue();
        }
      }
      stateChanged = true;
    }

    if (stateChanged) {
      this.notifyState();
    }
  }
}
