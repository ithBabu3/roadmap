// When you switch to another browser tab, this tab's title changes to "AreUWatching MyScreen".
// The real title (for example "Docs Hub · .NET Roadmap") comes back when you return.
(function () {
  const AWAY = "AreUWatching MyScreen";
  let real = document.title;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { real = document.title; document.title = AWAY; }
    else { document.title = real; }
  });
})();
