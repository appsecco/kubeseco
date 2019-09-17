FROM node:dubnium-alpine

ENV NODE_ENV=production
WORKDIR /app
COPY . .
RUN npm install
RUN addgroup app && adduser -D -G app app

EXPOSE 3000
USER app
CMD ["node", "/app/app.js"]
