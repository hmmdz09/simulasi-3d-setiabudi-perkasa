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
    this.crossingProgress = 0; // 0 to 1
    this.crossingSpeed = 2.25; // m/s walking speed (accelerated brisk crossing)
    this.totalCrossingDistance = 17.0; // from X = +8.5 to X = -8.5

    // Active crossing duration (lampu hijau pejalan kaki menyala: 10 detik)
    this.crossingDuration = 10.0;
    this.crossingRemaining = 0;

    // 2-Minute (120 Detik) Button Lockdown / Cooldown Phase
    this.buttonLockdownDuration = 120.0;
    this.buttonLockdownRemaining = 0;
    this.isButtonLocked = false;

    // Corridor Green Wave Integration:
    // When the Simpang 3 signal turns green for Setiabudi, vehicles released from the red light
    // at Terusan Setiabudi will travel south and reach the Jl. Perkasa zebra cross in ~10-14s.
    // During this green wave period, the crossing button is temporarily blocked to prevent
    // double red-light situations for those vehicles.
    this.isGreenWaveBlocking = false;
    this.greenWaveRemaining = 0;
    this.pendingCrossingRequest = false; // queued request while green wave is active
    this.pendingCrossingMode = null;

    // Acoustic audio & Indonesian voice guidance synthesizer
    this.audio = new AcousticSignalAudio();

    // Create 3D pedestrian character
    this.pedestrianMesh = this.createPedestrianCharacter();
    this.pedestrianMesh.visible = false;
    this.scene.add(this.pedestrianMesh);

    // Callbacks for UI updates: onStateChange(isCrossing, isButtonLocked, crossingSec, lockdownSec, mode, greenWaveInfo)
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

  createPedestrianCharacter() {
    const root = new THREE.Group();

    const skinMat = new THREE.MeshLambertMaterial({ color: '#e0ac69' });
    const clothesMat = new THREE.MeshLambertMaterial({ color: '#1e3a8a' }); // UPI Blue shirt
    const pantsMat = new THREE.MeshLambertMaterial({ color: '#334155' });
    const shoesMat = new THREE.MeshLambertMaterial({ color: '#0f172a' });
    const hairMat = new THREE.MeshLambertMaterial({ color: '#1e293b' });

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
    glasses.visible = false;
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

    caneGroup.visible = false;
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

    return root;
  }

  updateCharacterAccessories() {
    const isTunaNetra = this.crossingMode === 'tunanetra';
    if (this.pedestrianMesh) {
      if (this.pedestrianMesh.cane) this.pedestrianMesh.cane.visible = isTunaNetra;
      if (this.pedestrianMesh.glasses) this.pedestrianMesh.glasses.visible = isTunaNetra;
    }
  }

  requestCrossing(mode = null) {
    if (this.isCrossing || this.isButtonLocked) return false;

    if (mode) {
      this.crossingMode = mode;
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
    this.crossingProgress = 0;
    this.pedestrianMesh.visible = true;

    // Adjust walking speed: 17 meters crossed briskly within ~7.5 - 8.8 seconds
    this.crossingSpeed = (this.crossingMode === 'tunanetra') ? 1.95 : 2.25;

    // Update 3D character accessories (white cane & glasses)
    this.updateCharacterAccessories();

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

    // Start position (sidewalk curb at zebra crossing Z = -8.0)
    const startX = this.crossingDirection === 1 ? 8.5 : -8.5;
    this.pedestrianMesh.position.set(startX, 0.22, -8.0);
    this.pedestrianMesh.rotation.y = this.crossingDirection === 1 ? -Math.PI / 2 : Math.PI / 2;

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
      this.notifyState();
    }
  }

  finishCrossing() {
    this.isCrossing = false;
    this.pedestrianMesh.visible = false;
    this.crossingDirection *= -1;

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

  notifyState() {
    if (this.onStateChange) {
      // Include green wave info as 6th parameter
      const greenWaveInfo = {
        isBlocking: this.isGreenWaveBlocking,
        remaining: this.getRemainingGreenWaveSeconds(),
        isPending: this.pendingCrossingRequest
      };
      this.onStateChange(
        this.isCrossing,
        this.isButtonLocked,
        this.getRemainingCrossingSeconds(),
        this.getRemainingLockdownSeconds(),
        this.crossingMode,
        greenWaveInfo
      );
    }
  }

  update(dt, time) {
    let stateChanged = false;

    // 0. Green Wave Corridor countdown (synced with trafficSystem)
    if (this.isGreenWaveBlocking) {
      this.greenWaveRemaining -= dt;
      if (this.greenWaveRemaining <= 0) {
        this.greenWaveRemaining = 0;
        // Note: actual green wave end is triggered by trafficSystem.onGreenWaveEnded()
        // but we track the countdown here for UI display
      }
      stateChanged = true;
    }

    // 1. Active Pedestrian Crossing Phase (15 seconds)
    if (this.isCrossing) {
      this.crossingRemaining -= dt;

      if (this.crossingRemaining <= 0) {
        this.crossingRemaining = 0;
        this.finishCrossing();
      } else {
        // Walk across the road
        this.crossingProgress += (this.crossingSpeed * dt) / this.totalCrossingDistance;
        this.crossingProgress = Math.min(1.0, this.crossingProgress);

        // Animate brisk walking limbs matching accelerated speed
        const walkFreq = (this.crossingMode === 'tunanetra') ? 10.0 : 12.5;
        const walkPhase = time * walkFreq;
        const limbSwing = Math.sin(walkPhase) * 0.62;
        this.pedestrianMesh.leftLeg.rotation.x = limbSwing;
        this.pedestrianMesh.rightLeg.rotation.x = -limbSwing;
        this.pedestrianMesh.leftArm.rotation.x = -limbSwing;

        if (this.crossingMode === 'tunanetra') {
          // White cane sweeping motion across the ground
          this.pedestrianMesh.rightArm.rotation.x = 0.35 + Math.sin(walkPhase * 0.7) * 0.12;
          if (this.pedestrianMesh.cane) {
            this.pedestrianMesh.cane.rotation.z = Math.sin(time * 6.5) * 0.38;
          }
        } else {
          this.pedestrianMesh.rightArm.rotation.x = limbSwing;
        }

        // Slight vertical bounce
        const bob = Math.abs(Math.sin(walkPhase * 2)) * 0.035;

        // Current X position
        const startX = this.crossingDirection === 1 ? 8.5 : -8.5;
        const endX = this.crossingDirection === 1 ? -8.5 : 8.5;
        const currentX = THREE.MathUtils.lerp(startX, endX, this.crossingProgress);

        let y = 0.02;
        if (this.crossingProgress < 0.08 || this.crossingProgress > 0.92) {
          y = 0.22;
        }
        this.pedestrianMesh.position.set(currentX, y + bob, -8.0);
        this.pedestrianMesh.rotation.y = this.crossingDirection === 1 ? -Math.PI / 2 : Math.PI / 2;
      }
      stateChanged = true;
    }

    // 2. Button Lockdown / Cooldown Phase (120 seconds countdown)
    if (this.isButtonLocked) {
      this.buttonLockdownRemaining -= dt;
      if (this.buttonLockdownRemaining <= 0) {
        this.buttonLockdownRemaining = 0;
        this.isButtonLocked = false;
      }
      stateChanged = true;
    }

    if (stateChanged) {
      this.notifyState();
    }
  }
}
