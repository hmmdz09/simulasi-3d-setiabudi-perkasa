// Synthesized Acoustic Pedestrian Signal (APS) Audio System using Web Audio API
// AND Web Speech API for Spoken Voice Guidance (Suara Perintah Bahasa Indonesia)
export class AcousticSignalAudio {
  constructor() {
    this.audioCtx = null;
    this.isPlaying = false;
    this.intervalId = null;
    this.isMuted = false;

    // Web Speech API Voice Guidance
    this.synth = (typeof window !== 'undefined' && 'speechSynthesis' in window) ? window.speechSynthesis : null;
    this.voice = null;

    this.initVoice();

    // Auto-unlock AudioContext on first user interaction anywhere
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.init();
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('click', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
  }

  init() {
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if (this.synth && this.synth.paused) {
        this.synth.resume();
      }
    } catch (e) {
      console.warn('Audio init error:', e);
    }
  }

  initVoice() {
    if (!this.synth) return;
    const findVoice = () => {
      try {
        const voices = this.synth.getVoices();
        if (!voices || voices.length === 0) return;

        // Prioritize Indonesian voice (id-ID)
        const idVoice = voices.find(v => {
          const l = (v.lang || '').toLowerCase();
          const n = (v.name || '').toLowerCase();
          return l.includes('id') || l.includes('ind') || n.includes('indonesia');
        });

        if (idVoice) {
          this.voice = idVoice;
        } else {
          // Fallback to natural clear voice or default
          this.voice = voices.find(v => (v.lang || '').toLowerCase().startsWith('en')) || voices[0] || null;
        }
      } catch (e) {}
    };

    findVoice();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = findVoice;
    }
  }

  // Melodic attention chime (Ding-Dong / Transit Announcement Bell) using Web Audio API
  // Guaranteed audible on ALL devices/browsers regardless of OS voice pack
  playAnnouncementChime(onDone = null) {
    this.init();
    if (!this.audioCtx || this.isMuted) {
      if (onDone) setTimeout(onDone, 900);
      return;
    }

    try {
      const now = this.audioCtx.currentTime + 0.02;

      // 3-tone bright transit chime: Eb5 (622.25Hz) -> G5 (783.99Hz) -> Bb5 (932.33Hz)
      const notes = [
        { freq: 622.25, time: 0.00, dur: 0.22 },
        { freq: 783.99, time: 0.20, dur: 0.24 },
        { freq: 932.33, time: 0.42, dur: 0.55 }
      ];

      notes.forEach(note => {
        const osc = this.audioCtx.createOscillator();
        const oscHarmonic = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.time);

        // Soft harmonic overtone for chime richness
        oscHarmonic.type = 'triangle';
        oscHarmonic.frequency.setValueAtTime(note.freq * 2, now + note.time);

        gain.gain.setValueAtTime(0.0001, now + note.time);
        gain.gain.linearRampToValueAtTime(0.28, now + note.time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.time + note.dur);

        osc.connect(gain);
        oscHarmonic.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now + note.time);
        oscHarmonic.start(now + note.time);
        osc.stop(now + note.time + note.dur);
        oscHarmonic.stop(now + note.time + note.dur);
      });

      if (onDone) {
        setTimeout(onDone, 950);
      }
    } catch (e) {
      console.warn('Audio playAnnouncementChime error:', e);
      if (onDone) setTimeout(onDone, 950);
    }
  }

  speak(text, onComplete = null) {
    this.init();

    let isFinished = false;
    const finish = () => {
      if (isFinished) return;
      isFinished = true;
      if (onComplete) onComplete();
    };

    if (!this.synth || this.isMuted) {
      // If speech synthesis not supported, finish after safe delay
      setTimeout(finish, 1800);
      return;
    }

    try {
      this.synth.cancel(); // Cancel any overlapping speech
      if (this.synth.paused) {
        this.synth.resume();
      }

      const utter = new SpeechSynthesisUtterance(text);
      if (this.voice) {
        utter.voice = this.voice;
        // Only enforce Indonesian lang code if the voice actually supports Indonesian!
        // Forcing 'id-ID' on a non-Indonesian Windows TTS engine causes Windows to silently drop the utterance!
        const vLang = (this.voice.lang || '').toLowerCase();
        const vName = (this.voice.name || '').toLowerCase();
        if (vLang.includes('id') || vName.includes('indonesia')) {
          utter.lang = this.voice.lang || 'id-ID';
        }
      }

      utter.rate = 1.0;
      utter.pitch = 1.05;
      utter.volume = 1.0;

      utter.onend = () => {
        finish();
      };
      utter.onerror = () => {
        finish();
      };

      // Safety fallback timer: guarantee that callback fires even if TTS engine hangs or stays silent
      setTimeout(finish, 2600);

      this.synth.speak(utter);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
      finish();
    }
  }

  // Voice command for Tuna Netra:
  // Plays announcement chime + spoken guidance: "Penyeberangan diterima, silakan menyeberang."
  // Guarantees onComplete callback only after audio finishes!
  speakCrossingAccepted(onComplete = null) {
    this.init();

    // 1. Play transit announcement chime first
    this.playAnnouncementChime();

    // 2. Play vocal speech slightly layered after initial chime onset
    let completed = false;
    const handleComplete = () => {
      if (completed) return;
      completed = true;
      if (onComplete) onComplete();
    };

    // Speech synthesis triggers after first chime note (~250ms)
    setTimeout(() => {
      this.speak("Penyeberangan diterima, silakan menyeberang.", handleComplete);
    }, 280);

    // Guaranteed outer safety timeout (~2.8s)
    setTimeout(handleComplete, 2800);
  }

  // Voice guidance when green wave corridor coordination is in progress
  speakWaitGreenWave() {
    this.playAnnouncementChime();
    setTimeout(() => {
      this.speak("Penyeberangan diterima. Mohon menunggu antrean kendaraan simpang melintas.");
    }, 280);
  }

  stopVoice() {
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (e) {}
    }
  }

  // Tactile audio feedback when pelican button is pressed
  playButtonFeedback() {
    this.init();
    if (!this.audioCtx || this.isMuted) return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(550, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.09);

      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {
      console.warn('Audio playButtonFeedback error:', e);
    }
  }

  // Standard Accessible Pedestrian Signal (APS) Chirp / Pulse
  playCrossingPulse(isUrgent = false) {
    this.init();
    if (!this.audioCtx || this.isMuted) return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      // Sharp, distinct acoustic beep for visually impaired pedestrians
      osc.type = 'triangle';
      const baseFreq = isUrgent ? 1350 : 980;
      const endFreq = isUrgent ? 1500 : 1080;

      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.055);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.065);
    } catch (e) {
      console.warn('Audio playCrossingPulse error:', e);
    }
  }

  startCrossingAudio(getRemainingTimeFn, withVoice = false) {
    this.init();
    this.stopCrossingAudio(false);
    this.isPlaying = true;

    if (withVoice) {
      this.speakCrossingAccepted();
    }

    const tick = () => {
      if (!this.isPlaying) return;
      const remainingSec = getRemainingTimeFn ? getRemainingTimeFn() : 20;

      const isUrgent = remainingSec <= 3.5; // Rapid beeps in final 3.5 seconds
      this.playCrossingPulse(isUrgent);

      // Normal rhythm: 280ms interval; Urgent rhythm: 140ms
      const nextDelay = isUrgent ? 140 : 280;
      this.intervalId = setTimeout(tick, nextDelay);
    };

    // Begin acoustic beeps immediately
    tick();
  }

  stopCrossingAudio(playChime = true) {
    this.isPlaying = false;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    this.stopVoice();

    if (playChime && this.audioCtx && !this.isMuted) {
      try {
        const now = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        // Pleasant two-tone completion chime (C5 -> G4)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(392.00, now + 0.12);

        gain.gain.setValueAtTime(0.22, now);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      } catch (e) {}
    }
  }

  playHonk() {
    this.init();
    if (!this.audioCtx || this.isMuted) return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(420, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch(e) {}
  }
}

