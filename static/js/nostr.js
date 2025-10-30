/**
 * LiberMedia - Biblioteca Nostr (NIP-01)
 * Funções para leitura e escrita de perfis Nostr
 */

// Configuração de relays
const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band'
];

/**
 * Busca perfil Nostr (kind 0) do usuário via backend
 * @param {string} npub - Chave pública em formato npub
 * @returns {Promise<Object|null>} Objeto com dados do perfil ou null se não encontrado
 */
async function buscarPerfilNostr(npub) {
  try {
    const response = await fetch('/api/nostr/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npub })
    });

    const data = await response.json();

    if (data.status === 'ok' && data.perfil) {
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

    return null;
  } catch (error) {
    console.error('Erro ao buscar perfil Nostr:', error);
    return null;
  }
}

/**
 * Publica perfil Nostr (kind 0) usando NIP-07 (window.nostr)
 * @param {Object} profileData - Dados do perfil
 * @returns {Promise<Object>} Resultado da publicação
 */
async function publicarPerfilNostr(profileData) {
  try {
    // Verifica se extensão NIP-07 está disponível
    if (!window.nostr) {
      throw new Error('Extensão Nostr não encontrada. Instale Alby, nos2x ou outra extensão compatível.');
    }

    // Prepara conteúdo do evento (kind 0)
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

    // Cria evento base
    const event = {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: content
    };

    // Assina evento usando extensão
    const signedEvent = await window.nostr.signEvent(event);

    // Publica evento nos relays
    const publishResults = await publicarEventoNostr(signedEvent);

    return {
      success: true,
      event: signedEvent,
      relays: publishResults
    };

  } catch (error) {
    console.error('Erro ao publicar perfil:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Publica evento em múltiplos relays
 * @param {Object} signedEvent - Evento já assinado
 * @returns {Promise<Array>} Array com resultados de cada relay
 */
async function publicarEventoNostr(signedEvent) {
  const results = [];

  for (const relay of RELAYS) {
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
 * @param {string} npub - Chave pública
 * @returns {Promise<Object|null>} Dados do perfil sincronizado
 */
async function sincronizarPerfilNostr(npub) {
  try {
    const perfil = await buscarPerfilNostr(npub);

    if (perfil) {
      // Salva no localStorage
      localStorage.setItem('libermedia_nome', perfil.name || perfil.display_name || '');
      localStorage.setItem('libermedia_avatar', perfil.picture || '');
      localStorage.setItem('libermedia_about', perfil.about || '');
      localStorage.setItem('libermedia_banner', perfil.banner || '');
      localStorage.setItem('libermedia_website', perfil.website || '');
      localStorage.setItem('libermedia_nip05', perfil.nip05 || '');
      localStorage.setItem('libermedia_lud16', perfil.lud16 || '');
      localStorage.setItem('libermedia_last_sync', Date.now().toString());

      return perfil;
    }

    return null;
  } catch (error) {
    console.error('Erro ao sincronizar perfil:', error);
    return null;
  }
}

/**
 * Verifica se perfil está desatualizado (mais de 1 hora)
 * @returns {boolean} True se precisa sincronizar
 */
function precisaSincronizar() {
  const lastSync = localStorage.getItem('libermedia_last_sync');

  if (!lastSync) return true;

  const umahora = 60 * 60 * 1000; // 1 hora em ms
  const tempoDecorrido = Date.now() - parseInt(lastSync);

  return tempoDecorrido > umahora;
}

/**
 * Obtém chave pública usando NIP-07
 * @returns {Promise<string|null>} npub ou null
 */
async function obterPublicKey() {
  try {
    if (!window.nostr) return null;

    const pubkey = await window.nostr.getPublicKey();
    return pubkey;
  } catch (error) {
    console.error('Erro ao obter chave pública:', error);
    return null;
  }
}

// Exporta funções globalmente
window.NostrLib = {
  buscarPerfilNostr,
  publicarPerfilNostr,
  sincronizarPerfilNostr,
  precisaSincronizar,
  obterPublicKey
};
