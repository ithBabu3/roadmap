try { await import("./boot-main.js"); }
catch (e) {
  console.error(e);
  const m = document.getElementById("boot-msg");
  if (m) m.textContent = "Couldn't start: " + (e.message || e) + " — try a hard refresh (Ctrl+Shift+R). If it persists: DevTools > Application > Service Workers > Unregister, then reload.";
  document.querySelector(".boot-bar")?.remove();
  const a = document.getElementById("boot-actions"); if (a) a.style.display = "block";
}