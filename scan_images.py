#!/usr/bin/env python3
"""
Script de Scan e Mapeamento de Imagens - LiberMedia
Analisa todas as imagens no diretório uploads e gera relatório
"""

import os
import json
from pathlib import Path
from datetime import datetime
from PIL import Image
import hashlib

# Configurações
UPLOADS_DIR = Path("/mnt/projetos/libermedia/uploads")
OUTPUT_JSON = Path("/mnt/projetos/libermedia/data/images_scan.json")
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}

def get_file_hash(filepath):
    """Retorna o hash SHA256 do arquivo"""
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for block in iter(lambda: f.read(4096), b''):
            sha256.update(block)
    return sha256.hexdigest()

def get_image_info(filepath):
    """Extrai informações de uma imagem"""
    try:
        stat = filepath.stat()

        info = {
            'filename': filepath.name,
            'path': str(filepath),
            'size_bytes': stat.st_size,
            'size_mb': round(stat.st_size / (1024 * 1024), 2),
            'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
            'extension': filepath.suffix.lower()
        }

        # Tentar abrir com PIL para pegar dimensões
        try:
            with Image.open(filepath) as img:
                info['width'] = img.width
                info['height'] = img.height
                info['format'] = img.format
                info['mode'] = img.mode

                # Verificar se tem EXIF
                info['has_exif'] = hasattr(img, '_getexif') and img._getexif() is not None

                # Calcular megapixels
                info['megapixels'] = round((img.width * img.height) / 1_000_000, 2)
        except Exception as e:
            info['error'] = f"Erro ao ler imagem: {str(e)}"

        return info
    except Exception as e:
        return {
            'filename': filepath.name,
            'error': f"Erro ao processar: {str(e)}"
        }

def scan_images():
    """Escaneia todas as imagens no diretório"""
    print(f"🔍 Escaneando imagens em: {UPLOADS_DIR}")
    print(f"📋 Extensões: {', '.join(IMAGE_EXTENSIONS)}\n")

    images = []
    errors = []
    total_size = 0

    # Listar todos os arquivos
    for filepath in UPLOADS_DIR.iterdir():
        if filepath.is_file() and filepath.suffix.lower() in IMAGE_EXTENSIONS:
            info = get_image_info(filepath)

            if 'error' in info:
                errors.append(info)
            else:
                images.append(info)
                total_size += info['size_bytes']

            # Mostrar progresso
            if len(images) % 20 == 0:
                print(f"  Processadas: {len(images)} imagens...")

    # Ordenar por tamanho (maiores primeiro)
    images.sort(key=lambda x: x.get('size_bytes', 0), reverse=True)

    # Estatísticas
    stats = {
        'total_images': len(images),
        'total_errors': len(errors),
        'total_size_mb': round(total_size / (1024 * 1024), 2),
        'average_size_mb': round((total_size / len(images)) / (1024 * 1024), 2) if images else 0,
        'scan_date': datetime.now().isoformat(),
        'extensions': {}
    }

    # Contar por extensão
    for img in images:
        ext = img['extension']
        if ext not in stats['extensions']:
            stats['extensions'][ext] = {'count': 0, 'size_mb': 0}
        stats['extensions'][ext]['count'] += 1
        stats['extensions'][ext]['size_mb'] += img['size_mb']

    # Arredondar tamanhos
    for ext in stats['extensions']:
        stats['extensions'][ext]['size_mb'] = round(stats['extensions'][ext]['size_mb'], 2)

    # Top 100 maiores imagens
    top_100 = images[:100]

    # Resultado
    result = {
        'stats': stats,
        'top_100_largest': top_100,
        'all_images': images,
        'errors': errors
    }

    # Salvar JSON
    OUTPUT_JSON.parent.mkdir(exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    # Relatório
    print(f"\n✅ Scan Completo!\n")
    print(f"📊 Estatísticas:")
    print(f"   • Total de imagens: {stats['total_images']}")
    print(f"   • Tamanho total: {stats['total_size_mb']} MB")
    print(f"   • Tamanho médio: {stats['average_size_mb']} MB")
    print(f"   • Erros: {stats['total_errors']}")
    print(f"\n📁 Por extensão:")
    for ext, data in sorted(stats['extensions'].items()):
        print(f"   {ext}: {data['count']} arquivos ({data['size_mb']} MB)")

    print(f"\n💾 Relatório salvo em: {OUTPUT_JSON}")
    print(f"\n🔝 Top 10 maiores imagens:")
    for i, img in enumerate(top_100[:10], 1):
        print(f"   {i}. {img['filename']}: {img['size_mb']} MB ({img.get('width', '?')}x{img.get('height', '?')})")

    return result

if __name__ == '__main__':
    try:
        scan_images()
    except KeyboardInterrupt:
        print("\n\n⚠️  Scan interrompido pelo usuário")
    except Exception as e:
        print(f"\n❌ Erro: {e}")
        import traceback
        traceback.print_exc()
