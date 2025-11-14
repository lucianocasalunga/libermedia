#!/usr/bin/env python3
"""
Gerador de Thumbnails - LiberMedia
Gera thumbnails em WebP com remoção de EXIF
"""

import os
import json
import sys
from pathlib import Path
from datetime import datetime
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse

# Configurações
UPLOADS_DIR = Path("/mnt/projetos/libermedia/uploads")
THUMBS_DIR = UPLOADS_DIR / "thumbs"
THUMB_SIZES = [320, 960, 1600]
WEBP_QUALITY = 85  # Qualidade WebP (0-100)
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}

def remove_exif_and_convert_webp(image_path, output_path, max_size):
    """
    Converte imagem para WebP, remove EXIF e redimensiona

    Args:
        image_path: Caminho da imagem original
        output_path: Caminho de saída do thumbnail
        max_size: Tamanho máximo (largura) do thumbnail
    """
    try:
        # Abrir imagem original
        with Image.open(image_path) as img:
            # Converter para RGB se necessário (WebP não suporta modo P)
            if img.mode in ('RGBA', 'LA', 'P'):
                # Preservar transparência se existir
                if img.mode == 'RGBA':
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[3])
                    img = background
                else:
                    img = img.convert('RGB')
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            # Calcular novo tamanho mantendo aspect ratio
            width, height = img.size

            if width > max_size:
                ratio = max_size / width
                new_width = max_size
                new_height = int(height * ratio)
            else:
                # Se já é menor, não redimensionar
                new_width = width
                new_height = height

            # Redimensionar usando LANCZOS (alta qualidade)
            if (new_width, new_height) != (width, height):
                img_resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            else:
                img_resized = img

            # Salvar como WebP SEM EXIF (data=None remove todos os metadados)
            img_resized.save(
                output_path,
                'WEBP',
                quality=WEBP_QUALITY,
                method=6,  # Melhor compressão
                exif=b''   # Remove EXIF
            )

            return {
                'success': True,
                'original_size': (width, height),
                'thumb_size': (new_width, new_height),
                'original_bytes': image_path.stat().st_size,
                'thumb_bytes': output_path.stat().st_size
            }

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def generate_thumbnails(image_path, sizes=THUMB_SIZES):
    """
    Gera todos os tamanhos de thumbnails para uma imagem

    Args:
        image_path: Path object da imagem
        sizes: Lista de tamanhos a gerar

    Returns:
        Dict com resultado da geração
    """
    results = {
        'filename': image_path.name,
        'sizes': {}
    }

    for size in sizes:
        # Nome do arquivo de saída (sem extensão original)
        output_name = image_path.stem + '.webp'
        output_path = THUMBS_DIR / str(size) / output_name

        # Gerar thumbnail
        result = remove_exif_and_convert_webp(image_path, output_path, size)
        results['sizes'][size] = result

    # Calcular economia total
    if all(r.get('success') for r in results['sizes'].values()):
        original_size = results['sizes'][max(sizes)]['original_bytes']
        total_thumbs_size = sum(r['thumb_bytes'] for r in results['sizes'].values())
        results['compression_ratio'] = round(total_thumbs_size / original_size, 2)
        results['saved_bytes'] = original_size - total_thumbs_size
        results['success'] = True
    else:
        results['success'] = False

    return results

def process_images_batch(image_paths, max_workers=4):
    """
    Processa lote de imagens em paralelo

    Args:
        image_paths: Lista de Path objects
        max_workers: Número de threads paralelas
    """
    total = len(image_paths)
    processed = 0
    success = 0
    failed = 0
    total_saved = 0

    print(f"🚀 Processando {total} imagens com {max_workers} threads...\n")

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submeter todas as tarefas
        futures = {executor.submit(generate_thumbnails, img_path): img_path
                  for img_path in image_paths}

        # Processar resultados conforme completam
        for future in as_completed(futures):
            processed += 1
            result = future.result()

            if result['success']:
                success += 1
                total_saved += result.get('saved_bytes', 0)

                # Mostrar progresso a cada 10 imagens
                if processed % 10 == 0:
                    ratio = result.get('compression_ratio', 0)
                    print(f"  [{processed}/{total}] ✅ {result['filename'][:50]} (compressão: {ratio:.0%})")
            else:
                failed += 1
                print(f"  [{processed}/{total}] ❌ {result['filename']}: ERRO")

    # Relatório final
    saved_mb = total_saved / (1024 * 1024)
    print(f"\n{'='*60}")
    print(f"✅ Processamento Completo!")
    print(f"{'='*60}")
    print(f"  • Processadas: {processed}")
    print(f"  • Sucesso: {success}")
    print(f"  • Falhas: {failed}")
    print(f"  • Economia: {saved_mb:.2f} MB")
    print(f"  • Taxa média de compressão: {(total_saved / (success * 145 * 1024 * 1024 / 238)):.0%}" if success > 0 else "N/A")

def main():
    parser = argparse.ArgumentParser(description='Gerador de Thumbnails WebP para LiberMedia')
    parser.add_argument('--top', type=int, help='Processar apenas as N maiores imagens')
    parser.add_argument('--all', action='store_true', help='Processar todas as imagens')
    parser.add_argument('--workers', type=int, default=4, help='Número de threads (padrão: 4)')
    parser.add_argument('--file', type=str, help='Processar arquivo específico')

    args = parser.parse_args()

    # Verificar se diretórios existem
    if not THUMBS_DIR.exists():
        print(f"❌ Erro: Diretório {THUMBS_DIR} não encontrado")
        sys.exit(1)

    # Determinar quais imagens processar
    if args.file:
        # Arquivo específico
        image_path = UPLOADS_DIR / args.file
        if not image_path.exists():
            print(f"❌ Erro: Arquivo {image_path} não encontrado")
            sys.exit(1)
        images_to_process = [image_path]
        print(f"📸 Processando arquivo: {args.file}")

    elif args.top:
        # Carregar scan para pegar top N
        scan_file = Path("/mnt/projetos/libermedia/data/images_scan.json")
        if not scan_file.exists():
            print(f"❌ Erro: Execute scan_images.py primeiro")
            sys.exit(1)

        with open(scan_file, 'r') as f:
            scan_data = json.load(f)

        top_images = scan_data['top_100_largest'][:args.top]
        images_to_process = [Path(img['path']) for img in top_images]
        print(f"📸 Processando top {args.top} maiores imagens")

    elif args.all:
        # Todas as imagens
        images_to_process = [f for f in UPLOADS_DIR.iterdir()
                           if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS]
        print(f"📸 Processando TODAS as {len(images_to_process)} imagens")

    else:
        print("❌ Erro: Especifique --top N, --all ou --file NOME")
        parser.print_help()
        sys.exit(1)

    # Processar
    if images_to_process:
        process_images_batch(images_to_process, max_workers=args.workers)
    else:
        print("⚠️  Nenhuma imagem para processar")

if __name__ == '__main__':
    main()
