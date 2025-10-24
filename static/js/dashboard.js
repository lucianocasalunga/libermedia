const npub = localStorage.getItem('libermedia_npub');
if (!npub) { alert('Faça login!'); location.href = '/'; }

document.getElementById('npubShort').textContent = npub.slice(0, 20) + '...';

let todosArquivos = [];
let pastaAtual = 'Mesa';
let viewMode = 'grade';
let currentModalIndex = 0;
let modalArquivos = [];

const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');

dropArea.onclick = () => fileInput.click();
dropArea.ondragover = (e) => { e.preventDefault(); dropArea.classList.add('border-yellow-500'); };
dropArea.ondragleave = () => dropArea.classList.remove('border-yellow-500');
dropArea.ondrop = (e) => { 
  e.preventDefault(); 
  dropArea.classList.remove('border-yellow-500');
  upload(Array.from(e.dataTransfer.files)); 
};
fileInput.onchange = (e) => upload(Array.from(e.target.files));

async function upload(files) {
  const progress = document.getElementById('progress');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  
  progress.classList.remove('hidden');
  
  for (let i = 0; i < files.length; i++) {
    const fd = new FormData();
    fd.append('file', files[i]);
    fd.append('npub', npub);
    fd.append('pasta', pastaAtual === 'Mesa' ? 'Geral' : pastaAtual);
    
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = pct + '%';
        progressText.textContent = `${i+1}/${files.length} - ${pct}%`;
      }
    };
    
    await new Promise((resolve) => {
      xhr.onload = () => resolve();
      xhr.open('POST', '/api/upload');
      xhr.send(fd);
    });
  }
  
  progress.classList.add('hidden');
  loadFiles();
}

async function loadFiles() {
  const res = await fetch(`/api/arquivos?npub=${npub}`);
  const data = await res.json();
  
  todosArquivos = data.arquivos || [];
  document.getElementById('total').textContent = todosArquivos.length;
  
  renderFiles();
}

function toggleView(mode) {
  viewMode = mode;
  const wrapper = document.getElementById('filesWrapper');
  const btnGrade = document.getElementById('btnGrade');
  const btnLista = document.getElementById('btnLista');
  
  if (mode === 'grade') {
    wrapper.className = 'view-grade';
    btnGrade.className = 'px-4 py-2 rounded bg-white dark:bg-gray-600 text-gray-900 dark:text-white font-semibold';
    btnLista.className = 'px-4 py-2 rounded text-gray-600 dark:text-gray-300';
  } else {
    wrapper.className = 'view-lista';
    btnLista.className = 'px-4 py-2 rounded bg-white dark:bg-gray-600 text-gray-900 dark:text-white font-semibold';
    btnGrade.className = 'px-4 py-2 rounded text-gray-600 dark:text-gray-300';
  }
  
  renderFiles();
}

function getExtensao(nome) {
  if (!nome) return "file";
  return nome.split('.').pop().toLowerCase();
}

function renderMediaPreview(arquivo) {
  const ext = getExtensao(arquivo.nome);
  const linkComExt = `https://libermedia.app/f/${arquivo.id}.${ext}`;
  
  // VÍDEO
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) {
    return `<video class="w-full aspect-square object-cover" controls><source src="${linkComExt}" type="video/${ext}"></video>`;
  }
  
  // ÁUDIO
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return `
      <div class="w-full aspect-square bg-gradient-to-br from-purple-600 to-pink-600 flex flex-col items-center justify-center p-4">
        <p class="text-5xl mb-2">🎵</p>
        <p class="text-white text-xs mb-2 truncate w-full text-center px-2">${arquivo.nome}</p>
        <audio controls class="w-full" style="max-width: 90%;">
          <source src="${linkComExt}" type="audio/${ext}">
        </audio>
      </div>
    `;
  }
  
  // DOCUMENTOS
  const docIcons = {
    'pdf': '📕',
    'doc': '📘', 'docx': '📘',
    'xls': '📊', 'xlsx': '📊',
    'ppt': '📙', 'pptx': '📙',
    'txt': '📄',
    'zip': '🗜️', 'rar': '🗜️',
    'csv': '📋'
  };
  
  if (docIcons[ext]) {
    return `
      <div class="w-full aspect-square bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center">
        <p class="text-6xl mb-2">${docIcons[ext]}</p>
        <p class="text-xs text-gray-600 dark:text-gray-400 px-4 text-center truncate w-full">${arquivo.nome}</p>
      </div>
    `;
  }
  
  // IMAGEM (padrão)
  return `
    <div class="relative w-full aspect-square overflow-hidden bg-gray-100 dark:bg-gray-900">
      <img src="${linkComExt}" class="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" onclick="openModal(${arquivo.id})" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27%3E%3Cpath stroke=%27%239ca3af%27 stroke-width=%272%27 d=%27M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z%27/%3E%3C/svg%3E'" loading="lazy">
      <button onclick="event.stopPropagation(); copyLinkDiscrete('${linkComExt}')" 
              class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white p-2 rounded-full"
              title="Copiar link">
        🔗
      </button>
    </div>
  `;
}

