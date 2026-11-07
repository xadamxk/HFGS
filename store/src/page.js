// Line HF's game box up with the HFGS card, and put the footer just below them.
const card = document.querySelector(".assist");
const bottom = card.offsetTop + card.offsetHeight;
document.querySelector(".tbl").style.height = card.offsetHeight + "px";
const foot = document.querySelector(".foot");
foot.style.top = bottom + 24 + "px";
foot.style.height = Math.max(72, 800 - bottom - 24) + "px";
