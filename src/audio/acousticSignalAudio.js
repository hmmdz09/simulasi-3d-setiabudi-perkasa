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
    this.hasWarned30s = false;
    this.hasWarned10s = false;

    this.initVoice();
  }

  init() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  initVoice() {
    if (!this.synth) return;
    const findVoice = () => {
      const voices = this.synth.getVoices();
      // Prioritize Indonesian voice (id-ID)
      this.voice = voices.find(v => v.lang.startsWith('id') || v.lang.includes('ID') || v.lang.includes('ind')) ||
                   voices.find(v => v.lang.startsWith('en')) ||
                   voices[0] || null;
    };
    findVoice();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = findVoice;
    }
  }

  speak(text) {
    if (!this.synth || this.isMuted) return;
    try {
      this.synth.cancel(); // Cancel any overlapping utterance
      const utter = new SpeechSynthesisUtterance(text);
      if (this.voice) utter.voice = this.voice;
      utter.lang = 'id-ID';
      utter.rate = 1.05;
      utter.pitch = 1.05;
      utter.volume = 1.0;
      this.synth.speak(utter);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }

  // Voice command for Tuna Netra: exact phrasing requested by user
  speakCrossingAccepted() {
    this.speak("Penyeberangan diterima, silakan menyeberang.");
  }

  // Voice guidance when green wave corridor coordination is in progress
  speakWaitGreenWave() {
    this.speak("Penyeberangan diterima. Mohon menunggu antrean kendaraan simpang melintas.");
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

      gain.gain.setValueAtTime(0.2, now);
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
      gain.gain.linearRampToValueAtTime(0.26, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.065);
    } catch (e) {
      console.warn('Audio playCrossingPulse error:', e);
    }
  }

  startCrossingAudio(getRemainingTimeFn, withVoice = true) {
    this.init();
    this.stopCrossingAudio(false);
    this.isPlaying = true;

    if (withVoice) {
      this.speakCrossingAccepted();
    }

    const tick = () => {
      if (!this.isPlaying) return;
      const remainingSec = getRemainingTimeFn ? getRemainingTimeFn() : 15;

      const isUrgent = remainingSec <= 4.0; // Rapid beeps in final 4 seconds
      this.playCrossingPulse(isUrgent);

      // Normal rhythm: 260ms interval; Urgent rhythm: 140ms
      const nextDelay = isUrgent ? 140 : 260;
      this.intervalId = setTimeout(tick, nextDelay);
    };

    // Small delay to let voice start clearly before continuous beeps
    setTimeout(() => {
      if (this.isPlaying) tick();
    }, withVoice ? 500 : 0);
  }

  stopCrossingAudio(playChime = true) {
    this.isPlaying = false;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    if (this.synth) {
      this.synth.cancel();
    }

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
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      } catch (e) {}
    }
  }
}