function renderFiles() {
  const filesDiv = document.getElementById('files');
  const emptyDiv = document.getElementById('empty');
  
  let arquivosFiltrados = todosArquivos;
  if (pastaAtual !== 'Mesa') {
    arquivosFiltrados = todosArquivos.filter(f => f.pasta === pastaAtual);
  }
  
  if (arquivosFiltrados.length === 0) {
    filesDiv.innerHTML = '';
    emptyDiv.classList.remove('hidden');
    return;
  }
  
  emptyDiv.classList.add('hidden');
  
  if (viewMode === 'grade') {
    filesDiv.innerHTML = arquivosFiltrados.map(f => {
      const ext = getExtensao(f.nome);
      const linkComExt = `https://libermedia.app/f/${f.id}.${ext}`;
      return `
      <div class="file-card group bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition overflow-hidden border border-gray-200 dark:border-gray-700">
        ${renderMediaPreview(f)}
        <div class="p-3">
          <h3 class="text-xs text-gray-600 dark:text-gray-400 truncate" title="${f.nome}">${f.nome}</h3>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">${formatSize(f.tamanho)}</p>
          <button onclick="copyLink('${linkComExt}')" class="mt-2 w-full bg-yellow-500 hover:bg-yellow-600 text-white text-sm py-2 rounded">
            Copiar
          </button>
        </div>
      </div>
    `;
    }).join('');
  } else {
    filesDiv.innerHTML = arquivosFiltrados.map(f => {
      const ext = getExtensao(f.nome);
      const linkComExt = `https://libermedia.app/f/${f.id}.${ext}`;
      return `
      <div class="file-card group bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition border border-gray-200 dark:border-gray-700">
        <img src="${linkComExt}" 
             class="cursor-pointer"
             onclick="openModal(${f.id})"
             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27%3E%3Cpath stroke=%27%239ca3af%27 stroke-width=%272%27 d=%27M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z%27/%3E%3C/svg%3E'">
        <div class="file-info">
          <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">${f.nome}</h3>
          <p class="text-xs text-gray-500">${formatSize(f.tamanho)}</p>
        </div>
        <div class="file-actions">
          <button onclick="copyLink('${linkComExt}')" class="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded" title="Copiar link">
            📋
          </button>
          <button onclick="showDetails(${f.id})" class="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded" title="Mais opções">
            ⋮
          </button>
        </div>
      </div>
    `;
    }).join('');
  }
}

function filtrarPasta(pasta) {
  pastaAtual = pasta;
  renderFiles();
}

