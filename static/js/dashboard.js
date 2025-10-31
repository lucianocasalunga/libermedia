// ============================================
// BIBLIOTECA NOSTR (NIP-01) - INLINE
// Movido para dentro do dashboard.js para evitar problemas de cache
// ============================================

// Configuração de relays
const NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band'
];

/**
 * Busca perfil Nostr (kind 0) do usuário via backend
 */
async function buscarPerfilNostr(npub) {
  try {
    console.log('[Nostr] 📡 Buscando perfil via backend para:', npub);

    const response = await fetch('/api/nostr/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npub })
    });

    console.log('[Nostr] 📬 Resposta HTTP:', response.status);

    const data = await response.json();
    console.log('[Nostr] 📦 Dados retornados:', data);

    if (data.status === 'ok' && data.perfil) {
      console.log('[Nostr] ✅ Perfil encontrado com sucesso!');
      return {
        name: data.perfil.name || '',
        picture: data.perfil.picture || '',
        about: data.perfil.about || '',
        display_name: data.perfil.display_name || '',
        banner: data.perfil.banner || '',
        website: data.perfil.website || '',
        nip05: data.perfil.nip05 || '',
        lud16: data.perfil.lud16 || ''
      };
    }

    console.log('[Nostr] ⚠️ Perfil não encontrado (status != ok ou sem perfil)');
    return null;
  } catch (error) {
    console.error('[Nostr] ❌ Erro ao buscar perfil:', error);
    return null;
  }
}

/**
 * Publica perfil Nostr (kind 0) usando backend (funciona em qualquer dispositivo)
 * Fallback para NIP-07 (window.nostr) se não tiver privkey no banco
 */
async function publicarPerfilNostr(profileData) {
  try {
    const npub = localStorage.getItem('libermedia_npub');

    // Tenta publicar via backend primeiro (funciona sem extensão)
    try {
      const response = await fetch('/api/nostr/profile/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npub: npub,
          perfil: profileData
        })
      });

      const data = await response.json();

      if (data.status === 'ok') {
        console.log('[Nostr] ✅ Perfil publicado via backend!', data);
        return {
          success: true,
          event_id: data.event_id,
          relays: data.relays,
          method: 'backend'
        };
      }

      // Se falhou porque não tem privkey, tenta extensão
      if (data.error && data.error.includes('não possui chave privada')) {
        console.log('[Nostr] ⚠️ Sem privkey no banco, tentando extensão...');
        throw new Error('NO_PRIVKEY');
      }

      throw new Error(data.error || 'Erro ao publicar via backend');

    } catch (backendError) {
      // Se não tem privkey no banco, tenta usar extensão
      if (backendError.message === 'NO_PRIVKEY' && window.nostr) {
        console.log('[Nostr] 🔌 Usando extensão Nostr (NIP-07)...');

        const content = JSON.stringify({
          name: profileData.name || '',
          display_name: profileData.display_name || '',
          about: profileData.about || '',
          picture: profileData.picture || '',
          banner: profileData.banner || '',
          website: profileData.website || '',
          nip05: profileData.nip05 || '',
          lud16: profileData.lud16 || ''
        });

        const event = {
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: content
        };

        const signedEvent = await window.nostr.signEvent(event);
        const publishResults = await publicarEventoNostr(signedEvent);

        return {
          success: true,
          event: signedEvent,
          relays: publishResults,
          method: 'extension'
        };
      }

      // Se não tem extensão também, erro final
      throw backendError;
    }

  } catch (error) {
    console.error('[Nostr] ❌ Erro ao publicar perfil:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido'
    };
  }
}

/**
 * Publica evento em múltiplos relays
 */
async function publicarEventoNostr(signedEvent) {
  const results = [];

  for (const relay of NOSTR_RELAYS) {
    try {
      const ws = new WebSocket(relay);

      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Timeout'));
        }, 10000);

        ws.onopen = () => {
          ws.send(JSON.stringify(['EVENT', signedEvent]));
        };

        ws.onmessage = (msg) => {
          clearTimeout(timeout);
          const response = JSON.parse(msg.data);

          if (response[0] === 'OK') {
            resolve({
              relay: relay,
              success: response[1],
              message: response[2] || ''
            });
          } else {
            reject(new Error(response[2] || 'Erro desconhecido'));
          }

          ws.close();
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          reject(error);
        };
      });

      results.push(result);
    } catch (error) {
      results.push({
        relay: relay,
        success: false,
        message: error.message
      });
    }
  }

  return results;
}

/**
 * Sincroniza perfil: busca do Nostr e salva localmente
 */
async function sincronizarPerfilNostr(npub) {
  try {
    console.log('[SyncNostr] 🔄 Iniciando sincronização para:', npub);
    console.log('[SyncNostr] 📞 Chamando buscarPerfilNostr()...');

    const perfil = await buscarPerfilNostr(npub);

    console.log('[SyncNostr] 📥 Resultado de buscarPerfilNostr():', perfil);

    if (perfil) {
      console.log('[SyncNostr] ✅ Perfil válido, salvando no localStorage...');
      localStorage.setItem('libermedia_nome', perfil.name || perfil.display_name || '');
      localStorage.setItem('libermedia_display_name', perfil.display_name || '');
      localStorage.setItem('libermedia_avatar', perfil.picture || '');
      localStorage.setItem('libermedia_about', perfil.about || '');
      localStorage.setItem('libermedia_banner', perfil.banner || '');
      localStorage.setItem('libermedia_website', perfil.website || '');
      localStorage.setItem('libermedia_nip05', perfil.nip05 || '');
      localStorage.setItem('libermedia_lud16', perfil.lud16 || '');
      localStorage.setItem('libermedia_last_sync', Date.now().toString());

      console.log('[SyncNostr] 💾 Salvo no localStorage com sucesso!');
      return perfil;
    }

    console.log('[SyncNostr] ⚠️ Perfil null, retornando null');
    return null;
  } catch (error) {
    console.error('[SyncNostr] ❌ ERRO na sincronização:', error);
    return null;
  }
}

