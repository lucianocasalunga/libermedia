/* ====================================
   LIBERMEDIA DASHBOARD JS
   Sistema completo de gerenciamento
   ==================================== */

// ===== CONFIGURAÇÕES GLOBAIS =====
const CONFIG = {
    apiBase: '/api',
    maxFileSize: 100 * 1024 * 1024, // 100MB
    allowedTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'application/msword'],
    viewMode: 'grid' // 'grid' ou 'list'
};

// ===== ESTADO DA APLICAÇÃO =====
let files = [];
let currentUser = null;

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    loadFiles();
});

async function initializeApp() {
    try {
        // Carregar informações do usuário
        const response = await fetch('/api/user/me');
        if (response.ok) {
            currentUser = await response.json();
            document.getElementById('username').textContent = currentUser.name || currentUser.pubkey.substring(0, 16);
        }
    } catch (error) {
        console.error('Erro ao carregar usuário:', error);
    }

    // Restaurar modo de visualização
    const savedView = localStorage.getItem('viewMode');
    if (savedView) {
        CONFIG.viewMode = savedView;
        toggleView(savedView);
    }
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    // Drag and drop
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);

    // File input
    fileInput.addEventListener('change', handleFileSelect);

    // Click no upload area
    uploadArea.addEventListener('click', () => fileInput.click());
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    uploadFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    uploadFiles(files);
}

// ===== UPLOAD DE ARQUIVOS =====
async function uploadFiles(selectedFiles) {
    if (selectedFiles.length === 0) return;

    // Validar arquivos
    const validFiles = selectedFiles.filter(file => {
        if (file.size > CONFIG.maxFileSize) {
            showToast(`Arquivo ${file.name} muito grande (máx 100MB)`, 'error');
            return false;
        }
        return true;
    });

    if (validFiles.length === 0) return;

    // Mostrar progresso
    const progressContainer = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    progressContainer.classList.remove('hidden');

    try {
        for (let i = 0; i < validFiles.length; i++) {
            const file = validFiles[i];
            const formData = new FormData();
            formData.append('file', file);

            // Upload
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progressBar.style.width = percent + '%';
                    progressText.textContent = `${i + 1}/${validFiles.length} - ${percent}%`;
                }
            });

            await new Promise((resolve, reject) => {
                xhr.onload = () => {
                    if (xhr.status === 200) {
                        resolve();
                    } else {
                        reject(new Error('Upload failed'));
                    }
                };
                xhr.onerror = reject;
                
                xhr.open('POST', '/api/upload');
                xhr.send(formData);
            });
        }

        showToast(`${validFiles.length} arquivo(s) enviado(s) com sucesso!`, 'success');
        loadFiles(); // Recarregar lista

    } catch (error) {
        console.error('Erro no upload:', error);
        showToast('Erro ao enviar arquivo', 'error');
    } finally {
        progressContainer.classList.add('hidden');
        progressBar.style.width = '0%';
        document.getElementById('fileInput').value = '';
    }
}

// ===== CARREGAR ARQUIVOS =====
async function loadFiles() {
    try {
        const response = await fetch('/api/files');
        if (response.ok) {
            files = await response.json();
            renderFiles();
            updateFileCount();
        }
    } catch (error) {
        console.error('Erro ao carregar arquivos:', error);
        showToast('Erro ao carregar arquivos', 'error');
    }
}

function updateFileCount() {
    document.getElementById('fileCount').textContent = `(${files.length})`;
}

