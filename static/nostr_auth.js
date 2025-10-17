async function loginWithNip07() {
  if (!window.nostr) {
    alert("Extensão Nostr (NIP-07) não detectada no navegador.");
    return;
  }
  try {
    const pubkey = await window.nostr.getPublicKey();
    // pede challenge
    const chResp = await fetch('/api/challenge');
    const ch = (await chResp.json()).challenge;
    // cria evento simples e assina (ou assina o challenge diretamente conforme extensão)
    const evt = { kind: 2222, pubkey: pubkey, content: ch, created_at: Math.floor(Date.now()/1000) };
    const signed = await window.nostr.signEvent(evt); // NIP-07 assume signEvent
    // signed.sig é assinatura em hex e signed.pubkey
    const payload = { pubkey: signed.pubkey || pubkey, signature: signed.sig || signed.signature, challenge: ch };
    const auth = await fetch('/api/auth', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) });
    const r = await auth.json();
    if (r.token) {
      localStorage.setItem('libermedia_jwt', r.token);
      alert('Login OK');
      window.location.href = '/usuario';
    } else {
      alert('Auth falhou: ' + JSON.stringify(r));
    }
  } catch (err) {
    console.error(err);
    alert('Erro no login NIP-07: ' + (err.message||err));
  }
}

// fallback: usuário cola assinatura manual (não ideal)
async function loginWithManual() {
  const pubkey = prompt("Cole sua pubkey (hex):");
  const signature = prompt("Cole a assinatura sobre o challenge (hex):");
  const chResp = await fetch('/api/challenge');
  const ch = (await chResp.json()).challenge;
  const auth = await fetch('/api/auth', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({pubkey, signature, challenge: ch})});
  const r = await auth.json();
  if (r.token) { localStorage.setItem('libermedia_jwt', r.token); window.location.href='/usuario'; } else { alert('Auth falhou:'+JSON.stringify(r)); }
}
