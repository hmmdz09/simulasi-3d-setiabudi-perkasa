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
        if (this.app.pedestrianSystem && this.app.pedestrianSystem.audio) {
          this.app.pedestrianSystem.audio.playButtonFeedback();
        }

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

    // 4b. Toggle Simpang 3 Dual-Red Phase (Setiabudi & Terusan Merah Keduanya)
    const toggleDualRedBtn = document.getElementById('btn-toggle-dual-red');
    if (toggleDualRedBtn) {
      toggleDualRedBtn.addEventListener('click', () => {
        if (this.app.trafficSystem && typeof this.app.trafficSystem.toggleDualRedPhase === 'function') {
          const isDual = this.app.trafficSystem.toggleDualRedPhase();
          this.updateDualRedWidget(isDual);
        }
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

    // 5b. System Choice: Pake Sistem vs Tanpa Sistem (Top Dock)
    const btnSysAfter = document.getElementById('btn-sys-after');
    const btnSysBefore = document.getElementById('btn-sys-before');
    if (btnSysAfter) {
      btnSysAfter.addEventListener('click', () => {
        this.setSystemMode('after');
      });
    }
    if (btnSysBefore) {
      btnSysBefore.addEventListener('click', () => {
        this.setSystemMode('before');
      });
    }

    // 5c. Session Switcher: Pagi vs Sore (Synchronized across both views)
    const updateSessionButtons = (sessionId) => {
      const isMorning = sessionId === 'morning';
      const morningBtns = [document.getElementById('btn-session-morning'), document.getElementById('btn-session-morning-after')];
      const eveningBtns = [document.getElementById('btn-session-evening'), document.getElementById('btn-session-evening-after')];

      morningBtns.forEach(b => { if (b) b.classList.toggle('active', isMorning); });
      eveningBtns.forEach(b => { if (b) b.classList.toggle('active', !isMorning); });

      this.app.pedestrianSystem.setSession(sessionId);
    };

    ['btn-session-morning', 'btn-session-morning-after'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => updateSessionButtons('morning'));
    });

    ['btn-session-evening', 'btn-session-evening-after'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => updateSessionButtons('evening'));
    });

    // 5d. Comparison Report Modal
    const btnOpenReport = document.getElementById('btn-open-report');
    const modalReport = document.getElementById('modal-comparison-report');
    const btnCloseReport = document.getElementById('btn-close-report');
    const btnDismissReport = document.getElementById('btn-dismiss-report');

    if (btnOpenReport && modalReport) {
      btnOpenReport.addEventListener('click', () => {
        modalReport.style.display = 'flex';
      });
    }
    const closeModal = () => {
      if (modalReport) modalReport.style.display = 'none';
    };
    if (btnCloseReport) btnCloseReport.addEventListener('click', closeModal);
    if (btnDismissReport) btnDismissReport.addEventListener('click', closeModal);
    if (modalReport) {
      modalReport.addEventListener('click', (e) => {
        if (e.target === modalReport) closeModal();
      });
    }

    // 6. Pedestrian crossing state listener (with green wave corridor, audio guidance, empirical data & dual-red sync)
    this.app.pedestrianSystem.onStateChange = (isCrossing, isButtonLocked, crossingSec, lockdownSec, mode, greenWaveInfo, empiricalInfo, audioAnnounceInfo, dualRedInfo) => {
      this.updateCrossingUI(isCrossing, isButtonLocked, crossingSec, lockdownSec, mode, greenWaveInfo, empiricalInfo, audioAnnounceInfo, dualRedInfo);
    };

    // 7. Toggle Control Deck Button
    const toggleDeckBtn = document.getElementById('btn-toggle-deck');
    if (toggleDeckBtn) {
      toggleDeckBtn.addEventListener('click', () => {
        this.toggleControlDeck();
      });
    }

    const cardCloseBtn = document.getElementById('btn-card-close');
    if (cardCloseBtn) {
      cardCloseBtn.addEventListener('click', () => {
        this.toggleControlDeck(true);
      });
    }
  }

  setSystemMode(mode) {
    const btnAfter = document.getElementById('btn-sys-after');
    const btnBefore = document.getElementById('btn-sys-before');
    if (btnAfter && btnBefore) {
      btnAfter.classList.toggle('active', mode === 'after');
      btnBefore.classList.toggle('active', mode === 'before');
    }

    const viewAfter = document.getElementById('view-sys-after');
    const viewBefore = document.getElementById('view-sys-before');
    if (viewAfter && viewBefore) {
      viewAfter.style.display = mode === 'after' ? 'flex' : 'none';
      viewBefore.style.display = mode === 'before' ? 'flex' : 'none';
    }

    const chip = document.getElementById('chip-mode-status');
    if (chip) {
      if (mode === 'before') {
        chip.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Tanpa Sistem';
        chip.className = 'crossing-active-chip chip-amber';
      } else {
        const activeMode = this.app.pedestrianSystem.crossingMode;
        if (activeMode === 'tunanetra') {
          chip.innerHTML = '<i class="fa-solid fa-volume-high"></i> Tuna Netra';
          chip.className = 'crossing-active-chip chip-amber';
        } else {
          chip.innerHTML = '<i class="fa-solid fa-traffic-light"></i> Normal';
          chip.className = 'crossing-active-chip chip-green';
        }
      }
    }

    this.app.pedestrianSystem.setSystemMode(mode);
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

  updateCrossingUI(isCrossing, isButtonLocked, crossingSec, lockdownSec, mode, greenWaveInfo = null, empiricalInfo = null, audioAnnounceInfo = null, dualRedInfo = null) {
    const badge = document.getElementById('zebra-status-badge');
    const btn = document.getElementById('btn-zebra-cross');
    const cancelBtn = document.getElementById('btn-cancel-lockdown');
    const lampRed = document.getElementById('lamp-red');
    const lampGreen = document.getElementById('lamp-green');
    const title = document.getElementById('signal-title');
    const subtitle = document.getElementById('signal-subtitle');
    const countdown = document.getElementById('signal-countdown');
    const audioPulse = document.getElementById('audio-pulse-indicator');

    // Extract dual-red status
    const isDualRed = dualRedInfo ? !!dualRedInfo.isDualRed : (this.app.trafficSystem && typeof this.app.trafficSystem.isSetiabudiDualRed === 'function' && this.app.trafficSystem.isSetiabudiDualRed());
    this.updateDualRedWidget(isDualRed);

    // Extract green wave coordination flags
    const gwBlocking = greenWaveInfo ? !!greenWaveInfo.isBlocking : false;
    const gwPending = greenWaveInfo ? !!greenWaveInfo.isPending : false;
    const gwRemaining = greenWaveInfo ? (greenWaveInfo.remaining || 0) : 0;
    const isAnnouncing = audioAnnounceInfo ? !!audioAnnounceInfo.isAnnouncing : false;

    // Extract empirical mode & stats if in 'before' mode
    if (empiricalInfo && empiricalInfo.systemMode === 'before') {
      const s = empiricalInfo.currentSession;
      if (s) {
        const illegalEl = document.getElementById('stat-illegal-count');
        const mupenasEl = document.getElementById('stat-mupenas-count');
        if (illegalEl) illegalEl.textContent = `${s.illegal} Orang (${((s.illegal / s.total) * 100).toFixed(1)}%)`;
        if (mupenasEl) mupenasEl.textContent = `${s.mupenas} Orang (${((s.mupenas / s.total) * 100).toFixed(1)}%)`;
      }
      const conflictEl = document.getElementById('live-conflict-counter');
      const jaywalkerEl = document.getElementById('live-jaywalker-counter');
      if (conflictEl && empiricalInfo.stats) conflictEl.textContent = empiricalInfo.stats.conflictsCount;
      if (jaywalkerEl && empiricalInfo.stats) jaywalkerEl.textContent = empiricalInfo.stats.illegalCrossed + (empiricalInfo.activeJaywalkers || 0);

      if (badge) {
        badge.className = 'status-pill active-crossing';
        badge.innerHTML = '<span class="pulse-dot-red"></span><span>Rawan Konflik (Tanpa Sistem)</span>';
      }
      return;
    }

    // Update queue & platoon consolidation cards
    const qWaitingEl = document.getElementById('queue-waiting-counter');
    const qPlatoonEl = document.getElementById('queue-platoon-size');
    const qCrossedEl = document.getElementById('queue-crossed-counter');
    if (empiricalInfo) {
      if (qWaitingEl) {
        const waitingCount = empiricalInfo.waitingQueueCount || 0;
        const activeCount = empiricalInfo.activePlatoonCount || 0;
        qWaitingEl.textContent = isCrossing ? `${activeCount} Menyeberang` : `${waitingCount} Orang`;
      }
      if (qPlatoonEl) {
        const targetSize = empiricalInfo.platoonTargetSize || 7;
        qPlatoonEl.textContent = `${targetSize} Orang`;
      }
      if (qCrossedEl && empiricalInfo.stats) {
        qCrossedEl.textContent = `${empiricalInfo.stats.mupenasCrossed} Orang`;
      }
    }

    if (isAnnouncing) {
      // 0b. FASE AUDIO PANDUAN SUARA TUNA NETRA:
      // Suara pengumuman sedang berbunyi, kendaraan berhenti, tuna netra masih di trotoar
      if (lampRed) lampRed.classList.add('active');
      if (lampGreen) lampGreen.classList.remove('active');

      if (title) title.textContent = '🔊 Panduan Suara: Sinyal Diterima';
      if (subtitle) subtitle.textContent = 'Memutar suara: "Penyeberangan diterima, silakan menyeberang." (Menunggu audio selesai...)';

      if (countdown) {
        countdown.style.display = 'block';
        countdown.textContent = 'AUDIO';
      }

      if (audioPulse) {
        audioPulse.style.display = 'flex';
      }

      if (badge) {
        badge.className = 'status-pill active-crossing';
        badge.innerHTML = '<span class="pulse-dot-red"></span><span>🔊 Panduan Audio Aktif</span>';
      }

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Panduan Suara Sedang Berbunyi...';
      }

      if (cancelBtn) {
        cancelBtn.style.display = 'flex';
        cancelBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Batalkan';
      }
      return;
    }

    if (isCrossing) {
      // 1. ACTIVE PEDESTRIAN CROSSING (10s Normal / 20s Tuna Netra)
      if (lampRed) lampRed.classList.remove('active');
      if (lampGreen) lampGreen.classList.add('active');

      if (title) {
        title.textContent = mode === 'tunanetra'
          ? 'Lampu Hijau Pejalan Kaki (Akses Tuna Netra)'
          : 'Lampu Hijau Pejalan Kaki: Menyebrang';
      }
      if (subtitle) {
        subtitle.textContent = mode === 'tunanetra'
          ? `Audio selesai. Tuna Netra menyeberang dipandu sinyal akustik bip pelican (${crossingSec}s)`
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

      if (countdown) countdown.style.display = 'none';
      if (audioPulse) audioPulse.style.display = 'none';

      if (isDualRed) {
        if (title) title.textContent = '⚡ Setiabudi & Terusan Merah: Langsung Tersedia!';
        if (subtitle) subtitle.textContent = 'Simpang 3 sedang merah kedua-duanya. Lockdown Mupenas dilepas otomatis & penyeberangan langsung tersedia!';

        if (badge) {
          badge.className = 'status-pill active-crossing chip-dual-red';
          badge.innerHTML = '<span class="pulse-dot"></span><span>⚡ Mupenas Langsung Tersedia (Dual-Red)</span>';
        }

        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-person-walking-arrow-right"></i> Minta Menyebrang (Langsung Tersedia)';
        }
      } else {
        if (title) title.textContent = 'Sinyal Kendaraan: Melaju Normal';
        if (subtitle) subtitle.textContent = 'Tekan tombol di bawah untuk meminta lampu hijau menyebrang';

        if (badge) {
          badge.className = 'status-pill';
          badge.innerHTML = '<span class="pulse-dot"></span><span>Koridor Tertib (Pake Sistem)</span>';
        }

        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-hand"></i> Minta Menyebrang (Tekan Tombol)';
        }
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
    this.updateEmpiricalCounters();
    this.updateSimpangLightBadge();
    if (this.app.trafficSystem && typeof this.app.trafficSystem.isSetiabudiDualRed === 'function') {
      this.updateDualRedWidget(this.app.trafficSystem.isSetiabudiDualRed());
    }
  }

  updateSimpangLightBadge() {
    if (!this.app.trafficSystem || typeof this.app.trafficSystem.getSimpangLightInfo !== 'function') return;
    const info = this.app.trafficSystem.getSimpangLightInfo();
    const textEl = document.getElementById('simpang-apill-text');
    const iconEl = document.getElementById('simpang-apill-icon');
    if (!textEl) return;

    const sState = info.setiabudiState || (info.setiabudi && info.setiabudi.state) || 'RED';
    const sTime = Math.max(0, Math.round(Number(info.setiabudiTimeRemaining ?? info.setiabudi?.countdown ?? 0) || 0));
    const bState = info.bajuriState || (info.bajuri && info.bajuri.state) || 'RED';
    const bTime = Math.max(0, Math.round(Number(info.bajuriTimeRemaining ?? info.bajuri?.countdown ?? 0) || 0));

    let sIcon = '🟢';
    let sColor = '#10b981';
    if (sState === 'YELLOW') {
      sIcon = '🟡';
      sColor = '#f59e0b';
    } else if (sState === 'RED') {
      sIcon = '🔴';
      sColor = '#ef4444';
    }

    let bIcon = '🟢';
    if (bState === 'YELLOW') {
      bIcon = '🟡';
    } else if (bState === 'RED') {
      bIcon = '🔴';
    }

    const mupenasTag = info.isDualRed ? ' • ⚡ Mupenas Tersedia' : '';
    textEl.textContent = `Setiabudi ${sIcon} ${sTime}s${mupenasTag} | Bajuri ${bIcon} ${bTime}s`;
    if (iconEl) {
      iconEl.style.color = sColor;
    }
  }

  updateDualRedWidget(isDualRed) {
    const card = document.getElementById('simpang-dual-red-card');
    const badge = document.getElementById('dual-red-badge-indicator');
    const desc = document.getElementById('dual-red-status-desc');
    const btnText = document.getElementById('btn-toggle-dual-red-text');
    const btn = document.getElementById('btn-toggle-dual-red');

    if (!card) return;

    if (isDualRed) {
      card.classList.add('dual-red-active');
      if (badge) {
        badge.className = 'dual-red-badge badge-red';
        badge.innerHTML = '<span class="pulse-dot-red"></span> Merah Keduanya (Bypass Aktif)';
      }
      if (desc) {
        desc.innerHTML = '⚡ <strong>Setiabudi & Terusan Setiabudi KEDUA-DUANYA MERAH!</strong> Lockdown di Mupenas seketika dilepas & tombol penyeberangan <strong>langsung tersedia</strong>!';
      }
      if (btnText) {
        btnText.textContent = 'Kembalikan Setiabudi ke Hijau';
      }
      if (btn) {
        btn.classList.add('btn-active-red');
      }
    } else {
      card.classList.remove('dual-red-active');
      if (badge) {
        badge.className = 'dual-red-badge badge-green';
        badge.innerHTML = '<span class="pulse-dot-green"></span> Setiabudi Hijau (Normal)';
      }
      if (desc) {
        desc.innerHTML = 'Jika Jl. Setiabudi & Terusan Setiabudi kedua-duanya <strong>Lampu Merah</strong>, tombol penyeberangan Mupenas <strong>langsung tersedia</strong> (lockdown otomatis dilepas).';
      }
      if (btnText) {
        btnText.textContent = 'Simulasikan Merah Keduanya (Bypass)';
      }
      if (btn) {
        btn.classList.remove('btn-active-red');
      }
    }
  }

  updateEmpiricalCounters() {
    if (!this.app.pedestrianSystem || this.app.pedestrianSystem.systemMode !== 'before') return;
    const stats = this.app.pedestrianSystem.getStats();
    const conflictEl = document.getElementById('live-conflict-counter');
    const jaywalkerEl = document.getElementById('live-jaywalker-counter');
    if (conflictEl) conflictEl.textContent = stats.conflictsCount;
    if (jaywalkerEl) jaywalkerEl.textContent = stats.illegalCrossed + (stats.activeJaywalkers || 0);
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
