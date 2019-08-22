FROM node:10-alpine

WORKDIR /usr/app

COPY package.json .
COPY package-lock.json .
RUN npm install --quiet --unsafe-perm
COPY . .
RUN npm run build:main

ENTRYPOINT [ "node", "/usr/app/build/main/index.js" ]