/**
 * Verifica se perfil está desatualizado (mais de 1 hora)
 */
function precisaSincronizar() {
  const lastSync = localStorage.getItem('libermedia_last_sync');

  if (!lastSync) return true;

  const umahora = 60 * 60 * 1000;
  const tempoDecorrido = Date.now() - parseInt(lastSync);

  return tempoDecorrido > umahora;
}

// ============================================
// FIM BIBLIOTECA NOSTR
// ============================================

const npub = localStorage.getItem('libermedia_npub');
if (!npub) { alert('Faça login!'); location.href = '/'; }

document.getElementById('npubShort').textContent = npub.slice(0, 20) + '...';

let todosArquivos = [];
let pastaAtual = 'Mesa';
let viewMode = 'grade';
let tipoAtual = 'todos';
let termoBusca = '';
let ordenacaoAtual = 'data_desc'; // padrão: mais recente
let currentModalIndex = 0;
let modalArquivos = [];
let arquivosSelecionados = [];
let modoSelecao = false;

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

// GERENCIAMENTO DE PASTAS
async function loadPastas() {
  try {
    // Busca pastas do backend
    const res = await fetch(`/api/pastas?npub=${npub}`);
    const data = await res.json();

    if (data.status === 'ok') {
      let pastas = data.pastas || [];

      // Merge com pastas do localStorage (pastas criadas mas sem arquivos ainda)
      const pastasLocal = JSON.parse(localStorage.getItem('libermedia_pastas_' + npub) || '[]');
      pastasLocal.forEach(p => {
        if (!pastas.includes(p)) pastas.push(p);
      });

      // Atualiza localStorage com lista completa
      localStorage.setItem('libermedia_pastas_' + npub, JSON.stringify(pastas));

      renderPastas(pastas);
    }
  } catch (err) {
    console.error('Erro ao carregar pastas:', err);
    // Fallback: usa localStorage
    const pastasLocal = JSON.parse(localStorage.getItem('libermedia_pastas_' + npub) || '[]');
    renderPastas(pastasLocal);
  }
}

function renderPastas(pastas) {
  const container = document.getElementById('pastasContainer');

  // Ícones SVG do Heroicons
  const icons = {
    folder: '<svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"/></svg>',
    photo: '<svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>',
    film: '<svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M19.125 12h1.5m0 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h1.5m14.25 0h1.5"/></svg>',
    document: '<svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>',
    music: '<svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>',
    plus: '<svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15"/></svg>'
  };

  // Pastas padrão (hardcoded)
  const pastasDefault = [
    { nome: 'Mesa', icon: 'folder' },
    { nome: 'Photos', icon: 'photo' },
    { nome: 'Videos', icon: 'film' },
    { nome: 'Docs', icon: 'document' },
    { nome: 'Audio', icon: 'music' }
  ];

  // Limpa container
  container.innerHTML = '';

  // Renderiza pastas padrão
  pastasDefault.forEach(p => {
    const btn = document.createElement('button');
    btn.onclick = () => filtrarPasta(p.nome);
    btn.className = 'w-full text-left p-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-900 dark:text-white flex items-center transition-colors';
    btn.innerHTML = `${icons[p.icon]}${p.nome}`;
    container.appendChild(btn);
  });

  // Renderiza pastas customizadas
  pastas.forEach(nome => {
    // Não duplica pastas padrão
    if (pastasDefault.find(p => p.nome === nome)) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'relative group w-full';
    wrapper.style.display = 'block';

    const btn = document.createElement('button');
    btn.onclick = () => filtrarPasta(nome);
    btn.className = 'w-full text-left p-2 pr-8 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-900 dark:text-white flex items-center transition-colors';
    btn.innerHTML = `${icons.folder}${nome}`;

    // Botão de menu (três pontinhos)
    const menuBtn = document.createElement('button');
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      togglePastaMenu(nome, e);
    };
    menuBtn.className = 'absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded p-1 text-xs z-10';
    menuBtn.innerHTML = '⋮';

    wrapper.appendChild(btn);
    wrapper.appendChild(menuBtn);
    container.appendChild(wrapper);
  });

  // Botão "Criar Pasta"
  const btnCriar = document.createElement('button');
  btnCriar.onclick = criarPasta;
  btnCriar.className = 'w-full text-left p-2 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded font-bold mt-2 flex items-center transition-colors';
  btnCriar.innerHTML = `${icons.plus}Criar Pasta`;
  container.appendChild(btnCriar);
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

// Ícones SVG para ações dos cards
const cardIcons = {
  link: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>',
  menu: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"/></svg>'
};

