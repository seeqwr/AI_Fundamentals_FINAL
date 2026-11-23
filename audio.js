/* Local synthesized effects. No network requests, samples, or autoplay on page load. */
class QuietGridAudio {
    constructor() {
        this.enabled = true;
        this.volume = .35;
        try {
            const saved = JSON.parse(localStorage.getItem('quiet-grid-audio') || 'null');
            if (saved && typeof saved.enabled === 'boolean') this.enabled = saved.enabled;
            if (saved && Number.isFinite(saved.volume)) this.volume = Math.max(0, Math.min(1, saved.volume));
        } catch { /* Storage may be unavailable for a directly opened local file. */ }
        this.context = null;
        this.buffers = new Map();
        this.voices = new Set();
        this.onChange = () => {};
    }

    _save() {
        try { localStorage.setItem('quiet-grid-audio', JSON.stringify({enabled:this.enabled, volume:this.volume})); }
        catch { /* Preferences are optional; sound still works without storage. */ }
        this.onChange();
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
        this._gain();
        if (!this.enabled) this.stop();
        this._save();
    }

    setVolume(volume) {
        if (!Number.isFinite(Number(volume))) return;
        this.volume = Math.max(0, Math.min(1, Number(volume)));
        this._gain();
        this._save();
    }

    _gain() {
        if (!this.master || !this.context) return;
        this.master.gain.setTargetAtTime(this.enabled ? this.volume * .6 : 0, this.context.currentTime, .015);
    }

    // Call synchronously inside a click/key handler, before any server request.
    async unlock() {
        if (!this.enabled) return false;
        try {
            if (!this.context || this.context.state === 'closed') {
                const Context = window.AudioContext || window.webkitAudioContext;
                if (!Context) return false;
                this.context = new Context();
                this.buffers.clear();
                this.master = this.context.createGain();
                this.master.gain.value = this.volume * .6;
                const limiter = this.context.createDynamicsCompressor();
                limiter.threshold.value = -10;
                limiter.knee.value = 18;
                limiter.ratio.value = 8;
                limiter.attack.value = .003;
                limiter.release.value = .15;
                this.master.connect(limiter);
                limiter.connect(this.context.destination);
            }
            if (this.context.state !== 'running') await this.context.resume();
            return this.context.state === 'running';
        } catch { return false; }
    }

    play(name, {pan=0, gain=1} = {}) {
        if (!this.enabled || this.volume === 0 || this.context?.state !== 'running') return false;
        try {
            if (!this.buffers.has(name)) {
                const samples = QuietGridAudio.synthesize(name, this.context.sampleRate);
                const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
                buffer.copyToChannel(samples, 0);
                this.buffers.set(name, buffer);
            }
            if (this.voices.size >= 12) this.voices.values().next().value.stop();
            const source = this.context.createBufferSource();
            source.buffer = this.buffers.get(name);
            if(name==='step'){
                this.leftFoot=!this.leftFoot;
                source.playbackRate.value=this.leftFoot ? .94 : 1.04;
            }
            const level = this.context.createGain();
            level.gain.value = Math.max(0, Math.min(1, gain));
            const panner = this.context.createStereoPanner ? this.context.createStereoPanner() : null;
            source.connect(level);
            if (panner) {
                panner.pan.value = Math.max(-1, Math.min(1, pan));
                level.connect(panner);panner.connect(this.master);
            } else level.connect(this.master);
            source.onended = () => {
                this.voices.delete(source);
                source.disconnect();level.disconnect();panner?.disconnect();
            };
            this.voices.add(source);
            source.start();
            return true;
        } catch { return false; }
    }

