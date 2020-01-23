FROM node:13-alpine

WORKDIR /src
COPY package.json yarn.lock .
RUN yarn install

COPY app.js /src/app.js
CMD app.js
