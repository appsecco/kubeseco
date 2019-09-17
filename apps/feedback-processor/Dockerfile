FROM node:dubnium-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN addgroup app && adduser -D -G app app

EXPOSE 3000
USER app
CMD ["node", "/app/app.js"]