    stop() {
        for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } }
        this.voices.clear();
    }

    static synthesize(name, rate=48000) {
        const durations = {step:.19, glass:.37, decoy:.76, key:.59, alert:.62, drone:.26,
            scan:.42,listen:.48,start:.44, victory:1.16, defeat:.84};
        const duration = durations[name];
        if (!duration) throw new RangeError('Unknown sound: ' + name);
        const samples = new Float32Array(Math.ceil(duration * rate));
        let seed = 123456789, lowNoise = 0;
        const tau = Math.PI * 2;
        const note = (t, start, length, frequency, amplitude=.2) => {
            const age = t-start;
            if (age<0 || age>=length) return 0;
            const envelope = Math.min(1, age/.012) * Math.pow(1-age/length, 1.8);
            return Math.sin(tau*frequency*age) * envelope * amplitude;
        };
        // A struck resonator with a decaying FM overtone. Delayed strikes form short metallic echoes.
        const strike=(age,hz,decay,metal=1)=>{
            if(age<0)return 0;
            const phase=tau*hz*age;
            return Math.sin(phase+metal*Math.exp(-age*24)*Math.sin(phase*1.47))*Math.exp(-age*decay);
        };
        let peak = 0;
        for (let i=0; i<samples.length; i++) {
            const t = i/rate;
            seed = (1664525*seed+1013904223) >>> 0;
            const noise = seed/2147483648-1;
            lowNoise = lowNoise*.85+noise*.15;
            let value = 0;
            if (name==='step') {
                value=.30*strike(t,68,28,.45)+.16*strike(t-.038,121,43,.9)+lowNoise*.43*Math.exp(-t*25);
            } else if (name==='glass') {
                value=.22*strike(t,154,19,2.6)+.13*strike(t-.018,681,18,2.8)
                    +.07*strike(t-.052,1217,15)+noise*.12*Math.exp(-t*48);
            } else if (name==='decoy') {
                value=note(t,0,.15,275,.12)+.26*strike(t-.14,739,11,4.1)
                    +.16*strike(t-.18,1193,10,2.2)+.07*strike(t-.33,739,9,2);
            } else if (name==='key') {
                value=.21*strike(t,554,8,.8)+.16*strike(t-.08,831,7,.55)+.08*strike(t-.18,1108,9,.35);
            } else if (name==='alert') {
                const beat=t<.19?t:t-.19;
                value=.26*Math.sin(tau*(290*beat+430*beat*beat))*Math.exp(-beat*10)
                    +.18*strike(t-.19,87,7,1.6);
            } else if (name==='drone') {
                value=.14*strike(t,94,18,2)+.075*strike(t-.074,132,19,2.7)
                    +lowNoise*.22*Math.exp(-t*14);
            } else if(name==='scan'){
                value=note(t,0,.16,493,.15)+note(t,.17,.21,370,.12)+.055*strike(t-.18,743,13,.6);
            } else if(name==='listen'){
                value=.14*strike(t,311,13,1.1)+note(t,.11,.24,467,.17)+note(t,.24,.18,622,.065);
            } else if (name==='start') {
                value=.17*strike(t,139,9,1.6)+note(t,.06,.28,277,.18)+.11*strike(t-.15,554,10,.4);
            } else if (name==='victory') {
                value=.19*strike(t,185,4,.7)+.16*strike(t-.13,277,4,.6)
                    +.14*strike(t-.30,415,4,.5)+.12*strike(t-.46,554,4,.3);
            } else if (name==='defeat') {
                value=(.30*Math.sin(tau*(156*t-61*t*t))+lowNoise*.14)*Math.exp(-4*t)
                    +.13*strike(t-.19,58,6,1.4);
            }
            // A short fade prevents discontinuities in both the noise and tonal effects.
            value *= Math.min(1,t/.003,(duration-t)/.015);
            samples[i] = value;peak = Math.max(peak,Math.abs(value));
        }
        const scale = peak>0 ? Math.min(2,.65/peak) : 1;
        for (let i=0;i<samples.length;i++) samples[i]*=scale;
        return samples;
    }
}
if (typeof window !== 'undefined') window.QuietGridAudio = QuietGridAudio;
