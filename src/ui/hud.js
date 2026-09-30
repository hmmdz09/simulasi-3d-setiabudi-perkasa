export class HUDManager {
  constructor(app) {
    this.app = app;
    this.bindEvents();
  }

  bindEvents() {
    // 1. Camera Buttons
    const camButtons = document.querySelectorAll('.cam-btn');
    camButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.cam;
        camButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.app.setCameraMode(mode);
      });
    });

    // 2. Quick Lighting Toggle (Top Dock)
    const lightBtns = document.querySelectorAll('.light-btn');
    lightBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        lightBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.app.setLightingMode(mode);
      });
    });

    // 3. Crossing Mode Selector (Normal vs Tuna Netra)
    const modeButtons = document.querySelectorAll('.crossing-mode-btn');
    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.app.pedestrianSystem.setCrossingMode(mode);

        const chip = document.getElementById('chip-mode-status');
        if (chip) {
          if (mode === 'tunanetra') {
            chip.innerHTML = '<i class="fa-solid fa-volume-high"></i> Tuna Netra';
            chip.className = 'crossing-active-chip chip-amber';
          } else {
            chip.innerHTML = '<i class="fa-solid fa-traffic-light"></i> Normal';
            chip.className = 'crossing-active-chip chip-green';
          }
        }
      });
    });

    // 4. Zebra Crossing Button & Cancel Lockdown Button
    const zebraBtn = document.getElementById('btn-zebra-cross');
    if (zebraBtn) {
      zebraBtn.addEventListener('click', () => {
        const activeBtn = document.querySelector('.crossing-mode-btn.active');
        const mode = activeBtn ? activeBtn.dataset.mode : 'normal';
        this.app.pedestrianSystem.requestCrossing(mode);
      });
    }

    const cancelBtn = document.getElementById('btn-cancel-lockdown');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.app.pedestrianSystem.cancelCrossing();
      });
    }

    // 5. Next Vehicle Button in Telemetry
    const nextVehBtn = document.getElementById('btn-next-vehicle');
    if (nextVehBtn) {
      nextVehBtn.addEventListener('click', () => {
        this.app.trafficSystem.selectNextVehicle();
        if (this.app.cameraMode !== 'chase') {
          this.app.setCameraMode('chase');
          document.querySelectorAll('.cam-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.cam === 'chase');
          });
        }
      });
    }

    // 6. Pedestrian crossing state listener (with green wave corridor integration)
    this.app.pedestrianSystem.onStateChange = (isCrossing, isButtonLocked, crossingSec, lockdownSec, mode, greenWaveInfo) => {
      this.updateCrossingUI(isCrossing, isButtonLocked, crossingSec, lockdownSec, mode, greenWaveInfo);
    };

    // 7. Toggle Control Deck Button
    const toggleDeckBtn = document.getElementById('btn-toggle-deck');
    if (toggleDeckBtn) {
      toggleDeckBtn.addEventListener('click', () => {
        this.toggleControlDeck();
      });
    }
  }

  toggleControlDeck(forceState = null) {
    const deck = document.getElementById('control-deck');
    const toggleBtn = document.getElementById('btn-toggle-deck');
    const toggleIcon = document.getElementById('icon-toggle-deck');
    const toggleText = document.getElementById('text-toggle-deck');
    if (!deck) return;

    const isCollapsed = forceState !== null ? forceState : !deck.classList.contains('collapsed');
    deck.classList.toggle('collapsed', isCollapsed);

    if (toggleBtn) {
      toggleBtn.classList.toggle('collapsed', isCollapsed);
    }
    if (toggleIcon) {
      toggleIcon.className = isCollapsed ? 'fa-solid fa-sliders' : 'fa-solid fa-chevron-left';
    }
    if (toggleText) {
      toggleText.textContent = isCollapsed ? 'Buka Kontrol (H)' : 'Sembunyikan Panel (H)';
    }
  }

  updateCrossingUI(isCrossing, isButtonLocked, crossingSec, lockdownSec, mode, greenWaveInfo = null) {
    const badge = document.getElementById('zebra-status-badge');
    const btn = document.getElementById('btn-zebra-cross');
    const cancelBtn = document.getElementById('btn-cancel-lockdown');
    const lampRed = document.getElementById('lamp-red');
    const lampGreen = document.getElementById('lamp-green');
    const title = document.getElementById('signal-title');
    const subtitle = document.getElementById('signal-subtitle');
    const countdown = document.getElementById('signal-countdown');
    const audioPulse = document.getElementById('audio-pulse-indicator');

    // Extract green wave state
    const gwBlocking = greenWaveInfo ? greenWaveInfo.isBlocking : false;
    const gwRemaining = greenWaveInfo ? greenWaveInfo.remaining : 0;
    const gwPending = greenWaveInfo ? greenWaveInfo.isPending : false;

    if (isCrossing) {
      // 1. ACTIVE PEDESTRIAN CROSSING (15 seconds)
      if (lampRed) lampRed.classList.remove('active');
      if (lampGreen) lampGreen.classList.add('active');

      if (title) {
        title.textContent = mode === 'tunanetra'
          ? 'Lampu Hijau Pejalan Kaki (Akses Tuna Netra)'
          : 'Lampu Hijau Pejalan Kaki: Menyebrang';
      }
      if (subtitle) {
        subtitle.textContent = mode === 'tunanetra'
          ? `Suara vokal & akustik bip pelican memandu aman (${crossingSec}s)`
          : `Kendaraan berhenti di garis henti, pejalan kaki melintas (${crossingSec}s)`;
      }

      if (countdown) {
        countdown.style.display = 'block';
        countdown.textContent = `${crossingSec}s`;
      }

      if (audioPulse) {
        audioPulse.style.display = (mode === 'tunanetra') ? 'flex' : 'none';
      }

      if (badge) {
        badge.className = 'status-pill active-crossing';
        badge.innerHTML = `<span class="pulse-dot-red"></span><span>Menyeberang: ${crossingSec}s</span>`;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-person-walking"></i> Sedang Menyeberang (${crossingSec}s)...`;
      }

      if (cancelBtn) {
        cancelBtn.style.display = 'flex';
        cancelBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Reset Penyeberangan';
      }
    } else if (gwPending && gwBlocking) {
      // 1b. GREEN WAVE PENDING: crossing requested but waiting for Simpang 3 vehicle platoon to pass
      if (lampRed) lampRed.classList.add('active');
      if (lampGreen) lampGreen.classList.remove('active');

      if (title) title.textContent = 'Koordinasi Koridor Simpang: Menunggu';
      if (subtitle) subtitle.textContent = `Kendaraan dari Terusan Setiabudi sedang melintas. Penyeberangan otomatis dimulai dalam ${gwRemaining}s`;

      if (countdown) {
        countdown.style.display = 'block';
        countdown.textContent = `${gwRemaining}s`;
      }
      if (audioPulse) audioPulse.style.display = (mode === 'tunanetra') ? 'flex' : 'none';

      if (badge) {
        badge.className = 'status-pill active-crossing';
        badge.innerHTML = `<span class="pulse-dot-red"></span><span>Antrean Simpang: ${gwRemaining}s</span>`;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-traffic-light"></i> Menunggu Koridor Simpang (${gwRemaining}s)...`;
      }

      if (cancelBtn) {
        cancelBtn.style.display = 'flex';
        cancelBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Batalkan Permintaan';
      }
    } else if (isButtonLocked) {
      // 2. BUTTON LOCKDOWN / COOLDOWN PHASE (120 seconds after crossing)
      if (lampRed) lampRed.classList.add('active');
      if (lampGreen) lampGreen.classList.remove('active');

      if (title) title.textContent = 'Sinyal Kendaraan: Melaju Normal';
      if (subtitle) subtitle.textContent = `Tombol penyeberangan terkunci selama fase jeda (Lockdown ${lockdownSec}s tersisa)`;

      if (countdown) {
        countdown.style.display = 'block';
        countdown.textContent = `${lockdownSec}s`;
      }
      if (audioPulse) audioPulse.style.display = 'none';

      if (badge) {
        badge.className = 'status-pill active-crossing';
        badge.innerHTML = `<span class="pulse-dot-red"></span><span>Lockdown Tombol: ${lockdownSec}s</span>`;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-lock"></i> Tombol Terkunci (Lockdown ${lockdownSec}s)`;
      }

      if (cancelBtn) {
        cancelBtn.style.display = 'flex';
        cancelBtn.innerHTML = '<i class="fa-solid fa-unlock"></i> Buka Kunci Tombol (Reset)';
      }
    } else if (gwBlocking && !gwPending) {
      // 3b. GREEN WAVE ACTIVE but no crossing requested yet - show that button is temporarily unavailable
      if (lampRed) lampRed.classList.add('active');
      if (lampGreen) lampGreen.classList.remove('active');

      if (title) title.textContent = 'Koordinasi Koridor Simpang Aktif';
      if (subtitle) subtitle.textContent = `Kendaraan dari Simpang 3 Terusan Setiabudi sedang melintas. Tombol aktif dalam ${gwRemaining}s`;

      if (countdown) {
        countdown.style.display = 'block';
        countdown.textContent = `${gwRemaining}s`;
      }
      if (audioPulse) audioPulse.style.display = 'none';

      if (badge) {
        badge.className = 'status-pill active-crossing';
        badge.innerHTML = `<span class="pulse-dot-red"></span><span>Koridor Simpang: ${gwRemaining}s</span>`;
      }

      if (btn) {
        btn.disabled = false; // Still clickable - will queue the request
        btn.innerHTML = `<i class="fa-solid fa-traffic-light"></i> Minta Menyebrang (Antrean ${gwRemaining}s)`;
      }

      if (cancelBtn) {
        cancelBtn.style.display = 'none';
      }
    } else {
      // 3. READY FOR CROSSING
      if (lampRed) lampRed.classList.add('active');
      if (lampGreen) lampGreen.classList.remove('active');

      if (title) title.textContent = 'Sinyal Kendaraan: Melaju Normal';
      if (subtitle) subtitle.textContent = 'Tekan tombol di bawah untuk meminta lampu hijau menyebrang';

      if (countdown) countdown.style.display = 'none';
      if (audioPulse) audioPulse.style.display = 'none';

      if (badge) {
        badge.className = 'status-pill';
        badge.innerHTML = '<span class="pulse-dot"></span><span>Sinyal Koridor Normal</span>';
      }

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-hand"></i> Minta Menyebrang (Tekan Tombol)';
      }

      if (cancelBtn) {
        cancelBtn.style.display = 'none';
      }
    }
  }

  onCameraModeChanged(mode) {
    // Mode notification if needed
  }

  update(dt) {
    this.updateStats();
    this.updateTelemetry();
  }

  updateStats() {
    const stats = this.app.trafficSystem.getStats();

    const elTotal = document.getElementById('stat-total');
    const elCars = document.getElementById('stat-cars');
    const elBikes = document.getElementById('stat-bikes');
    const elAngkots = document.getElementById('stat-angkots');
    const elSpeed = document.getElementById('stat-avg-speed');
    const elLos = document.getElementById('stat-los');

    if (elTotal) elTotal.textContent = stats.total;
    if (elCars) elCars.textContent = stats.cars;
    if (elBikes) elBikes.textContent = stats.bikes;
    if (elAngkots) elAngkots.textContent = stats.angkots;
    if (elSpeed) elSpeed.textContent = `${stats.avgSpeedKmh} km/h`;
    if (elLos) elLos.textContent = stats.los;
  }

  updateTelemetry() {
    const selected = this.app.trafficSystem.selectedVehicle;
    const panel = document.getElementById('telemetry-panel');

    if (!panel) return;

    if (!selected || !selected.isActive) {
      if (this.app.cameraMode === 'chase') {
        this.app.trafficSystem.selectNextVehicle();
      } else {
        panel.classList.add('hidden');
        return;
      }
    }

    panel.classList.remove('hidden');

    const v = selected.vehicle;
    let typeName = 'Mobil Sedan';
    let iconClass = 'fa-car';
    if (v.type === 'suv') {
      typeName = 'SUV / MPV Keluarga';
      iconClass = 'fa-truck-pickup';
    } else if (v.type === 'bus') {
      typeName = 'Bus Kota (Trans Metro / Damri)';
      iconClass = 'fa-bus';
    } else if (v.type === 'truck') {
      typeName = 'Truk Box Logistik (Colt Diesel)';
      iconClass = 'fa-truck';
    } else if (v.type === 'angkot') {
      typeName = 'Angkot (Ledeng - Kalapa)';
      iconClass = 'fa-van-shuttle';
    } else if (v.type === 'motorcycle') {
      typeName = 'Sepeda Motor Matic (Vario/Beat)';
      iconClass = 'fa-motorcycle';
    }

    const elIcon = document.getElementById('tel-icon');
    const elType = document.getElementById('tel-type');
    const elPlate = document.getElementById('tel-plate');
    const elSpeed = document.getElementById('tel-speed');
    const elRoute = document.getElementById('tel-route');
    const elStatus = document.getElementById('tel-status');
    const elGauge = document.getElementById('tel-gauge-bar');

    if (elIcon) elIcon.className = `fa-solid ${iconClass}`;
    if (elType) elType.textContent = typeName;
    if (elPlate) elPlate.textContent = selected.plate;

    const kmh = Math.round(selected.speed * 3.6);
    if (elSpeed) elSpeed.textContent = `${kmh} km/h`;

    if (elGauge) {
      const maxKmh = 60;
      const pct = Math.min(100, Math.round((kmh / maxKmh) * 100));
      elGauge.style.width = `${pct}%`;
    }

    if (elRoute && selected.pathData) {
      elRoute.textContent = selected.pathData.label;
    }

    if (elStatus) {
      if (selected.speed < 0.5) {
        elStatus.textContent = 'Berhenti / Mengantre';
        elStatus.className = 'status-tag tag-stopped';
      } else if (selected.vehicle.isBraking) {
        elStatus.textContent = 'Mengerem / Deselerasi';
        elStatus.className = 'status-tag tag-braking';
      } else {
        elStatus.textContent = 'Melaju Lancar';
        elStatus.className = 'status-tag tag-cruising';
      }
    }
  }

  drawRadar() {
    // Radar removed per user request
  }
}
