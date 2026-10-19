# syntax=docker/dockerfile:1

####################################
# Cratis Montage
# Multi-stage build: engine preview -> editor frontend + backend -> runtime
####################################

# The render engine. Its built preview player is served by the editor; its sources, scripts and
# node_modules stay in the image because the editor drives the offline renderer through node.
FROM node:24-bookworm-slim AS engine
WORKDIR /src/Source/Engine
COPY Source/Engine/package.json Source/Engine/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY Source/Engine ./
RUN npm run build

# Matches the SDK band global.json pins (10.0.301, rollForward latestPatch); the floating 10.0 tag
# carries a newer feature band that global.json rejects.
FROM mcr.microsoft.com/dotnet/sdk:10.0.301 AS build
ARG CONFIGURATION=Release
ARG VERSION=0.0.0

# Node for the editor frontend (Vite build into Source/Montage/wwwroot)
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install --no-install-recommends -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . .
COPY --from=engine /src/Source/Engine/dist ./Source/Engine/dist

# The generated TypeScript proxies are checked in, so the proxy generator stays off for the publish.
RUN cd Source/Montage/.frontend && npm install && cd .. && npm run build
RUN dotnet publish Source/Montage/Montage.csproj \
    --configuration ${CONFIGURATION} \
    -p:Version=${VERSION} \
    -p:CratisProxiesOutputPath= \
    --output /app/publish

####################################
# Runtime image
####################################
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble AS runtime

# Node runs the engine's offline renderer, ffmpeg encodes the frames and muxes the voiceover, and
# Playwright's Chromium captures them. Chromium comes from Playwright rather than apt because the
# Ubuntu chromium package is a snap shim that cannot run inside a container.
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates curl ffmpeg fonts-liberation \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install --no-install-recommends -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /engine
COPY --from=engine /src/Source/Engine/package.json /src/Source/Engine/package-lock.json ./
COPY --from=engine /src/Source/Engine/node_modules ./node_modules
COPY --from=engine /src/Source/Engine/scripts ./scripts
COPY --from=engine /src/Source/Engine/public ./public
COPY --from=engine /src/Source/Engine/dist ./dist

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx --no-install playwright-core install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/publish .

# Shows, packages and rendered MP4s live in the workspace - mount a volume here to keep them.
RUN mkdir -p /data/workspace
VOLUME /data/workspace

ENV ASPNETCORE_URLS=http://+:8080 \
    BROWSER_CHANNEL=chromium \
    Cratis__Montage__Workspace=/data/workspace \
    Cratis__Montage__Render__WorkingDirectory=/engine \
    Cratis__Montage__Render__EngineRenderScript=/engine/scripts/render.ts

EXPOSE 8080

ENTRYPOINT ["dotnet", "Montage.dll"]
