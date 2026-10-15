// Minimal HTTP server (chrome.sockets.tcpServer) – audio upload + screen frames + PCM.
(function (g) {
  var serverSocketId = null;
  var clients = {};
  var PORT = 8080;
  var onAudio = null;
  var onFrame = null;
  var onPcm = null;
  var onLog = function () {};

  function str2ab(s) {
    var buf = new ArrayBuffer(s.length);
    var v = new Uint8Array(buf);
    for (var i = 0; i < s.length; i++) v[i] = s.charCodeAt(i) & 0xff;
    return buf;
  }

  var PHONE_HTML = '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">' +
    '<title>Send to BT Speaker</title>' +
    '<style>*{box-sizing:border-box}body{margin:0;font:16px system-ui,sans-serif;background:#0f1115;color:#e8eaed;padding:20px}' +
    'h1{font-size:20px;margin:0 0 8px}.card{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:16px;margin:12px 0}' +
    'button,label.btn{display:block;width:100%;padding:14px;margin:8px 0;border:none;border-radius:10px;background:#2563eb;color:#fff;font:inherit;font-weight:600;text-align:center}' +
    'label.btn{background:#3f3f46}input[type=file]{display:none}#st{font-size:13px;color:#a1a1aa;min-height:1.4em;margin-top:8px}' +
    '.ok{color:#86efac}.err{color:#fca5a5}</style>' +
    '<h1>BT Speaker</h1><p style="color:#a1a1aa;font-size:14px">File / mic upload. For full screen mirror use the Android BT Speaker Share app.</p>' +
    '<div class=card><label class=btn>Choose audio file<input type=file id=f accept="audio/*,.mp3,.wav,.ogg,.m4a"></label>' +
    '<button id=send disabled>Send & play</button>' +
    '<button id=mic type=button style="background:#9a3412">Hold to talk (mic)</button><div id=st>Pick a file or use the mic.</div></div>' +
    '<script>(function(){var f=document.getElementById("f"),btn=document.getElementById("send"),st=document.getElementById("st"),mic=document.getElementById("mic");' +
    'var file=null,rec=null,chunks=[];function msg(t,c){st.className=c||"";st.textContent=t}' +
    'f.onchange=function(){file=f.files[0];btn.disabled=!file;msg(file?("Ready: "+file.name):"No file",file?"ok":"")};' +
    'btn.onclick=function(){if(!file)return;msg("Uploading\u2026");btn.disabled=true;var r=new FileReader();' +
    'r.onload=function(){var x=new XMLHttpRequest();x.open("POST","/play");x.setRequestHeader("Content-Type",file.type||"application/octet-stream");' +
    'x.onload=function(){msg(x.status===200?"Playing on speaker":("Error "+x.status),x.status===200?"ok":"err");btn.disabled=false};' +
    'x.onerror=function(){msg("Network error","err");btn.disabled=false};x.send(r.result)};r.readAsArrayBuffer(file)};' +
    'function startMic(){chunks=[];navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){' +
    'rec=new MediaRecorder(stream);rec.ondataavailable=function(e){if(e.data.size)chunks.push(e.data)};' +
    'rec.onstop=function(){stream.getTracks().forEach(function(t){t.stop()});var blob=new Blob(chunks,{type:rec.mimeType||"audio/webm"});msg("Sending mic clip\u2026");' +
    'var r=new FileReader();r.onload=function(){var x=new XMLHttpRequest();x.open("POST","/play");x.setRequestHeader("Content-Type",blob.type||"audio/webm");' +
    'x.onload=function(){msg(x.status===200?"Mic clip playing":("Error "+x.status),x.status===200?"ok":"err")};' +
    'x.onerror=function(){msg("Network error","err")};x.send(r.result)};r.readAsArrayBuffer(blob)};rec.start();msg("Recording\u2026 release to send","ok")' +
    '}).catch(function(e){msg("Mic denied: "+e.message,"err")})}' +
    'function stopMic(){if(rec&&rec.state!=="inactive")rec.stop();rec=null}' +
    'mic.addEventListener("touchstart",function(e){e.preventDefault();startMic()});mic.addEventListener("mousedown",function(e){e.preventDefault();startMic()});' +
    'mic.addEventListener("touchend",stopMic);mic.addEventListener("mouseup",stopMic);' +
    '})();</script>';

  function merge(parts) {
    var n = 0, i, o = 0;
    for (i = 0; i < parts.length; i++) n += parts[i].byteLength;
    var out = new Uint8Array(n);
    for (i = 0; i < parts.length; i++) { out.set(new Uint8Array(parts[i]), o); o += parts[i].byteLength; }
    return out;
  }
  function findHeaderEnd(u8) {
    for (var i = 0; i < u8.length - 3; i++)
      if (u8[i] === 13 && u8[i + 1] === 10 && u8[i + 2] === 13 && u8[i + 3] === 10) return i + 4;
    return -1;
  }
  function headerStr(u8, end) {
    var s = '';
    for (var i = 0; i < end; i++) s += String.fromCharCode(u8[i]);
    return s;
  }
  function respond(socketId, status, contentType, bodyAb) {
    var body = bodyAb || new ArrayBuffer(0);
    var h = 'HTTP/1.1 ' + status + '\r\n' +
      'Access-Control-Allow-Origin: *\r\n' +
      'Access-Control-Allow-Headers: Content-Type, X-Filename\r\n' +
      'Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n' +
      'Content-Type: ' + (contentType || 'text/plain') + '\r\n' +
      'Content-Length: ' + body.byteLength + '\r\n\r\n';
    var head = str2ab(h);
    var out = new Uint8Array(head.byteLength + body.byteLength);
    out.set(new Uint8Array(head), 0);
    out.set(new Uint8Array(body), head.byteLength);
    chrome.sockets.tcp.send(socketId, out.buffer, function () {
      chrome.sockets.tcp.close(socketId);
      delete clients[socketId];
    });
  }

  function processClient(socketId) {
    var c = clients[socketId];
    if (!c || !c.parts.length) return;
    var u8 = merge(c.parts);
    if (!c.headerDone) {
      var end = findHeaderEnd(u8);
      if (end < 0) return;
      var hs = headerStr(u8, end);
      c.headerDone = true;
      c.method = (hs.match(/^(\w+)/) || [])[1] || '';
      c.path = (hs.match(/^\w+\s+(\S+)/) || [])[1] || '/';
      c.contentLength = 0;
      var cl = hs.match(/Content-Length:\s*(\d+)/i);
      if (cl) c.contentLength = parseInt(cl[1], 10);
      c.contentType = 'application/octet-stream';
      var ct = hs.match(/Content-Type:\s*([^\r\n]+)/i);
      if (ct) c.contentType = ct[1].trim();
      c.parts = [u8.buffer.slice(end)];
      u8 = merge(c.parts);
    }

    if (c.method === 'OPTIONS') { respond(socketId, '204 No Content', 'text/plain', null); return; }
    if (c.method === 'GET') {
      respond(socketId, '200 OK', 'text/html; charset=utf-8', str2ab(PHONE_HTML));
      return;
    }
    if (c.method === 'POST') {
      if (u8.byteLength < c.contentLength) return;
      var payload = u8.buffer.slice(0, c.contentLength);
      if (c.path.indexOf('/frame') === 0) {
        if (onFrame) onFrame(payload);
        respond(socketId, '200 OK', 'text/plain', str2ab('OK'));
        return;
      }
      if (c.path.indexOf('/pcm') === 0) {
        if (onPcm) onPcm(payload);
        respond(socketId, '200 OK', 'text/plain', str2ab('OK'));
        return;
      }
      if (c.path.indexOf('/play') === 0) {
        if (onAudio) onAudio(payload, c.contentType);
        respond(socketId, '200 OK', 'text/plain', str2ab('OK'));
        return;
      }
    }
    respond(socketId, '404 Not Found', 'text/plain', str2ab('Not found'));
  }

  function onReceive(info) {
    var c = clients[info.socketId];
    if (!c) return;
    c.parts.push(info.data);
    try { processClient(info.socketId); } catch (e) { onLog('req error: ' + e.message); }
  }
  function onAccept(info) {
    if (info.socketId !== serverSocketId) return;
    clients[info.clientSocketId] = { parts: [], headerDone: false };
    chrome.sockets.tcp.setPaused(info.clientSocketId, false);
  }

  function start(cb) {
    if (serverSocketId !== null) { if (cb) cb(null, PORT); return; }
    chrome.sockets.tcpServer.create({}, function (ci) {
      serverSocketId = ci.socketId;
      chrome.sockets.tcpServer.listen(serverSocketId, '0.0.0.0', PORT, function (result) {
        if (result < 0) {
          onLog('Listen failed code ' + result);
          serverSocketId = null;
          if (cb) cb(new Error('listen failed'));
          return;
        }
        chrome.sockets.tcpServer.onAccept.addListener(onAccept);
        chrome.sockets.tcp.onReceive.addListener(onReceive);
        chrome.sockets.tcp.onReceiveError.addListener(function (info) {
          chrome.sockets.tcp.close(info.socketId);
          delete clients[info.socketId];
        });
        onLog('Listening on port ' + PORT);
        if (cb) cb(null, PORT);
      });
    });
  }
  function stop() {
    if (serverSocketId !== null) {
      try { chrome.sockets.tcpServer.close(serverSocketId); } catch (e) {}
      serverSocketId = null;
    }
    Object.keys(clients).forEach(function (id) {
      try { chrome.sockets.tcp.close(Number(id)); } catch (e) {}
    });
    clients = {};
  }

  g.SpeakerServer = {
    start: start,
    stop: stop,
    setOnAudio: function (fn) { onAudio = fn; },
    setOnFrame: function (fn) { onFrame = fn; },
    setOnPcm: function (fn) { onPcm = fn; },
    setOnLog: function (fn) { onLog = fn || function () {}; },
    port: PORT
  };
})(this);
