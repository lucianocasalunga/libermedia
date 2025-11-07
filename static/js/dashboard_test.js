// Função para renderizar mídia corretamente
function renderMediaCard(arquivo) {
  const ext = getExtensao(arquivo.nome);
  const linkComExt = `https://media.libernet.app/f/${arquivo.id}.${ext}`;
  
  let mediaHTML = '';
  
  // VÍDEO
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) {
    mediaHTML = `
      <video class="w-full h-40 object-cover" controls>
        <source src="${linkComExt}" type="video/${ext}">
        Seu navegador não suporta vídeo.
      </video>
    `;
  }
  // ÁUDIO  
  else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    mediaHTML = `
      <div class="w-full h-40 bg-gradient-to-br from-purple-600 to-pink-600 flex flex-col items-center justify-center p-4">
        <p class="text-5xl mb-2">🎵</p>
        <p class="text-white text-sm mb-2 truncate w-full text-center">${arquivo.nome}</p>
        <audio controls class="w-full">
          <source src="${linkComExt}" type="audio/${ext}">
        </audio>
      </div>
    `;
  }
  // IMAGEM (padrão)
  else {
    mediaHTML = `
      <img src="${linkComExt}" 
           class="w-full h-40 object-cover cursor-pointer" 
           onclick="openModal(${arquivo.id})"
           onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27%3E%3Cpath stroke=%27%239ca3af%27 stroke-width=%272%27 d=%27M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z%27/%3E%3C/svg%3E'">
    `;
  }
  
  return mediaHTML;
}
