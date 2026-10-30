// First screen of studio.html: the showroom photo gains depth. As the mouse moves over the first screen, the
// machine, the bench and the floor shift a few pixels against the back wall, as if the visitor looked into the room
// through a window. A depth map drawn from the photo (media3/showroom-depth.png, white = near) sets how far each
// pixel moves. Phones, touch screens and visitors who ask for reduced motion keep the still photo.
(function(){
  var fig = document.querySelector(".hero-photo"), img = fig && fig.querySelector("img");
  if (!img || !window.createImageBitmap) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  var canvas = document.createElement("canvas");
  var gl = canvas.getContext("webgl", {alpha: false, antialias: false});
  if (!gl) return;
  canvas.className = "hero-depth";
  canvas.setAttribute("aria-hidden", "true");

  var AX = 0.03, AY = 0.016, MID = 0.35;   // how far the nearest and farthest pixels move; depth that stays still

  function shader(type, src){ var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  var prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER,
    "attribute vec2 p; varying vec2 v;" +
    "void main(){ v = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }"));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER,
    "precision mediump float; uniform sampler2D photo, depth; uniform vec2 shift; uniform float zoom; varying vec2 v;" +
    "void main(){ vec2 u = 0.5 + (v - 0.5) / zoom; float d = texture2D(depth, u).r;" +
    " gl_FragColor = texture2D(photo, u + shift * (d - " + MID.toFixed(2) + ")); }"));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var uShift = gl.getUniformLocation(prog, "shift"), uZoom = gl.getUniformLocation(prog, "zoom");
  gl.uniform1i(gl.getUniformLocation(prog, "photo"), 0);
  gl.uniform1i(gl.getUniformLocation(prog, "depth"), 1);

  function texture(unit, source){
    var t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(function(k){ gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE); });
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(function(k){ gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR); });
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    return t;
  }

  // the photo is uploaded at the canvas's own pixel size, so it stays sharp without mipmaps
  var photoTex = null, size = [0, 0], ready = false;
  function fit(){
    var r = fig.getBoundingClientRect(), dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    var w = Math.min(Math.ceil(r.width * dpr), img.naturalWidth), h = Math.round(w * img.naturalHeight / img.naturalWidth);
    if (!w || (w === size[0] && h === size[1])) return Promise.resolve();
    size = [w, h];
    return createImageBitmap(img, {resizeWidth: w, resizeHeight: h, resizeQuality: "high"}).then(function(bmp){
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      if (photoTex) gl.deleteTexture(photoTex);
      photoTex = texture(0, bmp);
      bmp.close && bmp.close();
      draw();
    });
  }

  // the pointer is followed with a short ease; drawing stops once the picture has settled
  var aim = [0, 0], cur = [0, 0], raf = 0, last = 0;
  function draw(){
    if (!ready) return;
    var reach = Math.max(Math.abs(cur[0]), Math.abs(cur[1]));
    gl.uniform2f(uShift, cur[0] * AX, cur[1] * AY);
    gl.uniform1f(uZoom, 1 + 2 * AX * (1 - MID) * reach);   // lean in just enough to keep the edges filled
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function tick(t){
    var dt = last ? Math.min((t - last) / 1000, 0.05) : 0.016, k = 1 - Math.exp(-dt * 6);
    last = t;
    cur[0] += (aim[0] - cur[0]) * k; cur[1] += (aim[1] - cur[1]) * k;
    draw();
    if (Math.abs(aim[0] - cur[0]) + Math.abs(aim[1] - cur[1]) > 0.0005) raf = requestAnimationFrame(tick);
    else { raf = 0; last = 0; }
  }
  function steer(x, y){
    aim = [x, y];
    if (!raf && ready && fig.getClientRects().length) raf = requestAnimationFrame(tick);   // not while it is hidden
  }
  var hero = document.getElementById("intro") || fig;
  hero.addEventListener("pointermove", function(e){
    if (e.pointerType !== "mouse") return;
    var r = fig.getBoundingClientRect(), h = hero.getBoundingClientRect();
    var x = (e.clientX - (r.left + r.width / 2)) / (h.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (h.height / 2);
    steer(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
  });
  hero.addEventListener("pointerleave", function(){ steer(0, 0); });

  var depth = new Image();
  depth.src = "media3/showroom-depth.png";
  Promise.all([img.decode ? img.decode() : Promise.resolve(), depth.decode()]).then(function(){
    texture(1, depth);
    return fit();
  }).then(function(){
    ready = true;
    draw();
    fig.appendChild(canvas);
    requestAnimationFrame(function(){ canvas.classList.add("on"); });
    new ResizeObserver(function(){ fit(); }).observe(fig);
  }).catch(function(){});
})();
