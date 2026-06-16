# Fastify API for Fly.io. Runs the TypeScript entry directly with tsx (a
# runtime dependency), installing only production deps from the tracked
# package-lock.json. The mobile app and the marketing site are not part of
# this image (see .dockerignore).
FROM node:20-slim
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# Install prod deps first so the layer caches when only source changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY types ./types
COPY src ./src

EXPOSE 3000
CMD ["npm", "start"]