function renderMediaPreview(arquivo) {
  const ext = getExtensao(arquivo.nome);
  const linkComExt = `https://libermedia.app/f/${arquivo.id}.${ext}`;

  // VÍDEO
  const videoMimeTypes = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo'
  };

  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) {
    return `
      <div class="relative w-full aspect-square overflow-hidden bg-gray-100 dark:bg-gray-900">
        <video class="w-full h-full object-cover" controls><source src="${linkComExt}" type="${videoMimeTypes[ext]}"></video>
        <button onclick="event.stopPropagation(); copyLinkDiscrete('${linkComExt}')"
                class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white p-2 rounded-full"
                title="Copiar link">
          ${cardIcons.link}
        </button>
        <button onclick="event.stopPropagation(); toggleFileMenu(${arquivo.id})"
                class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white p-2 rounded-full"
                title="Mais opções">${cardIcons.menu}</button>
      </div>
    `;
  }

  // ÁUDIO
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return `
      <div class="relative w-full bg-gradient-to-br from-purple-600 to-pink-600 overflow-hidden flex flex-col">
        <div class="w-full aspect-square flex items-center justify-center flex-shrink-0">
          <svg class="text-white" style="width: 80px; height: 80px;" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
        </div>
        <div class="w-full bg-black/20 px-3 py-2">
          <audio controls class="w-full" style="height: 32px;">
            <source src="${linkComExt}" type="audio/${ext}">
          </audio>
        </div>
        <button onclick="event.stopPropagation(); copyLinkDiscrete('${linkComExt}')"
                class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white p-2 rounded-full"
                title="Copiar link">
          ${cardIcons.link}
        </button>
        <button onclick="event.stopPropagation(); toggleFileMenu(${arquivo.id})"
                class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white p-2 rounded-full"
                title="Mais opções">${cardIcons.menu}</button>
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
    'md': '📝',
    'zip': '🗜️', 'rar': '🗜️',
    'csv': '📋'
  };

  if (docIcons[ext]) {
    return `
      <div class="relative w-full aspect-square bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center">
        <p class="text-6xl mb-2">${docIcons[ext]}</p>
        <p class="text-xs text-gray-600 dark:text-gray-400 px-4 text-center truncate w-full">${arquivo.nome}</p>
        <button onclick="event.stopPropagation(); copyLinkDiscrete('${linkComExt}')"
                class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white p-2 rounded-full"
                title="Copiar link">
          ${cardIcons.link}
        </button>
        <button onclick="event.stopPropagation(); toggleFileMenu(${arquivo.id})"
                class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white p-2 rounded-full"
                title="Mais opções">${cardIcons.menu}</button>
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
        ${cardIcons.link}
      </button>
      <button onclick="event.stopPropagation(); toggleFileMenu(${arquivo.id})"
              class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white p-2 rounded-full"
              title="Mais opções">${cardIcons.menu}</button>
    </div>
  `;
}

// Debouncing para evitar renderizações excessivas
let renderTimeout = null;
function scheduleRender() {
  if (renderTimeout) clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => renderFiles(), 50);
}

function renderFiles() {
  const filesDiv = document.getElementById('files');
  const emptyDiv = document.getElementById('empty');

  let arquivosFiltrados = todosArquivos;

  // Filtro por pasta
  if (pastaAtual !== 'Mesa') {
    arquivosFiltrados = arquivosFiltrados.filter(f => f.pasta === pastaAtual);
  }

  // Filtro por tipo
  if (tipoAtual !== 'todos') {
    arquivosFiltrados = arquivosFiltrados.filter(f => f.tipo === tipoAtual);
  }

  // Filtro por busca (nome do arquivo)
  if (termoBusca.trim() !== '') {
    const termo = termoBusca.toLowerCase();
    arquivosFiltrados = arquivosFiltrados.filter(f =>
      f.nome.toLowerCase().includes(termo)
    );
  }

  // Ordenação
  if (ordenacaoAtual === 'data_desc') {
    arquivosFiltrados.sort((a, b) => b.created_at - a.created_at);
  } else if (ordenacaoAtual === 'data_asc') {
    arquivosFiltrados.sort((a, b) => a.created_at - b.created_at);
  } else if (ordenacaoAtual === 'nome_asc') {
    arquivosFiltrados.sort((a, b) => a.nome.localeCompare(b.nome));
  } else if (ordenacaoAtual === 'nome_desc') {
    arquivosFiltrados.sort((a, b) => b.nome.localeCompare(a.nome));
  } else if (ordenacaoAtual === 'tamanho_desc') {
    arquivosFiltrados.sort((a, b) => b.tamanho - a.tamanho);
  } else if (ordenacaoAtual === 'tamanho_asc') {
    arquivosFiltrados.sort((a, b) => a.tamanho - b.tamanho);
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
      const isSelected = arquivosSelecionados.includes(f.id);
      return `
      <div class="file-card group bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition overflow-hidden border ${isSelected ? 'border-yellow-500 border-2' : 'border-gray-200 dark:border-gray-700'} relative">
        ${modoSelecao ? `<input type="checkbox"
               onchange="toggleSelection(${f.id})"
               ${isSelected ? 'checked' : ''}
               class="absolute top-2 left-2 z-10 w-5 h-5 cursor-pointer accent-yellow-500"
               onclick="event.stopPropagation()">` : ''}
        ${renderMediaPreview(f)}
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

  // Destaca botão ativo visualmente
  const container = document.getElementById("pastasContainer");
  const botoes = container.querySelectorAll("button");
  botoes.forEach(btn => {
    if (btn.textContent.includes(pasta)) {
      btn.className = "w-full text-left p-2 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded font-semibold";
    } else if (btn.textContent.includes("Criar Pasta")) {
      btn.className = "w-full text-left p-2 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded font-bold mt-2";
    } else {
      btn.className = "w-full text-left p-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded text-gray-900 dark:text-white";
    }
  });

  renderFiles();
}

