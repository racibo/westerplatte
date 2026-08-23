/* Otwiera/zamyka modal „O stronie i jej autorze” (przycisk „i” / data-about). */
document.addEventListener("click", function (e) {
  var trigger = e.target.closest("[data-about]");
  if (trigger) {
    var modal = document.getElementById("aboutModal");
    if (modal) modal.hidden = false;
    return;
  }
  var close = e.target.closest("#aboutClose");
  var overlay = e.target.id === "aboutModal" ? e.target : null;
  if (close || overlay) {
    var m = document.getElementById("aboutModal");
    if (m) m.hidden = true;
  }
});
