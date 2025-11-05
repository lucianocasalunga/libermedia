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

// Paginação
let paginaAtual = 1;
const ARQUIVOS_POR_PAGINA = 50;

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
let pastaAtual = 'Photos';
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
    
    await new Promise((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve();
        } else {
          reject(new Error(`Erro ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('Erro de rede'));
      xhr.open('POST', '/api/upload');
      xhr.send(fd);
    });
  }

  progress.classList.add('hidden');

  // Mensagem de sucesso
  showToast(`✅ ${files.length} arquivo${files.length > 1 ? 's' : ''} enviado${files.length > 1 ? 's' : ''} com sucesso!`, 'success');

  loadFiles();
}

async function loadFiles() {
  const res = await fetch(`/api/arquivos?npub=${npub}`);
  const data = await res.json();

  todosArquivos = data.arquivos || [];
  document.getElementById('total').textContent = todosArquivos.length;

  renderFiles();
}

// ============================================
// NIP-98: HTTP AUTH
// ============================================

/**
 * Cria evento NIP-98 (HTTP Auth) para autenticar requests
 * @param {string} method - Método HTTP (GET, POST, etc)
 * @param {string} url - URL completa do request
 * @param {string} payload - Payload JSON (opcional)
 * @returns {Promise<string>} Base64 do evento assinado
 */
async function createNip98Event(method, url, payload = null) {
  try {
    const npub = localStorage.getItem('libermedia_npub');
    if (!npub) throw new Error('NPub não encontrado');

    // Busca usuário no backend para pegar privkey
    const usuario = await fetch(`/api/usuario?npub=${npub}`).then(r => r.json());

    if (!usuario.privkey || usuario.privkey === '') {
      console.warn('[NIP-98] Usuário sem privkey, tentando extensão Nostr...');

      // Tenta usar extensão Nostr (NIP-07)
      if (window.nostr) {
        const event = {
          kind: 27235,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['u', url],
            ['method', method.toUpperCase()]
          ],
          content: ''
        };

        if (payload) {
          const payloadHash = await sha256(payload);
          event.tags.push(['payload', payloadHash]);
        }

        const signedEvent = await window.nostr.signEvent(event);
        return btoa(JSON.stringify(signedEvent));
      }

      throw new Error('Sem chave privada e sem extensão Nostr');
    }

    // Cria evento no backend (usuário tem privkey)
    const response = await fetch('/api/nip98/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npub,
        http_method: method.toUpperCase(),
        http_url: url,
        payload: payload
      })
    });

    const data = await response.json();

    if (data.status === 'ok') {
      return data.auth_header;  // Já vem em base64
    } else {
      throw new Error(data.error || 'Erro ao assinar evento');
    }
  } catch (error) {
    console.error('[NIP-98] Erro ao criar evento:', error);
    return null;
  }
}

/**
 * Helper para calcular SHA256 de uma string
 */
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// NIP-78: SINCRONIZAÇÃO DE PASTAS
// ============================================

/**
 * Busca pastas salvas no Nostr (kind 30078)
 */
async function buscarPastasNostr(npub) {
  try {
    console.log('[NIP-78] 📡 Buscando pastas do Nostr...');

    const response = await fetch('/api/nostr/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npub })
    });

    const data = await response.json();

    if (data.status === 'ok') {
      console.log(`[NIP-78] ✅ ${data.folders.length} pastas encontradas`);
      return data.folders || [];
    } else {
      console.log('[NIP-78] ⚠️ Erro ao buscar pastas:', data.error);
      return [];
    }
  } catch (error) {
    console.error('[NIP-78] ❌ Erro ao buscar pastas:', error);
    return [];
  }
}

/**
 * Publica pastas no Nostr (kind 30078)
 */
async function publicarPastasNostr(folders) {
  try {
    console.log(`[NIP-78] 📤 Publicando ${folders.length} pastas...`);

    // Verifica se tem extensão NIP-07 e usa direto (mais rápido, sem 400)
    if (typeof window.nostr !== 'undefined') {
      console.log('[NIP-78] 🔑 Usando NIP-07 (extensão detectada)...');

      try {
        // Cria evento kind 30078 com tag "d" = "folders"
        const event = {
          kind: 30078,
          content: JSON.stringify({ folders }),
          tags: [['d', 'folders']],
          created_at: Math.floor(Date.now() / 1000)
        };

        // Assina via extensão
        const signedEvent = await window.nostr.signEvent(event);

        console.log('[NIP-78] ✅ Evento assinado via NIP-07:', signedEvent.id);

        // Publica o evento assinado via backend
        const publishResponse = await fetch('/api/nostr/publish-signed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: signedEvent })
        });

        const publishData = await publishResponse.json();

        if (publishData.status === 'ok') {
          console.log('[NIP-78] ✅ Pastas sincronizadas com sucesso (NIP-07)!');
          return true;
        } else {
          console.error('[NIP-78] ❌ Erro ao publicar evento:', publishData.error);
          return false;
        }

      } catch (nip07Error) {
        console.error('[NIP-78] ❌ Erro NIP-07, tentando backend...', nip07Error);
        // Se NIP-07 falhar, tenta backend como fallback
      }
    }

    // Se não tem NIP-07 ou falhou, tenta backend
    console.log('[NIP-78] 🔄 Tentando via backend...');
    const response = await fetch('/api/nostr/folders/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npub,
        folders
      })
    });

    const data = await response.json();

    if (data.status === 'ok') {
      console.log('[NIP-78] ✅ Pastas sincronizadas com sucesso (backend)!');
      return true;
    }

    console.log('[NIP-78] ⚠️ Não foi possível sincronizar:', data.error);
    return false;

  } catch (error) {
    console.error('[NIP-78] ❌ Erro ao publicar pastas:', error);
    return false;
  }
}

// GERENCIAMENTO DE PASTAS
async function loadPastas() {
  try {
    console.log('[Pastas] 🔄 Carregando pastas (backend + localStorage + Nostr)...');

    // 1. Busca pastas do backend (pastas com arquivos)
    const res = await fetch(`/api/pastas?npub=${npub}`);
    const data = await res.json();
    let pastas = data.status === 'ok' ? (data.pastas || []) : [];

    // 2. Merge com localStorage (pastas criadas localmente)
    const pastasLocal = JSON.parse(localStorage.getItem('libermedia_pastas_' + npub) || '[]');
    pastasLocal.forEach(p => {
      if (!pastas.includes(p)) pastas.push(p);
    });

    // 3. Merge com Nostr (NIP-78 - pastas sincronizadas entre dispositivos)
    const pastasNostr = await buscarPastasNostr(npub);
    pastasNostr.forEach(p => {
      if (!pastas.includes(p)) pastas.push(p);
    });

    console.log(`[Pastas] ✅ Total: ${pastas.length} pastas (backend: ${data.pastas?.length || 0}, local: ${pastasLocal.length}, nostr: ${pastasNostr.length})`);

    // 4. Atualiza localStorage com lista completa
    localStorage.setItem('libermedia_pastas_' + npub, JSON.stringify(pastas));

    // 5. Se há pastas locais que não estão no Nostr, sincroniza
    if (pastas.length > 0 && pastasNostr.length !== pastas.length) {
      console.log('[Pastas] 📤 Sincronizando pastas com Nostr...');
      await publicarPastasNostr(pastas);
    }

    renderPastas(pastas);
  } catch (err) {
    console.error('[Pastas] ❌ Erro ao carregar pastas:', err);
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

    const btn = document.createElement('button');
    btn.onclick = () => filtrarPasta(nome);
    btn.className = 'relative group w-full text-left p-2 pr-8 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-900 dark:text-white flex items-center transition-colors';
    btn.innerHTML = `
      ${icons.folder}${nome}
      <span onclick="event.stopPropagation(); togglePastaMenu('${nome}', event)"
            class="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded px-1.5 py-0.5 text-xs cursor-pointer">⋮</span>
    `;

    container.appendChild(btn);
  });

  // Botões "Criar Pasta" e "Apagar Pasta"
  const btnWrapper = document.createElement('div');
  btnWrapper.className = 'flex gap-2 mt-2';

  const btnCriar = document.createElement('button');
  btnCriar.onclick = criarPasta;
  btnCriar.className = 'flex-1 text-left p-2 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded font-bold flex items-center justify-center transition-colors';
  btnCriar.innerHTML = `${icons.plus}Criar`;

  const btnApagar = document.createElement('button');
  btnApagar.onclick = iniciarApagarPasta;
  btnApagar.className = 'flex-1 text-left p-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded font-bold flex items-center justify-center transition-colors';
  btnApagar.innerHTML = `<svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>Apagar`;

  btnWrapper.appendChild(btnCriar);
  btnWrapper.appendChild(btnApagar);
  container.appendChild(btnWrapper);
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
  link: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  menu: '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>'
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
    // Para MOV, usa src direto (melhor compatibilidade)
    // Para outros formatos, usa source tag
    const videoTag = ext === 'mov'
      ? `<video class="w-full h-full object-cover" controls preload="metadata" playsinline src="${linkComExt}">Seu navegador não suporta vídeos MOV.</video>`
      : `<video class="w-full h-full object-cover" controls preload="metadata" playsinline><source src="${linkComExt}" type="${videoMimeTypes[ext]}">Seu navegador não suporta este formato de vídeo.</video>`;

    return `
      <div class="relative w-full aspect-square overflow-hidden bg-gray-100 dark:bg-gray-900">
        ${videoTag}
        <button onclick="event.stopPropagation(); copyLinkDiscrete('${linkComExt}')"
                class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white p-2 rounded-full"
                title="Copiar link">
          ${cardIcons.link}
        </button>
      </div>
    `;
  }

  // ÁUDIO
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return `
      <div class="relative w-full aspect-square bg-gradient-to-br from-purple-600 to-pink-600 overflow-hidden flex items-center justify-center">
        <svg class="text-white flex-shrink-0" style="width: 96px; height: 96px;" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 18V5l12-2v13M9 18c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3zm12-2c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3z"/>
        </svg>
        <div class="absolute bottom-0 left-0 right-0 bg-black/30 backdrop-blur-sm px-3 py-2">
          <audio controls class="w-full" style="height: 32px;">
            <source src="${linkComExt}" type="audio/${ext}">
          </audio>
        </div>
        <button onclick="event.stopPropagation(); copyLinkDiscrete('${linkComExt}')"
                class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white p-2 rounded-full"
                title="Copiar link">
          ${cardIcons.link}
        </button>
      </div>
    `;
  }

  // DOCUMENTOS
  const docIcons = {
    'pdf': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-6 4h4"/></svg>',
    'doc': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
    'docx': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
    'xls': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>',
    'xlsx': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>',
    'ppt': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7h8m-8 4h8m-8 4h5"/></svg>',
    'pptx': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7h8m-8 4h8m-8 4h5"/></svg>',
    'txt': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
    'md': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>',
    'zip': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
    'rar': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
    'csv': '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>'
  };

  if (docIcons[ext]) {
    return `
      <div class="relative w-full aspect-square bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center">
        <div class="text-gray-600 dark:text-gray-400 mb-2" style="width: 80px; height: 80px;">${docIcons[ext]}</div>
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
    document.getElementById('paginationControls').classList.add('hidden');
    return;
  }

  emptyDiv.classList.add('hidden');

  // Paginação
  const totalArquivos = arquivosFiltrados.length;
  const totalPaginas = Math.ceil(totalArquivos / ARQUIVOS_POR_PAGINA);
  const inicio = (paginaAtual - 1) * ARQUIVOS_POR_PAGINA;
  const fim = Math.min(inicio + ARQUIVOS_POR_PAGINA, totalArquivos);
  const arquivosPaginados = arquivosFiltrados.slice(inicio, fim);

  // Renderizar apenas arquivos da página atual
  if (viewMode === 'grade') {
    filesDiv.innerHTML = arquivosPaginados.map(f => {
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
    filesDiv.innerHTML = arquivosPaginados.map(f => {
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

  // Atualizar controles de paginação
  atualizarPaginacao(totalArquivos, totalPaginas, inicio, fim);
}

function atualizarPaginacao(totalArquivos, totalPaginas, inicio, fim) {
  const controls = document.getElementById('paginationControls');

  if (totalPaginas <= 1) {
    controls.classList.add('hidden');
    return;
  }

  controls.classList.remove('hidden');
  controls.innerHTML = `
    <div class="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg shadow px-6 py-4 mt-4">
      <div class="text-sm text-gray-700 dark:text-gray-300">
        Mostrando <span class="font-semibold">${inicio + 1}</span> a <span class="font-semibold">${fim}</span> de <span class="font-semibold">${totalArquivos}</span> arquivos
      </div>
      <div class="flex gap-2">
        <button
          onclick="mudarPagina(${paginaAtual - 1})"
          ${paginaAtual === 1 ? 'disabled' : ''}
          class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition">
          Anterior
        </button>
        <span class="px-4 py-2 bg-yellow-500 text-white rounded-lg font-semibold">
          Página ${paginaAtual} de ${totalPaginas}
        </span>
        <button
          onclick="mudarPagina(${paginaAtual + 1})"
          ${paginaAtual === totalPaginas ? 'disabled' : ''}
          class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition">
          Próxima
        </button>
      </div>
    </div>
  `;
}

function mudarPagina(novaPagina) {
  paginaAtual = novaPagina;
  renderizarArquivos();
  // Scroll suave para o topo da lista de arquivos
  document.getElementById('filesContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function filtrarPasta(pasta) {
  pastaAtual = pasta;
  paginaAtual = 1; // Reset para primeira página

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
  paginaAtual = 1; // Reset para primeira página

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

async function criarPasta() {
  const nome = prompt("Nome da nova pasta:");
  if (!nome || nome.trim() === "") return;

  console.log(`[Pastas] ➕ Criando pasta "${nome}"...`);

  // Salva em localStorage
  const pastasLocal = JSON.parse(localStorage.getItem('libermedia_pastas_' + npub) || '[]');
  if (!pastasLocal.includes(nome.trim())) {
    pastasLocal.push(nome.trim());
    localStorage.setItem('libermedia_pastas_' + npub, JSON.stringify(pastasLocal));
  }

  // Sincroniza com Nostr (NIP-78)
  console.log('[Pastas] 📤 Sincronizando nova pasta com Nostr...');
  await publicarPastasNostr(pastasLocal);

  // Recarrega e renderiza pastas
  await loadPastas();

  // Seleciona a pasta recém-criada
  filtrarPasta(nome.trim());
  showToast(`✓ Pasta "${nome}" criada e sincronizada!`, 'success');
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

        // Sincroniza com Nostr (NIP-78)
        console.log('[Pastas] 📤 Sincronizando renomeação com Nostr...');
        await publicarPastasNostr(pastasLocal);
      }

      // Recarrega interface
      await loadPastas();
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

async function iniciarApagarPasta() {
  // Obtém pastas customizadas (não as padrão)
  const pastasLocal = JSON.parse(localStorage.getItem('libermedia_pastas_' + npub) || '[]');
  const pastasProtegidas = ['Mesa', 'Photos', 'Videos', 'Docs', 'Audio'];
  const pastasCustomizadas = pastasLocal.filter(p => !pastasProtegidas.includes(p));

  if (pastasCustomizadas.length === 0) {
    showToast('❌ Nenhuma pasta customizada para apagar', 'error');
    return;
  }

  // Mostra lista de pastas
  const lista = pastasCustomizadas.map((p, i) => `${i + 1}. ${p}`).join('\n');
  const escolha = prompt(`Escolha a pasta para apagar:\n\n${lista}\n\nDigite o número:`);

  if (!escolha) return;

  const index = parseInt(escolha) - 1;
  if (index >= 0 && index < pastasCustomizadas.length) {
    const nomePasta = pastasCustomizadas[index];
    if (confirm(`⚠️ Tem certeza que deseja apagar a pasta "${nomePasta}"?\n\nOs arquivos serão movidos para a pasta Mesa.`)) {
      await deletarPasta(nomePasta);
    }
  } else {
    showToast('❌ Número inválido', 'error');
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

      // Sincroniza com Nostr (NIP-78)
      console.log('[Pastas] 📤 Sincronizando deleção com Nostr...');
      await publicarPastasNostr(novaLista);

      showToast('✓ Pasta deletada e sincronizada!', 'success');

      // Recarrega interface
      await loadPastas();

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

// ============================================
// UI HELPERS - Toast & Loading States
// ============================================

function showToast(message, type = 'info') {
  const toast = document.createElement('div');

  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500'
  };

  const bg = colors[type] || colors.info;

  toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-2xl z-50 ${bg} text-white font-semibold transition-all duration-300`;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

let loadingOverlay = null;

function showLoading(message = 'Carregando...') {
  if (loadingOverlay) return; // Já existe um loading

  loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center';
  loadingOverlay.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 flex flex-col items-center gap-4">
      <div class="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-gray-900 dark:text-white font-semibold">${message}</p>
    </div>
  `;

  document.body.appendChild(loadingOverlay);
}

function hideLoading() {
  if (loadingOverlay) {
    loadingOverlay.remove();
    loadingOverlay = null;
  }
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
      console.error('[Uso] Erro ao carregar:', data.error);
      return;
    }

    console.log('[Uso] Dados recebidos:', data);

    // Converter para GB
    const usadoGB = (data.usado / (1024 * 1024 * 1024)).toFixed(2);
    const limiteGB = (data.limite / (1024 * 1024 * 1024)).toFixed(0);

    // Atualizar textos básicos
    document.getElementById('usoAtual').textContent = usadoGB + ' GB';
    document.getElementById('usoLimite').textContent = limiteGB + ' GB';
    document.getElementById('usoPercentual').textContent = data.percentual + '%';
    document.getElementById('usoPlano').textContent = data.plano.toUpperCase();

    if (document.getElementById('totalArquivos')) {
      document.getElementById('totalArquivos').textContent = data.total_arquivos || 0;
    }

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

    // Alertas
    if (data.alertas && data.alertas.length > 0 && document.getElementById('usoAlertas')) {
      const alertasHTML = data.alertas.map(alerta => {
        const cor = alerta.tipo === 'critico' ? 'bg-red-100 border-red-400 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300'
                  : 'bg-yellow-100 border-yellow-400 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300';
        return `<div class="p-2 mb-2 border-l-4 ${cor} text-xs">${alerta.mensagem}</div>`;
      }).join('');
      document.getElementById('usoAlertas').innerHTML = alertasHTML;
    }

    // Breakdown por tipo
    const tiposContainer = document.getElementById('usoTipos');
    tiposContainer.innerHTML = '';

    const icones = {
      'image': '<svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>',
      'video': '<svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"/></svg>',
      'audio': '<svg class="w-5 h-5 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>',
      'document': '<svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
      'outros': '<svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>'
    };
    
    for (const [tipo, info] of Object.entries(data.tipos)) {
      const sizeGB = (info.size / (1024 * 1024 * 1024)).toFixed(2);
      const card = `
        <div class="bg-gray-50 dark:bg-gray-700 rounded text-center" style="width: 116px; padding: 6px; overflow: hidden; box-sizing: border-box;">
          <div class="flex justify-center mb-1">${icones[tipo] || icones['outros']}</div>
          <div class="text-xs font-semibold text-gray-900 dark:text-white truncate">${tipo}</div>
          <div class="text-xs text-gray-600 dark:text-gray-300">${info.count} arq</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">${sizeGB}GB</div>
        </div>
      `;
      tiposContainer.innerHTML += card;
    }

    // Top 5 maiores arquivos
    if (data.top_arquivos && data.top_arquivos.length > 0 && document.getElementById('topArquivos')) {
      const topHTML = data.top_arquivos.map((arq, idx) => {
        const sizeMB = (arq.tamanho / (1024 * 1024)).toFixed(1);
        const icone = icones[arq.tipo] || icones['outros'];
        return `
          <div class="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700 last:border-0">
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <div class="flex-shrink-0">${icone}</div>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-gray-900 dark:text-white truncate">${arq.nome}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">${arq.pasta}</p>
              </div>
            </div>
            <span class="text-xs font-bold text-gray-700 dark:text-gray-300 ml-2">${sizeMB} MB</span>
          </div>
        `;
      }).join('');
      document.getElementById('topArquivos').innerHTML = topHTML;
    }

    // Histórico simplificado (últimos 7 dias)
    if (data.historico && document.getElementById('historico7dias')) {
      const historicoHTML = `
        <div class="col-span-7 text-center py-2 bg-gray-200 dark:bg-gray-700 rounded">
          <p class="text-xs text-gray-700 dark:text-gray-200">
            <span class="font-bold text-gray-900 dark:text-white">${data.historico.uploads_7d || 0}</span>
            arquivo${(data.historico.uploads_7d || 0) !== 1 ? 's' : ''} enviado${(data.historico.uploads_7d || 0) !== 1 ? 's' : ''} nos últimos 7 dias
          </p>
        </div>
      `;
      document.getElementById('historico7dias').innerHTML = historicoHTML;
    }
  })
  .catch(err => {
    console.error('[Uso] Erro ao carregar dashboard:', err);
  });
}

// Adicionar ao DOMContentLoaded existente
const originalLoad = window.onload || (() => {});
window.onload = function() {
  originalLoad();
  setTimeout(carregarDashboardUso, 1000);
  // Carrega badge NIP-05
  loadNip05Badge();
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

  // Carrega status NIP-05
  loadNip05Status();

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

// ============================================
// NIP-05: VERIFICAÇÃO DE IDENTIDADE
// ============================================

async function loadNip05Status() {
  try {
    const response = await fetch(`/api/nip05/check?npub=${npub}`);
    const data = await response.json();

    const statusDiv = document.getElementById('nip05Status');
    const formDiv = document.getElementById('nip05RequestForm');

    if (data.verified) {
      // Usuário verificado
      statusDiv.innerHTML = `
        <div class="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-700">
          <span class="text-2xl">✅</span>
          <div class="flex-1">
            <p class="text-sm font-semibold text-green-700 dark:text-green-300">
              Verificado!
            </p>
            <p class="text-xs text-green-600 dark:text-green-400">
              ${data.identifier}
            </p>
          </div>
        </div>
      `;
      formDiv.classList.add('hidden');

      // Atualiza campo NIP-05 no formulário
      document.getElementById('configNip05').value = data.identifier;

    } else if (data.username) {
      // Solicitação pendente
      statusDiv.innerHTML = `
        <div class="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-700">
          <span class="text-2xl">⏳</span>
          <div class="flex-1">
            <p class="text-sm font-semibold text-yellow-700 dark:text-yellow-300">
              Aguardando aprovação
            </p>
            <p class="text-xs text-yellow-600 dark:text-yellow-400">
              Username solicitado: ${data.username}@libermedia.app
            </p>
          </div>
        </div>
      `;
      formDiv.classList.add('hidden');

    } else {
      // Sem verificação
      statusDiv.innerHTML = `
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Solicite seu username verificado @libermedia.app
        </p>
      `;
      formDiv.classList.remove('hidden');
    }

  } catch (error) {
    console.error('[NIP-05] Erro ao carregar status:', error);
  }
}

async function requestNip05Username() {
  try {
    const username = document.getElementById('nip05RequestUsername').value.trim().toLowerCase();

    if (!username) {
      showToast('⚠️ Digite um username', 'error');
      return;
    }

    // Valida formato
    if (!/^[a-z0-9_-]+$/.test(username)) {
      showToast('⚠️ Use apenas letras minúsculas, números, - e _', 'error');
      return;
    }

    console.log(`[NIP-05] Solicitando username: ${username}`);

    const response = await fetch('/api/nip05/request-username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npub,
        username
      })
    });

    const data = await response.json();

    if (data.status === 'ok') {
      showToast(`✅ ${data.message}`, 'success');
      loadNip05Status(); // Recarrega status
      loadNip05Badge(); // Atualiza badge no header
    } else {
      showToast(`❌ ${data.error}`, 'error');
    }

  } catch (error) {
    console.error('[NIP-05] Erro ao solicitar username:', error);
    showToast('❌ Erro ao solicitar username', 'error');
  }
}

async function loadNip05Badge() {
  try {
    const response = await fetch(`/api/nip05/check?npub=${npub}`);
    const data = await response.json();

    const badge = document.getElementById('nip05Badge');
    const identifier = document.getElementById('nip05Identifier');

    if (data.verified && data.identifier) {
      badge.classList.remove('hidden');
      identifier.textContent = data.identifier;
      identifier.classList.remove('hidden');
      console.log(`[NIP-05] Usuário verificado: ${data.identifier}`);
    } else {
      badge.classList.add('hidden');
      identifier.classList.add('hidden');
    }

  } catch (error) {
    console.error('[NIP-05] Erro ao carregar badge:', error);
  }
}

