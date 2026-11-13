FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV PORT=8025
EXPOSE 8025
CMD ["npm", "start"]
