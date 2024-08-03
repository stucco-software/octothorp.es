FROM node:18-alpine AS deploy-node

# install dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Copy all local files into the image.
COPY . .

FROM deploy-node

WORKDIR /app
COPY --from=0 /app .
COPY . .

# Expose port 5173 for the SvelteKit app and 24678 for Vite's HMR
EXPOSE 5173
EXPOSE 24678

CMD ["npm", "run", "dev"]