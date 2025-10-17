document.addEventListener("DOMContentLoaded", async () => {
  try {
    const resp = await fetch("/api/planos");
    const planos = await resp.json();
    const container = document.getElementById("planos-list");
    if (!container) return;

    planos.forEach(p => {
      const div = document.createElement("div");
      div.className = "plano";
      div.innerHTML = `
        <h3>${p.nome}</h3>
        <p>Espaço: ${p.espaco.quota}</p>
        <p>Preço: ${p.preco}</p>
      `;
      div.addEventListener("click", () => {
        // passa o nome com case normalizado
        const nomePlano = p.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        window.location.href = `/assinatura?plano=${encodeURIComponent(nomePlano)}`;
      });
      container.appendChild(div);
    });
  } catch (err) {
    console.error("Erro ao carregar planos:", err);
  }
});
