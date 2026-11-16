// Doom (doomgeneric -> wasm32-wasi) runtime. Works in browser and Node.
(function (root) {
  const KEYS = { Enter: 13, Escape: 27, ArrowLeft: 0xac, ArrowRight: 0xae, ArrowUp: 0xad, ArrowDown: 0xaf,
    ControlLeft: 0xa3, ControlRight: 0xa3, Space: 0xa2, ShiftLeft: 0xb6, ShiftRight: 0xb6, AltLeft: 0xb8, AltRight: 0xb8,
    Tab: 9, Backspace: 0x7f, F1: 0xbb, F2: 0xbc, F3: 0xbd, F4: 0xbe, F5: 0xbf, F6: 0xc0, F7: 0xc1, F8: 0xc2, F9: 0xc3, F10: 0xc4, F11: 0xd7, F12: 0xd8,
    Equal: 0x3d, Minus: 0x2d, KeyY: 121, KeyN: 110 };
  function mapKey(e) {
    if (KEYS[e.code] !== undefined) return KEYS[e.code];
    if (/^Key[A-Z]$/.test(e.code)) return e.code.charCodeAt(3) + 32;
    if (/^Digit[0-9]$/.test(e.code)) return e.code.charCodeAt(5);
    return 0;
  }
  async function createDoom(wasmBytes, wadBytes) {
    let mem, ex;
    const dv = () => new DataView(mem.buffer);
    const wasi = {
      fd_close: () => 0, fd_fdstat_get: () => 8, fd_fdstat_set_flags: () => 0, fd_prestat_get: () => 8, fd_prestat_dir_name: () => 28,
      fd_read: () => 8, fd_seek: () => 70, path_open: () => 44, path_create_directory: () => 63, path_remove_directory: () => 63,
      path_rename: () => 63, path_unlink_file: () => 63, proc_exit: (c) => { throw new Error('doom exit ' + c); },
      clock_time_get: (id, prec, out) => { dv().setBigUint64(out, BigInt(Math.floor(performance.now() * 1e6)), true); return 0; },
      fd_write: (fd, iovs, n, nw) => {
        let total = 0, s = '';
        for (let i = 0; i < n; i++) { const p = dv().getUint32(iovs + i * 8, true), l = dv().getUint32(iovs + i * 8 + 4, true);
          s += new TextDecoder().decode(new Uint8Array(mem.buffer, p, l)); total += l; }
        if (s.trim() && root.DOOM_LOG) root.DOOM_LOG(s); dv().setUint32(nw, total, true); return 0;
      }
    };
    const au = root.DoomAudio ? root.DoomAudio() : null;
    const B = (p, l) => new Uint8Array(mem.buffer, p, l);
    const env = {
      js_sfx_start: (ch, id, p, l, v, sep) => { au && au.sfxStart(ch, id, B(p, l).slice(), v, sep); return 0; },
      js_sfx_params: (ch, v, sep) => { au && au.sfxParams(ch, v, sep); },
      js_sfx_stop: (ch) => { au && au.sfxStop(ch); },
      js_sfx_playing: (ch) => (au ? au.sfxPlaying(ch) : 0),
      js_music_register: (p, l) => (au ? au.musicRegister(B(p, l).slice()) : 0),
      js_music_play: (h, lp) => { au && au.musicPlay(h, lp); },
      js_music_stop: () => { au && au.musicStop(); },
      js_music_volume: (v) => { au && au.setMusVol(v); },
      js_music_pause: (p) => { au && au.musicPause(p); },
      js_music_playing: () => (au ? au.musicPlaying() : 0)
    };
    const { instance } = await WebAssembly.instantiate(wasmBytes, { wasi_snapshot_preview1: wasi, env });
    ex = instance.exports; mem = ex.memory; ex._initialize();
    const p = ex.dg_wad_alloc(wadBytes.byteLength);
    new Uint8Array(mem.buffer, p, wadBytes.byteLength).set(new Uint8Array(wadBytes));
    ex.dg_start();
    const W = ex.dg_w(), H = ex.dg_h();
    const T = ['episode','map','leveltime','health','armor','weapon','kills','totalkills','items','totalitems','secrets','totalsecrets',
      'ammoBullets','ammoShells','ammoCells','ammoRockets','x','y','angle','gamestate','damage','cheats','skill','z','demo'];
    return {
      width: W, height: H, exports: ex, audio: au, unlockAudio() { au && au.unlock(); },
      tick() { ex.dg_tick(); },
      key(pressed, code) { ex.dg_key(pressed ? 1 : 0, code); },
      mapKey,
      frameRGBA(imageData) {
        const src = new Uint32Array(mem.buffer, ex.dg_screen(), W * H), dst = new Uint32Array(imageData.data.buffer);
        for (let i = 0; i < src.length; i++) { const c = src[i]; dst[i] = 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff); }
        return imageData;
      },
      telemetry() { const a = new Float64Array(mem.buffer, ex.dg_telemetry(), 25), o = {}; T.forEach((k, i) => (o[k] = a[i])); return o; }
    };
  }
  root.DoomRuntime = { createDoom, mapKey };
  if (typeof module !== 'undefined') module.exports = root.DoomRuntime;
})(typeof window !== 'undefined' ? window : globalThis);
