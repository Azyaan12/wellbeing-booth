// ---------- Questions ----------
// text = shown on screen, label = short caption on the collage,
// messages = one is picked at random and shown under the photo once it's taken
const QUESTIONS = [
  {
    text: "Show something that makes you feel calm.",
    label: "Calm",
    messages: [
      "You deserve peace, not just productivity.",
      "Take a breath. You don't have to rush through life.",
      "It's okay to pause. Rest is part of growing.",
      "Find your calm, and give yourself permission to stay there.",
      "Even the busiest minds deserve a moment of quiet.",
      "You don't have to solve everything today.",
      "Protect your peace. It matters.",
      "Sometimes, the best thing you can do is slow down.",
      "A peaceful moment can make a difficult day feel lighter.",
      "Give yourself the space to breathe, reset and begin again."
    ]
  },
  {
    text: "Show a place where you feel safe.",
    label: "Safe place",
    messages: [
      "Everyone deserves a place where they can truly be themselves.",
      "You deserve to feel safe, accepted and valued.",
      "Home is not always a place; sometimes it's a feeling.",
      "Surround yourself with people and places that bring you peace.",
      "You belong wherever you are accepted for who you are.",
      "Never underestimate the power of feeling understood.",
      "You deserve spaces where you don't have to pretend.",
      "It's okay to seek comfort and ask for support.",
      "May you always find a place where your heart feels at ease.",
      "Remember, you deserve safety, kindness and belonging."
    ]
  },
  {
    text: "Show something you're grateful for.",
    label: "Grateful",
    messages: [
      "Happiness often begins with noticing the little things.",
      "There is beauty in the ordinary moments of life.",
      "A grateful heart can find light even on cloudy days.",
      "Don't overlook the little things that make life meaningful.",
      "Today, celebrate what you have rather than what you lack.",
      "Sometimes the smallest blessings make the biggest difference.",
      "There is always something worth appreciating, even in a difficult season.",
      "Gratitude doesn't mean life is perfect; it means noticing what is good.",
      "Let the little things remind you that life can be beautiful.",
      "Take a moment to appreciate how far you've come."
    ]
  },
  {
    text: "Show one small thing you did for yourself today.",
    label: "Self-care",
    messages: [
      "Taking care of yourself is never a waste of time.",
      "You deserve the care you so freely give to others.",
      "Small acts of self-love create meaningful change.",
      "You are allowed to put yourself first sometimes.",
      "Every little step towards your well-being counts.",
      "Be proud of yourself for showing up for YOU today.",
      "You don't need to earn the right to rest.",
      "Self-care isn't selfish; it's necessary.",
      "Treat yourself with the same kindness you would offer a friend.",
      "Remember, you matter too. Make yourself a priority."
    ]
  }
];
const TIME_LIMIT = 10 * 60 * 1000;   // 10 minutes in milliseconds

// ---------- App state (also saved on the phone while the timer runs) ----------
let current = 0;        // which question we're on: 0, 1, 2 or 3
const photos = [];      // cropped photo for each question
const messages = [];    // which of the question's messages is shown with each photo
let collageBlob = null; // finished collage image
let timerId = null;     // the running countdown
let endTime = 0;        // when the 10 minutes run out (ms since 1970)
let previewUrl = null;  // temporary URL for the preview image
let collageUrl = null;  // temporary URL for the collage image

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
// Heading shown in the top bar for each screen
const TITLES = {
  "welcome-view": "Digital Hunt",
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
  withStore("readwrite", (s) =>
    s.put({ endTime, current, photos: [...photos], messages: [...messages] }, "current"));
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

// Pick a random message for this question (a different one on retake)
function pickMessage(step) {
  const options = QUESTIONS[step].messages.map((_, i) => i).filter((i) => i !== messages[step]);
  return options[Math.floor(Math.random() * options.length)];
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
  $("photo-message").textContent = hasPhoto ? QUESTIONS[current].messages[messages[current]] ?? "" : "";
  $("photo-message").hidden = !hasPhoto;
  $("photo-view").classList.toggle("has-photo", hasPhoto);
  $("before-photo").hidden = hasPhoto;   // "Take / Choose" before
  $("after-photo").hidden = !hasPhoto;   // "Retake / Next" after
  $("next-btn").disabled = false;
  $("next-btn").textContent =
    current === QUESTIONS.length - 1 ? "Make my collage" : "Next photo";
}
// ---------- Events ----------
$("start-btn").addEventListener("click", () => {
  current = 0;
  photos.length = 0;        // clear any earlier attempt
  messages.length = 0;
  collageBlob = null;
  endTime = Date.now() + TIME_LIMIT;
  saveSession();
  showView("photo-view");
  renderPhotoStep();
  startTimer();
});

// Same handling whether the photo comes from the camera or the gallery
async function onPhotoPicked(e) {
  const file = e.target.files[0];
  e.target.value = "";                     // lets Retake pick a new photo
  if (!file) return;                       // user cancelled the picker
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
  messages[step] = pickMessage(step);      // a new one on retake too
  saveSession();
  renderPhotoStep();
}
$("camera").addEventListener("change", onPhotoPicked);
$("gallery").addEventListener("change", onPhotoPicked);

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

// Throw away this attempt and go back to the welcome page
$("restart-btn").addEventListener("click", () => {
  if (!confirm("Start over? Your photos so far will be cleared.")) return;
  stopTimer();
  clearSession();
  current = 0;
  photos.length = 0;
  messages.length = 0;
  $("photo-error").hidden = true;
  showView("welcome-view");
});

async function finishPhotos() {
  stopTimer();                             // all 4 done in time
  $("next-btn").disabled = true;           // ignore double taps
  $("next-btn").textContent = "Building...";
  await buildCollage();
  clearSession();

  // Show the collage as an <img> so it can be pressed and held to save
  if (collageUrl) URL.revokeObjectURL(collageUrl);
  collageUrl = URL.createObjectURL(collageBlob);
  $("collage-img").src = collageUrl;
  $("done-collage").src = collageUrl;
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

// Open the phone's share sheet; falls back to a normal download
async function shareBlob(blob) {
  const file = new File([blob], FILE_NAME, { type: "image/jpeg" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "NMHD Digital Hunt" });
    } catch (err) {
      if (err.name !== "AbortError") downloadBlob(blob); // AbortError = user closed the sheet
    }
  } else {
    downloadBlob(blob);
  }
}

// iPhone/iPad (iPadOS reports itself as a Mac with a touch screen)
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Websites can't write to the gallery directly, so pick the closest route:
// on iPhone a download lands in Files, but the share sheet has "Save Image",
// which goes straight to Photos. On Android, downloads show up in the
// gallery's Download album.
$("download-btn").addEventListener("click", () => {
  if (!collageBlob) return;
  if (IS_IOS) shareBlob(collageBlob);
  else downloadBlob(collageBlob);
});

$("share-btn").addEventListener("click", () => {
  if (collageBlob) shareBlob(collageBlob);
});

$("done-btn").addEventListener("click", () => showView("done-view"));

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
  messages.length = 0;
  (saved.messages || []).forEach((m, i) => { messages[i] = m; });
  showView("photo-view");
  renderPhotoStep();
  startTimer();
})();