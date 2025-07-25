FROM node:20-alpine
WORKDIR /app
COPY runners/node-runner/package*.json ./
RUN npm ci --omit=dev
COPY runners/node-runner/runner.js ./runner.js
CMD ["node", "runner.js"]
