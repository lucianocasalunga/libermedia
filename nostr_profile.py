import requests

def buscar_perfil(npub: str):
    """Busca via nostr.watch - API simples"""
    try:
        # nostr.watch aceita npub direto
        url = f"https://api.nostr.watch/v1/profile/{npub}"
        
        r = requests.get(url, timeout=5)
        
        if r.status_code == 200:
            data = r.json()
            return {
                "name": data.get("name") or data.get("display_name") or "Usuário Nostr",
                "picture": data.get("picture") or data.get("image") or "/static/img/avatar.png",
                "about": data.get("about", ""),
                "nip05": data.get("nip05", "")
            }
        
        return None
    except Exception as e:
        print(f"Erro: {e}")
        return None
