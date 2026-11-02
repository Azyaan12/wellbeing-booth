// ---------- Questions ----------
// text = shown on screen, label = short caption on the collage
const QUESTIONS = [
  { text: "Show something that makes you feel calm.", label: "Calm" },
  { text: "Show a place where you feel safe.", label: "Safe place" },
  { text: "Show something you're grateful for.", label: "Grateful" },
  { text: "Show one small thing you did for yourself today.", label: "Self-care" }
];
const TIME_LIMIT = 10 * 60 * 1000;   // 10 minutes in milliseconds

// ---------- App state (also saved on the phone while the timer runs) ----------
let current = 0;        // which question we're on: 0, 1, 2 or 3
const photos = [];      // cropped photo for each question
let collageBlob = null; // finished collage image
let timerId = null;     // the running countdown
let endTime = 0;        // when the 10 minutes run out (ms since 1970)
let previewUrl = null;  // temporary URL for the preview image
let collageUrl = null;  // temporary URL for the collage on the done page

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
// Heading shown in the top bar for each screen
const TITLES = {
  "welcome-view": "NMHD Digital Hunt",
  "photo-view":   "Photo 1 of 4",        // updated per question in renderPhotoStep()
  "collage-view": "Your Collage",
  "done-view":    "All Done!",
  "timeup-view":  "Time's Up"
};
const VIEWS = Object.keys(TITLES);

function showView(id) {
  VIEWS.forEach((v) => { $(v).hidden = (v !== id); });
  $("page-title").textContent = TITLES[id];
  window.scrollTo(0, 0);
}

// Load an image file for drawing on the collage (null if it's missing)
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
// ---------- Save progress on the phone (IndexedDB) ----------
// Keeps the timer and photos if the page reloads or the browser is closed,
// but only until the 10 minutes run out. Nothing is ever uploaded.
const DB_NAME = "nmhd-digital-hunt";
const STORE = "session";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Run one request against the store; failures are ignored (private mode etc.)
async function withStore(mode, fn) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

const saveSession = () =>
  withStore("readwrite", (s) => s.put({ endTime, current, photos: [...photos] }, "current"));
const loadSession = () => withStore("readonly", (s) => s.get("current"));
const clearSession = () => withStore("readwrite", (s) => s.delete("current"));

// ---------- 10-minute timer ----------
function startTimer() {
  const tick = () => {
    const left = Math.max(0, endTime - Date.now());
    const m = Math.floor(left / 60000);
    const s = String(Math.floor(left / 1000) % 60).padStart(2, "0");
    $("timer").textContent = `${m}:${s} left`;
    $("timer").classList.toggle("hurry", left < 2 * 60 * 1000);

    if (left === 0) {
      stopTimer();
      clearSession();
      showView("timeup-view");
    }
  };

  tick();                         // show the time left straight away
  timerId = setInterval(tick, 1000);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}
// ---------- Crop a photo to a centred square ----------
async function cropToSquare(file, size = 1080) {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}
// ---------- Draw the current question ----------
function renderProgress() {
  $("progress").innerHTML = "";
  QUESTIONS.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.className = "dot" + (photos[i] ? " done" : "") + (i === current ? " current" : "");
    dot.textContent = i + 1;
    $("progress").appendChild(dot);
  });
}

function renderPhotoStep() {
  const hasPhoto = !!photos[current];
  $("page-title").textContent = `Photo ${current + 1} of ${QUESTIONS.length}`;
  $("question-text").textContent = QUESTIONS[current].text;
  renderProgress();

  if (previewUrl) URL.revokeObjectURL(previewUrl);   // free the old preview
  previewUrl = hasPhoto ? URL.createObjectURL(photos[current]) : null;
  if (previewUrl) $("preview").src = previewUrl;

  $("preview").hidden = !hasPhoto;
  $("placeholder").hidden = hasPhoto;
  $("camera-label").hidden = hasPhoto;   // "Take a photo" before
  $("after-photo").hidden = !hasPhoto;   // "Retake / Next" after
  $("next-btn").disabled = false;
  $("next-btn").textContent =
    current === QUESTIONS.length - 1 ? "Make my collage" : "Next photo";
}
// ---------- Events ----------
$("start-btn").addEventListener("click", () => {
  current = 0;
  photos.length = 0;        // clear any earlier attempt
  collageBlob = null;
  endTime = Date.now() + TIME_LIMIT;
  saveSession();
  showView("photo-view");
  renderPhotoStep();
  startTimer();
});

$("camera").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";                     // lets Retake pick a new photo
  if (!file) return;                       // user cancelled the camera
  $("photo-error").hidden = true;
  const step = current;                    // in case Next is tapped while processing

  let photo;
  try {
    photo = await cropToSquare(file);
  } catch {
    photo = null;
  }
  if (!timerId) return;                    // time ran out while processing
  if (!photo) {
    $("photo-error").hidden = false;
    return;
  }
  photos[step] = photo;
  saveSession();
  renderPhotoStep();
});

