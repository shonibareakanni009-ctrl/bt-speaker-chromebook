(function () {
  var $ = function (id) { return document.getElementById(id); };
  var power = false;
  var player = $('player');
  var audioCtx = null;
  var micStream = null;
  var micAnalyser = null;
  var playAnalyser = null;
  var raf = 0;
  var objectUrl = null;
  var serverOn = false;
  var localIps = [];
  var nextPcmTime = 0;
  var frameCount = 0;

  function log(m) { $('log').textContent = m; }
  function setStatus(text, cls) {
    var s = $('status');
    s.textContent = text;
    s.className = 'pill ' + (cls || 'off');
  }
  function setLed(on) { $('led').className = 'led' + (on ? ' on' : ''); }
  function pulse(on) { $('cone').className = 'cone' + (on ? ' pulse' : ''); }

  function ensureAudioCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function draw() {
    var canvas = $('viz');
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, 0, w, h);
    var analyser = micAnalyser || playAnalyser;
    if (!analyser || !power) {
      ctx.fillStyle = '#27272a';
      for (var i = 0; i < 16; i++) {
        ctx.fillRect(8 + i * 17, h / 2 - 2, 12, 4);
      }
      raf = requestAnimationFrame(draw);
      return;
    }
    var bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);
    for (var j = 0; j < 16; j++) {
      var v = bins[Math.floor(j * bins.length / 16)] / 255;
      var bh2 = Math.max(3, v * (h - 8));
      ctx.fillStyle = micAnalyser ? '#fb923c' : '#60a5fa';
      ctx.fillRect(8 + j * 17, h - bh2 - 4, 12, bh2);
    }
    pulse(bins[4] > 40);
    raf = requestAnimationFrame(draw);
  }

  function setPower(on) {
    power = on;
    $('btnPower').textContent = on ? 'Power Off' : 'Power On';
    $('btnPower').className = on ? 'danger' : 'primary';
    $('btnServer').disabled = !on;
    setLed(on);
    if (on) {
      setStatus('On', 'on');
      ensureAudioCtx();
      log('Speaker on');
    } else {
      stopPlayback();
      stopMic();
      stopServer();
      $('mirrorPanel').style.display = 'none';
      setStatus('Off', 'off');
      log('Speaker off');
    }
  }

  function playBlob(blob, label) {
    if (!power) setPower(true);
    stopPlayback(true);
    ensureAudioCtx();
    objectUrl = URL.createObjectURL(blob);
    player.src = objectUrl;
    player.volume = parseFloat($('vol').value);
    player.onplay = function () {
      setStatus('Playing', 'play');
      try {
        var src = audioCtx.createMediaElementSource(player);
        playAnalyser = audioCtx.createAnalyser();
        playAnalyser.fftSize = 64;
        src.connect(playAnalyser);
        playAnalyser.connect(audioCtx.destination);
      } catch (e) {}
      $('btnStop').disabled = false;
      log('Playing ' + (label || 'audio'));
    };
    player.onended = function () {
      setStatus('On', 'on');
      pulse(false);
      $('btnStop').disabled = true;
    };
    player.onerror = function () {
      log('Playback error (unsupported format?)');
      setStatus('On', 'on');
    };
    player.play().catch(function (e) { log('Play failed: ' + e.message); });
  }

  function stopPlayback(keepPower) {
    try { player.pause(); } catch (e) {}
    player.removeAttribute('src');
    player.load();
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    playAnalyser = null;
    $('btnStop').disabled = true;
    if (power && !keepPower) setStatus('On', 'on');
    pulse(false);
  }

  function startMic() {
    if (!power) setPower(true);
    ensureAudioCtx();
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      micStream = stream;
      var src = audioCtx.createMediaStreamSource(stream);
      micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 64;
      src.connect(micAnalyser);
      setStatus('Mic', 'mic');
      $('btnMic').textContent = 'Mic: On';
      log('Microphone meter on');
    }).catch(function (e) { log('Mic error: ' + e.message); });
  }
  function stopMic() {
    if (micStream) {
      micStream.getTracks().forEach(function (t) { t.stop(); });
      micStream = null;
    }
    micAnalyser = null;
    $('btnMic').textContent = 'Mic: Off';
    if (power && player.paused) setStatus('On', 'on');
  }

  function playPcmChunk(ab) {
    try {
      var ctx = ensureAudioCtx();
      var view = new DataView(ab);
      var samples = ab.byteLength / 2;
      if (samples < 1) return;
      var buffer = ctx.createBuffer(1, samples, 16000);
      var ch = buffer.getChannelData(0);
      for (var i = 0; i < samples; i++) {
        ch[i] = view.getInt16(i * 2, true) / 32768;
      }
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      var gain = ctx.createGain();
      gain.gain.value = parseFloat($('vol').value);
      src.connect(gain);
      gain.connect(ctx.destination);
      var t = Math.max(ctx.currentTime + 0.02, nextPcmTime);
      src.start(t);
      nextPcmTime = t + buffer.duration;
      setStatus('Mirror', 'play');
    } catch (e) {}
  }

  function showFrame(ab) {
    var blob = new Blob([ab], { type: 'image/jpeg' });
    var url = URL.createObjectURL(blob);
    var img = $('mirror');
    var old = img.getAttribute('data-url');
    img.onload = function () {
      if (old) URL.revokeObjectURL(old);
    };
    img.src = url;
    img.setAttribute('data-url', url);
    $('mirrorPanel').style.display = 'block';
    frameCount++;
    if (frameCount % 10 === 1) {
      $('mirrorMeta').textContent = 'Live \u00b7 frame ' + frameCount + ' \u00b7 ' + Math.round(ab.byteLength / 1024) + ' KB';
    }
    setStatus('Mirror', 'play');
  }

  function refreshIps(cb) {
    localIps = [];
    if (!chrome.system || !chrome.system.network) { if (cb) cb(); return; }
    chrome.system.network.getNetworkInterfaces(function (ifaces) {
      (ifaces || []).forEach(function (iface) {
        if (!iface.address) return;
        if (iface.address.indexOf(':') >= 0) return;
        if (iface.address.indexOf('127.') === 0) return;
        localIps.push(iface.address);
      });
      if (cb) cb();
    });
  }

  function updateNetUi() {
    if (!serverOn) {
      $('netInfo').textContent = power ? 'Power on. Start Wi-Fi receiver, then use the Android share app or open the link on the phone.' : 'Turn power on to start the receiver.';
      $('phoneHint').textContent = '';
      $('btnCopy').disabled = true;
      return;
    }
    var port = SpeakerServer.port;
    var links = localIps.map(function (ip) { return 'http://' + ip + ':' + port + '/'; });
    $('netInfo').textContent = links.length ? 'Receiver running. Use this on the phone app:' : 'Receiver running, but no LAN IP found.';
    $('phoneHint').textContent = links.join('\n') || '';
    $('btnCopy').disabled = !links.length;
  }

  function startServer() {
    if (!power) return;
    refreshIps(function () {
      SpeakerServer.setOnLog(log);
      SpeakerServer.setOnAudio(function (ab, mime) {
        playBlob(new Blob([ab], { type: mime || 'audio/mpeg' }), 'from phone');
      });
      SpeakerServer.setOnFrame(function (ab) { showFrame(ab); });
      SpeakerServer.setOnPcm(function (ab) { playPcmChunk(ab); });
      SpeakerServer.start(function (err) {
        if (err) {
          log('Could not start Wi-Fi server');
          serverOn = false;
        } else {
          serverOn = true;
          $('btnServer').textContent = 'Stop Wi-Fi receiver';
          log('Wi-Fi receiver ready (files + screen + PCM)');
        }
        updateNetUi();
      });
    });
  }
  function stopServer() {
    SpeakerServer.stop();
    serverOn = false;
    $('btnServer').textContent = 'Start Wi-Fi receiver';
    updateNetUi();
  }

  $('btnPower').onclick = function () { setPower(!power); updateNetUi(); };
  $('btnMic').onclick = function () { if (micStream) stopMic(); else startMic(); };
  $('btnPick').onclick = function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.wav,.ogg,.m4a';
    input.onchange = function () {
      if (input.files && input.files[0]) playBlob(input.files[0], input.files[0].name);
    };
    input.click();
  };
  $('btnStop').onclick = function () { stopPlayback(); };
  $('vol').oninput = function () {
    player.volume = parseFloat(this.value);
    $('volPct').textContent = Math.round(this.value * 100) + '%';
  };
  $('btnServer').onclick = function () {
    if (serverOn) stopServer(); else startServer();
  };
  $('btnCopy').onclick = function () {
    var t = $('phoneHint').textContent.split('\n')[0];
    if (!t) return;
    var ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); log('Copied ' + t); }
    catch (e) { log('Copy failed'); }
    document.body.removeChild(ta);
  };

  setPower(false);
  updateNetUi();
  draw();
  log('Ready');
})();
