import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MaterialManager } from './world/materials.js';
import { CityEnvironment } from './world/environment.js';
import { VehicleFactory } from './vehicles/vehicleFactory.js';
import { TrafficSystem } from './vehicles/trafficSystem.js';
import { PedestrianSystem } from './pedestrians/pedestrianSystem.js';
import { HUDManager } from './ui/hud.js';
import { VehicleDetector } from './ai/vehicleDetector.js';
import { PageNavigationManager } from './ui/pageNav.js';

export class TrafficSimulationApp {
  constructor() {
    this.container = document.getElementById('canvas-container');

    // Clock & timing
    this.clock = new THREE.Clock();

    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#87ceeb');
    this.scene.fog = new THREE.FogExp2('#87ceeb', 0.0035);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);

    // Camera & Controls
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 800);
    this.camera.position.set(38, 52, 38);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // prevent going below ground
    this.controls.minDistance = 2;
    this.controls.maxDistance = 220;
    this.controls.target.set(0, 1, 0);

    // Camera Modes: 'drone' | 'orbit' | 'chase' | 'zebra' | 'upi'
    this.cameraMode = 'drone';
    this.controls.screenSpacePanning = true;

    // Keyboard state for Drone & Orbit exploration (WASD / Arrow Keys)
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false
    };

    // Raycaster for clicking vehicles
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Lighting setup
    this.initLights();

    // Systems initialization
    this.materialManager = new MaterialManager();
    this.environment = new CityEnvironment(this.scene, this.materialManager);
    this.vehicleFactory = new VehicleFactory(this.materialManager);
    this.trafficSystem = new TrafficSystem(this.scene, this.vehicleFactory);
    this.trafficSystem.setEnvironment(this.environment);
    this.pedestrianSystem = new PedestrianSystem(this.scene, this.trafficSystem, this.environment);
    this.trafficSystem.setPedestrianSystem(this.pedestrianSystem); // Bidirectional link for green wave corridor
    this.hud = new HUDManager(this);
    this.vehicleDetector = new VehicleDetector(this);
    this.pageNav = new PageNavigationManager(this);

    // Initial lighting state
    this.lightingMode = 'day';
    this.setLightingMode('day');

    // Event listeners
    window.addEventListener('resize', this.onWindowResize.bind(this));
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));

    // Initial camera mode
    this.setCameraMode('drone');

    // Start loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initLights() {
    // 1. Hemisphere Light (Sky & Ground)
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.85);
    this.scene.add(this.hemiLight);

    // 2. Main Sun / Directional Light with Optimized Shadows
    this.sunLight = new THREE.DirectionalLight(0xfff6e5, 1.8);
    this.sunLight.position.set(50, 80, 45);
    this.sunLight.castShadow = true;

    // Fast 1024x1024 shadow map (prevents GPU lag)
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 250;
    const d = 85;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;

    this.scene.add(this.sunLight);

    // 3. Ambient Light for soft fill
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.ambientLight);
  }

  setLightingMode(mode) {
    this.lightingMode = mode;

    if (mode === 'day') {
      // Clear tropical blue daylight
      this.scene.background.set('#87ceeb');
      this.scene.fog.color.set('#87ceeb');
      this.scene.fog.density = 0.0025;

      this.sunLight.intensity = 1.9;
      this.sunLight.color.set('#fff8ec');
      this.sunLight.position.set(50, 80, 45);

      this.hemiLight.intensity = 0.85;
      this.hemiLight.color.set('#ffffff');
      this.hemiLight.groundColor.set('#444455');
      this.ambientLight.intensity = 0.3;
    } else if (mode === 'sunset') {
      // Warm golden hour sunset over Bandung hills
      this.scene.background.set('#fb8500');
      this.scene.fog.color.set('#f77f00');
      this.scene.fog.density = 0.004;

      this.sunLight.intensity = 1.4;
      this.sunLight.color.set('#ff9e00');
      this.sunLight.position.set(-80, 25, -20); // low western sun

      this.hemiLight.intensity = 0.6;
      this.hemiLight.color.set('#ffd166');
      this.hemiLight.groundColor.set('#540b0e');
      this.ambientLight.intensity = 0.25;
    } else if (mode === 'night') {
      // Deep twilight with cool moonlight & city glow
      this.scene.background.set('#0b132b');
      this.scene.fog.color.set('#0b132b');
      this.scene.fog.density = 0.0045;

      this.sunLight.intensity = 0.25; // Moon light
      this.sunLight.color.set('#90e0ef');
      this.sunLight.position.set(-40, 70, 60);

      this.hemiLight.intensity = 0.2;
      this.hemiLight.color.set('#48cae4');
      this.hemiLight.groundColor.set('#1c2541');
      this.ambientLight.intensity = 0.15;
    }

    this.environment.setLightingMode(mode);
    this.trafficSystem.setLightingMode(mode);
  }

  setCameraMode(mode) {
    this.cameraMode = mode;

    if (mode === 'drone') {
      this.controls.enabled = true;
      this.controls.screenSpacePanning = true;
      this.controls.minDistance = 15;
      this.controls.maxDistance = 350;
      this.controls.maxPolarAngle = Math.PI / 2.3; // High isometric perspective
      this.controls.minPolarAngle = 0.2;
      this.camera.position.set(30, 44, 20);
      this.controls.target.set(0, 1, -24);
      this.controls.update();
    } else if (mode === 'orbit') {
      this.controls.enabled = true;
      this.controls.screenSpacePanning = true;
      this.controls.minDistance = 3;
      this.controls.maxDistance = 350;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Prevent going underground
      this.controls.minPolarAngle = 0.05;
      this.camera.position.set(22, 26, 18);
      this.controls.target.set(0, 1, -15);
      this.controls.update();
    } else if (mode === 'chase') {
      this.controls.enabled = false;
      if (!this.trafficSystem.selectedVehicle) {
        this.trafficSystem.selectNextVehicle();
      }
    } else if (mode === 'zebra') {
      this.controls.enabled = true;
      this.controls.screenSpacePanning = true;
      this.controls.minDistance = 0.5;
      this.controls.maxDistance = 250;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
      this.controls.minPolarAngle = 0.02;
      this.camera.position.set(9.2, 2.2, -8.0);
      this.controls.target.set(-9.0, 3.4, -8.0);
      this.controls.update();
    } else if (mode === 'upi') {
      this.controls.enabled = true;
      this.controls.screenSpacePanning = true;
      this.controls.minDistance = 0.5;
      this.controls.maxDistance = 250;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
      this.controls.minPolarAngle = 0.02;
      this.camera.position.set(2.5, 3.2, 12.0);
      this.controls.target.set(-22.0, 4.5, 12.0);
      this.controls.update();
    } else if (mode === 'simpang') {
      this.controls.enabled = true;
      this.controls.screenSpacePanning = true;
      this.controls.minDistance = 1;
      this.controls.maxDistance = 350;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
      this.controls.minPolarAngle = 0.02;
      this.camera.position.set(24.0, 22.0, -36.0);
      this.controls.target.set(-16.0, 1.5, -72.0);
      this.controls.update();
    }

    // Notify HUD if active
    if (this.hud && typeof this.hud.onCameraModeChanged === 'function') {
      this.hud.onCameraModeChanged(mode);
    }
  }

  onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Toggle control deck with 'H' key
    if (e.code === 'KeyH') {
      if (this.hud && typeof this.hud.toggleControlDeck === 'function') {
        this.hud.toggleControlDeck();
      }
      return;
    }

    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = true;
        break;
      case 'KeyE':
      case 'Space':
        this.keys.up = true;
        break;
      case 'KeyQ':
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.down = true;
        break;
    }
  }

  onKeyUp(e) {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = false;
        break;
      case 'KeyE':
      case 'Space':
        this.keys.up = false;
        break;
      case 'KeyQ':
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.down = false;
        break;
    }
  }

  // Programmatic camera movement for on-screen controller dock
  moveCameraStep(dirX, dirZ, dirY = 0) {
    if (this.cameraMode === 'chase') {
      this.setCameraMode('drone');
    }
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const step = (this.cameraMode === 'zebra' ? 4.0 : 8.0);
    const delta = new THREE.Vector3();
    if (dirZ !== 0) delta.addScaledVector(forward, dirZ * step);
    if (dirX !== 0) delta.addScaledVector(right, dirX * step);
    if (dirY !== 0) delta.y += dirY * step * 0.75;

    this.camera.position.add(delta);
    this.controls.target.add(delta);
    this.controls.update();
  }

  zoomCamera(factor) {
    if (this.cameraMode === 'chase') {
      this.setCameraMode('drone');
    }
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const delta = dir.multiplyScalar(factor);
    this.camera.position.add(delta);
    this.controls.update();
  }

  resetCamera() {
    this.setCameraMode(this.cameraMode);
  }

  updateCamera(dt, time) {
    if (this.cameraMode !== 'chase') {
      // Free exploration: WASD / Arrow movement moves camera and target together in ALL modes (never locked!)
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      const moveSpeed = (this.cameraMode === 'drone' ? 52.0 : (this.cameraMode === 'zebra' ? 22.0 : 38.0));
      const moveDelta = new THREE.Vector3();

      if (this.keys.forward) moveDelta.addScaledVector(forward, moveSpeed * dt);
      if (this.keys.backward) moveDelta.addScaledVector(forward, -moveSpeed * dt);
      if (this.keys.left) moveDelta.addScaledVector(right, -moveSpeed * dt);
      if (this.keys.right) moveDelta.addScaledVector(right, moveSpeed * dt);
      if (this.keys.up) moveDelta.y += moveSpeed * 0.75 * dt;
      if (this.keys.down) moveDelta.y -= moveSpeed * 0.75 * dt;

      if (moveDelta.lengthSq() > 0) {
        this.camera.position.add(moveDelta);
        this.controls.target.add(moveDelta);
      }

      this.controls.update();
    } else {
      // Chase Cam mode follows selected vehicle
      const selected = this.trafficSystem.selectedVehicle;
      if (selected && selected.isActive) {
        const vPos = selected.vehicle.mesh.position;
        const heading = selected.heading;

        // Vector pointing backwards from vehicle heading
        const backDir = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
        const forwardDir = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));

        // Offset behind and above
        const followDist = selected.vehicle.type === 'motorcycle' ? 6.5 : 8.5;
        const followHeight = selected.vehicle.type === 'motorcycle' ? 2.6 : 3.4;

        const targetCamPos = new THREE.Vector3()
          .copy(vPos)
          .addScaledVector(backDir, followDist)
          .add(new THREE.Vector3(0, followHeight, 0));

        const lookTarget = new THREE.Vector3()
          .copy(vPos)
          .addScaledVector(forwardDir, 4.0)
          .add(new THREE.Vector3(0, 1.2, 0));

        this.camera.position.lerp(targetCamPos, dt * 6.5);
        this.camera.lookAt(lookTarget);
      } else {
        // Fallback if vehicle despawned
        this.trafficSystem.selectNextVehicle();
      }
    }
  }

  onPointerDown(event) {
    // Only raycast on primary button
    if (event.button !== 0) return;

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const clickedVehicle = this.trafficSystem.getVehicleUnderMouse(this.raycaster);

    if (clickedVehicle) {
      this.trafficSystem.selectedVehicle = clickedVehicle;
      // If user clicked a car, switch to Chase Cam or update telemetry
      if (this.cameraMode !== 'chase') {
        this.setCameraMode('chase');
        document.querySelectorAll('.cam-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.cam === 'chase');
        });
      }
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(this.animate);

    const dt = Math.min(0.1, this.clock.getDelta());
    const time = this.clock.getElapsedTime();

    // Update systems with safeguards so canvas render loop never halts
    try {
      this.environment.update(time, dt);
    } catch (e) {
      console.error('[Environment Error]', e);
    }

    try {
      this.trafficSystem.update(dt, time);
    } catch (e) {
      console.error('[TrafficSystem Error]', e);
    }

    try {
      this.pedestrianSystem.update(dt, time);
    } catch (e) {
      console.error('[PedestrianSystem Error]', e);
    }

    try {
      this.hud.update(dt);
    } catch (e) {
      console.error('[HUD Error]', e);
    }

    try {
      this.updateCamera(dt, time);
    } catch (e) {
      console.error('[Camera Error]', e);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

// Instantiate simulation when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new TrafficSimulationApp();
});
