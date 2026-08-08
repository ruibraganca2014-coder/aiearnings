FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV PORT=8080
ENV DATA_DIR=/data
EXPOSE 8080
# monta um volume em /data para persistir a curadoria/histórico
VOLUME ["/data"]
CMD ["node", "server.mjs"]
