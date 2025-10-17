document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.getElementById("themeToggle");
  const resetTheme = document.getElementById("resetTheme");

  let savedTheme = localStorage.getItem("theme");

  // Se não tiver salvo, define automático pelo horário
  if (!savedTheme) {
    const hour = new Date().getHours();
    savedTheme = (hour >= 6 && hour < 18) ? "light" : "dark";
  }
  setTheme(savedTheme);

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = document.body.classList.contains("light-mode") ? "dark" : "light";
      setTheme(current);
      localStorage.setItem("theme", current);
    });
  }

  if (resetTheme) {
    resetTheme.addEventListener("click", () => {
      localStorage.removeItem("theme");
      const hour = new Date().getHours();
      const autoTheme = (hour >= 6 && hour < 18) ? "light" : "dark";
      setTheme(autoTheme);
      alert("Tema resetado para automático (de acordo com horário).");
    });
  }

  function setTheme(mode) {
    if (mode === "light") {
      document.body.classList.add("light-mode");
      document.body.style.backgroundImage = "url('/static/img/praiatemaclaro.jpg')";
    } else {
      document.body.classList.remove("light-mode");
      document.body.style.backgroundImage = "url('/static/img/praiatemaescuro.jpg')";
    }
  }
});

function goHome() {
  // Se no futuro tiver autenticação real, podemos trocar essa lógica
  if (window.location.pathname.startsWith("/usuario")) {
    window.location.href = "/usuario";
  } else {
    window.location.href = "/";
  }
}
