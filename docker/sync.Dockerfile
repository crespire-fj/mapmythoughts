FROM node:24.22.1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
USER node
EXPOSE 1234
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
