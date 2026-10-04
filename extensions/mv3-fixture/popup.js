document.getElementById("btnPing").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "PING" }, (response) => {
    document.getElementById("output").textContent = JSON.stringify(response, null, 2);
  });
});
