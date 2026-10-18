const signals = {
  "steady-green": {
    label: "Steady green",
    air: ["Cleared to land", "You are cleared to land."],
    ground: ["Cleared for takeoff", "You are cleared for takeoff."]
  },
  "flashing-green": {
    label: "Flashing green",
    air: ["Return for landing", "Return for landing. A steady green signal will follow at the proper time."],
    ground: ["Cleared to taxi", "You are cleared to taxi."]
  },
  "steady-red": {
    label: "Steady red",
    air: ["Give way and continue circling", "Give way to other aircraft and continue circling."],
    ground: ["Stop", "Stop."]
  },
  "flashing-red": {
    label: "Flashing red",
    air: ["Airport unsafe — do not land", "The airport is unsafe. Do not land."],
    ground: ["Taxi clear of runway in use", "Taxi clear of the runway in use."]
  },
  "flashing-white": {
    label: "Flashing white",
    air: ["Land and proceed to the ramp", "Land at this airport and proceed to the ramp."],
    ground: ["Return to starting point", "Return to the starting point on the airport."]
  },
  alternating: {
    label: "Alternating red and green",
    air: ["Exercise extreme caution", "Exercise extreme caution."],
    ground: ["Exercise extreme caution", "Exercise extreme caution."]
  }
};

const signalCards = [...document.querySelectorAll(".signal-card")];
const manualTitle = document.querySelector("#manual-result-title");
const manualCopy = document.querySelector("#manual-result-copy");
const manualContext = document.querySelector("#manual-result-context");

function selectedContext(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

function displaySignal(signalKey, context, elements) {
  const signal = signals[signalKey];
  const instruction = signal[context];
  elements.title.textContent = instruction[0];
  elements.copy.textContent = instruction[1];
  elements.context.textContent = `${signal.label} · ${context === "air" ? "IN FLIGHT" : "ON GROUND"}`;
}

function updateManualResult() {
  const selected = signalCards.find((card) => card.getAttribute("aria-pressed") === "true");
  if (!selected) return;
  displaySignal(selected.dataset.signal, selectedContext("context"), {
    title: manualTitle,
    copy: manualCopy,
    context: manualContext
  });
}

signalCards.forEach((card) => {
  card.addEventListener("click", () => {
    signalCards.forEach((item) => item.setAttribute("aria-pressed", String(item === card)));
    updateManualResult();
  });
});

document.querySelectorAll('input[name="context"]').forEach((input) => {
  input.addEventListener("change", updateManualResult);
});

const tabs = [
  { button: document.querySelector("#manual-tab"), panel: document.querySelector("#manual-panel") },
  { button: document.querySelector("#camera-tab"), panel: document.querySelector("#camera-panel") }
];

tabs.forEach(({ button, panel }) => {
  button.addEventListener("click", () => {
    tabs.forEach(({ button: otherButton, panel: otherPanel }) => {
      const active = button === otherButton;
      otherButton.classList.toggle("is-active", active);
      otherButton.setAttribute("aria-selected", String(active));
      otherButton.tabIndex = active ? 0 : -1;
      otherPanel.hidden = !active;
    });
  });
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const currentIndex = tabs.findIndex((tab) => tab.button === button);
    tabs[(currentIndex + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].button.click();
    tabs[(currentIndex + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].button.focus();
  });
});

const video = document.querySelector("#camera-video");
const cameraFrame = document.querySelector("#camera-frame");
const cameraPlaceholder = document.querySelector("#camera-placeholder");
const cameraLive = document.querySelector("#camera-live");
const cameraStatus = document.querySelector("#camera-status");
const cameraStart = document.querySelector("#camera-start");
const cameraStop = document.querySelector("#camera-stop");
const cameraTitle = document.querySelector("#camera-result-title");
const cameraCopy = document.querySelector("#camera-result-copy");
const cameraContext = document.querySelector("#camera-result-context");
const analysisCanvas = document.createElement("canvas");
analysisCanvas.width = 160;
analysisCanvas.height = 90;
const analysisContext = analysisCanvas.getContext("2d", { willReadFrequently: true });

let cameraStream = null;
let animationFrame = null;
let currentColor = null;
let candidateColor;
let candidateSince = 0;
let stateChangedAt = 0;
let lastLightAt = 0;
let lastSampleAt = 0;
let transitions = [];
let lastReportedKey = "";

function setCameraResult(title, copy, context) {
  cameraTitle.textContent = title;
  cameraCopy.textContent = copy;
  cameraContext.textContent = context;
}

function setCameraStatus(message) {
  if (cameraStatus.textContent !== message) cameraStatus.textContent = message;
}

function classifyPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = max / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (brightness < 0.3) return null;
  if (saturation < 0.2 && brightness > 0.86) return "white";
  if (saturation < 0.32) return null;
  if (r > g * 1.35 && r > b * 1.35) return "red";
  if (g > r * 1.2 && g > b * 1.15) return "green";
  return null;
}

