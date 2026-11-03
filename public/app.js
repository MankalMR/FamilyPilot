// Family Pilot — Phase 0, vanilla JS. No framework.
// One job here: prove the Pages Functions API is reachable.
document.getElementById("health-btn").addEventListener("click", async () => {
  const out = document.getElementById("health-out");
  out.textContent = "Checking…";
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    out.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    out.textContent = "Health check failed: " + err.message;
  }
});
