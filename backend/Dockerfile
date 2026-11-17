FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY migrations ./migrations
# Шрифт с кириллицей для счетов в PDF
COPY assets ./assets
COPY src ./src
# Каталог файлового хранилища (макеты, счета); в Docker Compose на него смонтирован том
RUN mkdir -p storage && chown node:node storage
ENV STORAGE_DIR=/app/storage
EXPOSE 3000
USER node
CMD ["node", "src/server.js"]