function findLightColor() {
  if (!video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(160 / video.videoWidth, 120 / video.videoHeight);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  if (analysisCanvas.width !== width || analysisCanvas.height !== height) {
    analysisCanvas.width = width;
    analysisCanvas.height = height;
  }

  analysisContext.drawImage(video, 0, 0, width, height);
  const { data } = analysisContext.getImageData(0, 0, width, height);
  const pixels = width * height;
  const labels = new Uint8Array(pixels);
  const colors = [null, "red", "green", "white"];

  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const color = classifyPixel(data[offset], data[offset + 1], data[offset + 2]);
    if (color) labels[pixel] = colors.indexOf(color);
  }

  const visited = new Uint8Array(pixels);
  const queue = new Uint32Array(pixels);
  let strongestColor = null;
  let strongestScore = 0;

  for (let start = 0; start < pixels; start += 1) {
    const label = labels[start];
    if (label === 0 || visited[start]) continue;

    let head = 0;
    let tail = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const neighborX = x + dx;
          const neighborY = y + dy;
          if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) continue;
          const neighbor = neighborY * width + neighborX;
          if (!visited[neighbor] && labels[neighbor] === label) {
            visited[neighbor] = 1;
            queue[tail++] = neighbor;
          }
        }
      }
    }

    if (tail < 3 || tail > pixels * 0.025) continue;
    const boundsArea = (maxX - minX + 1) * (maxY - minY + 1);
    const score = tail / Math.sqrt(boundsArea);
    if (score > strongestScore) {
      strongestScore = score;
      strongestColor = colors[label];
    }
  }

  return strongestColor;
}

function reportCameraSignal(signalKey) {
  if (signalKey === lastReportedKey) return;
  lastReportedKey = signalKey;
  displaySignal(signalKey, selectedContext("camera-context"), {
    title: cameraTitle,
    copy: cameraCopy,
    context: cameraContext
  });
}

function updateCameraContext() {
  if (signals[lastReportedKey]) {
    displaySignal(lastReportedKey, selectedContext("camera-context"), {
      title: cameraTitle,
      copy: cameraCopy,
      context: cameraContext
    });
  }
}