function filtrarTipo(tipo) {
  tipoAtual = tipo;

  // Visual feedback nos botões
  document.querySelectorAll('.tipo-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tipo === tipo);
  });

  scheduleRender(); // Usa debouncing para filtro rápido
}

function buscarArquivos(termo) {
  termoBusca = termo;
  scheduleRender(); // Usa debouncing para busca em tempo real
}

// ORDENAÇÃO
function toggleOrdenacaoMenu() {
  const menu = document.getElementById('menuOrdenacao');
  menu.classList.toggle('hidden');
}

function setOrdenacao(tipo) {
  ordenacaoAtual = tipo;

  const labels = {
    'data_desc': 'Mais Recente',
    'data_asc': 'Mais Antigo',
    'nome_asc': 'Nome (A-Z)',
    'nome_desc': 'Nome (Z-A)',
    'tamanho_desc': 'Maior Tamanho',
    'tamanho_asc': 'Menor Tamanho'
  };

  const icons = {
    'data_desc': '⏰',
    'data_asc': '⏳',
    'nome_asc': '🔤',
    'nome_desc': '🔡',
    'tamanho_desc': '📦',
    'tamanho_asc': '📄'
  };

  document.getElementById('ordenacaoAtual').textContent = labels[tipo];
  const mobileIcon = document.getElementById('ordenacaoAtualMobile');
  if (mobileIcon) mobileIcon.textContent = icons[tipo];

  document.getElementById('menuOrdenacao').classList.add('hidden');

  renderFiles();
}

// SELEÇÃO MÚLTIPLA
function toggleModoSelecao() {
  modoSelecao = !modoSelecao;

  if (!modoSelecao) {
    // Ao desativar modo seleção, limpa seleções
    arquivosSelecionados = [];
  }

  updateSelectionUI();
  renderFiles();

  // Fecha o menu
  document.getElementById('menuSelecao')?.classList.add('hidden');
}

function toggleSelection(fileId) {
  const index = arquivosSelecionados.indexOf(fileId);
  if (index === -1) {
    arquivosSelecionados.push(fileId);
  } else {
    arquivosSelecionados.splice(index, 1);
  }
  updateSelectionUI();
  renderFiles();
}

function selectAll() {
  // Ativa modo seleção se não estiver ativo
  if (!modoSelecao) {
    modoSelecao = true;
  }

  let arquivosFiltrados = todosArquivos;
  if (pastaAtual !== 'Mesa') {
    arquivosFiltrados = arquivosFiltrados.filter(f => f.pasta === pastaAtual);
  }
  if (tipoAtual !== 'todos') {
    arquivosFiltrados = arquivosFiltrados.filter(f => f.tipo === tipoAtual);
  }
  arquivosSelecionados = arquivosFiltrados.map(f => f.id);
  updateSelectionUI();
  renderFiles();

  // Fecha o menu
  document.getElementById('menuSelecao')?.classList.add('hidden');
}

function deselectAll() {
  arquivosSelecionados = [];
  updateSelectionUI();
  renderFiles();

  // Fecha o menu
  document.getElementById('menuSelecao')?.classList.add('hidden');
}

function toggleSelecaoMenu() {
  const menu = document.getElementById('menuSelecao');
  menu.classList.toggle('hidden');
}

function updateSelectionUI() {
  const count = arquivosSelecionados.length;
  const btnDelete = document.getElementById('btnDeleteSelected');
  const countSpan = document.getElementById('selectedCount');

  // Só mostra botão deletar se estiver em modo seleção e houver seleções
  if (modoSelecao && count > 0) {
    btnDelete?.classList.remove('hidden');
    if (countSpan) countSpan.textContent = count;
  } else {
    btnDelete?.classList.add('hidden');
  }
}

function confirmDeleteSelected() {
  if (arquivosSelecionados.length === 0) return;

  const modal = document.getElementById('confirmBatchDeleteModal');
  const count = document.getElementById('batchDeleteCount');
  count.textContent = arquivosSelecionados.length;
  modal.classList.remove('hidden');
}

function closeBatchDeleteModal() {
  document.getElementById('confirmBatchDeleteModal').classList.add('hidden');
}