// ===== RENDERIZAR ARQUIVOS =====
function renderFiles() {
    const container = document.getElementById('filesContainer');
    const emptyState = document.getElementById('emptyState');

    if (files.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    if (CONFIG.viewMode === 'grid') {
        container.className = 'files-grid';
        container.innerHTML = files.map(file => createFileCard(file)).join('');
    } else {
        container.className = 'files-list';
        container.innerHTML = files.map(file => createFileItem(file)).join('');
    }
}

function createFileCard(file) {
    const fileType = getFileType(file.filename);
    const thumbnail = getThumbnail(file);
    const shortLink = `https://libermedia.app/f/${file.short_id}`;

    return `
        <div class="file-card" onclick="openFileModal('${file.id}')">
            <img src="${thumbnail}" alt="${file.filename}" class="file-card-image" loading="lazy">
            <div class="file-card-body">
                <h3 class="file-card-title" title="${file.filename}">${file.filename}</h3>
                <div class="file-card-meta">
                    <span class="file-card-badge badge-${fileType}">${fileType}</span>
                    <span>${formatFileSize(file.filesize)}</span>
                </div>
                <div class="file-card-actions">
                    <button class="file-card-btn" onclick="event.stopPropagation(); copyLink('${shortLink}')">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                        </svg>
                        Copiar
                    </button>
                    <button class="file-card-btn primary" onclick="event.stopPropagation(); window.open('${shortLink}', '_blank')">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                        </svg>
                        Abrir
                    </button>
                </div>
            </div>
        </div>
    `;
}

function createFileItem(file) {
    const fileType = getFileType(file.filename);
    const thumbnail = getThumbnail(file);
    const shortLink = `https://libermedia.app/f/${file.short_id}`;

    return `
        <div class="file-item" onclick="openFileModal('${file.id}')">
            <img src="${thumbnail}" alt="${file.filename}" class="file-item-thumb" loading="lazy">
            <div class="file-item-info">
                <div class="file-item-name" title="${file.filename}">${file.filename}</div>
                <div class="file-item-meta">
                    <span class="file-card-badge badge-${fileType}">${fileType}</span> • 
                    ${formatFileSize(file.filesize)} • 
                    ${formatDate(file.created_at)}
                </div>
            </div>
            <div class="file-item-actions">
                <button class="file-item-btn" onclick="event.stopPropagation(); copyLink('${shortLink}')">
                    Copiar Link
                </button>
                <button class="file-item-btn" onclick="event.stopPropagation(); window.open('${shortLink}', '_blank')">
                    Abrir
                </button>
            </div>
        </div>
    `;
}

// ===== TOGGLE VISUALIZAÇÃO =====
function toggleView(mode) {
    CONFIG.viewMode = mode;
    localStorage.setItem('viewMode', mode);

    // Atualizar botões
    document.getElementById('btnGrid').classList.toggle('active', mode === 'grid');
    document.getElementById('btnList').classList.toggle('active', mode === 'list');

    // Re-renderizar
    renderFiles();
}

// ===== MODAL DE DETALHES =====
function openFileModal(fileId) {
    const file = files.find(f => f.id == fileId);
    if (!file) return;

    const modal = document.getElementById('fileModal');
    const modalBody = document.getElementById('modalBody');
    const thumbnail = getThumbnail(file);
    const shortLink = `https://libermedia.app/f/${file.short_id}`;
    const fileType = getFileType(file.filename);

    modalBody.innerHTML = `
        <img src="${thumbnail}" alt="${file.filename}" class="modal-image">
        <div class="modal-info">
            <div class="modal-info-item">
                <span class="modal-info-label">Nome:</span>
                <span class="modal-info-value">${file.filename}</span>
            </div>
            <div class="modal-info-item">
                <span class="modal-info-label">Tipo:</span>
                <span class="modal-info-value">${fileType}</span>
            </div>
            <div class="modal-info-item">
                <span class="modal-info-label">Tamanho:</span>
                <span class="modal-info-value">${formatFileSize(file.filesize)}</span>
            </div>
            <div class="modal-info-item">
                <span class="modal-info-label">Criado:</span>
                <span class="modal-info-value">${formatDate(file.created_at)}</span>
            </div>
            <div class="modal-info-item">
                <span class="modal-info-label">Link Curto:</span>
                <span class="modal-info-value">${shortLink}</span>
            </div>
        </div>
        <div class="flex gap-2 mt-6">
            <button class="btn-secondary flex-1" onclick="copyLink('${shortLink}')">Copiar Link</button>
            <button class="btn-primary flex-1" onclick="window.open('${shortLink}', '_blank')">Abrir Arquivo</button>
        </div>
    `;

    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('fileModal').classList.add('hidden');
}

// ===== UTILITÁRIOS =====
function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
    return 'document';
}

function getThumbnail(file) {
    const fileType = getFileType(file.filename);
    if (fileType === 'image') {
        return `https://libermedia.app/f/${file.short_id}`;
    }
    // Placeholder para outros tipos
    return `/static/img/placeholder-${fileType}.png`;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Hoje';
    if (days === 1) return 'Ontem';
    if (days < 7) return `${days} dias atrás`;
    
    return date.toLocaleDateString('pt-BR');
}

function copyLink(link) {
    navigator.clipboard.writeText(link).then(() => {
        showToast('Link copiado!', 'success');
    }).catch(() => {
        showToast('Erro ao copiar link', 'error');
    });
}

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');

    const icons = {
        success: `<svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>`,
        error: `<svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>`,
        info: `<svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>`
    };

    toastIcon.innerHTML = icons[type] || icons.info;
    toastMessage.textContent = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// ===== LOGOUT =====
async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
        window.location.href = '/';
    }
}

// ===== FECHAR MODAL COM ESC =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});
