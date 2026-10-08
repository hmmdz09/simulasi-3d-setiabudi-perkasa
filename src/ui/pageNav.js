import gsap from 'gsap';

export class PageNavigationManager {
  constructor(app) {
    this.app = app;
    this.currentPage = 'simulasi';
    this.hasilState = 'before'; // 'before' | 'after'
    this.isAnimatingHasil = false;

    this.navBtns = document.querySelectorAll('.page-nav-btn');
    this.profileView = document.getElementById('view-profile');
    this.hasilView = document.getElementById('view-hasil');
    this.controlDeck = document.getElementById('control-deck');
    this.telemetryDeck = document.getElementById('telemetry-overlay');
    this.cameraDock = document.getElementById('camera-dock-row2');

    this.init();
  }

  init() {
    this.navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page && page !== this.currentPage) {
          this.switchPage(page);
        }
      });
    });

    // Setup interactive 3D tilt on team cards
    this.initCardInteractions();

    // Setup interactive comparison handlers for Hasil page
    this.setupHasilInteractions();
  }

  switchPage(page) {
    const previousPage = this.currentPage;
    this.currentPage = page;

    // Update active nav buttons
    this.navBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });

    if (page === 'simulasi') {
      this.showSimulasi(previousPage);
    } else if (page === 'profile') {
      this.showProfile(previousPage);
    } else if (page === 'hasil') {
      this.showHasil(previousPage);
    }
  }

  showSimulasi(prev) {
    // Hide overlay views with smooth fade out
    const viewsToHide = [];
    if (this.profileView && this.profileView.style.display !== 'none') viewsToHide.push(this.profileView);
    if (this.hasilView && this.hasilView.style.display !== 'none') viewsToHide.push(this.hasilView);

    if (viewsToHide.length > 0) {
      gsap.to(viewsToHide, {
        opacity: 0,
        y: -15,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => {
          viewsToHide.forEach(v => {
            v.style.display = 'none';
          });
        }
      });
    }

    // Re-display control deck and simulation overlays
    if (this.controlDeck) {
      this.controlDeck.style.pointerEvents = 'auto';
      gsap.to(this.controlDeck, { opacity: 1, duration: 0.35, ease: 'power2.out' });
    }

    if (this.cameraDock) {
      this.cameraDock.style.pointerEvents = 'auto';
      gsap.to(this.cameraDock, { opacity: 1, duration: 0.35, ease: 'power2.out' });
    }

    // Re-enable camera controls
    if (this.app.controls) {
      this.app.controls.enabled = true;
    }
  }

  showProfile(prev) {
    // Hide hasil view if active
    if (this.hasilView) {
      this.hasilView.style.display = 'none';
      this.hasilView.style.opacity = '0';
    }

    // Dim or lower simulation control deck
    if (this.controlDeck) {
      this.controlDeck.style.pointerEvents = 'none';
      gsap.to(this.controlDeck, { opacity: 0.15, duration: 0.3 });
    }

    if (this.cameraDock) {
      this.cameraDock.style.pointerEvents = 'none';
      gsap.to(this.cameraDock, { opacity: 0, duration: 0.25 });
    }

    // Show profile container
    if (this.profileView) {
      this.profileView.style.display = 'block';
      this.profileView.style.opacity = '0';

      const tl = gsap.timeline();

      // Fade in background view
      tl.to(this.profileView, {
        opacity: 1,
        duration: 0.35,
        ease: 'power2.out'
      });

      // Animate header banner
      tl.fromTo(
        '#view-profile .profile-hero-badge',
        { opacity: 0, scale: 0.8, y: -20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: 'back.out(1.7)' },
        '-=0.2'
      );

      tl.fromTo(
        '#view-profile .profile-title',
        { opacity: 0, y: -25 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' },
        '-=0.3'
      );

      tl.fromTo(
        '#view-profile .profile-subtitle',
        { opacity: 0, y: -15 },
        { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' },
        '-=0.35'
      );

      tl.fromTo(
        '#view-profile .profile-stats-bar',
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' },
        '-=0.3'
      );

      // Stagger entrance for team cards
      tl.fromTo(
        '#view-profile .team-card',
        {
          opacity: 0,
          y: 50,
          scale: 0.92,
          rotationX: 8
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          rotationX: 0,
          duration: 0.65,
          stagger: 0.1,
          ease: 'back.out(1.4)',
          clearProps: 'transform'
        },
        '-=0.25'
      );

      // Stagger role badges pop
      tl.fromTo(
        '#view-profile .team-role-pill',
        { scale: 0.5, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, stagger: 0.08, ease: 'elastic.out(1, 0.6)' },
        '-=0.4'
      );
    }
  }

  showHasil(prev) {
    // Hide profile view if active
    if (this.profileView) {
      this.profileView.style.display = 'none';
      this.profileView.style.opacity = '0';
    }

    // Dim simulation control deck
    if (this.controlDeck) {
      this.controlDeck.style.pointerEvents = 'none';
      gsap.to(this.controlDeck, { opacity: 0.15, duration: 0.3 });
    }

    if (this.cameraDock) {
      this.cameraDock.style.pointerEvents = 'none';
      gsap.to(this.cameraDock, { opacity: 0, duration: 0.25 });
    }

    // Show hasil view
    if (this.hasilView) {
      this.hasilView.style.display = 'block';
      this.hasilView.style.opacity = '0';

      const tl = gsap.timeline();

      tl.to(this.hasilView, {
        opacity: 1,
        duration: 0.35,
        ease: 'power2.out'
      });

      // Animate header and stepper
      tl.fromTo(
        '#view-hasil .hasil-hero-header > *',
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.08, ease: 'power3.out' },
        '-=0.2'
      );

      // Animate the comparison cards entrance
      tl.fromTo(
        '#view-hasil .comparison-card',
        { opacity: 0, y: 35, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.12, ease: 'back.out(1.4)' },
        '-=0.25'
      );

      // Animate CTA panel
      tl.fromTo(
        '#view-hasil .hasil-cta-panel',
        { opacity: 0, y: 25 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' },
        '-=0.2'
      );
    }
  }

  initCardInteractions() {
    const cards = document.querySelectorAll('.team-card');
    cards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        gsap.to(card, {
          rotationY: x * 0.045,
          rotationX: -y * 0.045,
          transformPerspective: 800,
          ease: 'power1.out',
          duration: 0.25
        });
      });

      card.addEventListener('mouseleave', () => {
        gsap.to(card, {
          rotationY: 0,
          rotationX: 0,
          ease: 'power2.out',
          duration: 0.45
        });
      });
    });
  }

  setupHasilInteractions() {
    const btnLanjut = document.getElementById('btn-lanjut-hasil');
    const btnReset = document.getElementById('btn-reset-hasil');
    const btnStepBefore = document.getElementById('btn-step-before');
    const btnStepAfter = document.getElementById('btn-step-after');

    if (btnLanjut) {
      btnLanjut.addEventListener('click', () => {
        if (this.hasilState === 'before') {
          this.animateToAfter();
        } else {
          this.animateToAfter(true); // replay
        }
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.animateToBefore();
      });
    }

    if (btnStepBefore) {
      btnStepBefore.addEventListener('click', () => {
        this.animateToBefore();
      });
    }

    if (btnStepAfter) {
      btnStepAfter.addEventListener('click', () => {
        this.animateToAfter();
      });
    }
  }

  animateToAfter(isReplay = false) {
    if (this.isAnimatingHasil) return;
    this.isAnimatingHasil = true;
    this.hasilState = 'after';

    // Sound feedback if available
    if (this.app.pedestrianSystem && this.app.pedestrianSystem.audio) {
      this.app.pedestrianSystem.audio.playAnnouncementChime();
    }

    // Elements
    const btnStepBefore = document.getElementById('btn-step-before');
    const btnStepAfter = document.getElementById('btn-step-after');
    const cardHedera = document.getElementById('card-hedera-helix');
    const cardTraffic = document.getElementById('card-traffic-perf');
    const glowHedera = document.getElementById('glow-hedera');
    const glowTraffic = document.getElementById('glow-traffic');

    const chipHedera = document.getElementById('chip-status-hedera');
    const chipTraffic = document.getElementById('chip-status-traffic');

    const numCo2 = document.getElementById('num-co2-val');
    const labelCo2Desc = document.getElementById('label-co2-desc');
    const deltaCo2 = document.getElementById('delta-pill-co2');
    const meterCo2Percent = document.getElementById('meter-co2-percent');
    const meterCo2Fill = document.getElementById('meter-co2-fill');
    const textInsightHedera = document.getElementById('text-insight-hedera');
    const iconInsightHedera = document.getElementById('icon-insight-hedera');
    const insightBoxHedera = document.getElementById('insight-box-hedera');

    const numSpeed = document.getElementById('num-speed-val');
    const deltaSpeed = document.getElementById('delta-pill-speed');
    const meterSpeedPercent = document.getElementById('meter-speed-percent');
    const meterSpeedFill = document.getElementById('meter-speed-fill');

    const numTime = document.getElementById('num-time-val');
    const deltaTime = document.getElementById('delta-pill-time');
    const textInsightTraffic = document.getElementById('text-insight-traffic');
    const iconInsightTraffic = document.getElementById('icon-insight-traffic');
    const insightBoxTraffic = document.getElementById('insight-box-traffic');

    const ctaPhaseText = document.getElementById('cta-phase-text');
    const ctaDescText = document.getElementById('cta-desc-text');
    const btnLanjut = document.getElementById('btn-lanjut-hasil');
    const btnLanjutText = document.getElementById('btn-lanjut-text');
    const btnReset = document.getElementById('btn-reset-hasil');

    // 1. Update stepper active state
    if (btnStepBefore) btnStepBefore.classList.remove('active');
    if (btnStepAfter) btnStepAfter.classList.add('active');

    // 2. Card glow & active style
    if (cardHedera) cardHedera.classList.add('after-active');
    if (cardTraffic) cardTraffic.classList.add('after-active');
    if (glowHedera) glowHedera.classList.add('green-glow');
    if (glowTraffic) glowTraffic.classList.add('green-glow');

    if (chipHedera) {
      chipHedera.textContent = 'Sesudah (Hedera Helix)';
      chipHedera.className = 'comp-status-chip green';
    }
    if (chipTraffic) {
      chipTraffic.textContent = 'Sesudah (Pelican Sistem)';
      chipTraffic.className = 'comp-status-chip green';
    }

    // 3. Reset starting numbers if replay
    const startCo2 = isReplay ? 2.10 : parseFloat(numCo2 ? numCo2.textContent : 2.10);
    const startSpeed = isReplay ? 15 : parseInt(numSpeed ? numSpeed.textContent : 15);

    if (numCo2) numCo2.textContent = startCo2.toFixed(2);
    if (numSpeed) numSpeed.textContent = startSpeed;

    // 4. DRAMATIC NUMBER ANIMATIONS (GSAP)
    const tl = gsap.timeline({
      onComplete: () => {
        this.isAnimatingHasil = false;
      }
    });

    // A. CO2 COUNTER: 2.10 t -> 1.98 t (-6%)
    const co2Obj = { val: 2.10 };
    tl.to(
      co2Obj,
      {
        val: 1.98,
        duration: 2.2,
        ease: 'power2.inOut',
        onUpdate: () => {
          if (numCo2) numCo2.textContent = co2Obj.val.toFixed(2);
        },
        onComplete: () => {
          if (numCo2) {
            numCo2.textContent = '1.98';
            numCo2.classList.add('green-accent');
          }
        }
      },
      0
    );

    // CO2 meter animation (100% -> 94.3%)
    if (meterCo2Fill) {
      tl.to(
        meterCo2Fill,
        {
          width: '94.3%',
          duration: 2.2,
          ease: 'power2.inOut',
          onStart: () => {
            meterCo2Fill.className = 'comp-meter-fill green-fill';
          }
        },
        0
      );
    }
    if (meterCo2Percent) {
      meterCo2Percent.textContent = '94.3% (1.98 Ton - Turun 6%)';
    }
    if (labelCo2Desc) {
      labelCo2Desc.textContent = 'Emisi terserap vegetasi rambat pagar Hedera Helix';
    }

    // CO2 Delta Pill Pop
    if (deltaCo2) {
      deltaCo2.style.display = 'inline-flex';
      tl.fromTo(
        deltaCo2,
        { scale: 0, opacity: 0, rotation: -12 },
        { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: 'back.out(2.2)' },
        0.9
      );
    }

    // CO2 Insight text update
    if (textInsightHedera) {
      textInsightHedera.innerHTML = '<strong>Sesudah Ada Sistem & Hedera Helix:</strong> Pagar pembatas yang ditanami vegetasi rambat <em>Hedera Helix</em> terbukti menyerap partikel mikro dan emisi gas buang kendaraan, mereduksi emisi hingga <strong>1,98 Ton CO₂ (berkurang 6%)</strong> sehingga udara trotoar lebih aman bagi pejalan kaki.';
    }
    if (iconInsightHedera) {
      iconInsightHedera.className = 'fa-solid fa-leaf text-cyan';
    }
    if (insightBoxHedera) {
      insightBoxHedera.classList.add('success-border');
    }

    // B. SPEED COUNTER: 15 km/jam -> 37 km/jam (+146.7%)
    const speedObj = { val: 15 };
    tl.to(
      speedObj,
      {
        val: 37,
        duration: 2.2,
        ease: 'power2.inOut',
        onUpdate: () => {
          if (numSpeed) numSpeed.textContent = Math.round(speedObj.val);
        },
        onComplete: () => {
          if (numSpeed) {
            numSpeed.textContent = '37';
            numSpeed.classList.add('green-accent');
          }
        }
      },
      0
    );

    // Speed meter animation (37.5% -> 92.5%)
    if (meterSpeedFill) {
      tl.to(
        meterSpeedFill,
        {
          width: '92.5%',
          duration: 2.2,
          ease: 'power2.inOut',
          onStart: () => {
            meterSpeedFill.className = 'comp-meter-fill blue-fill';
          }
        },
        0
      );
    }
    if (meterSpeedPercent) {
      meterSpeedPercent.textContent = '37 km/jam (Lancar Terkendali)';
    }

    // Speed Delta Pill Pop
    if (deltaSpeed) {
      deltaSpeed.style.display = 'inline-flex';
      tl.fromTo(
        deltaSpeed,
        { scale: 0, opacity: 0, rotation: -12 },
        { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: 'back.out(2.2)' },
        1.0
      );
    }

    // C. TIME COUNTER: 10m 50s (650s) -> 6m 00s (360s) (-44.6%)
    const timeObj = { sec: 650 };
    tl.to(
      timeObj,
      {
        sec: 360,
        duration: 2.2,
        ease: 'power2.inOut',
        onUpdate: () => {
          const s = Math.round(timeObj.sec);
          const min = Math.floor(s / 60);
          const remSec = s % 60;
          if (numTime) {
            numTime.textContent = remSec === 0 ? `${min} mnt` : `${min}:${remSec < 10 ? '0' : ''}${remSec}`;
          }
        },
        onComplete: () => {
          if (numTime) {
            numTime.textContent = '6:00';
            numTime.classList.add('green-accent');
          }
        }
      },
      0
    );

    // Time Delta Pill Pop
    if (deltaTime) {
      deltaTime.style.display = 'inline-flex';
      tl.fromTo(
        deltaTime,
        { scale: 0, opacity: 0, rotation: 12 },
        { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: 'back.out(2.2)' },
        1.1
      );
    }

    // Traffic Insight text update
    if (textInsightTraffic) {
      textInsightTraffic.innerHTML = '<strong>Sesudah Ada Sistem:</strong> Penerapan pelican crossing terkoordinasi dan zebra cross terpusat berhasil mengeliminasi pengereman mendadak. Arus lalu lintas melaju lancar pada <strong>37 km/jam (+146.7%)</strong> dan waktu tempuh koridor 4 km terpangkas menjadi <strong>6 menit</strong> (hemat 4 menit 50 detik).';
    }
    if (iconInsightTraffic) {
      iconInsightTraffic.className = 'fa-solid fa-circle-check text-cyan';
    }
    if (insightBoxTraffic) {
      insightBoxTraffic.classList.add('success-border');
    }

    // D. CTA PANEL UPDATE
    if (ctaPhaseText) ctaPhaseText.textContent = 'Langkah 2 dari 2: Evaluasi Keberhasilan Sistem';
    if (ctaDescText) ctaDescText.textContent = 'Sistem terbukti berhasil mereduksi emisi CO₂ sebesar 6% serta memangkas waktu tempuh 4 km sebesar 44.6% (lebih cepat 4 menit 50 detik).';

    if (btnLanjutText) btnLanjutText.textContent = 'Ulangi Animasi Perubahan';
    if (btnReset) btnReset.style.display = 'inline-flex';
  }

  animateToBefore() {
    if (this.isAnimatingHasil) return;
    this.isAnimatingHasil = true;
    this.hasilState = 'before';

    const btnStepBefore = document.getElementById('btn-step-before');
    const btnStepAfter = document.getElementById('btn-step-after');
    const cardHedera = document.getElementById('card-hedera-helix');
    const cardTraffic = document.getElementById('card-traffic-perf');
    const glowHedera = document.getElementById('glow-hedera');
    const glowTraffic = document.getElementById('glow-traffic');

    const chipHedera = document.getElementById('chip-status-hedera');
    const chipTraffic = document.getElementById('chip-status-traffic');

    const numCo2 = document.getElementById('num-co2-val');
    const labelCo2Desc = document.getElementById('label-co2-desc');
    const deltaCo2 = document.getElementById('delta-pill-co2');
    const meterCo2Percent = document.getElementById('meter-co2-percent');
    const meterCo2Fill = document.getElementById('meter-co2-fill');
    const textInsightHedera = document.getElementById('text-insight-hedera');
    const iconInsightHedera = document.getElementById('icon-insight-hedera');
    const insightBoxHedera = document.getElementById('insight-box-hedera');

    const numSpeed = document.getElementById('num-speed-val');
    const deltaSpeed = document.getElementById('delta-pill-speed');
    const meterSpeedPercent = document.getElementById('meter-speed-percent');
    const meterSpeedFill = document.getElementById('meter-speed-fill');

    const numTime = document.getElementById('num-time-val');
    const deltaTime = document.getElementById('delta-pill-time');
    const textInsightTraffic = document.getElementById('text-insight-traffic');
    const iconInsightTraffic = document.getElementById('icon-insight-traffic');
    const insightBoxTraffic = document.getElementById('insight-box-traffic');

    const ctaPhaseText = document.getElementById('cta-phase-text');
    const ctaDescText = document.getElementById('cta-desc-text');
    const btnLanjutText = document.getElementById('btn-lanjut-text');
    const btnReset = document.getElementById('btn-reset-hasil');

    // 1. Stepper
    if (btnStepBefore) btnStepBefore.classList.add('active');
    if (btnStepAfter) btnStepAfter.classList.remove('active');

    // 2. Card styling reset
    if (cardHedera) cardHedera.classList.remove('after-active');
    if (cardTraffic) cardTraffic.classList.remove('after-active');
    if (glowHedera) glowHedera.classList.remove('green-glow');
    if (glowTraffic) glowTraffic.classList.remove('green-glow');

    if (chipHedera) {
      chipHedera.textContent = 'Kondisi Sebelum';
      chipHedera.className = 'comp-status-chip';
    }
    if (chipTraffic) {
      chipTraffic.textContent = 'Kondisi Sebelum';
      chipTraffic.className = 'comp-status-chip';
    }

    // 3. Smooth counter revert
    const tl = gsap.timeline({
      onComplete: () => {
        this.isAnimatingHasil = false;
      }
    });

    // Revert CO2
    const currentCo2 = parseFloat(numCo2 ? numCo2.textContent : 1.98);
    const co2Obj = { val: currentCo2 };
    tl.to(
      co2Obj,
      {
        val: 2.10,
        duration: 1.2,
        ease: 'power2.out',
        onUpdate: () => {
          if (numCo2) numCo2.textContent = co2Obj.val.toFixed(2);
        },
        onComplete: () => {
          if (numCo2) {
            numCo2.textContent = '2.10';
            numCo2.classList.remove('green-accent');
          }
        }
      },
      0
    );

    if (meterCo2Fill) {
      tl.to(
        meterCo2Fill,
        {
          width: '100%',
          duration: 1.2,
          ease: 'power2.out',
          onStart: () => {
            meterCo2Fill.className = 'comp-meter-fill red-fill';
          }
        },
        0
      );
    }
    if (meterCo2Percent) meterCo2Percent.textContent = '100% (2.10 Ton)';
    if (labelCo2Desc) labelCo2Desc.textContent = 'Emisi gas buang karbon tanpa vegetasi penyerap';
    if (deltaCo2) deltaCo2.style.display = 'none';

    if (textInsightHedera) {
      textInsightHedera.innerHTML = '<strong>Sebelum Ada Sistem:</strong> Koridor jalan tanpa vegetasi pembatas menghasilkan akumulasi emisi sebesar <strong>2,1 Ton CO₂</strong> dari kendaraan bermotor yang langsung terhirup oleh pejalan kaki di trotoar.';
    }
    if (iconInsightHedera) {
      iconInsightHedera.className = 'fa-solid fa-circle-exclamation text-amber';
    }
    if (insightBoxHedera) insightBoxHedera.classList.remove('success-border');

    // Revert Speed
    const currentSpeed = parseInt(numSpeed ? numSpeed.textContent : 37);
    const speedObj = { val: currentSpeed };
    tl.to(
      speedObj,
      {
        val: 15,
        duration: 1.2,
        ease: 'power2.out',
        onUpdate: () => {
          if (numSpeed) numSpeed.textContent = Math.round(speedObj.val);
        },
        onComplete: () => {
          if (numSpeed) {
            numSpeed.textContent = '15';
            numSpeed.classList.remove('green-accent');
          }
        }
      },
      0
    );

    if (meterSpeedFill) {
      tl.to(
        meterSpeedFill,
        {
          width: '37.5%',
          duration: 1.2,
          ease: 'power2.out',
          onStart: () => {
            meterSpeedFill.className = 'comp-meter-fill amber-fill';
          }
        },
        0
      );
    }
    if (meterSpeedPercent) meterSpeedPercent.textContent = '15 km/jam (Macet & Tersendat)';
    if (deltaSpeed) deltaSpeed.style.display = 'none';

    // Revert Time
    if (numTime) {
      numTime.textContent = '10:50';
      numTime.classList.remove('green-accent');
    }
    if (deltaTime) deltaTime.style.display = 'none';

    if (textInsightTraffic) {
      textInsightTraffic.innerHTML = '<strong>Sebelum Ada Sistem:</strong> Banyaknya pejalan kaki menyeberang sembarangan memaksa kendaraan berulang kali mengerem mendadak dan memicu antrean macet, menurunkan kecepatan rata-rata ke <strong>15 km/jam</strong> dan memperpanjang waktu tempuh 4 km menjadi <strong>10 menit 50 detik</strong>.';
    }
    if (iconInsightTraffic) {
      iconInsightTraffic.className = 'fa-solid fa-triangle-exclamation text-amber';
    }
    if (insightBoxTraffic) insightBoxTraffic.classList.remove('success-border');

    // Revert CTA
    if (ctaPhaseText) ctaPhaseText.textContent = 'Langkah 1 dari 2: Tampilan Kondisi Awal';
    if (ctaDescText) ctaDescText.textContent = 'Klik tombol di samping untuk melihat hasil perubahan angka dramatis setelah sistem diterapkan.';
    if (btnLanjutText) btnLanjutText.textContent = 'Lihat Hasil Setelah Ada Sistem';
    if (btnReset) btnReset.style.display = 'none';
  }
}