async function executeBatchDelete() {
  const npub = localStorage.getItem('libermedia_npub');
  const total = arquivosSelecionados.length;
  let sucesso = 0;
  let erros = 0;

  for (const fileId of arquivosSelecionados) {
    try {
      const res = await fetch(`/api/arquivo/delete/${fileId}?npub=${npub}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'ok') {
        sucesso++;
      } else {
        erros++;
      }
    } catch (err) {
      erros++;
    }
  }

  closeBatchDeleteModal();
  arquivosSelecionados = [];
  updateSelectionUI();
  loadFiles();

  if (erros === 0) {
    showToast(`✓ ${sucesso} arquivo${sucesso > 1 ? 's' : ''} deletado${sucesso > 1 ? 's' : ''} com sucesso!`, 'success');
  } else {
    showToast(`⚠️ ${sucesso} deletados, ${erros} erro${erros > 1 ? 's' : ''}`, 'error');
  }
}

function criarPasta() {
  const nome = prompt("Nome da nova pasta:");
  if (!nome || nome.trim() === "") return;

  // Salva em localStorage
  const pastasLocal = JSON.parse(localStorage.getItem('libermedia_pastas_' + npub) || '[]');
  if (!pastasLocal.includes(nome.trim())) {
    pastasLocal.push(nome.trim());
    localStorage.setItem('libermedia_pastas_' + npub, JSON.stringify(pastasLocal));
  }

  // Recarrega e renderiza pastas
  loadPastas().then(() => {
    // Seleciona a pasta recém-criada
    filtrarPasta(nome.trim());
    alert(`Pasta "${nome}" criada!`);
  });
}

// MENU CONTEXTUAL DE PASTAS
let currentPastaMenu = null;

function togglePastaMenu(nomePasta, event) {
  closePastaMenu(); // Fecha menu anterior

  const menu = document.createElement('div');
  menu.id = 'pastaMenuContextual';
  menu.className = 'fixed bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-600 py-2 min-w-[180px] z-50';
  menu.style.left = event.clientX + 'px';
  menu.style.top = event.clientY + 'px';

  menu.innerHTML = `
    <button onclick="renomearPasta('${nomePasta}')" class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white flex items-center gap-2">
      <span>✏️</span> Renomear
    </button>
    <button onclick="deletarPasta('${nomePasta}')" class="w-full text-left px-4 py-2 hover:bg-red-100 dark:hover:bg-red-900 text-red-600 dark:text-red-400 flex items-center gap-2">
      <span>🗑️</span> Deletar
    </button>
  `;

  document.body.appendChild(menu);
  currentPastaMenu = menu;

  // Fecha ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', closePastaMenu, { once: true });
  }, 100);
}

function closePastaMenu() {
  if (currentPastaMenu) {
    currentPastaMenu.remove();
    currentPastaMenu = null;
  }
}

async function renomearPasta(pastaAntiga) {
  closePastaMenu();

  const pastaNova = prompt(`Renomear pasta "${pastaAntiga}" para:`, pastaAntiga);
  if (!pastaNova || pastaNova.trim() === '' || pastaNova === pastaAntiga) return;

  try {
    const res = await fetch(`/api/pasta/rename?npub=${npub}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pasta_antiga: pastaAntiga, pasta_nova: pastaNova.trim() })
    });

    const data = await res.json();

    if (data.status === 'ok') {
      showToast(`✓ Pasta renomeada! ${data.arquivos_atualizados} arquivo(s) atualizados`, 'success');

      // Atualiza localStorage
      const pastasLocal = JSON.parse(localStorage.getItem('libermedia_pastas_' + npub) || '[]');
      const index = pastasLocal.indexOf(pastaAntiga);
      if (index !== -1) {
        pastasLocal[index] = pastaNova.trim();
        localStorage.setItem('libermedia_pastas_' + npub, JSON.stringify(pastasLocal));
      }

      // Recarrega interface
      loadPastas();
      loadFiles();

      // Se estava na pasta antiga, muda para a nova
      if (pastaAtual === pastaAntiga) {
        filtrarPasta(pastaNova.trim());
      }
    } else {
      showToast('❌ Erro: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('❌ Erro: ' + err.message, 'error');
  }
}

