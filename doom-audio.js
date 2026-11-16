// WebAudio renderer for Doom SFX (DMX lumps) and music (MUS lumps, simple synth).
(function (root) {
  function parseMus(b) {
    if (b[0] !== 0x4d || b[1] !== 0x55 || b[2] !== 0x53) return null;
    let p = b[6] | (b[7] << 8); const ev = []; let t = 0, done = false;
    while (!done && p < b.length) {
      const d = b[p++], last = d & 0x80, type = (d >> 4) & 7, ch = d & 15;
      if (type === 0) ev.push({ t, k: 'off', ch, n: b[p++] & 127 });
      else if (type === 1) { const n = b[p++]; const o = { t, k: 'on', ch, n: n & 127 }; if (n & 128) o.v = b[p++] & 127; ev.push(o); }
      else if (type === 2) ev.push({ t, k: 'bend', ch, v: b[p++] });
      else if (type === 3) { p++; }
      else if (type === 4) { const c = b[p++], v = b[p++]; ev.push({ t, k: 'ctl', ch, c, v }); }
      else if (type === 6) done = true;
      if (last && !done) { let dl = 0, x; do { x = b[p++]; dl = (dl << 7) | (x & 127); } while (x & 128); t += dl; }
    }
    return { events: ev, duration: t / 140 };
  }
  function DoomAudio() {
    let ctx = null, master, sfxBus, musBus, noise;
    const chans = [], bufs = {}, songs = [];
    let cur = -1, want = null, timer = null, idx = 0, base = 0, loop = false, playing = false, musVol = 100, paused = false;
    const prog = new Array(16).fill(0), cvol = new Array(16).fill(100), active = {};
    const self = { songs, parseMus, stats: { sfx: 0, music: 0 } };

    self.unlock = function () {
      try {
        if (!ctx) {
          const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
          ctx = new AC(); master = ctx.createGain(); master.gain.value = self.muted ? 0 : 0.8; master.connect(ctx.destination);
          sfxBus = ctx.createGain(); sfxBus.connect(master); musBus = ctx.createGain(); musBus.connect(master); self.setMusVol(musVol);
          noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        if (ctx.state === 'suspended') ctx.resume();
        if (want !== null && !playing) self.musicPlay(want.h, want.l);
      } catch (e) {}
    };
    self.muted=false;
    self.mute = function (m) { self.muted = !!m; if (master) master.gain.value = m ? 0 : 0.8; };
    self.setMusVol = function (v) { musVol = v; if (musBus) musBus.gain.value = paused ? 0 : (v / 127) * 0.3; };

    // ---- SFX ----
    self.sfxStart = function (ch, id, bytes, vol, sep) {
      self.stats.sfx++; if (!ctx || ctx.state !== 'running') return;
      let buf = bufs[id];
      if (!buf) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const rate = dv.getUint16(2, true); let n = dv.getUint32(4, true); n = Math.min(n, bytes.length - 8);
        const s0 = 8 + 16, cnt = n - 32; if (cnt <= 0) return;
        buf = ctx.createBuffer(1, cnt, rate || 11025); const f = buf.getChannelData(0);
        for (let i = 0; i < cnt; i++) f[i] = (bytes[s0 + i] - 128) / 128; bufs[id] = buf;
      }
      self.sfxStop(ch);
      const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      g.gain.value = vol / 127; if (pan) pan.pan.value = Math.max(-1, Math.min(1, (sep - 127) / 127));
      src.connect(g); if (pan) { g.connect(pan); pan.connect(sfxBus); } else g.connect(sfxBus);
      const c = { src, g, pan, on: true }; src.onended = () => { c.on = false; }; chans[ch] = c; src.start();
    };
    self.sfxParams = function (ch, vol, sep) { const c = chans[ch]; if (c && c.on) { c.g.gain.value = vol / 127; if (c.pan) c.pan.pan.value = Math.max(-1, Math.min(1, (sep - 127) / 127)); } };
    self.sfxStop = function (ch) { const c = chans[ch]; if (c && c.on) { try { c.src.stop(); } catch (e) {} c.on = false; } };
    self.sfxPlaying = function (ch) { const c = chans[ch]; return c && c.on ? 1 : 0; };

    // ---- Music ----
    function hz(n) { return 440 * Math.pow(2, (n - 69) / 12); }
    function wave(p) { return p < 8 ? 'triangle' : p < 16 ? 'sine' : p < 24 ? 'square' : p < 40 ? 'sawtooth' : p < 56 ? 'sawtooth' : p < 80 ? 'square' : p < 88 ? 'sawtooth' : 'triangle'; }
    function plucked(p) { return p < 16 || (p >= 24 && p < 40) || (p >= 104 && p < 120); }
    function noiseHit(t, dur, hp, vol) {
      const s = ctx.createBufferSource(); s.buffer = noise; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(musBus); s.start(t); s.stop(t + dur + 0.02);
    }
    function tone(t, f0, f1, dur, vol) {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(musBus); o.start(t); o.stop(t + dur + 0.02);
    }
    function drum(t, n, v) {
      const vol = v / 127;
      if (n === 35 || n === 36) tone(t, 140, 40, 0.18, 1.0 * vol);
      else if (n === 38 || n === 40) { noiseHit(t, 0.14, 1500, 0.6 * vol); tone(t, 220, 120, 0.08, 0.3 * vol); }
      else if (n === 42 || n === 44) noiseHit(t, 0.04, 7000, 0.35 * vol);
      else if (n === 46) noiseHit(t, 0.2, 7000, 0.3 * vol);
      else if (n === 49 || n === 57) noiseHit(t, 0.6, 4000, 0.4 * vol);
      else if (n >= 41 && n <= 50) tone(t, 60 + (n - 41) * 14, 40, 0.2, 0.7 * vol);
      else noiseHit(t, 0.08, 3000, 0.3 * vol);
    }
    function noteOn(t, ch, n, v) {
      if (ch === 15) return drum(t, n, v);
      const key = ch * 128 + n; if (active[key]) noteOff(t, ch, n);
      if (Object.keys(active).length > 40) return;
      const p = prog[ch], o = ctx.createOscillator(); o.type = wave(p); o.frequency.value = hz(n);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p >= 24 && p < 32 ? 2200 : 4500;
      const g = ctx.createGain(), peak = (v / 127) * (cvol[ch] / 127) * 0.35, slow = p >= 40 && p < 56 || p >= 88 && p < 104;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + (slow ? 0.08 : 0.01));
      if (plucked(p)) g.gain.exponentialRampToValueAtTime(Math.max(peak * 0.35, 0.001), t + 0.5);
      o.connect(f); f.connect(g); g.connect(musBus); o.start(t); active[key] = { o, g, peak };
    }
    function noteOff(t, ch, n) {
      const key = ch * 128 + n, v = active[key]; if (!v) return; delete active[key];
      v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0.0001, t, 0.04); try { v.o.stop(t + 0.3); } catch (e) {}
    }
    function silence() { Object.keys(active).forEach(k => { const v = active[k]; try { v.o.stop(); } catch (e) {} }); for (const k in active) delete active[k]; }
    function pump() {
      const s = songs[cur]; if (!ctx || !s || !playing) return;
      const now = ctx.currentTime;
      while (true) {
        if (idx >= s.events.length) {
          if (loop) { base += s.duration; idx = 0; for (let i = 0; i < 16; i++) { prog[i] = 0; cvol[i] = 100; } continue; }
          if (now > base + s.duration + 0.5) { playing = false; clearInterval(timer); timer = null; }
          break;
        }
        const e = s.events[idx], t = base + e.t / 140; if (t > now + 0.3) break;
        const tt = Math.max(t, now);
        if (e.k === 'on') noteOn(tt, e.ch, e.n, e.v !== undefined ? (self._lv[e.ch] = e.v) : (self._lv[e.ch] || 100));
        else if (e.k === 'off') noteOff(tt, e.ch, e.n);
        else if (e.k === 'ctl') { if (e.c === 0) prog[e.ch] = e.v; else if (e.c === 3) cvol[e.ch] = e.v; }
        idx++;
      }
    }
    self._lv = new Array(16).fill(100);
    self.musicRegister = function (bytes) { const s = parseMus(bytes); songs.push(s || { events: [], duration: 0 }); return songs.length - 1; };
    self.musicPlay = function (h, l) {
      self.stats.music++; want = { h, l }; self.musicStop(true); cur = h; loop = !!l; idx = 0;
      if (!ctx || ctx.state !== 'running') return; playing = true; base = ctx.currentTime + 0.15;
      for (let i = 0; i < 16; i++) { prog[i] = 0; cvol[i] = 100; } timer = setInterval(pump, 40); pump();
    };
    self.musicStop = function (keepWant) { if (!keepWant) want = null; playing = false; if (timer) { clearInterval(timer); timer = null; } if (ctx) silence(); };
    self.musicPause = function (p) { paused = !!p; self.setMusVol(musVol); };
    self.musicPlaying = function () { return playing ? 1 : 0; };
    return self;
  }
  root.DoomAudio = DoomAudio;
  if (typeof module !== 'undefined') module.exports = DoomAudio;
})(typeof window !== 'undefined' ? window : globalThis);
