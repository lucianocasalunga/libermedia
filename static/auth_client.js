async function registerUser(pubkey, password) {
  const r = await fetch("/api/register", {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ pubkey, password })
  });
  return await r.json();
}

async function loginUser(pubkey, password) {
  const r = await fetch("/api/login", {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ pubkey, password })
  });
  return await r.json();
}
