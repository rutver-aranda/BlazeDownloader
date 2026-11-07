// SnapTube Web Client Application

let currentVideoData = null;
let currentUrl = '';
let qrcodeInstance = null;
let networkInfo = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  fetchNetworkInfo();
});

// Fetch network IP for mobile device sharing
async function fetchNetworkInfo() {
  try {
    const res = await fetch('/api/network-info');
    if (res.ok) {
      networkInfo = await res.json();
      const mobileDisplay = document.getElementById('mobileUrlDisplay');
      if (mobileDisplay && networkInfo.url) {
        mobileDisplay.textContent = networkInfo.url;
      }
    }
  } catch (err) {
    console.error('Error fetching network info:', err);
  }
}

// Paste from clipboard helper
async function pasteFromClipboard() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      alert('Tu navegador no permite acceso directo al portapapeles. Usa Ctrl+V o mantén presionado para pegar.');
      return;
    }
    const text = await navigator.clipboard.readText();
    if (text) {
      const input = document.getElementById('urlInput');
      input.value = text.trim();
      input.focus();
      // Auto analyze if it looks like a YouTube link
      if (text.includes('youtube.com') || text.includes('youtu.be')) {
        document.getElementById('urlForm').dispatchEvent(new Event('submit', { cancelable: true }));
      }
    }
  } catch (err) {
    console.warn('Clipboard read permission denied or not available:', err);
  }
}

function loadSample(url) {
  const input = document.getElementById('urlInput');
  input.value = url;
  document.getElementById('urlForm').dispatchEvent(new Event('submit', { cancelable: true }));
}

function dismissError() {
  document.getElementById('errorCard').classList.add('hidden');
}

function showError(title, message) {
  const card = document.getElementById('errorCard');
  document.getElementById('errorTitle').textContent = title || 'Ocurrió un error';
  document.getElementById('errorMessage').textContent = message || 'Verifica el enlace e inténtalo de nuevo.';
  card.classList.remove('hidden');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Handle video analysis
async function handleAnalyze(e) {
  if (e) e.preventDefault();

  const input = document.getElementById('urlInput');
  const url = input.value.trim();
  if (!url) return;

  currentUrl = url;
  dismissError();

  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const btnSpinner = document.getElementById('btnSpinner');
  const resultCard = document.getElementById('resultCard');

  // Loading state
  submitBtn.disabled = true;
  btnText.classList.add('hidden');
  btnSpinner.classList.remove('hidden');
  btnSpinner.classList.add('flex');

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();

    if (!res.ok) {
      showError('No se pudo analizar el video', data.error || 'Por favor verifica el enlace.');
      resultCard.classList.add('hidden');
      return;
    }

    currentVideoData = data;
    renderVideoResult(data);

  } catch (err) {
    showError('Error de conexión', 'No se pudo conectar con el servidor local. ' + err.message);
  } finally {
    submitBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnSpinner.classList.add('hidden');
    btnSpinner.classList.remove('flex');
  }
}

