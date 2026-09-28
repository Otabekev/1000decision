/*
 * 1000 Decisions — share card renderer.
 *
 * Draws a 1080x1920 (Instagram story) PNG with the native Canvas 2D API, so it
 * works offline and needs no third-party library. Everything important sits
 * inside the story "safe zone" (clear of the Instagram header and reply bar).
 */
(function (root) {
  'use strict';

  var W = 1080;
  var H = 1920;
  var PAD = 92;
  var INNER = W - PAD * 2;

  var PAPER = '#F4EFE6';
  var INK = '#16130F';
  var INK2 = '#4A443C';
  var INK3 = '#6E675D';
  var LINE = '#E3DCCF';
  var EMPTY_DOT = '#E4DDD1';

  var UI = 'Archivo, system-ui, -apple-system, sans-serif';
  var DISPLAY = '"Archivo Expanded", Archivo, system-ui, sans-serif';
  var SERIF = '"Instrument Serif", Georgia, serif';

  function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('900 100px "Archivo Expanded"'),
      document.fonts.load('700 100px "Archivo Expanded"'),
      document.fonts.load('700 30px Archivo'),
      document.fonts.load('500 30px Archivo'),
      document.fonts.load('italic 400 60px "Instrument Serif"')
    ]).catch(function () {});
  }

  function font(weight, size, family) {
    return weight + ' ' + size + 'px ' + family;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, h / 2, w / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Draw letter-spaced text (canvas letterSpacing is not universal yet). Returns drawn width. */
  function spaced(ctx, text, x, y, spacing, align) {
    var chars = Array.from(text);
    var widths = chars.map(function (c) { return ctx.measureText(c).width; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + spacing * (chars.length - 1);
    var cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    var prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    chars.forEach(function (c, i) {
      ctx.fillText(c, cx, y);
      cx += widths[i] + spacing;
    });
    ctx.textAlign = prevAlign;
    return total;
  }

  /** Largest font size (<= max) at which `text` fits in `maxWidth`. */
  function fitSize(ctx, text, weight, family, max, maxWidth, min) {
    var size = max;
    ctx.font = font(weight, size, family);
    var w = ctx.measureText(text).width;
    if (w > maxWidth) size = Math.max(min || 10, Math.floor(size * (maxWidth / w)));
    return size;
  }

  /** Word-wrap into at most `maxLines`, adding an ellipsis when truncated. */
  function wrap(ctx, text, maxWidth, maxLines) {
    var words = String(text).trim().split(/\s+/);
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
        continue;
      }
      if (line) lines.push(line);
      line = words[i];
      // A single word wider than the line: hard-break it.
      while (ctx.measureText(line).width > maxWidth && line.length > 1) {
        var cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
      if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    var truncated = lines.length > maxLines || words.join(' ').length > lines.join(' ').length;
    lines = lines.slice(0, maxLines);
    if (truncated && lines.length) {
      var last = lines[lines.length - 1];
      while (last.length && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      lines[lines.length - 1] = last.replace(/[\s,.;:!?-]+$/, '') + '…';
    }
    return lines;
  }

  /**
   * Geometry for the 1000-dot grid: blocks of 10x10 dots, 5 blocks per row.
   * Shared with the in-app SVG so both always look identical.
   */
  function dotGrid(goal, width, blockGap) {
    var perRow = 5;
    var blocks = Math.max(1, Math.ceil(goal / 100));
    var rows = Math.ceil(blocks / perRow);
    var cols = Math.min(perRow, blocks);
    var gap = blockGap;
    var block = (width - gap * (perRow - 1)) / perRow;
    var pitch = block / 10;
    return {
      blocks: blocks,
      rows: rows,
      cols: cols,
      block: block,
      pitch: pitch,
      gap: gap,
      height: rows * block + (rows - 1) * gap,
      position: function (i) {
        var b = Math.floor(i / 100);
        var k = i % 100;
        var bx = (b % perRow) * (block + gap);
        var by = Math.floor(b / perRow) * (block + gap);
        return { x: bx + (k % 10) * pitch, y: by + Math.floor(k / 10) * pitch };
      }
    };
  }

  function drawLogo(ctx, x, y, size) {
    roundRect(ctx, x, y, size, size, size * 0.28);
    ctx.fillStyle = INK;
    ctx.fill();
    var colors = ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#F5A524', '#FFFFFF', '#12883F', '#D92D20', 'rgba(255,255,255,0.28)'];
    var p = size * 0.2;
    var cell = (size - p * 2) / 3;
    colors.forEach(function (c, i) {
      ctx.beginPath();
      ctx.arc(x + p + cell * (i % 3) + cell / 2, y + p + cell * Math.floor(i / 3) + cell / 2, cell * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    });
  }

  function drawStatusIcon(ctx, status, cx, cy, s, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = s * 0.16;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (status === 'balanced') {
      ctx.moveTo(cx - s * 0.36, cy + s * 0.02);
      ctx.lineTo(cx - s * 0.1, cy + s * 0.28);
      ctx.lineTo(cx + s * 0.38, cy - s * 0.26);
    } else if (status === 'over') {
      ctx.moveTo(cx, cy + s * 0.36);
      ctx.lineTo(cx, cy - s * 0.32);
      ctx.moveTo(cx - s * 0.3, cy - s * 0.04);
      ctx.lineTo(cx, cy - s * 0.34);
      ctx.lineTo(cx + s * 0.3, cy - s * 0.04);
    } else if (status === 'neglected') {
      ctx.moveTo(cx, cy - s * 0.36);
      ctx.lineTo(cx, cy + s * 0.32);
      ctx.moveTo(cx - s * 0.3, cy + s * 0.04);
      ctx.lineTo(cx, cy + s * 0.34);
      ctx.lineTo(cx + s * 0.3, cy + s * 0.04);
    } else {
      ctx.moveTo(cx - s * 0.3, cy);
      ctx.lineTo(cx + s * 0.3, cy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawBar(ctx, b, x, y, w, h, maxTotal) {
    ctx.save();
    var r = Math.min(18, h / 2);
    var fillW = maxTotal > 0 ? (b.total / maxTotal) * w : 0;
    if (b.total > 0) fillW = Math.max(fillW, h);

    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = b.track;
    ctx.fill();

    var size = Math.round(h * 0.46);
    var nameFont = font(600, size, UI);
    var countFont = font(800, Math.round(size * 1.02), DISPLAY);
    var icon = h * 0.46;
    var textY = y + h / 2 + 1;

    function labels(color) {
      ctx.textBaseline = 'middle';
      ctx.beginPath();
      ctx.arc(x + h * 0.5, y + h / 2, h * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = nameFont;
      ctx.textAlign = 'left';
      var maxName = w - h * 0.86 - 190;
      var name = b.name;
      while (name.length > 1 && ctx.measureText(name).width > maxName) name = name.slice(0, -1);
      if (name !== b.name) name = name.trim() + '…';
      ctx.fillText(name, x + h * 0.86, textY);

      ctx.font = countFont;
      ctx.textAlign = 'right';
      ctx.fillText(fmt(b.total), x + w - h * 0.36 - icon - 12, textY);
      drawStatusIcon(ctx, b.status, x + w - h * 0.36 - icon / 2, y + h / 2, icon, color);
    }

    labels(INK);
    if (fillW > 0) {
      roundRect(ctx, x, y, fillW, h, r);
      ctx.clip();
      ctx.fillStyle = b.fill;
      ctx.fillRect(x, y, fillW, h);
      labels(b.onFill);
    }
    ctx.restore();
  }

  function fmt(n) {
    return n < 10000 ? String(n) : n.toLocaleString('en-US');
  }

  function pill(ctx, text, x, y, h, bg, fg, align, spacing) {
    ctx.save();
    ctx.textBaseline = 'middle';
    var padX = h * 0.36;
    var tw = spacing ? measureSpaced(ctx, text, spacing) : ctx.measureText(text).width;
    var w = tw + padX * 2;
    var px = align === 'right' ? x - w : x;
    roundRect(ctx, px, y, w, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    if (spacing) spaced(ctx, text, px + padX, y + h / 2 + 1, spacing, 'left');
    else {
      ctx.textAlign = 'left';
      ctx.fillText(text, px + padX, y + h / 2 + 1);
    }
    ctx.restore();
    return w;
  }

  function measureSpaced(ctx, text, spacing) {
    var chars = Array.from(text);
    return chars.reduce(function (a, c) { return a + ctx.measureText(c).width; }, 0) + spacing * (chars.length - 1);
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} m model — see app.js `cardModel()`
   */
  function render(canvas, m) {
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // Paper background with a soft light falloff.
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    var glow = ctx.createRadialGradient(W * 0.2, H * 0.1, 0, W * 0.2, H * 0.1, H * 0.85);
    glow.addColorStop(0, 'rgba(255,255,255,0.85)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // ── Brand row ──────────────────────────────────────────
    var y = 212;
    drawLogo(ctx, PAD, y - 33, 42);
    ctx.fillStyle = INK;
    ctx.font = font(800, 24, DISPLAY);
    spaced(ctx, '1000 DECISIONS', PAD + 58, y - 4, 3.2, 'left');
    ctx.fillStyle = INK3;
    ctx.font = font(600, 24, UI);
    spaced(ctx, m.dateLabel.toUpperCase(), W - PAD, y - 4, 3, 'right');

    // ── Day + total ───────────────────────────────────────
    y = 262;
    ctx.font = font(800, 38, DISPLAY);
    pill(ctx, m.day != null ? 'DAY ' + m.day : 'DAY 0', PAD, y, 70, INK, '#FFFFFF', 'left', 3.5);
    if (m.todayCount > 0) {
      ctx.font = font(700, 30, UI);
      pill(ctx, '+' + m.todayCount + ' today', W - PAD, y, 70, 'rgba(18,136,63,0.12)', '#0B6B30', 'right');
    }

    var totalText = fmt(m.total);
    var goalText = '/' + fmt(m.goal);
    var bigSize = 232;
    var goalSize = 88;
    ctx.font = font(900, bigSize, DISPLAY);
    var tW = ctx.measureText(totalText).width;
    ctx.font = font(700, goalSize, DISPLAY);
    var gW = ctx.measureText(goalText).width;
    if (tW + gW + 18 > INNER + 6) bigSize = Math.floor(bigSize * (INNER + 6 - gW - 18) / tW);
    y = 530;
    ctx.fillStyle = INK;
    ctx.font = font(900, bigSize, DISPLAY);
    ctx.fillText(totalText, PAD - 6, y);
    tW = ctx.measureText(totalText).width;
    ctx.fillStyle = '#A39B8F';
    ctx.font = font(700, goalSize, DISPLAY);
    ctx.fillText(goalText, PAD - 6 + tW + 14, y);

    ctx.fillStyle = INK3;
    ctx.font = font(600, 29, UI);
    var pct = m.goal ? Math.min(100, Math.floor((m.total / m.goal) * 100)) : 0;
    ctx.fillText('decisions made  ·  ' + pct + '% of the way', PAD, y + 54);

    // ── 1000-dot grid ─────────────────────────────────────
    y = 626;
    var shown = Math.min(m.goal, 1000);
    var grid = dotGrid(shown, INNER, 22);
    var dotR = grid.pitch * 0.34;
    for (var i = 0; i < shown; i++) {
      var p = grid.position(i);
      ctx.beginPath();
      ctx.arc(PAD + p.x + grid.pitch / 2, y + p.y + grid.pitch / 2, dotR, 0, Math.PI * 2);
      ctx.fillStyle = i < m.dots.length ? m.dots[i] : EMPTY_DOT;
      ctx.fill();
    }
    y += grid.height;

    // ── Balance bars ──────────────────────────────────────
    var bars = m.bars.slice(0, 6);
    var areaH = bars.length > 5 ? 330 : 300;
    var gapB = 11;
    var barH = bars.length ? Math.min(52, (areaH - gapB * (bars.length - 1)) / bars.length) : 0;
    var maxTotal = bars.reduce(function (a, b) { return Math.max(a, b.total); }, 0);

    y += 64;
    ctx.fillStyle = INK3;
    ctx.font = font(700, 23, UI);
    spaced(ctx, 'BALANCE · 7 DAYS', PAD, y, 3.2, 'left');

    var legend = [['#12883F', 'Balanced'], ['#F5A524', 'Over-invested'], ['#D92D20', 'Neglected']];
    ctx.font = font(600, 23, UI);
    var lw = legend.reduce(function (a, l) { return a + 16 + 8 + ctx.measureText(l[1]).width; }, 0) + 22 * (legend.length - 1);
    var lx = W - PAD - lw;
    ctx.textBaseline = 'middle';
    legend.forEach(function (l) {
      ctx.beginPath();
      ctx.arc(lx + 8, y - 8, 8, 0, Math.PI * 2);
      ctx.fillStyle = l[0];
      ctx.fill();
      ctx.fillStyle = INK2;
      ctx.fillText(l[1], lx + 24, y - 7);
      lx += 24 + ctx.measureText(l[1]).width + 22;
    });
    ctx.textBaseline = 'alphabetic';

    var by = y + 26;
    if (!bars.length) {
      ctx.fillStyle = INK3;
      ctx.font = font(500, 30, UI);
      ctx.fillText('No categories yet.', PAD, by + 40);
      by += 60;
    }
    bars.forEach(function (b) {
      drawBar(ctx, b, PAD, by, INNER, barH, maxTotal);
      by += barH + gapB;
    });
    if (m.bars.length > bars.length) {
      ctx.fillStyle = INK3;
      ctx.font = font(600, 22, UI);
      ctx.fillText('+' + (m.bars.length - bars.length) + ' more', PAD, by + 18);
    }

    // ── Standout decision ─────────────────────────────────
    y = Math.max(by + 58, 1400);
    ctx.fillStyle = INK3;
    ctx.font = font(700, 23, UI);
    spaced(ctx, 'TODAY’S STANDOUT', PAD, y, 3.2, 'left');

    var s = m.standout;
    if (s) {
      ctx.font = font(700, 25, UI);
      var chip = s.categoryName;
      while (chip.length > 1 && ctx.measureText(chip).width > 340) chip = chip.slice(0, -1);
      if (chip !== s.categoryName) chip = chip.trim() + '…';
      var cw = ctx.measureText(chip).width + 62;
      ctx.save();
      roundRect(ctx, W - PAD - cw, y - 32, cw, 44, 22);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(W - PAD - cw + 23, y - 10, 8, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.textBaseline = 'middle';
      ctx.fillText(chip, W - PAD - cw + 40, y - 9);
      ctx.restore();

      var hasResult = !!(s.result && s.result.trim());
      var quote = '“' + s.text.trim() + '”';
      var qSize = 64;
      var maxLines = hasResult ? 2 : 3;
      ctx.font = 'italic 400 ' + qSize + 'px ' + SERIF;
      var qLines = wrap(ctx, quote, INNER, maxLines);
      if (qLines.length === maxLines && qLines[maxLines - 1].slice(-1) === '…') {
        qSize = 56;
        ctx.font = 'italic 400 ' + qSize + 'px ' + SERIF;
        qLines = wrap(ctx, quote, INNER, maxLines);
      }
      var qy = y + 30 + qSize * 0.82;
      ctx.fillStyle = INK;
      qLines.forEach(function (line, i) {
        ctx.fillText(line, PAD - 4, qy + i * qSize * 1.02);
      });
      var ry = qy + (qLines.length - 1) * qSize * 1.02 + 60;
      if (hasResult) {
        ctx.font = font(500, 32, UI);
        var rLines = wrap(ctx, s.result.trim(), INNER - 52, 2);
        ctx.fillStyle = '#0B6B30';
        ctx.font = font(800, 32, UI);
        ctx.fillText('→', PAD, ry);
        ctx.fillStyle = INK2;
        ctx.font = font(500, 32, UI);
        rLines.forEach(function (line, i) {
          ctx.fillText(line, PAD + 50, ry + i * 42);
        });
      }
    } else {
      ctx.fillStyle = INK3;
      ctx.font = 'italic 400 58px ' + SERIF;
      ctx.fillText('Today’s decision is still being made.', PAD - 4, y + 88);
    }

    // ── Footer ────────────────────────────────────────────
    var fy = 1736;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = INK;
    ctx.font = font(700, 27, UI);
    if (m.signature) ctx.fillText(m.signature, PAD, fy);
    if (s && s.number) {
      ctx.fillStyle = INK3;
      ctx.font = font(600, 25, UI);
      ctx.textAlign = 'right';
      ctx.fillText('Decision #' + fmt(s.number), W - PAD, fy);
      ctx.textAlign = 'left';
    }
  }

  root.TDCard = {
    WIDTH: W,
    HEIGHT: H,
    render: render,
    ensureFonts: ensureFonts,
    dotGrid: dotGrid
  };
})(typeof self !== 'undefined' ? self : this);