$("next-btn").addEventListener("click", () => {
  $("photo-error").hidden = true;
  if (current < QUESTIONS.length - 1) {
    current++;
    saveSession();
    renderPhotoStep();
  } else {
    finishPhotos();
  }
});

$("retry-btn").addEventListener("click", () => showView("welcome-view"));

async function finishPhotos() {
  stopTimer();                             // all 4 done in time
  $("next-btn").disabled = true;           // ignore double taps
  $("next-btn").textContent = "Building...";
  await buildCollage();
  clearSession();
  showView("collage-view");
}
// ---------- Build the 2x2 photo booth collage ----------
async function buildCollage() {
  const pad = 40, gap = 30, cell = 1000, footer = 280;
  const W = pad * 2 + cell * 2 + gap;        // 2110
  const H = pad + cell * 2 + gap + footer;   // 2350

  const canvas = $("collage");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fffaf3";                 // photo-booth paper colour
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < QUESTIONS.length; i++) {
    const x = pad + (i % 2) * (cell + gap);            // column 0 or 1
    const y = pad + Math.floor(i / 2) * (cell + gap);  // row 0 or 1

    const img = await createImageBitmap(photos[i]);
    ctx.drawImage(img, x, y, cell, cell);

    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";   // caption band
    ctx.fillRect(x, y + cell - 110, cell, 110);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(QUESTIONS[i].label, x + cell / 2, y + cell - 40);
  }

  // ----- footer: NMHD logo | text | Health Expo logo -----
  const footerTop = pad + cell * 2 + gap;    // where the photos end
  const logoBoxW = 420, logoBoxH = 200;      // each logo fits inside this box
  const logoY = footerTop + (footer - logoBoxH) / 2;

  const [nmhdLogo, expoLogo] = await Promise.all([
    loadImage("images/nmhd-logo.png"),
    loadImage("images/health-expo-logo.png")
  ]);
  drawLogo(ctx, nmhdLogo, pad, logoY, logoBoxW, logoBoxH, "left");
  drawLogo(ctx, expoLogo, W - pad - logoBoxW, logoY, logoBoxW, logoBoxH, "right");

  ctx.fillStyle = "#333333";                 // text in the middle
  ctx.textAlign = "center";
  ctx.font = "bold 52px system-ui, sans-serif";
  ctx.fillText("A healthy mind is a", W / 2, footerTop + 115);
  ctx.fillText("happy investment", W / 2, footerTop + 178);
  ctx.font = "34px system-ui, sans-serif";
  ctx.fillText(new Date().toLocaleDateString(), W / 2, footerTop + 238);

  collageBlob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
}

// Draw a logo inside a box, keeping its shape (no stretching)
function drawLogo(ctx, img, x, y, boxW, boxH, align) {
  if (!img) return;                          // logo file missing: skip it
  const scale = Math.min(boxW / img.width, boxH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const dx = align === "left" ? x : x + boxW - w;
  ctx.drawImage(img, dx, y + (boxH - h) / 2, w, h);
}
// ---------- Download, share, done ----------
const FILE_NAME = "nmhd-digital-hunt.jpg";

function downloadBlob(blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = FILE_NAME;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("download-btn").addEventListener("click", () => {
  if (collageBlob) downloadBlob(collageBlob);
});

$("share-btn").addEventListener("click", async () => {
  if (!collageBlob) return;
  const file = new File([collageBlob], FILE_NAME, { type: "image/jpeg" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "NMHD Digital Hunt" });
    } catch (err) {
      if (err.name !== "AbortError") downloadBlob(collageBlob); // AbortError = user closed the sheet
    }
  } else {
    downloadBlob(collageBlob);
  }
});

$("done-btn").addEventListener("click", () => {
  if (collageUrl) URL.revokeObjectURL(collageUrl);
  collageUrl = URL.createObjectURL(collageBlob);
  $("done-collage").src = collageUrl;
  showView("done-view");
});

// ---------- Logos: hide if the file is missing ----------
document.querySelectorAll(".top-bar .logo").forEach((img) => {
  img.addEventListener("error", () => { img.style.visibility = "hidden"; });
  if (img.complete && img.naturalWidth === 0) img.style.visibility = "hidden";
});

// ---------- Pick up where we left off after a reload ----------
(async () => {
  const saved = await loadSession();
  if (!saved || !saved.endTime) return;   // nothing saved: stay on welcome
  if (saved.endTime <= Date.now()) {      // ran out while the page was closed
    clearSession();
    showView("timeup-view");
    return;
  }
  endTime = saved.endTime;
  current = saved.current || 0;
  photos.length = 0;
  (saved.photos || []).forEach((p, i) => { if (p) photos[i] = p; });
  showView("photo-view");
  renderPhotoStep();
  startTimer();
})();