// Render video info and formats
function renderVideoResult(data) {
  const resultCard = document.getElementById('resultCard');
  
  // Set meta
  document.getElementById('videoThumb').src = data.thumbnail || '';
  document.getElementById('videoTitle').textContent = data.title;
  document.getElementById('videoAuthor').textContent = data.uploader;
  document.getElementById('videoDuration').textContent = data.duration_str;
  document.getElementById('videoViews').textContent = `${data.view_count} vistas`;

  // Badges count
  const videoFormats = data.video_formats || [];
  const audioFormats = data.audio_formats || [];
  document.getElementById('videoCountBadge').textContent = videoFormats.length;
  document.getElementById('audioCountBadge').textContent = (audioFormats.length + (data.quick_audio_options ? data.quick_audio_options.length : 0));

  // Render Video Formats
  const videoList = document.getElementById('videoList');
  videoList.innerHTML = '';

  if (videoFormats.length === 0) {
    videoList.innerHTML = `
      <div class="text-center py-6 text-slate-400 text-xs">
        No se encontraron formatos de video estándar disponibles para este contenido.
      </div>
    `;
  } else {
    videoFormats.forEach(fmt => {
      const row = document.createElement('div');
      row.className = 'format-row p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-3';

      const badgeColor = fmt.height >= 1080 
        ? 'bg-red-500/15 text-red-400 border-red-500/20' 
        : (fmt.height >= 720 ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' : 'bg-slate-500/15 text-slate-300 border-slate-500/20');

      let audioStatusBadge = '';
      if (!fmt.can_download_with_audio) {
        audioStatusBadge = `<span class="text-[10px] text-amber-400/90 flex items-center gap-1 mt-0.5"><i class="fa-solid fa-volume-xmark"></i> Sin audio directo</span>`;
      } else {
        audioStatusBadge = `<span class="text-[10px] text-emerald-400/90 flex items-center gap-1 mt-0.5"><i class="fa-solid fa-volume-high"></i> Con audio</span>`;
      }

      row.innerHTML = `
        <div class="flex items-center space-x-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-film text-slate-300 text-sm"></i>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-bold text-sm sm:text-base text-white tracking-wide">${fmt.label}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-md font-semibold border ${badgeColor}">${fmt.badge}</span>
              <span class="text-[10px] text-slate-400 font-mono uppercase">${fmt.ext}</span>
            </div>
            ${audioStatusBadge}
          </div>
        </div>

        <div class="flex items-center space-x-3 shrink-0">
          <span class="text-xs text-slate-400 hidden sm:inline-block font-mono">${fmt.filesize_str !== 'Desconocido' ? fmt.filesize_str : ''}</span>
          <button
            onclick="triggerDownload('${fmt.format_id}', false, '${fmt.ext}', ${fmt.height})"
            class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-95 text-white font-medium text-xs sm:text-sm flex items-center space-x-1.5 shadow-md shadow-red-600/20 transition"
          >
            <i class="fa-solid fa-download text-xs"></i>
            <span>Descargar</span>
          </button>
        </div>
      `;
      videoList.appendChild(row);
    });
  }

  // Render Audio Formats
  const audioList = document.getElementById('audioList');
  audioList.innerHTML = '';

  // Quick recommended options
  if (data.quick_audio_options) {
    data.quick_audio_options.forEach(opt => {
      const row = document.createElement('div');
      row.className = 'format-row p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-red-500/10 via-rose-500/5 to-transparent border border-red-500/20 flex items-center justify-between gap-3';
      row.innerHTML = `
        <div class="flex items-center space-x-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0 text-red-400">
            <i class="fa-solid fa-music text-sm"></i>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-bold text-sm sm:text-base text-white">${opt.label}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-red-500/20 text-red-400 border border-red-500/30">Recomendado</span>
            </div>
            <span class="text-[11px] text-slate-400">${opt.quality}</span>
          </div>
        </div>

        <div class="flex items-center space-x-3 shrink-0">
          <button
            onclick="triggerDownload('${opt.format_id}', true, '${opt.ext}')"
            class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-95 text-white font-medium text-xs sm:text-sm flex items-center space-x-1.5 shadow-md shadow-red-600/20 transition"
          >
            <i class="fa-solid fa-download text-xs"></i>
            <span>Descargar Audio</span>
          </button>
        </div>
      `;
      audioList.appendChild(row);
    });
  }

  // Raw audio streams
  audioFormats.slice(0, 4).forEach(afmt => {
    const row = document.createElement('div');
    row.className = 'format-row p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-3';
    row.innerHTML = `
      <div class="flex items-center space-x-3 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-slate-300">
          <i class="fa-solid fa-headphones text-sm"></i>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm text-white">${afmt.abr !== 'Auto' ? afmt.abr + ' kbps' : 'Audio Nativo'}</span>
            <span class="text-[10px] text-slate-400 font-mono uppercase px-1.5 py-0.5 bg-white/5 rounded border border-white/10">${afmt.ext}</span>
          </div>
          <span class="text-[11px] text-slate-400">${afmt.filesize_str !== 'Desconocido' ? afmt.filesize_str : 'Stream de audio directo'}</span>
        </div>
      </div>

      <div class="flex items-center space-x-3 shrink-0">
        <button
          onclick="triggerDownload('${afmt.format_id}', true, '${afmt.ext}')"
          class="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium text-xs sm:text-sm flex items-center space-x-1.5 border border-white/10 transition"
        >
          <i class="fa-solid fa-download text-xs"></i>
          <span>Descargar</span>
        </button>
      </div>
    `;
    audioList.appendChild(row);
  });

  // Switch to video tab by default and display
  switchTab('video');
  resultCard.classList.remove('hidden');
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Switch between Video and Audio tabs
function switchTab(tab) {
  const tabVideo = document.getElementById('tabVideo');
  const tabAudio = document.getElementById('tabAudio');
  const videoSection = document.getElementById('videoFormatsSection');
  const audioSection = document.getElementById('audioFormatsSection');

  if (tab === 'video') {
    tabVideo.className = 'pb-3 px-3 text-sm font-semibold text-red-400 border-b-2 border-red-500 flex items-center space-x-2 transition';
    tabAudio.className = 'pb-3 px-3 text-sm font-semibold text-slate-400 hover:text-slate-200 border-b-2 border-transparent flex items-center space-x-2 transition';
    videoSection.classList.remove('hidden');
    audioSection.classList.add('hidden');
  } else {
    tabAudio.className = 'pb-3 px-3 text-sm font-semibold text-red-400 border-b-2 border-red-500 flex items-center space-x-2 transition';
    tabVideo.className = 'pb-3 px-3 text-sm font-semibold text-slate-400 hover:text-slate-200 border-b-2 border-transparent flex items-center space-x-2 transition';
    videoSection.classList.add('hidden');
    audioSection.classList.remove('hidden');
  }
}

// Trigger download with destination folder selection
async function triggerDownload(formatId, isAudio, ext, height) {
  if (!currentUrl) return;

  const downloadModal = document.getElementById('downloadModal');
  const downloadDesc = document.getElementById('downloadModalDesc');

  // Determine suggested filename
  const title = (currentVideoData && currentVideoData.title) ? currentVideoData.title : 'video';
  const cleanTitle = title.replace(/[\\/*?:"<>|]/g, '').trim() || 'descarga';
  const fileExt = ext || (isAudio ? 'mp3' : 'mp4');
  const suggestedFilename = `${cleanTitle}.${fileExt}`;

  // Build backend download URL
  let downloadUrl = `/api/download?url=${encodeURIComponent(currentUrl)}&format_id=${encodeURIComponent(formatId)}&is_audio=${isAudio ? '1' : '0'}&ext=${encodeURIComponent(fileExt)}`;
  if (height) {
    downloadUrl += `&height=${encodeURIComponent(height)}`;
  }

  // 1. If File System Access API is supported (Chrome, Edge, Opera, desktop browsers)
  // Ask the user WHERE to save the file BEFORE starting the download
  if (window.showSaveFilePicker) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: suggestedFilename,
        types: [{
          description: isAudio ? 'Archivo de Audio' : 'Archivo de Video',
          accept: {
            [isAudio ? (fileExt === 'mp3' ? 'audio/mpeg' : 'audio/mp4') : 'video/mp4']: ['.' + fileExt]
          }
        }]
      });

      // User chose the destination! Now start downloading
      downloadModal.classList.remove('hidden');
      downloadDesc.textContent = isAudio
        ? 'Procesando audio y guardando en tu carpeta seleccionada...'
        : `Procesando video (${height ? height + 'p' : 'alta calidad'}) y guardando en tu carpeta seleccionada...`;

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error('Error al procesar la descarga en el servidor.');
      }

      // Stream directly into the chosen destination file
      const writable = await fileHandle.createWritable();
      await response.body.pipeTo(writable);

      downloadDesc.textContent = '¡Archivo guardado exitosamente en tu carpeta!';
      setTimeout(() => {
        downloadModal.classList.add('hidden');
      }, 2500);
      return;

    } catch (err) {
      if (err.name === 'AbortError') {
        // User clicked "Cancel" in the folder chooser
        console.log('Guardado cancelado por el usuario.');
        return;
      }
      console.warn('showSaveFilePicker falló o no se completó, usando método estándar:', err);
    }
  }

  // 2. Fallback for Safari / iOS or browsers where showSaveFilePicker is not available
  downloadModal.classList.remove('hidden');
  downloadDesc.textContent = isAudio 
    ? 'Extrayendo el audio en alta calidad. Tu navegador te preguntará dónde guardarlo...' 
    : `Preparando video en resolución ${height ? height + 'p' : 'seleccionada'}. Tu navegador te preguntará dónde guardarlo...`;

  const tempLink = document.createElement('a');
  tempLink.href = downloadUrl;
  tempLink.setAttribute('download', suggestedFilename);
  document.body.appendChild(tempLink);
  tempLink.click();
  document.body.removeChild(tempLink);

  setTimeout(() => {
    downloadModal.classList.add('hidden');
  }, 4500);
}

function closeDownloadModal() {
  document.getElementById('downloadModal').classList.add('hidden');
}

// QR Code and Device Share Modal
function openShareModal() {
  const modal = document.getElementById('shareModal');
  modal.classList.remove('hidden');

  const targetUrl = (networkInfo && networkInfo.url) ? networkInfo.url : window.location.origin;
  const qrContainer = document.getElementById('qrcode');
  qrContainer.innerHTML = '';

  if (typeof QRCode !== 'undefined') {
    qrcodeInstance = new QRCode(qrContainer, {
      text: targetUrl,
      width: 180,
      height: 180,
      colorDark: '#0f0f11',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }
}

function closeShareModal() {
  document.getElementById('shareModal').classList.add('hidden');
}

function copyMobileUrl() {
  const mobileDisplay = document.getElementById('mobileUrlDisplay');
  const text = mobileDisplay.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyIpBtn');
    btn.textContent = '¡Copiado!';
    btn.classList.add('bg-emerald-500/40', 'text-emerald-200');
    setTimeout(() => {
      btn.textContent = 'Copiar';
      btn.classList.remove('bg-emerald-500/40', 'text-emerald-200');
    }, 2000);
  });
}
