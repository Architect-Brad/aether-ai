/**
 * AETHER Cognition Theater — secondary signals on the neural wave
 */
(function (g) {
  'use strict';

  var _reasonAmp = 0;
  var _toolGlyphs = [];
  // Off by default — opt-in via Beast / theater toggle (avoids permanent rAF cost)
  var _enabled = false;
  var _hooked = false;

  function setReasoning(level) {
    // 0..1
    _reasonAmp = Math.max(0, Math.min(1, level));
  }

  function pulseReasoning() {
    _reasonAmp = 1;
    var decay = setInterval(function () {
      _reasonAmp *= 0.92;
      if (_reasonAmp < 0.05) {
        _reasonAmp = 0;
        clearInterval(decay);
      }
    }, 50);
  }

  function toolPulse(name, ok) {
    _toolGlyphs.push({
      name: String(name || 'tool').slice(0, 12),
      ok: ok !== false,
      t: Date.now(),
      ang: Math.random() * Math.PI * 2,
      r: 0.35 + Math.random() * 0.25,
    });
    if (_toolGlyphs.length > 12) _toolGlyphs.shift();
  }

  function answerPulse() {
    // brief white flash amp via CSS class on pane
    var pane = document.getElementById('aether-pane');
    if (!pane) return;
    pane.classList.add('theater-answer');
    setTimeout(function () {
      pane.classList.remove('theater-answer');
    }, 400);
  }

  function drawOverlay(ctx, w, h, t) {
    if (!_enabled || !ctx) return;

    // Reasoning channel — purple secondary sine
    if (_reasonAmp > 0.02) {
      ctx.save();
      ctx.globalAlpha = 0.35 * _reasonAmp;
      ctx.strokeStyle = '#9b59b6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var x = 0; x < w; x += 3) {
        var y =
          h * 0.5 +
          Math.sin(x * 0.04 + t * 0.008) * (12 * _reasonAmp) +
          Math.sin(x * 0.11 + t * 0.02) * (6 * _reasonAmp);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Tool glyphs orbit
    var cx = w * 0.5;
    var cy = h * 0.5;
    var now = Date.now();
    _toolGlyphs = _toolGlyphs.filter(function (gyl) {
      return now - gyl.t < 4000;
    });
    _toolGlyphs.forEach(function (gyl, i) {
      var age = (now - gyl.t) / 4000;
      var ang = gyl.ang + t * 0.002 + i * 0.4;
      var rad = Math.min(w, h) * gyl.r * (0.8 + age * 0.3);
      var x = cx + Math.cos(ang) * rad;
      var y = cy + Math.sin(ang) * rad * 0.45;
      ctx.save();
      ctx.globalAlpha = 0.85 * (1 - age);
      ctx.fillStyle = gyl.ok ? '#00ff88' : '#ff4466';
      ctx.font = '10px monospace';
      ctx.fillText('◈ ' + gyl.name, x, y);
      ctx.restore();
    });
  }

  /**
   * Try to hook into existing wave animation by patching after load.
   * If wave uses canvas id aether-wave, we layer a second canvas.
   */
  function ensureLayer() {
    var pane = document.getElementById('aether-pane');
    var base = document.getElementById('aether-wave');
    if (!pane || !base) return null;
    var layer = document.getElementById('aether-theater-layer');
    if (layer) return layer;
    layer = document.createElement('canvas');
    layer.id = 'aether-theater-layer';
    layer.className = 'aether-theater-layer';
    layer.width = base.width || 800;
    layer.height = base.height || 120;
    pane.appendChild(layer);
    return layer;
  }

  function loop() {
    if (!_enabled) {
      // Park the rAF loop while theater is off — saves main-thread work on mobile
      setTimeout(function () {
        requestAnimationFrame(loop);
      }, 500);
      return;
    }
    var layer = ensureLayer();
    var base = document.getElementById('aether-wave');
    if (layer && base) {
      if (layer.width !== base.clientWidth || layer.height !== base.clientHeight) {
        layer.width = base.clientWidth || 800;
        layer.height = base.clientHeight || 120;
      }
      var ctx = layer.getContext('2d');
      ctx.clearRect(0, 0, layer.width, layer.height);
      drawOverlay(ctx, layer.width, layer.height, performance.now ? performance.now() : Date.now());
    }
    requestAnimationFrame(loop);
  }

  function setEnabled(on) {
    _enabled = !!on;
    document.documentElement.classList.toggle('cognition-theater', _enabled);
  }

  function init() {
    if (_hooked) return;
    _hooked = true;
    // Beast mode → theater on
    if (g.AETHER_Beast && g.AETHER_Beast.isEnabled && g.AETHER_Beast.isEnabled()) setEnabled(true);
    setTimeout(function () {
      ensureLayer();
      requestAnimationFrame(loop);
    }, 1000);
  }

  g.AETHER_Theater = {
    setReasoning: setReasoning,
    pulseReasoning: pulseReasoning,
    toolPulse: toolPulse,
    answerPulse: answerPulse,
    setEnabled: setEnabled,
    drawOverlay: drawOverlay,
    init: init,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : window);