async function deletarPasta(nomePasta) {
  closePastaMenu();

  // Pastas padrão não podem ser deletadas
  const pastasProtegidas = ['Mesa', 'Photos', 'Videos', 'Docs', 'Audio'];
  if (pastasProtegidas.includes(nomePasta)) {
    showToast('❌ Pastas padrão não podem ser deletadas', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/pasta/delete?npub=${npub}&pasta=${nomePasta}`, {
      method: 'DELETE'
    });

    const data = await res.json();

    if (data.status === 'ok') {
      // Remove do localStorage
      const pastasLocal = JSON.parse(localStorage.getItem('libermedia_pastas_' + npub) || '[]');
      const novaLista = pastasLocal.filter(p => p !== nomePasta);
      localStorage.setItem('libermedia_pastas_' + npub, JSON.stringify(novaLista));

      showToast('✓ Pasta deletada com sucesso!', 'success');

      // Recarrega interface
      loadPastas();

      // Se estava na pasta deletada, volta pra Mesa
      if (pastaAtual === nomePasta) {
        filtrarPasta('Mesa');
      }
    } else {
      showToast('❌ ' + data.error, 'error');
    }
  } catch (err) {
    showToast('❌ Erro: ' + err.message, 'error');
  }
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

// Navegação por teclado (setas ← →)
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('modal');
  if (!modal.classList.contains('hidden')) {
    if (e.key === 'ArrowLeft') prevImage();
    else if (e.key === 'ArrowRight') nextImage();
    else if (e.key === 'Escape') closeModal();
  }
});

// Swipe gestures para mobile
let touchStartX = 0;
let touchEndX = 0;
const modalElement = document.getElementById('modal');

modalElement.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
}, false);

modalElement.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  const swipeThreshold = 50;
  if (touchEndX < touchStartX - swipeThreshold) nextImage();
  if (touchEndX > touchStartX + swipeThreshold) prevImage();
}, false);

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
  const npub = localStorage.getItem('libermedia_npub');

  // Remove todas as chaves relacionadas ao libermedia
  localStorage.removeItem('libermedia_npub');
  localStorage.removeItem('libermedia_pastas_' + npub);
  localStorage.removeItem('grid_size');

  // Limpa seleções em memória
  arquivosSelecionados = [];
  todosArquivos = [];

  // Redireciona para login
  location.href = '/';
}

// Inicialização
loadPastas().then(() => {
  filtrarPasta('Mesa'); // Destaca pasta inicial
});
loadFiles();

// Atualizar avatar e nome na interface (executa ao carregar página)
async function atualizarAvatarNostr() {
  try {
    const npub = localStorage.getItem('libermedia_npub');
    const res = await fetch('/api/nostr/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ npub }) });
    if (!res.ok) { console.warn("Perfil Nostr não disponível"); return; }
    const data = await res.json();
    if (data.status === 'ok' && data.perfil) {
      const avatarImg = document.querySelector('img[src="/static/img/avatar.png"]');
      if (avatarImg && data.perfil.picture) avatarImg.src = data.perfil.picture;
      document.querySelectorAll('.font-bold').forEach(el => { if (el.textContent.trim() === 'Usuário' && data.perfil.name) el.textContent = data.perfil.name; });
    }
  } catch (err) { console.error('Erro:', err); }
}
setTimeout(atualizarAvatarNostr, 500);

// Menu de tamanhos
let tamanhoAtual = localStorage.getItem('grid_size') || 'grande';

function toggleTamanhoMenu() {
  const menu = document.getElementById('menuTamanho');
  menu.classList.toggle('hidden');
}

function setTamanho(tamanho) {
  tamanhoAtual = tamanho;
  localStorage.setItem('grid_size', tamanho);

  const labels = {
    'grande': 'Grande',
    'medio': 'Médio',
    'pequeno': 'Pequeno'
  };

  const icons = {
    'grande': '📏',
    'medio': '📐',
    'pequeno': '📌'
  };

  document.getElementById('tamanhoAtual').textContent = labels[tamanho];
  const mobileIcon = document.getElementById('tamanhoAtualMobile');
  if (mobileIcon) mobileIcon.textContent = icons[tamanho];

  document.getElementById('menuTamanho').classList.add('hidden');

  // Aplicar classes CSS
  const grid = document.getElementById('files');
    if (!grid) { console.warn("Grid não encontrado"); return; }
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

// Fechar menus ao clicar fora
document.addEventListener('click', (e) => {
  if (!e.target.closest('#btnTamanho')) {
    document.getElementById('menuTamanho')?.classList.add('hidden');
  }
  if (!e.target.closest('#btnOrdenacao')) {
    document.getElementById('menuOrdenacao')?.classList.add('hidden');
  }
  if (!e.target.closest('#btnSelecao')) {
    document.getElementById('menuSelecao')?.classList.add('hidden');
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

// Menu ⋮ Funções
let currentFileId = null;

function toggleFileMenu(fileId) {
  currentFileId = fileId;
  const modal = document.getElementById('fileMenuModal');
  const content = document.getElementById('fileMenuContent');
  const button = event.target.getBoundingClientRect();

  content.style.top = (button.top + button.height) + 'px';
  content.style.left = (button.left - 200 + button.width) + 'px';

  modal.classList.remove('hidden');
}

function closeFileMenu() {
  document.getElementById('fileMenuModal').classList.add('hidden');
}

function copyFileLink() {
  const arquivo = todosArquivos.find(f => f.id === currentFileId);
  const ext = getExtensao(arquivo.nome);
  const link = `https://libermedia.app/f/${arquivo.id}.${ext}`;
  copyLinkDiscrete(link);
  closeFileMenu();
}

function showFileDetails() {
  const arquivo = todosArquivos.find(f => f.id === currentFileId);
  const ext = getExtensao(arquivo.nome);
  const link = `https://libermedia.app/f/${arquivo.id}.${ext}`;

  alert(`📄 Nome: ${arquivo.nome}\n📦 Tamanho: ${formatSize(arquivo.tamanho)}\n📁 Pasta: ${arquivo.pasta}\n🔗 Link: ${link}`);
  closeFileMenu();
}

function confirmDelete() {
  closeFileMenu();
  document.getElementById('confirmModal').classList.remove('hidden');
}

// COMPARTILHAR PUBLICAMENTE
let currentShareUrl = '';

function openShareModal() {
  closeFileMenu();
  document.getElementById('shareModal').classList.remove('hidden');
}

function closeShareModal() {
  document.getElementById('shareModal').classList.add('hidden');
}

function closeShareLinkModal() {
  document.getElementById('shareLinkModal').classList.add('hidden');
}

async function gerarLinkPublico(duracao) {
  const npub = localStorage.getItem('libermedia_npub');

  try {
    const res = await fetch(`/api/arquivo/share/${currentFileId}?npub=${npub}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duracao: duracao })
    });

    const data = await res.json();

    if (data.status === 'ok') {
      closeShareModal();

      // Mostra modal com link gerado
      currentShareUrl = data.url;
      document.getElementById('shareLinkUrl').textContent = data.url;

      // Calcula tempo de expiração
      const expiraDate = new Date(data.expira_em * 1000);
      const agora = new Date();
      const diffMs = expiraDate - agora;
      const diffHoras = Math.round(diffMs / 1000 / 60 / 60);

      let expiraTexto = '';
      if (diffHoras < 24) {
        expiraTexto = `${diffHoras} hora${diffHoras > 1 ? 's' : ''}`;
      } else {
        const dias = Math.floor(diffHoras / 24);
        expiraTexto = `${dias} dia${dias > 1 ? 's' : ''}`;
      }

      document.getElementById('shareExpira').textContent = expiraTexto;
      document.getElementById('shareLinkModal').classList.remove('hidden');

      showToast('✓ Link público gerado com sucesso!', 'success');
    } else {
      showToast('❌ Erro: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('❌ Erro: ' + err.message, 'error');
  }
}

function copyShareLink() {
  navigator.clipboard.writeText(currentShareUrl).then(() => {
    showToast('✓ Link copiado para a área de transferência!', 'success');
  });
}

// MOVER ARQUIVO
function openMoveModal() {
  closeFileMenu();

  // Carrega pastas disponíveis
  const container = document.getElementById('movePastasContainer');
  container.innerHTML = '';

  // Pastas padrão
  const pastasDefault = ['Mesa', 'Photos', 'Videos', 'Docs', 'Audio'];

  // Pastas customizadas do localStorage
  const pastasLocal = JSON.parse(localStorage.getItem('libermedia_pastas_' + npub) || '[]');

  // Combina tudo
  const todasPastas = [...new Set([...pastasDefault, ...pastasLocal])];

  // Renderiza botões
  todasPastas.forEach(pasta => {
    const btn = document.createElement('button');
    btn.onclick = () => executarMovimento(pasta);
    btn.className = 'w-full text-left px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-yellow-100 dark:hover:bg-yellow-900 rounded-lg text-gray-900 dark:text-white transition-colors';
    btn.innerHTML = `📁 ${pasta}`;
    container.appendChild(btn);
  });

  document.getElementById('moveModal').classList.remove('hidden');
}

function closeMoveModal() {
  document.getElementById('moveModal').classList.add('hidden');
}

async function executarMovimento(novaPasta) {
  const npub = localStorage.getItem('libermedia_npub');

  try {
    const res = await fetch(`/api/arquivo/move/${currentFileId}?npub=${npub}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pasta: novaPasta })
    });

    const data = await res.json();

    if (data.status === 'ok') {
      showToast(`✓ Arquivo movido para ${novaPasta}!`, 'success');
      closeMoveModal();
      loadFiles(); // Recarrega lista
    } else {
      showToast('❌ Erro ao mover: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('❌ Erro ao mover: ' + err.message, 'error');
  }
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.add('hidden');
}

function executeDelete() {
  const npub = localStorage.getItem('libermedia_npub');
  fetch(`/api/arquivo/delete/${currentFileId}?npub=${npub}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(data => {
      if (data.status === 'ok') {
        showToast('✓ Arquivo deletado com sucesso!', 'success');
        closeConfirmModal();
        loadFiles(); // Recarrega lista
      } else {
        showToast('❌ Erro ao deletar: ' + data.error, 'error');
      }
    })
    .catch(err => {
      showToast('❌ Erro ao deletar: ' + err.message, 'error');
    });
}

function showToast(message, type) {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Dashboard de Uso
function carregarDashboardUso() {
  // Verifica se o bloco de uso está habilitado no HTML
  if (!document.getElementById('dashboardUso')) {
    console.log('[Dashboard] Bloco de uso desabilitado');
    return;
  }

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
        <div class="bg-gray-50 dark:bg-gray-700 rounded text-center" style="width: 116px; padding: 6px; overflow: hidden; box-sizing: border-box;">
          <div style="font-size: 14px; line-height: 14px; margin-bottom: 4px;">${icones[tipo] || '📦'}</div>
          <div class="text-xs font-semibold text-gray-900 dark:text-white truncate">${tipo}</div>
          <div class="text-xs text-gray-600 dark:text-gray-300">${info.count} arq</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">${sizeGB}GB</div>
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

// Mobile: Toggle sidebar ao tocar
if (window.innerWidth <= 1024) {
  const sidebar = document.querySelector('.flex.flex-col.lg\\:grid.lg\\:grid-cols-4 > div:first-child');
  if (sidebar) {
    sidebar.addEventListener('click', function() {
      this.classList.toggle('expanded');
    });
  }
}

// CONFIGURAÇÕES NOSTR (NIP-01)
function openConfigModal() {
  // Carrega valores salvos do localStorage
  document.getElementById('configNome').value = localStorage.getItem('libermedia_nome') || '';
  document.getElementById('configDisplayName').value = localStorage.getItem('libermedia_display_name') || '';
  document.getElementById('configAvatar').value = localStorage.getItem('libermedia_avatar') || '';
  document.getElementById('configAbout').value = localStorage.getItem('libermedia_about') || '';
  document.getElementById('configBanner').value = localStorage.getItem('libermedia_banner') || '';
  document.getElementById('configWebsite').value = localStorage.getItem('libermedia_website') || '';
  document.getElementById('configNip05').value = localStorage.getItem('libermedia_nip05') || '';
  document.getElementById('configLud16').value = localStorage.getItem('libermedia_lud16') || '';

  // Atualiza status de sincronização
  atualizarStatusSync();

  document.getElementById('configModal').classList.remove('hidden');
}

function closeConfigModal() {
  document.getElementById('configModal').classList.add('hidden');
}

async function saveConfig() {
  const nome = document.getElementById('configNome').value.trim();

  if (!nome) {
    showToast('⚠️ Nome é obrigatório', 'error');
    return;
  }

  // Coleta todos os dados do perfil
  const profileData = {
    name: nome,
    display_name: document.getElementById('configDisplayName').value.trim(),
    picture: document.getElementById('configAvatar').value.trim(),
    about: document.getElementById('configAbout').value.trim(),
    banner: document.getElementById('configBanner').value.trim(),
    website: document.getElementById('configWebsite').value.trim(),
    nip05: document.getElementById('configNip05').value.trim(),
    lud16: document.getElementById('configLud16').value.trim()
  };

  // Salva no localStorage
  localStorage.setItem('libermedia_nome', profileData.name);
  localStorage.setItem('libermedia_display_name', profileData.display_name);
  localStorage.setItem('libermedia_avatar', profileData.picture);
  localStorage.setItem('libermedia_about', profileData.about);
  localStorage.setItem('libermedia_banner', profileData.banner);
  localStorage.setItem('libermedia_website', profileData.website);
  localStorage.setItem('libermedia_nip05', profileData.nip05);
  localStorage.setItem('libermedia_lud16', profileData.lud16);

  // Publica no Nostr usando NIP-07
  showToast('📡 Publicando no Nostr...', 'info');

  const result = await publicarPerfilNostr(profileData);

  if (result.success) {
    localStorage.setItem('libermedia_last_sync', Date.now().toString());
    showToast('✓ Perfil salvo e publicado no Nostr!', 'success');

    // Atualiza UI
    atualizarPerfilUI(profileData);

    closeConfigModal();
  } else {
    showToast('⚠️ Erro ao publicar: ' + result.error, 'error');

    // Mesmo com erro, salva localmente
    showToast('💾 Salvo localmente', 'info');
    atualizarPerfilUI(profileData);
  }
}

async function sincronizarPerfil() {
  const npub = localStorage.getItem('libermedia_npub');

  console.log('[Dashboard] 🔍 Iniciando sincronização para npub:', npub);

  if (!npub) {
    showToast('⚠️ NPub não encontrado', 'error');
    return;
  }

  showToast('🔄 Sincronizando perfil...', 'info');

  console.log('[Dashboard] 📡 Chamando sincronizarPerfilNostr...');
  const perfil = await sincronizarPerfilNostr(npub);
  console.log('[Dashboard] 📥 Perfil retornado:', perfil);

  if (perfil) {
    // Atualiza campos do modal
    console.log('[Dashboard] ✅ Perfil encontrado! Atualizando campos do modal...');
    document.getElementById('configNome').value = perfil.name || '';
    document.getElementById('configDisplayName').value = perfil.display_name || '';
    document.getElementById('configAvatar').value = perfil.picture || '';
    document.getElementById('configAbout').value = perfil.about || '';
    document.getElementById('configBanner').value = perfil.banner || '';
    document.getElementById('configWebsite').value = perfil.website || '';
    document.getElementById('configNip05').value = perfil.nip05 || '';
    document.getElementById('configLud16').value = perfil.lud16 || '';

    console.log('[Dashboard] 💾 Campos atualizados com sucesso');

    // Atualiza UI
    atualizarPerfilUI(perfil);

    // Atualiza status
    atualizarStatusSync();

    showToast('✓ Perfil sincronizado!', 'success');
  } else {
    console.log('[Dashboard] ❌ Perfil NÃO foi encontrado (null retornado)');
    showToast('⚠️ Perfil não encontrado no Nostr', 'error');
  }
}

function atualizarStatusSync() {
  const precisaSync = precisaSincronizar();
  const syncIcon = document.getElementById('syncIcon');
  const syncText = document.getElementById('syncText');
  const lastSync = localStorage.getItem('libermedia_last_sync');

  if (!lastSync) {
    syncIcon.textContent = '⚠️';
    syncText.textContent = 'Nunca sincronizado';
  } else if (precisaSync) {
    syncIcon.textContent = '🟡';
    syncText.textContent = 'Desatualizado (sincronize novamente)';
  } else {
    syncIcon.textContent = '✅';
    const tempo = Math.floor((Date.now() - parseInt(lastSync)) / 60000);
    syncText.textContent = `Sincronizado há ${tempo} min`;
  }
}

function atualizarPerfilUI(perfil) {
  // Atualiza nome na sidebar
  const nomeExibicao = perfil.display_name || perfil.name || 'Usuário';
  document.querySelectorAll('.font-bold').forEach(el => {
    if (el.textContent.trim() === 'Usuário' || el.classList.contains('user-name')) {
      el.textContent = nomeExibicao;
      el.classList.add('user-name');
    }
  });

  // Atualiza avatar
  if (perfil.picture) {
    const avatarImg = document.querySelector('img[src="/static/img/avatar.png"], img[src^="https://"]');
    if (avatarImg) avatarImg.src = perfil.picture;
  }
}

// Carrega nome e avatar salvos
const nomeSalvo = localStorage.getItem('libermedia_nome');
const avatarSalvo = localStorage.getItem('libermedia_avatar');

if (nomeSalvo) {
  setTimeout(() => {
    document.querySelectorAll('.font-bold').forEach(el => {
      if (el.textContent.trim() === 'Usuário') {
        el.textContent = nomeSalvo;
        el.classList.add('user-name');
      }
    });
  }, 500);
}

if (avatarSalvo) {
  setTimeout(() => {
    const avatarImg = document.querySelector('img[src="/static/img/avatar.png"]');
    if (avatarImg) avatarImg.src = avatarSalvo;
  }, 500);
}

// Sincronização automática ao carregar página
async function sincronizacaoAutomatica() {
  // Só sincroniza se estiver desatualizado (> 1 hora)
  if (precisaSincronizar()) {
    const npub = localStorage.getItem('libermedia_npub');

    if (npub) {
      console.log('🔄 Sincronização automática iniciada...');

      const perfil = await sincronizarPerfilNostr(npub);

      if (perfil) {
        console.log('✅ Perfil sincronizado automaticamente');

        // Atualiza UI silenciosamente
        atualizarPerfilUI(perfil);
      }
    }
  }
}

// Executa sincronização automática 2 segundos após carregar
setTimeout(sincronizacaoAutomatica, 2000);

// Mobile: Toggle sidebar drawer
document.addEventListener('DOMContentLoaded', function() {
  const menuToggle = document.getElementById('sidebarToggle');
  const sidebar = document.querySelector('.sidebar-drawer');

  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', function() {
      sidebar.classList.toggle('-translate-x-full');
    });

    // Fecha ao clicar fora
    document.addEventListener('click', function(e) {
      if (window.innerWidth < 768) {
        if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
          sidebar.classList.add('-translate-x-full');
        }
      }
    });
  }
});

