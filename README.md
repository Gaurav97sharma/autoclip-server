# Autoclip server (host it free on Render.com)

This small server downloads videos from links (YouTube, Instagram, Facebook, TikTok, X, Vimeo and more)
using yt-dlp, measures the sound, and hands the video to the Autoclip app. The app does the rest.
Only use videos you own or have permission to use.

## Put it online with no computer
1. Make a free GitHub account. Create a new empty repository (name it autoclip-server).
2. Unzip this file on your phone (Files app). In the repository tap "Add file" > "Upload files"
   and upload everything inside the folder: Dockerfile, server.js, render.yaml, .dockerignore, README.md
   and the media folder. The Dockerfile must be at the top level of the repository. Tap "Commit changes".
3. Make a free account at render.com (sign in with GitHub).
4. Tap New > Web Service > choose your autoclip-server repository.
5. Render detects the Dockerfile. Choose the Free instance type.
6. Open "Environment" and add a variable: ACCESS_KEY = any password you like (for example 6 random words).
   This stops other people from using your server. Keep it secret.
7. Tap Create Web Service. The first build takes several minutes.
8. Copy your address, for example https://autoclip-xxxx.onrender.com.
9. In the Autoclip app tap "Server settings", type that address, then your ACCESS_KEY.

## Good to know (free plan)
- The free server goes to sleep after about 15 minutes with no use. The first link after that waits
  up to a minute while it wakes up. The app shows "Waking up your server".
- It has little memory and disk. Very large videos can fail. MAX_MB (default 1500) limits the download size.
- YouTube often blocks the addresses used by hosting companies. If a YouTube link says
  "YouTube blocked this server", add cookies (below) or choose the video file instead.
  Instagram and Facebook often need cookies too. TikTok, X and Vimeo usually work without them.
- yt-dlp is installed when Render builds the server. If sites stop working, open Render and choose
  "Manual Deploy" > "Clear build cache & deploy" to get the newest yt-dlp.

## Optional: cookies for YouTube / Instagram / Facebook
Export a cookies.txt file (Netscape format) from a browser where you are signed in, then paste its whole
text into a Render environment variable named YT_COOKIES. Use a spare account, because sites can flag
accounts used this way. Cookies expire, so you may need to update them.

## Settings (environment variables)
ACCESS_KEY  password the app must send (recommended)
YT_COOKIES  contents of cookies.txt (optional)
MAX_MB      largest download in MB (default 1500)
MAX_JOBS    downloads at the same time (default 2)
ALLOW_ORIGIN  address of your hosted app, to allow only that site (default: any)
PORT        set by Render automatically
