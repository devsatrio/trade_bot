FROM node:20-alpine

WORKDIR /app

# Install sqlite3 for any potential local dependencies
RUN apk add --no-cache sqlite

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
