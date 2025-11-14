/**
 * LiberMedia Thumbnail Optimizer
 * Lazy loading e responsive images com WebP thumbnails
 *
 * Uso:
 * <img data-src="/uploads/image.jpg" class="lazy-thumb" alt="...">
 */

(function() {
    'use strict';

    // Configurações
    const THUMB_SIZES = {
        small: 320,
        medium: 960,
        large: 1600
    };

    /**
     * Determina o tamanho ideal do thumbnail baseado no viewport
     */
    function getBestThumbSize(imgElement) {
        const width = imgElement.clientWidth || window.innerWidth;

        if (width <= 400) return THUMB_SIZES.small;
        if (width <= 1000) return THUMB_SIZES.medium;
        return THUMB_SIZES.large;
    }

    /**
     * Converte URL original para URL do thumbnail
     */
    function getThumbUrl(originalUrl, size) {
        // Se já tem query params, adiciona &size, senão adiciona ?size
        const separator = originalUrl.includes('?') ? '&' : '?';
        return `${originalUrl}${separator}size=${size}`;
    }

    /**
     * Cria srcset responsivo para uma imagem
     */
    function createSrcset(originalUrl) {
        return [
            `${getThumbUrl(originalUrl, THUMB_SIZES.small)} 320w`,
            `${getThumbUrl(originalUrl, THUMB_SIZES.medium)} 960w`,
            `${getThumbUrl(originalUrl, THUMB_SIZES.large)} 1600w`,
            `${originalUrl} 2400w`
        ].join(', ');
    }

    /**
     * Converte imagem normal para lazy + srcset
     */
    function optimizeImage(img) {
        const originalSrc = img.dataset.src || img.src;

        if (!originalSrc || !originalSrc.includes('/uploads/')) {
            return; // Não é uma imagem de upload
        }

        // Criar srcset para diferentes tamanhos
        img.srcset = createSrcset(originalSrc);
        img.sizes = '(max-width: 400px) 320px, (max-width: 1000px) 960px, 1600px';

        // Usar thumbnail como src padrão
        const defaultSize = getBestThumbSize(img);
        img.src = getThumbUrl(originalSrc, defaultSize);

        // Marcar como otimizado
        img.dataset.optimized = 'true';

        // Adicionar loading lazy (native)
        img.loading = 'lazy';

        // Adicionar decode async para melhor performance
        img.decoding = 'async';

        console.log(`✅ Imagem otimizada: ${originalSrc} → thumb ${defaultSize}px`);
    }

    /**
     * IntersectionObserver para lazy loading (fallback para navegadores antigos)
     */
    let lazyLoadObserver;

    function initLazyLoad() {
        // Se o navegador suporta loading="lazy", usar nativo
        if ('loading' in HTMLImageElement.prototype) {
            console.log('✅ Lazy loading nativo suportado');
            return;
        }

        // Fallback: usar IntersectionObserver
        lazyLoadObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        optimizeImage(img);
                        lazyLoadObserver.unobserve(img);
                    }
                }
            });
        }, {
            rootMargin: '50px' // Começar a carregar 50px antes
        });
    }

    /**
     * Processa todas as imagens na página
     */
    function processImages() {
        // Encontrar todas as imagens de upload
        const images = document.querySelectorAll('img[src*="/uploads/"], img[data-src*="/uploads/"]');

        console.log(`🔍 Encontradas ${images.length} imagens de upload`);

        images.forEach(img => {
            // Pular se já otimizado
            if (img.dataset.optimized === 'true') return;

            // Se tem data-src, é lazy load manual
            if (img.dataset.src) {
                img.classList.add('lazy-thumb');
                if (lazyLoadObserver) {
                    lazyLoadObserver.observe(img);
                } else {
                    optimizeImage(img);
                }
            } else {
                // Já carregada, otimizar diretamente
                optimizeImage(img);
            }
        });
    }

    /**
     * Observa novas imagens adicionadas dinamicamente
     */
    function observeDynamicImages() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        if (node.tagName === 'IMG' && node.src && node.src.includes('/uploads/')) {
                            optimizeImage(node);
                        }
                        // Verificar filhos
                        const imgs = node.querySelectorAll && node.querySelectorAll('img[src*="/uploads/"]');
                        if (imgs) {
                            imgs.forEach(optimizeImage);
                        }
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Inicialização
     */
    function init() {
        console.log('🚀 LiberMedia Thumbnail Optimizer iniciado');

        initLazyLoad();
        processImages();
        observeDynamicImages();

        // Reprocessar em resize (debounced)
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                console.log('📐 Viewport redimensionado, reprocessando...');
                processImages();
            }, 250);
        });
    }

    // Inicializar quando DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Exportar para uso manual se necessário
    window.LiberMediaThumbs = {
        optimizeImage,
        processImages,
        getThumbUrl,
        createSrcset
    };

})();
