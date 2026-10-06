try { await import("./boot-main.js"); }
catch (e) {
  console.error(e);
  const m = document.getElementById("boot-msg");
  if (m) m.textContent = "Couldn't start: " + (e.message || e) + " — js/firebase-config.js must contain ONLY the config object (no import lines).";
  document.querySelector(".boot-bar")?.remove();
  const a = document.getElementById("boot-actions"); if (a) a.style.display = "block";
}