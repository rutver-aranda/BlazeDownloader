import os
import sys

# Ensure Homebrew and standard bin directories are in PATH for macOS
for extra_path in ['/opt/homebrew/bin', '/usr/local/bin']:
    if extra_path not in os.environ.get('PATH', ''):
        os.environ['PATH'] = f"{extra_path}:{os.environ.get('PATH', '')}"

import re
import socket
import shutil
import tempfile
import threading
import time
import webbrowser
from flask import Flask, render_template, request, jsonify, send_file, after_this_request
import yt_dlp

if getattr(sys, 'frozen', False):
    base_dir = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    app = Flask(
        __name__,
        template_folder=os.path.join(base_dir, 'templates'),
        static_folder=os.path.join(base_dir, 'static')
    )
else:
    app = Flask(__name__)

# Temporary directory for downloads
TEMP_DIR = os.path.join(tempfile.gettempdir(), 'snaptube_web_downloads')
os.makedirs(TEMP_DIR, exist_ok=True)

def has_ffmpeg():
    """Check if ffmpeg is installed and available in system PATH."""
    return shutil.which('ffmpeg') is not None

def get_local_ip():
    """Determine the local LAN IP address to share with other devices."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Does not actually send data
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def format_duration(seconds):
    if not seconds:
        return "--:--"
    seconds = int(seconds)
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

def format_bytes(bytes_count):
    if not bytes_count or bytes_count <= 0:
        return "Desconocido"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_count < 1024.0:
            return f"{bytes_count:.1f} {unit}"
        bytes_count /= 1024.0
    return f"{bytes_count:.1f} TB"

def sanitize_filename(name):
    # Remove characters unsafe for filenames
    name = re.sub(r'[\\/*?:"<>|]', '', name)
    return name.strip() or 'video'

def clean_youtube_url(url):
    url = url.strip()
    if 'watch?v=' in url and 'list=' in url:
        v_match = re.search(r'v=([a-zA-Z0-9_-]+)', url)
        if v_match:
            return f"https://www.youtube.com/watch?v={v_match.group(1)}"
    return url

YOUTUBE_EXTRACTOR_ARGS = {
    'youtube': {
        'player_client': ['android_vr', 'android', 'web']
    }
}

DOWNLOAD_EXTRACTOR_ARGS = {
    'youtube': {
        'player_client': ['android', 'web']
    }
}

@app.route('/')
def index():
    ffmpeg_ok = has_ffmpeg()
    local_ip = get_local_ip()
    return render_template('index.html', local_ip=local_ip, ffmpeg_ok=ffmpeg_ok)

@app.route('/api/network-info', methods=['GET'])
def network_info():
    ip = get_local_ip()
    port = int(os.environ.get('PORT', 5050))
    return jsonify({
        'ip': ip,
        'port': port,
        'url': f"http://{ip}:{port}",
        'ffmpeg_installed': has_ffmpeg()
    })

@app.route('/api/info', methods=['POST'])
def get_video_info():
    data = request.get_json() or {}
    url = data.get('url', '').strip()

    if not url:
        return jsonify({'error': 'Por favor ingresa un enlace de YouTube válido.'}), 400

    # Basic YouTube URL check
    yt_regex = r'^(https?://)?(www\.|m\.)?(youtube\.com|youtu\.be)/.+$'
    if not re.match(yt_regex, url):
        return jsonify({'error': 'El enlace proporcionado no parece ser un enlace válido de YouTube.'}), 400

    url = clean_youtube_url(url)

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'extract_flat': False,
        'noplaylist': True,
        'extractor_args': YOUTUBE_EXTRACTOR_ARGS,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if 'entries' in info and info['entries']:
                info = info['entries'][0]
    except Exception as e:
        err_msg = str(e)
        if 'Video unavailable' in err_msg:
            return jsonify({'error': 'El video no está disponible o es privado.'}), 400
        elif 'Sign in' in err_msg:
            return jsonify({'error': 'Este video requiere inicio de sesión (restricción de edad/privado).'}), 400
        return jsonify({'error': f'No se pudo obtener información: {err_msg}'}), 400

    title = info.get('title', 'Sin título')
    thumbnail = info.get('thumbnail')
    duration = info.get('duration', 0)
    duration_str = format_duration(duration)
    uploader = info.get('uploader', 'Canal desconocido')
    view_count = info.get('view_count', 0)
    ffmpeg_available = has_ffmpeg()

    formats = info.get('formats', [])

    # Process and categorize formats
    video_formats_map = {}
    audio_formats = []

    # Sort formats from highest to lowest quality
    for f in formats:
        f_id = f.get('format_id')
        ext = f.get('ext')
        vcodec = f.get('vcodec', 'none')
        acodec = f.get('acodec', 'none')
        height = f.get('height')
        filesize = f.get('filesize') or f.get('filesize_approx') or 0

        # Audio-only stream
        if vcodec == 'none' and acodec != 'none':
            abr = f.get('abr') or 0
            audio_formats.append({
                'format_id': f_id,
                'ext': ext,
                'abr': round(abr) if abr else 'Auto',
                'filesize': filesize,
                'filesize_str': format_bytes(filesize),
                'format_note': f.get('format_note', ''),
                'container': 'm4a' if ext in ['m4a', 'mp4'] else ext,
                'is_audio': True
            })

        # Video stream (ignore storyboards and non-video formats)
        elif height and height >= 144 and ext != 'mhtml' and vcodec != 'none':
            is_progressive = (vcodec != 'none' and acodec != 'none')
            fps = f.get('fps', 30)

            # We group by height (e.g. 1080, 720, 480, 360, etc.)
            # Prefer MP4 container and progressive streams if ffmpeg is missing
            current_best = video_formats_map.get(height)

            # Choose or update best format for this resolution
            should_update = False
            if current_best is None:
                should_update = True
            else:
                # If no ffmpeg, strongly prefer progressive streams (audio included)
                if not ffmpeg_available:
                    if is_progressive and not current_best['is_progressive']:
                        should_update = True
                    elif is_progressive == current_best['is_progressive']:
                        if ext == 'mp4' and current_best['ext'] != 'mp4':
                            should_update = True
                else:
                    # With ffmpeg, we can merge best video + best audio
                    if ext == 'mp4' and current_best['ext'] != 'mp4':
                        should_update = True
                    elif (f.get('tbr') or 0) > (current_best.get('tbr') or 0):
                        should_update = True

            if should_update:
                video_formats_map[height] = {
                    'height': height,
                    'format_id': f_id,
                    'ext': ext,
                    'fps': fps,
                    'is_progressive': is_progressive,
                    'filesize': filesize,
                    'filesize_str': format_bytes(filesize),
                    'tbr': f.get('tbr', 0),
                    'needs_merge': not is_progressive
                }

    # Convert video dict to sorted list (descending resolution: 4k, 1440p, 1080p, 720p, etc.)
    sorted_video_formats = []
    for h in sorted(video_formats_map.keys(), reverse=True):
        vf = video_formats_map[h]
        # Quality label
        label = f"{h}p"
        if h >= 2160:
            badge = "4K Ultra HD"
        elif h >= 1440:
            badge = "2K Quad HD"
        elif h >= 1080:
            badge = "Full HD"
        elif h >= 720:
            badge = "HD"
        else:
            badge = "SD"

        vf['label'] = label
        vf['badge'] = badge
        # If ffmpeg is missing and format is not progressive, mark audio status
        if not ffmpeg_available and not vf['is_progressive']:
            vf['audio_note'] = 'Sin audio directo (instala FFmpeg para 1080p+ con audio)'
            vf['can_download_with_audio'] = False
        else:
            vf['audio_note'] = 'Audio incluido'
            vf['can_download_with_audio'] = True

        sorted_video_formats.append(vf)

    # Sort audio by bitrate descending
    audio_formats.sort(key=lambda x: (x.get('abr') if isinstance(x.get('abr'), (int, float)) else 0), reverse=True)

    # Add quick default options
    quick_audio_options = [
        {
            'format_id': 'bestaudio/best',
            'ext': 'mp3' if ffmpeg_available else 'm4a',
            'label': 'MP3 (Música / Podcast)' if ffmpeg_available else 'M4A Audio Original',
            'quality': '320 kbps (Alta Calidad)' if ffmpeg_available else 'Original',
            'filesize_str': 'Calculado al descargar',
            'is_recommended': True
        }
    ]
    if ffmpeg_available:
        quick_audio_options.append({
            'format_id': 'bestaudio/best',
            'ext': 'm4a',
            'label': 'M4A (Audio Original AAC)',
            'quality': 'Audio directo sin re-compresión',
            'filesize_str': 'Calculado al descargar',
            'is_recommended': False
        })

    return jsonify({
        'id': info.get('id'),
        'title': title,
        'uploader': uploader,
        'thumbnail': thumbnail,
        'duration': duration,
        'duration_str': duration_str,
        'view_count': f"{view_count:,}",
        'ffmpeg_available': ffmpeg_available,
        'video_formats': sorted_video_formats,
        'audio_formats': audio_formats,
        'quick_audio_options': quick_audio_options
    })

@app.route('/api/download')
def download_video():
    url = request.args.get('url', '').strip()
    format_id = request.args.get('format_id', 'best')
    is_audio = request.args.get('is_audio', '0') == '1'
    height = request.args.get('height')
    ext = request.args.get('ext', 'mp4')

    if not url:
        return "URL requerida", 400

    ffmpeg_available = has_ffmpeg()
    session_id = f"{int(time.time())}_{os.getpid()}_{hash(url) % 10000}"
    output_dir = os.path.join(TEMP_DIR, session_id)
    os.makedirs(output_dir, exist_ok=True)

    url = clean_youtube_url(url)

    # Determine format selector
    if is_audio:
        # Audio download
        format_selector = format_id if format_id != 'best' else 'bestaudio/best'
        ydl_opts = {
            'format': format_selector,
            'outtmpl': os.path.join(output_dir, '%(title)s.%(ext)s'),
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'extractor_args': DOWNLOAD_EXTRACTOR_ARGS,
        }
        if ffmpeg_available:
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }]
    else:
        # Video download
        if height and ffmpeg_available:
            # Can merge best video at height with best audio
            format_selector = f"bestvideo[height<={height}]+bestaudio/best[height<={height}]/best"
        elif format_id:
            format_selector = f"{format_id}/best"
        else:
            format_selector = 'best'

        ydl_opts = {
            'format': format_selector,
            'outtmpl': os.path.join(output_dir, '%(title)s.%(ext)s'),
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'extractor_args': DOWNLOAD_EXTRACTOR_ARGS,
        }
        if ffmpeg_available and ext == 'mp4':
            ydl_opts['merge_output_format'] = 'mp4'

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        # Find downloaded file
        files = os.listdir(output_dir)
        if not files:
            return "Error al generar el archivo para descarga", 500

        downloaded_file = os.path.join(output_dir, files[0])
        file_name = sanitize_filename(files[0])

        @after_this_request
        def cleanup(response):
            def remove_temp():
                try:
                    time.sleep(10)  # Wait for file send to finish
                    if os.path.exists(output_dir):
                        shutil.rmtree(output_dir, ignore_errors=True)
                except Exception:
                    pass
            threading.Thread(target=remove_temp, daemon=True).start()
            return response

        return send_file(
            downloaded_file,
            as_attachment=True,
            download_name=file_name
        )

    except Exception as e:
        shutil.rmtree(output_dir, ignore_errors=True)
        return f"Error durante la descarga: {str(e)}", 500

def is_port_in_use(port_num):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port_num)) == 0

def find_available_port(start_port=5050):
    for p in range(start_port, start_port + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', p)) != 0:
                return p
    return start_port

if __name__ == '__main__':
    target_port = int(os.environ.get('PORT', 5050))
    
    # If BlazeDownloader is already running on this port, just open the browser!
    if is_port_in_use(target_port):
        try:
            import urllib.request
            req = urllib.request.Request(f'http://127.0.0.1:{target_port}/api/network-info')
            with urllib.request.urlopen(req, timeout=1) as resp:
                if resp.status == 200:
                    print(f"BlazeDownloader ya se encuentra ejecutándose en el puerto {target_port}.")
                    print(f"Abriendo http://localhost:{target_port} en tu navegador...")
                    webbrowser.open(f'http://localhost:{target_port}')
                    sys.exit(0)
        except Exception:
            pass
        # If occupied by another process, find a free port
        target_port = find_available_port(target_port + 1)

    port = target_port
    local_ip = get_local_ip()
    print("=" * 60)
    print(" 🚀 BlazeDownloader iniciado con éxito!")
    print(f" 💻 En esta computadora (Mac): http://localhost:{port}")
    print(f" 📱 En tu celular (iOS / Android): http://{local_ip}:{port}")
    print(f" 🎬 Soporte FFmpeg: {'INSTALADO' if has_ffmpeg() else 'NO ENCONTRADO (recomendado para 1080p+)'}")
    print("=" * 60)

    # Automatically open browser
    def open_browser():
        time.sleep(1.0)
        webbrowser.open(f'http://localhost:{port}')
    threading.Thread(target=open_browser, daemon=True).start()

    app.run(host='0.0.0.0', port=port, debug=False)
