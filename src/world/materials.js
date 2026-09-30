import * as THREE from 'three';

// Helper to create canvas textures procedurally (zero external dependencies)
function createAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Dark asphalt base
  ctx.fillStyle = '#22252a';
  ctx.fillRect(0, 0, 512, 512);

  // Noise grain
  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 22;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  // Subtle tire tracks
  ctx.fillStyle = 'rgba(15, 17, 20, 0.25)';
  ctx.fillRect(80, 0, 70, 512);
  ctx.fillRect(210, 0, 70, 512);
  ctx.fillRect(340, 0, 70, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 20);
  return texture;
}

function createSidewalkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Concrete base
  ctx.fillStyle = '#9e9fa3';
  ctx.fillRect(0, 0, 256, 256);

  // Pavement grid lines
  ctx.strokeStyle = '#6f7074';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 126, 126);
  ctx.strokeRect(128, 2, 126, 126);
  ctx.strokeRect(2, 128, 126, 126);
  ctx.strokeRect(128, 128, 126, 126);

  // Fine speckle noise
  const imgData = ctx.getImageData(0, 0, 256, 256);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 18;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 25);
  return texture;
}

function createCurbTexture() {
  // Alternating black and yellow curb segments (characteristic Indonesian curb pattern)
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  // Yellow segment
  ctx.fillStyle = '#f5c518';
  ctx.fillRect(0, 0, 64, 32);

  // Black segment
  ctx.fillStyle = '#1c1d21';
  ctx.fillRect(64, 0, 64, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(20, 1);
  return texture;
}

function createZebraCrossSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Indonesian Pedestrian Crossing Sign (Blue rounded square with white triangle and black/white silhouette)
  ctx.fillStyle = '#0b5ed7';
  ctx.beginPath();
  ctx.roundRect(10, 10, 236, 236, 24);
  ctx.fill();

  // White inner triangle
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(128, 30);
  ctx.lineTo(225, 215);
  ctx.lineTo(31, 215);
  ctx.closePath();
  ctx.fill();

  // Walking person silhouette + zebra stripes inside
  ctx.fillStyle = '#111827';
  // Head
  ctx.beginPath();
  ctx.arc(128, 85, 14, 0, Math.PI * 2);
  ctx.fill();
  // Body torso
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#111827';
  ctx.beginPath();
  ctx.moveTo(128, 100);
  ctx.lineTo(124, 145);
  ctx.stroke();
  // Legs walking
  ctx.beginPath();
  ctx.moveTo(124, 145);
  ctx.lineTo(95, 195);
  ctx.moveTo(124, 145);
  ctx.lineTo(155, 195);
  ctx.stroke();
  // Arms
  ctx.beginPath();
  ctx.moveTo(126, 115);
  ctx.lineTo(98, 145);
  ctx.moveTo(126, 115);
  ctx.lineTo(152, 135);
  ctx.stroke();

  // Ground zebra lines
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#111827';
  ctx.beginPath();
  ctx.moveTo(60, 202);
  ctx.lineTo(196, 202);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function createStreetNameSignTexture(name, subtitle = 'KOTA BANDUNG') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Indonesian green street name sign background
  ctx.fillStyle = '#157347';
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 112, 16);
  ctx.fill();

  // White border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(14, 14, 484, 100, 12);
  ctx.stroke();

  // Main street text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px "Outfit", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 256, 50);

  // Subtitle
  ctx.font = '600 18px "Plus Jakarta Sans", "Arial", sans-serif';
  ctx.fillStyle = '#d1e7dd';
  ctx.fillText(subtitle, 256, 92);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function createUPIGateSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // UPI Maroon background (#800000 / #8b1515) with gold trim
  ctx.fillStyle = '#800000';
  ctx.fillRect(0, 0, 1024, 256);

  // Gold borders
  ctx.strokeStyle = '#f5c518';
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, 1000, 232);
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 984, 216);

  // Title: UNIVERSITAS PENDIDIKAN INDONESIA
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px "Outfit", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('UNIVERSITAS PENDIDIKAN INDONESIA', 512, 85);

  // Subtitle: KAWASAN KAMPUS BUMI SILIWANGI - AKSES JL. PERKASA
  ctx.font = 'bold 28px "Plus Jakarta Sans", "Arial", sans-serif';
  ctx.fillStyle = '#f5c518';
  ctx.fillText('KAWASAN KAMPUS BUMI SILIWANGI • AKSES JL. PERKASA', 512, 155);

  // Tagline
  ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#f8f9fa';
  ctx.fillText('ASRAMA MAHASISWA & FAKULTAS • SUKASARI BANDUNG', 512, 200);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function createDirectionalSignTexture(direction, destination, detail) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  // Indonesian highway/arterial green direction signboard
  ctx.fillStyle = '#0f5132';
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 144, 16);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(14, 14, 484, 132, 12);
  ctx.stroke();

  // Direction arrow & destination
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px "Outfit", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${direction} ${destination}`, 30, 60);

  ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#fef08a';
  ctx.fillText(detail, 30, 105);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function createHeadlightBeamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Fading radial/linear beam cone
  const grad = ctx.createRadialGradient(128, 50, 10, 128, 300, 240);
  grad.addColorStop(0, 'rgba(255, 250, 220, 0.7)');
  grad.addColorStop(0.3, 'rgba(255, 245, 200, 0.35)');
  grad.addColorStop(0.7, 'rgba(255, 235, 180, 0.1)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(100, 20);
  ctx.lineTo(156, 20);
  ctx.lineTo(256, 480);
  ctx.lineTo(0, 480);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function createCarShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 128, 256);
  const grad = ctx.createRadialGradient(64, 128, 20, 64, 128, 64);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
  grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function createShopSignTexture(title, category, bgColor = '#0d6efd', textColor = '#ffffff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 512, 128);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 500, 116);

  ctx.fillStyle = textColor;
  ctx.font = 'bold 36px "Outfit", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 50);

  ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#f8f9fa';
  ctx.fillText(category, 256, 92);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function createTactilePavingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#e5a50a';
  ctx.fillRect(0, 0, 64, 64);

  // Ribbed pattern
  ctx.fillStyle = '#f4be2b';
  ctx.fillRect(0, 8, 64, 10);
  ctx.fillRect(0, 26, 64, 10);
  ctx.fillRect(0, 44, 64, 10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 2);
  return texture;
}

export class MaterialManager {
  constructor() {
    this.textures = {
      asphalt: createAsphaltTexture(),
      sidewalk: createSidewalkTexture(),
      curb: createCurbTexture(),
      zebraSign: createZebraCrossSignTexture(),
      signSetiabudi: createStreetNameSignTexture('JL. DR. SETIABUDI', 'KEC. SUKASARI • KOTA BANDUNG'),
      signPerkasa: createStreetNameSignTexture('JL. PERKASA', 'AKSES KAWASAN KAMPUS UPI'),
      signSersanBajuri: createStreetNameSignTexture('JL. SERSAN BAJURI', 'ARAH PARONGPONG / LEMBANG'),
      signSersanUrip: createStreetNameSignTexture('JL. SERSAN URIP', 'KOTA BANDUNG'),
      signTerusanSetiabudi: createStreetNameSignTexture('TERUSAN JL. SETIABUDI', 'ARAH TERMINAL LEDENG / LEMBANG'),
      signMohYamin: createStreetNameSignTexture('JL. MOH. YAMIN', 'AKSES KAMPUS UPI SELATAN'),
      upiGate: createUPIGateSignTexture(),
      signToUPI: createDirectionalSignTexture('⬅', 'KAWASAN KAMPUS UPI', 'ASRAMA MAHASISWA & FAKULTAS (JL. PERKASA)'),
      signToLedeng: createDirectionalSignTexture('⬆', 'TERUSAN SETIABUDI / LEDENG', 'TERMINAL LEDENG & LEMBANG'),
      signToBandung: createDirectionalSignTexture('⬇', 'KAMPUS UTAMA UPI / BANDUNG', 'GERBANG UTAMA SILIWANGI'),
      signToBajuri: createDirectionalSignTexture('↖', 'JL. SERSAN BAJURI', 'LEMBANG & WISATA PARONGPONG'),
      signToUrip: createDirectionalSignTexture('➡', 'JL. SERSAN URIP', 'KORIDOR SUKASARI TIMUR'),
      headlightBeam: createHeadlightBeamTexture(),
      carShadow: createCarShadowTexture(),
      tactile: createTactilePavingTexture(),
      shopSigns: [
        createShopSignTexture('WARUNG MAHASISWA UPI', 'KULINER SUNDA & KANTIN', '#b02a37'),
        createShopSignTexture('MINI MARKET FRESH 24H', 'KEBUTUHAN MAHASISWA & WARGA', '#0d6efd'),
        createShopSignTexture('APOTEK SETIABUDI FARMA', 'OBAT & RESEP 24 JAM', '#198754'),
        createShopSignTexture('FOTOCOPY & PRINTING UPI', 'JILID SKRIPSI & ATK', '#6f42c1'),
        createShopSignTexture('BENGKEL MOTOR MAHASISWA', 'SERVIS & GANTI OLI', '#fd7e14')
      ]
    };

    this.materials = this.createMaterials();
  }

  createMaterials() {
    return {
      // Ground / Roads
      ground: new THREE.MeshLambertMaterial({ color: '#2b3628' }), // Grass / terrain around
      asphalt: new THREE.MeshStandardMaterial({
        map: this.textures.asphalt,
        roughness: 0.85,
        metalness: 0.05
      }),
      sidewalk: new THREE.MeshStandardMaterial({
        map: this.textures.sidewalk,
        roughness: 0.9,
        metalness: 0.02
      }),
      curb: new THREE.MeshStandardMaterial({
        map: this.textures.curb,
        roughness: 0.7,
        metalness: 0.05
      }),
      tactile: new THREE.MeshStandardMaterial({
        map: this.textures.tactile,
        roughness: 0.6
      }),

      // Ground shadows and headlight beams
      carShadow: new THREE.MeshBasicMaterial({
        map: this.textures.carShadow,
        transparent: true,
        opacity: 0.6,
        depthWrite: false
      }),
      headlightBeam: new THREE.MeshBasicMaterial({
        map: this.textures.headlightBeam,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }),

      // Road & Street Signage
      upiGate: new THREE.MeshBasicMaterial({ map: this.textures.upiGate }),
      signSetiabudi: new THREE.MeshBasicMaterial({ map: this.textures.signSetiabudi }),
      signPerkasa: new THREE.MeshBasicMaterial({ map: this.textures.signPerkasa }),
      signSersanBajuri: new THREE.MeshBasicMaterial({ map: this.textures.signSersanBajuri }),
      signSersanUrip: new THREE.MeshBasicMaterial({ map: this.textures.signSersanUrip }),
      signTerusanSetiabudi: new THREE.MeshBasicMaterial({ map: this.textures.signTerusanSetiabudi }),
      signMohYamin: new THREE.MeshBasicMaterial({ map: this.textures.signMohYamin }),
      signToUPI: new THREE.MeshBasicMaterial({ map: this.textures.signToUPI }),
      signToLedeng: new THREE.MeshBasicMaterial({ map: this.textures.signToLedeng }),
      signToBandung: new THREE.MeshBasicMaterial({ map: this.textures.signToBandung }),
      signToBajuri: new THREE.MeshBasicMaterial({ map: this.textures.signToBajuri }),
      signToUrip: new THREE.MeshBasicMaterial({ map: this.textures.signToUrip }),

      // Road markings
      doubleYellow: new THREE.MeshBasicMaterial({ color: '#ffb703' }),
      whiteMarking: new THREE.MeshBasicMaterial({ color: '#f8f9fa' }),
      zebraStripe: new THREE.MeshBasicMaterial({ color: '#ffffff' }),

      // Props / Streetlights
      metalPole: new THREE.MeshStandardMaterial({
        color: '#495057',
        roughness: 0.4,
        metalness: 0.7
      }),
      streetLampFixture: new THREE.MeshStandardMaterial({
        color: '#212529',
        roughness: 0.3,
        metalness: 0.8
      }),
      streetLampBulb: new THREE.MeshBasicMaterial({
        color: '#ffecb3'
      }),

      // Vegetation
      trunk: new THREE.MeshLambertMaterial({ color: '#4a3319' }),
      foliageGreen1: new THREE.MeshLambertMaterial({ color: '#2d6a4f' }),
      foliageGreen2: new THREE.MeshLambertMaterial({ color: '#40916c' }),
      foliageGreen3: new THREE.MeshLambertMaterial({ color: '#52b788' }),

      // Buildings
      buildingWallWhite: new THREE.MeshLambertMaterial({ color: '#eaecef' }),
      buildingWallBeige: new THREE.MeshLambertMaterial({ color: '#e8dcce' }),
      buildingWallGrey: new THREE.MeshLambertMaterial({ color: '#a0a4ab' }),
      buildingWallBlue: new THREE.MeshLambertMaterial({ color: '#8898a8' }),
      roofTileGenteng: new THREE.MeshLambertMaterial({ color: '#994422' }), // Red-orange clay tile
      roofMetalSheet: new THREE.MeshLambertMaterial({ color: '#4a5568' }),
      windowGlass: new THREE.MeshStandardMaterial({
        color: '#1a2a3a',
        roughness: 0.1,
        metalness: 0.8,
        transparent: true,
        opacity: 0.85
      }),
      windowGlassNight: new THREE.MeshBasicMaterial({
        color: '#ffeaa7'
      }),
      shutterDoor: new THREE.MeshStandardMaterial({
        color: '#555b62',
        roughness: 0.5,
        metalness: 0.6
      }),

      // Traffic Light (APILL) Materials - High-vibrancy with toneMapped: false
      tlHousing: new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.6, metalness: 0.4 }),
      tlVisor: new THREE.MeshStandardMaterial({ color: '#0d0e10', roughness: 0.8 }),
      tlPole: new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.35, metalness: 0.75 }),
      tlBackplate: new THREE.MeshStandardMaterial({ color: '#101214', roughness: 0.85 }),
      tlBackplateBorder: new THREE.MeshBasicMaterial({ color: '#ffcc00', toneMapped: false }),
      tlRedOff: new THREE.MeshStandardMaterial({ color: '#2a0505', roughness: 0.85 }),
      tlYellowOff: new THREE.MeshStandardMaterial({ color: '#2a2002', roughness: 0.85 }),
      tlGreenOff: new THREE.MeshStandardMaterial({ color: '#021f0a', roughness: 0.85 }),
      tlRedOn: new THREE.MeshBasicMaterial({ color: '#ff0033', toneMapped: false }),
      tlYellowOn: new THREE.MeshBasicMaterial({ color: '#ffbb00', toneMapped: false }),
      tlGreenOn: new THREE.MeshBasicMaterial({ color: '#00ff44', toneMapped: false }),

      // Signs
      signZebra: new THREE.MeshBasicMaterial({ map: this.textures.zebraSign }),
      signSetiabudi: new THREE.MeshBasicMaterial({ map: this.textures.signSetiabudi }),
      signPerkasa: new THREE.MeshBasicMaterial({ map: this.textures.signPerkasa }),

      // Vehicle generic materials
      rubberTire: new THREE.MeshLambertMaterial({ color: '#16181b' }),
      wheelRimChrome: new THREE.MeshStandardMaterial({
        color: '#d0d5dd',
        metalness: 0.85,
        roughness: 0.25
      }),
      carGlass: new THREE.MeshStandardMaterial({
        color: '#111d28',
        roughness: 0.15,
        metalness: 0.9,
        transparent: true,
        opacity: 0.75
      }),
      headlightOff: new THREE.MeshStandardMaterial({
        color: '#cccccc',
        roughness: 0.2,
        metalness: 0.8
      }),
      headlightOn: new THREE.MeshBasicMaterial({
        color: '#fffffa'
      }),
      taillightOff: new THREE.MeshLambertMaterial({
        color: '#590000'
      }),
      taillightOn: new THREE.MeshBasicMaterial({
        color: '#ff2222'
      }),
      taillightBrake: new THREE.MeshBasicMaterial({
        color: '#ff0033'
      }),
      turnSignalAmber: new THREE.MeshBasicMaterial({
        color: '#ff9900'
      })
    };
  }

  getVehiclePaints() {
    return [
      new THREE.MeshStandardMaterial({ color: '#f8f9fa', roughness: 0.2, metalness: 0.2 }), // Pearl White
      new THREE.MeshStandardMaterial({ color: '#1a1d20', roughness: 0.2, metalness: 0.3 }), // Sleek Black
      new THREE.MeshStandardMaterial({ color: '#8d99ae', roughness: 0.25, metalness: 0.7 }), // Silver Metallic
      new THREE.MeshStandardMaterial({ color: '#9b2226', roughness: 0.25, metalness: 0.4 }), // Crimson Red
      new THREE.MeshStandardMaterial({ color: '#1d3557', roughness: 0.25, metalness: 0.5 }), // Deep Navy
      new THREE.MeshStandardMaterial({ color: '#495057', roughness: 0.25, metalness: 0.6 }), // Charcoal Grey
      new THREE.MeshStandardMaterial({ color: '#c77dff', roughness: 0.25, metalness: 0.3 })  // Lilac Accent
    ];
  }

  getAngkotMaterials() {
    return {
      bodyGreen: new THREE.MeshStandardMaterial({ color: '#2d6a4f', roughness: 0.3, metalness: 0.1 }),
      stripeOrange: new THREE.MeshStandardMaterial({ color: '#f77f00', roughness: 0.3, metalness: 0.1 }),
      roofCream: new THREE.MeshStandardMaterial({ color: '#fefae0', roughness: 0.35, metalness: 0.05 })
    };
  }

  getMotorcyclePaints() {
    return [
      new THREE.MeshStandardMaterial({ color: '#d90429', roughness: 0.3, metalness: 0.4 }), // Red
      new THREE.MeshStandardMaterial({ color: '#2b2d42', roughness: 0.3, metalness: 0.5 }), // Matte Black
      new THREE.MeshStandardMaterial({ color: '#0077b6', roughness: 0.3, metalness: 0.4 }), // Blue
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.2 }), // White
      new THREE.MeshStandardMaterial({ color: '#ffb703', roughness: 0.3, metalness: 0.4 })  // Yellow/Gold
    ];
  }

  getBusMaterials() {
    return {
      bodyBlue: new THREE.MeshStandardMaterial({ color: '#0284c7', roughness: 0.25, metalness: 0.15 }), // Damri / TMP transit blue
      bodyTeal: new THREE.MeshStandardMaterial({ color: '#0f766e', roughness: 0.25, metalness: 0.15 }), // Trans Metro Pasundan teal
      stripeWhite: new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.2, metalness: 0.1 }),
      roofGrey: new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.35, metalness: 0.2 }),
      acUnit: new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.4, metalness: 0.3 }),
      marqueeLed: new THREE.MeshBasicMaterial({ color: '#fbbf24' }),
      busGlass: new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.15,
        metalness: 0.85,
        transparent: true,
        opacity: 0.82
      })
    };
  }

  getTruckMaterials() {
    return {
      cabinYellow: new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.3, metalness: 0.2 }), // Classic Canter yellow
      cabinWhite: new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.25, metalness: 0.2 }),
      cabinBlue: new THREE.MeshStandardMaterial({ color: '#0369a1', roughness: 0.25, metalness: 0.3 }),
      boxSilver: new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.35, metalness: 0.45 }), // Logistics box aluminum
      chassisDark: new THREE.MeshLambertMaterial({ color: '#1e293b' }),
      bumperMetal: new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.4, metalness: 0.6 })
    };
  }
}
