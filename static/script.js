// Lógica de tema removida - agora gerenciada por base.html
// usando localStorage key 'libermedia_theme' com suporte a light/auto/dark

function goHome() {
  // Se no futuro tiver autenticação real, podemos trocar essa lógica
  if (window.location.pathname.startsWith("/usuario")) {
    window.location.href = "/usuario";
  } else {
    window.location.href = "/";
  }
}
