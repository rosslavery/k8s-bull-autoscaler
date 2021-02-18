FROM node:14-alpine AS builder
WORKDIR /usr/app
COPY package*.json ./
RUN npm ci --quiet
COPY tsconfig*.json ./
COPY src src
RUN npm run build:main
RUN npm prune --production


FROM node:14-alpine
WORKDIR /usr/app
COPY --from=builder /usr/app/build/ build/
COPY --from=builder /usr/app/node_modules/ node_modules/
ENTRYPOINT [ "node", "/usr/app/build/main/index.js" ]
