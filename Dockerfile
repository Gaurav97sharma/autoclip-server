FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg curl ca-certificates \
 && pip3 install --no-cache-dir --break-system-packages -U "yt-dlp[default]" \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
ENV PORT=10000
EXPOSE 10000
CMD ["node","server.js"]