function analyzeFrame(timestamp) {
  if (!cameraStream) return;
  animationFrame = requestAnimationFrame(analyzeFrame);
  if (timestamp - lastSampleAt < 150 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  lastSampleAt = timestamp;

  let color;
  try {
    color = findLightColor();
  } catch (error) {
    stopCamera();
    setCameraStatus(`Could not analyze the camera image: ${error.message}`);
    return;
  }

  if (color !== candidateColor) {
    candidateColor = color;
    candidateSince = timestamp;
  }

  if (color !== currentColor && timestamp - candidateSince >= 180) {
    if (currentColor !== null) transitions.push({ type: "off", color: currentColor, at: timestamp });
    if (color !== null) {
      transitions.push({ type: "on", color, at: timestamp });
      lastLightAt = timestamp;
    }
    currentColor = color;
    stateChangedAt = timestamp;
  }

  transitions = transitions.filter((entry) => timestamp - entry.at < 5000);
  const onEvents = transitions.filter((entry) => entry.type === "on");
  const recentColors = onEvents.slice(-3).map((entry) => entry.color);
  const isAlternating = recentColors.length === 3
    && timestamp - onEvents[onEvents.length - 1].at < 3000
    && recentColors[0] === recentColors[2]
    && recentColors[0] !== recentColors[1]
    && ["red", "green"].includes(recentColors[0])
    && ["red", "green"].includes(recentColors[1]);
  const sameColorPulses = transitions
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.type === "on" && entry.color === currentColor);
  const lastTwoPulses = sameColorPulses.slice(-2);
  const isFlashing = currentColor !== null
    && lastTwoPulses.length === 2
    && timestamp - lastTwoPulses[1].entry.at < 3000
    && transitions.slice(lastTwoPulses[0].index + 1, lastTwoPulses[1].index)
      .some((entry) => entry.type === "off");

  if (isAlternating) {
    reportCameraSignal("alternating");
    setCameraStatus("Detected alternating red and green. Exercise extreme caution.");
  } else if (isFlashing) {
    reportCameraSignal(`flashing-${currentColor}`);
    setCameraStatus(`Detected flashing ${currentColor} in the camera view.`);
  } else if (currentColor !== null && timestamp - stateChangedAt > 3000) {
    const signalKey = `steady-${currentColor}`;
    if (signals[signalKey]) {
      reportCameraSignal(signalKey);
      setCameraStatus(`Detected steady ${currentColor} in the camera view.`);
    } else if (lastReportedKey !== "steady-white-unsupported") {
      lastReportedKey = "steady-white-unsupported";
      setCameraResult("Steady white — not a standard signal", "The standard tower light-gun signal is flashing white. Verify the light and do not rely on this detection alone.", "STEADY WHITE");
      setCameraStatus("Detected steady white; verify the light carefully.");
    }
  } else if (currentColor !== null && stateChangedAt > 0 && lastReportedKey !== "alternating") {
    if (lastReportedKey !== "checking") {
      lastReportedKey = "checking";
      setCameraResult(`${currentColor[0].toUpperCase()}${currentColor.slice(1)} light — identifying pattern…`, "Keep the light visible anywhere in the camera view while the app checks its flash pattern.", currentColor.toUpperCase());
      setCameraStatus(`Detected ${currentColor}. Checking for a flash pattern…`);
    }
  } else if (currentColor === null && timestamp - Math.max(lastLightAt, candidateSince) > 3000 && lastReportedKey !== "NO SIGNAL") {
    lastReportedKey = "NO SIGNAL";
    setCameraResult("No light detected", "Keep the tower light visible anywhere in the camera view.", "NO SIGNAL");
    setCameraStatus("No signal-colored light detected in the camera view.");
  }
}

function stopCamera() {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  video.srcObject = null;
  cameraFrame.classList.remove("is-camera-active");
  video.hidden = true;
  cameraPlaceholder.hidden = false;
  cameraLive.classList.remove("is-active");
  cameraLive.innerHTML = "<span></span> CAMERA OFF";
  cameraStart.disabled = false;
  cameraStop.disabled = true;
  cameraStatus.textContent = "Camera stopped. Start it again to analyze another signal.";
  lastReportedKey = "";
  setCameraResult("Camera stopped", "Start the camera to identify another tower light.", "CAMERA OFF");
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = "Camera access is not available. Open this page on HTTPS or localhost in a supported browser.";
    return;
  }
  cameraStart.disabled = true;
  cameraStatus.textContent = "Waiting for camera permission…";
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "environment" }
    });
    video.srcObject = cameraStream;
    await video.play();
    video.hidden = false;
    cameraPlaceholder.hidden = true;
    cameraFrame.classList.add("is-camera-active");
    cameraLive.classList.add("is-active");
    cameraLive.innerHTML = "<span></span> LIVE ANALYSIS";
    cameraStart.disabled = true;
    cameraStop.disabled = false;
    cameraStatus.textContent = "Scanning the full camera view for light colors and flash patterns…";
    currentColor = null;
    candidateColor = undefined;
    candidateSince = 0;
    stateChangedAt = 0;
    lastLightAt = 0;
    transitions = [];
    lastSampleAt = 0;
    lastReportedKey = "";
    setCameraResult("Scanning the camera view", "Keep the tower light visible anywhere in the frame. Analysis may take a few seconds.", "ANALYZING");
    animationFrame = requestAnimationFrame(analyzeFrame);
  } catch (error) {
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    video.srcObject = null;
    video.hidden = true;
    cameraPlaceholder.hidden = false;
    cameraStart.disabled = false;
    const messages = {
      NotAllowedError: "Camera access was denied. Allow camera access in your browser settings, then try again.",
      NotFoundError: "No camera was found. Connect a camera and try again.",
      NotReadableError: "The camera is busy or unavailable. Close other apps using it and try again."
    };
    cameraStatus.textContent = messages[error.name] || `Could not start the camera: ${error.message}`;
  }
}

cameraStart.addEventListener("click", startCamera);
cameraStop.addEventListener("click", stopCamera);
document.querySelectorAll('input[name="camera-context"]').forEach((input) => {
  input.addEventListener("change", () => {
    updateCameraContext();
  });
});
window.addEventListener("pagehide", () => {
  if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
});
