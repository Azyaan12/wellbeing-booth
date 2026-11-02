// ---------- Questions ----------
// text = shown on screen, label = short caption on the collage
const QUESTIONS = [
  { text: "Show something that makes you feel calm.", label: "Calm" },
  { text: "Show a place where you feel safe.", label: "Safe place" },
  { text: "Show something you're grateful for.", label: "Grateful" },
  { text: "Show one small thing you did for yourself today.", label: "Self-care" }
];
const TIME_LIMIT = 10 * 60 * 1000;   // 10 minutes in milliseconds

// ---------- App state (lives in memory while the page is open) ----------
let current = 0;        // which question we're on: 0, 1, 2 or 3
const photos = [];      // cropped photo for each question
let collageBlob = null; // finished collage image
let timerId = null;     // the running countdown
let previewUrl = null;  // temporary URL for the preview image

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
// ---------- 10-minute timer ----------
function startTimer() {
  const endTime = Date.now() + TIME_LIMIT;

  const tick = () => {
    const left = Math.max(0, endTime - Date.now());
    const m = Math.floor(left / 60000);
    const s = String(Math.floor(left / 1000) % 60).padStart(2, "0");
    $("timer").textContent = `${m}:${s} left`;
    $("timer").classList.toggle("hurry", left < 2 * 60 * 1000);

    if (left === 0) {
      stopTimer();
      showView("timeup-view");
    }
  };

  tick();                         // show 10:00 straight away
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
  $("next-btn").textContent =
    current === QUESTIONS.length - 1 ? "Make my collage" : "Next photo";
}
// ---------- Events ----------
$("start-btn").addEventListener("click", () => {
  current = 0;
  photos.length = 0;        // clear any earlier attempt
  collageBlob = null;
  showView("photo-view");
  renderPhotoStep();
  startTimer();
});

$("camera").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;                       // user cancelled the camera
  photos[current] = await cropToSquare(file);
  e.target.value = "";                     // lets Retake pick a new photo
  renderPhotoStep();
});

$("next-btn").addEventListener("click", () => {
  if (current < QUESTIONS.length - 1) {
    current++;
    renderPhotoStep();
  } else {
    finishPhotos();
  }
});

$("retry-btn").addEventListener("click", () => showView("welcome-view"));

async function finishPhotos() {
  stopTimer();                             // all 4 done in time
  $("next-btn").textContent = "Building...";
  await buildCollage();
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

$("done-btn").addEventListener("click", () => showView("done-view"));