function criarPasta() {
  const nome = prompt("Nome da nova pasta:");
  if (!nome || nome.trim() === "") return;
  
  const pastaBtn = document.createElement("button");
  pastaBtn.onclick = () => filtrarPasta(nome);
  pastaBtn.className = "w-full text-left p-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded text-gray-900 dark:text-white";
  pastaBtn.innerHTML = `📁 ${nome}`;
  
  const container = document.getElementById("pastasContainer");
  const criarBtn = container.querySelector("button[onclick*='criarPasta']");
  container.insertBefore(pastaBtn, criarBtn);
  
  alert(`Pasta "${nome}" criada!`);
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function copyLink(link) {
  navigator.clipboard.writeText(link);
  alert('Link copiado!');
}

function openModal(fileId) {
  modalArquivos = todosArquivos.filter(f => {
    if (pastaAtual === 'Mesa') return true;
    return f.pasta === pastaAtual;
  });
  currentModalIndex = modalArquivos.findIndex(f => f.id === fileId);
  showModalImage();
}

function showModalImage() {
  if (currentModalIndex < 0 || currentModalIndex >= modalArquivos.length) return;
  
  const arquivo = modalArquivos[currentModalIndex];
  const ext = getExtensao(arquivo.nome);
  document.getElementById('modalImg').src = `https://libermedia.app/f/${arquivo.id}.${ext}`;
  document.getElementById('modalNome').textContent = arquivo.nome;
  document.getElementById('modalInfo').textContent = `${formatSize(arquivo.tamanho)} • ${currentModalIndex + 1}/${modalArquivos.length}`;
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

function prevImage() {
  if (currentModalIndex > 0) {
    currentModalIndex--;
    showModalImage();
  }
}

function nextImage() {
  if (currentModalIndex < modalArquivos.length - 1) {
    currentModalIndex++;
    showModalImage();
  }
}

function showDetails(fileId) {
  const arquivo = todosArquivos.find(f => f.id === fileId);
  if (!arquivo) return;
  
  const ext = getExtensao(arquivo.nome);
  const linkComExt = `https://libermedia.app/f/${arquivo.id}.${ext}`;
  
  const detalhes = `
📄 Nome: ${arquivo.nome}
📦 Tamanho: ${formatSize(arquivo.tamanho)}
📁 Pasta: ${arquivo.pasta}
🔗 Link: ${linkComExt}
  `;
  
  alert(detalhes);
  copyLink(linkComExt);
}

function logout() {
  localStorage.removeItem('libermedia_npub');
  location.href = '/';
}

loadFiles();

// Buscar perfil Nostr
async function buscarPerfilNostr() {
  try {
    const npub = localStorage.getItem('libermedia_npub');
    const res = await fetch('/api/nostr/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ npub }) });
    const data = await res.json();
    if (data.status === 'ok' && data.perfil) {
      const avatarImg = document.querySelector('img[src="/static/img/avatar.png"]');
      if (avatarImg && data.perfil.picture) avatarImg.src = data.perfil.picture;
      document.querySelectorAll('.font-bold').forEach(el => { if (el.textContent.trim() === 'Usuário' && data.perfil.name) el.textContent = data.perfil.name; });
    }
  } catch (err) { console.error('Erro:', err); }
}
setTimeout(buscarPerfilNostr, 500);

// Menu de tamanhos
let tamanhoAtual = localStorage.getItem('grid_size') || 'grande';

function toggleTamanhoMenu() {
  const menu = document.getElementById('menuTamanho');
  menu.classList.toggle('hidden');
}

function setTamanho(tamanho) {
  tamanhoAtual = tamanho;
  localStorage.setItem('grid_size', tamanho);
  document.getElementById('tamanhoAtual').textContent = tamanho.charAt(0).toUpperCase() + tamanho.slice(1);
  document.getElementById('menuTamanho').classList.add('hidden');
  
  // Aplicar classes CSS
  const grid = document.getElementById('arquivosGrid');
  grid.className = 'grid gap-4 ' + (
    tamanho === 'grande' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' :
    tamanho === 'medio' ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6' :
    'grid-cols-3 md:grid-cols-6 lg:grid-cols-10'
  );
}

// Aplicar tamanho salvo ao carregar
setTimeout(() => {
  setTamanho(tamanhoAtual);
}, 100);

// Fechar menu ao clicar fora
document.addEventListener('click', (e) => {
  if (!e.target.closest('#btnTamanho')) {
    document.getElementById('menuTamanho')?.classList.add('hidden');
  }
});

// Atualizar copyLink para aceitar parâmetro
function copyLinkDiscrete(link) {
  navigator.clipboard.writeText(link).then(() => {
    // Toast discreto
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
    toast.textContent = '✓ Link copiado!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  });
}

// Dashboard de Uso
function carregarDashboardUso() {
  const npub = localStorage.getItem('libermedia_npub');
  fetch('/api/uso?npub=' + npub)
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      console.error('Erro ao carregar uso:', data.error);
      return;
    }
    
    // Converter para GB
    const usadoGB = (data.usado / (1024 * 1024 * 1024)).toFixed(2);
    const limiteGB = (data.limite / (1024 * 1024 * 1024)).toFixed(0);
    
    // Atualizar textos
    document.getElementById('usoAtual').textContent = usadoGB + ' GB';
    document.getElementById('usoLimite').textContent = limiteGB + ' GB';
    document.getElementById('usoPercentual').textContent = data.percentual + '%';
    document.getElementById('usoPlano').textContent = data.plano.toUpperCase();
    
    // Atualizar barra de progresso
    const progressBar = document.getElementById('usoProgressBar');
    progressBar.style.width = data.percentual + '%';
    
    // Cores baseadas no percentual
    if (data.percentual < 50) {
      progressBar.className = 'h-4 rounded-full transition-all duration-500 bg-green-500';
    } else if (data.percentual < 80) {
      progressBar.className = 'h-4 rounded-full transition-all duration-500 bg-yellow-500';
    } else if (data.percentual < 95) {
      progressBar.className = 'h-4 rounded-full transition-all duration-500 bg-orange-500';
    } else {
      progressBar.className = 'h-4 rounded-full transition-all duration-500 bg-red-500';
    }
    
    // Breakdown por tipo
    const tiposContainer = document.getElementById('usoTipos');
    tiposContainer.innerHTML = '';
    
    const icones = {
      'image': '🖼️',
      'video': '🎬',
      'audio': '🎵',
      'document': '📄',
      'outros': '📦'
    };
    
    for (const [tipo, info] of Object.entries(data.tipos)) {
      const sizeGB = (info.size / (1024 * 1024 * 1024)).toFixed(2);
      const card = `
        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
          <div class="text-2xl mb-1">${icones[tipo] || '📦'}</div>
          <div class="text-xs font-semibold text-gray-900 dark:text-white">${tipo}</div>
          <div class="text-xs text-gray-600 dark:text-gray-300 mt-1">${info.count} arquivo${info.count !== 1 ? 's' : ''}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">${sizeGB} GB</div>
        </div>
      `;
      tiposContainer.innerHTML += card;
    }
  })
  .catch(err => {
    console.error('Erro ao carregar dashboard de uso:', err);
  });
}

// Adicionar ao DOMContentLoaded existente
const originalLoad = window.onload || (() => {});
window.onload = function() {
  originalLoad();
  setTimeout(carregarDashboardUso, 1000);
};
